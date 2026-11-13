import { NodeXEvent } from '../types';
import { NodeXProfileSnapshot } from './rest';

/**
 * Single in-memory receiver for account/portfolio events from the Rust engine.
 * The engine remains authoritative; this store only applies incoming snapshots
 * and patches so every React view can consume the same current account state.
 */
export interface EngineEventSnapshot {
  profile: NodeXProfileSnapshot | null;
  positions: Array<Record<string, any>>;
  portfolio: Record<string, any>;
  wallet: Record<string, any>;
  lastUpdatedAt: string | null;
}

type Listener = (snapshot: EngineEventSnapshot) => void;

const emptyState: EngineEventSnapshot = {
  profile: null,
  positions: [],
  portfolio: {},
  wallet: {},
  lastUpdatedAt: null,
};

let state: EngineEventSnapshot = { ...emptyState };
const listeners = new Set<Listener>();

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function positionMint(position: Record<string, any>): string {
  return String(position.mint_address || position.mint || position.token_mint || '');
}

function publish(next: EngineEventSnapshot): EngineEventSnapshot {
  state = next;
  listeners.forEach((listener) => {
    try { listener(state); } catch (error) {
      console.error('NodeX engine event-store listener failed:', error);
    }
  });
  return state;
}

function mergePosition(
  positions: Array<Record<string, any>>,
  incoming: Record<string, any>,
): Array<Record<string, any>> {
  const mint = positionMint(incoming);
  const id = String(incoming.position_id || incoming.id || '');
  if (!mint && !id) return positions;
  // A mint may have multiple position lots over time. Prefer the stable
  // position ID and only fall back to mint matching for legacy snapshots.
  const index = id
    ? positions.findIndex((item) => String(item.position_id || item.id || '') === id)
    : positions.findIndex((item) => positionMint(item) === mint);
  if (index < 0) return [incoming, ...positions];
  const next = positions.slice();
  next[index] = { ...next[index], ...incoming };
  return next;
}

export const engineEventStore = {
  getSnapshot(): EngineEventSnapshot {
    return state;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  },

  hydrate(profile: NodeXProfileSnapshot): EngineEventSnapshot {
    const snapshotPortfolio = objectValue(profile.portfolio);
    const snapshotWallet = objectValue(profile.wallet || profile.existing_wallet);
    const snapshotPositions = Array.isArray(snapshotPortfolio.positions)
      ? snapshotPortfolio.positions.map(objectValue)
      : Array.isArray((profile as any).positions)
        ? (profile as any).positions.map(objectValue)
        : [];

    // The WebSocket may deliver an event while the bootstrap HTTP request is
    // still in flight. Preserve those newer live patches over the older snapshot.
    let positions = snapshotPositions;
    for (const livePosition of state.positions) {
      positions = mergePosition(positions, livePosition);
    }
    const portfolio = { ...snapshotPortfolio, ...state.portfolio };
    const wallet = { ...snapshotWallet, ...state.wallet };
    const hydratedProfile = {
      ...profile,
      paper_wallet: profile.paper_wallet ?? state.profile?.paper_wallet,
      portfolio: { ...portfolio, positions },
      wallet,
    };

    return publish({
      profile: hydratedProfile,
      positions,
      portfolio: { ...portfolio, positions },
      wallet,
      lastUpdatedAt: state.lastUpdatedAt || new Date().toISOString(),
    });
  },

  apply(event: NodeXEvent): EngineEventSnapshot {
    const data = objectValue(event.data);
    const current = state;
    let profile = current.profile;
    let positions = current.positions;
    let portfolio = current.portfolio;
    let wallet = current.wallet;

    switch (event.event_type) {
      case 'profile_updated': {
        const incoming = data as NodeXProfileSnapshot;
        // Older profile_updated events may omit paper_wallet. Preserve the
        // latest bootstrap value instead of clearing the Overview balance.
        profile = {
          ...incoming,
          paper_wallet: incoming.paper_wallet ?? current.profile?.paper_wallet,
        };
        portfolio = objectValue(incoming.portfolio);
        wallet = objectValue(incoming.wallet || incoming.existing_wallet);
        if (Array.isArray(portfolio.positions)) positions = portfolio.positions.map(objectValue);
        else if (Array.isArray((incoming as any).positions)) positions = (incoming as any).positions.map(objectValue);
        break;
      }
      case 'position_updated':
      case 'trade_opened':
      case 'trade_closed':
      case 'paper_buy_executed':
      case 'paper_sell_executed': {
        const incoming = objectValue(data.position || data.trade || data);
        if (positionMint(incoming)) positions = mergePosition(positions, incoming);
        if (Object.keys(portfolio).length) {
          portfolio = { ...portfolio, positions };
        }
        break;
      }
      case 'portfolio_summary_updated':
      case 'portfolio_updated': {
        const incomingPortfolio = objectValue(data.portfolio);
        portfolio = { ...portfolio, ...incomingPortfolio, ...data };
        delete (portfolio as any).portfolio;
        if (Array.isArray(portfolio.positions)) positions = portfolio.positions.map(objectValue);
        if (profile) profile = { ...profile, portfolio };
        break;
      }
      case 'wallet_updated':
      case 'wallet_balance_updated':
      case 'balance_updated': {
        wallet = { ...wallet, ...objectValue(data.wallet), ...data };
        delete (wallet as any).wallet;
        if (profile) profile = { ...profile, wallet };
        break;
      }
      case 'market_tick':
      case 'market_price_update':
      case 'token_market_update': {
        const mint = String(event.token_mint || data.mint_address || data.token_mint || data.base_mint || '');
        if (mint) {
          const index = positions.findIndex((item) => positionMint(item) === mint);
          if (index >= 0) {
            const patch = Object.fromEntries([
              'current_price_sol', 'current_price_usd', 'current_value_sol',
              'current_value_usd', 'unrealized_pnl_sol', 'unrealized_pnl_usd',
              'unrealized_pnl_pct', 'stop_loss_price', 'stop_loss_triggered',
            ].filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
            if (Object.keys(patch).length) {
              positions = positions.slice();
              positions[index] = { ...positions[index], ...patch };
            } else {
              return current;
            }
          }
        }
        break;
      }
      default:
        return current;
    }

    return publish({
      profile,
      positions,
      portfolio: { ...portfolio, ...(Array.isArray(portfolio.positions) ? { positions } : {}) },
      wallet,
      lastUpdatedAt: event.timestamp || new Date().toISOString(),
    });
  },

  reset(): EngineEventSnapshot {
    return publish({ ...emptyState });
  },
};

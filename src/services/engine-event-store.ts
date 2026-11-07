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
  const id = String(incoming.id || incoming.position_id || mint);
  if (!mint && !id) return positions;
  const index = positions.findIndex((item) =>
    String(item.id || item.position_id || positionMint(item)) === id ||
    (mint && positionMint(item) === mint)
  );
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
    const portfolio = objectValue(profile.portfolio);
    const wallet = objectValue(profile.wallet || profile.existing_wallet);
    const positions = Array.isArray(portfolio.positions)
      ? portfolio.positions.map(objectValue)
      : Array.isArray((profile as any).positions)
        ? (profile as any).positions.map(objectValue)
        : [];
    return publish({
      profile,
      positions,
      portfolio,
      wallet,
      lastUpdatedAt: new Date().toISOString(),
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
        profile = incoming;
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

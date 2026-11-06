import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ConnectionStatus, DashboardSummary, DiscoveredToken, EngineStatus, NodeXEvent,
  Position, StrategyConfig, StrategyDecision, TokenLaunchRecord, PaperWalletSnapshot,
} from '../types';
import { apiClient, ApiSettings } from '../services/api';
import { normalizeBackendEvent, wsService } from '../services/websocket';

export type NavigationTab =
  | 'overview' | 'positions' | 'live_feed' | 'event_monitor'
  | 'token_details' | 'analytics' | 'strategy' | 'token_intelligence'
  | 'settings' | 'about';

interface TerminalContextType {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  engineStatus: EngineStatus;
  summary: DashboardSummary;
  positions: Position[];
  tokens: DiscoveredToken[];
  launches: TokenLaunchRecord[];
  paperWallet: PaperWalletSnapshot | null;
  events: NodeXEvent[];
  selectedEvent: NodeXEvent | null;
  setSelectedEvent: (event: NodeXEvent | null) => void;
  selectedToken: DiscoveredToken | null;
  setSelectedToken: (token: DiscoveredToken | null) => void;
  openTokenDetailByMint: (mint: string, fallback?: Partial<DiscoveredToken>) => void;
  closeTokenDetail: () => void;
  strategyConfig: StrategyConfig;
  strategyDecisions: StrategyDecision[];
  settings: ApiSettings;
  isStreamPaused: boolean;
  toggleStreamPause: () => void;
  clearEvents: () => void;
  clearBrowserHistory: () => void;
  toggleEngine: () => void;
  toggleStrategy: () => void;
  closePosition: (positionId: string, percentage: number) => void;
  executeManualPaperBuy: (mint: string, solAmount: number) => void;
  updatePositionRisk: (positionId: string, sl: number, tp: number) => void;
  saveStrategyConfig: (config: StrategyConfig) => Promise<boolean>;
  updateSettings: (newSettings: Partial<ApiSettings>) => void;
  isMobilePreview: boolean;
  setIsMobilePreview: (value: boolean | ((prev: boolean) => boolean)) => void;
  backendError: string | null;
}

const emptySummary: DashboardSummary = {
  total_portfolio_value_usd: 0, total_portfolio_value_sol: 0,
  total_invested_capital_usd: 0, open_positions_count: 0,
  realised_pnl_usd: 0, realised_pnl_pct: 0, unrealised_pnl_usd: 0,
  unrealised_pnl_pct: 0, total_pnl_usd: 0, total_pnl_pct: 0,
  win_rate_pct: 0, completed_trades_count: 0, sol_price_usd: 0,
};
const emptyStatus: EngineStatus = {
  running: false, operating_mode: 'PAPER', network: 'mainnet-beta',
  solana_connected: false, pumpswap_connected: false, pumpswap_reconnection_count: 0,
  pumpswap_last_error: '', solana_last_error: '', solana_last_message_at: '',
  rpc_endpoint: '', rpc_latency_ms: 0,
  ws_status: 'disconnected', ws_endpoint: '', provider_name: 'Not connected',
  last_heartbeat: '', incoming_event_rate: 0, reconnection_count: 0,
  database_status: 'unknown', tokens_detected_today: 0,
  simulated_buys_count: 0, simulated_sells_count: 0, strategy_paused: true,
};
// These are form defaults only; the backend does not currently persist strategy settings.
const emptyStrategy: StrategyConfig = {
  min_liquidity_usd: 0, max_entry_price_usd: 0,
  max_investment_per_token_sol: 0, max_investment_per_token_usd: 0,
  max_simultaneous_positions: 0, min_safety_score: 0, max_slippage_pct: 0,
  stop_loss_pct: 0, take_profit_pct: 0, min_5m_buy_volume_usd: 0,
  max_top10_holder_concentration_pct: 0, auto_buy_enabled: false,
  trailing_stop_enabled: false, trailing_stop_callback_pct: 0,
  blacklist_creators_with_prior_rugs: false,
};

const TerminalContext = createContext<TerminalContextType | null>(null);

const STORAGE_KEY = 'nodex.shared-terminal-state.v1';
type PersistedTerminalState = { tokens?: DiscoveredToken[]; launches?: TokenLaunchRecord[]; events?: NodeXEvent[] };
function readPersistedState(): PersistedTerminalState {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) as PersistedTerminalState : {}; }
  catch { return {}; }
}
const defaultSafetyDetails: DiscoveredToken['safety_details'] = {
  mint_authority: 'active', freeze_authority: 'active', top_10_holders_pct: 0,
  liquidity_locked: false, liquidity_locked_pct: 0, honeypot_risk: 'low',
  dev_holding_pct: 0, dev_sold_all: false, bundled_snipers_detected: false,
  risk_flags: [], safety_score: 0, holders_count: 0, creator_reputation: 'first_deploy', largest_holders: [],
};
function mergeTokenEvent(previous: DiscoveredToken | undefined, event: NodeXEvent): DiscoveredToken | null {
  const data = event.data || {};
  const mint = String(event.token_mint || data.mint_address || data.token_mint || data.base_mint || '');
  if (!mint) return null;
  const rawPrice = Number(data.current_price_usd ?? data.price_usd ?? data.price ?? data.current_price);
  const price = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : previous?.current_price_usd || 0;
  const history = previous?.price_history_5m ? [...previous.price_history_5m] : [];
  if (price > 0 && price !== previous?.current_price_usd) history.push({ time: Date.parse(event.timestamp) || Date.now(), price, volume: Number(data.volume_5m_usd || 0) });
  const venueValue = String(data.venue || data.source || previous?.venue || 'pump.fun').toLowerCase();
  const venue: DiscoveredToken['venue'] = venueValue.includes('raydium') ? 'raydium' : venueValue.includes('swap') ? 'pumpswap' : 'pump.fun';
  const decision = String(data.decision || data.status || '').toLowerCase();
  const qualification: DiscoveredToken['qualification_status'] = event.event_type === 'paper_buy_executed' ? 'bought_paper'
    : event.event_type === 'strategy_rejected_token' || decision.includes('reject') ? 'rejected'
    : event.event_type === 'token_scan_started' ? 'under_analysis'
    : decision.includes('qualif') || decision.includes('approv') ? 'qualified'
    : previous?.qualification_status || 'newly_detected';
  return {
    mint, name: String(data.name || data.token_name || previous?.name || 'Unknown token'),
    symbol: String(data.symbol || data.token_symbol || previous?.symbol || 'UNKNOWN'),
    creator_wallet: String(data.creator_wallet || data.creator_address || previous?.creator_wallet || ''),
    launch_time: String(data.launch_time || data.detected_at || previous?.launch_time || event.timestamp),
    current_price_usd: price, current_price_sol: Number(data.current_price_sol ?? previous?.current_price_sol ?? 0),
    market_cap_usd: Number(data.market_cap_usd ?? data.market_cap ?? previous?.market_cap_usd ?? 0),
    liquidity_usd: Number(data.liquidity_usd ?? previous?.liquidity_usd ?? 0),
    volume_5m_usd: Number(data.volume_5m_usd ?? previous?.volume_5m_usd ?? 0),
    volume_1h_usd: Number(data.volume_1h_usd ?? previous?.volume_1h_usd ?? 0),
    tx_buys_5m: Number(data.tx_buys_5m ?? previous?.tx_buys_5m ?? 0),
    tx_sells_5m: Number(data.tx_sells_5m ?? previous?.tx_sells_5m ?? 0),
    bonding_curve_progress_pct: Number(data.bonding_curve_progress_pct ?? previous?.bonding_curve_progress_pct ?? 0),
    venue, safety_status: data.safety_status || previous?.safety_status || 'warning',
    qualification_status: qualification, rejection_reason: data.reason || data.decision_reason || previous?.rejection_reason,
    safety_details: { ...defaultSafetyDetails, ...(previous?.safety_details || {}), ...(data.safety_details || {}) },
    price_history_5m: history.slice(-300),
  };
}

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(emptyStatus);
  const [summary] = useState<DashboardSummary>(emptySummary);
  const [positions] = useState<Position[]>([]);
  const [tokens, setTokens] = useState<DiscoveredToken[]>(() => readPersistedState().tokens || []);
  const [launches, setLaunches] = useState<TokenLaunchRecord[]>(() => readPersistedState().launches || []);
  const [paperWallet, setPaperWallet] = useState<PaperWalletSnapshot | null>(null);
  const [events, setEvents] = useState<NodeXEvent[]>(() => readPersistedState().events || []);
  const [selectedEvent, setSelectedEvent] = useState<NodeXEvent | null>(null);
  const [selectedToken, setSelectedToken] = useState<DiscoveredToken | null>(null);
  const [strategyConfig] = useState<StrategyConfig>(emptyStrategy);
  const [strategyDecisions] = useState<StrategyDecision[]>([]);
  const [settings, setSettings] = useState<ApiSettings>(apiClient.getSettings());
  const [isStreamPaused, setIsStreamPaused] = useState(false);
  const [isMobilePreview, setIsMobilePreview] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    wsService.connect();

    // Raw Solana notifications are backend-internal and are deliberately not
    // restored into the browser event feed. The feed is driven by curated live
    // application events only.

    apiClient.getPaperWallet().then((wallet) => {
      if (active) setPaperWallet(wallet);
    }).catch((error: unknown) => {
      if (active) setBackendError(error instanceof Error ? error.message : 'Could not load paper wallet.');
    });
    apiClient.getRecentTokens(100).then((records) => {
      if (active) setLaunches(records);
    }).catch((error: unknown) => {
      if (active) setBackendError(error instanceof Error ? error.message : 'Could not load recent token launches.');
    });
    apiClient.getEngineStatus().then((status) => {
      if (active) {
        setEngineStatus((previous) => ({ ...previous, ...status, ws_status: wsService.getStatus().status }));
        setIsStreamPaused(status.strategy_paused);
        setBackendError(null);
      }
    }).catch((error: unknown) => {
      if (active) setBackendError(error instanceof Error ? error.message : 'Backend connection failed.');
    });
    const unsubscribeStatus = wsService.onStatusChange((status: ConnectionStatus) => {
      setEngineStatus((previous) => ({ ...previous, ws_status: status }));
    });
    const unsubscribeEvents = wsService.subscribe((event) => {
      if (event.event_type === 'launch_snapshot') {
        const snapshot = Array.isArray(event.data.launches) ? event.data.launches : [];
        setLaunches(snapshot as TokenLaunchRecord[]);
        setTokens((previous) => {
          const byMint = new Map(previous.map((token) => [token.mint, token]));
          for (const launch of snapshot as TokenLaunchRecord[]) {
            const restoredEvent: NodeXEvent = {
              event_id: `snapshot-${launch.mint_address}`,
              event_type: 'launch_detected',
              timestamp: launch.detected_at,
              token_mint: launch.mint_address,
              message: 'Restored token launch snapshot',
              processing_status: 'processed',
              data: { mint_address: launch.mint_address, creator_address: launch.creator_address, source: launch.source, detected_at: launch.detected_at },
            };
            const merged = mergeTokenEvent(byMint.get(launch.mint_address), restoredEvent);
            if (merged) byMint.set(merged.mint, merged);
          }
          return [...byMint.values()].slice(0, 500);
        });
        return;
      }
      const tokenMint = event.token_mint || event.data?.mint_address || event.data?.token_mint || event.data?.base_mint;
      if (tokenMint || ['launch_detected', 'token_scan_started', 'token_scan_update', 'market_price_update', 'paper_buy_executed', 'paper_buy_failed', 'paper_sell_executed', 'strategy_rejected_token', 'token_metadata_updated', 'price_updated', 'liquidity_updated'].includes(event.event_type)) {
        setTokens((previous) => {
          const mint = String(tokenMint || '');
          const merged = mergeTokenEvent(previous.find((item) => item.mint === mint), event);
          return merged ? [merged, ...previous.filter((item) => item.mint !== merged.mint)].slice(0, 500) : previous;
        });
        setSelectedToken((previous) => previous && previous.mint === String(tokenMint || '')
          ? (mergeTokenEvent(previous, event) || previous) : previous);
      }
      setEvents((previous) => {
        const severity = String(event.data?.severity || '').toLowerCase();
        const isRepeatableDiagnostic =
          (event.event_type === 'diagnostic' || event.event_type === 'stream_warning') &&
          (severity === 'warning' || severity === 'error');
        if (isRepeatableDiagnostic) {
          const component = String(event.data?.component || 'unknown');
          const duplicateIndex = previous.findIndex((item) =>
            (item.event_type === 'diagnostic' || item.event_type === 'stream_warning') &&
            String(item.data?.component || 'unknown') === component &&
            item.message === event.message &&
            Math.abs(Date.parse(event.timestamp) - Date.parse(item.timestamp)) <= 5000
          );
          if (duplicateIndex >= 0) {
            const duplicate = previous[duplicateIndex];
            const updated = {
              ...duplicate,
              data: {
                ...duplicate.data,
                repeated_count: Number(duplicate.data?.repeated_count || 1) + 1,
                last_seen_at: event.timestamp,
              },
            };
            return [updated, ...previous.filter((_, index) => index !== duplicateIndex)].slice(0, 200);
          }
        }
        return [event, ...previous].slice(0, 200);
      });
      if (event.event_type === 'connection_status') {
        const stream = event.data.solana_stream || {};
        const engine = event.data.engine || {};
        setEngineStatus((previous) => ({
          ...previous,
          solana_connected: Boolean(stream.connected),
          pumpswap_connected: Boolean(event.data.solana_streams?.pumpswap?.connected),
          pumpswap_reconnection_count: Number(event.data.solana_streams?.pumpswap?.reconnect_count || 0),
          pumpswap_last_error: String(event.data.solana_streams?.pumpswap?.last_error || ''),
          solana_last_error: String(stream.last_error || ''),
          solana_last_message_at: String(stream.last_message_at || ''),
          running: !Boolean(engine.paused),
          strategy_paused: Boolean(engine.paused),
          operating_mode: 'PAPER',
          provider_name: stream.provider || previous.provider_name,
          reconnection_count: Number(stream.reconnect_count ?? previous.reconnection_count),
        }));
        setIsStreamPaused(Boolean(engine.paused));
      } else if (event.event_type === 'engine_state') {
        setIsStreamPaused(Boolean(event.data.paused));
        setEngineStatus((previous) => ({
          ...previous, running: !Boolean(event.data.paused),
          strategy_paused: Boolean(event.data.paused), operating_mode: 'PAPER',
        }));
      } else if (event.event_type === 'launch_detected') {
        const launch = event.data as Partial<TokenLaunchRecord>;
        if (typeof launch.mint_address === 'string' && typeof launch.signature === 'string') {
          const record: TokenLaunchRecord = {
            id: String(launch.id || launch.signature), mint_address: launch.mint_address,
            creator_address: launch.creator_address || null, source: launch.source || 'unknown',
            signature: launch.signature, slot: Number(launch.slot || 0),
            detected_at: launch.detected_at || event.timestamp,
          };
          setLaunches((previous) => [record, ...previous.filter((item) => item.signature !== record.signature)].slice(0, 500));
        }
        setEngineStatus((previous) => ({
          ...previous, tokens_detected_today: previous.tokens_detected_today + 1,
        }));
      } else if (event.event_type === 'provider_status') {
        const isPumpSwap = event.data.stream_name === 'pumpswap';
        setEngineStatus((previous) => isPumpSwap
          ? {
              ...previous,
              pumpswap_connected: Boolean(event.data.connected),
              pumpswap_reconnection_count: Number(event.data.reconnect_count ?? previous.pumpswap_reconnection_count),
              pumpswap_last_error: event.data.connected ? '' : String(event.data.reason || previous.pumpswap_last_error),
            }
          : {
              ...previous,
              solana_connected: Boolean(event.data.connected),
              reconnection_count: Number(event.data.reconnect_count ?? previous.reconnection_count),
              solana_last_error: event.data.connected ? '' : String(event.data.reason || previous.solana_last_error),
            });
      } else if (event.event_type === 'diagnostic') {
        setBackendError(typeof event.data.message === 'string' ? event.data.message : 'Backend diagnostic received.');
      }
    });
    return () => {
      active = false;
      unsubscribeStatus();
      unsubscribeEvents();
    };
  }, []);



  const sendPause = useCallback((pause: boolean) => {
    const sent = wsService.sendCommand(pause ? 'pause' : 'resume');
    if (!sent) setBackendError('Cannot change engine state: WebSocket is not connected.');
  }, []);

  const toggleStreamPause = () => sendPause(!isStreamPaused);
  const toggleEngine = () => sendPause(engineStatus.running);
  const toggleStrategy = () => setBackendError('Strategy controls are unavailable until the backend strategy-control API is implemented.');
  const clearEvents = () => { setEvents([]); setSelectedEvent(null); };
  const clearBrowserHistory = () => {
    setEvents([]);
    setLaunches([]);
    setTokens([]);
    setSelectedEvent(null);
    setSelectedToken(null);
    setBackendError(null);
  };
  const closePosition = () => setBackendError('Paper position closing is unavailable: no backend paper-order endpoint exists yet.');
  const executeManualPaperBuy = () => setBackendError('Paper buying is disabled until a real backend paper-order endpoint is implemented.');
  const updatePositionRisk = () => setBackendError('Position risk updates are unavailable until the backend provides persistent position endpoints.');
  const saveStrategyConfig = async (_config: StrategyConfig): Promise<boolean> => {
    setBackendError('Strategy settings were not saved: the backend does not yet expose a strategy persistence endpoint.');
    return false;
  };
  const updateSettings = (newSettings: Partial<ApiSettings>) => {
    const updated = apiClient.saveSettings(newSettings);
    setSettings(updated);
    wsService.disconnect();
    wsService.connect();
    setBackendError(null);
  };
  const openTokenDetailByMint = (mint: string, fallback: Partial<DiscoveredToken> = {}) => {
    const existing = tokens.find((item) => item.mint === mint);
    if (existing) {
      setSelectedToken(existing);
      setBackendError(null);
      return;
    }

    const launch = launches.find((item) => item.mint_address === mint);
    const relatedEvent = [...events].reverse().find((event) =>
      event.token_mint === mint || event.data?.mint_address === mint
    );
    const metadata = relatedEvent?.data || {};
    const venueValue = String(fallback.venue || metadata.venue || launch?.source || 'pump.fun').toLowerCase();
    const venue = venueValue.includes('raydium') ? 'raydium' : venueValue.includes('swap') ? 'pumpswap' : 'pump.fun';
    const safetyDetails = {
      mint_authority: 'active' as const,
      freeze_authority: 'active' as const,
      top_10_holders_pct: 0,
      liquidity_locked: false,
      liquidity_locked_pct: 0,
      honeypot_risk: 'low' as const,
      dev_holding_pct: 0,
      dev_sold_all: false,
      bundled_snipers_detected: false,
      risk_flags: [],
      safety_score: 0,
      holders_count: 0,
      creator_reputation: 'first_deploy' as const,
      largest_holders: [],
      ...(fallback.safety_details || metadata.safety_details || {}),
    };
    const detailToken: DiscoveredToken = {
      mint,
      name: String(fallback.name || metadata.name || metadata.token_name || 'Unknown token'),
      symbol: String(fallback.symbol || metadata.symbol || metadata.token_symbol || 'UNKNOWN'),
      creator_wallet: String(fallback.creator_wallet || metadata.creator_wallet || metadata.creator_address || launch?.creator_address || ''),
      launch_time: String(fallback.launch_time || launch?.detected_at || relatedEvent?.timestamp || new Date().toISOString()),
      current_price_usd: Number(fallback.current_price_usd ?? metadata.current_price_usd ?? metadata.price_usd ?? 0),
      current_price_sol: Number(fallback.current_price_sol ?? metadata.current_price_sol ?? 0),
      market_cap_usd: Number(fallback.market_cap_usd ?? metadata.market_cap_usd ?? metadata.market_cap ?? 0),
      liquidity_usd: Number(fallback.liquidity_usd ?? metadata.liquidity_usd ?? 0),
      volume_5m_usd: Number(fallback.volume_5m_usd ?? metadata.volume_5m_usd ?? 0),
      volume_1h_usd: Number(fallback.volume_1h_usd ?? metadata.volume_1h_usd ?? 0),
      tx_buys_5m: Number(fallback.tx_buys_5m ?? metadata.tx_buys_5m ?? 0),
      tx_sells_5m: Number(fallback.tx_sells_5m ?? metadata.tx_sells_5m ?? 0),
      bonding_curve_progress_pct: Number(fallback.bonding_curve_progress_pct ?? metadata.bonding_curve_progress_pct ?? 0),
      venue,
      safety_status: fallback.safety_status || 'warning',
      qualification_status: fallback.qualification_status || 'bought_paper',
      safety_details: safetyDetails,
      price_history_5m: fallback.price_history_5m || [],
    };
    setSelectedToken(detailToken);
    setBackendError(null);
  };
  const closeTokenDetail = () => setSelectedToken(null);
  const navigateToTab = (tab: NavigationTab) => { setSelectedToken(null); setActiveTab(tab); };

  return (
    <TerminalContext.Provider value={{
      activeTab, setActiveTab: navigateToTab, engineStatus, summary, positions, tokens,
      events, launches, paperWallet, selectedEvent, setSelectedEvent, selectedToken, setSelectedToken,
      openTokenDetailByMint, closeTokenDetail, strategyConfig, strategyDecisions,
      settings, isStreamPaused, toggleStreamPause, clearEvents, clearBrowserHistory, toggleEngine,
      toggleStrategy, closePosition, executeManualPaperBuy, updatePositionRisk,
      saveStrategyConfig, updateSettings, isMobilePreview, setIsMobilePreview, backendError,
    }}>
      {children}
    </TerminalContext.Provider>
  );
};

export const useTerminal = (): TerminalContextType => {
  const context = useContext(TerminalContext);
  if (!context) throw new Error('useTerminal must be used within a TerminalProvider');
  return context;
};

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  ConnectionStatus, DashboardSummary, DiscoveredToken, EngineStatus, NodeXEvent,
  Position, StrategyConfig, StrategyDecision,
} from '../types';
import { apiClient, ApiSettings } from '../services/api';
import { wsService } from '../services/websocket';

export type NavigationTab =
  | 'overview' | 'positions' | 'live_feed' | 'event_monitor'
  | 'strategy' | 'token_intelligence' | 'settings';

interface TerminalContextType {
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  engineStatus: EngineStatus;
  summary: DashboardSummary;
  positions: Position[];
  tokens: DiscoveredToken[];
  events: NodeXEvent[];
  selectedEvent: NodeXEvent | null;
  setSelectedEvent: (event: NodeXEvent | null) => void;
  selectedToken: DiscoveredToken | null;
  setSelectedToken: (token: DiscoveredToken | null) => void;
  openTokenDetailByMint: (mint: string) => void;
  closeTokenDetail: () => void;
  strategyConfig: StrategyConfig;
  strategyDecisions: StrategyDecision[];
  settings: ApiSettings;
  isStreamPaused: boolean;
  toggleStreamPause: () => void;
  clearEvents: () => void;
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
  solana_connected: false, rpc_endpoint: '', rpc_latency_ms: 0,
  ws_status: 'disconnected', ws_endpoint: '', provider_name: 'Not connected',
  last_heartbeat: '', incoming_event_rate: 0, reconnection_count: 0,
  database_status: 'offline', tokens_detected_today: 0,
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

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(emptyStatus);
  const [summary] = useState<DashboardSummary>(emptySummary);
  const [positions] = useState<Position[]>([]);
  const [tokens] = useState<DiscoveredToken[]>([]);
  const [events, setEvents] = useState<NodeXEvent[]>([]);
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
      setEvents((previous) => [event, ...previous].slice(0, 500));
      if (event.event_type === 'connection_status') {
        const stream = event.data.solana_stream || {};
        const engine = event.data.engine || {};
        setEngineStatus((previous) => ({
          ...previous,
          solana_connected: Boolean(stream.connected),
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
        setEngineStatus((previous) => ({
          ...previous, tokens_detected_today: previous.tokens_detected_today + 1,
        }));
      } else if (event.event_type === 'diagnostic') {
        setBackendError(typeof event.data.message === 'string' ? event.data.message : 'Backend diagnostic received.');
      }
    });
    return () => { active = false; unsubscribeStatus(); unsubscribeEvents(); };
  }, []);

  const sendPause = useCallback((pause: boolean) => {
    const sent = wsService.sendCommand(pause ? 'pause' : 'resume');
    if (!sent) setBackendError('Cannot change engine state: WebSocket is not connected.');
  }, []);

  const toggleStreamPause = () => sendPause(!isStreamPaused);
  const toggleEngine = () => sendPause(engineStatus.running);
  const toggleStrategy = () => setBackendError('Strategy controls are unavailable until the backend strategy-control API is implemented.');
  const clearEvents = () => { setEvents([]); setSelectedEvent(null); };
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
  const openTokenDetailByMint = (mint: string) => {
    const token = tokens.find((item) => item.mint === mint);
    if (token) setSelectedToken(token);
    else setBackendError('Complete token detail is not available yet. The backend currently exposes launch records and security scans.');
  };
  const closeTokenDetail = () => setSelectedToken(null);
  const navigateToTab = (tab: NavigationTab) => { setSelectedToken(null); setActiveTab(tab); };

  return (
    <TerminalContext.Provider value={{
      activeTab, setActiveTab: navigateToTab, engineStatus, summary, positions, tokens,
      events, selectedEvent, setSelectedEvent, selectedToken, setSelectedToken,
      openTokenDetailByMint, closeTokenDetail, strategyConfig, strategyDecisions,
      settings, isStreamPaused, toggleStreamPause, clearEvents, toggleEngine,
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

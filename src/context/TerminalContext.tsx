import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ConnectionStatus,
  DashboardSummary,
  DiscoveredToken,
  EngineStatus,
  NodeXEvent,
  Position,
  PositionStatus,
  StrategyConfig,
  StrategyDecision,
} from '../types';
import { apiClient, ApiSettings } from '../services/api';
import { wsService } from '../services/websocket';
import {
  INITIAL_DECISIONS,
  INITIAL_ENGINE_STATUS,
  INITIAL_EVENTS,
  INITIAL_POSITIONS,
  INITIAL_STRATEGY_CONFIG,
  INITIAL_SUMMARY,
  INITIAL_TOKENS,
} from '../services/mockData';

export type NavigationTab =
  | 'overview'
  | 'positions'
  | 'live_feed'
  | 'event_monitor'
  | 'strategy'
  | 'token_intelligence'
  | 'settings';

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
}

const TerminalContext = createContext<TerminalContextType | null>(null);

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const eventCountRef = useRef(0);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(INITIAL_ENGINE_STATUS);
  const [summary, setSummary] = useState<DashboardSummary>(INITIAL_SUMMARY);
  const [positions, setPositions] = useState<Position[]>(INITIAL_POSITIONS);
  const [tokens, setTokens] = useState<DiscoveredToken[]>(INITIAL_TOKENS);
  const [events, setEvents] = useState<NodeXEvent[]>(INITIAL_EVENTS);
  const [selectedEvent, setSelectedEvent] = useState<NodeXEvent | null>(INITIAL_EVENTS[0] || null);
  const [selectedToken, setSelectedToken] = useState<DiscoveredToken | null>(null);
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>(INITIAL_STRATEGY_CONFIG);
  const [strategyDecisions, setStrategyDecisions] = useState<StrategyDecision[]>(INITIAL_DECISIONS);
  const [settings, setSettings] = useState<ApiSettings>(apiClient.getSettings());
  const [isStreamPaused, setIsStreamPaused] = useState<boolean>(false);
  const [isMobilePreview, setIsMobilePreview] = useState<boolean>(false);

  // Initialize from API / storage
  useEffect(() => {
    async function loadInitial() {
      const savedStrat = await apiClient.getStrategy();
      if (savedStrat?.config) {
        setStrategyConfig(savedStrat.config);
      }
      if (savedStrat?.decisions) {
        setStrategyDecisions(savedStrat.decisions);
      }
    }
    loadInitial();
  }, []);

  // Listen to WebSocket status
  useEffect(() => {
    const unsub = wsService.onStatusChange((status: ConnectionStatus, latency: number) => {
      setEngineStatus((prev) => ({
        ...prev,
        ws_status: status,
        rpc_latency_ms: latency || prev.rpc_latency_ms,
        last_heartbeat: new Date().toISOString(),
      }));
    });
    return unsub;
  }, []);

  // Listen to incoming WebSocket events
  useEffect(() => {
    const unsub = wsService.subscribe((incomingEvent: NodeXEvent) => {
      eventCountRef.current += 1;
      // 1. Add to events list (keep newest 200)
      setEvents((prev) => [incomingEvent, ...prev.slice(0, 199)]);

      // 2. React to specific event types
      if (incomingEvent.event_type === 'price_updated') {
        const { token_mint, new_price_usd } = incomingEvent.data;
        if (token_mint && new_price_usd) {
          // Update tokens table
          setTokens((prev) =>
            prev.map((t) =>
              t.mint === token_mint
                ? {
                    ...t,
                    current_price_usd: new_price_usd,
                    current_price_sol: Number((new_price_usd / summary.sol_price_usd).toFixed(6)),
                  }
                : t
            )
          );

          // Update positions and check SL/TP
          setPositions((prev) =>
            prev.map((pos) => {
              if (pos.mint === token_mint && pos.status === 'OPEN') {
                const currentVal = pos.amount_tokens * new_price_usd;
                const pnl = currentVal - pos.initial_investment_usd;
                const pnlPct = (pnl / pos.initial_investment_usd) * 100;

                // Check automated exit targets
                let status: PositionStatus = pos.status;
                let exitPrice: number | undefined = undefined;
                let exitTime: string | undefined = undefined;

                if (pnlPct >= pos.take_profit_target_pct) {
                  status = 'TAKE_PROFIT';
                  exitPrice = new_price_usd;
                  exitTime = new Date().toISOString();
                } else if (pnlPct <= -pos.stop_loss_target_pct) {
                  status = 'STOP_LOSS';
                  exitPrice = new_price_usd;
                  exitTime = new Date().toISOString();
                }

                return {
                  ...pos,
                  current_price_usd: new_price_usd,
                  current_position_value_usd: Number(currentVal.toFixed(2)),
                  pnl_usd: Number(pnl.toFixed(2)),
                  pnl_pct: Number(pnlPct.toFixed(2)),
                  status,
                  exit_price_usd: exitPrice ?? pos.exit_price_usd,
                  exit_time: exitTime ?? pos.exit_time,
                };
              }
              return pos;
            })
          );
        }
      } else if (incomingEvent.event_type === 'new_token_detected') {
        const data = incomingEvent.data;
        if (data.token_mint) {
          const newToken: DiscoveredToken = {
            mint: data.token_mint,
            name: data.name || 'Unknown Solana Token',
            symbol: data.symbol || 'SOL',
            creator_wallet: data.creator_wallet || 'Unknown',
            launch_time: incomingEvent.timestamp,
            current_price_usd: data.initial_price_usd || 0.005,
            current_price_sol: Number(((data.initial_price_usd || 0.005) / summary.sol_price_usd).toFixed(6)),
            market_cap_usd: (data.initial_price_usd || 0.005) * 10000000,
            liquidity_usd: data.liquidity_usd || 18000,
            volume_5m_usd: 1200,
            volume_1h_usd: 1200,
            tx_buys_5m: 14,
            tx_sells_5m: 2,
            bonding_curve_progress_pct: data.bonding_curve_progress_pct || 15,
            venue: data.venue || 'pump.fun',
            safety_status: (data.safety_score || 50) >= 80 ? 'verified' : (data.safety_score || 50) >= 60 ? 'warning' : 'danger',
            qualification_status: (data.safety_score || 50) >= 80 ? 'qualified' : 'under_analysis',
            safety_details: {
              mint_authority: 'renounced',
              freeze_authority: 'revoked',
              top_10_holders_pct: 19.5,
              liquidity_locked: true,
              liquidity_locked_pct: 100,
              honeypot_risk: 'none',
              dev_holding_pct: 1.5,
              dev_sold_all: false,
              bundled_snipers_detected: false,
              risk_flags: [],
              safety_score: data.safety_score || 85,
              holders_count: 42,
              creator_reputation: 'clean',
              largest_holders: [
                { address: 'Pump.fun Reserve', percentage: 70.0, is_creator: false, is_raydium_vault: false },
                { address: data.creator_wallet || 'Dev', percentage: 1.5, is_creator: true, is_raydium_vault: false },
              ],
            },
            price_history_5m: [
              { time: 1, price: data.initial_price_usd * 0.9, volume: 500 },
              { time: 2, price: data.initial_price_usd, volume: 1200 },
            ],
          };

          setTokens((prev) => [newToken, ...prev.filter((t) => t.mint !== data.token_mint)]);
          setEngineStatus((prev) => ({
            ...prev,
            tokens_detected_today: prev.tokens_detected_today + 1,
          }));
        }
      } else if (incomingEvent.event_type === 'liquidity_updated') {
        const data = incomingEvent.data;
        if (data.token_mint) {
          setTokens((prev) => prev.map((token) => {
            if (token.mint !== data.token_mint) return token;
            const change = Number(data.change_pct || 0) / 100;
            const liquidity = Math.max(100, token.liquidity_usd * (1 + change));
            const volumeIncrease = Math.max(10, liquidity * (0.001 + Math.random() * 0.002));
            const buys = Math.random() > 0.42;
            return {
              ...token,
              liquidity_usd: Number(liquidity.toFixed(2)),
              volume_5m_usd: Number((token.volume_5m_usd + volumeIncrease).toFixed(2)),
              volume_1h_usd: Number((token.volume_1h_usd + volumeIncrease).toFixed(2)),
              tx_buys_5m: token.tx_buys_5m + (buys ? 1 : 0),
              tx_sells_5m: token.tx_sells_5m + (buys ? 0 : 1),
            };
          }));
        }
      } else if (incomingEvent.event_type === 'paper_buy_executed') {
        const data = incomingEvent.data;
        if (data.token_mint) {
          // Check if already in positions
          setPositions((prev) => {
            const exists = prev.some((p) => p.mint === data.token_mint && p.status === 'OPEN');
            if (exists) return prev;

            const newPos: Position = {
              id: `pos_${Date.now()}`,
              mint: data.token_mint,
              name: data.symbol || 'Solana Asset',
              symbol: data.symbol || 'SOL',
              entry_price_sol: Number(((data.entry_price_usd || 0.01) / summary.sol_price_usd).toFixed(6)),
              entry_price_usd: data.entry_price_usd || 0.01,
              current_price_sol: Number(((data.entry_price_usd || 0.01) / summary.sol_price_usd).toFixed(6)),
              current_price_usd: data.entry_price_usd || 0.01,
              amount_tokens: data.amount_tokens || 10000,
              initial_investment_usd: Number(((data.amount_sol || 1.25) * summary.sol_price_usd).toFixed(2)),
              initial_investment_sol: data.amount_sol || 1.25,
              current_position_value_usd: Number(((data.amount_sol || 1.25) * summary.sol_price_usd).toFixed(2)),
              pnl_usd: 0,
              pnl_pct: 0,
              status: 'OPEN',
              entry_time: incomingEvent.timestamp,
              take_profit_target_pct: strategyConfig.take_profit_pct,
              stop_loss_target_pct: strategyConfig.stop_loss_pct,
              trailing_stop_pct: strategyConfig.trailing_stop_callback_pct,
              venue: data.venue || 'pump.fun',
              tx_signature: incomingEvent.tx_signature || '5Kx89...',
            };
            return [newPos, ...prev];
          });

          setEngineStatus((prev) => ({
            ...prev,
            simulated_buys_count: prev.simulated_buys_count + 1,
          }));
        }
      }
    });

    return unsub;
  }, [summary.sol_price_usd, strategyConfig]);

  // Measure incoming stream throughput independently from price/portfolio updates.
  useEffect(() => {
    const timer = setInterval(() => {
      const eventsPerSecond = eventCountRef.current;
      eventCountRef.current = 0;
      setEngineStatus((prev) => ({
        ...prev,
        incoming_event_rate: eventsPerSecond,
        last_heartbeat: new Date().toISOString(),
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Dynamically recalculate summary figures based on positions
  useEffect(() => {
    const openPos = positions.filter((p) => p.status === 'OPEN');
    const closedPos = positions.filter((p) => p.status !== 'OPEN');

    const totalInvested = openPos.reduce((acc, p) => acc + p.initial_investment_usd, 0);
    const currentOpenValue = openPos.reduce((acc, p) => acc + p.current_position_value_usd, 0);
    const unrealisedPnl = currentOpenValue - totalInvested;

    const realisedPnl = closedPos.reduce((acc, p) => acc + p.pnl_usd, 0);
    const totalPnl = realisedPnl + unrealisedPnl;

    const winningClosed = closedPos.filter((p) => p.pnl_usd > 0).length;
    const winRate = closedPos.length > 0 ? (winningClosed / closedPos.length) * 100 : 68.4;

    const basePortfolio = 10000;
    const totalPortfolio = basePortfolio + totalPnl;

    setSummary((prev) => ({
      ...prev,
      open_positions_count: openPos.length,
      total_invested_capital_usd: Number(totalInvested.toFixed(2)),
      total_portfolio_value_usd: Number(totalPortfolio.toFixed(2)),
      total_portfolio_value_sol: Number((totalPortfolio / prev.sol_price_usd).toFixed(2)),
      unrealised_pnl_usd: Number(unrealisedPnl.toFixed(2)),
      unrealised_pnl_pct: totalInvested > 0 ? Number(((unrealisedPnl / totalInvested) * 100).toFixed(2)) : 0,
      realised_pnl_usd: Number(realisedPnl.toFixed(2)),
      realised_pnl_pct: Number(((realisedPnl / basePortfolio) * 100).toFixed(2)),
      total_pnl_usd: Number(totalPnl.toFixed(2)),
      total_pnl_pct: Number(((totalPnl / basePortfolio) * 100).toFixed(2)),
      win_rate_pct: Number(winRate.toFixed(1)),
      completed_trades_count: closedPos.length,
    }));
  }, [positions]);

  const toggleStreamPause = () => {
    const nextState = !isStreamPaused;
    setIsStreamPaused(nextState);
    wsService.setPaused(nextState);
  };

  const clearEvents = () => {
    setEvents([]);
  };

  const toggleEngine = () => {
    setEngineStatus((prev) => ({
      ...prev,
      running: !prev.running,
    }));
  };

  const toggleStrategy = () => {
    setEngineStatus((prev) => ({
      ...prev,
      strategy_paused: !prev.strategy_paused,
    }));
  };

  const closePosition = (positionId: string, percentage: number) => {
    setPositions((prev) =>
      prev.map((pos) => {
        if (pos.id === positionId) {
          const isFull = percentage >= 100;
          const status = pos.pnl_usd >= 0 ? 'CLOSED_PROFIT' : 'CLOSED_LOSS';
          const exitTime = new Date().toISOString();

          // Dispatch paper sell event
          const sellEvent: NodeXEvent = {
            event_id: `evt_sell_${Date.now()}`,
            event_type: 'paper_sell_executed',
            timestamp: exitTime,
            token_mint: pos.mint,
            message: `Manual paper sell ${percentage}% of ${pos.symbol} at $${pos.current_price_usd} (P&L: ${pos.pnl_usd >= 0 ? '+' : ''}$${pos.pnl_usd})`,
            processing_status: 'executed',
            tx_signature: `4mKp...${Math.random().toString(36).substring(2, 6)}`,
            data: {
              symbol: pos.symbol,
              token_mint: pos.mint,
              exit_price_usd: pos.current_price_usd,
              percentage_sold: percentage,
              realised_pnl_usd: pos.pnl_usd,
              status: 'success',
            },
          };
          wsService.dispatch(sellEvent);

          return {
            ...pos,
            status: isFull ? status : pos.status,
            exit_time: exitTime,
            exit_price_usd: pos.current_price_usd,
          };
        }
        return pos;
      })
    );
  };

  const executeManualPaperBuy = (mint: string, solAmount: number) => {
    const targetToken = tokens.find((t) => t.mint === mint);
    const tokenPrice = targetToken ? targetToken.current_price_usd : 0.015;
    const tokenSymbol = targetToken ? targetToken.symbol : 'SOLX';
    const tokenName = targetToken ? targetToken.name : 'Solana Token';
    const amountUsd = solAmount * summary.sol_price_usd;
    const tokenQty = Math.round(amountUsd / tokenPrice);

    const newPos: Position = {
      id: `pos_manual_${Date.now()}`,
      mint,
      name: tokenName,
      symbol: tokenSymbol,
      entry_price_sol: Number((tokenPrice / summary.sol_price_usd).toFixed(6)),
      entry_price_usd: tokenPrice,
      current_price_sol: Number((tokenPrice / summary.sol_price_usd).toFixed(6)),
      current_price_usd: tokenPrice,
      amount_tokens: tokenQty,
      initial_investment_usd: Number(amountUsd.toFixed(2)),
      initial_investment_sol: solAmount,
      current_position_value_usd: Number(amountUsd.toFixed(2)),
      pnl_usd: 0,
      pnl_pct: 0,
      status: 'OPEN',
      entry_time: new Date().toISOString(),
      take_profit_target_pct: strategyConfig.take_profit_pct,
      stop_loss_target_pct: strategyConfig.stop_loss_pct,
      trailing_stop_pct: strategyConfig.trailing_stop_callback_pct,
      venue: targetToken?.venue || 'pump.fun',
      tx_signature: `5Tx...${Math.random().toString(36).substring(2, 6)}`,
    };

    setPositions((prev) => [newPos, ...prev]);

    const buyEvent: NodeXEvent = {
      event_id: `evt_manual_buy_${Date.now()}`,
      event_type: 'paper_buy_executed',
      timestamp: new Date().toISOString(),
      token_mint: mint,
      message: `Manual paper buy: ${tokenQty.toLocaleString()} ${tokenSymbol} for ${solAmount} SOL ($${amountUsd.toFixed(2)})`,
      processing_status: 'executed',
      tx_signature: newPos.tx_signature,
      data: {
        symbol: tokenSymbol,
        token_mint: mint,
        entry_price_usd: tokenPrice,
        amount_sol: solAmount,
        amount_tokens: tokenQty,
        venue: targetToken?.venue || 'pump.fun',
        mode: 'manual_paper',
      },
    };
    wsService.dispatch(buyEvent);
  };

  const updatePositionRisk = (positionId: string, sl: number, tp: number) => {
    setPositions((prev) =>
      prev.map((pos) =>
        pos.id === positionId
          ? {
              ...pos,
              stop_loss_target_pct: sl,
              take_profit_target_pct: tp,
            }
          : pos
      )
    );
  };

  const saveStrategyConfig = async (newConfig: StrategyConfig): Promise<boolean> => {
    setStrategyConfig(newConfig);
    const res = await apiClient.updateStrategy(newConfig);
    return res.success;
  };

  const updateSettings = (newSettings: Partial<ApiSettings>) => {
    const updated = apiClient.saveSettings(newSettings);
    setSettings(updated);
    wsService.connect();
  };

  const openTokenDetailByMint = (mint: string) => {
    const token = tokens.find((t) => t.mint === mint);
    if (token) {
      setSelectedToken(token);
    } else {
      // Find from positions
      const pos = positions.find((p) => p.mint === mint);
      if (pos) {
        setSelectedToken({
          mint: pos.mint,
          name: pos.name,
          symbol: pos.symbol,
          creator_wallet: `${pos.mint.substring(0, 6)}...${pos.mint.substring(pos.mint.length - 4)}`,
          launch_time: pos.entry_time,
          current_price_usd: pos.current_price_usd,
          current_price_sol: pos.current_price_sol,
          market_cap_usd: pos.current_price_usd * 10000000,
          liquidity_usd: 35000,
          volume_5m_usd: 8500,
          volume_1h_usd: 62000,
          tx_buys_5m: 32,
          tx_sells_5m: 9,
          bonding_curve_progress_pct: 75,
          venue: pos.venue,
          safety_status: 'verified',
          qualification_status: 'bought_paper',
          safety_details: {
            mint_authority: 'renounced',
            freeze_authority: 'revoked',
            top_10_holders_pct: 18.2,
            liquidity_locked: true,
            liquidity_locked_pct: 100,
            honeypot_risk: 'none',
            dev_holding_pct: 1.2,
            dev_sold_all: false,
            bundled_snipers_detected: false,
            risk_flags: [],
            safety_score: 92,
            holders_count: 480,
            creator_reputation: 'clean',
            largest_holders: [
              { address: 'Reserve Vault', percentage: 55, is_creator: false, is_raydium_vault: true },
              { address: 'Dev Wallet', percentage: 1.2, is_creator: true, is_raydium_vault: false },
            ],
          },
          price_history_5m: [
            { time: 1, price: pos.entry_price_usd * 0.95, volume: 2000 },
            { time: 2, price: pos.entry_price_usd, volume: 4500 },
            { time: 3, price: pos.current_price_usd, volume: 8500 },
          ],
        });
      }
    }
  };

  const closeTokenDetail = () => {
    setSelectedToken(null);
  };

  const navigateToTab = (tab: NavigationTab) => {
    setSelectedToken(null);
    setActiveTab(tab);
  };

  return (
    <TerminalContext.Provider
      value={{
        activeTab,
        setActiveTab: navigateToTab,
        engineStatus,
        summary,
        positions,
        tokens,
        events,
        selectedEvent,
        setSelectedEvent,
        selectedToken,
        setSelectedToken,
        openTokenDetailByMint,
        closeTokenDetail,
        strategyConfig,
        strategyDecisions,
        settings,
        isStreamPaused,
        toggleStreamPause,
        clearEvents,
        toggleEngine,
        toggleStrategy,
        closePosition,
        executeManualPaperBuy,
        updatePositionRisk,
        saveStrategyConfig,
        updateSettings,
        isMobilePreview,
        setIsMobilePreview,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
};

export const useTerminal = (): TerminalContextType => {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  return context;
};

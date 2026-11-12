import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  ConnectionStatus, DashboardSummary, DiscoveredToken, EngineStatus, NodeXEvent,
  Position, StrategyConfig, StrategyDecision, TokenLaunchRecord, PaperWalletSnapshot,
} from '../types';
import { apiClient, ApiSettings, NodeXProfileSnapshot } from '../services/rest';
import { backendService } from '../services/backend';
import { normalizeBackendEvent, wsService } from '../services/websocket';
import { engineEventStore } from '../services/engine-event-store';
import { recordRequest } from '../services/engineLogs';
import { recoverTokenLogoGroup } from '../services/token-logo-recovery';
import { clearTokenLifecycleCache, lifecycleCacheSignature, loadTokenLifecycleCache, pruneTokenLifecycleCache, saveTokenLifecycleCache } from '../services/token-lifecycle-cache';

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
  profile: NodeXProfileSnapshot | null;
  events: NodeXEvent[];
  selectedEvent: NodeXEvent | null;
  setSelectedEvent: (event: NodeXEvent | null) => void;
  selectedToken: DiscoveredToken | null;
  setSelectedToken: (token: DiscoveredToken | null) => void;
  openTokenDetailByMint: (mint: string, fallback?: Partial<DiscoveredToken>) => void;
  loadTokenSnapshot: (mint: string) => Promise<void>;
  closeTokenDetail: () => void;
  strategyConfig: StrategyConfig;
  strategyDecisions: StrategyDecision[];
  settings: ApiSettings;
  isStreamPaused: boolean;
  toggleStreamPause: () => void;
  clearEvents: () => void;
  clearBrowserHistory: () => void;
  removeTokensByMint: (mints: string[]) => void;
  toggleEngine: () => void;
  toggleStrategy: () => void;
  closePosition: (positionId: string, percentage: number) => void;
  executeManualPaperBuy: (mint: string, solAmount: number) => void;
  updatePositionRisk: (positionId: string, sl: number, tp: number) => Promise<boolean>;
  saveStrategyConfig: (config: StrategyConfig) => Promise<boolean>;
  setPaperExecutionEnabled: (enabled: boolean) => Promise<boolean>;
  updateSettings: (newSettings: Partial<ApiSettings>) => void;
  updateConnectionDraft: (newSettings: Partial<ApiSettings>) => void;
  isMobilePreview: boolean;
  setIsMobilePreview: (value: boolean | ((prev: boolean) => boolean)) => void;
  backendError: string | null;
  refreshBackendState: () => Promise<void>;
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
// Fallback form values used until the persisted backend configuration loads.
const emptyStrategy: StrategyConfig = {
  min_liquidity_usd: 5000, max_entry_price_usd: 0,
  max_investment_per_token_usd: 15,
  max_simultaneous_positions: 3, min_safety_score: 80, max_slippage_pct: 10,
  stop_loss_pct: 20, take_profit_pct: 50, min_5m_buy_volume_usd: 1000,
  max_top10_holder_concentration_pct: 35, auto_buy_enabled: false,
  trailing_stop_enabled: false, trailing_stop_callback_pct: 10,
  auto_recover_token_account_rent: true,
  blacklist_creators_with_prior_rugs: true,
  paper_starting_balance: 10,
  paper_starting_balance_currency: 'USD',
  diagnostic_mode: true,
  block_unverified_trades: true,
  execution_enabled: false,
  whitelist_only_mode: false,
  preferred_owners: [],
};

const TerminalContext = createContext<TerminalContextType | null>(null);

// Discovery, scan diagnostics and event history are session-memory caches.
// The backend remains the durable source for wallet, positions and account state.
const defaultSafetyDetails: DiscoveredToken['safety_details'] = {
  mint_authority: 'unknown', freeze_authority: 'unknown', top_10_holders_pct: 0,
  liquidity_locked: false, liquidity_locked_pct: 0, honeypot_risk: 'unknown',
  dev_holding_pct: 0, dev_sold_all: false, bundled_snipers_detected: false,
  risk_flags: [], safety_score: 0, holders_count: 0, creator_reputation: 'unknown', largest_holders: [],
};

// Merge scan data as a session cache: empty/unknown follow-up payloads must not
// erase useful values already received for this mint. Longer check lists win.
function mergeCachedReport(previous: Record<string, any> = {}, incoming: Record<string, any> = {}): Record<string, any> {
  const merged: Record<string, any> = { ...previous };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === '') continue;
    const oldValue = merged[key];
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if ((key === 'checks' || key === 'provider_responses') && Array.isArray(oldValue) && oldValue.length > value.length) continue;
      merged[key] = value;
      continue;
    }
    if (value && typeof value === 'object') {
      merged[key] = mergeCachedReport(oldValue && typeof oldValue === 'object' ? oldValue : {}, value as Record<string, any>);
      continue;
    }
    if (typeof value === 'string' && ['unknown', 'unavailable', 'pending', 'not_checked'].includes(value.toLowerCase()) && oldValue != null && oldValue !== '' && !['unknown', 'unavailable', 'pending', 'not_checked'].includes(String(oldValue).toLowerCase())) continue;
    merged[key] = value;
  }
  return merged;
}
function mergeTokenEvent(previous: DiscoveredToken | undefined, event: NodeXEvent): DiscoveredToken | null {
  const data = event.data || {};
  const marketPatch = data.market_patch && typeof data.market_patch === 'object' ? data.market_patch : {};
  const statisticsPatch = data.statistics_patch && typeof data.statistics_patch === 'object' ? data.statistics_patch : {};
  const identity = data.identity && typeof data.identity === 'object' ? data.identity : {};
  const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const metrics = data.metrics && typeof data.metrics === 'object' ? data.metrics : {};
  // paper_entry_evaluation carries confirmed buyer/volume/slippage metrics under
  // data.metrics; flatten them so the shared token model receives real backend values.
  const payload = { ...data, ...metrics, ...marketPatch, ...statisticsPatch, ...identity };
  const mint = String(payload.mint_address || payload.token_mint || payload.base_mint || event.token_mint || '');
  if (!mint) return null;
  const rawUsdPrice = Number(payload.current_price_usd ?? payload.price_usd ?? payload.price ?? payload.current_price);
  const rawSolPrice = Number(payload.price_sol ?? payload.current_price_sol);
  const hasUsdPrice = Number.isFinite(rawUsdPrice) && rawUsdPrice > 0;
  const hasSolPrice = Number.isFinite(rawSolPrice) && rawSolPrice > 0;
  const price = hasUsdPrice ? rawUsdPrice : previous?.current_price_usd || 0;
  const priceSol = hasSolPrice ? rawSolPrice : previous?.current_price_sol || 0;
  const priceCurrency: DiscoveredToken['price_currency'] = hasUsdPrice ? 'USD' : hasSolPrice ? 'SOL' : previous?.price_currency || 'USD';
  const history = previous?.price_history_5m ? [...previous.price_history_5m] : [];
  const historyPrice = hasUsdPrice ? rawUsdPrice : hasSolPrice ? rawSolPrice : 0;
  const previousHistoryPrice = previous?.price_currency === 'SOL' ? previous?.current_price_sol : previous?.current_price_usd;
  if (historyPrice > 0 && historyPrice !== previousHistoryPrice) {
    if (previous?.price_currency && previous.price_currency !== priceCurrency) history.length = 0;
    history.push({ time: Date.parse(event.timestamp) || Date.now(), price: historyPrice, volume: Number(payload.volume_5m_usd || 0) });
  }
  const change1m = payload.price_change_1m_pct == null ? Number.NaN : Number(payload.price_change_1m_pct);
  const change5m = payload.price_change_5m_pct == null ? Number.NaN : Number(payload.price_change_5m_pct);
  const venueValue = String(payload.venue || payload.source || previous?.venue || 'pump.fun').toLowerCase();
  const venue: DiscoveredToken['venue'] = venueValue.includes('raydium') ? 'raydium' : venueValue.includes('swap') ? 'pumpswap' : 'pump.fun';
  const decision = String(payload.decision || payload.status || '').toLowerCase();
  const isScanProgressEvent = event.event_type === 'token_scan_retry_scheduled'
    || event.event_type === 'token_scan_started'
    || event.event_type === 'token_scan_progress';
  const previousHasTerminalVerdict = ['qualified', 'rejected', 'unverified', 'bought_paper']
    .includes(String(previous?.qualification_status || ''));
  const previousHasTerminalScanStatus = ['completed', 'verified', 'failed', 'rejected', 'unverified']
    .includes(String(previous?.scan_status || '').toLowerCase());
  const isSecurityVerdictEvent = ['token_scan_update', 'token_scan_completed', 'token_scan_failed'].includes(event.event_type);
  const incomingStateVersion = Number(data.state_version ?? data.version ?? 0);
  const previousStateVersion = Number(previous?.state_version || 0);
  const incomingScanAttempt = Number(data.scan_attempt ?? data.attempt ?? 0);
  const previousScanAttempt = Number(previous?.scan_attempt || 0);
  const isNewScanAttempt = isScanProgressEvent && incomingScanAttempt > previousScanAttempt;
  const incomingSecurityScannedAt = Date.parse(String(data.scanned_at || data.security?.scanned_at || ''));
  const previousSecurityScannedAt = Date.parse(String(previous?.security_scanned_at || ''));
  const mayReplaceTerminalVerdict = !previousHasTerminalVerdict || isNewScanAttempt || (previous?.qualification_status !== 'bought_paper' && Number.isFinite(incomingSecurityScannedAt) && incomingSecurityScannedAt > 0 && incomingSecurityScannedAt > previousSecurityScannedAt);
  const isUnverifiedTerminal = mayReplaceTerminalVerdict && (event.event_type === 'token_scan_failed'
    || event.event_type === 'token_scan_completed' && ['unverified', 'failed', 'unknown'].includes(String(data.status || decision).toLowerCase()));
  // Progress events can arrive late or be replayed after a final verdict. They
  // may update diagnostics, but must never move a terminal token back to scanning.
  const scanStatus = event.event_type === 'token_scan_retry_scheduled' ? 'retrying'
    : isScanProgressEvent
    ? isNewScanAttempt ? 'scanning'
      : previousHasTerminalScanStatus ? previous?.scan_status
      : previousHasTerminalVerdict ? 'completed' : 'scanning'
    : event.event_type === 'token_scan_completed' && mayReplaceTerminalVerdict ? String(data.status || 'completed')
    : event.event_type === 'token_scan_failed' && mayReplaceTerminalVerdict ? 'failed'
    : previous?.scan_status;
  const incomingDiagnostic: NonNullable<DiscoveredToken['diagnostics']>[number] | null = event.event_type === 'token_diagnostic' ? {
    ...data,
    mint_address: mint,
    occurred_at: String(data.occurred_at || event.timestamp),
  } : null;
  const metadataStatus = event.event_type === 'token_metadata_started' ? 'loading'
    : event.event_type === 'token_metadata_updated' ? String(data.status || 'available')
    : event.event_type === 'token_metadata_failed' ? String(data.status || 'failed')
    : previous?.metadata_status;
  // Lifecycle is backend-owned. Ordinary event names never imply a UI status.
  // Only an explicit activity object (or a canonical token_state_updated snapshot)
  // can change the lifecycle displayed for this mint.
  const scanActivity: Record<string, any> | null = event.event_type === 'token_scan_retry_scheduled'
    ? {
        status: 'retrying',
        label: 'Retrying',
        scan_attempt: incomingScanAttempt || previousScanAttempt,
        progress: 0,
        stage: 'retry_wait',
        sub_event: 'Retrying security scan',
      }
    : event.event_type === 'token_scan_started'
    ? {
        status: 'scanning',
        label: 'Scanning',
        scan_attempt: incomingScanAttempt || previousScanAttempt,
        progress: 0,
        stage: 'initializing',
        sub_event: 'Scanning',
      }
    : event.event_type === 'token_scan_progress'
      ? {
          status: 'scanning',
          label: 'Scanning',
          scan_attempt: incomingScanAttempt || previousScanAttempt,
          progress: Number(data.progress ?? 0),
          stage: data.stage || 'security_checks',
          sub_event: 'Scanning',
        }
      : event.event_type === 'token_scan_completed'
        ? (() => {
            const approved = decision === 'approved'
              && data.diagnostic_only !== true
              && (data.verification_gate_passed === true || data.all_checks_verified === true);
            const rejected = decision === 'rejected';
            return {
              status: approved ? 'verified' : rejected ? 'rejected' : 'unverified',
              label: approved ? 'Verified' : rejected ? 'Risk detected' : 'Unverified',
              progress: 100,
              stage: 'security_complete',
              sub_event: approved
                ? 'Getting market data'
                : rejected
                  ? 'Unverified'
                  : 'Unverified',
            };
          })()
        : event.event_type === 'token_scan_failed'
          ? {
              status: 'failed',
              label: 'Scan failed',
              progress: 0,
              stage: data.stage || 'security_failed',
              sub_event: 'Security scan failed',
              error: {
                severity: 'error',
                stage: data.stage || 'security_failed',
                provider: data.provider ?? null,
                message: data.message || 'Security scan failed',
                raw_response: data.error_details ?? null,
                occurred_at: data.received_at || event.timestamp,
              },
            }
          : ['market_subscription_requested', 'market_subscription_subscribed', 'market_subscription_active', 'market_subscription_waiting'].includes(event.event_type)
            && previous?.qualification_status === 'qualified'
            ? {
                status: 'verified',
                label: 'Verified',
                stage: 'waiting_for_market_data',
                sub_event: 'Getting market data',
              }
            : event.event_type === 'market_subscription_failed' && previous?.qualification_status === 'qualified'
              ? {
                  status: 'verified',
                  label: 'Verified',
                  stage: 'market_data_unavailable',
                  sub_event: 'Market data unavailable',
                }
            : event.event_type === 'market_curve_completed' && previous?.qualification_status === 'qualified'
              ? {
                  status: 'monitoring',
                  label: 'Monitoring',
                  stage: 'curve_completed',
                  sub_event: 'Bonding curve complete — PumpSwap pool discovery in progress',
                }
            : event.event_type === 'market_price_update' && previous?.qualification_status === 'qualified'
              && (Number(data.price_sol ?? data.price_usd ?? data.current_price_usd) > 0)
              ? {
                  status: 'monitoring',
                  label: 'Monitoring',
                  stage: 'market_watch',
                  sub_event: 'Monitoring market activity',
                }
            : (event.event_type === 'paper_entry_evaluation' || event.event_type === 'strategy_rejected_token')
              && previous?.qualification_status === 'qualified' && previous?.lifecycle_status === 'monitoring'
            ? (() => {
                const entryDecision = String(data.decision || (event.event_type === 'strategy_rejected_token' ? 'reject' : 'wait')).toLowerCase();
                return {
                  status: 'monitoring',
                  label: 'Monitoring',
                  stage: 'strategy_checks',
                  sub_event: entryDecision === 'reject' ? 'Strategy rejected'
                    : entryDecision === 'evaluate_paper_entry' ? 'Entry conditions met'
                    : 'Checking entry conditions',
                };
              })()
            : null;
  const incomingActivity = payload.activity && typeof payload.activity === 'object'
    ? payload.activity as Record<string, any>
    : scanActivity;
  const incomingLifecycleVersion = data.state_version == null && data.version == null
    ? null : Number(data.state_version ?? data.version);
  const previousLifecycleVersion = Number(previous?.lifecycle_version || 0);
  const incomingLifecycleTime = Date.parse(String(data.updated_at || data.received_at || event.timestamp || ''));
  const previousLifecycleTime = Date.parse(String(previous?.lifecycle_updated_at || ''));
  const lifecycleIsNewer = Boolean(incomingActivity) && (
    isNewScanAttempt || (
    incomingLifecycleVersion !== null
      ? incomingLifecycleVersion > previousLifecycleVersion ||
        incomingLifecycleVersion === previousLifecycleVersion &&
          (!Number.isFinite(previousLifecycleTime) || !Number.isFinite(incomingLifecycleTime) || incomingLifecycleTime >= previousLifecycleTime)
      : Number.isFinite(incomingLifecycleTime) &&
        (!Number.isFinite(previousLifecycleTime) || incomingLifecycleTime >= previousLifecycleTime)
    )
  );
  const qualification: DiscoveredToken['qualification_status'] = event.event_type === 'paper_buy_executed' ? 'bought_paper'
    : previousHasTerminalVerdict && !mayReplaceTerminalVerdict ? previous!.qualification_status
    : isUnverifiedTerminal ? 'unverified'
    : isSecurityVerdictEvent && mayReplaceTerminalVerdict && decision.includes('reject') ? 'rejected'
    : isScanProgressEvent ? (isNewScanAttempt ? 'under_analysis' : previousHasTerminalVerdict ? previous!.qualification_status : 'under_analysis')
    : isSecurityVerdictEvent && mayReplaceTerminalVerdict && (decision.includes('qualif') || decision.includes('approv')) ? 'qualified'
    : previous?.qualification_status || 'newly_detected';
  return {
    mint, state_version: Math.max(previousStateVersion, incomingStateVersion),
    scan_attempt: Math.max(previousScanAttempt, incomingScanAttempt),
    security_scanned_at: Number.isFinite(incomingSecurityScannedAt) && incomingSecurityScannedAt > 0 ? new Date(incomingSecurityScannedAt).toISOString() : previous?.security_scanned_at,
    name: String(payload.name || payload.token_name || metadata.name || previous?.name || 'Unknown token'),
    symbol: String(payload.symbol || payload.token_symbol || metadata.symbol || previous?.symbol || 'UNKNOWN'),
    metadata_uri: String(payload.metadata_uri || metadata.uri || previous?.metadata_uri || ''),
    logo_url: String(payload.logo_url || payload.image_url || payload.image_uri || payload.logo_uri || payload.image || metadata.image || metadata.image_url || previous?.logo_url || ''),
    metadata_status: metadataStatus,
    scan_status: scanStatus,
    scan_progress: event.event_type === 'token_scan_started' || event.event_type === 'token_scan_failed'
      ? 0
      : event.event_type === 'token_scan_progress' || event.event_type === 'token_scan_completed'
        ? Number(data.progress ?? (event.event_type === 'token_scan_completed' ? 100 : previous?.scan_progress ?? 0))
        : previous?.scan_progress,
    scan_stage: event.event_type === 'token_scan_started' || event.event_type === 'token_scan_progress'
      ? String(data.stage || (event.event_type === 'token_scan_started' ? 'initializing' : previous?.scan_stage || ''))
      : event.event_type === 'token_scan_completed' || event.event_type === 'token_scan_failed'
        ? String(data.stage || 'security_complete')
        : previous?.scan_stage,
    lifecycle_status: lifecycleIsNewer ? String(incomingActivity?.status ?? '') : previous?.lifecycle_status,
    lifecycle_label: lifecycleIsNewer ? String(incomingActivity?.label ?? '') : previous?.lifecycle_label,
    lifecycle_stage: lifecycleIsNewer ? String(incomingActivity?.stage ?? '') : previous?.lifecycle_stage,
    lifecycle_sub_event: lifecycleIsNewer ? String(incomingActivity?.sub_event ?? '') : previous?.lifecycle_sub_event,
    lifecycle_progress: lifecycleIsNewer && incomingActivity?.progress != null
      ? Number(incomingActivity.progress) : previous?.lifecycle_progress,
    lifecycle_error: lifecycleIsNewer ? (incomingActivity?.error ?? previous?.lifecycle_error) : previous?.lifecycle_error,
    lifecycle_updated_at: lifecycleIsNewer ? String(data.updated_at || event.timestamp || new Date().toISOString()) : previous?.lifecycle_updated_at,
    lifecycle_version: Math.max(previousLifecycleVersion, incomingLifecycleVersion ?? 0),
    strategy_decision: event.event_type === 'paper_entry_evaluation' ? String(data.decision || 'wait') : previous?.strategy_decision,
    strategy_reasons: event.event_type === 'paper_entry_evaluation' && Array.isArray(data.reasons) ? data.reasons.map(String) : previous?.strategy_reasons,
    strategy_evaluated_at: event.event_type === 'paper_entry_evaluation' ? String(data.evaluated_at || new Date().toISOString()) : previous?.strategy_evaluated_at,
    monitoring_status: event.event_type === 'market_subscription_requested' ? 'pending'
      : event.event_type === 'market_subscription_subscribed' ? 'subscribed'
      : event.event_type === 'market_subscription_waiting' ? String(data.status || 'waiting_for_capacity')
      : event.event_type === 'market_subscription_active' || event.event_type === 'market_price_update' ? 'active'
      : event.event_type === 'market_subscription_failed' ? 'failed'
      : event.event_type === 'market_subscriptions_removed' ? 'removed'
      : event.event_type === 'token_monitoring_started' || event.event_type === 'token_monitoring_update'
        ? String(data.status || 'watching')
        : event.event_type === 'token_monitoring_completed' ? 'completed' : previous?.monitoring_status,
    monitoring_reason: ['market_subscription_waiting', 'market_subscription_failed'].includes(event.event_type)
      ? String(data.reason || data.message || data.status || '')
      : ['market_subscription_subscribed', 'market_subscription_active', 'market_price_update'].includes(event.event_type) ? ''
      : previous?.monitoring_reason,
    monitoring_updated_at: ['market_subscription_requested', 'market_subscription_subscribed', 'market_subscription_waiting', 'market_subscription_active', 'market_subscription_failed', 'market_subscriptions_removed', 'market_price_update'].includes(event.event_type)
      ? String(data.received_at || event.timestamp)
      : previous?.monitoring_updated_at,
    authority_status: event.event_type === 'token_monitoring_update'
      ? String(data.authority_status || 'unknown') : previous?.authority_status,
    authority_rechecks: event.event_type === 'token_monitoring_update'
      ? Number(data.rechecks ?? previous?.authority_rechecks ?? 0) : previous?.authority_rechecks,
    decimals: payload.decimals == null ? previous?.decimals : Number(payload.decimals),
    total_supply_raw: String(payload.total_supply_raw || payload.total_supply || previous?.total_supply_raw || ''),
    creator_wallet: String(payload.creator_wallet || payload.creator_address || previous?.creator_wallet || ''),
    launch_time: String(payload.launch_time || payload.detected_at || previous?.launch_time || event.timestamp),
    current_price_usd: price, current_price_sol: priceSol, price_currency: priceCurrency,
    price_change_1m_pct: Number.isFinite(change1m) ? change1m : previous?.price_change_1m_pct,
    price_change_5m_pct: Number.isFinite(change5m) ? change5m : previous?.price_change_5m_pct,
    market_cap_sol: Number(payload.market_cap_sol ?? previous?.market_cap_sol ?? 0),
    market_cap_usd: Number(payload.market_cap_usd ?? payload.market_cap ?? previous?.market_cap_usd ?? 0),
    liquidity_usd: Number(payload.liquidity_usd ?? previous?.liquidity_usd ?? 0),
    volume_5m_usd: Number(payload.volume_5m_usd ?? previous?.volume_5m_usd ?? 0),
    volume_1h_usd: Number(payload.volume_1h_usd ?? previous?.volume_1h_usd ?? 0),
    tx_buys_5m: Number(payload.tx_buys_5m ?? payload.buys_5m ?? previous?.tx_buys_5m ?? 0),
    tx_sells_5m: Number(payload.tx_sells_5m ?? payload.sells_5m ?? previous?.tx_sells_5m ?? 0),
    buy_volume_5m_usd: Number(payload.buy_volume_5m_usd ?? previous?.buy_volume_5m_usd ?? 0),
    distinct_buyers_5m: Number(payload.distinct_buyers_5m ?? previous?.distinct_buyers_5m ?? 0),
    buy_count_5m: Number(payload.buy_count_5m ?? previous?.buy_count_5m ?? 0),
    sell_count_5m: Number(payload.sell_count_5m ?? previous?.sell_count_5m ?? 0),
    estimated_slippage_pct: Number(payload.estimated_slippage_pct ?? previous?.estimated_slippage_pct ?? 0),
    confirmed_trade_events: Number(payload.confirmed_trade_events ?? previous?.confirmed_trade_events ?? 0),
    buy_pressure_pct: Number(payload.buy_pressure_pct ?? previous?.buy_pressure_pct ?? 0),
    bonding_curve_status: event.event_type === 'market_curve_completed'
      ? String(payload.status || 'complete') : previous?.bonding_curve_status,
    bonding_curve_account: event.event_type === 'market_curve_completed'
      ? String(payload.account_address || previous?.bonding_curve_account || '') : previous?.bonding_curve_account,
    bonding_curve_progress_pct: Number(payload.bonding_curve_progress_pct ?? payload.bonding_curve_pct ?? previous?.bonding_curve_progress_pct ?? 0),
    venue, safety_status: payload.safety_status || previous?.safety_status || 'warning',
    qualification_status: qualification, rejection_reason: payload.reason || payload.decision_reason || previous?.rejection_reason,
    diagnostics: incomingDiagnostic
      ? [...(previous?.diagnostics || []).filter((item) => !(item.stage === incomingDiagnostic.stage && item.message === incomingDiagnostic.message && item.occurred_at === incomingDiagnostic.occurred_at)), incomingDiagnostic as NonNullable<DiscoveredToken['diagnostics']>[number]].slice(-50)
      : previous?.diagnostics || [],
    safety_details: mergeCachedReport(
      { ...defaultSafetyDetails, ...(previous?.safety_details || {}) },
      payload.safety_details || {},
    ) as DiscoveredToken['safety_details'],
    price_history_5m: history.slice(-300),
  };
}

function reconcileTokenSnapshots(
  snapshots: unknown[],
  previous: DiscoveredToken[],
  authoritative: boolean,
): DiscoveredToken[] {
  const previousByMint = new Map(previous.map((token) => [token.mint, token]));
  const restored: DiscoveredToken[] = [];
  const seen = new Set<string>();

  for (const raw of snapshots) {
    if (!raw || typeof raw !== 'object') continue;
    const snapshot = raw as Record<string, any>;
    const mint = String(snapshot.mint_address || snapshot.mint || '');
    if (!mint || seen.has(mint)) continue;
    seen.add(mint);

    const existing = previousByMint.get(mint);
    const incomingVersion = Number(snapshot.version ?? snapshot.state_version ?? 0);
    const existingVersion = Number(existing?.state_version || 0);
    if (existing && incomingVersion > 0 && existingVersion > incomingVersion) {
      restored.push(existing);
      continue;
    }

    const mapped = mapTokenDetailSnapshot(snapshot, existing);
    if (!mapped) continue;
    restored.push(existing ? {
      ...mapped,
      current_price_usd: existing.current_price_usd || mapped.current_price_usd,
      current_price_sol: existing.current_price_sol || mapped.current_price_sol,
      price_history_5m: existing.price_history_5m?.length
        ? existing.price_history_5m : mapped.price_history_5m,
    } : mapped);
  }

  // Complete backend snapshots are authoritative: tokens omitted by SQLite
  // retention/removal must not survive as stale browser-only rows.
  if (!authoritative) {
    for (const token of previous) {
      if (!seen.has(token.mint)) restored.push(token);
    }
  }
  return restored;
}

function mapBackendPosition(raw: Record<string, any>): Position | null {
  const mint = String(raw.mint_address || raw.mint || '');
  if (!mint) return null;
  const quantity = Number(raw.token_quantity ?? raw.quantity ?? 0);
  const costBasisSol = Number(raw.cost_basis_sol ?? raw.invested_sol ?? 0);
  const currentValueSol = Number(raw.current_value_sol ?? raw.marked_value_sol ?? 0);
  const pnlSol = Number(raw.unrealized_pnl_sol ?? (currentValueSol - costBasisSol));
  const pnlPct = Number(raw.pnl_pct ?? raw.unrealized_pnl_pct ?? (costBasisSol > 0 ? pnlSol / costBasisSol * 100 : 0));
  const entryPriceSol = Number(raw.entry_price_sol ?? raw.average_entry_price_sol ?? (quantity > 0 ? costBasisSol / quantity : 0));
  const currentPriceSol = Number(raw.current_price_sol ?? (quantity > 0 ? currentValueSol / quantity : 0));
  const rawStatus = String(raw.status || 'open').toLowerCase();
  const status: Position['status'] = rawStatus === 'open' ? 'OPEN'
    : rawStatus.includes('stop') ? 'STOP_LOSS'
    : rawStatus.includes('take') ? 'TAKE_PROFIT'
    : pnlSol >= 0 ? 'CLOSED_PROFIT' : 'CLOSED_LOSS';
  const venueValue = String(raw.venue || raw.source || 'pump.fun').toLowerCase();
  const venue: Position['venue'] = venueValue.includes('raydium') ? 'raydium' : venueValue.includes('swap') ? 'pumpswap' : 'pump.fun';
  return {
    id: String(raw.id || raw.position_id || mint),
    mint,
    name: String(raw.name || raw.token_name || ''),
    symbol: String(raw.symbol || raw.token_symbol || ''),
    logo_url: String(raw.logo_url || raw.image_url || raw.image_uri || raw.logo_uri || ''),
    entry_price_sol: entryPriceSol,
    entry_price_usd: Number(raw.entry_price_usd || 0),
    current_price_sol: currentPriceSol,
    current_price_usd: Number(raw.current_price_usd || 0),
    amount_tokens: quantity,
    initial_investment_usd: Number(raw.initial_investment_usd ?? raw.cost_basis_usd ?? raw.invested_usd ?? 0),
    initial_investment_sol: costBasisSol,
    current_position_value_usd: Number(raw.current_position_value_usd ?? raw.current_value_usd ?? 0),
    current_position_value_sol: currentValueSol,
    pnl_usd: Number(raw.pnl_usd ?? raw.unrealized_pnl_usd ?? 0),
    pnl_sol: pnlSol,
    pnl_pct: pnlPct,
    status,
    entry_time: String(raw.opened_at || raw.entry_time || raw.created_at || ''),
    exit_time: raw.closed_at || raw.exit_time || undefined,
    exit_price_usd: raw.exit_price_usd == null ? undefined : Number(raw.exit_price_usd),
    take_profit_target_pct: Number(raw.take_profit_pct || 0),
    stop_loss_target_pct: Number(raw.stop_loss_pct || 0),
    trailing_stop_pct: raw.trailing_stop_pct == null ? undefined : Number(raw.trailing_stop_pct),
    highest_price_usd: raw.highest_price_usd == null ? undefined : Number(raw.highest_price_usd),
    venue,
    tx_signature: String(raw.tx_signature || raw.signature || ''),
  };
}

function mapTokenDetailSnapshot(snapshot: Record<string, any>, previous?: DiscoveredToken): DiscoveredToken | null {
  const mint = String(snapshot.mint_address || snapshot.mint || previous?.mint || '');
  if (!mint) return null;
  const identity = snapshot.identity || {};
  const market = snapshot.market || {};
  const statistics = snapshot.statistics || {};
  const candles = Array.isArray(snapshot.chart?.candles) ? snapshot.chart.candles : [];
  const priceHistory = candles.map((candle: Record<string, any>) => {
    const rawTime = candle.time ?? candle.timestamp ?? candle.open_time ?? candle.start_time;
    const parsedTime = typeof rawTime === 'number' ? (rawTime < 10_000_000_000 ? rawTime * 1000 : rawTime) : Date.parse(String(rawTime || ''));
    return {
      time: Number.isFinite(parsedTime) ? parsedTime : Date.now(),
      price: Number(candle.close ?? candle.close_price ?? candle.price ?? 0),
      open: Number(candle.open ?? candle.open_price ?? candle.close ?? 0),
      high: Number(candle.high ?? candle.high_price ?? candle.close ?? 0),
      low: Number(candle.low ?? candle.low_price ?? candle.close ?? 0),
      volume: Number(candle.volume ?? candle.volume_sol ?? 0),
    };
  }).filter((point: { price: number }) => point.price > 0);
  const priceSol = Number(market.price_sol ?? previous?.current_price_sol ?? 0);
  const priceUsd = Number(market.price_usd ?? previous?.current_price_usd ?? 0);
  const venueValue = String(market.venue || identity.venue || previous?.venue || 'pump.fun').toLowerCase();
  const securityDecision = String(snapshot.security?.decision || snapshot.security?.diagnostic_assessment?.decision || '').toUpperCase();
  const snapshotVersion = Number(snapshot.version || snapshot.state_version || 0);
  const previousVersion = Number(previous?.state_version || 0);
  const previousTerminal = ['qualified', 'rejected', 'unverified', 'bought_paper'].includes(String(previous?.qualification_status || ''));
  const incomingSecurityScannedAt = Date.parse(String(snapshot.security?.scanned_at || ''));
  const previousSecurityScannedAt = Date.parse(String(previous?.security_scanned_at || ''));
  const snapshotMayReplaceTerminal = !previousTerminal
    || snapshotVersion > previousVersion
    || (previous?.qualification_status !== 'bought_paper' && Number.isFinite(incomingSecurityScannedAt) && incomingSecurityScannedAt > 0 && incomingSecurityScannedAt > previousSecurityScannedAt);
  const rawSecurityStatus = String(snapshot.security?.status || '').toLowerCase();
  // The security decision is authoritative. Older snapshots may retain a
  // transient "scanning" status even though the final APPROVED verdict was saved.
  const securityStatus = securityDecision === 'APPROVED' && rawSecurityStatus === 'scanning'
    ? 'completed' : rawSecurityStatus;
  const qualificationStatus: DiscoveredToken['qualification_status'] = previousTerminal && !snapshotMayReplaceTerminal
    ? previous!.qualification_status
    : securityDecision === 'APPROVED' ? 'qualified'
      : securityDecision === 'REJECTED' ? 'rejected'
      : securityDecision === 'UNVERIFIED' || ['unverified', 'failed'].includes(securityStatus) ? 'unverified'
      : securityStatus === 'scanning' ? 'under_analysis'
      : previous?.qualification_status || 'newly_detected';
  return {
    mint,
    state_version: Math.max(previousVersion, snapshotVersion),
    scan_attempt: Math.max(
      Number(previous?.scan_attempt || 0),
      Number(snapshot.security?.scan_cache?.scan_attempt ?? snapshot.security?.scan_attempt ?? 0),
    ),
    security_scanned_at: Number.isFinite(incomingSecurityScannedAt) && incomingSecurityScannedAt > 0 ? new Date(incomingSecurityScannedAt).toISOString() : previous?.security_scanned_at,
    name: String(identity.name ?? previous?.name ?? ''),
    symbol: String(identity.symbol ?? previous?.symbol ?? ''),
    metadata_uri: String(identity.metadata_uri ?? previous?.metadata_uri ?? ''),
    // Empty strings from a partial backend snapshot must not erase a logo URL
    // already resolved for this mint. Only replace it when a usable URL exists.
    logo_url: String(
      identity.logo_url || identity.image_url || identity.image_uri || identity.logo_uri || identity.image || previous?.logo_url || ''
    ),
    metadata_status: String(identity.metadata_status ?? previous?.metadata_status ?? ''),
    scan_status: previousTerminal && !snapshotMayReplaceTerminal ? previous?.scan_status : (securityStatus || previous?.scan_status),
    scan_progress: Number(snapshot.security?.progress ?? previous?.scan_progress ?? 0),
    scan_stage: String(snapshot.security?.stage ?? previous?.scan_stage ?? ''),
    lifecycle_status: Number(snapshot.version || 0) >= Number(previous?.lifecycle_version || 0)
      ? String(snapshot.activity?.status ?? previous?.lifecycle_status ?? '')
      : previous?.lifecycle_status,
    lifecycle_label: Number(snapshot.version || 0) >= Number(previous?.lifecycle_version || 0)
      ? String(snapshot.activity?.label ?? previous?.lifecycle_label ?? '')
      : previous?.lifecycle_label,
    lifecycle_stage: Number(snapshot.version || 0) >= Number(previous?.lifecycle_version || 0)
      ? String(snapshot.activity?.stage ?? previous?.lifecycle_stage ?? '')
      : previous?.lifecycle_stage,
    lifecycle_sub_event: Number(snapshot.version || 0) >= Number(previous?.lifecycle_version || 0)
      ? String(snapshot.activity?.sub_event ?? previous?.lifecycle_sub_event ?? '')
      : previous?.lifecycle_sub_event,
    lifecycle_progress: Number(snapshot.version || 0) >= Number(previous?.lifecycle_version || 0)
      ? Number(snapshot.activity?.progress ?? previous?.lifecycle_progress ?? 0)
      : previous?.lifecycle_progress,
    lifecycle_error: Number(snapshot.version || 0) >= Number(previous?.lifecycle_version || 0)
      ? (snapshot.activity?.error ?? previous?.lifecycle_error)
      : previous?.lifecycle_error,
    lifecycle_updated_at: String(snapshot.activity?.updated_at ?? previous?.lifecycle_updated_at ?? ''),
    lifecycle_version: Math.max(Number(previous?.lifecycle_version || 0), Number(snapshot.version || 0)),
    strategy_decision: String(snapshot.activity?.decision ?? previous?.strategy_decision ?? ''),
    strategy_reasons: Array.isArray(snapshot.activity?.reasons)
      ? snapshot.activity.reasons.map(String)
      : previous?.strategy_reasons,
    strategy_evaluated_at: String(snapshot.activity?.evaluated_at ?? previous?.strategy_evaluated_at ?? ''),
    monitoring_status: String(snapshot.market_subscription?.status ?? previous?.monitoring_status ?? ''),
    monitoring_reason: String(snapshot.market_subscription?.reason ?? snapshot.market_subscription?.message ?? previous?.monitoring_reason ?? ''),
    monitoring_updated_at: String(snapshot.market_subscription?.received_at ?? previous?.monitoring_updated_at ?? ''),
    decimals: identity.decimals == null ? previous?.decimals : Number(identity.decimals),
    total_supply_raw: String(identity.total_supply_raw ?? identity.total_supply ?? previous?.total_supply_raw ?? ''),
    creator_wallet: String(identity.creator_address ?? identity.creator_wallet ?? previous?.creator_wallet ?? ''),
    launch_time: String(snapshot.detected_at ?? snapshot.updated_at ?? previous?.launch_time ?? ''),
    current_price_usd: priceUsd,
    current_price_sol: priceSol,
    price_currency: priceSol > 0 ? 'SOL' : 'USD',
    price_change_1m_pct: Number(market.price_change_1m_pct ?? previous?.price_change_1m_pct ?? 0),
    price_change_5m_pct: Number(market.price_change_5m_pct ?? market.price_change_24h_pct ?? previous?.price_change_5m_pct ?? 0),
    market_cap_sol: Number(market.market_cap_sol ?? statistics.market_cap_sol ?? previous?.market_cap_sol ?? 0),
    market_cap_usd: Number(market.market_cap_usd ?? previous?.market_cap_usd ?? 0),
    liquidity_usd: Number(market.liquidity_usd ?? previous?.liquidity_usd ?? 0),
    volume_5m_usd: Number(market.volume_5m_usd ?? statistics.volume_5m_usd ?? previous?.volume_5m_usd ?? 0),
    volume_1h_usd: Number(market.volume_1h_usd ?? statistics.volume_1h_usd ?? previous?.volume_1h_usd ?? 0),
    tx_buys_5m: Number(market.buys_5m ?? statistics.buys_5m ?? previous?.tx_buys_5m ?? 0),
    tx_sells_5m: Number(market.sells_5m ?? statistics.sells_5m ?? previous?.tx_sells_5m ?? 0),
    bonding_curve_progress_pct: Number(market.bonding_curve_pct ?? statistics.bonding_curve_pct ?? previous?.bonding_curve_progress_pct ?? 0),
    venue: venueValue.includes('raydium') ? 'raydium' : venueValue.includes('swap') ? 'pumpswap' : 'pump.fun',
    safety_status: snapshot.security?.decision === 'APPROVED' ? 'verified' : previous?.safety_status || 'warning',
    qualification_status: qualificationStatus,
    diagnostics: (() => {
      const incoming = Array.isArray(snapshot.diagnostics) ? snapshot.diagnostics : [];
      const combined = [...(previous?.diagnostics || [])];
      for (const diagnostic of incoming) {
        const duplicate = combined.some((item) =>
          item.stage === diagnostic.stage && item.message === diagnostic.message &&
          item.occurred_at === diagnostic.occurred_at
        );
        if (!duplicate) combined.push(diagnostic);
      }
      return combined.slice(-50);
    })(),
    safety_details: mergeCachedReport(
      { ...defaultSafetyDetails, ...(previous?.safety_details || {}) },
      snapshot.security || {},
    ) as DiscoveredToken['safety_details'],
    price_history_5m: priceHistory.length ? priceHistory.slice(-500) : previous?.price_history_5m || [],
  };
}

function mapDashboardSummary(profile: NodeXProfileSnapshot | null, positions: Position[] = []): DashboardSummary {
  const portfolio = (profile?.portfolio || {}) as Record<string, any>;
  const n = (...values: unknown[]) => {
    for (const value of values) {
      const parsed = Number(value);
      if (value !== null && value !== undefined && Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };
  const openPositions = positions.filter((position) => position.status === 'OPEN');
  const investedUsd = n(portfolio.total_invested_usd, portfolio.invested_capital_usd, portfolio.total_cost_basis_usd);
  const unrealizedUsd = n(portfolio.total_unrealized_pnl_usd, portfolio.total_unrealised_pnl_usd, portfolio.unrealized_pnl_usd, portfolio.unrealised_pnl_usd);
  const realizedUsd = n(portfolio.realized_pnl_usd, portfolio.realised_pnl_usd);
  const totalUsd = n(portfolio.total_portfolio_value_usd, portfolio.portfolio_balance_usd, portfolio.total_value_usd, portfolio.portfolio_value_usd, portfolio.current_value_usd);
  const totalSol = n(portfolio.total_portfolio_value_sol, portfolio.portfolio_balance_sol, portfolio.total_value_sol, portfolio.portfolio_value_sol, portfolio.current_value_sol);
  return {
    ...emptySummary,
    total_portfolio_value_usd: totalUsd,
    total_portfolio_value_sol: totalSol,
    total_invested_capital_usd: investedUsd,
    open_positions_count: n(portfolio.position_count, openPositions.length),
    realised_pnl_usd: realizedUsd,
    realised_pnl_pct: n(portfolio.realized_pnl_pct, portfolio.realised_pnl_pct),
    unrealised_pnl_usd: unrealizedUsd,
    unrealised_pnl_pct: n(portfolio.unrealized_pnl_pct, portfolio.unrealised_pnl_pct),
    total_pnl_usd: n(portfolio.total_pnl_usd, realizedUsd + unrealizedUsd),
    total_pnl_pct: n(portfolio.total_pnl_pct),
    win_rate_pct: n(portfolio.win_rate_pct),
    completed_trades_count: n(portfolio.completed_trades_count, portfolio.closed_positions_count),
    sol_price_usd: n(portfolio.sol_price_usd, (profile?.wallet as any)?.sol_price_usd),
  };
}

export const TerminalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(emptyStatus);
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [positions, setPositions] = useState<Position[]>([]);
  const [tokens, setTokens] = useState<DiscoveredToken[]>([]);
  const latestTokensRef = useRef<DiscoveredToken[]>([]);
  latestTokensRef.current = tokens;
  const [launches, setLaunches] = useState<TokenLaunchRecord[]>([]);
  const [paperWallet, setPaperWallet] = useState<PaperWalletSnapshot | null>(null);
  const [profile, setProfile] = useState<NodeXProfileSnapshot | null>(null);
  const [events, setEvents] = useState<NodeXEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<NodeXEvent | null>(null);
  const [selectedToken, setSelectedToken] = useState<DiscoveredToken | null>(null);
  const [strategyConfig, setStrategyConfig] = useState<StrategyConfig>(emptyStrategy);
  const [strategyDecisions, setStrategyDecisions] = useState<StrategyDecision[]>([]);
  const [settings, setSettings] = useState<ApiSettings>(apiClient.getSettings());
  const [isStreamPaused, setIsStreamPaused] = useState(false);
  const [isMobilePreview, setIsMobilePreview] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const lifecycleCacheSignatures = useRef<Map<string, string>>(new Map());
  // Once a complete backend snapshot is received, it becomes the allowlist for
  // cache restoration. This also protects against an IndexedDB read finishing late.
  const authoritativeTokenMints = useRef<Set<string> | null>(null);
  const backendTokenSnapshotReceived = useRef(false);
  // TokenCare logo recovery is deliberately decoupled from individual WebSocket
  // events. New missing-logo tokens are grouped and only flushed after stream
  // silence, or immediately when the hard 100-token group limit is reached.
  const tokenLogoQueue = useRef<Map<string, DiscoveredToken>>(new Map());
  const tokenLogoSeen = useRef<Set<string>>(new Set());
  const tokenLogoTimer = useRef<number | null>(null);
  const tokenLogoBatchRunning = useRef(false);
  const tokenCareMissingKeyLogged = useRef(false);

  // Restore durable backend activity on every app start. Live WebSocket events
  // are merged afterward so a delayed history response cannot overwrite newer data.
  useEffect(() => {
    let active = true;
    apiClient.getEngineActivityLogs(500).then((records) => {
      if (!active || !Array.isArray(records)) return;
      const restored = records.flatMap((record) => {
        const activity = record.activity || {};
        const isEngineLifecycleEvent =
          activity.direction === 'event' &&
          activity.provider === 'engine' &&
          typeof activity.operation === 'string';
        if (!isEngineLifecycleEvent) {
          const severity = String(activity.severity || '').toLowerCase();
          const httpStatus = Number(activity.http_status || 0);
          const hasError = typeof activity.error === 'string' && activity.error.length > 0;
          // Older database rows include successful provider calls from before
          // the backend noise filter. Do not refill the Event Monitor with them.
          if (!['error', 'warning'].includes(severity) && httpStatus < 400 && !hasError) {
            return [];
          }
        }
        const raw = isEngineLifecycleEvent
          ? {
              type: activity.operation,
              event_id: `backend-history-${record.id}`,
              timestamp: activity.timestamp || record.recorded_at,
              data: activity.event || activity,
            }
          : {
              type: 'engine_activity',
              event_id: `backend-history-${record.id}`,
              timestamp: activity.timestamp || record.recorded_at,
              data: activity,
            };
        return [normalizeBackendEvent(raw, record.recorded_at)];
      });

      setEvents((current) => {
        const merged = new Map<string, NodeXEvent>();
        for (const event of restored) merged.set(event.event_id, event);
        // Current-session events take precedence over their older persisted copy.
        for (const event of current) merged.set(event.event_id, event);
        return Array.from(merged.values())
          .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
          .slice(0, 500);
      });
    }).catch((error) => {
      console.warn('NodeX backend event history restore failed:', error);
    });
    return () => { active = false; };
  }, []);

  // Restore stable lifecycle/security records from IndexedDB. Market ticks are
  // deliberately excluded from this cache and are always refreshed by the backend.
  useEffect(() => {
    let active = true;
    void loadTokenLifecycleCache().then((records) => {
      if (!active || !records.length) return;
      setTokens((current) => {
        const byMint = new Map(current.map((token) => [token.mint, token]));
        for (const record of records) {
          if (!record.token?.mint) continue;
          if (backendTokenSnapshotReceived.current) continue;
          if (authoritativeTokenMints.current && !authoritativeTokenMints.current.has(record.mint)) continue;
          // Once a complete backend snapshot is known, IndexedDB must never
          // overwrite that authoritative token state.
          if (authoritativeTokenMints.current) continue;
          const cached = record.token;
          lifecycleCacheSignatures.current.set(record.mint, lifecycleCacheSignature(cached));
          const existing = byMint.get(record.mint);
          if (!existing) {
            byMint.set(record.mint, cached);
            continue;
          }
          const currentVersion = Number(existing.state_version || 0);
          const cachedVersion = Number(record.state_version || cached.state_version || 0);
          const existingTerminal = ['qualified', 'rejected', 'unverified', 'bought_paper'].includes(String(existing.qualification_status));
          if (cachedVersion > currentVersion || (!existingTerminal && ['qualified', 'rejected', 'unverified', 'bought_paper'].includes(String(cached.qualification_status)))) {
            byMint.set(record.mint, {
              ...existing,
              ...cached,
              current_price_usd: existing.current_price_usd,
              current_price_sol: existing.current_price_sol,
              price_history_5m: existing.price_history_5m || [],
            });
          }
        }
        return Array.from(byMint.values());
      });
    }).catch((error) => console.warn('NodeX lifecycle cache restore failed:', error));
    return () => { active = false; };
  }, []);


  // Recover missing logos in grouped requests rather than reacting to every
  // token event. The published TokenCare API documents one address per POST,
  // so each group is processed with bounded concurrency using that exact schema.
  useEffect(() => {
    const apiKey = String(settings.tokenCareApiKey || '').trim();
    if (!apiKey) {
      if (tokenLogoTimer.current !== null) window.clearTimeout(tokenLogoTimer.current);
      tokenLogoTimer.current = null;
      tokenLogoQueue.current.clear();
      if (tokens.some((token) => token.mint && !token.logo_url) && !tokenCareMissingKeyLogged.current) {
        tokenCareMissingKeyLogged.current = true;
        recordRequest({
          action: 'TokenCare logo recovery not sent - API key missing',
          at: new Date().toISOString(),
          ok: false,
          error: 'No HTTP request was sent. Add and save the TokenCare API key in Settings / API & Connections.',
          request: { queued_tokens: tokens.filter((token) => token.mint && !token.logo_url).length },
          response: { skipped: true, reason: 'api_key_missing' },
        });
      }
      return;
    }
    tokenCareMissingKeyLogged.current = false;

    let added = false;
    for (const token of tokens) {
      if (!token.mint || token.logo_url || tokenLogoSeen.current.has(token.mint)) continue;
      tokenLogoSeen.current.add(token.mint);
      tokenLogoQueue.current.set(token.mint, token);
      added = true;
    }
    if (!added && tokenLogoQueue.current.size === 0) return;

    const flushLogoGroup = async (): Promise<void> => {
      if (tokenLogoBatchRunning.current) return;
      tokenLogoBatchRunning.current = true;
      if (tokenLogoTimer.current !== null) {
        window.clearTimeout(tokenLogoTimer.current);
        tokenLogoTimer.current = null;
      }
      const batch = Array.from(tokenLogoQueue.current.values()).slice(0, 100)
        .map((queued) => latestTokensRef.current.find((current) => current.mint === queued.mint) || queued)
        .filter((token) => !token.logo_url);
      for (const token of Array.from(tokenLogoQueue.current.values()).slice(0, 100)) tokenLogoQueue.current.delete(token.mint);
      try {
        const results = await recoverTokenLogoGroup(batch, apiKey);
        const recovered = new Map(results.filter((item) => item.logoUrl).map((item) => [item.mint, item.logoUrl as string]));
        if (recovered.size) {
          setTokens((current) => current.map((token) => {
            const logoUrl = recovered.get(token.mint);
            return logoUrl ? { ...token, logo_url: logoUrl, metadata_status: 'logo_recovered' } : token;
          }));
          setSelectedToken((current) => {
            if (!current) return current;
            const logoUrl = recovered.get(current.mint);
            return logoUrl ? { ...current, logo_url: logoUrl, metadata_status: 'logo_recovered' } : current;
          });
        }
      } catch (error) {
        console.warn('TokenCare logo recovery group failed:', error);
      } finally {
        tokenLogoBatchRunning.current = false;
        if (tokenLogoQueue.current.size >= 100) {
          void flushLogoGroup();
        } else if (tokenLogoQueue.current.size > 0 && tokenLogoTimer.current === null) {
          tokenLogoTimer.current = window.setTimeout(() => {
            tokenLogoTimer.current = null;
            void flushLogoGroup();
          }, 3000);
        }
      }
    };

    // 100 is a hard cap and flushes even during continuous discovery.
    if (tokenLogoQueue.current.size >= 100) {
      void flushLogoGroup();
      return;
    }
    // Smaller groups (including 50+) wait for 3 seconds without new tokens.
    // The timer is reset only by new missing-logo tokens, not market-price ticks.
    if (tokenLogoTimer.current !== null) window.clearTimeout(tokenLogoTimer.current);
    tokenLogoTimer.current = window.setTimeout(() => {
      tokenLogoTimer.current = null;
      void flushLogoGroup();
    }, 3000);
  }, [tokens, settings.tokenCareApiKey]);

  useEffect(() => () => {
    if (tokenLogoTimer.current !== null) window.clearTimeout(tokenLogoTimer.current);
  }, []);

  // Only persist when identity, scan, security, or monitoring state changes.
  // Price/statistics updates therefore do not generate IndexedDB writes.
  useEffect(() => {
    for (const token of tokens) {
      const signature = lifecycleCacheSignature(token);
      if (lifecycleCacheSignatures.current.get(token.mint) === signature) continue;
      lifecycleCacheSignatures.current.set(token.mint, signature);
      void saveTokenLifecycleCache(token).catch((error) => console.warn('NodeX lifecycle cache write failed:', error));
    }
  }, [tokens]);

  // The backend SQLite config is authoritative. Load it whenever the operator
  // connects or changes the backend URL; do not rely on browser-only defaults.
  useEffect(() => {
    if (!settings.backendUrl) return;
    let active = true;
    apiClient.getStrategy()
      .then(({ config }) => {
        if (active) setStrategyConfig({ ...emptyStrategy, ...config });
      })
      .catch((error) => {
        if (active) setBackendError(error instanceof Error ? error.message : 'Could not load backend trading configuration.');
      });
    return () => { active = false; };
  }, [settings.backendUrl]);

  // Token metadata is backend-owned. The frontend must never request a refresh
  // merely because a token has no logo_url; if the backend has no logo URL,
  // keep the neutral avatar and wait for backend-supplied metadata.


  useEffect(() => {
    let active = true;
    // Raw Solana notifications are backend-internal and are deliberately not
    // restored into the browser event feed. The feed is driven by curated live
    // application events only.

    backendService.loadInitialData().then((snapshot) => {
      if (!active) return;
      if (snapshot.profile) {
        if (Array.isArray(snapshot.profile.tokens)) {
          backendTokenSnapshotReceived.current = true;
          const restoredSnapshots = snapshot.profile.tokens;
          const isComplete = snapshot.profile.token_snapshot_complete === true;
          if (isComplete) {
            const keepMints = restoredSnapshots
              .map((item) => String(item?.mint_address || item?.mint || ''))
              .filter(Boolean);
            authoritativeTokenMints.current = new Set(keepMints);
            void pruneTokenLifecycleCache(keepMints).catch((error) =>
              console.warn('NodeX stale token cache pruning failed:', error)
            );
            setSelectedToken((current) => current && !authoritativeTokenMints.current?.has(current.mint) ? null : current);
          }
          setTokens((previous) => reconcileTokenSnapshots(
            restoredSnapshots,
            previous,
            isComplete,
          ));
        }
        const runtime = engineEventStore.hydrate(snapshot.profile);
        setProfile(runtime.profile);
        setPaperWallet(runtime.profile?.paper_wallet ?? snapshot.paperWallet ?? null);
        const mappedPositions = runtime.positions.map((item) => mapBackendPosition(item)).filter((item): item is Position => item !== null);
        setPositions(mappedPositions);
        setSummary(mapDashboardSummary(runtime.profile, mappedPositions));
      }
      if (snapshot.paperWallet) setPaperWallet(snapshot.paperWallet);
      if (snapshot.launches) setLaunches(snapshot.launches);
      if (snapshot.engineStatus) {
        setEngineStatus((previous) => ({ ...previous, ...snapshot.engineStatus!, ws_status: wsService.getStatus().status }));
        setIsStreamPaused(snapshot.engineStatus.strategy_paused);
      }
      if (snapshot.strategy) {
        setStrategyConfig(snapshot.strategy.config);
        setStrategyDecisions(snapshot.strategy.decisions);
      }
      setBackendError(snapshot.errors[0] || null);
    }).catch((error: unknown) => {
      if (active) setBackendError(error instanceof Error ? error.message : 'Could not load initial backend data.');
    }).finally(() => {
      if (active) wsService.connect();
    });
    let skipFirstConnectedReconcile = true;
    const reconcileAfterReconnect = async () => {
      try {
        const recovered = await backendService.loadInitialData();
        if (!active) return;
        if (recovered.profile) {
          const recoveredTokens = (recovered.profile as { tokens?: unknown[] }).tokens;
          if (Array.isArray(recoveredTokens)) {
            backendTokenSnapshotReceived.current = true;
            const isComplete = (recovered.profile as { token_snapshot_complete?: boolean }).token_snapshot_complete === true;
            if (isComplete) {
              const keepMints = recoveredTokens
                .map((item: any) => String(item?.mint_address || item?.mint || ''))
                .filter(Boolean);
              authoritativeTokenMints.current = new Set(keepMints);
              void pruneTokenLifecycleCache(keepMints).catch((error) =>
                console.warn('NodeX stale token cache pruning failed after reconnect:', error)
              );
              setSelectedToken((current) => current && !authoritativeTokenMints.current?.has(current.mint) ? null : current);
            }
            setTokens((previous) => reconcileTokenSnapshots(
              recoveredTokens,
              previous,
              isComplete,
            ));
          }
          const runtime = engineEventStore.hydrate(recovered.profile);
          setProfile(runtime.profile);
          setPaperWallet(runtime.profile?.paper_wallet ?? recovered.paperWallet ?? null);
          const mappedPositions = runtime.positions.map((item) => mapBackendPosition(item)).filter((item): item is Position => item !== null);
          setPositions(mappedPositions);
          setSummary(mapDashboardSummary(runtime.profile, mappedPositions));
        }
        if (recovered.launches) setLaunches(recovered.launches);
        if (recovered.engineStatus) {
          setEngineStatus((previous) => ({ ...previous, ...recovered.engineStatus!, ws_status: 'connected' }));
          setIsStreamPaused(recovered.engineStatus.strategy_paused);
        }
      } catch (error) {
        if (active) console.warn('NodeX reconnect snapshot reconciliation failed:', error);
      }
    };
    const unsubscribeStatus = wsService.onStatusChange((status: ConnectionStatus) => {
      setEngineStatus((previous) => ({ ...previous, ws_status: status }));
      if (status === 'connected') {
        if (skipFirstConnectedReconcile) {
          skipFirstConnectedReconcile = false;
        } else {
          void reconcileAfterReconnect();
        }
      }
    });
    const unsubscribeEvents = wsService.subscribe((event) => {
      if ([
        'profile_updated', 'position_updated', 'trade_opened', 'trade_closed',
        'paper_buy_executed', 'paper_sell_executed', 'portfolio_summary_updated',
        'portfolio_updated', 'wallet_updated', 'wallet_balance_updated', 'balance_updated',
        'market_tick', 'market_price_update', 'token_market_update',
      ].includes(event.event_type)) {
        const previousRuntime = engineEventStore.getSnapshot();
        const runtime = engineEventStore.apply(event);
        if (runtime !== previousRuntime) {
          if (runtime.profile) {
            setProfile(runtime.profile);
            if (runtime.profile.paper_wallet) setPaperWallet(runtime.profile.paper_wallet);
          }
          const mappedPositions = runtime.positions.map((item) => mapBackendPosition(item)).filter((item): item is Position => item !== null);
          setPositions(mappedPositions);
          setSummary(mapDashboardSummary(runtime.profile, mappedPositions));
        }
      }
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
          return [...byMint.values()];
        });
        return;
      }
      if (event.event_type === 'token_state_updated') {
        // SQLite-backed state events carry the TokenState envelope with the
        // canonical token fields nested under data. Flatten it before mapping.
        const stateData = event.data?.data && typeof event.data.data === 'object'
          ? {
              ...event.data,
              ...event.data.data,
              mint_address: event.data.mint_address || event.data.data.mint_address,
            }
          : event.data;
        const mint = String(stateData?.mint_address || stateData?.mint || '');
        if (mint) {
          setTokens((previous) => {
            const index = previous.findIndex((token) => token.mint === mint);
            const existing = index >= 0 ? previous[index] : undefined;
            const incomingVersion = Number(stateData.version ?? stateData.state_version ?? 0);
            if (existing && incomingVersion > 0 && Number(existing.state_version || 0) > incomingVersion) {
              return previous;
            }
            const durable = mapTokenDetailSnapshot(stateData, existing);
            if (!durable) return previous;
            if (index >= 0) {
              const updated = previous.slice();
              updated[index] = durable;
              return updated;
            }
            return [durable, ...previous];
          });
          setSelectedToken((previous) => {
            if (!previous || previous.mint !== mint) return previous;
            const incomingVersion = Number(stateData.version ?? stateData.state_version ?? 0);
            if (incomingVersion > 0 && Number(previous.state_version || 0) > incomingVersion) return previous;
            return mapTokenDetailSnapshot(stateData, previous) || previous;
          });
        }
      }
      if (event.event_type === 'chart_candle_update' || event.event_type === 'chart_candle_closed') {
        const mint = String(event.data?.mint_address || '');
        const candle = event.data?.candle || event.data;
        const rawTime = candle.time ?? candle.timestamp ?? candle.open_time ?? candle.start_time;
        const parsedTime = typeof rawTime === 'number' ? (rawTime < 10_000_000_000 ? rawTime * 1000 : rawTime) : Date.parse(String(rawTime || ''));
        const point = {
          time: Number.isFinite(parsedTime) ? parsedTime : Date.now(),
          price: Number(candle.close ?? candle.close_price ?? candle.price ?? 0),
          open: Number(candle.open ?? candle.open_price ?? candle.close ?? 0),
          high: Number(candle.high ?? candle.high_price ?? candle.close ?? 0),
          low: Number(candle.low ?? candle.low_price ?? candle.close ?? 0),
          volume: Number(candle.volume ?? candle.volume_sol ?? 0),
        };
        if (mint && point.price > 0) {
          const append = (token: DiscoveredToken) => ({
            ...token,
            price_history_5m: [...(token.price_history_5m || []).filter((item) => item.time !== point.time), point].slice(-500),
          });
          setTokens((previous) => previous.map((token) => token.mint === mint ? append(token) : token));
          setSelectedToken((previous) => previous?.mint === mint ? append(previous) : previous);
        }
      }
      if (event.event_type === 'token_removed') {
        const mint = String(event.data?.mint_address || '');
        if (mint) {
          setTokens((previous) => previous.filter((token) => token.mint !== mint));
          setLaunches((previous) => previous.filter((launch) => launch.mint_address !== mint));
        }
      }
       if (event.event_type === 'token_detail_snapshot') {
        const snapshot = event.data?.snapshot as Record<string, any> | undefined;
        if (snapshot) {
          const mint = String(event.data?.mint_address || snapshot.mint_address || '');
          setTokens((previous) => {
            const mapped = mapTokenDetailSnapshot(snapshot, previous.find((token) => token.mint === mint));
            return mapped ? [mapped, ...previous.filter((token) => token.mint !== mapped.mint)] : previous;
          });
          setSelectedToken((previous) => {
            if (!previous || previous.mint !== mint) return previous;
            return mapTokenDetailSnapshot(snapshot, previous) || previous;
          });
        }
      } else if (event.event_type === 'chart_history_snapshot') {
        const mint = String(event.data?.mint_address || '');
        const candles = Array.isArray(event.data?.candles) ? event.data.candles : [];
        const history = candles.map((candle: Record<string, any>) => ({
          time: (() => { const rawTime = candle.time ?? candle.timestamp ?? Date.now(); const value = Number(rawTime); return Number.isFinite(value) && value < 10_000_000_000 ? value * 1000 : value; })(),
          price: Number(candle.close ?? candle.close_price ?? candle.price ?? 0),
          open: Number(candle.open ?? candle.open_price ?? candle.close ?? 0),
          high: Number(candle.high ?? candle.high_price ?? candle.close ?? 0),
          low: Number(candle.low ?? candle.low_price ?? candle.close ?? 0),
          volume: Number(candle.volume ?? candle.volume_sol ?? 0),
        })).filter((point: { price: number }) => point.price > 0);
        if (mint && history.length) {
          setTokens((previous) => previous.map((token) => token.mint === mint ? { ...token, price_history_5m: history.slice(-500) } : token));
          setSelectedToken((previous) => previous?.mint === mint ? { ...previous, price_history_5m: history.slice(-500) } : previous);
        }
      }
      const tokenMint = event.token_mint || event.data?.mint_address || event.data?.token_mint || event.data?.base_mint;
      const tokenStateEvent = [
        'launch_detected', 'token_scan_retry_scheduled', 'token_scan_started', 'token_scan_update', 'token_scan_progress', 'token_scan_completed', 'token_scan_failed', 'token_diagnostic', 'token_metadata_started', 'token_metadata_failed',
        'market_price_update', 'market_tick', 'token_market_update', 'token_statistics_update', 'market_curve_completed',
        'token_monitoring_started', 'token_monitoring_update', 'token_monitoring_completed',
        'market_subscription_requested', 'market_subscription_subscribed', 'market_subscription_active', 'market_subscription_waiting', 'market_subscription_failed', 'market_subscriptions_removed',
        'paper_buy_started', 'paper_buy_executed', 'paper_buy_failed', 'paper_sell_executed', 'paper_sell_failed', 'position_updated',
        'paper_entry_evaluation',
        'strategy_rejected_token', 'token_metadata_updated', 'price_updated', 'liquidity_updated',
      ].includes(event.event_type);
      if (event.event_type !== 'token_state_updated' && tokenMint && tokenStateEvent) {
        setTokens((previous) => {
          const mint = String(tokenMint || '');
          const index = previous.findIndex((item) => item.mint === mint);
          const merged = mergeTokenEvent(index >= 0 ? previous[index] : undefined, event);
          if (!merged) return previous;
          // Price ticks update an existing row in place; they must not reorder the
          // entire discovery list on every market event.
          if (index >= 0 && ['market_tick', 'market_price_update', 'token_market_update'].includes(event.event_type)) {
            const updated = previous.slice();
            updated[index] = merged;
            return updated;
          }
          return [merged, ...previous.filter((item) => item.mint !== merged.mint)];
        });
        setSelectedToken((previous) => previous && previous.mint === String(tokenMint || '')
          ? (mergeTokenEvent(previous, event) || previous) : previous);
      }
      const isHighFrequencyMarketEvent = ['market_tick', 'market_price_update', 'token_market_update', 'token_statistics_update', 'chart_candle_update', 'chart_candle_closed', 'pumpswap_activity', 'pumpswap_volume_update', 'market_account_update'].includes(event.event_type);
      if (!isHighFrequencyMarketEvent) setEvents((previous) => {
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
            return [updated, ...previous.filter((_, index) => index !== duplicateIndex)].slice(0, 500);
          }
        }
        return [event, ...previous].slice(0, 500);
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




  // Discovery records, scan diagnostics and transient events intentionally stay in
  // memory. Avoid serializing large live snapshots to localStorage on every stream
  // update; durable wallet and position state is loaded from the backend instead.

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
    lifecycleCacheSignatures.current.clear();
    void clearTokenLifecycleCache().catch((error) => console.warn('NodeX lifecycle cache clear failed:', error));
    setSelectedEvent(null);
    setSelectedToken(null);
    setBackendError(null);
  };
  const removeTokensByMint = (mints: string[]) => {
    if (!mints.length) return;
    const removed = new Set(mints);
    setTokens((current) => current.filter((token) => !removed.has(token.mint)));
    setLaunches((current) => current.filter((launch) => !removed.has(launch.mint_address)));
    setSelectedToken((current) => current && removed.has(current.mint) ? null : current);
  };
  const closePosition = () => setBackendError('Paper position closing is unavailable: no backend paper-order endpoint exists yet.');
  const executeManualPaperBuy = () => setBackendError('Paper buying is disabled until a real backend paper-order endpoint is implemented.');
  const updatePositionRisk = async (positionId: string, sl: number, tp: number): Promise<boolean> => {
    try {
      const result = await apiClient.updatePositionRisk(positionId, sl, tp);
      const mapped = mapBackendPosition(result.position);
      if (!mapped) throw new Error('Backend saved the risk policy but returned an invalid position snapshot.');
      setPositions((current) => current.map((position) => position.id === positionId ? mapped : position));
      setBackendError(null);
      return true;
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : 'Could not update this position risk policy.');
      return false;
    }
  };
  const saveStrategyConfig = async (config: StrategyConfig): Promise<boolean> => {
    try {
      const result = await apiClient.updateStrategy(config);
      setStrategyConfig(result.config);
      setBackendError(null);
      return true;
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : 'Could not save trading configuration.');
      return false;
    }
  };
  const setPaperExecutionEnabled = async (enabled: boolean): Promise<boolean> => {
    try {
      const result = await apiClient.updatePaperExecution(enabled);
      setStrategyConfig(result.config);
      setBackendError(null);
      return true;
    } catch (error) {
      setBackendError(error instanceof Error ? error.message : 'Could not update paper execution.');
      return false;
    }
  };
  const updateSettings = (newSettings: Partial<ApiSettings>) => {
    const updated = apiClient.saveSettings(newSettings);
    setSettings(updated);
    wsService.disconnect();
    wsService.connect();
    setBackendError(null);
  };
  // Persist connection-field edits immediately without reconnecting the live
  // stream on every keystroke. Attach performs the verified reconnect.
  const updateConnectionDraft = (newSettings: Partial<ApiSettings>) => {
    const updated = apiClient.saveSettings(newSettings);
    setSettings(updated);
    setBackendError(null);
  };
  const openTokenDetailByMint = (mint: string, fallback: Partial<DiscoveredToken> = {}) => {
    // Detailed token views are reserved for active paper positions. Detection
    // cards remain identity-only and cannot trigger token-detail subscriptions.
    if (!positions.some((position) => position.mint === mint)) {
      setSelectedToken(null);
      return;
    }
    const existing = tokens.find((item) => item.mint === mint);
    if (existing) {
      setSelectedToken(existing);
      setBackendError(null);
      // Fetch the durable backend snapshot as soon as the detail view opens.
      // This includes security evidence and diagnostics not present in the feed row.
      void loadTokenSnapshot(mint);
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
      mint_authority: 'unknown' as const,
      freeze_authority: 'unknown' as const,
      top_10_holders_pct: 0,
      liquidity_locked: false,
      liquidity_locked_pct: 0,
      honeypot_risk: 'unknown' as const,
      dev_holding_pct: 0,
      dev_sold_all: false,
      bundled_snipers_detected: false,
      risk_flags: [],
      safety_score: 0,
      holders_count: 0,
      creator_reputation: 'unknown' as const,
      largest_holders: [],
      ...(fallback.safety_details || metadata.safety_details || {}),
    };
    const detailToken: DiscoveredToken = {
      mint,
      name: String(fallback.name || metadata.name || metadata.token_name || ''),
      symbol: String(fallback.symbol || metadata.symbol || metadata.token_symbol || ''),
      creator_wallet: String(fallback.creator_wallet || metadata.creator_wallet || metadata.creator_address || launch?.creator_address || ''),
      launch_time: String(fallback.launch_time || launch?.detected_at || relatedEvent?.timestamp || ''),
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
      qualification_status: fallback.qualification_status || 'newly_detected',
      safety_details: safetyDetails,
      price_history_5m: fallback.price_history_5m || [],
    };
    setSelectedToken(detailToken);
    setBackendError(null);
    // Detected tokens may not yet be in the frontend cache. Fetch their
    // canonical backend state without blocking navigation to the detail view.
    void loadTokenSnapshot(mint);
  };
  const loadTokenSnapshot = useCallback(async (mint: string) => {
    if (!positions.some((position) => position.mint === mint)) return;
    try {
      const snapshot = await apiClient.getTokenState(mint);
      const mapped = mapTokenDetailSnapshot(snapshot);
      if (!mapped) return;
      setTokens((previous) => [mapped, ...previous.filter((token) => token.mint !== mapped.mint)]);
      setSelectedToken((previous) => previous?.mint === mint ? mapTokenDetailSnapshot(snapshot, previous) || previous : previous);
      setBackendError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A token that has not passed backend approval has no detail snapshot yet.
      if (!message.includes('404')) setBackendError(message);
    }
  }, [positions]);
  const refreshBackendState = useCallback(async () => {
    if (!settings.backendUrl) {
      throw new Error('Connect to the NodeX backend before refreshing.');
    }

    const results = await Promise.allSettled([
      backendService.loadInitialData(),
      apiClient.getRecentTokens(500),
      apiClient.getEngineStatus(),
      apiClient.getStrategy(),
    ]);

    const [snapshotResult, launchesResult, statusResult, strategyResult] = results;
    if (snapshotResult.status === 'rejected') throw snapshotResult.reason;

    const snapshot = snapshotResult.value;
    if (snapshot.profile) {
      const profileTokens = snapshot.profile.tokens;
      if (Array.isArray(profileTokens)) {
        backendTokenSnapshotReceived.current = true;
        const complete = snapshot.profile.token_snapshot_complete === true;
        if (complete) {
          const keepMints = profileTokens
            .map((item) => String(item?.mint_address || item?.mint || ''))
            .filter(Boolean);
          authoritativeTokenMints.current = new Set(keepMints);
          void pruneTokenLifecycleCache(keepMints).catch((error) =>
            console.warn('NodeX stale token cache pruning failed during manual refresh:', error)
          );
          setSelectedToken((current) => current && !authoritativeTokenMints.current?.has(current.mint) ? null : current);
        }
        setTokens((previous) => reconcileTokenSnapshots(profileTokens, previous, complete));
      }
      const runtime = engineEventStore.hydrate(snapshot.profile);
      setProfile(runtime.profile);
      setPaperWallet(runtime.profile?.paper_wallet ?? snapshot.paperWallet ?? null);
      const mappedPositions = runtime.positions
        .map((item) => mapBackendPosition(item))
        .filter((item): item is Position => item !== null);
      setPositions(mappedPositions);
      setSummary(mapDashboardSummary(runtime.profile, mappedPositions));
    }
    if (snapshot.paperWallet) setPaperWallet(snapshot.paperWallet);

    if (launchesResult.status === 'fulfilled' && Array.isArray(launchesResult.value)) {
      setLaunches(launchesResult.value);
    }
    if (statusResult.status === 'fulfilled') {
      setEngineStatus((previous) => ({
        ...previous,
        ...statusResult.value,
        ws_status: wsService.getStatus().status,
      }));
      setIsStreamPaused(Boolean(statusResult.value.strategy_paused));
    }
    if (strategyResult.status === 'fulfilled') {
      setStrategyConfig({ ...emptyStrategy, ...strategyResult.value.config });
      setStrategyDecisions(strategyResult.value.decisions || []);
    }

    const optionalErrors = results.slice(1)
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason instanceof Error ? result.reason.message : String(result.reason));
    setBackendError(optionalErrors.length ? optionalErrors.join(' · ') : snapshot.errors[0] || null);
  }, [settings.backendUrl]);

  const closeTokenDetail = () => setSelectedToken(null);
  const navigateToTab = (tab: NavigationTab) => { setSelectedToken(null); setActiveTab(tab); };

  return (
    <TerminalContext.Provider value={{
      activeTab, setActiveTab: navigateToTab, engineStatus, summary, positions, tokens,
      events, launches, paperWallet, profile, selectedEvent, setSelectedEvent, selectedToken, setSelectedToken,
      openTokenDetailByMint, loadTokenSnapshot, closeTokenDetail, strategyConfig, strategyDecisions,
      settings, isStreamPaused, toggleStreamPause, clearEvents, clearBrowserHistory, removeTokensByMint, toggleEngine,
      toggleStrategy, closePosition, executeManualPaperBuy, updatePositionRisk,
      saveStrategyConfig, setPaperExecutionEnabled, updateSettings, updateConnectionDraft, isMobilePreview, setIsMobilePreview, backendError, refreshBackendState,
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

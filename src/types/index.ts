/**
 * NodeX Institutional Solana Trading & Monitoring Terminal
 * Data Types & Schema Definitions
 */

export type OperatingMode = 'PAPER' | 'LIVE';
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';
export type Venue = 'pump.fun' | 'pumpswap' | 'raydium';
export type PositionStatus = 'OPEN' | 'CLOSED_PROFIT' | 'CLOSED_LOSS' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP';
export type SafetyRating = 'verified' | 'warning' | 'danger';
export type QualificationStatus = 'newly_detected' | 'under_analysis' | 'qualified' | 'rejected' | 'unverified' | 'bought_paper';

export interface PaperWalletSnapshot {
  starting_balance_lamports: number;
  available_balance_lamports: number;
  invested_balance_lamports: number;
  locked_rent_lamports: number;
  total_network_fees_lamports: number;
  total_priority_fees_lamports: number;
  total_swap_fees_lamports: number;
  total_rent_refunded_lamports: number;
  rent_by_token_account?: Record<string, number>;
}

export interface TokenLaunchRecord {
  id: string;
  mint_address: string;
  creator_address: string | null;
  source: string;
  signature: string;
  slot: number;
  detected_at: string;
}

export interface EngineStatus {
  running: boolean;
  operating_mode: OperatingMode;
  network: 'mainnet-beta' | 'devnet';
  solana_connected: boolean;
  pumpswap_connected?: boolean;
  pumpswap_reconnection_count?: number;
  pumpswap_last_error?: string;
  solana_last_error?: string;
  solana_last_message_at?: string;
  rpc_endpoint: string;
  rpc_latency_ms: number;
  ws_status: ConnectionStatus;
  ws_endpoint: string;
  provider_name: string;
  last_heartbeat: string;
  incoming_event_rate: number; // events/sec
  reconnection_count: number;
  database_status: 'healthy' | 'degraded' | 'offline' | 'unknown';
  tokens_detected_today: number;
  simulated_buys_count: number;
  simulated_sells_count: number;
  strategy_paused: boolean;
}

export interface DashboardSummary {
  total_portfolio_value_usd: number;
  total_portfolio_value_sol: number;
  total_invested_capital_usd: number;
  open_positions_count: number;
  realised_pnl_usd: number;
  realised_pnl_pct: number;
  unrealised_pnl_usd: number;
  unrealised_pnl_pct: number;
  total_pnl_usd: number;
  total_pnl_pct: number;
  win_rate_pct: number;
  completed_trades_count: number;
  sol_price_usd: number;
}

export interface Position {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  logo_url?: string;
  entry_price_sol: number;
  entry_price_usd: number;
  current_price_sol: number;
  current_price_usd: number;
  amount_tokens: number;
  initial_investment_usd: number;
  initial_investment_sol: number;
  current_position_value_usd: number;
  current_position_value_sol?: number;
  pnl_usd: number;
  pnl_sol?: number;
  pnl_pct: number;
  status: PositionStatus;
  entry_time: string;
  exit_time?: string;
  exit_price_usd?: number;
  take_profit_target_pct: number;
  stop_loss_target_pct: number;
  trailing_stop_pct?: number;
  trailing_stop_eligible?: boolean;
  trailing_stop_eligibility_reason?: string;
  trailing_stop_enabled?: boolean;
  trailing_stop_active?: boolean;
  trailing_activation_profit_pct?: number;
  trailing_stop_callback_pct?: number;
  trailing_stop_price_sol?: number;
  maximum_profit_pct?: number;
  maximum_profit_price_sol?: number;
  highest_price_sol?: number;
  highest_price_usd?: number;
  venue: Venue;
  tx_signature: string;
}

export interface PositionRiskSettings {
  stop_loss_pct: number;
  take_profit_pct: number;
  trailing_stop_enabled: boolean;
  trailing_activation_profit_pct: number;
  trailing_stop_callback_pct: number;
  maximum_profit_pct: number;
}

export interface SafetyDetails {
  mint_authority: 'renounced' | 'active' | 'unknown';
  freeze_authority: 'revoked' | 'active' | 'unknown';
  top_10_holders_pct: number;
  liquidity_locked: boolean;
  liquidity_locked_pct: number;
  honeypot_risk: 'none' | 'low' | 'high' | 'unknown';
  dev_holding_pct: number;
  dev_sold_all: boolean;
  bundled_snipers_detected: boolean;
  risk_flags: string[];
  safety_score: number; // 0-100
  holders_count: number;
  creator_reputation: 'clean' | 'first_deploy' | 'flagged' | 'unknown';
  largest_holders: Array<{
    address: string;
    percentage: number;
    is_creator: boolean;
    is_raydium_vault: boolean;
  }>;
}

export interface PricePoint {
  time: number;
  price: number;
  volume: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

export interface TokenDiagnostic {
  mint_address?: string;
  stage?: string;
  provider?: string;
  severity?: string;
  message?: string;
  raw_response?: unknown;
  occurred_at?: string;
}

export interface DiscoveredToken {
  mint: string;
  /** Monotonic backend token-registry version used to reject stale events. */
  state_version?: number;
  /** Monotonic scan attempt number; a higher attempt may replace an earlier verdict. */
  scan_attempt?: number;
  /** Timestamp of the last final backend security assessment. */
  security_scanned_at?: string;
  strategy_decision?: string;
  strategy_reasons?: string[];
  strategy_evaluated_at?: string;
  name: string;
  symbol: string;
  metadata_uri?: string;
  logo_url?: string;
  metadata_status?: string;
  scan_status?: string;
  scan_progress?: number;
  scan_stage?: string;
  lifecycle_status?: string;
  lifecycle_label?: string;
  lifecycle_stage?: string;
  lifecycle_sub_event?: string;
  lifecycle_progress?: number;
  lifecycle_error?: {
    severity?: string;
    stage?: string;
    provider?: string;
    message?: string;
    raw_response?: unknown;
    occurred_at?: string;
  };
  lifecycle_updated_at?: string;
  lifecycle_version?: number;
  /** Confirmed Solana market-feed subscription lifecycle, separate from security verdict. */
  monitoring_status?: string;
  monitoring_reason?: string;
  monitoring_updated_at?: string;
  authority_status?: string;
  authority_rechecks?: number;
  decimals?: number;
  total_supply_raw?: string;
  creator_wallet: string;
  launch_time: string;
  current_price_usd: number;
  current_price_sol: number;
  price_currency?: 'USD' | 'SOL';
  price_change_1m_pct?: number;
  price_change_5m_pct?: number;
  market_cap_sol?: number;
  market_cap_usd: number;
  liquidity_usd: number;
  volume_5m_usd: number;
  volume_1h_usd: number;
  tx_buys_5m: number;
  tx_sells_5m: number;
  /** Backend-confirmed buy activity used by the entry evaluator. */
  buy_volume_5m_usd?: number;
  distinct_buyers_5m?: number;
  buy_count_5m?: number;
  sell_count_5m?: number;
  estimated_slippage_pct?: number;
  confirmed_trade_events?: number;
  buy_pressure_pct?: number;
  /** Pump.fun curve completion is separate from PumpSwap pool activation. */
  bonding_curve_status?: string;
  bonding_curve_account?: string;
  bonding_curve_progress_pct: number;
  venue: Venue;
  safety_status: SafetyRating;
  qualification_status: QualificationStatus;
  rejection_reason?: string;
  diagnostics?: TokenDiagnostic[];
  safety_details: SafetyDetails;
  price_history_5m: PricePoint[];
}

export type EventType =
  | 'launch_detected'
  | 'token_scan_started'
  | 'token_scan_update'
  | 'token_scan_progress'
  | 'token_scan_completed'
  | 'token_scan_failed'
  | 'token_diagnostic'
  | 'token_monitoring_started'
  | 'token_monitoring_update'
  | 'token_monitoring_completed'
  | 'token_metadata_started'
  | 'token_metadata_failed'
  | 'creator_history_started'
  | 'creator_history_update'
  | 'pumpswap_activity'
  | 'pumpswap_volume_update'
  | 'market_price_update'
  | 'sol_price_update'
  | 'market_subscription_requested'
  | 'diagnostic'
  | 'connection_status'
  | 'engine_state'
  | 'stream_warning'
  | 'command_rejected'
  | 'new_token_detected'
  | 'token_metadata_updated'
  | 'buy_signal_generated'
  | 'paper_buy_executed'
  | 'paper_buy_failed'
  | 'sell_signal_generated'
  | 'paper_sell_executed'
  | 'price_updated'
  | 'liquidity_updated'
  | 'safety_check_completed'
  | 'strategy_rejected_token'
  | 'pump_fun_migration_detected'
  | 'pumpswap_pool_discovered'
  | 'rpc_disconnected'
  | 'websocket_reconnected'
  | 'engine_warning'
  | 'engine_error'
  | 'websocket_connected'
  | 'websocket_disconnected'
  | 'market_monitor_status'
  | 'market_subscription_active'
  | 'market_account_update'
  | 'market_curve_completed'
  | 'provider_status'
  | 'launch_snapshot'
  | 'reconnect_recovery_status'
  | 'solana_logs_notification'
  | 'new_token'
  | 'safety_check_passed'
  | 'ws_reconnected'
  | 'unknown_event'
  | (string & {});

export interface NodeXEvent {
  event_id: string;
  event_type: EventType;
  timestamp: string;
  token_mint?: string;
  message: string;
  processing_status: 'processed' | 'analyzing' | 'skipped' | 'executed' | 'failed';
  tx_signature?: string;
  data: Record<string, any>;
}

export interface PreferredOwner {
  address: string;
  label: string;
}

export interface StrategyConfig {
  min_liquidity_usd: number;
  max_entry_price_usd: number;
  max_investment_per_token_usd: number;
  max_simultaneous_positions: number;
  min_safety_score: number;
  max_slippage_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  maximum_profit_pct: number;
  min_5m_buy_volume_usd: number;
  max_top10_holder_concentration_pct: number;
  auto_buy_enabled: boolean;
  auto_recover_token_account_rent: boolean;
  trailing_stop_enabled: boolean;
  trailing_activation_profit_pct: number;
  trailing_stop_callback_pct: number;
  blacklist_creators_with_prior_rugs: boolean;
  paper_starting_balance: number;
  paper_starting_balance_currency: 'USD' | 'SOL';
  diagnostic_mode: boolean;
  block_unverified_trades: boolean;
  execution_enabled: boolean;
  whitelist_only_mode: boolean;
  preferred_owners: PreferredOwner[];
}

export interface StrategyConditionCheck {
  name: string;
  required: string;
  actual: string;
  passed: boolean;
}

export interface StrategyDecision {
  id: string;
  timestamp: string;
  token_mint: string;
  token_symbol: string;
  outcome: 'ACCEPTED' | 'REJECTED';
  reasons: string[];
  checks: StrategyConditionCheck[];
}

export interface HistoricalDataPoint {
  time: string;
  timestamp: number;
  portfolio_value: number;
  realised_pnl: number;
  unrealised_pnl: number;
  sol_benchmark_indexed: number;
}

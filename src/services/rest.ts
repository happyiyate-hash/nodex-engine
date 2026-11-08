import { EngineStatus, DiscoveredToken, NodeXEvent, StrategyConfig, StrategyDecision, TokenLaunchRecord, PaperWalletSnapshot } from '../types';

function websocketUrlFor(backendUrl: string): string {
  if (!backendUrl) return '';
  try {
    const parsed = new URL(backendUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/api/v1/ws';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

const CONNECTION_STORAGE_KEY = 'nodex.connection-settings.v1';


export interface StorageOverview {
  disk: null | {
    filesystem: string;
    mountpoint: string;
    total_bytes: number;
    used_bytes: number;
    available_bytes: number;
    used_percent: string;
  };
  disk_error: string | null;
  database: {
    path: string | null;
    database_bytes: number;
    wal_bytes: number;
    shm_bytes: number;
    total_file_bytes: number;
  };
  system_journal: {
    available: boolean;
    reported_size_bytes: number | null;
    raw_report: string | null;
    note: string;
  };
  updated_at: string;
}

export interface EngineControlSnapshot {
  paused: boolean;
  mode: 'paper' | 'real';
  available_modes: { paper: boolean; real: boolean };
  real_trading_available: boolean;
  token_discovery_enabled: boolean;
  new_entries_enabled: boolean;
  position_monitoring_enabled: boolean;
}

export interface ApiSettings {
  backendUrl: string; wsUrl: string; wsUrlOverride: string; mode: 'RUST_BACKEND'; rpcUrl: string;
  autoReconnection: boolean; heartbeatIntervalMs: number; apiKey: string; adminApiKey: string;
}
export const DEFAULT_SETTINGS: ApiSettings = {
  backendUrl: '', wsUrl: '', wsUrlOverride: '', mode: 'RUST_BACKEND', rpcUrl: '',
  autoReconnection: true, heartbeatIntervalMs: 5000, apiKey: '', adminApiKey: '',
};

function readStoredConnectionSettings(): Partial<ApiSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CONNECTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { backendUrl?: unknown; wsUrlOverride?: unknown; adminApiKey?: unknown };
    return {
      ...(typeof parsed.backendUrl === 'string' ? { backendUrl: parsed.backendUrl } : {}),
      ...(typeof parsed.wsUrlOverride === 'string' ? { wsUrlOverride: parsed.wsUrlOverride } : {}),
      ...(typeof parsed.adminApiKey === 'string' ? { adminApiKey: parsed.adminApiKey } : {}),
    };
  } catch {
    return {};
  }
}

export interface NodeXProfileSnapshot {
  profile?: {
    wallet_address?: string | null;
    name?: string;
    symbol?: string;
    profile_url?: string;
    profile_picture_url?: string;
    [key: string]: unknown;
  };
  wallet?: { sol_balance?: number; last_updated?: string | null; [key: string]: unknown };
  existing_wallet?: { sol_balance?: number; last_synced?: string | null; [key: string]: unknown };
  /** Paper-trading wallet returned by GET /api/v1/profile (lamports). */
  paper_wallet?: PaperWalletSnapshot;
  portfolio?: {
    portfolio_balance_sol?: number;
    total_portfolio_value_sol?: number;
    total_value_sol?: number;
    available_balance_sol?: number;
    invested_balance_sol?: number;
    locked_rent_sol?: number;
    starting_balance_sol?: number;
    total_invested_sol?: number;
    unrealized_pnl_sol?: number;
    unrealized_pnl_pct?: number;
    realized_pnl_sol?: number;
    total_pnl_sol?: number;
    total_pnl_pct?: number;
    position_count?: number;
    positions?: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export class NodeXRestClient {
  private settings: ApiSettings = (() => {
    const stored = readStoredConnectionSettings();
    const backendUrl = (stored.backendUrl ?? DEFAULT_SETTINGS.backendUrl).trim().replace(/\/$/, '');
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      backendUrl,
      wsUrlOverride: stored.wsUrlOverride || '',
      wsUrl: (stored.wsUrlOverride || '').trim() || websocketUrlFor(backendUrl) || DEFAULT_SETTINGS.wsUrl,
      apiKey: '',
      mode: 'RUST_BACKEND',
    };
  })();

  public loadSettings(): ApiSettings { return { ...this.settings }; }

  public saveSettings(update: Partial<ApiSettings>): ApiSettings {
    const nextBackendUrl = (update.backendUrl ?? this.settings.backendUrl).trim().replace(/\/$/, '');
    const nextWsUrlOverride = typeof update.wsUrlOverride === 'string'
      ? update.wsUrlOverride.trim()
      : this.settings.wsUrlOverride;
    const nextWsUrl = nextWsUrlOverride || websocketUrlFor(nextBackendUrl);
    this.settings = {
      ...this.settings,
      ...update,
      backendUrl: nextBackendUrl,
      wsUrl: nextWsUrl,
      wsUrlOverride: nextWsUrlOverride,
      apiKey: '',
      mode: 'RUST_BACKEND',
    };
    if (typeof window !== 'undefined') {
      try {
        // The operator key is saved in this browser profile; it is not secure secret storage.
        window.localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify({
          backendUrl: this.settings.backendUrl,
          adminApiKey: this.settings.adminApiKey,
          wsUrlOverride: this.settings.wsUrlOverride,
        }));
      } catch (error) {
        console.warn('Unable to persist NodeX connection preferences in this browser.', error);
      }
    }
    return this.getSettings();
  }

  public getSettings(): ApiSettings { return { ...this.settings }; }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.settings.backendUrl) throw new Error('Backend URL missing. Enter your Rust backend URL in Settings.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(this.settings.backendUrl + path, {
        ...options, headers: { Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers },
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`NodeX API ${response.status}: ${body || response.statusText}`);
      return (body ? JSON.parse(body) : undefined) as T;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`NodeX request timed out after 10 seconds: ${path}`);
      }
      if (error instanceof TypeError) {
        throw new Error(`Could not reach the NodeX API at ${this.settings.backendUrl}. Check the server, TLS certificate, and browser CORS permission.`);
      }
      throw error;
    } finally { window.clearTimeout(timeout); }
  }

  public async issueWebSocketTicket(): Promise<string> {
    const key = this.settings.adminApiKey.trim();
    if (!key) throw new Error('Operator API key is not saved on this device. Open Settings and save it to receive live data.');
    const result = await this.request<{ ticket: string; expires_in_seconds: number }>('/api/v1/ws-ticket', {
      method: 'POST', headers: { 'X-NodeX-Admin-Key': key },
    });
    if (!result.ticket) throw new Error('Backend did not return a WebSocket ticket.');
    return result.ticket;
  }

  public async verifyConnection(candidate: { backendUrl: string; wsUrlOverride: string; adminApiKey: string }): Promise<{ service: string }> {
    const previous = this.settings;
    const backendUrl = candidate.backendUrl.trim().replace(/\/$/, '');
    const wsUrlOverride = candidate.wsUrlOverride.trim();
    this.settings = {
      ...previous,
      backendUrl,
      wsUrlOverride,
      wsUrl: wsUrlOverride || websocketUrlFor(backendUrl),
      adminApiKey: candidate.adminApiKey.trim(),
    };
    try {
      const health = await this.getHealth();
      await this.issueWebSocketTicket();
      return { service: health.service || 'NodeX' };
    } finally {
      this.settings = previous;
    }
  }

  public getProfile(): Promise<NodeXProfileSnapshot> {
    return this.request<NodeXProfileSnapshot>('/api/v1/profile');
  }
  public getHealth() { return this.request<{status:string;mode:string;service:string}>('/health'); }
  public async getEngineStatus(): Promise<EngineStatus> {
    const raw = await this.request<any>('/api/v1/engine/status');
    const streams = raw.solana_streams || {};
    const stream = streams.pump_fun || raw.solana_stream || {};
    const pumpswap = streams.pumpswap || {};
    return {
      running: !raw.paused, operating_mode: String(raw.mode || 'paper').toUpperCase() as EngineStatus['operating_mode'], network: 'mainnet-beta',
      solana_connected: Boolean(stream.connected),
      pumpswap_connected: Boolean(pumpswap.connected),
      pumpswap_reconnection_count: Number(pumpswap.reconnect_count || 0),
      pumpswap_last_error: String(pumpswap.last_error || ''),
      solana_last_error: String(stream.last_error || ''),
      solana_last_message_at: String(stream.last_message_at || ''),
      rpc_endpoint: '',
      rpc_latency_ms: Number(stream.latency_ms || 0),
      ws_status: stream.connected ? 'connected' : 'disconnected',
      ws_endpoint: this.settings.wsUrl, provider_name: stream.provider || 'Solana RPC',
      last_heartbeat: stream.last_message_at || '', incoming_event_rate: 0,
      reconnection_count: Number(stream.reconnect_count || 0),
      database_status: 'unknown',
      tokens_detected_today: 0, simulated_buys_count: 0, simulated_sells_count: 0,
      strategy_paused: Boolean(raw.paused),
    };
  }
  public getPaperWallet(): Promise<PaperWalletSnapshot> { return this.request<PaperWalletSnapshot>('/api/v1/paper-wallet'); }
  public getRecentTokens(limit=100): Promise<TokenLaunchRecord[]> {
    return this.request<any[]>(`/api/v1/tokens/recent?limit=${Math.min(500,Math.max(1,limit))}`);
  }
  public getTokenState(mint: string): Promise<Record<string, any>> {
    return this.request(`/api/v1/tokens/${encodeURIComponent(mint)}/state`);
  }
  public getRecentEvents(limit=200): Promise<Array<{
    id: number; signature: string | null; slot: number | null;
    received_at: string; event: Record<string, any>;
  }>> {
    return this.request(`/api/v1/events/recent?limit=${Math.min(500,Math.max(1,limit))}`);
  }

  public getEngineActivityLogs(limit=500): Promise<Array<{
    id: number; recorded_at: string; activity: Record<string, any>;
  }>> {
    const key = this.settings.adminApiKey.trim();
    if (!key) throw new Error('Save the operator API key in Settings to view engine activity.');
    return this.request(`/api/v1/admin/activity-logs?limit=${Math.min(1000,Math.max(1,limit))}`, {
      headers: { 'X-NodeX-Admin-Key': key },
    });
  }

  public getStorageOverview(): Promise<StorageOverview> {
    const key = this.settings.adminApiKey.trim();
    if (!key) throw new Error('Save the operator API key in Settings before loading server storage.');
    return this.request<StorageOverview>('/api/v1/admin/storage/overview', {
      headers: { 'X-NodeX-Admin-Key': key },
    });
  }
  public cleanupSystemJournal(): Promise<{
    status: string; category: 'system_logs'; cleanup_output: string;
    storage_before_bytes: number | null; storage_after_bytes: number | null;
    bytes_freed: number | null; overview: StorageOverview;
  }> {
    const key = this.settings.adminApiKey.trim();
    if (!key) throw new Error('Save the operator API key in Settings before cleaning system logs.');
    return this.request('/api/v1/admin/storage/system-journal/cleanup', {
      method: 'POST',
      headers: { 'X-NodeX-Admin-Key': key },
    });
  }

  public clearEngineHistory(adminKey: string): Promise<{
    status: string; deleted_token_records: number; deleted_raw_event_records: number;
    preserved: string[];
  }> {
    return this.request('/api/v1/admin/maintenance/clear-history', {
      method: 'POST',
      headers: { 'X-NodeX-Admin-Key': adminKey },
    });
  }

  public scanToken(mint:string) {
    return this.request<any>(`/api/v1/tokens/${encodeURIComponent(mint)}/scan`);
  }
  public getTokenAccountRent() { return this.request<any>('/api/v1/fees/token-account-rent'); }

  public async getDashboardSummary(): Promise<never> { throw new Error('Dashboard summary route is not implemented by the Rust backend.'); }
  public async getPositions(): Promise<never> { throw new Error('Paper positions route is not implemented by the Rust backend.'); }
  public async getTokens(): Promise<DiscoveredToken[]> { throw new Error('Use getRecentTokens(): the backend does not yet return complete token dossiers.'); }
  public async getToken(_mint:string): Promise<DiscoveredToken|null> { throw new Error('Complete token detail route is not implemented.'); }
  public async getEvents(_limit=100): Promise<NodeXEvent[]> { throw new Error('Historical events route is not implemented. Live events use WebSocket.'); }
  public async getStrategy(): Promise<{config:StrategyConfig;decisions:StrategyDecision[]}> {
    const result = await this.request<{config:StrategyConfig}>('/api/v1/config/trading');
    return { config: result.config, decisions: [] };
  }
  public async updateStrategy(config:StrategyConfig): Promise<{status:string;config:StrategyConfig}> {
    const key = this.settings.adminApiKey.trim();
    if (!key) throw new Error('Save the Engine API key in Settings before updating trading configuration.');
    return this.request('/api/v1/config/trading', {
      method: 'PUT',
      headers: { 'X-NodeX-Admin-Key': key },
      body: JSON.stringify(config),
    });
  }
  public getEngineControl(): Promise<EngineControlSnapshot> {
    return this.request<EngineControlSnapshot>('/api/v1/engine/control');
  }
  public updateEngineControl(
    command: 'start' | 'resume' | 'pause' | 'stop' | 'configure' | 'set_mode',
    updates: Partial<Pick<EngineControlSnapshot, 'mode' | 'token_discovery_enabled' | 'new_entries_enabled' | 'position_monitoring_enabled'>> = {},
  ): Promise<{status:string;engine:EngineControlSnapshot}> {
    const key = this.settings.adminApiKey.trim();
    if (!key) throw new Error('Save the Engine API key in Settings before changing runtime controls.');
    return this.request('/api/v1/engine/control', {
      method: 'POST',
      headers: { 'X-NodeX-Admin-Key': key },
      body: JSON.stringify({ command, ...updates }),
    });
  }
}
export const restClient = new NodeXRestClient();
// Compatibility name for existing page-level REST calls while all requests
// are centralized in this REST-only module.
export const apiClient = restClient;

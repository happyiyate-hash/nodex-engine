import { EngineStatus, DiscoveredToken, NodeXEvent, StrategyConfig, StrategyDecision, TokenLaunchRecord, PaperWalletSnapshot } from '../types';

const API_URL = (import.meta.env.VITE_NODEX_API_URL || '').replace(/\/$/, '');
const WS_URL = import.meta.env.VITE_NODEX_WS_URL || (API_URL
  ? API_URL.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/api/v1/ws'
  : (typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + (typeof window !== 'undefined' ? window.location.host : 'localhost') + '/api/v1/ws');

export interface ApiSettings {
  backendUrl: string; wsUrl: string; mode: 'RUST_BACKEND'; rpcUrl: string;
  autoReconnection: boolean; heartbeatIntervalMs: number;
}
export const DEFAULT_SETTINGS: ApiSettings = {
  backendUrl: API_URL, wsUrl: WS_URL, mode: 'RUST_BACKEND', rpcUrl: '',
  autoReconnection: true, heartbeatIntervalMs: 5000,
};

export class NodeXApiClient {
  private settings: ApiSettings = { ...DEFAULT_SETTINGS };
  public loadSettings(): ApiSettings { return { ...this.settings }; }
  public saveSettings(update: Partial<ApiSettings>): ApiSettings {
    this.settings = { ...this.settings, ...update, mode: 'RUST_BACKEND' }; return this.getSettings();
  }
  public getSettings(): ApiSettings { return { ...this.settings }; }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!this.settings.backendUrl) throw new Error('Backend URL missing. Configure VITE_NODEX_API_URL.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(this.settings.backendUrl + path, {
        ...options, headers: { Accept: 'application/json',
          ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`NodeX API ${response.status}: ${body || response.statusText}`);
      return (body ? JSON.parse(body) : undefined) as T;
    } finally { window.clearTimeout(timeout); }
  }

  public getHealth() { return this.request<{status:string;mode:string;service:string}>('/health'); }
  public async getEngineStatus(): Promise<EngineStatus> {
    const raw = await this.request<any>('/api/v1/engine/status');
    const stream = raw.solana_stream || {};
    return {
      running: !raw.paused, operating_mode: 'PAPER', network: 'mainnet-beta',
      solana_connected: Boolean(stream.connected), rpc_endpoint: '',
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
  public scanToken(mint:string) {
    return this.request<any>(`/api/v1/tokens/${encodeURIComponent(mint)}/scan`);
  }
  public getTokenAccountRent() { return this.request<any>('/api/v1/fees/token-account-rent'); }

  public async getDashboardSummary(): Promise<never> { throw new Error('Dashboard summary route is not implemented by the Rust backend.'); }
  public async getPositions(): Promise<never> { throw new Error('Paper positions route is not implemented by the Rust backend.'); }
  public async getTokens(): Promise<DiscoveredToken[]> { throw new Error('Use getRecentTokens(): the backend does not yet return complete token dossiers.'); }
  public async getToken(_mint:string): Promise<DiscoveredToken|null> { throw new Error('Complete token detail route is not implemented.'); }
  public async getEvents(_limit=100): Promise<NodeXEvent[]> { throw new Error('Historical events route is not implemented. Live events use WebSocket.'); }
  public async getStrategy(): Promise<{config:StrategyConfig;decisions:StrategyDecision[]}> { throw new Error('Strategy persistence route is not implemented.'); }
  public async updateStrategy(_config:StrategyConfig): Promise<never> { throw new Error('Strategy update route is not implemented.'); }
}
export const apiClient = new NodeXApiClient();

/**
 * NodeX API Service Layer
 * Connects to the Rust Axum backend with transparent fallback to local paper engine when offline.
 */

import {
  DashboardSummary,
  DiscoveredToken,
  EngineStatus,
  NodeXEvent,
  Position,
  StrategyConfig,
  StrategyDecision,
} from '../types';
import {
  INITIAL_DECISIONS,
  INITIAL_ENGINE_STATUS,
  INITIAL_EVENTS,
  INITIAL_POSITIONS,
  INITIAL_STRATEGY_CONFIG,
  INITIAL_SUMMARY,
  INITIAL_TOKENS,
} from './mockData';

// Storage keys
const SETTINGS_KEY = 'nodex_settings_config';
const STRATEGY_KEY = 'nodex_strategy_config';

export interface ApiSettings {
  backendUrl: string;
  wsUrl: string;
  mode: 'SIMULATION' | 'RUST_BACKEND';
  rpcUrl: string;
  autoReconnection: boolean;
  heartbeatIntervalMs: number;
}

export const DEFAULT_SETTINGS: ApiSettings = {
  backendUrl: '/api/v1',
  wsUrl: 'ws://localhost:8080/api/v1/ws',
  mode: 'SIMULATION',
  rpcUrl: 'https://mainnet.helius-rpc.com/?api-key=***[SERVER-INJECTED]',
  autoReconnection: true,
  heartbeatIntervalMs: 5000,
};

export class NodeXApiClient {
  private settings: ApiSettings;

  constructor() {
    this.settings = this.loadSettings();
  }

  public loadSettings(): ApiSettings {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {
      // Fallback
    }
    return DEFAULT_SETTINGS;
  }

  public saveSettings(newSettings: Partial<ApiSettings>): ApiSettings {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }
    return this.settings;
  }

  public getSettings(): ApiSettings {
    return this.settings;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<{ data: T; source: 'rust_backend' | 'simulated_feed'; ok: boolean }> {
    if (this.settings.mode === 'RUST_BACKEND') {
      try {
        const url = `${this.settings.backendUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(options.headers || {}),
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const json = await res.json();
          return { data: json, source: 'rust_backend', ok: true };
        }
      } catch (err) {
        console.warn(`Rust backend request to ${endpoint} failed, falling back to local simulation engine.`, err);
      }
    }

    return { data: null as unknown as T, source: 'simulated_feed', ok: false };
  }

  // GET /api/v1/health
  public async getHealth(): Promise<{ status: string; uptime_secs: number; source: string }> {
    const res = await this.request<{ status: string; uptime_secs: number }>('/health');
    if (res.ok && res.data) {
      return { ...res.data, source: res.source };
    }
    return {
      status: 'healthy',
      uptime_secs: 48320,
      source: 'simulated_feed',
    };
  }

  // GET /api/v1/engine/status
  public async getEngineStatus(): Promise<EngineStatus> {
    const res = await this.request<EngineStatus>('/engine/status');
    if (res.ok && res.data) {
      return res.data;
    }
    return INITIAL_ENGINE_STATUS;
  }

  // GET /api/v1/dashboard/summary
  public async getDashboardSummary(): Promise<DashboardSummary> {
    const res = await this.request<DashboardSummary>('/dashboard/summary');
    if (res.ok && res.data) {
      return res.data;
    }
    return INITIAL_SUMMARY;
  }

  // GET /api/v1/positions
  public async getPositions(): Promise<Position[]> {
    const res = await this.request<Position[]>('/positions');
    if (res.ok && res.data) {
      return res.data;
    }
    return INITIAL_POSITIONS;
  }

  // GET /api/v1/tokens
  public async getTokens(): Promise<DiscoveredToken[]> {
    const res = await this.request<DiscoveredToken[]>('/tokens');
    if (res.ok && res.data) {
      return res.data;
    }
    return INITIAL_TOKENS;
  }

  // GET /api/v1/tokens/:mint
  public async getToken(mint: string): Promise<DiscoveredToken | null> {
    const res = await this.request<DiscoveredToken>(`/tokens/${mint}`);
    if (res.ok && res.data) {
      return res.data;
    }
    const local = INITIAL_TOKENS.find((t) => t.mint === mint);
    return local || null;
  }

  // GET /api/v1/events
  public async getEvents(limit = 100): Promise<NodeXEvent[]> {
    const res = await this.request<NodeXEvent[]>(`/events?limit=${limit}`);
    if (res.ok && res.data) {
      return res.data;
    }
    return INITIAL_EVENTS;
  }

  // GET /api/v1/strategy
  public async getStrategy(): Promise<{ config: StrategyConfig; decisions: StrategyDecision[] }> {
    const res = await this.request<{ config: StrategyConfig; decisions: StrategyDecision[] }>('/strategy');
    if (res.ok && res.data) {
      return res.data;
    }
    try {
      const saved = localStorage.getItem(STRATEGY_KEY);
      if (saved) {
        return { config: JSON.parse(saved), decisions: INITIAL_DECISIONS };
      }
    } catch {
      // ignore
    }
    return { config: INITIAL_STRATEGY_CONFIG, decisions: INITIAL_DECISIONS };
  }

  // PUT /api/v1/strategy
  public async updateStrategy(config: StrategyConfig): Promise<{ success: boolean; config: StrategyConfig; source: string }> {
    const res = await this.request<StrategyConfig>('/strategy', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    try {
      localStorage.setItem(STRATEGY_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn('Failed to cache strategy:', e);
    }
    return {
      success: true,
      config: res.ok && res.data ? res.data : config,
      source: res.source,
    };
  }
}

export const apiClient = new NodeXApiClient();

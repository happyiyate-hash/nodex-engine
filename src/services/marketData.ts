export interface MarketDataConnectionSettings {
  restUrl: string;
  wsUrl: string;
}

export interface MarketDataHealth {
  service?: string;
  status?: string;
  providers_configured?: boolean;
  providers?: Array<Record<string, unknown>>;
}

export interface TokenDataChartPoint {
  timestamp_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TokenDataTrade {
  signature: string;
  event_index: number;
  side: string;
  trader?: string | null;
  amount_sol?: number | null;
  token_amount?: number | null;
  price_usd?: number | null;
  volume_usd?: number | null;
  timestamp_ms: number;
}

export interface TokenDataSnapshot {
  schema_version: number;
  mint: string;
  as_of: string;
  identity: {
    name?: string | null;
    symbol?: string | null;
    logo_url?: string | null;
    mint_address: string;
    creator_address?: string | null;
    created_at?: string | null;
  };
  market: {
    price_usd?: number | null;
    price_sol?: number | null;
    market_cap_usd?: number | null;
    liquidity_usd?: number | null;
    change_1m_pct?: number | null;
    change_5m_pct?: number | null;
    change_24h_pct?: number | null;
    volume_24h_usd?: number | null;
    transactions_24h?: number | null;
    buy_volume_usd?: number | null;
    sell_volume_usd?: number | null;
    buy_pressure_pct?: number | null;
    [key: string]: unknown;
  };
  chart: { timeframe: string; points: TokenDataChartPoint[] };
  trades: { recent: TokenDataTrade[] };
  holders: {
    total_count?: number | null;
    top_10_ownership_pct?: number | null;
    largest: Array<{
      address: string;
      token_account?: string | null;
      token_amount: number;
      supply_pct?: number | null;
      rank: number;
    }>;
  };
  info: {
    decimals?: number | null;
    total_supply?: string | null;
    circulating_supply?: string | null;
    token_standard?: string | null;
    creator_address?: string | null;
  };
  data_status: Record<string, string>;
}

export interface TokenDataStreamEvent {
  event: string;
  mint?: string;
  topic?: string;
  timestamp_ms?: number;
  data?: any;
}

const STORAGE_KEY = 'nodex.market-data-connection.v1';

export function normalizeMarketDataSettings(value: MarketDataConnectionSettings): MarketDataConnectionSettings {
  const rawRestUrl = value.restUrl.trim();
  const restUrl = rawRestUrl.endsWith('/') ? rawRestUrl.slice(0, -1) : rawRestUrl;
  let wsUrl = value.wsUrl.trim();
  if (!wsUrl && restUrl) {
    const parsed = new URL(restUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/ws/tokens';
    parsed.search = '';
    parsed.hash = '';
    wsUrl = parsed.toString();
  }
  return { restUrl, wsUrl };
}

export const marketDataService = {
  normalizeMarketDataSettings,
  loadSettings(): MarketDataConnectionSettings {
    if (typeof window === 'undefined') return { restUrl: '', wsUrl: '' };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { restUrl: '', wsUrl: '' };
      const value = JSON.parse(raw) as Partial<MarketDataConnectionSettings>;
      return {
        restUrl: typeof value.restUrl === 'string' ? value.restUrl : '',
        wsUrl: typeof value.wsUrl === 'string' ? value.wsUrl : '',
      };
    } catch {
      return { restUrl: '', wsUrl: '' };
    }
  },

  saveSettings(value: MarketDataConnectionSettings): MarketDataConnectionSettings {
    const normalized = normalizeMarketDataSettings(value);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  },

  async request<T>(action: 'health' | 'providers', settings: MarketDataConnectionSettings): Promise<T> {
    const routes = {
      health: { path: '/health', method: 'GET' as const },
      providers: { path: '/providers/status', method: 'GET' as const },
    };
    const route = routes[action];
    const baseUrl = settings.restUrl.endsWith('/') ? settings.restUrl : `${settings.restUrl}/`;
    const url = new URL(route.path, baseUrl);
    const response = await fetch(url.toString(), {
      method: route.method,
      headers: {},
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error === 'string' ? payload.error : `Market Data request failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return payload as T;
  },

  async getTokenSnapshot(
    settings: MarketDataConnectionSettings,
    mint: string,
    timeframe = '1M',
  ): Promise<TokenDataSnapshot> {
    const normalized = normalizeMarketDataSettings(settings);
    if (!normalized.restUrl) throw new Error('Enter the Market Data REST URL in Settings.');
    const url = new URL(
      `/api/v1/tokens/${encodeURIComponent(mint)}/snapshot`,
      `${normalized.restUrl}/`,
    );
    url.searchParams.set('timeframe', timeframe);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error === 'string'
        ? payload.error
        : typeof payload === 'string' ? payload : `Market Data snapshot failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return payload as TokenDataSnapshot;
  },

  connectTokenStream(
    settings: MarketDataConnectionSettings,
    mint: string,
    timeframe: string,
    onMessage: (message: TokenDataStreamEvent) => void,
    onStatus?: (connected: boolean, message?: string) => void,
  ): WebSocket {
    const normalized = normalizeMarketDataSettings(settings);
    if (!normalized.wsUrl) throw new Error('Enter the Market Data WebSocket URL in Settings.');
    const socket = new WebSocket(normalized.wsUrl);
    socket.onopen = () => {
      try {
        socket.send(JSON.stringify({
          command: 'subscribe',
          mint,
          topics: [
            'token.market',
            'token.chart',
            'token.trades',
            'token.holders',
            'token.info',
          ],
          timeframe,
        }));
        onStatus?.(true, 'Subscribed to the Token Data stream.');
      } catch (error) {
        onStatus?.(false, error instanceof Error ? error.message : 'Could not subscribe to Token Data.');
        socket.close();
      }
    };
    socket.onmessage = (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as TokenDataStreamEvent);
      } catch {
        // Ignore malformed frames; the next valid sequence remains usable.
      }
    };
    socket.onerror = () => onStatus?.(false, 'Market Data WebSocket error.');
    socket.onclose = (event) => {
      onStatus?.(false, event.reason || `Market Data WebSocket closed (${event.code}).`);
    };
    return socket;
  },

  async connectWebSocket(
    settings: MarketDataConnectionSettings,
    onStatus?: (connected: boolean, message?: string) => void,
  ): Promise<WebSocket> {
    const normalized = normalizeMarketDataSettings(settings);
    if (!normalized.wsUrl) throw new Error('Enter a Market Data WebSocket URL.');
    const socket = new WebSocket(normalized.wsUrl);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error('Market Data WebSocket handshake timed out.'));
      }, 10000);

      socket.onopen = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        onStatus?.(true, 'Market Data WebSocket connected.');
        resolve();
      };
      socket.onerror = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error('Market Data WebSocket handshake failed. Check the WSS URL, TLS certificate and network access.'));
      };
      socket.onclose = (event) => {
        onStatus?.(false, event.reason || `WebSocket closed (code ${event.code}).`);
      };
    });

    return socket;
  },
};

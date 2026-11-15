export interface MarketDataConnectionSettings {
  restUrl: string;
  wsUrl: string;
  apiKey: string;
}

export interface MarketDataHealth {
  service?: string;
  status?: string;
  providers_configured?: boolean;
  providers?: Array<Record<string, unknown>>;
}

const STORAGE_KEY = 'nodex.market-data-connection.v1';

function cleanKey(value: string): string {
  return value
    .replace(/[\\u200B-\\u200D\\uFEFF\\u2060\\u00A0]/g, '')
    .replace(/[\\u2018\\u2019]/g, "'")
    .replace(/[\\u201C\\u201D]/g, '"')
    .replace(/[\\u2013\\u2014]/g, '-')
    .replace(/[^\\x00-\\xFF]/g, '')
    .trim();
}

export function normalizeMarketDataSettings(value: MarketDataConnectionSettings): MarketDataConnectionSettings {
  const restUrl = value.restUrl.trim().replace(/\\/$/, '');
  let wsUrl = value.wsUrl.trim();
  if (!wsUrl && restUrl) {
    const parsed = new URL(restUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    parsed.pathname = '/ws/tokens';
    parsed.search = '';
    parsed.hash = '';
    wsUrl = parsed.toString();
  }
  return { restUrl, wsUrl, apiKey: cleanKey(value.apiKey) };
}

export const marketDataService = {
  loadSettings(): MarketDataConnectionSettings {
    if (typeof window === 'undefined') return { restUrl: '', wsUrl: '', apiKey: '' };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { restUrl: '', wsUrl: '', apiKey: '' };
      const value = JSON.parse(raw) as Partial<MarketDataConnectionSettings>;
      return {
        restUrl: typeof value.restUrl === 'string' ? value.restUrl : '',
        wsUrl: typeof value.wsUrl === 'string' ? value.wsUrl : '',
        apiKey: typeof value.apiKey === 'string' ? cleanKey(value.apiKey) : '',
      };
    } catch {
      return { restUrl: '', wsUrl: '', apiKey: '' };
    }
  },

  saveSettings(value: MarketDataConnectionSettings): MarketDataConnectionSettings {
    const normalized = normalizeMarketDataSettings(value);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  },

  async request<T>(action: 'health' | 'providers' | 'ws-ticket', settings: MarketDataConnectionSettings): Promise<T> {
    const response = await fetch(`/api/market-data/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restUrl: settings.restUrl,
        apiKey: cleanKey(settings.apiKey),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload?.error === 'string' ? payload.error : `Market Data request failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return payload as T;
  },

  async connectWebSocket(
    settings: MarketDataConnectionSettings,
    onStatus?: (connected: boolean, message?: string) => void,
  ): Promise<WebSocket> {
    const normalized = normalizeMarketDataSettings(settings);
    if (!normalized.wsUrl) throw new Error('Enter a Market Data WebSocket URL.');
    const ticketResponse = await this.request<{ ticket: string }>('ws-ticket', normalized);
    if (!ticketResponse.ticket) throw new Error('Market Data server did not issue a WebSocket ticket.');

    const separator = normalized.wsUrl.includes('?') ? '&' : '?';
    const socket = new WebSocket(`${normalized.wsUrl}${separator}ticket=${encodeURIComponent(ticketResponse.ticket)}`);

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
        onStatus?.(true, 'Authenticated WebSocket handshake succeeded.');
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

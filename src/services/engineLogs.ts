export type EngineLogKind = 'request' | 'event';

export interface EngineLogEntry {
  id: string; kind: EngineLogKind; action: string; at: string;
  durationMs?: number; ok: boolean; status?: number; error?: string;
  request?: unknown; response?: unknown; eventType?: string;
}

const STORAGE_KEY = 'nodex-engine-logs.v1';
const MAX_LOGS = 120;
const HIGH_FREQUENCY_EVENTS = new Set([
  'heartbeat', 'market_tick', 'market_price_update', 'token_market_update',
  'token_statistics_update', 'chart_candle_update', 'chart_candle_closed',
  'pumpswap_activity', 'market_account_update',
]);
let fetchLoggerInstalled = false;
let pendingEvents: EngineLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function read(): EngineLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value as EngineLogEntry[] : [];
  } catch { return []; }
}

function publish(logs: EngineLogEntry[]) {
  if (typeof window === 'undefined') return;
  const bounded = logs.slice(0, MAX_LOGS);
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded)); } catch { /* Storage may be full. */ }
  window.dispatchEvent(new CustomEvent('nodex-engine-logs-updated', { detail: bounded }));
}

function scheduleEventFlush() {
  if (flushTimer || typeof window === 'undefined') return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    if (!pendingEvents.length) return;
    const batch = pendingEvents;
    pendingEvents = [];
    const logs = read();
    logs.unshift(...batch);
    publish(logs.slice(0, MAX_LOGS));
  }, 500);
}

export function readEngineLogs(): EngineLogEntry[] { return read(); }

export function recordRequest(entry: Omit<EngineLogEntry, 'id' | 'kind'>) {
  const logs = read();
  logs.unshift({ ...entry, id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: 'request' });
  publish(logs);
}

export function recordLiveEvent(eventType: string, payload: unknown, ok = true, error?: string) {
  if (HIGH_FREQUENCY_EVENTS.has(eventType)) return;
  const raw = payload && typeof payload === 'object' ? payload as Record<string, any> : {};
  const data = raw.data && typeof raw.data === 'object' ? raw.data as Record<string, any> : {};
  // Keep only a compact diagnostic summary. Never persist raw Solana logs,
  // full token snapshots, account data, or provider payloads in browser storage.
  const response = {
    type: eventType,
    mint_address: data.mint_address || data.token_mint || null,
    stage: data.stage || null,
    progress: data.progress ?? null,
    decision: data.decision || data.status || null,
    message: data.message || null,
    severity: data.severity || null,
  };
  pendingEvents.unshift({
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'event', action: eventType || 'websocket_message', eventType,
    at: new Date().toISOString(), ok, error, response,
  });
  if (pendingEvents.length > 40) pendingEvents.length = 40;
  scheduleEventFlush();
}

export function installFetchLogger() {
  if (typeof window === 'undefined' || fetchLoggerInstalled) return;
  fetchLoggerInstalled = true;
  try {
    if (typeof window.fetch !== 'function') return;
    const originalFetch = window.fetch.bind(window);
    const patchedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      let url: URL;
      try { url = new URL(rawUrl, window.location.href); } catch { return originalFetch(input, init); }
      const isNodeX = /\/api\/v1\//.test(url.pathname) || url.pathname === '/health';
      if (!isNodeX) return originalFetch(input, init);
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const started = performance.now();
      const requestBody = typeof init?.body === 'string' ? (() => {
        try { return JSON.parse(init.body as string); } catch { return init.body; }
      })() : null;
      try {
        const response = await originalFetch(input, init);
        const bodyText = await response.clone().text().catch(() => '');
        let responseBody: unknown = bodyText;
        try { responseBody = bodyText ? JSON.parse(bodyText) : null; } catch { /* Preserve non-JSON response text. */ }
        recordRequest({
          action: `${method.toLowerCase()} ${url.pathname}`, at: new Date().toISOString(),
          durationMs: Math.round(performance.now() - started), ok: response.ok, status: response.status,
          error: response.ok ? undefined : typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody),
          request: requestBody, response: responseBody,
        });
        return response;
      } catch (error) {
        recordRequest({
          action: `${method.toLowerCase()} ${url.pathname}`, at: new Date().toISOString(),
          durationMs: Math.round(performance.now() - started), ok: false,
          error: error instanceof Error ? error.message : String(error), request: requestBody,
        });
        throw error;
      }
    };
    try {
      Object.defineProperty(window, 'fetch', { value: patchedFetch, writable: true, configurable: true, enumerable: true });
    } catch {
      try { (window as any).fetch = patchedFetch; }
      catch (assignErr) { console.warn('Could not override window.fetch (read-only environment):', assignErr); }
    }
  } catch (err) { console.warn('installFetchLogger safely skipped:', err); }
}

export function clearEngineLogs() {
  pendingEvents = [];
  publish([]);
}

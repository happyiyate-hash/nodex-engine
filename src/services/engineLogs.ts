export type EngineLogKind = 'request' | 'event';

export interface EngineLogEntry {
  id: string;
  kind: EngineLogKind;
  action: string;
  at: string;
  durationMs?: number;
  ok: boolean;
  status?: number;
  error?: string;
  request?: unknown;
  response?: unknown;
  eventType?: string;
}

const STORAGE_KEY = 'nodex-engine-logs.v1';
const MAX_LOGS = 500;

function read(): EngineLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value as EngineLogEntry[] : [];
  } catch { return []; }
}

function publish(logs: EngineLogEntry[]) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, MAX_LOGS))); } catch { /* Storage may be full. */ }
  window.dispatchEvent(new CustomEvent('nodex-engine-logs-updated', { detail: logs.slice(0, MAX_LOGS) }));
}

export function readEngineLogs(): EngineLogEntry[] { return read(); }

export function recordRequest(entry: Omit<EngineLogEntry, 'id' | 'kind'>) {
  const logs = read();
  logs.unshift({ ...entry, id: `request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: 'request' });
  publish(logs);
}

export function recordLiveEvent(eventType: string, payload: unknown, ok = true, error?: string) {
  const logs = read();
  logs.unshift({
    id: `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'event', action: eventType || 'websocket_message', eventType,
    at: new Date().toISOString(), ok, error, response: payload,
  });
  publish(logs);
}

export function clearEngineLogs() { publish([]); }

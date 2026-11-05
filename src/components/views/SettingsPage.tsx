import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { apiClient } from '../../services/api';
import { Check, AlertCircle, RefreshCw, Lock, Server, Radio, Database, ChevronDown, Trash2, ShieldAlert } from 'lucide-react';

type HealthResult = { status: 'idle' | 'testing' | 'success' | 'failed'; message?: string };

const implementedRoutes = [
  ['GET', '/health', 'HTTP health response'],
  ['GET', '/api/v1/engine/status', 'Engine pause state and Solana stream status'],
  ['GET', '/api/v1/paper-wallet', 'Persistent personal paper wallet'],
  ['GET', '/api/v1/tokens/recent', 'Persisted confirmed token launches'],
  ['GET', '/api/v1/events/recent', 'Persisted raw-event history (internal; not browser feed)'],
  ['POST', '/api/v1/admin/maintenance/clear-history', 'Protected temporary cleanup of token launch and raw-event history only'],
  ['GET', '/api/v1/tokens/:mint/scan', 'On-demand token security scan'],
  ['GET', '/api/v1/fees/token-account-rent', 'Solana token-account rent estimate'],
  ['WS', '/api/v1/ws', 'Curated application events and engine commands'],
] as const;

export const SettingsPage: React.FC = () => {
  const { engineStatus, toggleEngine, settings, updateSettings, backendError, clearBrowserHistory } = useTerminal();
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [wsUrl, setWsUrl] = useState(settings.wsUrl);
  const [operatorKey, setOperatorKey] = useState(settings.adminApiKey || '');
  const [testResult, setTestResult] = useState<HealthResult>({ status: 'idle' });
  const [savedNotice, setSavedNotice] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [cleanupStatus, setCleanupStatus] = useState<'idle' | 'working' | 'success' | 'failed'>('idle');
  const [cleanupMessage, setCleanupMessage] = useState('');
  const [localClearMessage, setLocalClearMessage] = useState('');

  const handleTestBackend = async () => {
    const baseUrl = backendUrl.trim().replace(/\/$/, '');
    const socketUrl = wsUrl.trim();
    const key = operatorKey.trim();

    if (!/^https:\/\//i.test(baseUrl)) {
      setTestResult({ status: 'failed', message: 'Backend address is missing or invalid. Enter your HTTPS backend URL, then try again.' });
      return;
    }
    if (!/^wss:\/\//i.test(socketUrl)) {
      setTestResult({ status: 'failed', message: 'WebSocket address is missing or invalid. Use a WSS address for the secure connection.' });
      return;
    }
    if (!key) {
      setTestResult({ status: 'failed', message: 'Operator API key is missing. Paste your NODEX_ADMIN_API_KEY and save the connection first.' });
      return;
    }

    setTestResult({ status: 'testing', message: 'Step 1 of 3 — contacting the NodeX API. This check has no artificial timeout; it will wait for the server to respond.' });
    let socket: WebSocket | null = null;
    try {
      const healthResponse = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const healthBody = await healthResponse.text();
      if (!healthResponse.ok) {
        throw new Error(`API is reachable but /health returned HTTP ${healthResponse.status}: ${healthBody.slice(0, 180)}`);
      }
      let health: { status?: string; mode?: string; service?: string };
      try { health = JSON.parse(healthBody); } catch {
        throw new Error('The server answered, but its /health response was not valid JSON.');
      }
      if (health.status !== 'ok') {
        throw new Error(`The API responded but is not healthy. Reported status: ${health.status || 'unknown'}.`);
      }

      setTestResult({ status: 'testing', message: 'Step 2 of 3 — API is responding. Verifying your operator API key…' });
      const ticketResponse = await fetch(`${baseUrl}/api/v1/ws-ticket`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'X-NodeX-Admin-Key': key },
        cache: 'no-store',
      });
      const ticketBody = await ticketResponse.text();
      if (!ticketResponse.ok) {
        if (ticketResponse.status === 401 || ticketResponse.status === 403) {
          throw new Error('The API is running, but it rejected this operator key. Check that NODEX_ADMIN_API_KEY on the server exactly matches the key saved here.');
        }
        throw new Error(`The API is running, but ticket verification failed with HTTP ${ticketResponse.status}: ${ticketBody.slice(0, 180)}`);
      }
      let ticketData: { ticket?: string };
      try { ticketData = JSON.parse(ticketBody); } catch {
        throw new Error('The API accepted the request but did not return a valid WebSocket ticket response.');
      }
      if (!ticketData.ticket) throw new Error('The API did not provide a WebSocket ticket. The deployed backend may not include authenticated WebSocket support yet.');

      setTestResult({ status: 'testing', message: 'Step 3 of 3 — operator key accepted. Opening the authenticated WebSocket connection…' });
      const separator = socketUrl.includes('?') ? '&' : '?';
      socket = new WebSocket(`${socketUrl}${separator}ticket=${encodeURIComponent(ticketData.ticket)}`);
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        socket!.onopen = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        socket!.onerror = () => {
          if (settled) return;
          settled = true;
          reject(new Error('The API key was accepted, but the WebSocket transport failed. Check the WSS URL, TLS certificate, reverse-proxy WebSocket upgrade settings, and network access.'));
        };
        socket!.onclose = (event) => {
          if (settled) return;
          settled = true;
          reject(new Error(`The WebSocket closed before connecting (code ${event.code}${event.reason ? `: ${event.reason}` : ''}). Check the backend WebSocket route and reverse proxy.`));
        };
      });
      socket.close(1000, 'Connection test complete');
      socket = null;
      setTestResult({ status: 'success', message: `Connection verified: ${health.service || 'NodeX'} API is healthy, operator key is accepted, and the authenticated WebSocket opened successfully in ${health.mode || 'unknown'} mode.` });
    } catch (error) {
      socket?.close();
      const message = error instanceof TypeError
        ? 'The browser could not reach the API. Check the backend address, DNS, HTTPS certificate, CORS policy, and network connection.'
        : error instanceof Error ? error.message : 'Connection test failed unexpectedly.';
      setTestResult({ status: 'failed', message });
    }
  };

  const handleSaveSettings = () => {
    updateSettings({ backendUrl: backendUrl.trim(), wsUrl: wsUrl.trim(), adminApiKey: operatorKey.trim() });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleClearLocalStorage = () => {
    if (!window.confirm('Clear NodeX browser history and NodeX-prefixed local storage? Your saved backend connection URL will be preserved.')) return;
    let removed = 0;
    try {
      const keysToRemove: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith('nodex.') && key !== 'nodex.connection-settings.v1') keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => { window.localStorage.removeItem(key); removed += 1; });
      clearBrowserHistory();
      setLocalClearMessage('Cleared browser event/token display and removed ' + removed + ' NodeX local-storage item(s). Backend records were not touched.');
    } catch (error) {
      setLocalClearMessage(error instanceof Error ? error.message : 'Browser storage cleanup failed.');
    }
  };

  const handleClearEngineHistory = async () => {
    if (!adminKey.trim()) {
      setCleanupStatus('failed');
      setCleanupMessage('Enter the backend NODEX_ADMIN_API_KEY first.');
      return;
    }
    if (!window.confirm('Permanently delete stored token launch records and raw Solana event history from the backend database? Live monitoring, paper wallet, ledger, database schema, and configuration will remain untouched.')) return;
    setCleanupStatus('working');
    setCleanupMessage('Sending protected cleanup request to the Rust engine…');
    try {
      const result = await apiClient.clearEngineHistory(adminKey.trim());
      setCleanupStatus('success');
      setCleanupMessage('Cleanup complete: ' + result.deleted_token_records + ' token records and ' + result.deleted_raw_event_records + ' raw event records deleted. Live monitoring and paper wallet were preserved.');
      clearBrowserHistory();
      setAdminKey('');
    } catch (error) {
      setCleanupStatus('failed');
      setCleanupMessage(error instanceof Error ? error.message : 'Backend cleanup failed.');
    }
  };

  const streamActive = !engineStatus.strategy_paused;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 pb-28 sm:px-5 lg:px-6 lg:py-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Settings</h1>
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-mono text-amber-300">PAPER ONLY</span>
        </div>
        <p className="text-xs text-neutral-500">Manage your private NodeX connection and engine controls.</p>
      </header>

      {backendError && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3 text-xs leading-relaxed text-amber-200">
          <div className="mb-1 font-semibold">Backend notice</div>{backendError}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-[#101010] p-3.5 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Server className="h-4 w-4 text-neutral-400" /> Runtime status</div>
          <span className="text-[10px] font-mono text-neutral-500">LIVE STATE</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Engine stream</div>
            <div className={`mt-1 text-sm font-semibold ${streamActive ? 'text-emerald-400' : 'text-amber-300'}`}>{streamActive ? 'ACTIVE' : 'PAUSED'}</div>
            <button onClick={toggleEngine} className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.06] px-2 py-2 text-[11px] font-medium text-white active:scale-[.98]">{streamActive ? 'Pause stream' : 'Resume stream'}</button>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">WebSocket</div>
            <div className={`mt-1 text-sm font-semibold ${engineStatus.ws_status === 'connected' ? 'text-emerald-400' : 'text-amber-300'}`}>{engineStatus.ws_status.toUpperCase()}</div>
            <div className="mt-2 text-[10px] text-neutral-500">Browser ↔ Axum</div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Solana stream</div>
            <div className={`mt-1 text-sm font-semibold ${engineStatus.solana_connected ? 'text-emerald-400' : 'text-red-300'}`}>{engineStatus.solana_connected ? 'CONNECTED' : 'DISCONNECTED'}</div>
            <div className="mt-2 text-[10px] text-neutral-500">Upstream RPC</div>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500">Database</div>
            <div className="mt-1 text-sm font-semibold text-neutral-300">NOT REPORTED</div>
            <div className="mt-2 text-[10px] text-neutral-500">No DB health field in API</div>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-neutral-500"><Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Real transaction signing and submission remain disabled. The stream control pauses/resumes processing; it does not start or stop the Linux service.</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101010] p-3.5 sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Radio className="h-4 w-4 text-neutral-400" /> Backend connection</div>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-neutral-400">HTTPS base URL</span>
            <input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="https://your-backend.example.com" className="w-full min-w-0 rounded-xl border border-white/10 bg-[#080808] px-3 py-3 text-xs text-white outline-none focus:border-white/30" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-neutral-400">WebSocket URL</span>
            <input value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="wss://your-backend.example.com/api/v1/ws" className="w-full min-w-0 rounded-xl border border-white/10 bg-[#080808] px-3 py-3 text-xs text-white outline-none focus:border-white/30" />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-neutral-400">Personal NodeX operator API key</span>
            <input type="password" value={operatorKey} onChange={(e) => setOperatorKey(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Paste NODEX_ADMIN_API_KEY" className="w-full min-w-0 rounded-xl border border-white/10 bg-[#080808] px-3 py-3 text-xs text-white outline-none focus:border-white/30" />
          </label>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-[11px] leading-relaxed text-neutral-500">
            This is your private, single-operator dashboard. The backend URL, WebSocket URL, and operator key are saved in this browser's local storage on this device. On another device, enter the same URLs and key once. The key is sent only over HTTPS to request a short-lived, single-use WebSocket ticket; it is never placed in the WebSocket URL. Anyone with access to this browser profile can read the saved key, so use this only on your own trusted devices.
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button onClick={handleSaveSettings} className="rounded-xl bg-white px-4 py-3 text-xs font-semibold text-black active:scale-[.99]">{savedNotice ? 'Saved' : 'Save connection'}</button>
            <button onClick={handleTestBackend} disabled={testResult.status === 'testing'} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-xs font-medium text-white disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${testResult.status === 'testing' ? 'animate-spin' : ''}`} /> Test connection
            </button>
          </div>
          {testResult.status !== 'idle' && (
            <div className={`flex items-start gap-3 rounded-xl border p-4 text-xs leading-relaxed ${testResult.status === 'success' ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200' : testResult.status === 'failed' ? 'border-red-500/25 bg-red-500/[0.07] text-red-200' : 'border-sky-500/20 bg-sky-500/[0.05] text-sky-100'}`}>
              {testResult.status === 'success' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{testResult.message || 'Checking…'}</span>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101010] p-3.5 sm:p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <Trash2 className="h-4 w-4 text-neutral-400" /> Temporary history cleanup
        </div>
        <p className="mb-4 text-[11px] leading-relaxed text-neutral-500">
          These controls are temporary maintenance tools. They clear historical records only; they do not stop token discovery or remove active market subscriptions.
        </p>
        <div className="space-y-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="text-xs font-semibold text-white">1. Clear browser local storage</div>
          <p className="text-[11px] leading-relaxed text-neutral-500">Clears NodeX browser display history and NodeX-prefixed local-storage entries. Your saved connection details and operator key are kept. This does not delete backend database records.</p>
          <button onClick={handleClearLocalStorage} className="w-full rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2.5 text-xs font-semibold text-white active:scale-[.99]">Clear local browser data</button>
          {localClearMessage && <p className="text-[11px] leading-relaxed text-neutral-400">{localClearMessage}</p>}
        </div>
        <div className="mt-3 space-y-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.025] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            <ShieldAlert className="h-4 w-4 text-amber-300" /> 2. Clear backend token and event history
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-400">
            Deletes rows only from <code>token_launches</code> and <code>solana_raw_events</code>. It does not clear active monitored-token subscriptions, paper wallet balances, paper ledger, users, database schema, environment variables, or application code.
          </p>
          <label className="block space-y-1.5">
            <span className="text-[11px] font-medium text-neutral-400">Backend maintenance key</span>
            <input type="password" value={adminKey} onChange={(event) => setAdminKey(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Enter NODEX_ADMIN_API_KEY" className="w-full min-w-0 rounded-xl border border-white/10 bg-[#080808] px-3 py-3 text-xs text-white outline-none focus:border-white/30" />
          </label>
          <button onClick={handleClearEngineHistory} disabled={cleanupStatus === 'working'} className="w-full rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2.5 text-xs font-semibold text-red-200 disabled:opacity-50 active:scale-[.99]">
            {cleanupStatus === 'working' ? 'Clearing backend history…' : 'Clear backend token & event history'}
          </button>
          {cleanupMessage && <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] leading-relaxed text-neutral-300">{cleanupMessage}</div>}
        </div>
      </section>

      <details className="group rounded-2xl border border-white/10 bg-[#101010]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold text-white">
          <span className="flex items-center gap-2"><Database className="h-4 w-4 text-neutral-400" /> API routes and event contract</span>
          <ChevronDown className="h-4 w-4 text-neutral-500 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-white/[0.07] p-3">
          <p className="text-[11px] leading-relaxed text-neutral-500">These are the routes present in the current Rust router. Planned dashboard-summary and positions routes are deliberately not listed as available.</p>
          {implementedRoutes.map(([method, path, description]) => (
            <div key={path} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold text-emerald-400">{method}</span><code className="break-all text-[11px] text-white">{path}</code></div>
              <p className="mt-1 text-[10px] text-neutral-500">{description}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};

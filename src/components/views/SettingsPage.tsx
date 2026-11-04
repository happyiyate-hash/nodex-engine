import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { Check, AlertCircle, RefreshCw, Lock, Server, Radio, Database, ChevronDown } from 'lucide-react';

type HealthResult = { status: 'idle' | 'testing' | 'success' | 'failed'; message?: string };

const implementedRoutes = [
  ['GET', '/health', 'HTTP health response'],
  ['GET', '/api/v1/engine/status', 'Engine pause state and Solana stream status'],
  ['GET', '/api/v1/paper-wallet', 'Persistent personal paper wallet'],
  ['GET', '/api/v1/tokens/recent', 'Persisted confirmed token launches'],
  ['GET', '/api/v1/events/recent', 'Persisted raw-event history (internal; not browser feed)'],
  ['GET', '/api/v1/tokens/:mint/scan', 'On-demand token security scan'],
  ['GET', '/api/v1/fees/token-account-rent', 'Solana token-account rent estimate'],
  ['WS', '/api/v1/ws', 'Curated application events and engine commands'],
] as const;

export const SettingsPage: React.FC = () => {
  const { engineStatus, toggleEngine, settings, updateSettings, backendError } = useTerminal();
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [wsUrl, setWsUrl] = useState(settings.wsUrl);
  const [testResult, setTestResult] = useState<HealthResult>({ status: 'idle' });
  const [savedNotice, setSavedNotice] = useState(false);

  const handleTestBackend = async () => {
    const baseUrl = backendUrl.trim().replace(/\\/$/, '');
    if (!/^https?:\\/\\//i.test(baseUrl)) {
      setTestResult({ status: 'failed', message: 'Enter a valid HTTPS backend URL.' });
      return;
    }
    setTestResult({ status: 'testing', message: 'Checking the Rust health endpoint…' });
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });
      const body = await response.text();
      if (!response.ok) {
        setTestResult({ status: 'failed', message: `Health endpoint returned HTTP ${response.status}: ${body.slice(0, 180)}` });
        return;
      }
      let health: { status?: string; mode?: string; service?: string };
      try { health = JSON.parse(body); } catch {
        setTestResult({ status: 'failed', message: 'The server responded, but /health did not return valid JSON.' });
        return;
      }
      if (health.status !== 'ok') {
        setTestResult({ status: 'failed', message: `Server responded, but reported status: ${health.status || 'unknown'}.` });
        return;
      }
      setTestResult({ status: 'success', message: `API reachable · ${health.service || 'NodeX'} · ${health.mode || 'mode unknown'} mode` });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setTestResult({ status: 'failed', message: 'Health check timed out after 10 seconds. The server did not answer in time.' });
      } else if (error instanceof TypeError) {
        setTestResult({ status: 'failed', message: 'Browser could not read the response. Check HTTPS/TLS and backend CORS settings.' });
      } else {
        setTestResult({ status: 'failed', message: error instanceof Error ? error.message : 'Health check failed unexpectedly.' });
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const handleSaveSettings = () => {
    updateSettings({ backendUrl: backendUrl.trim(), wsUrl: wsUrl.trim() });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  const streamActive = !engineStatus.strategy_paused;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-4 pb-28 sm:px-5 lg:px-6 lg:py-6">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">Controls & Connection</h1>
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[10px] font-mono text-amber-300">PAPER ONLY</span>
        </div>
        <p className="text-xs text-neutral-500">Private NodeX workstation · Rust Axum backend</p>
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
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-[11px] leading-relaxed text-neutral-500">
            Only public service addresses are saved in this browser. Never put RPC keys, passwords, seed phrases, or private keys here.
          </div>
          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button onClick={handleSaveSettings} className="rounded-xl bg-white px-4 py-3 text-xs font-semibold text-black active:scale-[.99]">{savedNotice ? 'Saved' : 'Save connection'}</button>
            <button onClick={handleTestBackend} disabled={testResult.status === 'testing'} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-xs font-medium text-white disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${testResult.status === 'testing' ? 'animate-spin' : ''}`} /> Test API health
            </button>
          </div>
          {testResult.status !== 'idle' && (
            <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${testResult.status === 'success' ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300' : testResult.status === 'failed' ? 'border-red-500/20 bg-red-500/[0.06] text-red-200' : 'border-white/10 bg-white/[0.03] text-neutral-300'}`}>
              {testResult.status === 'success' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{testResult.message || 'Checking…'}</span>
            </div>
          )}
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

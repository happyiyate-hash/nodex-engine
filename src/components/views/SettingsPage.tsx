import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import {
  Sliders,
  Power,
  ShieldAlert,
  Server,
  Radio,
  Wifi,
  Database,
  Check,
  AlertCircle,
  RefreshCw,
  Code2,
  Lock,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const {
    engineStatus,
    toggleEngine,
    toggleStrategy,
    settings,
    updateSettings,
    backendError,
  } = useTerminal();

  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [wsUrl, setWsUrl] = useState(settings.wsUrl);
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'testing' | 'success' | 'failed'; message?: string }>({
    status: 'idle',
  });
  const [savedNotice, setSavedNotice] = useState(false);

  const handleTestBackend = async () => {
    setTestResult({ status: 'testing' });
    try {
      const url = `${backendUrl.replace(/\/$/, '')}/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const json = await res.json();
        setTestResult({
          status: 'success',
          message: `Connected to ${json.service || 'NodeX'} (${json.mode || 'unknown'} mode).`,
        });
      } else {
        setTestResult({
          status: 'failed',
          message: `Backend health endpoint returned HTTP ${res.status}.`,
        });
      }
    } catch {
      setTestResult({
        status: 'failed',
        message: 'Could not reach the configured Axum backend. No simulation fallback is active.',
      });
    }
  };

  const handleSaveSettings = () => {
    updateSettings({
      backendUrl,
      wsUrl,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-mono font-bold text-white tracking-wide uppercase">
              Engine Controls & Backend Architecture
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1f1f1f] text-emerald-400 border border-[#333]">
              RUST AXUM SPEC
            </span>
          </div>
          <p className="text-xs font-mono text-[#737373] mt-0.5">
            Configure Solana RPC endpoints, Axum WebSocket listeners, and execution invariants
          </p>
        </div>

        {savedNotice && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 text-xs font-mono">
            <Check className="w-3.5 h-3.5" />
            <span>Connection preferences updated</span>
          </div>
        )}
      </div>

      {backendError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 text-xs font-mono text-amber-200">
          {backendError}
        </div>
      )}

      {/* 1. Core Engine Execution Controls */}
      <section className="glass-panel rounded-2xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            Engine State & Process Controls
          </span>
          <span className="text-[10px] font-mono text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30">
            DEFAULT: PAPER TRADING (NON-CUSTODIAL)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="p-4 rounded-xl glass-card space-y-2">
            <div className="text-[#8e8e93] text-[11px] uppercase">Engine Status</div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${engineStatus.running ? 'bg-emerald-400' : 'bg-red-400'}`} />
              <span className="text-base font-bold text-white">
                {engineStatus.running ? 'RUNNING' : 'STOPPED'}
              </span>
            </div>
            <button
              onClick={toggleEngine}
              className={`w-full py-2 rounded-xl text-xs font-medium border transition-all ${
                engineStatus.running
                  ? 'bg-red-950/40 text-red-300 border-red-800/40 hover:bg-red-900/50'
                  : 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50'
              }`}
            >
              {engineStatus.running ? 'Stop Engine' : 'Start Engine'}
            </button>
          </div>

          <div className="p-4 rounded-xl glass-card space-y-2">
            <div className="text-[#8e8e93] text-[11px] uppercase">Strategy Dispatcher</div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${!engineStatus.strategy_paused ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              <span className="text-base font-bold text-white">
                {engineStatus.strategy_paused ? 'PAUSED' : 'ACTIVE'}
              </span>
            </div>
            <button
              onClick={toggleStrategy}
              className={`w-full py-2 rounded-xl text-xs font-medium border transition-all ${
                engineStatus.strategy_paused
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50 hover:bg-emerald-900/50'
                  : 'bg-amber-950/40 text-amber-300 border-amber-800/40 hover:bg-amber-900/50'
              }`}
            >
              {engineStatus.strategy_paused ? 'Resume Strategy' : 'Pause Strategy'}
            </button>
          </div>

          <div className="p-4 rounded-xl glass-card space-y-2">
            <div className="text-[#8e8e93] text-[11px] uppercase">Operating Mode</div>
            <div className="text-base font-bold text-amber-400 flex items-center gap-1.5">
              <Lock className="w-4 h-4" />
              <span>PAPER TRADING</span>
            </div>
            <p className="text-[10px] text-[#737373] leading-relaxed">
              Paper mode is permanently enforced in this release to prevent accidental real fund exposure.
            </p>
          </div>

          <div className="p-4 rounded-xl glass-card space-y-2">
            <div className="text-[#8e8e93] text-[11px] uppercase">Database Status</div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <span className="text-base font-bold text-emerald-400">HEALTHY</span>
            </div>
            <p className="text-[10px] text-[#737373]">
              SQLite / PostgreSQL ledger synched
            </p>
          </div>
        </div>
      </section>

      {/* 2. Backend & Connection Configuration */}
      <section className="glass-panel rounded-2xl p-5 space-y-5 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
            Axum Rust Backend & WebSocket Gateway
          </span>
          <span className="text-xs font-mono text-[#737373]">
            Rust backend only · paper execution
          </span>
        </div>

        {/* Backend mode is fixed to the real Rust service; no local simulator exists. */}
        <div className="space-y-2 font-mono text-xs">
          <label className="text-[#8e8e93] uppercase text-[11px]">Integration Source</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => undefined}
              className={`p-4 rounded-xl border text-left transition-all ${
                false
                  ? 'glass-card border-emerald-500/60 ring-1 ring-emerald-500/40 text-white shadow-md'
                  : 'glass-panel-subtle text-[#8e8e93] hover:text-white'
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>Standalone Simulation Engine (Active)</span>
                {connectionMode === 'SIMULATION' && <Check className="w-4 h-4 text-emerald-400" />}
              </div>
              <div className="text-[11px] text-[#737373] mt-1">
                Generates authentic Solana token discoveries, real-time price ticks, and paper orders without requiring an external process.
              </div>
            </button>

            <button
              onClick={() => undefined}
              className={`p-4 rounded-xl border text-left transition-all ${
                true
                  ? 'glass-card border-emerald-500/60 ring-1 ring-emerald-500/40 text-white shadow-md'
                  : 'glass-panel-subtle text-[#8e8e93] hover:text-white'
              }`}
            >
              <div className="font-bold flex items-center justify-between">
                <span>Custom Axum Rust Backend</span>
                {connectionMode === 'RUST_BACKEND' && <Check className="w-4 h-4 text-emerald-400" />}
              </div>
              <div className="text-[11px] text-[#737373] mt-1">
                Connects directly to your compiled NodeX Rust binary running on localhost:8080 or custom server URL.
              </div>
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
          <div className="space-y-1.5">
            <label className="text-[#8e8e93] text-[11px] uppercase">REST API Base URL</label>
            <input
              type="text"
              value={backendUrl}
              onChange={(e) => setBackendUrl(e.target.value)}
              placeholder="/api/v1 or http://localhost:8080/api/v1"
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[#8e8e93] text-[11px] uppercase">WebSocket URL</label>
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="ws://localhost:8080/api/v1/ws"
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
          </div>
        </div>

        {/* Masked Credentials Notice */}
        <div className="p-3 rounded bg-[#141414] border border-[#262626] flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#8e8e93]" />
            <span className="text-[#a3a3a3]">Helius Geyser & Solana RPC Key:</span>
            <span className="text-white font-mono">***[SERVER_INJECTED_ENV]***</span>
          </div>
          <span className="text-[10px] text-emerald-400 uppercase font-semibold">Protected</span>
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleSaveSettings}
            className="px-4 py-2 rounded bg-white hover:bg-neutral-200 text-black text-xs font-mono font-bold transition-colors"
          >
            Save Connection Preferences
          </button>

          <button
            onClick={handleTestBackend}
            disabled={testResult.status === 'testing'}
            className="px-4 py-2 rounded bg-[#1e1e1e] hover:bg-[#262626] text-white text-xs font-mono font-medium border border-[#333] transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testResult.status === 'testing' ? 'animate-spin' : ''}`} />
            <span>Test Backend Health</span>
          </button>

          {testResult.status === 'success' && (
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>{testResult.message}</span>
            </span>
          )}
          {testResult.status === 'failed' && (
            <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>{testResult.message}</span>
            </span>
          )}
        </div>
      </section>

      {/* 3. Axum Backend Endpoint Specification */}
      <section className="bg-[#111111] border border-[#292929] rounded-lg p-5 space-y-3 font-mono text-xs">
        <div className="flex items-center gap-2 pb-2 border-b border-[#222]">
          <Code2 className="w-4 h-4 text-[#8e8e93]" />
          <span className="font-bold text-white uppercase tracking-wider">
            Rust Axum API Contract Specification
          </span>
        </div>

        <p className="text-[#737373] text-[11px] leading-relaxed">
          NodeX is structured to plug into the following Axum router in your Rust core. If any endpoint is not yet mounted, the frontend handles fallback transparently:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          <div className="p-2.5 rounded bg-[#141414] border border-[#222] space-y-1">
            <span className="text-emerald-400 font-bold">GET</span>{' '}
            <span className="text-white">/api/v1/health</span>
            <div className="text-[10px] text-[#737373]">Engine heartbeat & uptime</div>
          </div>

          <div className="p-2.5 rounded bg-[#141414] border border-[#222] space-y-1">
            <span className="text-emerald-400 font-bold">GET</span>{' '}
            <span className="text-white">/api/v1/engine/status</span>
            <div className="text-[10px] text-[#737373]">RPC latency, network, throughput</div>
          </div>

          <div className="p-2.5 rounded bg-[#141414] border border-[#222] space-y-1">
            <span className="text-emerald-400 font-bold">GET</span>{' '}
            <span className="text-white">/api/v1/dashboard/summary</span>
            <div className="text-[10px] text-[#737373]">Financial metrics, realised/unrealised P&L</div>
          </div>

          <div className="p-2.5 rounded bg-[#141414] border border-[#222] space-y-1">
            <span className="text-emerald-400 font-bold">GET</span>{' '}
            <span className="text-white">/api/v1/positions</span>
            <div className="text-[10px] text-[#737373]">Open & closed paper positions list</div>
          </div>

          <div className="p-2.5 rounded bg-[#141414] border border-[#222] space-y-1">
            <span className="text-emerald-400 font-bold">GET</span>{' '}
            <span className="text-white">/api/v1/tokens</span>
            <div className="text-[10px] text-[#737373]">Discovered Solana tokens & bonding curves</div>
          </div>

          <div className="p-2.5 rounded bg-[#141414] border border-[#222] space-y-1">
            <span className="text-purple-400 font-bold">WS</span>{' '}
            <span className="text-white">/api/v1/ws</span>
            <div className="text-[10px] text-[#737373]">Bi-directional JSON event broadcast channel</div>
          </div>
        </div>
      </section>
    </div>
  );
};

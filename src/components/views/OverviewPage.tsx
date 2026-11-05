import React from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { Activity, ArrowUpRight, Radio, Layers, Zap, Wallet, Terminal } from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const { engineStatus, launches, events, setActiveTab, paperWallet, backendError } = useTerminal();
  const availableSol = paperWallet ? paperWallet.available_balance_lamports / 1_000_000_000 : null;
  const investedSol = paperWallet ? paperWallet.invested_balance_lamports / 1_000_000_000 : null;

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 px-3 pb-8 pt-4 sm:px-5 lg:px-7">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">NodeX terminal</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Overview</h1>
        </div>
        <button onClick={() => setActiveTab('event_monitor')} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-xs text-neutral-300 backdrop-blur-xl transition hover:bg-white/[0.08]">
          <Terminal className="h-3.5 w-3.5" /> Event log <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {backendError && <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3 text-xs leading-relaxed text-amber-200">{backendError}</div>}

      <section className="glass-panel overflow-hidden rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-300">
            <Activity className="h-4 w-4 text-emerald-400" /> Engine overview
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-mono ${engineStatus.running ? 'bg-emerald-500/10 text-emerald-300' : 'bg-neutral-500/10 text-neutral-400'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${engineStatus.running ? 'bg-emerald-400' : 'bg-neutral-500'}`} />
            {engineStatus.running ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500"><Layers className="h-3 w-3" /> Tracked launches</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{launches.length}</div>
            <div className="mt-1 text-[10px] text-neutral-600">Persisted launch records</div>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500"><Radio className="h-3 w-3" /> WebSocket</div>
            <div className={`mt-2 text-lg font-semibold ${engineStatus.ws_status === 'connected' ? 'text-emerald-300' : 'text-amber-300'}`}>{engineStatus.ws_status.toUpperCase()}</div>
            <div className="mt-1 text-[10px] text-neutral-600">Live event transport</div>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500"><Zap className="h-3 w-3" /> Event rate</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums text-white">{engineStatus.incoming_event_rate.toFixed(1)}<span className="ml-1 text-xs font-normal text-neutral-500">/s</span></div>
            <div className="mt-1 text-[10px] text-neutral-600">Backend reported</div>
          </div>
          <div className="rounded-xl bg-black/20 p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-neutral-500"><Wallet className="h-3 w-3" /> Paper balance</div>
            <div className="mt-2 text-xl font-semibold tabular-nums text-white">{availableSol === null ? '—' : availableSol.toFixed(4)}<span className="ml-1 text-xs font-normal text-neutral-500">SOL</span></div>
            <div className="mt-1 text-[10px] text-neutral-600">{investedSol === null ? 'Wallet snapshot unavailable' : `${investedSol.toFixed(4)} SOL invested`}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.07] pt-3 text-[10px] font-mono text-neutral-500">
          <span>NETWORK <b className="ml-1 font-medium text-neutral-300">{engineStatus.network.toUpperCase()}</b></span>
          <span>RPC <b className={`ml-1 font-medium ${engineStatus.solana_connected ? 'text-emerald-300' : 'text-amber-300'}`}>{engineStatus.solana_connected ? 'CONNECTED' : 'DISCONNECTED'}</b></span>
          <span>MODE <b className="ml-1 font-medium text-amber-300">PAPER ONLY</b></span>
          <span>SIMULATED <b className="ml-1 font-medium text-neutral-300">{engineStatus.simulated_buys_count} buys / {engineStatus.simulated_sells_count} sells</b></span>
        </div>
      </section>

      <section className="glass-panel overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-white">Tracked token launches</h2>
            <p className="mt-0.5 text-[10px] text-neutral-500">Swipe horizontally to inspect recorded launches</p>
          </div>
          <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-mono text-neutral-400">{launches.length} records</span>
        </div>
        {launches.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Layers className="mx-auto h-6 w-6 text-neutral-700" />
            <p className="mt-3 text-sm text-neutral-400">No token launches received yet</p>
            <p className="mt-1 text-xs text-neutral-600">New launch records will appear here when the engine detects them.</p>
          </div>
        ) : (
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto p-3 sm:p-4">
            {launches.map((launch) => (
              <article key={launch.id} className="w-[250px] shrink-0 snap-start rounded-xl border border-white/[0.07] bg-gradient-to-br from-white/[0.055] to-white/[0.015] p-3.5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-mono uppercase text-emerald-300">Detected</span>
                  <span className="text-[9px] text-neutral-600">Slot {launch.slot || '—'}</span>
                </div>
                <div className="mt-4 text-sm font-semibold text-white">New Solana launch</div>
                <div className="mt-1 break-all font-mono text-[10px] leading-relaxed text-neutral-500">{launch.mint_address.slice(0, 9)}…{launch.mint_address.slice(-7)}</div>
                <div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[9px] text-neutral-500">
                  <span className="uppercase">{launch.source || 'Unknown source'}</span>
                  <span>{launch.detected_at ? new Date(launch.detected_at).toLocaleTimeString() : 'Time unavailable'}</span>
                </div>
                <button onClick={() => setActiveTab('live_feed')} className="mt-3 w-full rounded-lg bg-white/[0.06] py-2 text-[10px] font-medium text-neutral-300 transition hover:bg-white/[0.1]">Open live feed <ArrowUpRight className="ml-1 inline h-3 w-3" /></button>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3">
        <div>
          <p className="text-xs font-medium text-neutral-300">Recent engine activity</p>
          <p className="mt-0.5 text-[10px] text-neutral-600">{events.length} WebSocket events in the current session</p>
        </div>
        <button onClick={() => setActiveTab('event_monitor')} className="text-xs text-neutral-400 transition hover:text-white">View events <ArrowUpRight className="ml-1 inline h-3 w-3" /></button>
      </div>
    </div>
  );
};

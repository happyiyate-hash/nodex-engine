import React from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { Activity, ArrowUpRight, Radio, Layers, Zap, Wallet } from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const { engineStatus, launches, events, setActiveTab, paperWallet, backendError } = useTerminal();
  const availableSol = paperWallet ? paperWallet.available_balance_lamports / 1_000_000_000 : null;
  const investedSol = paperWallet ? paperWallet.invested_balance_lamports / 1_000_000_000 : null;

  return (
    <div className="w-full space-y-4 px-3 pb-8 pt-2 sm:px-5 lg:px-8">
      {backendError && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          {backendError}
        </div>
      )}

      <section className="glass-panel rounded-2xl px-3 py-3 sm:px-4 sm:py-3.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-neutral-400">
            <Activity className="h-3.5 w-3.5 text-emerald-400" /> Engine
          </div>
          <span className={`flex items-center gap-1.5 text-[9px] font-mono ${engineStatus.running ? 'text-emerald-300' : 'text-neutral-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${engineStatus.running ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
            {engineStatus.running ? 'RUNNING' : 'STOPPED'}
            <span className="ml-1 text-neutral-700">·</span>
            <span className="text-amber-300">PAPER</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div>
            <div className="flex items-center gap-1 text-[9px] text-neutral-500"><Layers className="h-3 w-3" /> Launches</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-white">{launches.length}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[9px] text-neutral-500"><Radio className="h-3 w-3" /> WebSocket</div>
            <div className={`mt-0.5 text-sm font-semibold ${engineStatus.ws_status === 'connected' ? 'text-emerald-300' : 'text-amber-300'}`}>{engineStatus.ws_status.toUpperCase()}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[9px] text-neutral-500"><Zap className="h-3 w-3" /> Event rate</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-white">{engineStatus.incoming_event_rate.toFixed(1)}<span className="ml-1 text-[9px] font-normal text-neutral-500">/s</span></div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[9px] text-neutral-500"><Wallet className="h-3 w-3" /> Available</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-white">{availableSol === null ? '—' : availableSol.toFixed(4)}<span className="ml-1 text-[9px] font-normal text-neutral-500">SOL</span></div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2 text-[9px] font-mono text-neutral-500">
          <span>{engineStatus.network.toUpperCase()}</span>
          <span className={engineStatus.solana_connected ? 'text-emerald-300' : 'text-neutral-500'}>RPC {engineStatus.solana_connected ? 'CONNECTED' : 'OFFLINE'}</span>
          <span>{investedSol === null ? 'Invested —' : `Invested ${investedSol.toFixed(4)} SOL`}</span>
          <span>{engineStatus.simulated_buys_count} buys / {engineStatus.simulated_sells_count} sells</span>
        </div>
      </section>

      <section className="w-full">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-neutral-200">Tracked launches</h2>
            <p className="mt-0.5 text-[9px] text-neutral-600">Recorded Solana token detections</p>
          </div>
          <span className="font-mono text-[9px] text-neutral-600">{launches.length} total</span>
        </div>

        {launches.length === 0 ? (
          <div className="glass-panel rounded-2xl px-4 py-8 text-center">
            <Layers className="mx-auto h-5 w-5 text-neutral-700" />
            <p className="mt-2 text-xs text-neutral-400">No token launches received yet</p>
            <p className="mt-1 text-[10px] text-neutral-600">New detections will appear here.</p>
          </div>
        ) : (
          <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1">
            {launches.map((launch) => (
              <article key={launch.id} className="w-[220px] shrink-0 snap-start glass-card rounded-2xl px-3 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase text-emerald-300">Detected</span>
                  <span className="text-[9px] text-neutral-600">Slot {launch.slot || '—'}</span>
                </div>
                <div className="mt-2 text-xs font-medium text-neutral-200">New Solana launch</div>
                <div className="mt-1 break-all font-mono text-[9px] text-neutral-500">{launch.mint_address.slice(0, 9)}…{launch.mint_address.slice(-7)}</div>
                <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[9px] text-neutral-600">
                  <span className="uppercase">{launch.source || 'Unknown'}</span>
                  <span>{launch.detected_at ? new Date(launch.detected_at).toLocaleTimeString() : '—'}</span>
                </div>
                <button onClick={() => setActiveTab('live_feed')} className="mt-2 text-[10px] text-neutral-400 hover:text-white">Open feed <ArrowUpRight className="ml-0.5 inline h-3 w-3" /></button>
              </article>
            ))}
          </div>
        )}
      </section>

      <button onClick={() => setActiveTab('event_monitor')} className="flex w-full items-center justify-between border-t border-white/[0.06] py-3 text-left">
        <span>
          <span className="block text-[11px] font-medium text-neutral-300">Engine activity</span>
          <span className="mt-0.5 block text-[9px] text-neutral-600">{events.length} events received this session</span>
        </span>
        <span className="text-[10px] text-neutral-500">Open events <ArrowUpRight className="ml-1 inline h-3 w-3" /></span>
      </button>
    </div>
  );
};

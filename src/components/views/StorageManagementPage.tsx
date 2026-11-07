import React, { useState } from 'react';
import {
  Activity, AlertTriangle, Archive, ArrowLeft, CheckCircle2, Coins, Database,
  FileText, Folder, HardDrive, Radar, RefreshCw, Terminal, Trash2, X,
} from 'lucide-react';

type StorageCategory = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  accent: string;
  tint: string;
  cleanable: boolean;
  note: string;
};

const categories: StorageCategory[] = [
  { id: 'tokens', title: 'Token data', description: 'Discovered tokens and intelligence records', icon: Coins, accent: 'text-sky-300', tint: 'bg-sky-400', cleanable: false, note: 'Token records remain protected.' },
  { id: 'events', title: 'Market events', description: 'Raw Solana events and market activity', icon: Activity, accent: 'text-violet-300', tint: 'bg-violet-400', cleanable: true, note: 'Event cleanup needs its own retention-safe backend operation.' },
  { id: 'discovery', title: 'Discovery data', description: 'Launch discovery and qualification history', icon: Radar, accent: 'text-cyan-300', tint: 'bg-cyan-400', cleanable: false, note: 'Discovery records remain protected.' },
  { id: 'engine-logs', title: 'Engine logs', description: 'NodeX output, warnings and backend errors', icon: FileText, accent: 'text-amber-300', tint: 'bg-amber-400', cleanable: false, note: 'Engine output is currently captured by the system journal. It cannot be cleaned separately yet.' },
  { id: 'system-logs', title: 'System logs', description: 'Linux journal and service messages', icon: Terminal, accent: 'text-rose-300', tint: 'bg-rose-400', cleanable: true, note: 'This operation affects archived system-wide journal data, not only NodeX logs.' },
  { id: 'database', title: 'SQLite database', description: 'Database, write-ahead log and shared memory', icon: Database, accent: 'text-emerald-300', tint: 'bg-emerald-400', cleanable: false, note: 'Database files, wallet data and paper-trading history are protected.' },
  { id: 'other', title: 'Other files', description: 'Remaining engine and host files', icon: Folder, accent: 'text-orange-300', tint: 'bg-orange-400', cleanable: false, note: 'Other files must be inspected before any cleanup.' },
];

export const StorageManagementPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [selected, setSelected] = useState<StorageCategory | null>(null);
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    setNotice('Live storage readings will appear here when the app is connected to the storage overview API.');
    window.setTimeout(() => setRefreshing(false), 350);
  };

  const confirmCleanup = () => {
    setSelected(null);
    setNotice('No files were deleted. Connect the approved cleanup operation before running this action.');
  };

  return (
    <div className="relative min-h-full w-full space-y-4 bg-black px-4 pb-8 pt-[calc(env(safe-area-inset-top)+14px)] text-white">
      <div className="pointer-events-none fixed right-4 top-[calc(env(safe-area-inset-top)+12px)] z-50">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-[#17130c]/95 px-3 py-2 text-[10px] font-semibold text-amber-200 shadow-[0_8px_28px_rgba(0,0,0,.45)] backdrop-blur-xl">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-300" />
          </span>
          Awaiting backend
        </span>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-end gap-3">
          <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh storage overview" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition-colors hover:bg-white/[0.08] disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <section className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#181818] px-4 py-3.5 shadow-[0_8px_24px_rgba(0,0,0,.18)]">
          <div>
            <div className="flex items-center gap-2 text-white/55">
              <HardDrive className="h-4 w-4" />
              <span className="text-[11px] font-medium">Root storage capacity</span>
            </div>
            <div className="mt-2.5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[25px] font-semibold leading-none tracking-tight text-white tabular-nums">— <span className="text-[13px] font-medium text-white/45">GB free</span></p>
                <p className="mt-2 text-[10px] text-white/40">Remaining storage</p>
              </div>
              <div className="text-right">
                <p className="text-[17px] font-semibold leading-none text-white/85 tabular-nums">— GB</p>
                <p className="mt-2 text-[10px] text-white/40">Total capacity</p>
              </div>
            </div>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/[0.10]">
              <div className="h-full w-0 rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-white/45">
              <span>Used: — GB</span>
              <span>—% used</span>
            </div>
            <div className="mt-3 flex items-start gap-2 border-t border-white/[0.07] pt-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
              <p className="text-[10px] leading-relaxed text-white/45">Filesystem capacity is shown separately from the attached EC2 disk size. Values will populate from the backend.</p>
            </div>
          </div>
        </section>
      </div>

      <section>
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">Storage breakdown</h2>
            <p className="mt-1 text-[10px] text-white/40">Usage by engine data category</p>
          </div>
          <span className="text-[9px] text-white/30">7 categories</span>
        </div>

        <div className="divide-y divide-white/[0.075]">
          {categories.map(({ id, title, description, icon: Icon, accent, tint, cleanable, note }) => (
            <div key={id} className="py-2.5">
              <div className="flex items-center gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] ${accent}`}>
                  <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12px] font-semibold text-white/90">{title}</p>
                    <p className="shrink-0 text-[11px] font-semibold tabular-nums text-white/65">—</p>
                  </div>
                  <p className="mt-0.5 text-[10px] text-white/38">{description}</p>
                </div>
                <div className="ml-1 flex shrink-0 items-center gap-1.5">
                  {cleanable ? (
                    <button type="button" onClick={() => { setNotice(''); setSelected({ id, title, description, icon: Icon, accent, tint, cleanable, note }); }} aria-label={`Clean ${title}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.12] px-3 text-[9px] font-semibold text-white/65 transition-colors hover:bg-white/[0.07]">
                      <Trash2 className="h-3 w-3" /> Clean
                    </button>
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-white/25" />
                  )}
                </div>
              </div>
              <div className="ml-11 mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={`h-full w-0 rounded-full ${tint}`} />
              </div>
              <p className="ml-11 mt-1 text-[9px] text-white/30">Not measured</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-start gap-3 border-t border-white/[0.08] pt-4">
        <Archive className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
        <div>
          <p className="text-[11px] font-semibold text-white/75">Protected storage</p>
          <p className="mt-1 text-[10px] leading-relaxed text-white/38">Wallet data, paper balances, trades and the SQLite database are never included in routine log cleanup.</p>
        </div>
      </div>

      {notice && <div role="status" className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-3 text-[10px] leading-relaxed text-amber-100/75">{notice}</div>}

      <div className="flex justify-start pt-1">
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-6 text-[12px] font-semibold text-black shadow-[0_5px_20px_rgba(255,255,255,.10)] transition-transform active:scale-[0.97]">
          <ArrowLeft className="h-4 w-4" strokeWidth={2.3} />
          Back
        </button>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 px-0 backdrop-blur-sm sm:items-center sm:px-4" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="storage-clean-title" className="w-full max-w-lg rounded-t-[26px] border border-white/[0.10] bg-[#111315] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 shadow-[0_-18px_60px_rgba(0,0,0,.65)] sm:rounded-[26px]">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05]"><Trash2 className="h-4 w-4 text-white/70" /></span>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close cleanup confirmation" className="rounded-full p-2 text-white/45 hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
            </div>
            <h2 id="storage-clean-title" className="text-[15px] font-semibold text-white">Confirm {selected.title.toLowerCase()} cleanup?</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-white/50">{selected.note}</p>
            <div className="mt-4 rounded-2xl border border-amber-400/15 bg-amber-400/[0.045] p-3">
              <p className="text-[10px] leading-relaxed text-amber-100/75">Cleanup is not connected to this control yet. Confirming will not delete anything.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setSelected(null)} className="min-h-11 flex-1 rounded-full border border-white/[0.12] bg-white/[0.035] text-[11px] font-semibold text-white/70">Cancel</button>
              <button type="button" onClick={confirmCleanup} className="min-h-11 flex-1 rounded-full bg-white text-[11px] font-bold text-black">Acknowledge</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

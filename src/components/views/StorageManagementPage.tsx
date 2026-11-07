import React, { useState } from 'react';
import {
  Activity, AlertTriangle, Archive, CheckCircle2, Coins, Database,
  FileText, Folder, HardDrive, Radar, RefreshCw, Terminal, Trash2, X,
} from 'lucide-react';

type StorageCategory = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  cleanable: boolean;
  note: string;
};

const categories: StorageCategory[] = [
  { id: 'tokens', title: 'Token data', description: 'Discovered tokens, metadata and token intelligence records.', icon: Coins, cleanable: false, note: 'Token records are protected from log cleanup.' },
  { id: 'events', title: 'Market events', description: 'Raw Solana events, decoded activity and event history.', icon: Activity, cleanable: true, note: 'Event history cleanup will be available through a dedicated backend operation.' },
  { id: 'discovery', title: 'Discovery data', description: 'Launch discovery, qualification and scan records.', icon: Radar, cleanable: false, note: 'Discovery records are protected from log cleanup.' },
  { id: 'engine-logs', title: 'Engine logs', description: 'NodeX application output, warnings and backend errors.', icon: FileText, cleanable: true, note: 'Only rotated or archived NodeX logs should be removed. The active log must remain intact.' },
  { id: 'system-logs', title: 'System logs', description: 'Linux system journal and service-level messages.', icon: Terminal, cleanable: true, note: 'System journal cleanup requires a narrowly scoped privileged backend operation.' },
  { id: 'database', title: 'SQLite database', description: 'Database files, write-ahead log and shared-memory files.', icon: Database, cleanable: false, note: 'Database files are never removed by log cleanup.' },
  { id: 'other', title: 'Other files', description: 'Other files and directories used by the engine.', icon: Folder, cleanable: false, note: 'Inspect before changing or deleting any files.' },
];

const MetricCard = ({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: React.ElementType }) => (
  <div className="min-w-0 rounded-2xl border border-white/[0.09] bg-[#111113] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-medium text-white/45">{label}</span>
      <Icon className="h-4 w-4 text-white/35" strokeWidth={1.8} />
    </div>
    <p className="mt-3 text-[27px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
    <p className="mt-2 text-[10px] text-white/35">{detail}</p>
  </div>
);

export const StorageManagementPage: React.FC = () => {
  const [selected, setSelected] = useState<StorageCategory | null>(null);
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    setNotice('Storage metrics will populate when the backend storage overview endpoint is available.');
    window.setTimeout(() => setRefreshing(false), 350);
  };

  const confirmCleanup = () => {
    setSelected(null);
    setNotice('No files were deleted. The backend cleanup endpoint must be implemented and connected before cleanup can run.');
  };

  return (
    <div className="space-y-5 pb-8 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-white">Storage overview</p>
          <p className="mt-1 text-[10px] leading-relaxed text-white/40">Live disk and data usage for the NodeX engine host.</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1.5 text-[9px] font-medium text-amber-200/80">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          Awaiting backend
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard label="Total disk capacity" value="—" detail="Physical / virtual EC2 disk" icon={HardDrive} />
        <MetricCard label="Available space" value="—" detail="Free space on root filesystem" icon={Database} />
      </div>

      <section className="rounded-2xl border border-white/[0.09] bg-[#111113] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold text-white/90">Storage utilization</p>
            <p className="mt-1 text-[10px] text-white/35">Filesystem usage, not just the attached disk size</p>
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-white/50">—%</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/[0.08]">
          <div className="h-full w-0 rounded-full bg-white/75" />
        </div>
        <div className="mt-2 flex justify-between text-[9px] text-white/35">
          <span>Used: —</span><span>Free: —</span>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-200/65" />
          <p className="text-[10px] leading-relaxed text-white/45">The earlier terminal output showed an 80 GB NVMe device but an 8 GB root partition. This page will report both values separately once the backend metrics API is connected.</p>
        </div>
      </section>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-white">Storage breakdown</p>
          <p className="mt-1 text-[10px] text-white/35">Select a category to inspect its files and usage.</p>
        </div>
        <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.10] bg-white/[0.035] px-3 text-[10px] font-medium text-white/65 transition-colors hover:bg-white/[0.07] disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="space-y-2.5">
        {categories.map(({ id, title, description, icon: Icon, cleanable, note }) => (
          <section key={id} className="rounded-2xl border border-white/[0.085] bg-[#101012] p-3.5 transition-colors hover:border-white/[0.14]">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.045] text-white/65">
                <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-white/90">{title}</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-white/40">{description}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-semibold tabular-nums text-white/65">—</p>
                <p className="mt-0.5 text-[9px] text-white/30">Not measured</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
              <span className="text-[9px] text-white/30">{cleanable ? 'Cleanup eligible · confirmation required' : 'Protected category'}</span>
              {cleanable ? (
                <button type="button" onClick={() => { setNotice(''); setSelected({ id, title, description, icon: Icon, cleanable, note }); }} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.045] px-3 text-[10px] font-semibold text-white/75 transition-colors hover:bg-white/[0.09]">
                  <Trash2 className="h-3 w-3" /> Clean
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 text-[9px] text-white/35"><CheckCircle2 className="h-3 w-3" /> Protected</span>
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="flex items-center gap-2">
          <Archive className="h-4 w-4 text-white/45" />
          <p className="text-[11px] font-semibold text-white/75">Safe cleanup policy</p>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-white/40">Cleanup will target only the selected category. Active logs, SQLite databases, wallet data and paper-trading records must remain protected unless a separate explicit maintenance operation is designed for them.</p>
      </div>

      {notice && <div role="status" className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-3 text-[10px] leading-relaxed text-amber-100/75">{notice}</div>}

      {selected && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 px-0 backdrop-blur-sm sm:items-center sm:px-4" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="storage-clean-title" className="w-full max-w-lg rounded-t-2xl border border-white/[0.10] bg-[#111113] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 shadow-[0_-18px_60px_rgba(0,0,0,.65)] sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05]"><Trash2 className="h-4 w-4 text-white/70" /></span>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close cleanup confirmation" className="rounded-lg p-2 text-white/45 hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
            </div>
            <h2 id="storage-clean-title" className="text-[15px] font-semibold text-white">Confirm {selected.title.toLowerCase()} cleanup?</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-white/50">{selected.note}</p>
            <div className="mt-4 rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-3">
              <p className="text-[10px] leading-relaxed text-amber-100/75">Storage cleanup is not connected yet. Confirming here will not delete anything until the backend cleanup endpoint is implemented.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setSelected(null)} className="min-h-11 flex-1 rounded-xl border border-white/[0.12] bg-white/[0.035] text-[11px] font-semibold text-white/70">Cancel</button>
              <button type="button" onClick={confirmCleanup} className="min-h-11 flex-1 rounded-xl bg-white text-[11px] font-bold text-black">Acknowledge</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, Archive, ArrowLeft, CheckCircle2, Coins, Database,
  FileText, Folder, HardDrive, Radar, RefreshCw, Signal, Terminal, Trash2, X, KeyRound,
} from 'lucide-react';
import { apiClient, StorageOverview } from '../../services/rest';

type BrowserStorageEstimate = { usage: number | null; quota: number | null };

const getBrowserStorageEstimate = async (): Promise<BrowserStorageEstimate> => {
  try {
    const estimate = await navigator.storage?.estimate();
    return {
      usage: typeof estimate?.usage === 'number' ? estimate.usage : null,
      quota: typeof estimate?.quota === 'number' && estimate.quota > 0 ? estimate.quota : null,
    };
  } catch {
    return { usage: null, quota: null };
  }
};

const formatMegabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

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
  { id: 'launches', title: 'Launch records', description: 'Detected token launches and qualification history', icon: Radar, accent: 'text-cyan-300', tint: 'bg-cyan-400', cleanable: false, note: 'Launch history remains protected.' },
  { id: 'events', title: 'Market events', description: 'Raw Solana events and market activity', icon: Activity, accent: 'text-violet-300', tint: 'bg-violet-400', cleanable: false, note: 'The backend measures event records. A retention-safe event cleanup endpoint is not implemented, so no event data can be deleted here.' },
  { id: 'discovery', title: 'Discovery data', description: 'Launch discovery and qualification history', icon: Radar, accent: 'text-cyan-300', tint: 'bg-cyan-400', cleanable: false, note: 'Discovery data is represented by launch records and overlaps Launch records.' },
  { id: 'chart_data', title: 'Chart data', description: 'Stored chart candles and price history', icon: Activity, accent: 'text-indigo-300', tint: 'bg-indigo-400', cleanable: false, note: 'Chart history is measured by the backend and is protected from cleanup.' },
  { id: 'paper_trading', title: 'Paper trading', description: 'Paper ledger and simulated positions', icon: Coins, accent: 'text-emerald-300', tint: 'bg-emerald-400', cleanable: false, note: 'Paper balances, ledger entries and simulated positions are protected.' },
  { id: 'engine_logs', title: 'Engine logs', description: 'NodeX output, warnings and backend errors', icon: FileText, accent: 'text-amber-300', tint: 'bg-amber-400', cleanable: false, note: 'Engine output is captured by the system journal and cannot be isolated from system-wide journal storage.' },
  { id: 'system_logs', title: 'System logs', description: 'Linux journal and service messages', icon: Terminal, accent: 'text-rose-300', tint: 'bg-rose-400', cleanable: true, note: 'Cleanup affects archived system-wide journal data, not only NodeX logs. The backend must have OS permission and NODEX_ALLOW_SYSTEM_JOURNAL_CLEANUP=true.' },
  { id: 'database', title: 'SQLite database', description: 'Database, write-ahead log and shared memory', icon: Database, accent: 'text-emerald-300', tint: 'bg-emerald-400', cleanable: false, note: 'Database files, wallet data and paper-trading history are protected.' },
  { id: 'local-storage', title: 'Local storage', description: 'Browser tokens, settings, cache and app records', icon: KeyRound, accent: 'text-fuchsia-300', tint: 'bg-fuchsia-400', cleanable: true, note: 'Clears browser storage for this app origin. This may sign you out and reset locally saved preferences.' },
  { id: 'other', title: 'Other files', description: 'Remaining engine and host files', icon: Folder, accent: 'text-orange-300', tint: 'bg-orange-400', cleanable: false, note: 'Other files are not currently attributed by the backend and must be inspected before cleanup.' },
];

export const StorageManagementPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [selected, setSelected] = useState<StorageCategory | null>(null);
  const [showCleanupConfirmation, setShowCleanupConfirmation] = useState(false);
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [browserStorage, setBrowserStorage] = useState<BrowserStorageEstimate>({ usage: null, quota: null });
  const [serverStorage, setServerStorage] = useState<StorageOverview | null>(null);
  const [serverStorageError, setServerStorageError] = useState('');
  const [lastServerRefresh, setLastServerRefresh] = useState<string | null>(null);
  const localStorageBytes = browserStorage.usage ?? 0;
  const localStorageProgress = browserStorage.usage !== null && browserStorage.quota !== null
    ? Math.min(100, (browserStorage.usage / browserStorage.quota) * 100)
    : null;
  const browserStorageRemaining = browserStorage.usage !== null && browserStorage.quota !== null
    ? Math.max(0, browserStorage.quota - browserStorage.usage)
    : null;

  const refresh = async (showNotice = true) => {
    setRefreshing(true);
    const browserEstimate = await getBrowserStorageEstimate();
    setBrowserStorage(browserEstimate);
    try {
      const overview = await apiClient.getStorageOverview();
      setServerStorage(overview);
      setServerStorageError('');
      setLastServerRefresh(overview.updated_at);
      if (showNotice) setNotice('Browser and server storage readings refreshed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load server storage overview.';
      setServerStorageError(message);
      if (showNotice) setNotice(`Browser storage refreshed. Server storage could not be loaded: ${message}`);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh(false);
  }, []);

  const confirmCleanup = async () => {
    if (selected?.id === 'local-storage') {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();

        if ('caches' in window) {
          const cacheNames = await window.caches.keys();
          await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
        }

        if ('databases' in indexedDB) {
          const databases = await (indexedDB as IDBFactory & { databases: () => Promise<Array<{ name?: string }>> }).databases();
          await Promise.all(databases.map((database) => database.name ? new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(database.name!);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
          }) : Promise.resolve()));
        }

        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }

        setBrowserStorage(await getBrowserStorageEstimate());
        setShowCleanupConfirmation(false);
        setSelected(null);
        setNotice('Browser storage cleanup completed. You may need to sign in again or restore app preferences.');
      } catch {
        setNotice('The browser blocked part of the storage cleanup. Some stored data may remain.');
      }
      return;
    }
    if (selected?.id === 'system_logs') {
      setShowCleanupConfirmation(false);
      setNotice('Cleaning system journal…');
      try {
        const result = await apiClient.cleanupSystemJournal();
        setServerStorage(result.overview);
        setLastServerRefresh(result.overview.updated_at);
        setNotice(result.bytes_freed === null
          ? 'System journal cleanup completed. The backend could not calculate the exact space freed.'
          : `System journal cleanup completed. Freed ${formatMegabytes(result.bytes_freed)}.`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'System journal cleanup failed.');
      }
      setSelected(null);
      return;
    }
    setShowCleanupConfirmation(false);
    setNotice('No files were deleted. This category does not have an active cleanup operation.');
    setSelected(null);
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black px-0 text-white">
      <div className="relative w-full shrink-0">
        <section className="relative w-full overflow-hidden rounded-b-xl border-x border-b border-white/[0.07] bg-[#181818] px-3 pb-3.5 pt-[calc(env(safe-area-inset-top)+3.25rem)] shadow-[0_8px_24px_rgba(0,0,0,.18)]">
          <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.55rem)] inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-[#121212] px-2 text-[9px] font-medium text-white/45">
            <Signal className="h-3 w-3 text-white/35" strokeWidth={1.8} />
            {serverStorage ? 'Live snapshot' : 'Awaiting'}
          </div>
          <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+0.35rem)]">
            <button type="button" onClick={refresh} disabled={refreshing} aria-label="Refresh storage overview" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition-colors hover:bg-white/[0.08] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2 text-white/55">
              <HardDrive className="h-4 w-4" />
              <span className="text-[11px] font-medium">Root storage capacity</span>
            </div>
            <div className="mt-2.5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[25px] font-semibold leading-none tracking-tight text-white tabular-nums">
                  {serverStorage?.disk ? (serverStorage.disk.available_bytes / (1024 ** 3)).toFixed(2) : '—'} <span className="text-[13px] font-medium text-white/45">GB free</span>
                </p>
                <p className="mt-2 text-[10px] text-white/40">Remaining filesystem space</p>
              </div>
              <div className="text-right">
                <p className="text-[17px] font-semibold leading-none text-white/85 tabular-nums">{serverStorage?.disk ? `${(serverStorage.disk.total_bytes / (1024 ** 3)).toFixed(2)} GB` : '— GB'}</p>
                <p className="mt-2 text-[10px] text-white/40">Total capacity</p>
              </div>
            </div>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/[0.10]">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300" style={{ width: serverStorage?.disk ? `${Math.min(100, serverStorage.disk.used_bytes / Math.max(1, serverStorage.disk.total_bytes) * 100)}%` : '0%' }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-white/45">
              <span>Used: {serverStorage?.disk ? `${(serverStorage.disk.used_bytes / (1024 ** 3)).toFixed(2)} GB` : '— GB'}</span>
              <span>{serverStorage?.disk ? `${serverStorage.disk.used_percent} used` : '—% used'}</span>
            </div>
            <div className="mt-3 flex items-start gap-2 border-t border-white/[0.07] pt-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
              <p className="text-[10px] leading-relaxed text-white/45">
                {serverStorageError || (serverStorage?.disk ? `Filesystem: ${serverStorage.disk.filesystem}. Values are from the backend root filesystem snapshot.` : 'Waiting for the authenticated backend storage overview. Check the backend URL and operator key in Settings.')}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-4">
      <section className="w-full px-3">
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">Storage breakdown</h2>
            <p className="mt-1 text-[10px] text-white/40">Usage by engine data category</p>
          </div>
          <span className="text-[9px] text-white/30">10 server · 1 browser</span>
        </div>

        <div className="divide-y divide-white/[0.075]">
          {categories.map((category) => {
            const { id, title, description, icon: Icon, accent, tint } = category;
            const isLocalStorage = id === 'local-storage';
            const serverCategory = serverStorage?.categories?.[id as keyof StorageOverview['categories']];
            const categoryBytes = isLocalStorage ? browserStorage.usage : (serverCategory?.physical_bytes ?? serverCategory?.logical_bytes ?? (id === 'system_logs' ? serverStorage?.system_journal.reported_size_bytes : null));
            const categoryRecords = serverCategory?.records;
            const categoryNote = isLocalStorage ? category.note : (serverCategory?.note || category.note);
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setNotice(''); setSelected(category); }}
                className="block w-full py-2.5 text-left transition-colors active:bg-white/[0.025]"
                aria-label={`View ${title} storage details`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] ${accent}`}>
                    <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold text-white/90">{title}</p>
                      <p className="shrink-0 text-[11px] font-semibold tabular-nums text-white/65">
                        {categoryBytes == null ? "—" : formatMegabytes(categoryBytes)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[10px] text-white/38">{description}</p>
                  </div>
                </div>
                <div className="ml-11 mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className={`h-full rounded-full ${tint}`}
                    style={{
                    width: isLocalStorage && localStorageProgress !== null
                      ? `${localStorageProgress}%`
                      : !isLocalStorage && categoryBytes != null && serverStorage?.disk
                        ? `${Math.min(100, categoryBytes / Math.max(1, serverStorage.disk.total_bytes) * 100)}%`
                        : '0%',
                    minWidth: categoryBytes != null && categoryBytes > 0 ? '2px' : '0',
                  }}
                  />
                </div>
                <p className="ml-11 mt-1 text-[9px] text-white/30">
                  {isLocalStorage
                    ? (localStorageProgress === null ? "Browser quota unavailable" : `${localStorageProgress.toFixed(1)}% of browser storage quota used`)
                    : serverCategory?.records != null
                      ? `${categoryRecords?.toLocaleString()} records · ${serverCategory.note}`
                      : categoryBytes != null ? serverCategory?.note || category.note : 'Not reported by backend'}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-3 flex items-start gap-3 border-t border-white/[0.08] px-1 pt-4">
        <Archive className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
        <div>
          <p className="text-[11px] font-semibold text-white/75">Protected storage</p>
          <p className="mt-1 text-[10px] leading-relaxed text-white/38">Wallet data, paper balances, trades and the SQLite database are never included in routine log cleanup.</p>
        </div>
      </div>

      {notice && <div role="status" className="rounded-xl border border-amber-400/15 bg-amber-400/[0.045] p-3 text-[10px] leading-relaxed text-amber-100/75">{notice}</div>}

      </div>

      <button type="button" onClick={onBack} className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.25rem)] right-4 z-[80] inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-6 text-[12px] font-semibold text-black shadow-[0_5px_20px_rgba(255,255,255,.16)] transition-transform active:scale-[0.97]" aria-label="Go back">
        <ArrowLeft className="h-4 w-4" strokeWidth={2.3} />
        Back
      </button>

      {selected && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/80 px-0 backdrop-blur-sm sm:items-center sm:px-4" onClick={(event) => { if (event.target === event.currentTarget) { setShowCleanupConfirmation(false); setSelected(null); } }}>
          <section role="dialog" aria-modal="true" aria-labelledby="storage-detail-title" className="w-full max-w-lg rounded-t-[26px] border border-white/[0.10] bg-[#111315] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 shadow-[0_-18px_60px_rgba(0,0,0,.65)] sm:rounded-[26px]">
            <div className="mb-4 flex items-center justify-between">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] ${selected.accent}`}>
                <selected.icon className="h-4 w-4" />
              </span>
              <button type="button" onClick={() => { setShowCleanupConfirmation(false); setSelected(null); }} aria-label="Close storage details" className="rounded-full p-2 text-white/45 hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
            </div>
            <h2 id="storage-detail-title" className="text-[15px] font-semibold text-white">{selected.title}</h2>
            <p className="mt-1 text-[11px] text-white/45">{selected.description}</p>
            <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-white/45">Storage used</span>
                <span className="text-[13px] font-semibold tabular-nums text-white/85">
                  {selected.id === 'local-storage'
                    ? (browserStorage.usage === null ? 'Unavailable' : formatMegabytes(localStorageBytes))
                    : (() => {
                        const item = serverStorage?.categories?.[selected.id as keyof StorageOverview['categories']];
                        const bytes = item?.physical_bytes ?? item?.logical_bytes ?? (selected.id === 'system_logs' ? serverStorage?.system_journal.reported_size_bytes : null);
                        return bytes == null ? 'Not reported' : formatMegabytes(bytes);
                      })()}
                </span>
              </div>
              {selected.id === 'local-storage' && (
                <>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full bg-fuchsia-400" style={{
                      width: localStorageProgress === null ? '0%' : `${localStorageProgress}%`,
                      minWidth: browserStorage.usage !== null && browserStorage.usage > 0 ? '2px' : '0',
                    }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[9px] text-white/40">
                    <span>{localStorageProgress === null ? 'Usage percentage unavailable' : `${localStorageProgress.toFixed(2)}% of quota used`}</span>
                    <span>{browserStorageRemaining === null ? 'Remaining —' : `${formatMegabytes(browserStorageRemaining)} remaining`}</span>
                  </div>
                  <p className="mt-1 text-[9px] text-white/30">
                    {browserStorage.quota === null ? 'Browser quota unavailable' : `Origin quota: ${formatMegabytes(browserStorage.quota)}`}
                  </p>
                </>
              )}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-white/45">{selected.id === 'local-storage' ? selected.note : (serverStorage?.categories?.[selected.id as keyof StorageOverview['categories']]?.note || selected.note)}</p>
            {selected.id !== 'local-storage' && serverStorage?.categories?.[selected.id as keyof StorageOverview['categories']]?.records != null && (
              <p className="mt-2 text-[10px] text-white/40">Records: {serverStorage.categories[selected.id as keyof StorageOverview['categories']].records?.toLocaleString()}</p>
            )}
            {selected.id === 'system_logs' ? (
              <button type="button" onClick={() => setShowCleanupConfirmation(true)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[11px] font-bold text-black transition-transform active:scale-[0.98]">
                <Trash2 className="h-3.5 w-3.5" /> Clean system journal
              </button>
            ) : selected.id === 'local-storage' ? (
              <button type="button" onClick={() => setShowCleanupConfirmation(true)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[11px] font-bold text-black transition-transform active:scale-[0.98]">
                <Trash2 className="h-3.5 w-3.5" /> Clear local storage
              </button>
            ) : (
              <p className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-[10px] leading-relaxed text-white/40">
                {selected.cleanable ? 'No cleanup operation is available for this category.' : 'This category is protected from cleanup.'}
              </p>
            )}
          </section>
        </div>
      )}

      {selected && showCleanupConfirmation && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/85 px-0 backdrop-blur-sm sm:items-center sm:px-4" onClick={(event) => { if (event.target === event.currentTarget) setShowCleanupConfirmation(false); }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="storage-clean-title" className="w-full max-w-lg rounded-t-[26px] border border-white/[0.10] bg-[#111315] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 shadow-[0_-18px_60px_rgba(0,0,0,.65)] sm:rounded-[26px]">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/[0.12] bg-amber-400/[0.05]"><Trash2 className="h-4 w-4 text-amber-200/80" /></span>
              <button type="button" onClick={() => setShowCleanupConfirmation(false)} aria-label="Close cleanup confirmation" className="rounded-full p-2 text-white/45 hover:bg-white/[0.06]"><X className="h-4 w-4" /></button>
            </div>
            <h2 id="storage-clean-title" className="text-[15px] font-semibold text-white">{selected.id === 'system_logs' ? 'Clean system journal?' : 'Clear local storage?'}</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-white/50">{selected.id === 'system_logs'
              ? 'This sends an authenticated request to the backend to rotate and vacuum archived system-wide journal files. It does not clean SQLite, token records, paper-trading data or browser storage. The server may reject the request if cleanup is disabled or OS permissions are insufficient.'
              : "This clears this app's browser storage, including local and session storage, IndexedDB databases, cached files and service worker registrations. It may sign you out and reset saved preferences. Browser-managed cookies and server-side data are not included."}</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowCleanupConfirmation(false)} className="min-h-11 flex-1 rounded-full border border-white/[0.12] bg-white/[0.035] text-[11px] font-semibold text-white/70">Cancel</button>
              <button type="button" onClick={confirmCleanup} className="min-h-11 flex-1 rounded-full bg-white text-[11px] font-bold text-black">{selected.id === 'system_logs' ? 'Clean journal' : 'Clear everything'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

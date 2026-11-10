import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Archive, ArrowLeft, Database, HardDrive, KeyRound,
  RefreshCw, Signal, Terminal, Trash2, X,
} from 'lucide-react';
import { apiClient, StorageOverview } from '../../services/rest';
import { useTerminal } from '../../context/TerminalContext';
import { useToast } from '../ui/ToastProvider';

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
  {
    id: 'database',
    title: 'Database files',
    description: 'SQLite database, WAL and SHM files',
    icon: Database,
    accent: 'text-emerald-300',
    tint: 'bg-emerald-400',
    cleanable: true,
    note: 'Clean unused token records from SQLite. Tokens with any open or closed paper-trading position, paper balances, ledger entries, schema and the database file itself are preserved.',
  },
  {
    id: 'system_logs',
    title: 'System journal',
    description: 'Linux journal shared by NodeX and other services',
    icon: Terminal,
    accent: 'text-amber-300',
    tint: 'bg-amber-400',
    cleanable: true,
    note: 'This is a system-wide journal measurement, not a NodeX-only log size. It is already included in root disk usage.',
  },
  {
    id: 'local-storage',
    title: 'Local storage',
    description: 'Browser storage used by this NodeX app',
    icon: KeyRound,
    accent: 'text-fuchsia-300',
    tint: 'bg-fuchsia-400',
    cleanable: true,
    note: 'Clears browser storage for this app origin. This may sign you out and reset locally saved preferences.',
  },
];

export const StorageManagementPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { removeTokensByMint } = useTerminal();
  const { showToast, updateToast } = useToast();
  const [selected, setSelected] = useState<StorageCategory | null>(null);
  const [showCleanupConfirmation, setShowCleanupConfirmation] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [browserStorage, setBrowserStorage] = useState<BrowserStorageEstimate>({ usage: null, quota: null });
  const [serverStorage, setServerStorage] = useState<StorageOverview | null>(null);
  const [serverStorageError, setServerStorageError] = useState('');
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
      if (showNotice) showToast({ title: 'Storage overview refreshed', description: 'Browser and server storage readings are up to date.', tone: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load server storage overview.';
      setServerStorageError(message);
      if (showNotice) showToast({ title: 'Server storage unavailable', description: message, tone: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refresh(false);
  }, []);

  const confirmCleanup = async () => {
    if (!selected || cleanupBusy) return;
    setCleanupBusy(true);
    setShowCleanupConfirmation(false);
    const categoryId = selected.id;
    const toastId = showToast({
      title: categoryId === 'database' ? 'Cleaning SQLite storage…' : categoryId === 'system_logs' ? 'Cleaning system journal…' : 'Clearing browser storage…',
      description: 'The operation is running. Please wait for the backend or browser to confirm completion.',
      tone: 'loading',
    });

    try {
      if (categoryId === 'database') {
        const result = await apiClient.clearEngineHistory(apiClient.loadSettings().adminApiKey);
        removeTokensByMint(result.deleted_mints || []);
        const stateRecords = result.deleted_token_state_records ?? result.deleted_token_records ?? 0;
        const launchRecords = result.deleted_launch_records ?? 0;
        const chartRecords = result.deleted_chart_records ?? 0;
        const rawEvents = result.deleted_raw_event_records ?? 0;
        updateToast(toastId, {
          title: 'SQLite cleanup completed',
          description: `${stateRecords} token states, ${launchRecords} launch records, ${chartRecords} chart records and ${rawEvents} raw events removed. Tokens with paper-trading positions were preserved.`,
          tone: 'success',
          duration: 6500,
        });
        await refresh(false);
      } else if (categoryId === 'local-storage') {
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
        updateToast(toastId, {
          title: 'Browser storage cleanup completed',
          description: 'Local storage, session storage, caches, IndexedDB databases and service worker registrations were cleared. You may need to sign in again.',
          tone: 'success',
          duration: 6500,
        });
      } else if (categoryId === 'system_logs') {
        const result = await apiClient.cleanupSystemJournal();
        setServerStorage(result.overview);
        updateToast(toastId, {
          title: 'System journal cleanup completed',
          description: result.bytes_freed === null
            ? 'The backend confirmed cleanup. Exact disk space freed was not available.'
            : `Freed ${formatMegabytes(result.bytes_freed)}.`,
          tone: 'success',
          duration: 5000,
        });
      } else {
        updateToast(toastId, {
          title: 'No cleanup operation available',
          description: 'No files were deleted because this category has no active cleanup operation.',
          tone: 'warning',
        });
      }
    } catch (error) {
      updateToast(toastId, {
        title: categoryId === 'database' ? 'SQLite cleanup failed' : categoryId === 'system_logs' ? 'System journal cleanup failed' : 'Browser storage cleanup incomplete',
        description: error instanceof Error ? error.message : 'The operation could not be completed. The result has not been confirmed.',
        tone: 'error',
        duration: 7000,
      });
    } finally {
      setCleanupBusy(false);
      setSelected(null);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black px-0 text-white">
      <div className="relative w-full shrink-0">
        <section className="relative w-full overflow-hidden rounded-b-xl border-x border-b border-white/[0.07] bg-[#181818] px-3 pb-3.5 pt-[calc(env(safe-area-inset-top)+3.25rem)] shadow-[0_8px_24px_rgba(0,0,0,.18)]">
          <div className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.55rem)] inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.07] bg-[#121212] px-2 text-[9px] font-medium text-white/45">
            <Signal className="h-3 w-3 text-white/35" strokeWidth={1.8} />
            {serverStorage ? 'Snapshot ready' : 'Awaiting'}
          </div>
          <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+0.35rem)]">
            <button type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Refresh storage overview" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/65 transition-colors hover:bg-white/[0.08] disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div>
            <div className="flex items-center gap-2 text-white/55">
              <HardDrive className="h-4 w-4" />
              <span className="text-[11px] font-medium">EC2 root filesystem</span>
            </div>
            <div className="mt-2.5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[25px] font-semibold leading-none tracking-tight text-white tabular-nums">
                  {serverStorage?.disk ? (serverStorage.disk.available_bytes / (1024 ** 3)).toFixed(2) : '—'} <span className="text-[13px] font-medium text-white/45">GiB free</span>
                </p>
                <p className="mt-2 text-[10px] text-white/40">Available on root volume</p>
              </div>
              <div className="text-right">
                <p className="text-[17px] font-semibold leading-none text-white/85 tabular-nums">{serverStorage?.disk ? `${(serverStorage.disk.total_bytes / (1024 ** 3)).toFixed(2)} GiB` : '— GiB'}</p>
                <p className="mt-2 text-[10px] text-white/40">Total capacity</p>
              </div>
            </div>
            <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-white/[0.10]">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300" style={{ width: serverStorage?.disk ? `${Math.min(100, serverStorage.disk.used_bytes / Math.max(1, serverStorage.disk.total_bytes) * 100)}%` : '0%' }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-white/45">
              <span>Used: {serverStorage?.disk ? `${(serverStorage.disk.used_bytes / (1024 ** 3)).toFixed(2)} GiB` : '— GiB'}</span>
              <span>{serverStorage?.disk ? `${serverStorage.disk.used_percent}% used` : '—% used'}</span>
            </div>
            <div className="mt-3 flex items-start gap-2 border-t border-white/[0.07] pt-2.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300/80" />
              <p className="text-[10px] leading-relaxed text-white/45">
                {serverStorageError || (serverStorage?.disk ? `Device: ${serverStorage.disk.filesystem} · Mount: ${serverStorage.disk.mountpoint}. Capacity is read from the EC2 root filesystem.` : serverStorage?.disk_error || 'Waiting for the authenticated backend storage overview. Check the backend URL and operator key in Settings.')}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-4">
      <section className="w-full px-3">
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-white">Storage details</h2>
            <p className="mt-1 text-[10px] text-white/40">Measured files and browser storage; these are subsets, not extra disk capacity.</p>
          </div>
          <span className="text-[9px] text-white/30">2 server · 1 browser</span>
        </div>

        <div className="divide-y divide-white/[0.075]">
          {categories.map((category) => {
            const { id, title, description, icon: Icon, accent, tint } = category;
            const isLocalStorage = id === 'local-storage';
            const categoryBytes = isLocalStorage
              ? browserStorage.usage
              : id === 'database'
                ? serverStorage?.database.total_file_bytes ?? null
                : serverStorage?.system_journal.reported_size_bytes ?? null;
            const progress = isLocalStorage
              ? localStorageProgress
              : categoryBytes !== null && categoryBytes !== undefined && serverStorage?.disk
                ? Math.min(100, (categoryBytes / Math.max(1, serverStorage.disk.total_bytes)) * 100)
                : null;
            const detailNote = isLocalStorage
              ? category.note
              : id === 'database'
                ? 'Physical SQLite database, WAL and SHM files. Included in root filesystem used space.'
                : serverStorage?.system_journal.note || category.note;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { setSelected(category); }}
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
                        {categoryBytes == null ? '—' : formatMegabytes(categoryBytes)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[10px] text-white/38">{description}</p>
                  </div>
                </div>
                <div className="ml-11 mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className={`h-full rounded-full ${tint}`}
                    style={{
                      width: progress === null ? '0%' : `${progress}%`,
                      minWidth: categoryBytes !== null && categoryBytes !== undefined && categoryBytes > 0 ? '2px' : '0',
                    }}
                  />
                </div>
                <p className="ml-11 mt-1 text-[9px] text-white/30">
                  {isLocalStorage
                    ? (localStorageProgress === null ? 'Browser quota unavailable' : `${localStorageProgress.toFixed(1)}% of browser storage quota used`)
                    : detailNote}
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
          <p className="mt-1 text-[10px] leading-relaxed text-white/38">The SQLite file, schema, wallet data, paper balances and trades remain intact. Database cleanup removes only token records that have never entered paper trading.</p>
        </div>
      </div>


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
                    : selected.id === 'database'
                      ? serverStorage ? formatMegabytes(serverStorage.database.total_file_bytes) : 'Not reported'
                      : serverStorage?.system_journal.reported_size_bytes == null
                        ? 'Not reported'
                        : formatMegabytes(serverStorage.system_journal.reported_size_bytes)}
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
              {selected.id === 'database' && serverStorage && (
                <div className="mt-3 space-y-1.5 border-t border-white/[0.07] pt-3 text-[10px] text-white/45">
                  <div className="flex justify-between gap-3"><span>Main database</span><span className="tabular-nums">{formatMegabytes(serverStorage.database.database_bytes)}</span></div>
                  <div className="flex justify-between gap-3"><span>Write-ahead log</span><span className="tabular-nums">{formatMegabytes(serverStorage.database.wal_bytes)}</span></div>
                  <div className="flex justify-between gap-3"><span>Shared memory</span><span className="tabular-nums">{formatMegabytes(serverStorage.database.shm_bytes)}</span></div>
                </div>
              )}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-white/45">
              {selected.id === 'local-storage'
                ? selected.note
                : selected.id === 'database'
                  ? 'This is one combined SQLite file measurement. It is already counted inside the EC2 root filesystem usage above.'
                  : serverStorage?.system_journal.note || selected.note}
            </p>
            {selected.id === 'database' ? (
              <button type="button" onClick={() => setShowCleanupConfirmation(true)} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[11px] font-bold text-black transition-transform active:scale-[0.98]">
                <Trash2 className="h-3.5 w-3.5" /> Clean unused tokens
              </button>
            ) : selected.id === 'system_logs' ? (
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
            <h2 id="storage-clean-title" className="text-[15px] font-semibold text-white">{selected.id === 'database' ? 'Clean unused token records?' : selected.id === 'system_logs' ? 'Clean system journal?' : 'Clear local storage?'}</h2>
            <p className="mt-2 text-[11px] leading-relaxed text-white/50">{selected.id === 'database'
              ? 'This sends an authenticated request to SQLite cleanup. It removes rejected, failed-scan, failed-metadata and other tokens that have never entered paper trading, plus their launch and chart history. Any token with an open or closed paper position is preserved. Paper wallet, ledger, balances, schema, active discovery and the SQLite file itself are not deleted.'
              : selected.id === 'system_logs'
                ? 'This sends an authenticated request to the backend to rotate and vacuum archived system-wide journal files. It does not clean SQLite token records, paper-trading data or browser storage. The server may reject the request if cleanup is disabled or OS permissions are insufficient.'
                : "This clears this app's browser storage, including local and session storage, IndexedDB databases, cached files and service worker registrations. It may sign you out and reset saved preferences. Browser-managed cookies and server-side data are not included."}</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowCleanupConfirmation(false)} className="min-h-11 flex-1 rounded-full border border-white/[0.12] bg-white/[0.035] text-[11px] font-semibold text-white/70">Cancel</button>
              <button type="button" onClick={confirmCleanup} disabled={cleanupBusy} className="min-h-11 flex-1 rounded-full bg-white text-[11px] font-bold text-black disabled:opacity-50">{cleanupBusy ? 'Cleaning…' : selected.id === 'database' ? 'Clean unused tokens' : selected.id === 'system_logs' ? 'Clean journal' : 'Clear everything'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

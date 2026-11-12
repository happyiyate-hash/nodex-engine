import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, Copy, Download, FileJson, RefreshCw } from 'lucide-react';
import { useTerminal } from '../../context/TerminalContext';
import { clearEngineLogs, EngineLogEntry, readEngineLogs } from '../../services/engineLogs';
import { MobileNav } from '../layout/MobileNav';

type LogFilter = 'requests' | 'responses';

export const LogsPage: React.FC = () => {
  const { setActiveTab, engineStatus } = useTerminal();
  const [logs, setLogs] = useState<EngineLogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>('requests');
  const [selected, setSelected] = useState<EngineLogEntry | null>(null);
  const [selectedView, setSelectedView] = useState<LogFilter>('requests');
  const [copied, setCopied] = useState(false);
  const reload = () => setLogs(readEngineLogs());

  useEffect(() => {
    reload();
    const update = (event: Event) => setLogs((event as CustomEvent<EngineLogEntry[]>).detail ?? readEngineLogs());
    window.addEventListener('nodex-engine-logs-updated', update);
    return () => window.removeEventListener('nodex-engine-logs-updated', update);
  }, []);

  const requests = useMemo(() => logs.filter((item) => item.kind === 'request'), [logs]);
  // Responses are a separate presentation of the backend outcome, not duplicate request cards.
  const responses = useMemo(
    () => requests.filter((item) => item.response !== undefined || item.error !== undefined || item.status !== undefined),
    [requests],
  );
  const visible = filter === 'requests' ? requests : responses;
  const detailJson = useMemo(() => {
    if (!selected) return '';
    const metadata = {
      action: selected.action,
      timestamp: selected.at,
      duration_ms: selected.durationMs ?? null,
      http_status: selected.status ?? null,
      success: selected.ok,
    };
    return JSON.stringify(
      selectedView === 'requests'
        ? { type: 'request', ...metadata, request: selected.request ?? null }
        : {
            type: 'response',
            ...metadata,
            ...(selected.response !== undefined ? { response: selected.response } : {}),
            ...(selected.error ? { error: selected.error } : {}),
          },
      null,
      2,
    );
  }, [selected, selectedView]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(detailJson);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { setCopied(false); }
  };

  const download = () => {
    if (!selected) return;
    const blob = new Blob([detailJson], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `nodex-${selected.action.replace(/[^a-z0-9-_]+/gi, '-')}-log.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const connected = engineStatus.ws_status === 'connected';

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
      <header className="shrink-0 flex-none z-20 border-b border-white/[0.10] bg-black/95 px-3 pb-3 pt-[max(env(safe-area-inset-top,0px),12px)] backdrop-blur-2xl sm:px-5">
        <div className="flex min-h-9 items-center gap-2">
          {selected ? (
            <button onClick={() => { setSelected(null); setCopied(false); }} aria-label="Back to logs" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.14] bg-[#111113]/75 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_3px_12px_rgba(0,0,0,.25)]"><ArrowLeft className="size-4" /></button>
          ) : (
            <button onClick={() => setActiveTab('overview')} aria-label="Back to overview" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.14] bg-[#111113]/75 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,.12),0_3px_12px_rgba(0,0,0,.25)]"><ArrowLeft className="size-4" /></button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">{selected ? `${selectedView === 'requests' ? 'Request' : 'Response'} · ${selected.action}` : 'Logs'}</h1>
            {selected && <p className="truncate text-[11px] text-zinc-500">{new Date(selected.at).toLocaleString()} {selected.durationMs != null ? `· ${selected.durationMs} ms` : ''}</p>}
          </div>
          {selected ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${selected.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {selected.ok ? <CheckCircle2 className="size-3" /> : <CircleAlert className="size-3" />}{selected.ok ? 'Success' : 'Failed'}
            </span>
          ) : (
            <button onClick={reload} aria-label="Refresh logs" className="grid size-9 place-items-center rounded-full text-zinc-400 hover:bg-white/[0.06]"><RefreshCw className="size-4" /></button>
          )}
        </div>
        {!selected ? (
          <div className="mt-3 flex items-center gap-2">
            <div className="glass-panel grid min-w-0 flex-1 grid-cols-2 gap-1 rounded-2xl p-1">
              <button onClick={() => setFilter('requests')} className={`flex h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium transition-all duration-200 ${filter === 'requests' ? 'bg-white text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-200'}`}><FileJson className="size-3.5" />Requests <span className="text-[10px] opacity-70">{requests.length}</span></button>
              <button onClick={() => setFilter('responses')} className={`flex h-9 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium transition-all duration-200 ${filter === 'responses' ? 'bg-white text-black shadow-sm' : 'text-zinc-500 hover:text-zinc-200'}`}><FileJson className="size-3.5" />Responses <span className="text-[10px] opacity-70">{responses.length}</span></button>
            </div>
            <span className="glass-panel flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-medium text-zinc-300"><span className={`size-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-zinc-500'}`} />{connected ? 'Live' : 'Offline'}</span>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-zinc-500">{selectedView === 'requests' ? 'Outgoing request JSON' : 'Backend response JSON'}</p>
        )}
      </header>

      {selected ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {selected.error && <div className="mx-3 mt-3 flex items-start gap-2 border-l-2 border-red-500 px-3 py-2 text-sm text-red-400"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span className="break-words">{selected.error}</span></div>}
          <pre aria-label="Log JSON" className="min-h-[55dvh] flex-1 overflow-auto bg-black px-3 pb-28 pt-3 font-mono text-[11px] leading-[1.75] text-zinc-300 [overflow-wrap:anywhere] sm:px-5 sm:text-xs">{detailJson}</pre>
          <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center border-t border-white/[0.10] bg-black/90 px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur-2xl">
            <div className="flex w-full max-w-md items-center gap-2 rounded-2xl border border-white/[0.12] bg-[#111113] p-1.5 shadow-[0_12px_34px_rgba(0,0,0,.45),inset_0_1px_0_rgba(255,255,255,.08)]">
              <button onClick={() => void copy()} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white text-xs font-semibold text-black"><Copy className="size-3.5" />{copied ? 'Copied' : 'Copy JSON'}</button>
              <button onClick={download} className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] text-xs font-medium text-zinc-200"><Download className="size-3.5" />Download</button>
            </div>
          </div>
        </div>
      ) : (
        <section className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-28 pt-3 sm:px-5">
          {visible.length === 0 ? (
            <div className="flex min-h-[42dvh] flex-col items-center justify-center text-center">
              <span className="mb-3 grid size-11 place-items-center rounded-2xl border border-white/[0.08] bg-[#111113]"><FileJson className="size-5 text-zinc-500" /></span>
              <p className="text-sm font-medium text-zinc-300">{filter === 'requests' ? 'No requests captured yet' : 'No responses captured yet'}</p>
              <p className="mt-1 max-w-xs text-xs text-zinc-600">{filter === 'requests' ? 'Frontend API requests to the NodeX backend will appear here.' : 'Backend responses, including successful payloads and errors, will appear here alongside their originating requests.'}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visible.map((log) => (
                <button key={log.id} onClick={() => { setSelected(log); setSelectedView(filter); setCopied(false); }} className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.09] bg-[#111113] px-3 py-2.5 text-left transition-colors hover:border-white/[0.18] active:bg-white/[0.04]">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${log.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>{log.ok ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}</span>
                  <span className="min-w-0 flex-1">
                    {filter === 'requests' ? (
                      <>
                        <span className="block truncate text-[13px] font-medium text-zinc-200">{log.action}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-zinc-500">Outgoing request · {new Date(log.at).toLocaleString()}</span>
                        {log.request !== undefined && log.request !== null && <span className="mt-1 block truncate text-[10px] text-zinc-500">Request body: {typeof log.request === 'string' ? log.request : JSON.stringify(log.request)}</span>}
                      </>
                    ) : (
                      <>
                        <span className="block truncate text-[13px] font-medium text-zinc-200">{log.action}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-zinc-500">Backend response · {log.status != null ? `HTTP ${log.status}` : 'No HTTP response'} · {new Date(log.at).toLocaleString()}</span>
                        <span className={`mt-1 block truncate text-[10px] ${log.ok ? 'text-zinc-400' : 'text-red-400'}`}>
                          {log.error ? log.error : log.response === null ? 'Backend returned an empty response' : typeof log.response === 'string' ? log.response : JSON.stringify(log.response)}
                        </span>
                      </>
                    )}
                    {log.durationMs != null && <span className="mt-1 block text-[10px] text-zinc-600">{log.durationMs} ms</span>}
                  </span>
                  <span className={`shrink-0 text-[10px] font-medium ${log.ok ? 'text-emerald-400' : 'text-red-400'}`}>{filter === 'requests' ? 'Sent' : log.ok ? 'Received' : 'Error'}</span>
                </button>
              ))}
            </div>
          )}
          {logs.length > 0 && <div className="mt-3 flex justify-end"><button onClick={() => { clearEngineLogs(); setLogs([]); }} className="rounded-lg px-3 py-2 text-xs text-zinc-500 hover:bg-white/[0.05]">Clear logs</button></div>}
        </section>
      )}
      {!selected && <MobileNav />}
    </div>
  );
};

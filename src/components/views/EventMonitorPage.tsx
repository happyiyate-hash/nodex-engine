import React, { useMemo, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { NodeXEvent } from '../../types';
import { JsonViewer } from '../common/JsonViewer';
import { ArrowLeft, Search, Trash2, Pause, Play, Terminal, Radio, Database, Copy, Check } from 'lucide-react';

export const EventMonitorPage: React.FC = () => {
  const { events, selectedEvent, setSelectedEvent, isStreamPaused, toggleStreamPause, clearEvents } = useTerminal();
  const [source, setSource] = useState<'websocket' | 'rest'>('websocket');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const visibleEvents = useMemo(() => events.filter((event) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return event.event_type.toLowerCase().includes(q) || event.message.toLowerCase().includes(q) || JSON.stringify(event.data || {}).toLowerCase().includes(q);
  }), [events, search]);

  const selectEvent = (event: NodeXEvent) => setSelectedEvent(event);
  const copyPayload = async () => {
    if (!selectedEvent) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedEvent.data || selectedEvent, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (selectedEvent) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] flex-col bg-[#080808] text-white">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.07] bg-[#080808]/95 px-4 py-3 backdrop-blur-xl">
          <button onClick={() => setSelectedEvent(null)} className="flex items-center gap-2 text-xs text-neutral-400 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Events</button>
          <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Event payload</span>
          <button onClick={copyPayload} className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-2 text-[10px] text-neutral-300 hover:bg-white/[0.1]">{copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}{copied ? 'Copied' : 'Copy JSON'}</button>
        </header>
        <div className="border-b border-white/[0.06] px-4 py-4">
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">{selectedEvent.event_type.replace(/_/g, ' ')}</p>
          <h1 className="mt-2 max-w-4xl text-sm leading-relaxed text-neutral-100">{selectedEvent.message}</h1>
          <p className="mt-2 font-mono text-[10px] text-neutral-600">{new Date(selectedEvent.timestamp).toISOString()} · {selectedEvent.event_id}</p>
        </div>
        <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
          <div className="mb-3 text-[10px] font-mono uppercase tracking-wider text-neutral-600">Raw event data</div>
          <JsonViewer data={selectedEvent.data || selectedEvent} />
        </main>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-[1400px] flex-col px-3 pb-8 pt-4 sm:px-5 lg:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-500">Engine telemetry</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Events</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleStreamPause} className="rounded-lg bg-white/[0.06] p-2.5 text-neutral-300 hover:bg-white/[0.1]" title={isStreamPaused ? 'Resume stream' : 'Pause stream'}>{isStreamPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
          <button onClick={clearEvents} className="rounded-lg bg-white/[0.06] p-2.5 text-neutral-400 hover:text-red-300" title="Clear events"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1 rounded-xl border border-white/[0.07] bg-white/[0.025] p-1">
        <button onClick={() => setSource('websocket')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs transition ${source === 'websocket' ? 'bg-white/[0.1] text-white shadow-inner' : 'text-neutral-500 hover:text-neutral-300'}`}><Radio className="h-3.5 w-3.5" /> WebSocket <span className="text-[10px] opacity-60">{events.length}</span></button>
        <button onClick={() => setSource('rest')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs transition ${source === 'rest' ? 'bg-white/[0.1] text-white shadow-inner' : 'text-neutral-500 hover:text-neutral-300'}`}><Database className="h-3.5 w-3.5" /> REST</button>
      </div>

      {source === 'websocket' ? (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
            <Search className="h-4 w-4 shrink-0 text-neutral-600" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event type or message…" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-neutral-600" />
            <span className="whitespace-nowrap font-mono text-[10px] text-neutral-600">{visibleEvents.length} events</span>
          </div>
          <div className="mt-3 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.018]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3 text-[10px] font-mono uppercase tracking-wider text-neutral-500"><span>Live WebSocket stream</span><span>{isStreamPaused ? 'Paused' : 'Listening'}</span></div>
            <div className="h-full max-h-[calc(100vh-18rem)] overflow-y-auto divide-y divide-white/[0.045]">
              {visibleEvents.length === 0 ? <div className="px-5 py-16 text-center"><Terminal className="mx-auto h-6 w-6 text-neutral-700" /><p className="mt-3 text-sm text-neutral-400">No WebSocket events to display</p><p className="mt-1 text-xs text-neutral-600">Engine detections, scan results and errors will appear here.</p></div> : visibleEvents.map((event) => (
                <button key={event.event_id} onClick={() => selectEvent(event)} className="block w-full px-4 py-3.5 text-left transition hover:bg-white/[0.045]">
                  <div className="flex items-center justify-between gap-3"><span className={`font-mono text-[10px] font-semibold uppercase tracking-wide ${event.event_type.includes('error') || event.event_type.includes('rejected') ? 'text-red-300' : event.event_type.includes('warning') ? 'text-amber-300' : 'text-emerald-300'}`}>{event.event_type.replace(/_/g, ' ')}</span><time className="shrink-0 font-mono text-[10px] text-neutral-600">{new Date(event.timestamp).toLocaleTimeString()}</time></div>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-neutral-300">{event.message}</p>
                  <div className="mt-2 flex items-center gap-3 text-[9px] uppercase tracking-wider text-neutral-600"><span>{event.processing_status}</span>{event.token_mint && <span>{event.token_mint.slice(0, 6)}…{event.token_mint.slice(-5)}</span>}</div>
                </button>
              ))}</div>
          </div>
        </>
      ) : (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-6 py-16 text-center">
          <Database className="h-6 w-6 text-neutral-700" />
          <p className="mt-3 text-sm text-neutral-300">REST event history is not available</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-neutral-600">The current backend streams engine events over WebSocket. A REST event-history endpoint has not been connected, so no REST records are shown here.</p>
        </div>
      )}
    </div>
  );
};

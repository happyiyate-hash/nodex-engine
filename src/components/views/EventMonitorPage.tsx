import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { NodeXEvent } from '../../types';
import { JsonViewer } from '../common/JsonViewer';
import { ArrowLeft, Trash2, Pause, Play, Copy, Check } from 'lucide-react';

export const EventMonitorPage: React.FC = () => {
  const { events, selectedEvent, setSelectedEvent, isStreamPaused, toggleStreamPause, clearEvents } = useTerminal();
  const [copied, setCopied] = useState(false);

  const selectEvent = (event: NodeXEvent) => setSelectedEvent(event);
  const copyPayload = async () => {
    if (!selectedEvent) return;
    await navigator.clipboard.writeText(JSON.stringify(selectedEvent.data || selectedEvent, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (selectedEvent) {
    return (
      <div className="flex min-h-full w-full flex-col bg-[#080808] text-white">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#080808]/90 px-3 py-3 backdrop-blur-xl sm:px-5">
          <button onClick={() => setSelectedEvent(null)} className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Events</button>
          <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">Event payload</span>
          <button onClick={copyPayload} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] text-neutral-300 hover:bg-white/[0.06]">{copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}{copied ? 'Copied' : 'Copy JSON'}</button>
        </header>
        <div className="border-b border-white/[0.06] px-3 py-4 sm:px-5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">{selectedEvent.event_type.replace(/_/g, ' ')}</p>
          <h1 className="mt-2 text-sm leading-relaxed text-neutral-100">{selectedEvent.message}</h1>
          <p className="mt-2 break-all font-mono text-[9px] text-neutral-600">{new Date(selectedEvent.timestamp).toISOString()} · {selectedEvent.event_id}</p>
        </div>
        <main className="min-h-0 flex-1 overflow-auto px-3 py-4 sm:px-5">
          <div className="mb-2 font-mono text-[9px] uppercase tracking-wider text-neutral-600">Raw event data</div>
          <JsonViewer data={selectedEvent.data || selectedEvent} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full px-2 pb-8 pt-2 sm:px-4">
      <div className="sticky top-2 z-20 mb-3 flex justify-start">
        <div className="glass-nav-float inline-flex h-10 items-center gap-1 rounded-xl px-1.5">
          <button
            onClick={toggleStreamPause}
            title={isStreamPaused ? 'Resume event stream' : 'Pause event stream'}
            aria-label={isStreamPaused ? 'Resume event stream' : 'Pause event stream'}
            className="flex h-8 items-center gap-2 rounded-lg px-3 text-[10px] font-mono text-neutral-200 transition hover:bg-white/[0.08]"
          >
            {isStreamPaused ? <Play className="h-3.5 w-3.5 text-amber-300" /> : <Pause className="h-3.5 w-3.5" />}
            {isStreamPaused ? 'RESUME' : 'PAUSE'}
          </button>
          <span className="h-4 w-px bg-white/[0.1]" />
          <button
            onClick={clearEvents}
            title="Clear events"
            aria-label="Clear events"
            className="flex h-8 items-center gap-2 rounded-lg px-3 text-[10px] font-mono text-neutral-400 transition hover:bg-white/[0.08] hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            CLEAR
          </button>
        </div>
      </div>

      <div className="w-full">
        {events.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <p className="text-xs text-neutral-400">Waiting for engine events</p>
            <p className="mt-1 text-[10px] text-neutral-600">Incoming detections and engine updates will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {events.map((event) => (
              <button
                key={event.event_id}
                onClick={() => selectEvent(event)}
                className="block w-full rounded-lg border border-white/[0.065] bg-white/[0.022] px-3 py-2 text-left transition hover:border-white/[0.12] hover:bg-white/[0.045] sm:px-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`min-w-0 truncate font-mono text-[9px] font-semibold uppercase tracking-wide ${event.event_type.includes('error') || event.event_type.includes('rejected') ? 'text-red-300' : event.event_type.includes('warning') ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {event.event_type.replace(/_/g, ' ')}
                  </span>
                  <time className="shrink-0 font-mono text-[9px] text-neutral-600">{new Date(event.timestamp).toLocaleTimeString()}</time>
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] leading-snug text-neutral-300">{event.message}</p>
                <div className="mt-1 flex items-center gap-3 text-[8px] uppercase tracking-wider text-neutral-600">
                  <span>{event.processing_status}</span>
                  {event.token_mint && <span>{event.token_mint.slice(0, 6)}…{event.token_mint.slice(-5)}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

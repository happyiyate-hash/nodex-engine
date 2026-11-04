import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { EventType, NodeXEvent } from '../../types';
import { JsonViewer } from '../common/JsonViewer';
import {
  Terminal,
  Play,
  Pause,
  Trash2,
  Search,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Activity,
  Layers,
  ShieldCheck,
  Zap,
} from 'lucide-react';

export const EventMonitorPage: React.FC = () => {
  const {
    events,
    settings,
    engineStatus,
    selectedEvent,
    setSelectedEvent,
    isStreamPaused,
    toggleStreamPause,
    clearEvents,
    openTokenDetailByMint,
  } = useTerminal();

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | string>('ALL');
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);

  const handleCopyTx = (tx: string) => {
    navigator.clipboard.writeText(tx);
    setCopiedTx(true);
    setTimeout(() => setCopiedTx(false), 2000);
  };

  const handleSelectEvent = (evt: NodeXEvent) => {
    setSelectedEvent(evt);
    setMobileDetailOpen(true);
  };

  const filteredEvents = events.filter((evt) => {
    if (typeFilter !== 'ALL') {
      if (typeFilter === 'TRADES' && !evt.event_type.includes('buy') && !evt.event_type.includes('sell')) return false;
      if (typeFilter === 'DISCOVERY' && !evt.event_type.includes('detected') && !evt.event_type.includes('pool') && !evt.event_type.includes('migration')) return false;
      if (typeFilter === 'SAFETY' && !evt.event_type.includes('safety') && !evt.event_type.includes('rejected')) return false;
      if (typeFilter === 'PRICES' && !evt.event_type.includes('price') && !evt.event_type.includes('liquidity')) return false;
      if (typeFilter === 'DIAGNOSTICS' && !['diagnostic','stream_warning','engine_warning','engine_error','websocket_disconnected'].includes(evt.event_type) && !['warning','error'].includes(String(evt.data?.severity || '').toLowerCase())) return false;
      if (typeFilter === 'SOLANA' && evt.event_type !== 'solana_logs_notification') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchType = evt.event_type.toLowerCase().includes(q);
      const matchMsg = evt.message.toLowerCase().includes(q);
      const matchPayload = JSON.stringify(evt.data || {}).toLowerCase().includes(q);
      return matchType || matchMsg || matchPayload;
    }
    return true;
  });

  const getEventBadgeColor = (type: string) => {
    if (type.includes('buy')) return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40';
    if (type.includes('sell')) return 'text-amber-400 bg-amber-950/40 border-amber-800/40';
    if (type.includes('rejected') || type.includes('error')) return 'text-red-400 bg-red-950/40 border-red-800/40';
    if (type.includes('warning')) return 'text-amber-400 bg-amber-950/40 border-amber-800/40';
    if (type.includes('safety')) return 'text-purple-400 bg-purple-950/40 border-purple-800/40';
    if (type.includes('migration') || type.includes('pool')) return 'text-cyan-400 bg-cyan-950/40 border-cyan-800/40';
    return 'text-[#a3a3a3] bg-[#1a1a1a] border-[#333]';
  };

  return (
    <div className="w-full text-white select-none">
      {/* 1. Full-Width Header & Stream Controls */}
      <div className="w-full border-b border-white/[0.08] bg-[#090909]/60 backdrop-blur-md px-4 lg:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-mono font-bold text-white tracking-wide uppercase">
              Event Stream & JSON Inspector
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded glass-icon text-emerald-400">
              {settings.mode === 'RUST_BACKEND' ? 'AXUM RUST WEBSOCKET' : 'SIMULATED DEMO STREAM'}
            </span>
          </div>
          <p className="text-[11px] font-mono text-[#737373] mt-0.5">
            Persisted backend history, live on-chain telemetry, raw Solana logs, and connection diagnostics
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-[10px] font-mono">
            <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 ${engineStatus.ws_status === 'connected' ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300' : 'border-amber-800/60 bg-amber-950/30 text-amber-300'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${engineStatus.ws_status === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              BACKEND WS: {engineStatus.ws_status.toUpperCase()}
            </span>
            <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 ${engineStatus.solana_connected ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300' : 'border-red-900/60 bg-red-950/20 text-red-300'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${engineStatus.solana_connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
              SOLANA RPC: {engineStatus.solana_connected ? 'CONNECTED' : 'DISCONNECTED'}
            </span>
            <span className="text-[#737373]">RETRIES: {engineStatus.reconnection_count}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Pause / Resume */}
          <button
            onClick={toggleStreamPause}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${
              isStreamPaused
                ? 'bg-amber-950/40 border border-amber-600/50 text-amber-300'
                : 'glass-icon text-[#a3a3a3] hover:text-white'
            }`}
          >
            {isStreamPaused ? <Play className="w-3.5 h-3.5 fill-amber-300 text-amber-300" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{isStreamPaused ? 'Resume' : 'Pause'}</span>
          </button>

          {/* Clear */}
          <button
            onClick={clearEvents}
            title="Clear Event Log"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-icon text-xs font-mono text-[#a3a3a3] hover:text-white transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search event type..."
              className="glass-panel-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white placeholder-[#525252] focus:outline-none focus:border-white/20 w-48 sm:w-56"
            />
          </div>
        </div>
      </div>

      {/* 2. Full-Width Filter Tabs */}
      <div className="w-full border-b border-white/[0.08] bg-[#0c0c0c]/40 backdrop-blur-sm px-4 lg:px-6 py-2 flex flex-wrap items-center gap-1.5">
        {(
          [
            { id: 'ALL', label: 'All Events' },
            { id: 'TRADES', label: 'Paper Trades' },
            { id: 'DISCOVERY', label: 'Token Discovery' },
            { id: 'SAFETY', label: 'Safety & Risk' },
            { id: 'PRICES', label: 'Price Ticks' },
            { id: 'DIAGNOSTICS', label: 'Diagnostics & Errors' },
            { id: 'SOLANA', label: 'Raw Solana Logs' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeFilter(t.id)}
            className={`px-3 py-1 rounded-md text-xs font-mono transition-all ${
              typeFilter === t.id
                ? 'glass-card text-white font-medium shadow-sm'
                : 'text-[#8e8e93] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 3. Full-Width Split-Panel: Left Event Stream + Right JSON Inspector */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] min-h-[calc(100vh-12rem)]">
        {/* Left Column: Event Stream List */}
        <div className={`lg:col-span-6 xl:col-span-7 flex flex-col h-[calc(100vh-12rem)] overflow-hidden ${
          mobileDetailOpen ? 'hidden lg:flex' : 'flex'
        }`}>
          <div className="px-4 lg:px-6 py-2 text-[11px] font-mono text-[#737373] border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]">
            <span>LIVE EVENT STREAM ({filteredEvents.length})</span>
            <span>CLICK EVENT TO INSPECT JSON</span>
          </div>

          <div className="overflow-y-auto flex-1 divide-y divide-white/[0.04]">
            {filteredEvents.length === 0 ? (
              <div className="py-24 text-center text-xs font-mono text-[#737373]">
                No events received matching current filters.
              </div>
            ) : (
              filteredEvents.map((evt) => {
                const isSelected = selectedEvent?.event_id === evt.event_id;
                return (
                  <div
                    key={evt.event_id}
                    onClick={() => handleSelectEvent(evt)}
                    className={`px-4 lg:px-6 py-3 cursor-pointer transition-colors text-xs font-mono space-y-1.5 ${
                      isSelected
                        ? 'bg-white/[0.06] border-l-2 border-emerald-400'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${getEventBadgeColor(evt.event_type)}`}>
                        {evt.event_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[#737373] tabular-nums">
                        {new Date(evt.timestamp).toLocaleTimeString()}.{String(new Date(evt.timestamp).getMilliseconds()).padStart(3, '0')}
                      </span>
                    </div>

                    <div className="text-white text-xs leading-relaxed font-mono">
                      {evt.message}
                      {Number(evt.data?.repeated_count || 1) > 1 && <span className="ml-2 text-amber-300">(x{Number(evt.data.repeated_count)})</span>}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#737373]">
                      {evt.data?.component && <span>COMPONENT: {String(evt.data.component)}</span>}
                      {evt.data?.severity && <span className={String(evt.data.severity).toLowerCase() === 'error' ? 'text-red-400' : String(evt.data.severity).toLowerCase() === 'warning' ? 'text-amber-300' : 'text-[#737373]'}>SEVERITY: {String(evt.data.severity).toUpperCase()}</span>}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-[#737373] pt-0.5">
                      <span>ID: {evt.event_id}</span>
                      {evt.tx_signature && (
                        <span className="text-emerald-400">SIG: {evt.tx_signature.slice(0, 8)}...</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Full JSON Inspector & Event Telemetry */}
        <div className={`lg:col-span-6 xl:col-span-5 flex flex-col h-[calc(100vh-12rem)] overflow-hidden bg-[#090909]/40 ${
          mobileDetailOpen ? 'flex' : 'hidden lg:flex'
        }`}>
          {/* Back button for mobile */}
          <div className="lg:hidden p-3 border-b border-white/[0.08] flex items-center gap-2">
            <button
              onClick={() => setMobileDetailOpen(false)}
              className="px-2.5 py-1 rounded-lg glass-icon flex items-center gap-1.5 text-xs font-mono text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Event Feed</span>
            </button>
          </div>

          {selectedEvent ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Event Metadata Header */}
              <div className="p-4 lg:p-5 border-b border-white/[0.08] space-y-2 bg-white/[0.01]">
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-1 rounded text-xs uppercase font-bold border ${getEventBadgeColor(selectedEvent.event_type)}`}>
                    {selectedEvent.event_type}
                  </span>
                  <span className="text-xs font-mono text-[#8e8e93] tabular-nums">
                    {new Date(selectedEvent.timestamp).toISOString()}
                  </span>
                </div>

                <div className="text-white font-mono text-xs leading-relaxed">
                  {selectedEvent.message}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-[#8e8e93]">
                  {selectedEvent.data?.component && <span>COMPONENT: {String(selectedEvent.data.component)}</span>}
                  {selectedEvent.data?.severity && <span className={String(selectedEvent.data.severity).toLowerCase() === 'error' ? 'text-red-400' : String(selectedEvent.data.severity).toLowerCase() === 'warning' ? 'text-amber-300' : 'text-emerald-300'}>SEVERITY: {String(selectedEvent.data.severity).toUpperCase()}</span>}
                  {selectedEvent.data?.reconnect_count !== undefined && <span>RECONNECT: {String(selectedEvent.data.reconnect_count)}</span>}
                </div>

                {selectedEvent.tx_signature && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-[11px] font-mono text-[#737373]">Signature:</span>
                    <span className="text-[11px] font-mono text-emerald-400 truncate max-w-[200px]">
                      {selectedEvent.tx_signature}
                    </span>
                    <button
                      onClick={() => handleCopyTx(selectedEvent.tx_signature!)}
                      className="p-1 rounded glass-icon text-[#8e8e93] hover:text-white"
                    >
                      {copiedTx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                )}
              </div>

              {/* JSON Code Viewer */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-5">
                <div className="text-[11px] font-mono text-[#737373] uppercase mb-2">
                  Payload JSON Tree
                </div>
                <JsonViewer data={selectedEvent.data || selectedEvent} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center text-xs font-mono text-[#737373]">
              Select an event from the stream to inspect its raw JSON payload and signature.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

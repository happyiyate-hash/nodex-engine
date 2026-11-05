import React from 'react';
import { useTerminal } from '../../context/TerminalContext';
import {
  Activity,
  Play,
  Pause,
  Radio,
  Zap,
} from 'lucide-react';
import { PWAInstallButton } from '../common/PWAInstallButton';

export const Navbar: React.FC = () => {
  const {
    engineStatus,
    summary,
    isStreamPaused,
    toggleStreamPause,
  } = useTerminal();

  return (
    <header className="h-14 border-b border-white/[0.08] backdrop-blur-xl bg-[#0c0c0c]/80 px-4 md:px-6 flex items-center justify-between select-none shrink-0 z-30 sticky top-0 w-full">
      {/* Brand Zone */}
      <div className="flex items-center gap-3 shrink-0">
        <div
          className="flex items-center gap-2.5 cursor-pointer touch-manipulation"
          onClick={() => {
            closeTokenDetail();
            setActiveTab('overview');
          }}
        >
          <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center font-bold text-xs text-white font-mono shadow-inner">
            NX
          </div>
          <span className="text-sm font-bold tracking-wider text-white font-mono uppercase">
            NodeX
          </span>
        </div>
        <div className="hidden sm:flex items-center text-xs font-mono text-[#8e8e93]">
          <span className="text-[#404040]">/</span>
          <span className="ml-2 text-[#737373]">SOLANA ENGINE</span>
          <span className="mx-2 text-[#404040]">·</span>
          <span className="text-amber-400 font-semibold tracking-wider">PAPER TRADING</span>
        </div>
      </div>

      {/* Middle Status & Telemetry Matrix (Desktop) */}
      <div className="hidden lg:flex items-center gap-4 text-xs font-mono">
        {/* Engine State */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg glass-icon">
          <span className={`w-1.5 h-1.5 rounded-full ${engineStatus.running ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className="text-[#a3a3a3]">ENGINE:</span>
          <span className={engineStatus.running ? 'text-white font-medium' : 'text-red-400'}>
            {engineStatus.running ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>

        {/* WebSocket & RPC Latency */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg glass-icon">
          <Radio className="w-3 h-3 text-emerald-400" />
          <span className="text-[#a3a3a3]">WS:</span>
          <span className="text-emerald-400 font-medium tabular-nums">{engineStatus.rpc_latency_ms}ms</span>
          <span className="text-[#525252]">|</span>
          <span className="text-[#a3a3a3] uppercase">{engineStatus.network}</span>
        </div>

        {/* SOL Price */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg glass-icon">
          <Zap className="w-3 h-3 text-[#a3a3a3]" />
          <span className="text-[#a3a3a3]">SOL:</span>
          <span className="text-white font-semibold tabular-nums font-mono">${summary.sol_price_usd.toFixed(2)}</span>
        </div>

        {/* Throughput */}
        <div className="flex items-center gap-1.5 text-[#737373] tabular-nums text-[11px]">
          <Activity className="w-3 h-3 text-[#525252]" />
          <span>{engineStatus.incoming_event_rate} evt/s</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Stream Pause / Play */}
        <button
          onClick={toggleStreamPause}
          title={isStreamPaused ? 'Resume live WebSocket stream' : 'Pause live WebSocket stream'}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-lg glass-icon transition-all ${
            isStreamPaused
              ? 'bg-amber-950/40 text-amber-300 border-amber-500/30'
              : 'text-[#a3a3a3] hover:text-white'
          }`}
        >
          {isStreamPaused ? <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> : <Pause className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isStreamPaused ? 'PAUSED' : 'LIVE'}</span>
        </button>

        {/* PWA Install Button */}
        <PWAInstallButton variant="nav" />

      </div>
    </header>
  );
};

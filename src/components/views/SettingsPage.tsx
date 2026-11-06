import React from 'react';
import { Pause, Play } from 'lucide-react';
import { useTerminal } from '../../context/TerminalContext';

export const SettingsPage: React.FC = () => {
  const { engineStatus, toggleEngine } = useTerminal();
  const isRunning = engineStatus.running;

  return (
    <div className="min-h-[calc(100dvh-6rem)] w-full bg-black text-white">
      <header
        className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-black/95 backdrop-blur-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-[15px] font-semibold tracking-tight text-white">Settings</h1>
          <button
            type="button"
            onClick={toggleEngine}
            aria-label={isRunning ? 'Pause engine' : 'Resume engine'}
            title={isRunning ? 'Pause engine' : 'Resume engine'}
            className={`inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3.5 text-[11px] font-semibold transition-colors active:scale-[0.97] ${isRunning
              ? 'border-amber-400/20 bg-amber-400/[0.08] text-amber-200'
              : 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200'}`}
          >
            {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isRunning ? 'Pause' : 'Resume'}</span>
          </button>
        </div>
      </header>

    </div>
  );
};

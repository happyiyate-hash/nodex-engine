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
          <div className="ml-auto flex h-10 w-11 shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-[0_2px_10px_rgba(255,255,255,0.08)]">
            <button
              type="button"
              onClick={toggleEngine}
              aria-label={isRunning ? 'Pause engine' : 'Resume engine'}
              title={isRunning ? 'Pause engine' : 'Resume engine'}
              className="flex h-full w-full items-center justify-center rounded-lg bg-black text-white transition-transform active:scale-90"
            >
              {isRunning ? <Pause className="h-4 w-4" strokeWidth={2.5} /> : <Play className="h-4 w-4 fill-current" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </header>

    </div>
  );
};

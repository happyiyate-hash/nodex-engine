import React, { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { useTerminal } from '../../context/TerminalContext';

export const SettingsPage: React.FC = () => {
  const { engineStatus } = useTerminal();
  // Local mock control for the Settings UI; this does not send commands to the backend yet.
  const [isRunning, setIsRunning] = useState(engineStatus.running);

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
            onClick={() => setIsRunning((running) => !running)}
            aria-label={isRunning ? 'Pause engine' : 'Resume engine'}
            title={isRunning ? 'Pause engine' : 'Resume engine'}
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_2px_10px_rgba(255,255,255,0.08)] transition-transform active:scale-95"
          >
            {isRunning
              ? <Pause className="h-4 w-4" strokeWidth={2.5} />
              : <Play className="h-4 w-4 fill-current" strokeWidth={2.5} />}
          </button>
        </div>
      </header>
    </div>
  );
};

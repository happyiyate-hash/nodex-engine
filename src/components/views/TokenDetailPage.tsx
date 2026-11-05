import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTerminal } from '../../context/TerminalContext';

export const TokenDetailPage: React.FC = () => {
  const { closeTokenDetail } = useTerminal();

  return (
    <main className="h-full min-h-0 w-full overflow-hidden bg-[#080808] text-white">
      <header className="sticky top-0 z-30 w-full bg-black/65 backdrop-blur-2xl">
        <div className="flex h-11 items-center">
          <button
            type="button"
            onClick={closeTokenDetail}
            className="inline-flex h-full shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-white/80 transition hover:bg-white/[0.08] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Go back
          </button>
        </div>
      </header>
    </main>
  );
};

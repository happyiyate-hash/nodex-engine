import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTerminal } from '../../context/TerminalContext';

export const TokenDetailPage: React.FC = () => {
  const { closeTokenDetail } = useTerminal();

  return (
    <main className="h-full min-h-0 w-full overflow-hidden bg-[#080808] text-white">
      <div aria-hidden="true" className="h-[env(safe-area-inset-top)] min-h-0 w-full bg-[#080808]/75 backdrop-blur-2xl" />
      <header className="sticky top-0 z-30 h-[76px] w-full border-b border-white/[0.12] bg-[#080808]/75 px-3 pb-2 pt-3 shadow-[0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-2xl sm:px-5">
        <div className="flex h-full items-center">
          <button
            type="button"
            onClick={closeTokenDetail}
            aria-label="Go back"
            title="Go back"
            className="grid size-10 place-items-center rounded-full border border-white/[0.20] bg-white/[0.045] text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_12px_rgba(0,0,0,0.28)] transition hover:border-white/[0.32] hover:bg-white/[0.09] hover:text-white active:scale-95"
          >
            <ArrowLeft className="size-[17px]" strokeWidth={2.1} />
          </button>
        </div>
      </header>
    </main>
  );
};

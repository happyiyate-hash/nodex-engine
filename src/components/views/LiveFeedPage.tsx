import React, { useState } from 'react';
import { OverviewPage } from './OverviewPage';

type LiveSection = 'detected' | 'positions';
type LiveFeedPageProps = { activeTab: string; visible: boolean };

export const LiveFeedPage: React.FC<LiveFeedPageProps> = ({ activeTab, visible }) => {
  const [section, setSection] = useState<LiveSection>('detected');

  return (
    <main className={`${visible ? "relative" : "pointer-events-none invisible absolute inset-0"} flex h-full min-h-0 w-full flex-col bg-[#080808] text-white`}>
      {activeTab === "live_feed" && <div className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080808]/95 px-3 pb-2 pt-3 backdrop-blur-xl sm:px-5">
        <div className="mb-2 text-[13px] font-semibold tracking-wide">Live</div>
        <nav aria-label="Live sections" className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.07] bg-[#0d0d0d] p-1">
          {([
            ['detected', 'Detection'],
            ['positions', 'Position'],
          ] as [LiveSection, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSection(value)}
              aria-current={section === value ? 'page' : undefined}
              className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition-all ${section === value ? 'bg-[#242424] text-white shadow-sm' : 'text-white/40 hover:text-white/75'}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <OverviewPage embeddedMode={section} />
      </div>
    </main>
  );
};

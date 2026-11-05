import React from 'react';
import { FileJson, RadioTower, Settings } from 'lucide-react';
import { useTerminal, NavigationTab } from '../../context/TerminalContext';

function HomeNavIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none">
      <path d="M14 25L28.8 13.5Q32 10.8 35.2 13.5L50 25Q52 27 52 30V47Q52 52 46 52H18Q12 52 12 47V30Q12 27 14 25Z" fill="currentColor" />
      <rect x="24.5" y="43.5" width="15" height="3.2" rx="1.6" fill="#09090b" />
    </svg>
  );
}

const MAIN_ITEMS: { tab: NavigationTab; label: string; icon: React.ElementType }[] = [
  { tab: 'overview', label: 'Overview', icon: HomeNavIcon },
  { tab: 'live_feed', label: 'Live Feed', icon: RadioTower },
  { tab: 'event_monitor', label: 'Logs', icon: FileJson },
];

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab, closeTokenDetail, selectedToken } = useTerminal();
  const select = (tab: NavigationTab) => { closeTokenDetail(); setActiveTab(tab); };

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 flex items-stretch gap-2 select-none pointer-events-auto">
      <nav aria-label="Main navigation" className="glass-nav-float flex h-[60px] min-w-0 flex-1 items-center rounded-full p-1.5 backdrop-blur-2xl">
        <div className="grid h-full w-full grid-cols-3 gap-1">
          {MAIN_ITEMS.map(({ tab, label, icon: Icon }) => {
            const active = activeTab === tab && !selectedToken;
            return (
              <button key={tab} type="button" onClick={() => select(tab)} aria-label={label} aria-current={active ? 'page' : undefined}
                className={`flex h-full min-w-0 items-center justify-center gap-1.5 rounded-full px-2 transition-all duration-200 active:scale-[0.97] ${active ? 'bg-background/75 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_2px_8px_rgba(0,0,0,0.22)] ring-1 ring-white/[0.08]' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}`}>
                <Icon className="size-[19px] shrink-0" />
                <span className="truncate text-[10px] font-medium tracking-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <button type="button" onClick={() => select('settings')} aria-label="Settings" title="Settings"
        aria-current={activeTab === 'settings' && !selectedToken ? 'page' : undefined}
        className={`grid size-[60px] shrink-0 place-items-center rounded-full border border-white/20 bg-secondary/65 text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.22),0_-6px_24px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-colors ${activeTab === 'settings' && !selectedToken ? 'text-foreground' : 'hover:text-foreground'}`}>
        <Settings className="size-[21px]" />
      </button>
    </div>
  );
};

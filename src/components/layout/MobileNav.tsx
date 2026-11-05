import React, { useEffect, useRef, useState } from 'react';
import { Flame, ScrollText, Settings } from 'lucide-react';
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
  { tab: 'live_feed', label: 'Live feed', icon: Flame },
  { tab: 'event_monitor', label: 'Logs', icon: ScrollText },
];

type BubblePosition = { x: number; y: number };

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab, closeTokenDetail, selectedToken } = useTerminal();
  const [collapsed, setCollapsed] = useState(false);
  const [bubblePosition, setBubblePosition] = useState<BubblePosition | null>(null);
  const settingsRef = useRef<HTMLButtonElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const dragStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dragged = useRef(false);

  const select = (tab: NavigationTab) => { closeTokenDetail(); setActiveTab(tab); };

  const clearHoldTimer = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  useEffect(() => () => clearHoldTimer(), []);

  const beginSettingsHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearHoldTimer();
    longPressTriggered.current = false;
    holdTimer.current = setTimeout(() => {
      const rect = settingsRef.current?.getBoundingClientRect();
      if (!rect) return;
      longPressTriggered.current = true;
      setBubblePosition({ x: rect.left + rect.width / 2 - 20, y: rect.top + rect.height / 2 - 20 });
      setCollapsed(true);
    }, 560);
  };

  const finishSettingsHold = () => clearHoldTimer();

  const openFromBubble = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    setCollapsed(false);
    setBubblePosition(null);
  };

  const beginBubbleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragged.current = false;
    const rect = event.currentTarget.getBoundingClientRect();
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveBubble = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return;
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragged.current = true;
    if (!dragged.current) return;
    const size = 40;
    setBubblePosition({
      x: Math.max(0, Math.min(window.innerWidth - size, dragStart.current.left + dx)),
      y: Math.max(0, Math.min(window.innerHeight - size, dragStart.current.top + dy)),
    });
  };

  const endBubbleDrag = () => { dragStart.current = null; };

  if (collapsed) {
    return (
      <>
        <style>{`@keyframes settings-heartbeat { 0%,100% { box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 0 0 rgba(255,255,255,0); } 35% { box-shadow: 0 0 0 2px rgba(255,255,255,.55), 0 0 22px 7px rgba(255,255,255,.28); } 65% { box-shadow: 0 0 0 1px rgba(255,255,255,.24), 0 0 10px 2px rgba(255,255,255,.12); } }`}</style>
        <button
          type="button"
          aria-label="Restore navigation"
          title="Restore navigation"
          onClick={openFromBubble}
          onPointerDown={beginBubbleDrag}
          onPointerMove={moveBubble}
          onPointerUp={endBubbleDrag}
          onPointerCancel={endBubbleDrag}
          className="fixed z-50 grid size-10 touch-none place-items-center rounded-full border border-white/30 bg-[#181818]/95 text-white shadow-[0_0_18px_rgba(255,255,255,0.18)] backdrop-blur-2xl transition-[width,height,border-radius,background] duration-300"
          style={{ left: bubblePosition?.x ?? 16, top: bubblePosition?.y ?? 16, animation: 'settings-heartbeat 1.15s ease-in-out infinite' }}
        >
          <Settings className="size-[15px] scale-0 opacity-0" />
          <span className="absolute inset-0 rounded-full bg-white/[0.04]" />
        </button>
      </>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 flex items-center gap-2 select-none pointer-events-auto">
      <style>{`@keyframes settings-heartbeat { 0%,100% { box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 0 0 rgba(255,255,255,0); } 35% { box-shadow: 0 0 0 2px rgba(255,255,255,.55), 0 0 22px 7px rgba(255,255,255,.28); } 65% { box-shadow: 0 0 0 1px rgba(255,255,255,.24), 0 0 10px 2px rgba(255,255,255,.12); } }`}</style>
      <nav aria-label="Main navigation" className="glass-nav-float flex h-[60px] min-w-0 flex-1 items-center rounded-full p-1.5 backdrop-blur-2xl transition-all duration-500">
        <div className="grid h-full w-full grid-cols-3 items-center gap-1">
          {MAIN_ITEMS.map(({ tab, label, icon: Icon }) => {
            const active = activeTab === tab && !selectedToken;
            return (
              <button key={tab} type="button" onClick={() => select(tab)} aria-label={label} title={label} aria-current={active ? 'page' : undefined}
                className={`group flex h-full min-w-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95 ${active ? 'bg-background/75 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_3px_12px_rgba(0,0,0,0.32)] ring-1 ring-white/[0.10]' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}`}>
                <Icon className={`size-[23px] shrink-0 transition-all duration-200 ${active ? '-translate-y-1 scale-[1.18] drop-shadow-[0_3px_7px_rgba(255,255,255,0.20)]' : 'group-hover:scale-110'}`} strokeWidth={active ? 2.4 : 2} />
              </button>
            );
          })}
        </div>
      </nav>
      <button
        ref={settingsRef}
        type="button"
        onPointerDown={beginSettingsHold}
        onPointerUp={finishSettingsHold}
        onPointerLeave={finishSettingsHold}
        onPointerCancel={finishSettingsHold}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => { if (longPressTriggered.current) { longPressTriggered.current = false; return; } select('settings'); }}
        aria-label="Settings"
        title="Settings"
        aria-current={activeTab === 'settings' && !selectedToken ? 'page' : undefined}
        className={`grid size-[60px] shrink-0 place-items-center rounded-full border border-white/20 bg-secondary/65 text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06),inset_0_1px_0_rgba(255,255,255,0.22),0_-6px_24px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-all duration-500 ${activeTab === 'settings' && !selectedToken ? 'text-foreground' : 'hover:text-foreground'} ${longPressTriggered.current ? 'animate-[settings-heartbeat_1s_ease-in-out]' : ''}`}
      >
        <Settings className={`size-[22px] transition-transform duration-300 ${activeTab === 'settings' && !selectedToken ? 'scale-110' : ''}`} />
      </button>
    </div>
  );
};

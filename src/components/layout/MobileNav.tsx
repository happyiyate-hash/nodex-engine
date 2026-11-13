import React, { useEffect, useRef, useState } from 'react';
import { Flame, ScrollText, Settings } from 'lucide-react';
import { useTerminal, NavigationTab } from '../../context/TerminalContext';

function HomeNavIcon({ className }: { className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 64 64" fill="none"><path d="M14 25L28.8 13.5Q32 10.8 35.2 13.5L50 25Q52 27 52 30V47Q52 52 46 52H18Q12 52 12 47V30Q12 27 14 25Z" fill="currentColor" /><rect x="24.5" y="43.5" width="15" height="3.2" rx="1.6" fill="#09090b" /></svg>;
}

const MAIN_ITEMS: { tab: NavigationTab; label: string; icon: React.ElementType }[] = [
  { tab: 'overview', label: 'Overview', icon: HomeNavIcon },
  { tab: 'live_feed', label: 'Live feed', icon: Flame },
  { tab: 'event_monitor', label: 'Logs', icon: ScrollText },
];

type BubblePosition = { x: number; y: number };
type Phase = 'idle' | 'swallow' | 'floating' | 'restore';

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab, closeTokenDetail, selectedToken } = useTerminal();
  const [phase, setPhase] = useState<Phase>('idle');
  const [holding, setHolding] = useState(false);
  const [bubblePosition, setBubblePosition] = useState<BubblePosition | null>(null);
  const settingsRef = useRef<HTMLButtonElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const dragStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const dragged = useRef(false);

  const select = (tab: NavigationTab) => { closeTokenDetail(); setActiveTab(tab); };
  const clearTimers = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    holdTimer.current = null;
    transitionTimer.current = null;
  };
  useEffect(() => () => clearTimers(), []);

  const beginSettingsHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    longPressTriggered.current = false;
    setHolding(true);
    holdTimer.current = setTimeout(() => {
      const rect = settingsRef.current?.getBoundingClientRect();
      if (!rect) return;
      longPressTriggered.current = true;
      setBubblePosition({ x: rect.left + rect.width / 2 - 20, y: rect.top + rect.height / 2 - 20 });
      setPhase('swallow');
      transitionTimer.current = setTimeout(() => setPhase('floating'), 440);
    }, 560);
  };
  const finishSettingsHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  };

  const restoreNav = () => {
    if (dragged.current) { dragged.current = false; return; }
    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    setPhase('restore');
    transitionTimer.current = setTimeout(() => {
      setPhase('idle');
      setBubblePosition(null);
      longPressTriggered.current = false;
    }, 460);
  };

  const beginBubbleDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    dragged.current = false;
    const rect = event.currentTarget.getBoundingClientRect();
    dragStart.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveBubble = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragStart.current) return;
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) dragged.current = true;
    if (!dragged.current) return;
    setBubblePosition({
      x: Math.max(0, Math.min(window.innerWidth - 40, dragStart.current.left + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 40, dragStart.current.top + dy)),
    });
  };

  const collapsing = phase === 'swallow' || phase === 'floating';
  const bubbleShown = phase === 'floating' || phase === 'restore';

  return <>
    <style>{'@keyframes settings-heartbeat { 0%,100% { box-shadow: 0 0 0 1px rgba(255,255,255,.12), 0 0 0 rgba(255,255,255,0); } 35% { box-shadow: 0 0 0 2px rgba(255,255,255,.58), 0 0 24px 8px rgba(255,255,255,.30); } 65% { box-shadow: 0 0 0 1px rgba(255,255,255,.24), 0 0 10px 2px rgba(255,255,255,.12); } }'}</style>
    <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 flex items-center gap-2 select-none pointer-events-none">
      <nav aria-label="Main navigation" className="glass-nav-float flex h-[60px] min-w-0 flex-1 items-center overflow-hidden rounded-full border border-amber-300/[0.16] p-1.5 backdrop-blur-2xl shadow-[0_12px_34px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12),0_0_0_1px_rgba(255,255,255,0.025)] pointer-events-auto"
        style={{ background: 'linear-gradient(112deg, rgba(231,137,55,.13) 0%, rgba(229,177,74,.085) 52%, rgba(15,15,15,.92) 100%), rgba(15,15,15,.88)', transform: collapsing ? 'translateX(34px) scaleX(.02)' : 'translateX(0) scaleX(1)', transformOrigin: 'right center', opacity: collapsing ? 0 : 1, flexBasis: collapsing ? '0%' : 'auto', transition: 'transform 420ms cubic-bezier(.7,0,.2,1), opacity 360ms ease, flex-basis 420ms cubic-bezier(.7,0,.2,1)' }}>
        <div className="grid h-full w-full min-w-[220px] grid-cols-3 items-center gap-1">
          {MAIN_ITEMS.map(({ tab, label, icon: Icon }) => {
            const active = activeTab === tab && !selectedToken;
            return <button key={tab} type="button" onClick={() => select(tab)} aria-label={label} title={label} aria-current={active ? 'page' : undefined}
              className={'group flex h-full min-w-0 items-center justify-center rounded-full transition-all duration-200 active:scale-95 ' + (active ? 'bg-amber-400/[0.10] text-amber-200 shadow-[inset_0_1px_0_rgba(255,226,170,0.14),0_3px_12px_rgba(0,0,0,0.28)] ring-1 ring-amber-300/[0.16]' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground')}>
              <Icon className={'size-[23px] shrink-0 transition-all duration-200 ' + (active ? '-translate-y-1 scale-[1.18] drop-shadow-[0_3px_8px_rgba(231,137,55,0.30)]' : 'group-hover:scale-110')} strokeWidth={active ? 2.4 : 2} />
            </button>;
          })}
        </div>
      </nav>
      <button ref={settingsRef} type="button" onPointerDown={beginSettingsHold} onPointerUp={finishSettingsHold} onPointerLeave={finishSettingsHold} onPointerCancel={finishSettingsHold}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => { if (longPressTriggered.current) { longPressTriggered.current = false; return; } select('settings'); }}
        aria-label="Settings" title="Settings" aria-current={activeTab === 'settings' && !selectedToken ? 'page' : undefined}
        className={'pointer-events-auto grid size-[60px] shrink-0 place-items-center rounded-full border border-transparent bg-transparent text-muted-foreground shadow-none backdrop-blur-2xl transition-all duration-200 active:scale-95 ' + (activeTab === 'settings' && !selectedToken ? 'border-amber-300/[0.16] bg-amber-400/[0.10] text-amber-200 ring-1 ring-amber-300/[0.16] shadow-[inset_0_1px_0_rgba(255,226,170,0.14),0_3px_12px_rgba(0,0,0,0.28)]' : 'hover:bg-amber-400/[0.06] hover:text-amber-100')}
        style={{ opacity: collapsing ? 0 : 1, transform: collapsing ? 'scale(.05)' : 'scale(1)', animation: holding && phase === 'idle' ? 'settings-heartbeat .72s ease-in-out infinite' : 'none', transition: 'transform 420ms cubic-bezier(.7,0,.2,1), opacity 360ms ease' }}>
        <Settings className={'size-[22px] transition-all duration-200 ' + (activeTab === 'settings' && !selectedToken ? '-translate-y-1 scale-[1.18] drop-shadow-[0_3px_8px_rgba(231,137,55,0.30)]' : 'group-hover:scale-110')} />
      </button>
    </div>
    {bubbleShown && <button type="button" aria-label="Restore navigation" title="Restore navigation" onClick={restoreNav}
      onPointerDown={beginBubbleDrag} onPointerMove={moveBubble} onPointerUp={() => { dragStart.current = null; }} onPointerCancel={() => { dragStart.current = null; }}
      className="fixed z-50 grid size-10 touch-none place-items-center rounded-full border border-white/30 bg-[#181818]/95 text-white shadow-[0_0_18px_rgba(255,255,255,0.18)] backdrop-blur-2xl"
      style={{ left: bubblePosition?.x ?? 16, top: bubblePosition?.y ?? 16, opacity: phase === 'floating' ? 1 : 0, transform: phase === 'floating' ? 'scale(1)' : 'scale(.05)', animation: phase === 'floating' ? 'settings-heartbeat 1.15s ease-in-out infinite' : 'none', transition: 'opacity 360ms ease, transform 420ms cubic-bezier(.2,.8,.2,1)' }}>
      <Settings className="size-[15px] scale-0 opacity-0" />
    </button>}
  </>;
};

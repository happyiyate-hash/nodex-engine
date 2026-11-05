import React, { useEffect, useRef, useState } from 'react';
import { TerminalProvider, useTerminal } from './context/TerminalContext';
import { MobileNav } from './components/layout/MobileNav';
import { OverviewPage } from './components/views/OverviewPage';
import { PositionsPage } from './components/views/PositionsPage';
import { LiveFeedPage } from './components/views/LiveFeedPage';
import { StrategyPage } from './components/views/StrategyPage';
import { TokenIntelligencePage } from './components/views/TokenIntelligencePage';
import { SettingsPage } from './components/views/SettingsPage';
import { TokenDetailPage } from './components/views/TokenDetailPage';
import { LogsPage } from './components/views/LogsPage';
import { installFetchLogger } from './services/engineLogs';

installFetchLogger();

const REFRESH_TRIGGER_DISTANCE = 72;

// The pull has no hard stop: it keeps extending with increasing spring resistance.
const getResistedPull = (fingerDistance: number) => 116 * (1 - Math.exp(-fingerDistance / 145));

const MainLayout: React.FC = () => {
  const { activeTab, selectedToken } = useTerminal();
  const mainRef = useRef<HTMLElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const renderActiveView = () => {
    if (selectedToken) return <TokenDetailPage />;

    switch (activeTab) {
      case 'overview': return <OverviewPage />;
      case 'positions': return <PositionsPage />;
      case 'live_feed': return <LiveFeedPage />;
      case 'event_monitor': return <LogsPage />;
      case 'strategy': return <StrategyPage />;
      case 'token_intelligence': return <TokenIntelligencePage />;
      case 'settings': return <SettingsPage />;
      default: return <OverviewPage />;
    }
  };



  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1 || main.scrollTop > 0) return;
      touchStartY.current = event.touches[0].clientY;
      pullDistanceRef.current = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (touchStartY.current === null || refreshingRef.current || event.touches.length !== 1) return;
      const delta = event.touches[0].clientY - touchStartY.current;
      if (delta <= 0 || main.scrollTop > 0) {
        if (delta < 0) touchStartY.current = null;
        return;
      }
      event.preventDefault();
      const distance = getResistedPull(delta);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    };

    const onTouchEnd = () => {
      touchStartY.current = null;
      if (pullDistanceRef.current >= REFRESH_TRIGGER_DISTANCE) {
        refreshingRef.current = true;
        setIsRefreshing(true);
        setPullDistance(REFRESH_TRIGGER_DISTANCE);
        window.setTimeout(() => window.location.reload(), 320);
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    main.addEventListener('touchstart', onTouchStart, { passive: true });
    main.addEventListener('touchmove', onTouchMove, { passive: false });
    main.addEventListener('touchend', onTouchEnd, { passive: true });
    main.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      main.removeEventListener('touchstart', onTouchStart);
      main.removeEventListener('touchmove', onTouchMove);
      main.removeEventListener('touchend', onTouchEnd);
      main.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const indicatorVisible = pullDistance > 0 || isRefreshing;
  const indicatorRotation = Math.min(300, (pullDistance / REFRESH_TRIGGER_DISTANCE) * 300);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white font-sans selection:bg-white/20">
      <main
        ref={mainRef}
        className="relative z-10 h-full w-full overflow-y-auto overscroll-y-none pb-24 focus:outline-none"
        style={{ touchAction: 'pan-x' }}
      >
        <div
          aria-live="polite"
          aria-label={isRefreshing ? 'Refreshing page' : 'Pull down to refresh'}
          className="pointer-events-none absolute left-1/2 top-0 z-50 flex items-center justify-center"
          style={{
            opacity: indicatorVisible ? 1 : 0,
            transform: `translate(-50%, ${indicatorVisible ? pullDistance + 12 : -44}px)`,
            transition: isRefreshing ? 'transform 180ms cubic-bezier(.2,.8,.2,1), opacity 120ms ease' : 'opacity 100ms linear',
          }}
        >
          <svg viewBox="0 0 24 24" className={`h-6 w-6 ${isRefreshing ? 'animate-spin' : ''}`} fill="none">
            <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.18)" strokeWidth="2.4" />
            <path d="M12 3a9 9 0 0 1 9 9" stroke="white" strokeWidth="2.4" strokeLinecap="round"
              transform={isRefreshing ? undefined : `rotate(${indicatorRotation} 12 12)`} />
          </svg>
        </div>
        {renderActiveView()}
      </main>

      {activeTab !== 'event_monitor' && <MobileNav />}
    </div>
  );
};

export default function App() {
  return (
    <TerminalProvider>
      <MainLayout />
    </TerminalProvider>
  );
};

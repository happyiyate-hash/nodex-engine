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
const getResistedPull = (fingerDistance: number) =>
  116 * (1 - Math.exp(-Math.max(0, fingerDistance) / 145));

const getScrollableAncestor = (target: EventTarget | null, boundary: HTMLElement): HTMLElement | null => {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== boundary) {
    const style = window.getComputedStyle(node);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1;
    if (canScrollY) return node;
    node = node.parentElement;
  }
  return null;
};

const MainLayout: React.FC = () => {
  const { activeTab, selectedToken } = useTerminal();
  const mainRef = useRef<HTMLElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const refreshScroller = useRef<HTMLElement | null>(null);
  const pullDistanceRef = useRef(0);
  const pullingRef = useRef(false);
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

    const resetPull = () => {
      touchStartY.current = null;
      refreshScroller.current = null;
      pullingRef.current = false;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) {
        resetPull();
        return;
      }

      const touch = event.touches[0];
      // Allow pull-to-refresh from the Overview master card, or from the
      // token feed only when that feed is already at its top boundary. Avoid
      // the physical screen edge so Android's notification shade is not caught.
      const target = event.target instanceof Element ? event.target : null;
      const masterCard = target?.closest('[aria-label="Overview controls"]');
      const nestedScroller = getScrollableAncestor(event.target, main);
      const isOverview = activeTab === 'overview' && !selectedToken;
      const startedInMaster = Boolean(masterCard);
      const startedInFeed = Boolean(nestedScroller && isOverview);
      if (isOverview && !startedInMaster && !startedInFeed) {
        resetPull();
        return;
      }
      if (nestedScroller && nestedScroller.scrollTop > 1) {
        resetPull();
        return;
      }
      if (!isOverview && main.scrollTop > 1) {
        resetPull();
        return;
      }

      refreshScroller.current = nestedScroller;
      touchStartY.current = touch.clientY;
      pullingRef.current = false;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (touchStartY.current === null || refreshingRef.current || event.touches.length !== 1) return;

      if (refreshScroller.current && refreshScroller.current.scrollTop > 1) {
        resetPull();
        return;
      }
      if (!refreshScroller.current && activeTab !== 'overview' && main.scrollTop > 1) {
        resetPull();
        return;
      }

      const delta = event.touches[0].clientY - touchStartY.current;
      if (pullingRef.current) {
        event.preventDefault();
        const distance = getResistedPull(delta);
        pullDistanceRef.current = distance;
        setPullDistance(distance);
        return;
      }

      // Upward movement and ordinary scrolling never activate the indicator.
      if (delta <= 0) return;

      pullingRef.current = true;
      event.preventDefault();
      const distance = getResistedPull(delta);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    };

    const onTouchEnd = () => {
      touchStartY.current = null;
      if (pullingRef.current && pullDistanceRef.current >= REFRESH_TRIGGER_DISTANCE) {
        pullingRef.current = false;
        refreshingRef.current = true;
        setIsRefreshing(true);
        setPullDistance(REFRESH_TRIGGER_DISTANCE);
        window.setTimeout(() => window.location.reload(), 320);
      } else {
        resetPull();
      }
    };

    const onTouchCancel = () => resetPull();

    main.addEventListener('touchstart', onTouchStart, { passive: true });
    main.addEventListener('touchmove', onTouchMove, { passive: false });
    main.addEventListener('touchend', onTouchEnd, { passive: true });
    main.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      main.removeEventListener('touchstart', onTouchStart);
      main.removeEventListener('touchmove', onTouchMove);
      main.removeEventListener('touchend', onTouchEnd);
      main.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);

  const indicatorVisible = pullDistance > 0 || isRefreshing;
  const indicatorOpacity = isRefreshing ? 1 : Math.min(1, pullDistance / 22);
  const indicatorRotation = (pullDistance / REFRESH_TRIGGER_DISTANCE) * 360;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white font-sans selection:bg-white/20">
      <main ref={mainRef} className={`relative z-10 h-full w-full overscroll-y-none focus:outline-none ${(activeTab === "overview" || activeTab === "live_feed" || selectedToken) ? "overflow-hidden pb-0" : "overflow-y-auto pb-24"}`}>
        <div
          aria-live="polite"
          aria-label={isRefreshing ? 'Refreshing page' : 'Pull down to refresh'}
          className="pointer-events-none absolute left-1/2 top-0 z-50 flex items-center justify-center"
          style={{
            opacity: indicatorVisible ? indicatorOpacity : 0,
            transform: `translate(-50%, ${pullDistance - 24}px)`,
            transition: isRefreshing ? 'transform 180ms cubic-bezier(.2,.8,.2,1), opacity 120ms ease' : 'none',
          }}
        >
          <svg viewBox="0 0 24 24" className={`h-6 w-6 ${isRefreshing ? 'animate-spin' : ''}`} fill="none">
            <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,.18)" strokeWidth="2.4" />
            <path d="M12 3a9 9 0 0 1 9 9" stroke="white" strokeWidth="2.4" strokeLinecap="round" transform={isRefreshing ? undefined : `rotate(${indicatorRotation} 12 12)`} />
          </svg>
        </div>
        {renderActiveView()}
      </main>
      {activeTab !== 'event_monitor' && <MobileNav />}
    </div>
  );
};

export default function App() {
  return <TerminalProvider><MainLayout /></TerminalProvider>;
};

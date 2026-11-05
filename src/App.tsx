import React, { useCallback, useEffect, useRef, useState } from 'react';
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

const REFRESH_TRIGGER_DISTANCE = 76;
const MAX_PULL_DISTANCE = 112;

const MainLayout: React.FC = () => {
  const { activeTab, selectedToken, refreshData } = useTerminal();
  const mainRef = useRef<HTMLElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

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

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    setRefreshError(false);
    try {
      await refreshData();
    } catch {
      setRefreshError(true);
    } finally {
      window.setTimeout(() => {
        refreshingRef.current = false;
        setIsRefreshing(false);
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }, 450);
    }
  }, [refreshData]);

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
      const distance = Math.min(MAX_PULL_DISTANCE, delta * 0.62);
      pullDistanceRef.current = distance;
      setPullDistance(distance);
    };

    const onTouchEnd = () => {
      touchStartY.current = null;
      if (pullDistanceRef.current >= REFRESH_TRIGGER_DISTANCE) {
        void runRefresh();
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
  }, [runRefresh]);

  const indicatorVisible = pullDistance > 0 || isRefreshing;
  const indicatorProgress = Math.min(1, pullDistance / REFRESH_TRIGGER_DISTANCE);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-black text-white font-sans selection:bg-white/20">
      <main
        ref={mainRef}
        className="relative z-10 h-full w-full overflow-y-auto overscroll-y-none pb-24 focus:outline-none"
        style={{ touchAction: 'pan-x' }}
      >
        <div
          aria-live="polite"
          aria-label={isRefreshing ? 'Refreshing NodeX data' : refreshError ? 'Refresh failed' : 'Pull down to refresh'}
          className="pointer-events-none absolute left-1/2 top-3 z-50 flex -translate-x-1/2 items-center justify-center"
          style={{
            opacity: indicatorVisible ? 1 : 0,
            transform: `translate(-50%, ${indicatorVisible ? Math.max(8, pullDistance - 42) : -48}px)`,
            transition: isRefreshing ? 'transform 180ms ease, opacity 180ms ease' : 'opacity 120ms ease',
          }}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#111111] shadow-[0_5px_24px_rgba(0,0,0,.55)]">
            <svg
              viewBox="0 0 24 24"
              className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`}
              style={!isRefreshing ? { transform: `rotate(${indicatorProgress * 270}deg)` } : undefined}
              fill="none"
            >
              <path d="M20 11a8 8 0 1 0 1 4" stroke={refreshError ? '#f87171' : 'white'} strokeWidth="2.2" strokeLinecap="round" opacity=".28" />
              <path d="M20 4v7h-7" stroke={refreshError ? '#f87171' : 'white'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
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

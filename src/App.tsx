import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { TerminalProvider, useTerminal } from './context/TerminalContext';
import { MobileNav } from './components/layout/MobileNav';
import { PositionsPage } from './components/views/PositionsPage';
import { LiveFeedPage } from './components/views/LiveFeedPage';
import { StrategyPage } from './components/views/StrategyPage';
import { TokenIntelligencePage } from './components/views/TokenIntelligencePage';
import { SettingsPage } from './components/views/SettingsPage';
import { StorageManagementPage } from './components/views/StorageManagementPage';
import { TokenDetailPage } from './components/views/TokenDetailPage';
import { LogsPage } from './components/views/LogsPage';
import { installFetchLogger } from './services/engineLogs';
import { ToastProvider } from './components/ui/ToastProvider';

try {
  installFetchLogger();
} catch (err) {
  console.warn('installFetchLogger:', err);
}

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
  const [settingsSubpage, setSettingsSubpage] = useState(false);
  const [storagePageOpen, setStoragePageOpen] = useState(false);
  const { activeTab, selectedToken, refreshBackendState } = useTerminal();
  const mainRef = useRef<HTMLElement | null>(null);
  const touchStartY = useRef<number | null>(null);
  const refreshScroller = useRef<HTMLElement | null>(null);
  const pullDistanceRef = useRef(0);
  const pullingRef = useRef(false);
  const refreshingRef = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['overview']));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

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

      const delta = event.touches[0].clientY - touchStartY.current;
      if (pullingRef.current) {
        event.preventDefault();
        const distance = getResistedPull(delta);
        pullDistanceRef.current = distance;
        setPullDistance(distance);
        return;
      }

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
        if (!Capacitor.isNativePlatform()) {
          // Browser/PWA: use the browser's normal reload behaviour.
          window.setTimeout(() => window.location.reload(), 180);
        } else {
          // Capacitor Android: keep the WebView and current screen alive. Refresh
          // the canonical backend snapshot and the live token/status/config data.
          void refreshBackendState()
            .catch((error) => {
              console.error('[NodeX] Manual backend refresh failed:', error);
            })
            .finally(() => {
              refreshingRef.current = false;
              setIsRefreshing(false);
              setPullDistance(0);
            });
        }
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
  }, [activeTab, selectedToken, refreshBackendState]);

  const indicatorVisible = pullDistance > 0 || isRefreshing;
  const indicatorOpacity = isRefreshing ? 1 : Math.min(1, pullDistance / 22);
  const indicatorRotation = (pullDistance / REFRESH_TRIGGER_DISTANCE) * 360;

  return (
    <div className="fixed inset-0 h-full w-full overflow-hidden bg-black text-white font-sans selection:bg-white/20 select-none">
      <main ref={mainRef} className="relative z-10 flex h-full w-full flex-col overflow-hidden bg-black focus:outline-none">
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

        {/* Cached & persistent views */}
        <div className={`h-full w-full flex-col min-h-0 ${!selectedToken && (activeTab === 'overview' || activeTab === 'live_feed') ? 'flex' : 'hidden'}`}>
          <LiveFeedPage activeTab={activeTab} visible={!selectedToken && (activeTab === 'overview' || activeTab === 'live_feed')} />
        </div>

        {visitedTabs.has('positions') && (
          <div className={`h-full w-full flex-col min-h-0 ${!selectedToken && activeTab === 'positions' ? 'flex' : 'hidden'}`}>
            <PositionsPage />
          </div>
        )}

        {visitedTabs.has('event_monitor') && (
          <div className={`h-full w-full flex-col min-h-0 ${!selectedToken && activeTab === 'event_monitor' ? 'flex' : 'hidden'}`}>
            <LogsPage />
          </div>
        )}

        {visitedTabs.has('strategy') && (
          <div className={`h-full w-full flex-col min-h-0 ${!selectedToken && activeTab === 'strategy' ? 'flex' : 'hidden'}`}>
            <StrategyPage />
          </div>
        )}

        {visitedTabs.has('token_intelligence') && (
          <div className={`h-full w-full flex-col min-h-0 ${!selectedToken && activeTab === 'token_intelligence' ? 'flex' : 'hidden'}`}>
            <TokenIntelligencePage />
          </div>
        )}

        {visitedTabs.has('settings') && (
          <div className={`h-full w-full flex-col min-h-0 ${!selectedToken && activeTab === 'settings' ? 'flex' : 'hidden'}`}>
            {storagePageOpen
              ? <StorageManagementPage onBack={() => { setStoragePageOpen(false); setSettingsSubpage(false); }} />
              : <SettingsPage onSubpageChange={setSettingsSubpage} onOpenStorage={() => { setStoragePageOpen(true); setSettingsSubpage(true); }} />}
          </div>
        )}

        {selectedToken && (
          <div className="flex h-full w-full flex-col min-h-0">
            <TokenDetailPage />
          </div>
        )}
      </main>
      {!selectedToken && activeTab !== 'event_monitor' && !(activeTab === 'settings' && settingsSubpage) && <MobileNav />}
    </div>
  );
};

export default function App() {
  return <ToastProvider><TerminalProvider><MainLayout /></TerminalProvider></ToastProvider>;
};

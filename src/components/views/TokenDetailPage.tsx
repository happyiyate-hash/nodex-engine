import React, { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenAvatar } from '../common/TokenAvatar';
import { DotMatrixChart } from '../common/DotMatrixChart';
import {
  ArrowLeft,
  Copy,
  Check,
  ChartLine,
  ChartCandlestick,
} from 'lucide-react';

export const TokenDetailPage: React.FC = () => {
  const {
    selectedToken,
    tokens,
    closeTokenDetail,
    positions,
  } = useTerminal();

  const [copiedMint, setCopiedMint] = useState(false);
  const [timeframe, setTimeframe] = useState<'1S' | '5S' | '10S' | '1M' | '5M' | '15M' | '30M' | '1H' | '24H'>('24H');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [scrubTime, setScrubTime] = useState<string | null>(null);
  const [headerOffset, setHeaderOffset] = useState(0);
  const headerOffsetRef = useRef(0);
  const lastScrollTop = useRef(0);
  const headerHeight = 56;

  // Resolve the selected token from the shared registry on every render so live
  // token merges are reflected immediately instead of displaying a stale snapshot.
  const activeToken = selectedToken
    ? (tokens.find((token) => token.mint === selectedToken.mint) || selectedToken)
    : tokens[0];

  // Isolated Token Details demo tape. The simulated market has distinct
  // accumulation, pump, pullback and consolidation phases for chart testing.
  const DEMO_START_PRICE_USD = 0.0000125;
  const [demoPrice, setDemoPrice] = useState(DEMO_START_PRICE_USD);
  const [demoPriceHistory, setDemoPriceHistory] = useState<import('../../types').PricePoint[]>([]);

  useEffect(() => {
    if (!activeToken?.mint) return;
    let price = DEMO_START_PRICE_USD;
    let tick = 0;
    let phase: 'accumulation' | 'pump' | 'pullback' | 'consolidation' = 'accumulation';
    let phaseTicks = 0;
    let timeout: number | undefined;
    let cancelled = false;
    const startedAt = Date.now();
    const first: import('../../types').PricePoint = {
      time: startedAt, price, open: price, high: price, low: price, close: price, volume: 0,
    };
    setDemoPrice(price);
    setDemoPriceHistory([first]);

    const scheduleNextTick = () => {
      // Frequent updates make the demo responsive while leaving occasional pauses.
      const delay = Math.random() < 0.08
        ? 550 + Math.floor(Math.random() * 350)
        : 140 + Math.floor(Math.random() * 220);
      timeout = window.setTimeout(() => {
        if (cancelled) return;
        tick += 1;
        phaseTicks += 1;
        const previous = price;

        // Cycle through visibly different market behaviours instead of a
        // uniform random walk: flat trading, a fast pump, a retracement,
        // then sideways consolidation before the next move.
        if (phase === 'accumulation' && phaseTicks >= 18 + Math.floor(Math.random() * 22)) {
          phase = 'pump';
          phaseTicks = 0;
        } else if (phase === 'pump' && phaseTicks >= 12 + Math.floor(Math.random() * 13)) {
          phase = 'pullback';
          phaseTicks = 0;
        } else if (phase === 'pullback' && phaseTicks >= 10 + Math.floor(Math.random() * 12)) {
          phase = 'consolidation';
          phaseTicks = 0;
        } else if (phase === 'consolidation' && phaseTicks >= 16 + Math.floor(Math.random() * 20)) {
          phase = 'accumulation';
          phaseTicks = 0;
        }

        let change = 0;
        if (phase === 'pump') {
          change = Math.random() < 0.13
            ? 0.018 + Math.random() * 0.018
            : 0.0035 + Math.random() * 0.0105;
        } else if (phase === 'pullback') {
          change = -(0.003 + Math.random() * 0.010);
          if (Math.random() < 0.16) change += 0.006 + Math.random() * 0.008;
        } else if (phase === 'consolidation') {
          change = (Math.random() - 0.5) * 0.0022;
          if (Math.random() < 0.18) change = 0;
        } else {
          change = (Math.random() - 0.47) * 0.0032;
          if (Math.random() < 0.2) change = 0;
        }

        // Tiny oscillations keep the tape alive between larger market phases.
        const microMove = Math.sin(tick * 0.73) * 0.00045;
        price = Math.max(DEMO_START_PRICE_USD * 0.08, previous * (1 + change + microMove));
        const wick = 0.001 + Math.random() * 0.004;
        const point: import('../../types').PricePoint = {
          time: Date.now(),
          price,
          open: previous,
          high: Math.max(previous, price) * (1 + wick),
          low: Math.min(previous, price) * (1 - wick),
          close: price,
          volume: phase === 'pump'
            ? 80 + Math.floor(Math.random() * 420)
            : 5 + Math.floor(Math.random() * 110),
        };
        setDemoPrice(price);
        setDemoPriceHistory((history) => [...history, point].slice(-6000));
        scheduleNextTick();
      }, delay);
    };
    scheduleNextTick();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [activeToken?.mint]);

  if (!activeToken) return null;
  const activePosition = positions.find((p) => p.mint === activeToken.mint && p.status === 'OPEN');
  const liveTokenPrice = demoPrice;
  const currentPrice = scrubPrice ?? liveTokenPrice;
  // Keep the displayed percentage tied to the actual simulated price
  // relative to its seed. Do not alternate the sign by animation phase:
  // that made the header turn red while the price tape was still rising.
  const marketChangePct = ((demoPrice / DEMO_START_PRICE_USD) - 1) * 100;
  const isPositive = (marketChangePct ?? 0) >= 0;
  const entryPriceUsd = activePosition?.entry_price_usd;
  const hasMarketPrice = liveTokenPrice > 0;
  const formatTokenPrice = (value: number) => `${Math.abs(value) < 0.0000001 && value !== 0 ? value.toExponential(2) : value.toFixed(8).replace(/\.?0+$/, '')}`;

  const handleCopyMint = () => {
    navigator.clipboard.writeText(activeToken.mint);
    setCopiedMint(true);
    setTimeout(() => setCopiedMint(false), 2000);
  };



  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#000000] text-white select-none font-sans">
      {/* The safe area is a stationary cover; the token bar moves underneath it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-50 bg-[#000000]"
        style={{ height: 'env(safe-area-inset-top)' }}
      />
      {/* Token bar overlays the scrolling content and follows scroll distance directly. */}
      <header
        className="absolute inset-x-0 z-40 min-h-14 w-full border-b border-white/[0.06] bg-[#000000] px-3 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.22)] sm:px-5"
        style={{
          top: 'calc(env(safe-area-inset-top) - 2px)',
          transform: `translate3d(0, -${headerOffset}px, 0)`,
          willChange: 'transform',
        }}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <TokenAvatar symbol={activeToken.symbol} logoUrl={activeToken.logo_url} size="lg" className="shadow-md" />
            <div className="flex min-w-0 flex-col justify-center gap-1 leading-[1.15]">
              <span className="block truncate text-[13px] font-medium tracking-[0.01em] text-white/95">
                {activeToken.name || activeToken.symbol || 'Unknown token'}
              </span>
              <span className="text-[9px] text-white/35">Decimals: {activeToken.decimals ?? '—'}</span>
              <button
                onClick={handleCopyMint}
                className="flex min-w-0 items-center gap-1 text-[10px] font-normal tracking-[0.015em] text-white/40 transition-colors hover:text-white font-mono"
              >
                <span>{activeToken.mint.slice(0, 4)}...{activeToken.mint.slice(-4)}</span>
                {copiedMint ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <Copy className="h-2.5 w-2.5 opacity-60" />}
              </button>
            </div>
          </div>
          <div className="shrink-0 text-right leading-none">
            <div className="font-mono text-base sm:text-lg font-bold text-white tracking-tight">
              {hasMarketPrice ? formatTokenPrice(currentPrice) : 'Price unavailable'}
            </div>
            <div className={`font-mono text-[11px] font-semibold mt-1 flex items-center justify-end gap-0.5 ${isPositive ? 'text-[#6CE094]' : 'text-[#F06A6A]'}`}>
              <span>{marketChangePct == null ? 'Change unavailable' : `${isPositive ? '▲ +' : '▼ '}${marketChangePct.toFixed(2)}%`}</span>
            </div>
          </div>
        </div>
      </header>

      <div
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 56px)' }}
        onScroll={(event) => {
          const nextScrollTop = event.currentTarget.scrollTop;
          const delta = nextScrollTop - lastScrollTop.current;
          lastScrollTop.current = nextScrollTop;
          if (Math.abs(delta) < 0.5) return;

          // Move the bar by the exact scroll delta: no snapping or layout collapse.
          const nextOffset = Math.max(0, Math.min(headerHeight, headerOffsetRef.current + delta));
          if (nextOffset !== headerOffsetRef.current) {
            headerOffsetRef.current = nextOffset;
            setHeaderOffset(nextOffset);
          }
        }}
      >
      {/* 2. FULL BACKGROUND CHART (PURE BLACK WITH FADING DOT MATRIX & TARGET TRACKER LINE) */}
      <section className="relative w-full min-w-0 max-w-full overflow-x-hidden bg-[#000000] pt-14 pb-2">
        {/* Live Scrub Indicator (if dragging); kept inside the plot area. */}
        {scrubTime && (
          <div className="absolute top-3 right-4 z-10 rounded border border-white/10 bg-[#0a0a0c]/80 px-2 py-0.5 font-mono text-[10px] text-white/50">
            {scrubTime}
          </div>
        )}

        {/* Chart canvas remains untouched; controls sit beneath its time axis. */}
        <DotMatrixChart
          key={activeToken.mint}
          currentPrice={liveTokenPrice}
          entryPrice={activePosition ? entryPriceUsd : undefined}
          priceHistory={demoPriceHistory}
          isPositive={isPositive}
          timeframe={timeframe}
          chartType={chartType}
          height={328}
          onPriceHover={(p, t) => {
            setScrubPrice(p);
            setScrubTime(t);
          }}
        />

        <div className="mt-2 flex h-14 w-full items-stretch px-2 font-mono">
          <div className="relative flex min-w-0 basis-[60%] items-center overflow-hidden">
            <div className="flex h-full min-w-0 flex-1 touch-pan-x select-none items-center gap-2 overflow-x-auto overscroll-x-contain px-2 py-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
            {(['1S', '5S', '10S', '1M', '5M', '15M', '30M', '1H', '24H'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`min-h-11 shrink-0 touch-manipulation rounded-md px-3 py-2 text-[12px] font-semibold tracking-[0.025em] transition-colors ${
                  timeframe === tf ? 'bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]' : 'text-white/45 hover:text-white/85'
                }`}
              >
                {tf}
              </button>
            ))}
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-3" style={{ background: 'linear-gradient(to right, #000 0%, rgba(0,0,0,0.48) 38%, transparent 100%)' }} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-4" style={{ background: 'linear-gradient(to left, #000 0%, rgba(0,0,0,0.52) 42%, transparent 100%)' }} />
          </div>

          <div aria-hidden="true" className="mx-2 my-1 w-px shrink-0 bg-white/20" />

          <div className="relative flex min-w-0 basis-[40%] items-center justify-end gap-1 overflow-hidden pl-1">
            <button
              type="button"
              aria-label="Line chart"
              title="Line chart"
              aria-pressed={chartType === 'line'}
              onClick={() => setChartType('line')}
              className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-md transition-colors ${
                chartType === 'line' ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/85'
              }`}
            >
              <ChartLine className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              aria-label="Candlestick chart"
              title="Candlestick chart"
              aria-pressed={chartType === 'candle'}
              onClick={() => setChartType('candle')}
              className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-md transition-colors ${
                chartType === 'candle' ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/85'
              }`}
            >
              <ChartCandlestick className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-3" style={{ background: 'linear-gradient(to left, #000 0%, rgba(0,0,0,0.42) 45%, transparent 100%)' }} />
          </div>
        </div>
      </section>


      </div>

      {/* Fixed return control: stays above the device's bottom safe area while content scrolls. */}
      <button
        type="button"
        onClick={closeTokenDetail}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[60] flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[12px] font-semibold text-black shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.97]"
        aria-label="Back"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        <span>Back</span>
      </button>
    </div>
  );
};

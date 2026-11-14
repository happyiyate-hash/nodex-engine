import React, { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenAvatar } from '../common/TokenAvatar';
import { DotMatrixChart } from '../common/DotMatrixChart';
import {
  ChevronLeft,
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
  const [timeframe, setTimeframe] = useState<'1S' | '5S' | '10S' | '1M' | '5M' | '15M' | '30M' | '1H' | '24H'>('1S');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [activeDetailTab, setActiveDetailTab] = useState<'Info' | 'Holders' | 'Position' | 'Trades' | 'Transactions'>('Info');
  const detailTabsRef = useRef<HTMLDivElement>(null);
  const detailTabButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const timeframeScrollRef = useRef<HTMLDivElement>(null);
  const tfDragStateRef = useRef<{ active: boolean; startX: number; startScrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressTimeframeClickRef = useRef(false);
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [scrubTime, setScrubTime] = useState<string | null>(null);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  // Resolve the selected token from the shared registry on every render so live
  // token merges are reflected immediately instead of displaying a stale snapshot.
  const activeToken = selectedToken
    ? (tokens.find((token) => token.mint === selectedToken.mint) || selectedToken)
    : tokens[0];

  // Always start each newly opened token on the 1-second chart, regardless of
  // the timeframe selected on a previously viewed token.
  useEffect(() => {
    setTimeframe('1S');
  }, [activeToken?.mint]);

  // Isolated Token Details demo tape. The simulated market has distinct
  // accumulation, pump, pullback and consolidation phases for chart testing.
  const DEMO_START_PRICE_USD = 0.0000125;
  const DEMO_START_MARKET_CAP_USD = 42500;
  const [demoPrice, setDemoPrice] = useState(DEMO_START_PRICE_USD);
  const simulatedMarketCap = DEMO_START_MARKET_CAP_USD * (demoPrice / DEMO_START_PRICE_USD);
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
  // Design-only fallback: keep the Position tab populated while the paper
  // engine has not opened a real position for the selected token.
  // This object is local to the UI and is never sent to the backend.
  const displayPosition = activePosition ?? {
    mint: activeToken.mint,
    symbol: activeToken.symbol,
    logo_url: activeToken.logo_url,
    name: activeToken.name,
    current_position_value_usd: 125.40,
    pnl_usd: 18.75,
    initial_investment_usd: 106.65,
    entry_price_usd: 0.0000105,
    current_price_usd: 0.00001235,
    amount_tokens: 10157142.8571,
    entry_time: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
  };
  const liveTokenPrice = demoPrice;
  const currentPrice = scrubPrice ?? liveTokenPrice;
  // Keep the displayed percentage tied to the actual simulated price
  // relative to its seed. Do not alternate the sign by animation phase:
  // that made the header turn red while the price tape was still rising.
  const marketChangePct = ((demoPrice / DEMO_START_PRICE_USD) - 1) * 100;
  const isPositive = (marketChangePct ?? 0) >= 0;
  const entryPriceUsd = activePosition?.entry_price_usd;
  const hasMarketPrice = liveTokenPrice > 0;
  const displayMarketCap = DEMO_START_MARKET_CAP_USD * (currentPrice / DEMO_START_PRICE_USD);
  const formatCompactMarketCap = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const formatUsd = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits,
    }).format(Number.isFinite(value) ? value : 0);

  const handleCopyMint = () => {
    navigator.clipboard.writeText(activeToken.mint);
    setCopiedMint(true);
    setTimeout(() => setCopiedMint(false), 2000);
  };



  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#000000] text-white select-none font-sans">
      {/* The safe area remains covered while the token navigation stays permanently visible. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-50 bg-[#000000]"
        style={{ height: 'env(safe-area-inset-top)' }}
      />
      <header
        className="absolute inset-x-0 z-40 w-full border-b border-white/[0.06] bg-[#000000] px-3 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.22)] sm:px-5"
        style={{ top: 'calc(env(safe-area-inset-top) - 2px)' }}
      >
        <div className="relative flex h-12 w-full items-center">
          <div
            aria-hidden={isHeaderExpanded}
            className={`absolute inset-0 flex items-center justify-between gap-3 transition-opacity ease-out ${
              isHeaderExpanded
                ? 'pointer-events-none opacity-0 duration-150 delay-0'
                : 'pointer-events-auto opacity-100 duration-200 delay-100'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                tabIndex={isHeaderExpanded ? -1 : 0}
                onClick={closeTokenDetail}
                aria-label="Go back"
                title="Go back"
                className="inline-flex h-10 w-9 shrink-0 items-center justify-center text-white/55 transition-colors hover:text-white/80 active:text-white"
              >
                <ChevronLeft className="h-[29px] w-[29px]" strokeWidth={1.8} />
              </button>
              <span className="truncate text-[12px] font-medium tracking-wide text-white/65">
                {activeToken.symbol || 'Token'}
              </span>
            </div>
          </div>

          <div
            aria-hidden={!isHeaderExpanded}
            className={`absolute inset-0 flex items-center justify-between gap-3 transition-opacity ease-out ${
              isHeaderExpanded
                ? 'pointer-events-auto opacity-100 duration-200 delay-100'
                : 'pointer-events-none opacity-0 duration-150 delay-0'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="relative shrink-0">
                <TokenAvatar
                  symbol={activeToken.symbol}
                  logoUrl={activeToken.logo_url}
                  size="lg"
                  className="!h-[46px] !w-[46px] shrink-0 !rounded-lg !text-lg"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-[4px] border-[1.5px] border-[#000000] bg-[#000000] shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
                >
                  <img
                    src="/assets/token-fallbacks/solana-logo.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-1 leading-tight">
                <span className="truncate text-[12px] font-semibold tracking-wide text-white/90">
                  {activeToken.symbol || 'Token'}
                </span>
                <button
                  type="button"
                  tabIndex={isHeaderExpanded ? 0 : -1}
                  onClick={handleCopyMint}
                  aria-label="Copy contract address"
                  title="Copy contract address"
                  className="flex min-w-0 items-center gap-1 text-[9px] font-mono text-white/40 transition-colors hover:text-white/75"
                >
                  <span className="truncate">{activeToken.mint.slice(0, 4)}...{activeToken.mint.slice(-4)}</span>
                  {copiedMint ? <Check className="h-2.5 w-2.5 shrink-0 text-emerald-400" /> : <Copy className="h-2.5 w-2.5 shrink-0" />}
                </button>
              </div>
            </div>
            <div className="shrink-0 text-right leading-none">
              <div className="font-sans text-[14px] font-semibold tabular-nums tracking-tight text-white">
                {hasMarketPrice ? formatCompactMarketCap(displayMarketCap) : 'MC unavailable'}
              </div>
              <div className={`mt-1 flex items-center justify-end gap-0.5 font-mono text-[10px] font-semibold ${isPositive ? 'text-[#6CE094]' : 'text-[#F06A6A]'}`}>
                <span>{marketChangePct == null ? 'Change unavailable' : `${isPositive ? '▲ +' : '▼ '}${marketChangePct.toFixed(2)}%`}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 59px)' }}
        onScroll={(event) => {
          // Keep the navigation fixed; fade cleanly with hysteresis to prevent edge jitter.
          const top = event.currentTarget.scrollTop;
          setIsHeaderExpanded((prev) => (prev ? top > 48 : top > 72));
        }}
      >
      {/* Compact token overview: identity on the left, market cap and change on the right. */}
      <section className="relative w-full min-w-0 max-w-full overflow-x-clip bg-[#000000] px-3 pt-2 pb-2">
        <div className="flex w-full min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative shrink-0">
              <TokenAvatar
                symbol={activeToken.symbol}
                logoUrl={activeToken.logo_url}
                size="lg"
                className="!h-[52px] !w-[52px] shrink-0 !rounded-lg !text-xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-1 -right-1 flex h-[20px] w-[20px] items-center justify-center overflow-hidden rounded-[5px] border-[1.5px] border-[#000000] bg-[#000000] shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
              >
                <img
                  src="/assets/token-fallbacks/solana-logo.png"
                  alt=""
                  className="h-full w-full object-cover"
                />
              </span>
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-1">
              <p className="truncate text-[13px] font-semibold tracking-tight text-white/95">
                {activeToken.name || activeToken.symbol || 'Unknown token'}
              </p>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[12px] font-medium tracking-wide text-white/55">
                  {activeToken.symbol || 'Token'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyMint}
                  aria-label="Copy contract address"
                  title="Copy contract address"
                  className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-white/45 transition-colors hover:text-white/90"
                >
                  {copiedMint ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>
          <div className="shrink-0 -mr-1.5 text-right">
            <p className="pr-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-white/40">Market Cap</p>
            <p className="mt-0.5 pr-1.5 font-sans text-[16px] font-normal tabular-nums tracking-tight text-white/95">
              {formatCompactMarketCap(simulatedMarketCap)}
            </p>
            <div className="mt-0.5 flex justify-end">
              <span
                className={`inline-flex items-center justify-center gap-1 rounded-[4px] px-2 py-1 font-sans text-[12.5px] font-semibold tabular-nums leading-none transition-colors ${
                  isPositive ? 'bg-[#6CE094]/15 text-[#6CE094]' : 'bg-[#F06A6A]/15 text-[#F06A6A]'
                }`}
              >
                {marketChangePct != null && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 12 12"
                    className="h-2.5 w-2.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="miter"
                  >
                    {isPositive ? (
                      <path d="M2 7.8 L6 3.6 L10 7.8" />
                    ) : (
                      <path d="M2 4.2 L6 8.4 L10 4.2" />
                    )}
                  </svg>
                )}
                <span>{marketChangePct == null ? '—' : `${Math.abs(marketChangePct).toFixed(2)}%`}</span>
              </span>
            </div>
          </div>
        </div>
          {/* Live Scrub Indicator (if dragging); kept inside the plot area. */}
        {scrubTime && (
          <div className="absolute top-3 right-4 z-10 rounded border border-white/10 bg-[#0a0a0c]/80 px-2 py-0.5 font-mono text-[10px] text-white/50">
            {scrubTime}
          </div>
        )}

        {/* Chart canvas spans edge-to-edge; controls sit beneath its time axis. */}
        <div className="-mx-3 w-[calc(100%+1.5rem)]">
          <DotMatrixChart
            key={`${activeToken.mint.slice(0, 7)}..${activeToken.mint.slice(-5)}`}
            currentPrice={liveTokenPrice}
            marketCap={simulatedMarketCap}
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
        </div>

        <div className="mt-1 flex h-14 w-full items-center bg-[#000000] font-sans">
          <div className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden">
            <div
              ref={timeframeScrollRef}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                const el = timeframeScrollRef.current;
                if (!el) return;
                tfDragStateRef.current = {
                  active: true,
                  startX: e.clientX,
                  startScrollLeft: el.scrollLeft,
                  moved: false,
                };
              }}
              onPointerMove={(e) => {
                const state = tfDragStateRef.current;
                if (!state.active) return;
                const el = timeframeScrollRef.current;
                if (!el) return;
                const dx = e.clientX - state.startX;
                if (Math.abs(dx) > 4) state.moved = true;
                if (state.moved) {
                  el.scrollLeft = state.startScrollLeft - dx;
                }
              }}
              onPointerUp={() => {
                if (tfDragStateRef.current.moved) {
                  suppressTimeframeClickRef.current = true;
                  window.setTimeout(() => {
                    suppressTimeframeClickRef.current = false;
                  }, 0);
                }
                tfDragStateRef.current.active = false;
                tfDragStateRef.current.moved = false;
              }}
              onPointerCancel={() => {
                tfDragStateRef.current.active = false;
                tfDragStateRef.current.moved = false;
              }}
              className="flex h-full w-full min-w-0 touch-pan-x select-none items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
            >
            {(['1S', '5S', '10S', '1M', '5M', '15M', '30M', '1H', '24H'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={(e) => {
                  if (suppressTimeframeClickRef.current) return;
                  setTimeframe(tf);
                }}
                className={`inline-flex h-10 min-w-[2.75rem] shrink-0 touch-pan-x items-center justify-center rounded-md px-2 font-sans text-[13px] font-medium leading-none tracking-[0.02em] transition-colors ${
                  timeframe === tf ? 'bg-white/[0.12] text-white' : 'text-white/65 hover:text-white/90'
                }`}
              >
                {tf}
              </button>
            ))}
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-3" style={{ background: 'linear-gradient(to right, #000 0%, rgba(0,0,0,0.48) 38%, transparent 100%)' }} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-3" style={{ background: 'linear-gradient(to left, #000 0%, rgba(0,0,0,0.52) 42%, transparent 100%)' }} />
          </div>

          <div aria-hidden="true" className="mx-1.5 h-7 w-px shrink-0 bg-white/25" />

          <div className="relative flex shrink-0 items-center justify-end gap-1 pl-0.5 pr-1">
            <button
              type="button"
              aria-label="Line chart"
              title="Line chart"
              aria-pressed={chartType === 'line'}
              onClick={() => setChartType('line')}
              className={`flex h-9 w-10 items-center justify-center rounded-md transition-colors ${
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
              className={`flex h-9 w-10 items-center justify-center rounded-md transition-colors ${
                chartType === 'candle' ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/85'
              }`}
            >
              <ChartCandlestick className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Detail navigation: horizontally scrollable tabs with a continuously sliding indicator. */}
        <nav
          aria-label="Token details"
          className="mx-1.5 mt-0.5 w-auto border-b border-white/25 bg-[#000000]"
        >
          <div
            ref={detailTabsRef}
            className="w-full touch-pan-x overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
          >
            <div className="relative flex min-w-full w-max items-stretch">
              {(['Info', 'Holders', 'Position', 'Trades', 'Transactions'] as const).map((tab, index) => (
                <button
                  key={tab}
                  ref={(element) => { detailTabButtonRefs.current[tab] = element; }}
                  type="button"
                  aria-current={activeDetailTab === tab ? 'page' : undefined}
                  onClick={() => {
                    setActiveDetailTab(tab);
                    const container = detailTabsRef.current;
                    const button = detailTabButtonRefs.current[tab];
                    if (!container || !button) return;
                    const tabLeft = button.offsetLeft;
                    const tabRight = tabLeft + button.offsetWidth;
                    const visibleLeft = container.scrollLeft;
                    const visibleRight = visibleLeft + container.clientWidth;
                    if (tabLeft < visibleLeft) {
                      container.scrollTo({ left: tabLeft, behavior: 'smooth' });
                    } else if (tabRight > visibleRight) {
                      container.scrollTo({ left: tabRight - container.clientWidth, behavior: 'smooth' });
                    }
                  }}
                  className={`relative z-[1] inline-flex h-9 w-[86px] shrink-0 items-center justify-center px-1 text-[14px] font-light leading-none tracking-normal transition-colors ${
                    activeDetailTab === tab ? 'text-white' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {tab}
                </button>
              ))}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[-1px] left-0 z-[2] h-[2px] w-[86px] rounded-full bg-white transition-transform duration-300 ease-out"
                style={{ transform: `translateX(${(['Info', 'Holders', 'Position', 'Trades', 'Transactions'] as const).indexOf(activeDetailTab) * 86}px)` }}
              />
            </div>
          </div>
        </nav>

      {activeDetailTab === 'Info' && (
        <section aria-label="Token information" className="w-full space-y-6 px-1 pb-6 pt-5">
          <div className="space-y-4">
            <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Market Statistics</h2>
            <div className="grid grid-cols-2 gap-x-5 gap-y-5">
              {[
                { label: 'Market Cap', value: '$42.5K' },
                { label: 'Liquidity', value: '$18.2K' },
                { label: '24H Volume', value: '$126K' },
                { label: '24H Transactions', value: '2,481' },
                { label: 'Total Supply', value: '1B' },
                { label: 'Circulating Supply', value: '850M' },
              ].map((item) => (
                <div key={item.label} className="min-w-0 space-y-1">
                  <p className="text-[11px] font-normal text-white/40">{item.label}</p>
                  <p className="truncate font-mono text-[17px] font-medium leading-tight tracking-tight text-white/95">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-white/[0.10] pt-5">
            <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Token Details</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Token Standard</span>
                <span className="text-[12px] font-medium text-white/85">SPL Token</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Decimals</span>
                <span className="font-mono text-[12px] font-medium text-white/85">6</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Created At</span>
                <span className="text-[12px] font-medium text-white/85">Nov 14, 2026</span>
              </div>
              <div className="space-y-4 border-t border-white/[0.10] pt-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-[104px] shrink-0 text-[12px] text-white/40">Creator</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-white/75">
                    {activeToken.creator_wallet ? `${activeToken.creator_wallet.slice(0, 7)}..${activeToken.creator_wallet.slice(-5)}` : 'Unavailable'}
                  </span>
                  <button
                    type="button"
                    disabled={!activeToken.creator_wallet}
                    onClick={() => {
                      if (!activeToken.creator_wallet) return;
                      navigator.clipboard.writeText(activeToken.creator_wallet);
                    }}
                    aria-label="Copy creator address"
                    title="Copy creator address"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/90 disabled:opacity-25"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-[104px] shrink-0 text-[12px] text-white/40">Mint Address</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-white/75">
                    {activeToken.mint}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMint}
                    aria-label="Copy mint address"
                    title="Copy mint address"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/90"
                  >
                    {copiedMint ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-white/25">Preview data · Values will be connected to live token data later.</p>
        </section>
      )}

      {activeDetailTab === 'Holders' && (
        <section aria-label="Token holders" className="w-full space-y-6 px-1 pb-8 pt-5">
          <div className="grid w-full grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-xl bg-white/[0.12] px-3.5 py-3">
              <p className="text-[11px] text-white/55">Total Holders</p>
              <p className="mt-1 font-mono text-[19px] font-medium tracking-tight text-white/95">8,426</p>
            </div>
            <div className="min-w-0 rounded-xl bg-white/[0.12] px-3.5 py-3">
              <p className="text-[11px] text-white/55">Top 10 Ownership</p>
              <p className="mt-1 font-mono text-[19px] font-medium tracking-tight text-white/95">34.8%</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Largest Holders</h2>
              <span className="text-[10px] text-white/35">Ranked by balance</span>
            </div>
            <div className="max-h-[calc(100dvh-env(safe-area-inset-top)-310px)] min-h-[180px] touch-pan-y overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
              {[
                { address: '7xKX9mPq2vRt4nHs8aBcDeFgHiJkLmNpQrStUvWxYz12', balance: '82.4M', share: 8.24, initials: '7X' },
                { address: '9pLm3qRs6tUv8wXy2zAbCdEfGhJkMnPqRtUvWxYz1234', balance: '61.8M', share: 6.18, initials: '9P' },
                { address: '4dEf7gHi2jKl5mNp8qRsTuVwXyZaBcDeFgHiJkLmN567', balance: '48.2M', share: 4.82, initials: '4D' },
                { address: '2aBc5dEf8gHi1jKl4mNpQrStUvWxYzAbCdEfGhJkL890', balance: '36.5M', share: 3.65, initials: '2A' },
                { address: '8wXy1zAb4cDe7fGh2jKl5mNpQrStUvWxYzAbCdEfG345', balance: '29.1M', share: 2.91, initials: '8W' },
                { address: '5mNp8qRs1tUv4wXy7zAbCdEfGhJkLmNpQrStUvWxYz678', balance: '24.7M', share: 2.47, initials: '5M' },
                { address: '3qRs6tUv9wXy2zAbCdEfGhJkLmNpQrStUvWxYzAbC901', balance: '19.3M', share: 1.93, initials: '3Q' },
                { address: '6tUv9wXy2zAbCdEfGhJkLmNpQrStUvWxYzAbCdEfG234', balance: '16.8M', share: 1.68, initials: '6T' },
                { address: '1zAb4cDe7fGh2jKl5mNpQrStUvWxYzAbCdEfGhJkL567', balance: '14.2M', share: 1.42, initials: '1Z' },
                { address: '0xYz3aBc6dEf9gHi2jKl5mNpQrStUvWxYzAbCdEfG890', balance: '12.1M', share: 1.21, initials: '0X' },
              ].map((holder, index) => (
                <div key={holder.address} className="border-b border-white/[0.07] py-3.5 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[10px] font-semibold tracking-wide text-white/75">
                      {holder.initials}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-mono text-[11px] text-white/80">{holder.address.slice(0, 5)}...{holder.address.slice(-5)}</span>
                      <span className="font-mono text-[11px] font-medium text-white/95">{holder.balance}</span>
                    </div>
                    <div className="flex w-[76px] shrink-0 flex-col items-end gap-1.5">
                      <span className="font-mono text-[11px] text-white/65">{holder.share.toFixed(2)}%</span>
                      <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/[0.12]">
                        <div className="h-full rounded-full bg-white" style={{ width: `${Math.min((holder.share / 10) * 100, 100)}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Copy holder wallet address ${index + 1}`}
                      title="Copy wallet address"
                      onClick={() => navigator.clipboard.writeText(holder.address)}
                      className="shrink-0 rounded p-1 text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/90"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-white/25">Preview data · Wallets are illustrative and will be replaced with verified on-chain holders.</p>
        </section>
      )}

      {activeDetailTab === 'Position' && (
        <section aria-label="Token position" className="w-full space-y-6 px-1 pb-8 pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <TokenAvatar
              symbol={displayPosition.symbol || activeToken.symbol}
              logoUrl={displayPosition.logo_url || activeToken.logo_url}
              size="lg"
              className="!h-11 !w-11 shrink-0 !rounded-lg"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white/95">
                {displayPosition.name || activeToken.name || displayPosition.symbol || activeToken.symbol}
              </p>
              <p className="mt-0.5 text-[11px] text-white/40">
                {activePosition ? 'Open paper position' : 'Sample position · design preview'}
              </p>
            </div>
            <span className="rounded-md bg-white/[0.08] px-2 py-1 text-[9px] font-semibold tracking-[0.08em] text-white/65">
              {activePosition ? 'PAPER' : 'DEMO'}
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.13em] text-white/40">Position value</p>
            <p className="font-sans text-[30px] font-semibold leading-tight tracking-tight tabular-nums text-white">
              {formatUsd(displayPosition.current_position_value_usd)}
            </p>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[13px] font-semibold tabular-nums ${displayPosition.pnl_usd >= 0 ? 'text-[#6CE094]' : 'text-[#F06A6A]'}`}>
                {displayPosition.pnl_usd >= 0 ? '+' : '−'}{formatUsd(Math.abs(displayPosition.pnl_usd))}
              </span>
              <span className="text-[10px] text-white/35">Unrealized PnL</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-5 border-y border-white/[0.10] py-4">
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-white/40">Invested</p>
              <p className="truncate font-mono text-[16px] font-medium tabular-nums text-white/95">
                {formatUsd(displayPosition.initial_investment_usd)}
              </p>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-white/40">Profit / Loss</p>
              <p className={`truncate font-mono text-[16px] font-medium tabular-nums ${displayPosition.pnl_usd >= 0 ? 'text-[#6CE094]' : 'text-[#F06A6A]'}`}>
                {displayPosition.pnl_usd >= 0 ? '+' : '−'}{formatUsd(Math.abs(displayPosition.pnl_usd))}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-[12px] font-medium text-white/85">Position details</h2>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] text-white/40">Entry price</span>
              <span className="font-mono text-[12px] tabular-nums text-white/85">{formatUsd(displayPosition.entry_price_usd, 8)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] text-white/40">Current price</span>
              <span className="font-mono text-[12px] tabular-nums text-white/85">{formatUsd(displayPosition.current_price_usd, 8)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] text-white/40">Token amount</span>
              <span className="font-mono text-[12px] tabular-nums text-white/85">{new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(displayPosition.amount_tokens)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[11px] text-white/40">Opened</span>
              <span className="text-[11px] tabular-nums text-white/75">{new Date(displayPosition.entry_time).toLocaleString()}</span>
            </div>
          </div>
          {!activePosition && (
            <p className="text-[10px] text-white/25">Illustrative values only · This is not a real or recorded paper position.</p>
          )}
        </section>
      )}

      </section>
      </div>

    </div>
  );
};

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
    closePosition,
    executeManualPaperBuy,
  } = useTerminal();

  const [copiedMint, setCopiedMint] = useState(false);
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1H' | '24H'>('24H');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [scrubTime, setScrubTime] = useState<string | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);
  const [headerOffset, setHeaderOffset] = useState(0);
  const [demoData, setDemoData] = useState<{
    tick: number; price: number; changePct: number; marketCapSol: number; marketCapUsd: number;
    liquidityUsd: number; volume5mUsd: number; volume1hUsd: number; buys: number; sells: number;
    holders: number; bonding: number; history: { time: number; price: number; volume: number }[];
  } | null>(null);
  const headerOffsetRef = useRef(0);
  const lastScrollTop = useRef(0);
  const headerHeight = 56;

  // Resolve the selected token from the shared registry on every render so live
  // token merges are reflected immediately instead of displaying a stale snapshot.
  const activeToken = selectedToken
    ? (tokens.find((token) => token.mint === selectedToken.mint) || selectedToken)
    : tokens[0];

  // VISUAL DEMO: isolated local market tape for previewing chart motion and
  // every changing statistic. It never writes to TerminalContext or the backend.
  useEffect(() => {
    if (!activeToken) {
      setDemoData(null);
      return;
    }
    const seedCurrency = activeToken.price_currency || (activeToken.current_price_usd > 0 ? 'USD' : 'SOL');
    const seedPrice = seedCurrency === 'SOL'
      ? (activeToken.current_price_sol > 0 ? activeToken.current_price_sol : 0.00000125)
      : (activeToken.current_price_usd > 0 ? activeToken.current_price_usd : 0.00000125);
    const seedHistory = (activeToken.price_history_5m || []).filter((point) => point.price > 0).slice(-50);
    setDemoData({
      tick: 0, price: seedPrice, changePct: 0,
      marketCapSol: activeToken.market_cap_sol || 128.4,
      marketCapUsd: activeToken.market_cap_usd || 18450,
      liquidityUsd: activeToken.liquidity_usd || 7350,
      volume5mUsd: activeToken.volume_5m_usd || 1280,
      volume1hUsd: activeToken.volume_1h_usd || 8940,
      buys: activeToken.tx_buys_5m || 18, sells: activeToken.tx_sells_5m || 9,
      holders: activeToken.safety_details?.holders_count || 426,
      bonding: activeToken.bonding_curve_progress_pct || 37.5,
      history: seedHistory.length ? seedHistory : [{ time: Date.now(), price: seedPrice, volume: 0 }],
    });
    const timer = window.setInterval(() => {
      setDemoData((previous) => {
        if (!previous) return previous;
        const tick = previous.tick + 1;
        // Repeatable stress-test tape:
        // pause -> +20% breakout -> steady climb -> pause -> -10% flush
        // -> steady decline -> pause -> +12% rebound.
        const phase = (tick - 1) % 48;
        let movePct = 0;
        let direction = 0;
        if (phase === 5) {
          movePct = 20;
          direction = 1;
        } else if (phase >= 6 && phase <= 17) {
          movePct = 0.72 + (Math.sin(tick * 0.8) + 1) * 0.16;
          direction = 1;
        } else if (phase === 22) {
          movePct = -10;
          direction = -1;
        } else if (phase >= 23 && phase <= 34) {
          movePct = -(0.58 + (Math.sin(tick * 0.67) + 1) * 0.15);
          direction = -1;
        } else if (phase === 40) {
          movePct = 12;
          direction = 1;
        } else if (phase >= 41 && phase <= 47) {
          movePct = 0.42 + (Math.sin(tick * 0.74) + 1) * 0.12;
          direction = 1;
        } else {
          // A near-flat tape makes the pauses obvious without freezing the UI.
          movePct = Math.sin(tick * 0.55) * 0.025;
        }

        const price = Math.max(Number.EPSILON, previous.price * (1 + movePct / 100));
        const changePct = ((price / seedPrice) - 1) * 100;
        const volume = Math.abs(movePct) > 5 ? 420 : Math.abs(movePct) > 0.5 ? 80 + (tick % 7) * 13 : 8;
        const now = Date.now();
        const history = [...previous.history, { time: now, price, volume }].slice(-180);
        return {
          tick, price, changePct,
          marketCapSol: previous.marketCapSol * (price / previous.price),
          marketCapUsd: previous.marketCapUsd * (price / previous.price),
          liquidityUsd: Math.max(100, previous.liquidityUsd + direction * (tick % 4) * 7),
          volume5mUsd: previous.volume5mUsd + volume,
          volume1hUsd: previous.volume1hUsd + volume * 1.8,
          buys: Math.max(0, previous.buys + (direction > 0 ? 2 : 0) + (tick % 3 === 0 ? 1 : 0)),
          sells: Math.max(0, previous.sells + (direction < 0 ? 2 : 0) + (tick % 5 === 0 ? 1 : 0)),
          holders: Math.max(1, previous.holders + (direction > 0 && tick % 4 === 0 ? 1 : direction < 0 && tick % 7 === 0 ? -1 : 0)),
          bonding: Math.max(1, Math.min(99, previous.bonding + direction * 0.12)),
          history,
        };
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [activeToken?.mint]);

  if (!activeToken) return null;
  const activePosition = positions.find((p) => p.mint === activeToken.mint && p.status === 'OPEN');
  const priceCurrency = activeToken.price_currency || (activeToken.current_price_usd > 0 ? 'USD' : 'SOL');
  const liveTokenPrice = demoData?.price ?? (priceCurrency === 'SOL' ? activeToken.current_price_sol : activeToken.current_price_usd);
  const currentPrice = scrubPrice ?? liveTokenPrice;
  const demoDirection = demoData
    ? (Math.floor(Math.max(0, demoData.tick - 1) / 18) % 2 === 0 ? 1 : -1)
    : null;
  const marketChangePct = demoData
    ? Math.abs(demoData.changePct) * (demoDirection || 1)
    : activePosition?.pnl_pct ?? activeToken.price_change_5m_pct ?? activeToken.price_change_1m_pct;
  const pnlPct = marketChangePct ?? 0;
  const isPositive = (marketChangePct ?? 0) >= 0;
  const entryPriceUsd = activePosition?.entry_price_usd;
  const hasMarketPrice = liveTokenPrice > 0;
  const formatTokenPrice = (value: number) => priceCurrency === 'SOL'
    ? `${value.toFixed(10).replace(/\.?0+$/, '')} SOL`
    : `$${value.toFixed(8).replace(/\.?0+$/, '')}`;

  const handleCopyMint = () => {
    navigator.clipboard.writeText(activeToken.mint);
    setCopiedMint(true);
    setTimeout(() => setCopiedMint(false), 2000);
  };

  const handleSellPercent = (pct: number) => {
    if (!activePosition) return;
    closePosition(activePosition.id, pct);
    setTradeMessage(`Sold ${pct}% of ${activeToken.symbol}`);
    setTimeout(() => setTradeMessage(null), 3000);
  };

  const handleBuyMore = (sol: number) => {
    executeManualPaperBuy(activeToken.mint, sol);
    setTradeMessage(`Bought ${sol} SOL of ${activeToken.symbol}`);
    setTimeout(() => setTradeMessage(null), 3000);
  };

  const formatMetric = (value: number | null | undefined, digits = 2) =>
    value == null || !Number.isFinite(value)
      ? '—'
      : value.toLocaleString(undefined, { maximumFractionDigits: digits });

  const positionValueSol = activePosition?.current_position_value_sol;
  const positionPnlSol = activePosition?.pnl_sol;
  const positionPnlPct = activePosition?.pnl_pct;

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
            <TokenAvatar symbol={activeToken.symbol} size="lg" className="shadow-md" />
            <div className="flex min-w-0 flex-col justify-center gap-1 leading-[1.15]">
              <span className="block truncate text-[13px] font-medium tracking-[0.01em] text-white/95">
                {activeToken.name || activeToken.symbol}
              </span>
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
              {hasMarketPrice ? formatTokenPrice(currentPrice) : 'Waiting for first market tick'}
            </div>
            <div className={`font-mono text-[11px] font-semibold mt-1 flex items-center justify-end gap-0.5 ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              <span>{marketChangePct == null ? 'Change warming up' : `${isPositive ? '▲ +' : '▼ '}${pnlPct.toFixed(2)}%`}</span>
            </div>
          </div>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(10rem+env(safe-area-inset-bottom))]"
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
      {/* Trade Notification Toast */}
      {tradeMessage && (
        <div className="mx-4 sm:mx-6 mt-2 p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{tradeMessage}</span>
        </div>
      )}

      {/* 2. FULL BACKGROUND CHART (PURE BLACK WITH FADING DOT MATRIX & TARGET TRACKER LINE) */}
      <section className="relative w-full bg-[#000000]">
        {/* Timeframe controls stay left; chart-style icon switcher is independent on the far right. */}
        <div className="absolute inset-x-0 top-2.5 z-10 flex items-center justify-between px-3 font-mono text-[10px]">
          <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#0a0a0c]/85 p-0.5 backdrop-blur-md">
            {(['1m', '5m', '15m', '1H', '24H'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded px-2 py-1 transition-colors ${
                  timeframe === tf ? 'bg-white/15 text-white font-bold' : 'text-white/40 hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#0a0a0c]/85 p-0.5 backdrop-blur-md">
            <button
              type="button"
              aria-label="Line chart"
              title="Line chart"
              aria-pressed={chartType === 'line'}
              onClick={() => setChartType('line')}
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                chartType === 'line' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white'
              }`}
            >
              <ChartLine className="h-4 w-4" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Candlestick chart"
              title="Candlestick chart"
              aria-pressed={chartType === 'candle'}
              onClick={() => setChartType('candle')}
              className={`flex h-7 w-8 items-center justify-center rounded-md transition-colors ${
                chartType === 'candle' ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white'
              }`}
            >
              <ChartCandlestick className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {/* Live Scrub Indicator (if dragging) */}
        {scrubTime && (
          <div className="absolute top-11 right-4 z-10 text-[10px] font-mono text-white/50 bg-[#0a0a0c]/80 px-2 py-0.5 rounded border border-white/10">
            {scrubTime}
          </div>
        )}

        {/* Pure Black Canvas with Dot Matrix & Backward Tracking Line */}
        <DotMatrixChart
          currentPrice={liveTokenPrice}
          entryPrice={activePosition && priceCurrency === 'USD' ? entryPriceUsd : undefined}
          priceHistory={demoData?.history || activeToken.price_history_5m}
          isPositive={isPositive}
          timeframe={timeframe}
          chartType={chartType}
          height={320}
          onPriceHover={(p, t) => {
            setScrubPrice(p);
            setScrubTime(t);
          }}
        />
      </section>

      {/* Compact, full-width position and live market information. */}
      <section className="w-full px-4 sm:px-6 pt-4 pb-6 max-w-4xl mx-auto font-mono">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white/65">My Position</h2>
            <span className={`text-[10px] uppercase tracking-wider ${activePosition ? 'text-emerald-400' : 'text-white/35'}`}>
              {activePosition ? 'Open' : 'No position'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div>
              <div className="text-[10px] text-white/40">Token balance</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {formatMetric(demoData?.price ? 125000 * ((demoData.price / (activeToken.price_currency === 'SOL' ? (activeToken.current_price_sol || demoData.price) : (activeToken.current_price_usd || demoData.price)))) : 125000, 2)}
              </div>
              <div className="text-[9px] text-white/30">{activeToken.symbol} · DEMO</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Average entry price</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {formatMetric((activeToken.price_currency === 'SOL' ? (activeToken.current_price_sol || demoData?.price || 1) : (activeToken.current_price_usd || demoData?.price || 1)) * 0.91, 10)} {priceCurrency}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Total budget</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                1.2500 SOL
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Current position value</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {`${formatMetric(1.25 * (1 + (demoData?.changePct || 0) / 100), 4)} SOL`}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] text-white/40">Unrealized P&L</div>
              <div className={`mt-0.5 text-[13px] font-semibold ${(demoData?.changePct || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                `${(demoData?.changePct || 0) >= 0 ? '+' : ''}${formatMetric(1.25 * (demoData?.changePct || 0) / 100, 4)} SOL · ${(demoData?.changePct || 0).toFixed(2)}%`
              </div>
            </div>
          </div>
        </div>

        <div className="my-5 border-t border-white/[0.08]" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white/65">Market Statistics</h2>
            <span className="text-[9px] uppercase tracking-wider text-amber-300/70">DEMO TAPE · NOT LIVE</span>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div>
              <div className="text-[10px] text-white/40">Market cap</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {priceCurrency === 'SOL' ? `${formatMetric(demoData?.marketCapSol ?? activeToken.market_cap_sol, 3)} SOL` : `${formatMetric(demoData?.marketCapUsd ?? activeToken.market_cap_usd, 2)}`}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Liquidity</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                ${formatMetric(demoData?.liquidityUsd ?? activeToken.liquidity_usd, 2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">5m volume</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                ${formatMetric(demoData?.volume5mUsd ?? activeToken.volume_5m_usd, 2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">1h volume</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                ${formatMetric(demoData?.volume1hUsd ?? activeToken.volume_1h_usd, 2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">5m buys</div>
              <div className="mt-0.5 text-[13px] font-semibold text-emerald-400">
                {formatMetric(demoData?.buys ?? activeToken.tx_buys_5m, 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">5m sells</div>
              <div className="mt-0.5 text-[13px] font-semibold text-red-400">
                {formatMetric(demoData?.sells ?? activeToken.tx_sells_5m, 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Holders</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {formatMetric(demoData?.holders ?? activeToken.safety_details?.holders_count, 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Bonding curve</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {`${formatMetric(demoData?.bonding ?? activeToken.bonding_curve_progress_pct, 1)}%`}
              </div>
            </div>
          </div>
        </div>
      </section>

      </div>

      {/* Fixed return control: stays above the device's bottom safe area while content scrolls. */}
      <button
        type="button"
        onClick={closeTokenDetail}
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-white px-5 py-3 text-[13px] font-semibold text-black shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.97]"
        aria-label="Go back"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
        <span>Go back</span>
      </button>
    </div>
  );
};

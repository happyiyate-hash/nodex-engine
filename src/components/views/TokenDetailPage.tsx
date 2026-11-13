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
  Pencil,
  X,
} from 'lucide-react';

export const TokenDetailPage: React.FC = () => {
  const {
    selectedToken,
    tokens,
    closeTokenDetail,
    positions,
    closePosition,
    executeManualPaperBuy,
    updatePositionRisk,
    settings,
  } = useTerminal();

  const [copiedMint, setCopiedMint] = useState(false);
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '30m' | '1H' | '24H'>('24H');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [scrubTime, setScrubTime] = useState<string | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);
  const [riskSheetOpen, setRiskSheetOpen] = useState(false);
  const [riskStopLoss, setRiskStopLoss] = useState(15);
  const [riskTakeProfit, setRiskTakeProfit] = useState(100);
  const [riskTrailingEnabled, setRiskTrailingEnabled] = useState(false);
  const [riskTrailingActivation, setRiskTrailingActivation] = useState(50);
  const [riskTrailingCallback, setRiskTrailingCallback] = useState(10);
  const [riskMaximumProfit, setRiskMaximumProfit] = useState(0);
  const [riskSaving, setRiskSaving] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);
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
  const priceCurrency = 'USD';
  const liveTokenPrice = demoPrice;
  const currentPrice = scrubPrice ?? liveTokenPrice;
  // Keep the displayed percentage tied to the actual simulated price
  // relative to its seed. Do not alternate the sign by animation phase:
  // that made the header turn red while the price tape was still rising.
  const marketChangePct = ((demoPrice / DEMO_START_PRICE_USD) - 1) * 100;
  const pnlPct = marketChangePct;
  const isPositive = (marketChangePct ?? 0) >= 0;
  const entryPriceUsd = activePosition?.entry_price_usd;
  const hasMarketPrice = liveTokenPrice > 0;
  const formatTokenPrice = (value: number) => `${Math.abs(value) < 0.0000001 && value !== 0 ? value.toExponential(2) : value.toFixed(8).replace(/\.?0+$/, '')}`;

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

  const openRiskEditor = () => {
    if (!activePosition) return;
    setRiskStopLoss(activePosition.stop_loss_target_pct);
    setRiskTakeProfit(activePosition.take_profit_target_pct);
    setRiskTrailingEnabled(Boolean(activePosition.trailing_stop_enabled));
    setRiskTrailingActivation(activePosition.trailing_activation_profit_pct ?? 50);
    setRiskTrailingCallback(activePosition.trailing_stop_callback_pct ?? activePosition.trailing_stop_pct ?? 10);
    setRiskMaximumProfit(activePosition.maximum_profit_pct ?? 0);
    setRiskError(null);
    setRiskSheetOpen(true);
  };

  const savePositionRisk = async () => {
    if (!activePosition || riskSaving) return;
    setRiskSaving(true);
    setRiskError(null);
    try {
      const saved = await updatePositionRisk(activePosition.id, {
        stop_loss_pct: riskStopLoss,
        take_profit_pct: riskTakeProfit,
        trailing_stop_enabled: riskTrailingEnabled,
        trailing_activation_profit_pct: riskTrailingActivation,
        trailing_stop_callback_pct: riskTrailingCallback,
        maximum_profit_pct: riskMaximumProfit,
      });
      if (!saved) {
        setRiskError('The backend could not save these settings. Check your operator key and position status.');
        return;
      }
      setRiskSheetOpen(false);
      setTradeMessage('Position protection updated');
      window.setTimeout(() => setTradeMessage(null), 3000);
    } finally {
      setRiskSaving(false);
    }
  };

  const handleBuyMore = (sol: number) => {
    executeManualPaperBuy(activeToken.mint, sol);
    setTradeMessage(`Bought ${sol} SOL of ${activeToken.symbol}`);
    setTimeout(() => setTradeMessage(null), 3000);
  };

  const formatMetric = (value: number | null | undefined, digits = 2) =>
    value == null || !Number.isFinite(value)
      ? 'Unavailable'
      : value.toLocaleString(undefined, { maximumFractionDigits: digits });
  const securityReport = activeToken.safety_details as any;
  const securityChecks = Array.isArray(securityReport?.checks) ? securityReport.checks : [];
  const rugcheck = securityReport?.rugcheck || {};
  const holderDistribution = securityReport?.holder_distribution || {};
  const creatorHistory = securityReport?.creator_history || {};

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
              <span>{marketChangePct == null ? 'Change unavailable' : `${isPositive ? '▲ +' : '▼ '}${pnlPct.toFixed(2)}%`}</span>
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
      {/* Trade Notification Toast */}
      {tradeMessage && (
        <div className="mx-4 sm:mx-6 mt-2 p-2 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{tradeMessage}</span>
        </div>
      )}

      {/* 2. FULL BACKGROUND CHART (PURE BLACK WITH FADING DOT MATRIX & TARGET TRACKER LINE) */}
      <section className="relative w-full min-w-0 max-w-full overflow-x-hidden bg-[#000000] pt-14 pb-3">
        {/* Controls occupy their own top strip; the chart canvas starts beneath them with clear separation. */}
        <div className="absolute inset-x-0 top-3.5 z-10 flex items-center justify-between px-3 font-mono text-[10px]">
          <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#0a0a0c]/85 p-0.5 backdrop-blur-md">
            {(['1m', '5m', '15m', '30m', '1H', '24H'] as const).map((tf) => (
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
          key={activeToken.mint}
          currentPrice={liveTokenPrice}
          entryPrice={activePosition && priceCurrency === 'USD' ? entryPriceUsd : undefined}
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
      </section>

      <div className="mx-4 mt-2 rounded-md border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[10px] font-mono text-amber-200/75">
        DEMO MODE · Price and chart are simulated locally for interface testing. No real market feed or trade execution is connected.
      </div>

      {/* Compact, full-width position and live market information. */}
      <section className="w-full px-4 sm:px-6 pt-3 pb-3 max-w-4xl mx-auto font-mono border-b border-white/[0.10]">
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
                {activePosition ? formatMetric(activePosition.amount_tokens, 2) : 'Unavailable'}
              </div>
              <div className="text-[9px] text-white/30">{activeToken.symbol}</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Average entry price</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activePosition ? formatMetric(activePosition.entry_price_usd, 10) + ' USD' : 'Unavailable'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Total budget</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activePosition ? `${formatMetric(activePosition.initial_investment_sol, 4)} SOL` : 'Unavailable'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Current position value</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activePosition ? `${formatMetric(activePosition.current_position_value_sol, 4)} SOL` : 'Unavailable'}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] text-white/40">Unrealized P&L</div>
              <div className={`mt-0.5 text-[13px] font-semibold ${(positionPnlPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {activePosition ? `${formatMetric(positionPnlSol, 4)} SOL · ${(positionPnlPct ?? 0).toFixed(2)}%` : 'Unavailable'}
              </div>
            </div>
          </div>
        </div>

        {activePosition && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.12em] text-white/40">Position protection</div>
              <div className="mt-1 flex items-center gap-4 font-mono text-[12px]">
                <span className="text-red-300">SL {formatMetric(activePosition.stop_loss_target_pct, 2)}%</span>
                <span className="text-emerald-300">TP {activePosition.take_profit_target_pct > 0 ? `+${formatMetric(activePosition.take_profit_target_pct, 2)}%` : 'OFF'}</span>
                <span className="text-amber-200">MAX +{(activePosition.maximum_profit_pct ?? 0) > 0 ? `+${formatMetric(activePosition.maximum_profit_pct ?? 0, 0)}%` : 'OFF'}</span>
                <span className={activePosition.trailing_stop_enabled ? 'text-cyan-300' : 'text-white/40'}>TRAIL {activePosition.trailing_stop_enabled ? (activePosition.trailing_stop_active ? 'ACTIVE' : 'ARMED') : 'OFF'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={openRiskEditor}
              disabled={!settings.adminApiKey}
              title={settings.adminApiKey ? 'Edit this position protection' : 'Save the operator API key in Settings to edit'}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.12] px-2.5 text-[10px] font-medium text-white/75 transition-colors hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          </div>
        )}

        <div className="my-5 border-t border-white/[0.08]" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white/65">Market Statistics</h2>
            <span className="text-[9px] uppercase tracking-wider text-amber-300/70">DEMO MARKET DATA · SIMULATED</span>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div>
              <div className="text-[10px] text-white/40">Market cap</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.market_cap_usd > 0 ? formatMetric(activeToken.market_cap_usd, 2) : 'Unavailable'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Liquidity</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.liquidity_usd > 0 ? `${formatMetric(activeToken.liquidity_usd, 2)}` : 'Unavailable'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">5m volume</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.volume_5m_usd > 0 ? `${formatMetric(activeToken.volume_5m_usd, 2)}` : 'Unavailable'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">1h volume</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.volume_1h_usd > 0 ? `${formatMetric(activeToken.volume_1h_usd, 2)}` : 'Unavailable'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">5m buys</div>
              <div className="mt-0.5 text-[13px] font-semibold text-emerald-400">
                {formatMetric(activeToken.tx_buys_5m, 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">5m sells</div>
              <div className="mt-0.5 text-[13px] font-semibold text-red-400">
                {formatMetric(activeToken.tx_sells_5m, 0)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Holders</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.safety_details?.holders_count > 0 ? formatMetric(activeToken.safety_details.holders_count, 0) : 'Unavailable'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Bonding curve</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {`${formatMetric(activeToken.bonding_curve_progress_pct, 1)}%`}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full px-4 sm:px-6 py-4 max-w-4xl mx-auto font-mono border-b border-white/[0.10]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white/65">Security assessment</h2>
          <span className="text-[9px] uppercase tracking-wider text-white/35">
            {String(securityReport?.decision || securityReport?.status || 'PENDING').replace(/_/g, ' ')}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <div>
            <div className="text-[10px] text-white/40">Mint authority</div>
            <div className="mt-0.5 text-[11px] font-semibold text-white">{securityReport?.mint_authority === true ? 'Active' : securityReport?.mint_authority === false || securityReport?.mint_authority === null ? 'Disabled' : 'Unavailable'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/40">Freeze authority</div>
            <div className="mt-0.5 text-[11px] font-semibold text-white">{securityReport?.freeze_authority === true ? 'Active' : securityReport?.freeze_authority === false || securityReport?.freeze_authority === null ? 'Disabled' : 'Unavailable'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/40">RugCheck</div>
            <div className="mt-0.5 text-[11px] font-semibold text-white">{String(rugcheck.status || 'Unavailable').replace(/_/g, ' ')}{rugcheck.score_normalised != null ? ` · ${rugcheck.score_normalised}/100` : ''}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/40">Top 10 observed share</div>
            <div className="mt-0.5 text-[11px] font-semibold text-white">{holderDistribution.top_10_observed_owner_share_percent == null ? 'Unavailable' : `${formatMetric(Number(holderDistribution.top_10_observed_owner_share_percent), 2)}%`}</div>
            <div className="text-[9px] text-white/30">{holderDistribution.sample_is_partial === true ? 'Partial sample' : holderDistribution.sample_is_partial === false ? 'Complete sample' : 'Not supplied'}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/40">Creator history</div>
            <div className="mt-0.5 text-[11px] font-semibold text-white">{String(creatorHistory.status || 'Unavailable').replace(/_/g, ' ')}</div>
          </div>
          <div>
            <div className="text-[10px] text-white/40">Prior launches sampled</div>
            <div className="mt-0.5 text-[11px] font-semibold text-white">{formatMetric(creatorHistory.prior_pump_fun_launches, 0)}</div>
          </div>
        </div>
        {securityReport?.decision_reason && <p className="mt-3 border-t border-white/[0.07] pt-3 text-[10px] leading-relaxed text-white/55">{securityReport.decision_reason}</p>}
        <div className="mt-3 border-t border-white/[0.07] pt-3">
          <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-white/40">Backend checks ({securityChecks.length})</div>
          {securityChecks.length === 0 ? (
            <p className="text-[10px] text-white/35">No security checks have been returned for this token yet.</p>
          ) : (
            <div className="space-y-2">
              {securityChecks.map((check: any, index: number) => {
                const status = String(check.status || 'unknown').toLowerCase();
                const passed = ['passed', 'pass', 'ok', 'clear'].includes(status);
                const failed = ['failed', 'fail', 'rejected', 'risk'].includes(status);
                return <div key={check.name || index} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-white/75">{String(check.name || 'Security check').replace(/_/g, ' ')}</div>
                    {check.detail && <div className="mt-0.5 text-[9px] leading-relaxed text-white/35">{check.detail}</div>}
                  </div>
                  <span className={`shrink-0 text-[9px] font-semibold uppercase ${passed ? 'text-emerald-400' : failed ? 'text-red-300' : 'text-amber-300'}`}>{status}</span>
                </div>;
              })}
            </div>
          )}
        </div>
        {Array.isArray(securityReport?.provider_responses) && securityReport.provider_responses.length > 0 && (
          <details className="mt-3 border-t border-white/[0.07] pt-3">
            <summary className="cursor-pointer text-[10px] text-white/45">Provider response records ({securityReport.provider_responses.length})</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white/[0.03] p-2 text-[9px] leading-relaxed text-white/50">{JSON.stringify(securityReport.provider_responses, null, 2)}</pre>
          </details>
        )}
      </section>

      <section className="w-full px-4 sm:px-6 py-4 max-w-4xl mx-auto font-mono border-b border-white/[0.10]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white/65">Paper entry evaluation</h2>
          <span className="text-[9px] uppercase tracking-wider text-white/40">
            {String(activeToken.strategy_decision || 'NOT EVALUATED').replace(/_/g, ' ')}
          </span>
        </div>
        {activeToken.strategy_reasons?.length ? (
          <ul className="space-y-2">
            {activeToken.strategy_reasons.map((reason, index) => (
              <li key={`${index}-${reason}`} className="flex items-start gap-2 text-[10px] leading-relaxed text-white/55">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-white/35" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[10px] leading-relaxed text-white/35">
            The backend will show why this token is waiting, rejected by strategy, or eligible for a simulated paper entry when a live market update is evaluated.
          </p>
        )}
        {activeToken.strategy_evaluated_at && (
          <p className="mt-3 text-[9px] text-white/25">Last evaluated {new Date(activeToken.strategy_evaluated_at).toLocaleString()}</p>
        )}
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

      {riskSheetOpen && activePosition && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 px-0 backdrop-blur-sm"
          onClick={(event) => { if (event.target === event.currentTarget && !riskSaving) setRiskSheetOpen(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="position-risk-title" className="w-full max-w-xl rounded-t-2xl border border-white/[0.10] bg-[#111] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-[0_-18px_60px_rgba(0,0,0,.6)]">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h3 id="position-risk-title" className="text-[14px] font-semibold text-white">Position protection</h3>
                <p className="mt-1 text-[10px] text-white/40">{activeToken.symbol} · Changes apply only to this open position.</p>
              </div>
              <button type="button" onClick={() => setRiskSheetOpen(false)} disabled={riskSaving} aria-label="Close position protection editor" className="rounded-lg p-2 text-white/50 disabled:opacity-30"><X className="h-4 w-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block min-w-0">
                <span className="mb-2 block text-[11px] font-medium text-white/60">Stop loss</span>
                <span className="flex h-11 items-center border-b border-white/[0.18] focus-within:border-white/60">
                  <input type="number" min="0" max="100" step="0.5" value={riskStopLoss} onChange={(event) => setRiskStopLoss(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} disabled={riskSaving || riskTrailingEnabled} className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold tabular-nums text-red-300 outline-none disabled:opacity-50" />
                  <span className="text-[12px] text-white/40">%</span>
                </span>
              </label>
              <label className="block min-w-0">
                <span className="mb-2 block text-[11px] font-medium text-white/60">Take profit</span>
                <span className="flex h-11 items-center border-b border-white/[0.18] focus-within:border-white/60">
                  <input type="number" min="0" max="1000" step="1" value={riskTakeProfit} onChange={(event) => setRiskTakeProfit(Math.min(1000, Math.max(0, Number(event.target.value) || 0)))} disabled={riskSaving || riskTrailingEnabled} className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold tabular-nums text-emerald-300 outline-none disabled:opacity-50" />
                  <span className="text-[12px] text-white/40">%</span>
                </span>
              </label>
            </div>
            {riskTrailingEnabled && (
              <p className="mt-2 text-[10px] leading-relaxed text-cyan-200/70">
                Fixed stop-loss and take-profit are saved but inactive in trailing mode. They resume if you turn trailing protection off.
              </p>
            )}

            <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold text-white/80">Trailing-stop eligibility</div>
                  <div className={activePosition.trailing_stop_eligible ? 'mt-1 text-[10px] text-emerald-300' : 'mt-1 text-[10px] text-amber-200'}>
                    {activePosition.trailing_stop_eligible ? 'Eligible for optional trailing protection' : 'Not eligible for trailing protection'}
                  </div>
                </div>
                <label className={`flex items-center gap-2 text-[10px] ${activePosition.trailing_stop_eligible ? 'text-white/75' : 'text-white/30'}`}>
                  <input
                    type="checkbox"
                    checked={riskTrailingEnabled}
                    onChange={(event) => setRiskTrailingEnabled(event.target.checked)}
                    disabled={riskSaving || !activePosition.trailing_stop_eligible}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  Enable
                </label>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-white/40">{activePosition.trailing_stop_eligibility_reason || 'The backend has not supplied an eligibility assessment.'}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
              <label className="col-span-2 block min-w-0">
                <span className="mb-2 block text-[10px] text-white/50">Trailing callback from highest price</span>
                <span className="flex h-10 items-center border-b border-white/[0.16]">
                  <input type="number" min="0" max="100" step="0.5" value={riskTrailingCallback} onChange={(event) => setRiskTrailingCallback(Math.min(100, Math.max(0, Number(event.target.value) || 0)))} disabled={riskSaving || !riskTrailingEnabled} className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold text-cyan-200 outline-none disabled:opacity-35" />
                  <span className="text-[11px] text-white/35">%</span>
                </span>
                <span className="mt-1 block text-[9px] text-white/35">Protection starts immediately at the current price when enabled, then follows each new high.</span>
              </label>
              <label className="col-span-2 block min-w-0">
                <span className="mb-2 block text-[10px] font-medium text-amber-200/80">Trailing maximum-profit target · full sale</span>
                <span className="flex h-10 items-center border-b border-amber-200/20">
                  <input type="number" min="0" step="1" value={riskMaximumProfit} onChange={(event) => setRiskMaximumProfit(Math.max(0, Number(event.target.value) || 0))} disabled={riskSaving || !riskTrailingEnabled} className="min-w-0 flex-1 bg-transparent text-[18px] font-semibold tabular-nums text-amber-200 outline-none disabled:opacity-50" />
                  <span className="text-[12px] text-white/40">%</span>
                </span>
                <span className="mt-1 block text-[9px] text-white/35">Optional: set your own profit ceiling. Reaching it sells the full position; 0 means no ceiling. This applies only while trailing stop is enabled.</span>
              </label>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-2 text-[9px] uppercase tracking-wider text-white/35">Stop-loss presets</p>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 15, 20, 25, 30].map((value) => (
                    <button key={value} type="button" onClick={() => setRiskStopLoss(value)} disabled={riskSaving || riskTrailingEnabled} className={`rounded-lg border px-3 py-1.5 text-[10px] tabular-nums ${riskStopLoss === value ? 'border-white/50 bg-white/10 text-white' : 'border-white/10 text-white/50'}`}>{value}%</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-[9px] uppercase tracking-wider text-white/35">Take-profit presets</p>
                <div className="flex flex-wrap gap-2">
                  {[10, 20, 30, 50, 75, 100, 150, 200].map((value) => (
                    <button key={value} type="button" onClick={() => setRiskTakeProfit(value)} disabled={riskSaving || riskTrailingEnabled} className={`rounded-lg border px-3 py-1.5 text-[10px] tabular-nums ${riskTakeProfit === value ? 'border-white/50 bg-white/10 text-white' : 'border-white/10 text-white/50'}`}>{value}%</button>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-white/35">A value of 0 disables a fixed target. When trailing is enabled, protection starts immediately and follows the highest price by your callback percentage; fixed stop-loss and take-profit are inactive. The optional maximum-profit target sells the full position. All values apply only to this position.</p>
            {riskError && <p role="alert" className="mt-3 rounded-lg border border-red-500/20 bg-red-500/[0.06] p-2.5 text-[10px] text-red-200">{riskError}</p>}
            <button type="button" onClick={() => void savePositionRisk()} disabled={riskSaving || !Number.isFinite(riskStopLoss) || !Number.isFinite(riskTakeProfit)} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-[12px] font-semibold text-black transition-transform active:scale-[0.99] disabled:opacity-50">
              {riskSaving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/25 border-t-black" /> : <Check className="h-4 w-4" />}
              {riskSaving ? 'Applying changes…' : 'Apply changes'}
            </button>
          </section>
        </div>
      )}
    </div>
  );
};

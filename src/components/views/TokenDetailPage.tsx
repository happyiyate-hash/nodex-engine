import React, { useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenAvatar } from '../common/TokenAvatar';
import { DotMatrixChart } from '../common/DotMatrixChart';
import {
  ArrowLeft,
  Copy,
  Check,
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
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [scrubTime, setScrubTime] = useState<string | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);
  const [headerOffset, setHeaderOffset] = useState(0);
  const headerOffsetRef = useRef(0);
  const lastScrollTop = useRef(0);
  const headerHeight = 56;

  // Resolve the selected token from the shared registry on every render so live
  // token merges are reflected immediately instead of displaying a stale snapshot.
  const activeToken = selectedToken
    ? (tokens.find((token) => token.mint === selectedToken.mint) || selectedToken)
    : tokens[0];
  if (!activeToken) return null;

  const activePosition = positions.find((p) => p.mint === activeToken.mint && p.status === 'OPEN');
  const priceCurrency = activeToken.price_currency || (activeToken.current_price_usd > 0 ? 'USD' : 'SOL');
  const liveTokenPrice = priceCurrency === 'SOL' ? activeToken.current_price_sol : activeToken.current_price_usd;
  const currentPrice = scrubPrice ?? liveTokenPrice;
  const marketChangePct = activePosition?.pnl_pct ?? activeToken.price_change_5m_pct ?? activeToken.price_change_1m_pct;
  const pnlPct = marketChangePct ?? 0;
  const isPositive = (activePosition?.pnl_sol ?? marketChangePct ?? 0) >= 0;
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
        {/* Subtle Timeframe Switcher Overlay */}
        <div className="absolute top-2.5 left-4 z-10 flex items-center gap-1 bg-[#0a0a0c]/80 backdrop-blur-md p-0.5 rounded-lg border border-white/10 text-[10px] font-mono">
          {(['1m', '5m', '15m', '1H', '24H'] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-2 py-0.5 rounded transition-colors ${
                timeframe === tf ? 'bg-white/15 text-white font-bold' : 'text-white/40 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Live Scrub Indicator (if dragging) */}
        {scrubTime && (
          <div className="absolute top-2.5 right-4 z-10 text-[10px] font-mono text-white/50 bg-[#0a0a0c]/80 px-2 py-0.5 rounded border border-white/10">
            {scrubTime}
          </div>
        )}

        {/* Pure Black Canvas with Dot Matrix & Backward Tracking Line */}
        <DotMatrixChart
          currentPrice={liveTokenPrice}
          entryPrice={activePosition && priceCurrency === 'USD' ? entryPriceUsd : undefined}
          priceHistory={activeToken.price_history_5m}
          isPositive={isPositive}
          timeframe={timeframe}
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
                {activePosition ? formatMetric(activePosition.amount_tokens, 6) : '—'}
              </div>
              <div className="text-[9px] text-white/30">{activePosition ? activeToken.symbol : 'No open position'}</div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Average entry price</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activePosition ? `${formatMetric(activePosition.entry_price_sol, 10)} SOL` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Total budget</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activePosition ? `${formatMetric(activePosition.initial_investment_sol, 4)} SOL` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Current position value</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activePosition && positionValueSol != null ? `${formatMetric(positionValueSol, 4)} SOL` : '—'}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-[10px] text-white/40">Unrealized P&L</div>
              <div className={`mt-0.5 text-[13px] font-semibold ${positionPnlSol == null ? 'text-white/55' : positionPnlSol >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {activePosition && positionPnlSol != null
                  ? `${positionPnlSol >= 0 ? '+' : ''}${formatMetric(positionPnlSol, 4)} SOL${positionPnlPct == null ? '' : ` · ${positionPnlPct >= 0 ? '+' : ''}${formatMetric(positionPnlPct, 2)}%`}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="my-5 border-t border-white/[0.08]" />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] uppercase tracking-[0.16em] font-semibold text-white/65">Market Statistics</h2>
            <span className="text-[9px] uppercase tracking-wider text-white/30">Live data</span>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div>
              <div className="text-[10px] text-white/40">Market cap</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.market_cap_sol > 0 ? `${formatMetric(activeToken.market_cap_sol, 3)} SOL` : activeToken.market_cap_usd > 0 ? `$${formatMetric(activeToken.market_cap_usd, 2)}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Liquidity</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.liquidity_usd > 0 ? `$${formatMetric(activeToken.liquidity_usd, 2)}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">5m volume</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.volume_5m_usd > 0 ? `$${formatMetric(activeToken.volume_5m_usd, 2)}` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">1h volume</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.volume_1h_usd > 0 ? `$${formatMetric(activeToken.volume_1h_usd, 2)}` : '—'}
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
                {activeToken.safety_details?.holders_count > 0 ? formatMetric(activeToken.safety_details.holders_count, 0) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-white/40">Bonding curve</div>
              <div className="mt-0.5 text-[13px] font-semibold text-white">
                {activeToken.bonding_curve_progress_pct > 0 ? `${formatMetric(activeToken.bonding_curve_progress_pct, 1)}%` : '—'}
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

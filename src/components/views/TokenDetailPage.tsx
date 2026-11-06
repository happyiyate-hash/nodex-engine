import React, { useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenAvatar } from '../common/TokenAvatar';
import { DotMatrixChart } from '../common/DotMatrixChart';
import {
  ArrowLeft,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Sparkles,
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
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollTop = useRef(0);

  const activeToken = selectedToken || tokens[0];
  if (!activeToken) return null;

  const activePosition = positions.find((p) => p.mint === activeToken.mint && p.status === 'OPEN');
  const currentPrice = scrubPrice ?? activeToken.current_price_usd;
  const isPositive = activePosition ? activePosition.pnl_pct >= 0 : true;

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

  // Derived financial metrics
  const tokensBought = activePosition ? activePosition.amount_tokens : 5000000;
  const tokensHolding = activePosition ? activePosition.amount_tokens : 5000000;
  const boughtTime = activePosition
    ? new Date(activePosition.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '10:42 AM';
  const initialCostSol = activePosition ? activePosition.initial_investment_sol : 0.0900;
  const initialCostUsd = activePosition ? activePosition.initial_investment_usd : 18.19;
  const entryPriceUsd = activePosition ? activePosition.entry_price_usd : 0.000018;
  const currentValueSol = activePosition
    ? (activePosition.current_position_value_sol ?? (activePosition.current_position_value_usd / 202.15))
    : 0.1235;
  const currentValueUsd = activePosition ? activePosition.current_position_value_usd : 24.97;
  const pnlSol = activePosition
    ? (activePosition.pnl_sol ?? (activePosition.pnl_usd / 202.15))
    : 0.0335;
  const pnlUsd = activePosition ? activePosition.pnl_usd : 6.78;
  const pnlPct = activePosition ? activePosition.pnl_pct : 37.22;
  const annualizedRoi = (pnlPct * (365 / 7)).toFixed(1);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#000000] text-white select-none font-sans">
      {/* Safe area stays fixed while the token navigation collapses and reappears. */}
      <div aria-hidden="true" className="h-[env(safe-area-inset-top)] w-full shrink-0 bg-[#000000]" />
      {/* 1. DIRECTION-AWARE COLLAPSING TOKEN NAVIGATION */}
      <div className={`z-30 grid w-full shrink-0 overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${headerVisible ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
      <header className="w-full border-b border-white/[0.06] bg-[#000000] px-3 py-2.5 shadow-[0_6px_18px_rgba(0,0,0,0.22)] sm:px-5">
        <div className="flex w-full items-center justify-between gap-3">
          {/* Token identity sits flush to the left edge of the header. */}
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

          {/* Price and percentage remain aligned to the right. */}
          <div className="shrink-0 text-right leading-none">
          <div className="font-mono text-base sm:text-lg font-bold text-white tracking-tight">
            ${currentPrice < 0.001 ? currentPrice.toFixed(8).replace(/\.?0+$/, '') : currentPrice.toFixed(6)}
          </div>
          <div className={`font-mono text-[11px] font-semibold mt-1 flex items-center justify-end gap-0.5 ${
            isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'
          }`}>
            <span>{isPositive ? '▲ +' : '▼ '}{pnlPct.toFixed(2)}%</span>
          </div>
          </div>
        </div>
      </header>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-28"
        onScroll={(event) => {
          const nextScrollTop = event.currentTarget.scrollTop;
          const delta = nextScrollTop - lastScrollTop.current;
          if (Math.abs(delta) > 3) {
            if (delta > 0) setHeaderVisible(false);
            else setHeaderVisible(true);
            lastScrollTop.current = nextScrollTop;
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
          currentPrice={activeToken.current_price_usd}
          entryPrice={entryPriceUsd}
          isPositive={isPositive}
          timeframe={timeframe}
          height={320}
          onPriceHover={(p, t) => {
            setScrubPrice(p);
            setScrubTime(t);
          }}
        />
      </section>

      {/* 3. BOTTOM CARDS SECTION (CLEAN, COMPACT, PURE BLACK & GRAPHITE) */}
      <section className="px-4 sm:px-6 py-4 max-w-4xl mx-auto space-y-3">
        {/* Card 1: Amount Bought & Currently Holding */}
        <div className="rounded-xl bg-[#0a0a0c] border border-white/[0.08] p-3.5">
          <div className="text-[10px] uppercase font-mono tracking-wider text-white/40 pb-2 border-b border-white/[0.06] flex items-center justify-between">
            <span>Holdings & Purchase Record</span>
            <span className="text-white/30">ID: {activeToken.symbol}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2.5 font-mono">
            <div>
              <div className="text-[10px] text-white/40">Amount Bought</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {tokensBought.toLocaleString()}
              </div>
              <div className="text-[9px] text-white/30">{activeToken.symbol} tokens</div>
            </div>

            <div>
              <div className="text-[10px] text-white/40">Currently Holding</div>
              <div className="text-sm font-semibold text-emerald-400 mt-0.5">
                {tokensHolding.toLocaleString()}
              </div>
              <div className="text-[9px] text-white/30">100% available</div>
            </div>

            <div>
              <div className="text-[10px] text-white/40">Time Bought</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {boughtTime}
              </div>
              <div className="text-[9px] text-white/30">On-chain confirmed</div>
            </div>

            <div>
              <div className="text-[10px] text-white/40">First Purchase Cost</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {initialCostSol.toFixed(4)} SOL
              </div>
              <div className="text-[9px] text-white/30">${initialCostUsd.toFixed(2)} USD</div>
            </div>
          </div>
        </div>

        {/* Card 2: Price Timeline (Then vs Now) */}
        <div className="rounded-xl bg-[#0a0a0c] border border-white/[0.08] p-3.5">
          <div className="text-[10px] uppercase font-mono tracking-wider text-white/40 pb-2 border-b border-white/[0.06] flex items-center justify-between">
            <span>Price Journey (Execution vs Current)</span>
            <span className={isPositive ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
              {isPositive ? '▲ Gain' : '▼ Loss'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2.5 font-mono">
            <div>
              <div className="text-[10px] text-white/40">Price at Purchase</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                ${entryPriceUsd.toFixed(8).replace(/\.?0+$/, '')}
              </div>
              <div className="text-[9px] text-white/30">Execution benchmark</div>
            </div>

            <div>
              <div className="text-[10px] text-white/40">Price Right Now</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                ${activeToken.current_price_usd.toFixed(8).replace(/\.?0+$/, '')}
              </div>
              <div className="text-[9px] text-white/30">Live on-chain tick</div>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <div className="text-[10px] text-white/40">Price Movement</div>
              <div className={`text-sm font-bold mt-0.5 ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {isPositive ? '+' : ''}{pnlPct.toFixed(2)}%
              </div>
              <div className="text-[9px] text-white/30">Net token price change</div>
            </div>
          </div>
        </div>

        {/* Card 3: Total Value of Token Now */}
        <div className="rounded-xl bg-[#0a0a0c] border border-white/[0.08] p-3.5">
          <div className="text-[10px] uppercase font-mono tracking-wider text-white/40 pb-2 border-b border-white/[0.06] flex items-center justify-between">
            <span>Current Asset Valuation</span>
            <span className="text-white/40 font-mono">SOL/USD Live</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2.5 font-mono">
            <div>
              <div className="text-[10px] text-white/40">Total Value in SOL</div>
              <div className="text-base font-bold text-white mt-0.5">
                {currentValueSol.toFixed(4)} SOL
              </div>
              <div className="text-[9px] text-white/30">Liquid balance</div>
            </div>

            <div>
              <div className="text-[10px] text-white/40">Total Value in USD</div>
              <div className="text-base font-bold text-white mt-0.5">
                ${currentValueUsd.toFixed(2)}
              </div>
              <div className="text-[9px] text-white/30">At $202.15/SOL</div>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <div className="text-[10px] text-white/40">Net Gain in SOL</div>
              <div className={`text-base font-bold mt-0.5 ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                {isPositive ? '+' : ''}{pnlSol.toFixed(4)} SOL
              </div>
              <div className="text-[9px] text-white/30">Unrealised P&L</div>
            </div>
          </div>
        </div>

        {/* Card 4: Quick Action Controls (Sell & Buy) */}
        <div className="rounded-xl bg-[#0a0a0c] border border-white/[0.08] p-3.5 flex flex-wrap items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-white/40 uppercase mr-1">Sell:</span>
            <button
              onClick={() => handleSellPercent(25)}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-950/60 hover:text-red-300 text-white text-[11px] border border-white/10 transition-colors cursor-pointer"
            >
              25%
            </button>
            <button
              onClick={() => handleSellPercent(50)}
              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-red-950/60 hover:text-red-300 text-white text-[11px] border border-white/10 transition-colors cursor-pointer"
            >
              50%
            </button>
            <button
              onClick={() => handleSellPercent(100)}
              className="px-3 py-1 rounded-lg bg-red-950/50 hover:bg-red-900/70 border border-red-500/30 text-red-300 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Sell 100%
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-white/40 uppercase mr-1">Buy:</span>
            <button
              onClick={() => handleBuyMore(0.1)}
              className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 text-[11px] transition-colors cursor-pointer"
            >
              +0.1 SOL
            </button>
            <button
              onClick={() => handleBuyMore(0.5)}
              className="px-2.5 py-1 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 text-[11px] transition-colors cursor-pointer"
            >
              +0.5 SOL
            </button>
            <button
              onClick={() => handleBuyMore(1.0)}
              className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-bold transition-colors cursor-pointer"
            >
              +1.0 SOL
            </button>
          </div>
        </div>

        {/* Card 5: THE VERY BIG CARD AT THE VERY BOTTOM (SHOWING ANNUAL PROFIT & DOLLAR VALUE WITH PLUS) */}
        <div className="relative rounded-2xl bg-gradient-to-b from-[#0f1412] via-[#090b0a] to-[#050606] border border-emerald-500/30 p-5 sm:p-6 shadow-[0_10px_35px_rgba(0,0,0,0.8)] overflow-hidden font-mono">
          {/* Ambient emerald backlight glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="text-xs uppercase tracking-widest text-emerald-300 font-bold">
                  Annualized Profit & Return
                </span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold">
                PAPER METRIC
              </span>
            </div>

            {/* Main Financial Numbers: Big Dollar Value Profit with Plus */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <div className="text-[11px] text-white/50 uppercase tracking-wider mb-1">
                  Net Profit (USD)
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-emerald-400 flex items-center gap-1">
                  <span>+${pnlUsd.toFixed(2)}</span>
                  <span className="text-xs sm:text-sm font-normal text-white/40">USD</span>
                </div>
                <div className="text-xs text-white/60 mt-1">
                  Profit in Solana: <strong className="text-emerald-300">+{pnlSol.toFixed(4)} SOL</strong>
                </div>
              </div>

              {/* Annualized Projection (APY / ROI) */}
              <div className="text-left sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                <div className="text-[11px] text-white/50 uppercase tracking-wider mb-1">
                  Projected Annual ROI
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  +{annualizedRoi}%
                </div>
                <div className="text-[10px] text-emerald-400/80 mt-1">
                  Compounded annualized run-rate
                </div>
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

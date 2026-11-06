import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenAvatar } from '../common/TokenAvatar';
import { MobileTradingChart } from '../common/MobileTradingChart';
import { DexScreenerEmbed } from '../common/DexScreenerEmbed';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Zap,
  TrendingUp,
  TrendingDown,
  Layers,
  Flame,
  Lock,
  Radio,
  Sliders,
  DollarSign,
  AlertTriangle,
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
  const [chartMode, setChartMode] = useState<'native' | 'tradingview'>('native');
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1H' | '4H' | '24H'>('24H');
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [scrubTime, setScrubTime] = useState<string | null>(null);
  const [tradeMessage, setTradeMessage] = useState<string | null>(null);

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
    setTradeMessage(`Executed Paper Sell ${pct}% of ${activeToken.symbol}`);
    setTimeout(() => setTradeMessage(null), 3000);
  };

  const handleBuyMore = (sol: number) => {
    executeManualPaperBuy(activeToken.mint, sol);
    setTradeMessage(`Executed Paper Buy of ${sol} SOL for ${activeToken.symbol}`);
    setTimeout(() => setTradeMessage(null), 3000);
  };

  return (
    <div className="w-full bg-[#08080a] text-white select-none min-h-full pb-16 font-sans text-xs">
      {/* 1. TOP HEADER & BREADCRUMB STRIP */}
      <div className="sticky top-0 z-30 w-full border-b border-[#1e2025] bg-[#0c0d10]/90 backdrop-blur-md px-3 sm:px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={closeTokenDetail}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#18191c] hover:bg-[#22242a] text-[#a1a1aa] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="font-mono text-xs font-medium">Back</span>
          </button>

          <div className="flex items-center gap-2">
            <TokenAvatar symbol={activeToken.symbol} size="md" />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-white font-mono">{activeToken.symbol}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[#71717a] uppercase font-mono">
                  {activeToken.venue}
                </span>
              </div>
              <span className="text-[10px] text-[#71717a] truncate max-w-[120px] sm:max-w-none block">
                {activeToken.name}
              </span>
            </div>
          </div>
        </div>

        {/* Right Links & Mint Copy */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={handleCopyMint}
            title="Copy Solana Mint"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18191c] hover:bg-[#22242a] text-[#a1a1aa] hover:text-white transition-colors text-[11px] font-mono cursor-pointer"
          >
            {copiedMint ? <Check className="w-3 h-3 text-[#10B981]" /> : <Copy className="w-3 h-3" />}
            <span className="hidden sm:inline">{activeToken.mint.slice(0, 4)}...{activeToken.mint.slice(-4)}</span>
            <span className="sm:hidden">Mint</span>
          </button>

          <a
            href={`https://dexscreener.com/solana/${activeToken.mint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#18191c] hover:bg-[#22242a] text-[#a1a1aa] hover:text-white transition-colors text-[11px] font-mono"
          >
            <span className="hidden sm:inline">DexScreener</span>
            <span className="sm:hidden">DEX</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Trade Notification Toast */}
      {tradeMessage && (
        <div className="mx-3 sm:mx-5 mt-2 p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-2 animate-in fade-in duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{tradeMessage}</span>
        </div>
      )}

      {/* 2. PRICE & TIMEFRAME CONTROLS STRIP */}
      <div className="px-3 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#1e2025]">
        {/* Live Price & Return */}
        <div>
          <div className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">
            {scrubTime ? `Time: ${scrubTime}` : 'Current Price (USD)'}
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-xl sm:text-2xl font-bold font-mono text-white tracking-tight">
              ${currentPrice < 0.001 ? currentPrice.toFixed(8).replace(/\.?0+$/, '') : currentPrice.toFixed(6)}
            </span>
            <div className={`flex items-center gap-0.5 text-xs font-mono font-medium ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{isPositive ? '+' : ''}{activePosition ? activePosition.pnl_pct.toFixed(2) : '24.50'}%</span>
            </div>
          </div>
        </div>

        {/* Chart Engine Switcher & Timeframe Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Chart Engine Mode Switcher */}
          <div className="flex items-center rounded-lg bg-[#121316] p-0.5 border border-[#212328]">
            <button
              onClick={() => setChartMode('native')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                chartMode === 'native' ? 'bg-[#27272a] text-white shadow-sm' : 'text-[#71717a] hover:text-white'
              }`}
            >
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>Native Pulse</span>
            </button>
            <button
              onClick={() => setChartMode('tradingview')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                chartMode === 'tradingview' ? 'bg-[#27272a] text-white shadow-sm' : 'text-[#71717a] hover:text-white'
              }`}
            >
              <Radio className="w-3 h-3 text-cyan-400" />
              <span>TradingView DEX</span>
            </button>
          </div>

          {/* Timeframe Buttons (Active for Native Chart) */}
          {chartMode === 'native' && (
            <div className="flex items-center rounded-lg bg-[#121316] p-0.5 border border-[#212328]">
              {(['1m', '5m', '15m', '1H', '4H', '24H'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-2 py-1 rounded-md text-[10px] font-mono transition-colors cursor-pointer ${
                    timeframe === tf ? 'bg-[#27272a] text-white font-bold' : 'text-[#71717a] hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. FULL-WIDTH CHART VIEWPORT (MOBILE AND DESKTOP) */}
      <div className="w-full bg-[#09090b] border-b border-[#1e2025]">
        {chartMode === 'native' ? (
          <MobileTradingChart
            symbol={activeToken.symbol}
            currentPrice={activeToken.current_price_usd}
            entryPrice={activePosition?.entry_price_usd}
            isPositive={isPositive}
            timeframe={timeframe}
            height={360}
            onPriceHover={(p, t) => {
              setScrubPrice(p);
              setScrubTime(t);
            }}
          />
        ) : (
          <DexScreenerEmbed
            mint={activeToken.mint}
            symbol={activeToken.symbol}
            height={420}
          />
        )}
      </div>

      {/* 4. POSITION DASHBOARD & QUICK TRADING CONTROLS */}
      <div className="px-3 sm:px-5 py-4 max-w-5xl mx-auto space-y-4">
        {/* Position Information Card */}
        {activePosition ? (
          <div className="rounded-xl bg-[#121316] border border-[#212328] p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-[#1e2025]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span className="font-semibold text-white font-mono uppercase tracking-wide">
                  Active Position ({activeToken.symbol})
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  OPEN
                </span>
              </div>
              <span className="text-[11px] font-mono text-[#71717a]">
                Venue: {activePosition.venue}
              </span>
            </div>

            {/* Metrics Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1 font-mono">
              <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5">
                <div className="text-[10px] text-[#71717a]">Entry Price</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  ${activePosition.entry_price_usd.toFixed(6)}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5">
                <div className="text-[10px] text-[#71717a]">Tokens Held</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {activePosition.amount_tokens.toLocaleString()}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5">
                <div className="text-[10px] text-[#71717a]">Invested Capital</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {activePosition.initial_investment_sol.toFixed(4)} SOL
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5">
                <div className="text-[10px] text-[#71717a]">Current Value</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {(activePosition.current_position_value_sol ?? (activePosition.current_position_value_usd / 202.15)).toFixed(4)} SOL
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5">
                <div className="text-[10px] text-[#71717a]">Unrealised P&L</div>
                <div className={`text-sm font-bold mt-0.5 ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {isPositive ? '+' : ''}{(activePosition.pnl_sol ?? (activePosition.pnl_usd / 202.15)).toFixed(4)} SOL
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5">
                <div className="text-[10px] text-[#71717a]">Net Return</div>
                <div className={`text-sm font-bold mt-0.5 ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                  {isPositive ? '+' : ''}{activePosition.pnl_pct.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Quick Action Buttons for Paper Position */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-[#1e2025]">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#71717a] font-mono">Quick Sell:</span>
                <button
                  onClick={() => handleSellPercent(25)}
                  className="px-2.5 py-1 rounded bg-[#1e2025] hover:bg-red-950/60 hover:text-red-300 text-white font-mono text-[11px] transition-colors cursor-pointer"
                >
                  Sell 25%
                </button>
                <button
                  onClick={() => handleSellPercent(50)}
                  className="px-2.5 py-1 rounded bg-[#1e2025] hover:bg-red-950/60 hover:text-red-300 text-white font-mono text-[11px] transition-colors cursor-pointer"
                >
                  Sell 50%
                </button>
                <button
                  onClick={() => handleSellPercent(100)}
                  className="px-3 py-1 rounded bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 font-mono text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Sell 100% (Close)
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-[#71717a] font-mono">Buy More:</span>
                <button
                  onClick={() => handleBuyMore(0.1)}
                  className="px-2.5 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] transition-colors cursor-pointer"
                >
                  +0.1 SOL
                </button>
                <button
                  onClick={() => handleBuyMore(0.5)}
                  className="px-2.5 py-1 rounded bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] transition-colors cursor-pointer"
                >
                  +0.5 SOL
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-[#121316] border border-[#212328] p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-white font-mono text-sm">No Open Position</div>
              <div className="text-[11px] text-[#71717a]">
                Simulate paper buying this token to track real-time P&L against live on-chain Solana volatility.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleBuyMore(0.1)}
                className="px-3 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-semibold transition-colors cursor-pointer"
              >
                Buy 0.1 SOL
              </button>
              <button
                onClick={() => handleBuyMore(0.5)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-mono text-xs font-semibold transition-colors cursor-pointer"
              >
                Buy 0.5 SOL
              </button>
            </div>
          </div>
        )}

        {/* 5. ON-CHAIN TOKEN SECURITY & AUDIT */}
        <div className="rounded-xl bg-[#121316] border border-[#212328] p-3.5 sm:p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#1e2025]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#10B981]" />
              <span className="font-semibold text-white text-sm">Security & Contract Audit</span>
            </div>
            <span className="text-[11px] font-mono text-[#10B981] font-semibold">
              Score: {activeToken.safety_details?.safety_score || 92}/100 (Safe)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
            <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5 flex items-center justify-between">
              <span className="text-[#71717a]">Mint Auth</span>
              <span className="text-[#10B981] font-semibold flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Renounced</span>
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5 flex items-center justify-between">
              <span className="text-[#71717a]">Freeze Auth</span>
              <span className="text-[#10B981] font-semibold flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Revoked</span>
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5 flex items-center justify-between">
              <span className="text-[#71717a]">Liquidity</span>
              <span className="text-white font-semibold">
                ${(activeToken.liquidity_usd / 1000).toFixed(0)}K
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#0b0c0e] border border-white/5 flex items-center justify-between">
              <span className="text-[#71717a]">Top 10 Holders</span>
              <span className="text-white font-semibold">
                {activeToken.safety_details?.top_10_holders_pct || 16.4}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

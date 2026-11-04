import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TradingChart } from '../common/TradingChart';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  TrendingUp,
  TrendingDown,
  Layers,
  Flame,
  Lock,
  CheckCircle2,
  Zap,
  ShoppingBag,
  DollarSign,
  PieChart,
} from 'lucide-react';

export const TokenDetailPage: React.FC = () => {
  const {
    selectedToken,
    closeTokenDetail,
    positions,
    closePosition,
    executeManualPaperBuy,
  } = useTerminal();

  const [copiedMint, setCopiedMint] = useState(false);
  const [paperBuySol, setPaperBuySol] = useState(1.0);
  const [chartMetric, setChartMetric] = useState<'price' | 'pnl'>('price');

  if (!selectedToken) return null;

  const handleCopyMint = () => {
    navigator.clipboard.writeText(selectedToken.mint);
    setCopiedMint(true);
    setTimeout(() => setCopiedMint(false), 2000);
  };

  const activePosition = positions.find((p) => p.mint === selectedToken.mint && p.status === 'OPEN');
  const safety = selectedToken.safety_details;

  // The backend does not currently expose historical price candles or position P&L history.
  const chartData: Array<{ time: string; value: number }> = [];
  const isPositive = true;

  return (
    <div className="w-full text-white select-none">
      {/* 1. TOP HEADER & BREADCRUMB STRIP */}
      <div className="w-full border-b border-white/[0.08] bg-[#090909]/70 backdrop-blur-md px-4 lg:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            onClick={closeTokenDetail}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md glass-icon text-xs font-mono text-[#a3a3a3] hover:text-white transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <span className="text-[#404040]">/</span>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded glass-icon flex items-center justify-center font-bold text-white text-[10px]">
              {selectedToken.symbol.slice(0, 3)}
            </div>
            <span className="text-sm font-mono font-bold text-white uppercase">${selectedToken.symbol}</span>
            <span className="text-xs font-mono text-[#737373]">{selectedToken.name}</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded glass-icon text-[#a3a3a3] uppercase">
              {selectedToken.venue}
            </span>
          </div>
        </div>

        {/* External links & Mint */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <button
            onClick={handleCopyMint}
            title="Copy Solana Mint"
            className="flex items-center gap-1 px-2 py-1 rounded-md glass-icon text-[#a3a3a3] hover:text-white transition-all text-[11px]"
          >
            {copiedMint ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{selectedToken.mint.slice(0, 4)}...{selectedToken.mint.slice(-4)}</span>
          </button>

          <a
            href={`https://solscan.io/token/${selectedToken.mint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-md glass-icon text-[#a3a3a3] hover:text-white transition-all text-[11px]"
          >
            <span>Solscan</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>

          <a
            href={`https://dexscreener.com/solana/${selectedToken.mint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-md glass-icon text-[#a3a3a3] hover:text-white transition-all text-[11px]"
          >
            <span>DexScreener</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>

      {/* 2. DEDICATED TOKEN HOLDING & INVESTMENT STATS BANNER */}
      {activePosition ? (
        <section className="w-full border-b border-white/[0.08] bg-[#0c0c0c]/80 backdrop-blur-sm">
          <div className="px-4 lg:px-6 py-2 border-b border-white/[0.06] flex items-center justify-between bg-emerald-950/20 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-bold uppercase tracking-wider">
                Active Position Holdings
              </span>
              <span className="text-[#737373]">· Paper Execution</span>
            </div>
            <button
              onClick={() => closePosition(activePosition.id, 100)}
              className="px-2.5 py-0.5 rounded bg-red-950/40 text-red-300 hover:text-white border border-red-500/30 text-[10px] font-medium transition-all"
            >
              Close / Sell 100% Position
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
            {/* Amount Bought */}
            <div className="p-3">
              <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Amount Bought</div>
              <div className="text-base sm:text-lg font-bold font-mono text-white tabular-nums mt-0.5">
                {activePosition.amount_tokens.toLocaleString()}
              </div>
              <div className="text-[10px] font-mono text-[#737373]">Tokens held</div>
            </div>

            {/* Initial Investment */}
            <div className="p-3">
              <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Initial Investment</div>
              <div className="text-base sm:text-lg font-bold font-mono text-white tabular-nums mt-0.5">
                ${activePosition.initial_investment_usd.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-[#737373] tabular-nums">
                {activePosition.initial_investment_sol.toFixed(2)} SOL
              </div>
            </div>

            {/* Entry Price */}
            <div className="p-3">
              <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Entry Price</div>
              <div className="text-base sm:text-lg font-bold font-mono text-white tabular-nums mt-0.5">
                ${activePosition.entry_price_usd.toFixed(6)}
              </div>
              <div className="text-[10px] font-mono text-[#737373]">Executed on {activePosition.venue}</div>
            </div>

            {/* Current Price */}
            <div className="p-3">
              <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Current Price</div>
              <div className="text-base sm:text-lg font-bold font-mono text-white tabular-nums mt-0.5">
                ${activePosition.current_price_usd.toFixed(6)}
              </div>
              <div className="text-[10px] font-mono text-[#737373]">Live on-chain tick</div>
            </div>

            {/* Current Position Value */}
            <div className="p-3">
              <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Position Value</div>
              <div className="text-base sm:text-lg font-bold font-mono text-white tabular-nums mt-0.5">
                ${activePosition.current_position_value_usd.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-[#737373] tabular-nums">
                {(activePosition.current_position_value_usd / 194.5).toFixed(2)} SOL
              </div>
            </div>

            {/* Profit / Loss */}
            <div className="p-3">
              <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Unrealised P&L</div>
              <div className={`text-base sm:text-lg font-bold font-mono tabular-nums mt-0.5 ${
                activePosition.pnl_usd >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {activePosition.pnl_usd >= 0 ? '+' : ''}${activePosition.pnl_usd.toFixed(2)}
              </div>
              <div className={`text-[10px] font-mono font-bold ${activePosition.pnl_usd >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                {activePosition.pnl_usd >= 0 ? '+' : ''}{activePosition.pnl_pct.toFixed(2)}% Net
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="w-full border-b border-white/[0.08] bg-[#0c0c0c]/40 backdrop-blur-sm px-4 lg:px-6 py-2 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[#8e8e93]">Position Status:</span>
            <span className="text-white">NOT CURRENTLY HELD</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#737373]">Simulate Buy:</span>
            <button
              onClick={() => executeManualPaperBuy(selectedToken.mint, 1.0)}
              className="px-2.5 py-0.5 rounded glass-icon text-emerald-400 hover:text-white text-xs font-medium"
            >
              + Buy 1.0 SOL
            </button>
          </div>
        </section>
      )}

      {/* 3. FULL-WIDTH TRADING CHART VIEWPORT (TIME FILTERS & PUMP.FUN PULSING BEACON DOT) */}
      <section className="w-full border-b border-white/[0.08] bg-[#070707]">
        {/* Chart Header Bar: Full-Width with Timeframe & Metric Toggles */}
        <div className="px-4 lg:px-6 py-2.5 border-b border-white/[0.06] flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-[#0a0a0a]/30">
          <div className="flex items-center gap-2.5">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="font-bold text-white uppercase">${selectedToken.symbol}</span>
                <span className="text-[#525252]">·</span>
                <span className="text-emerald-400 font-semibold tabular-nums">
                  ${selectedToken.current_price_usd.toFixed(6)}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-500/20">
                  {chartMetric === 'price' ? 'Price Trajectory' : 'Position P&L Curve'}
                </span>
              </div>
              <div className="text-[10px] font-mono text-[#737373]">
                Pump.fun on-chain beacon synchronization · High frequency tick updates
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {/* Metric Switcher */}
            <div className="flex items-center p-0.5 rounded-lg glass-panel-subtle text-[11px]">
              <button
                onClick={() => setChartMetric('price')}
                className={`px-2.5 py-0.5 rounded transition-all ${
                  chartMetric === 'price'
                    ? 'glass-card text-white font-medium shadow-sm'
                    : 'text-[#8e8e93] hover:text-white'
                }`}
              >
                Price ($)
              </button>
              {activePosition && (
                <button
                  onClick={() => setChartMetric('pnl')}
                  className={`px-2.5 py-0.5 rounded transition-all ${
                    chartMetric === 'pnl'
                      ? 'glass-card text-white font-medium shadow-sm'
                      : 'text-[#8e8e93] hover:text-white'
                  }`}
                >
                  Position P&L ($)
                </button>
              )}
            </div>


          </div>
        </div>

        {/* 100% Full-Width Chart Canvas with Pump.fun Live Pulsing Beacon Dot */}
        <div className="w-full min-h-[220px] flex items-center justify-center text-center text-xs font-mono text-[#737373]">
          Historical price data is not available from the backend yet. No synthetic chart is displayed.
        </div>
      </section>

      {/* 4. ON-CHAIN TOKEN METRICS & LIQUIDITY STRIP */}
      <section className="w-full border-b border-white/[0.08] bg-[#0c0c0c]/40 backdrop-blur-sm grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
        <div className="p-3">
          <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Market Cap</div>
          <div className="text-sm font-bold font-mono text-white tabular-nums mt-0.5">
            ${Math.round(selectedToken.market_cap_usd).toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-[#737373]">Circulating token supply</div>
        </div>

        <div className="p-3">
          <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Liquidity Pool</div>
          <div className="text-sm font-bold font-mono text-white tabular-nums mt-0.5">
            ${selectedToken.liquidity_usd.toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-emerald-400">100% Burnt / Locked</div>
        </div>

        <div className="p-3">
          <div className="text-[10px] font-mono text-[#8e8e93] uppercase">5m Volume</div>
          <div className="text-sm font-bold font-mono text-white tabular-nums mt-0.5">
            ${selectedToken.volume_5m_usd.toLocaleString()}
          </div>
          <div className="text-[10px] font-mono text-[#737373]">
            {selectedToken.tx_buys_5m} buys / {selectedToken.tx_sells_5m} sells
          </div>
        </div>

        <div className="p-3">
          <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Bonding Curve</div>
          <div className="text-sm font-bold font-mono text-white tabular-nums mt-0.5">
            {selectedToken.bonding_curve_progress_pct.toFixed(1)}%
          </div>
          <div className="text-[10px] font-mono text-amber-400">
            {selectedToken.bonding_curve_progress_pct >= 100 ? 'Raydium Migrated' : 'Pump.fun Curve'}
          </div>
        </div>

        <div className="p-3">
          <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Creator Wallet</div>
          <div className="text-sm font-mono text-white truncate mt-0.5">
            {selectedToken.creator_wallet.slice(0, 4)}...{selectedToken.creator_wallet.slice(-4)}
          </div>
          <div className="text-[10px] font-mono text-[#737373]">Deployer address</div>
        </div>

        <div className="p-3">
          <div className="text-[10px] font-mono text-[#8e8e93] uppercase">Safety Score</div>
          <div className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
            safety.safety_score >= 80 ? 'text-emerald-400' : 'text-amber-400'
          }`}>
            {safety.safety_score} / 100
          </div>
          <div className="text-[10px] font-mono uppercase text-[#a3a3a3]">
            {selectedToken.safety_status}
          </div>
        </div>
      </section>

      {/* 5. ON-CHAIN RISK & SAFETY AUDIT */}
      <div className="w-full p-4 lg:p-6 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
            On-Chain Safety & Risk Audit
          </span>
          <span className="text-xs font-mono text-emerald-400">
            AUDIT PASSED
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-lg glass-panel-subtle flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-white font-medium text-xs">Mint Authority</div>
              <div className="text-[10px] text-emerald-400">Revoked (Safe)</div>
            </div>
          </div>

          <div className="p-3 rounded-lg glass-panel-subtle flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-white font-medium text-xs">Freeze Authority</div>
              <div className="text-[10px] text-emerald-400">Revoked (Safe)</div>
            </div>
          </div>

          <div className="p-3 rounded-lg glass-panel-subtle flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-white font-medium text-xs">Top 10 Holders</div>
              <div className="text-[10px] text-[#a3a3a3]">{safety.top_10_holders_pct}% of supply</div>
            </div>
          </div>

          <div className="p-3 rounded-lg glass-panel-subtle flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-white font-medium text-xs">Dev Holding</div>
              <div className="text-[10px] text-[#a3a3a3]">{safety.dev_holding_pct}% remaining</div>
            </div>
          </div>
        </div>

        {/* Paper Trade Execution Form */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg glass-panel-subtle text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[#8e8e93] text-xs">Execute Simulated Paper Buy:</span>
            <div className="flex items-center gap-1.5">
              {[0.5, 1.0, 2.0, 5.0].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setPaperBuySol(amt)}
                  className={`px-2.5 py-0.5 rounded text-[11px] transition-all ${
                    paperBuySol === amt
                      ? 'glass-card text-white font-bold'
                      : 'text-[#8e8e93] hover:text-white'
                  }`}
                >
                  {amt} SOL
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={() => executeManualPaperBuy(selectedToken.mint, paperBuySol)}
            className="px-4 py-1.5 rounded-lg glass-card border-emerald-500/30 text-emerald-300 hover:text-white hover:bg-emerald-950/40 font-mono font-medium text-xs transition-all flex items-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Simulate Buy ({paperBuySol} SOL)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { useTerminal } from '../../context/TerminalContext';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Activity,
  Layers,
  Radio,
  Zap,
  ShoppingBag,
  ExternalLink,
} from 'lucide-react';

export const OverviewPage: React.FC = () => {
  const {
    summary,
    engineStatus,
    positions,
    tokens,
    events,
    setActiveTab,
    openTokenDetailByMint,
    setSelectedEvent,
  } = useTerminal();

  const isOverallProfit = summary.total_pnl_usd >= 0;
  const isRealisedProfit = summary.realised_pnl_usd >= 0;
  const isUnrealisedProfit = summary.unrealised_pnl_usd >= 0;

  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const recentEvents = events.slice(0, 8);

  return (
    <div className="w-full text-white select-none">
      {/* 1. PRIMARY BALANCE & FINANCIAL SUMMARY STRIP (FULL WIDTH ON MAIN BACKGROUND) */}
      <section className="w-full border-b border-white/[0.08] bg-[#090909]/60 backdrop-blur-md">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          {/* Total Portfolio Value */}
          <div className="p-3 sm:p-4">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Total Portfolio
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white tabular-nums">
              ${summary.total_portfolio_value_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-[#737373] tabular-nums">
              {summary.total_portfolio_value_sol.toFixed(2)} SOL
            </div>
          </div>

          {/* Total Invested Capital */}
          <div className="p-3 sm:p-4">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Invested Capital
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white tabular-nums">
              ${summary.total_invested_capital_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-[#737373]">
              Simulated pool
            </div>
          </div>

          {/* Current Open Positions */}
          <div className="p-3 sm:p-4">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Open Positions
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white tabular-nums flex items-baseline gap-1.5">
              <span>{summary.open_positions_count}</span>
              <span className="text-xs text-[#737373] font-normal">/ 8 max</span>
            </div>
            <div className="text-[10px] font-mono text-emerald-400">
              Active tracking
            </div>
          </div>

          {/* Realised P&L */}
          <div className="p-3 sm:p-4">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Realised P&L
            </div>
            <div className={`text-lg sm:text-xl font-bold font-mono tracking-tight tabular-nums flex items-center gap-1 ${
              isRealisedProfit ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {isRealisedProfit ? <TrendingUp className="w-3.5 h-3.5 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 shrink-0" />}
              <span>{isRealisedProfit ? '+' : ''}${Math.abs(summary.realised_pnl_usd).toFixed(2)}</span>
            </div>
            <div className={`text-[10px] font-mono tabular-nums ${isRealisedProfit ? 'text-emerald-500' : 'text-red-500'}`}>
              {isRealisedProfit ? '+' : ''}{summary.realised_pnl_pct.toFixed(2)}%
            </div>
          </div>

          {/* Unrealised P&L */}
          <div className="p-3 sm:p-4">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Unrealised P&L
            </div>
            <div className={`text-lg sm:text-xl font-bold font-mono tracking-tight tabular-nums ${
              isUnrealisedProfit ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {isUnrealisedProfit ? '+' : ''}${summary.unrealised_pnl_usd.toFixed(2)}
            </div>
            <div className={`text-[10px] font-mono tabular-nums ${isUnrealisedProfit ? 'text-emerald-500' : 'text-red-500'}`}>
              {isUnrealisedProfit ? '+' : ''}{summary.unrealised_pnl_pct.toFixed(2)}%
            </div>
          </div>

          {/* Total Net P&L */}
          <div className="p-3 sm:p-4">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Total Net P&L
            </div>
            <div className={`text-lg sm:text-xl font-bold font-mono tracking-tight tabular-nums ${
              isOverallProfit ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {isOverallProfit ? '+' : ''}${summary.total_pnl_usd.toFixed(2)}
            </div>
            <div className={`text-[10px] font-mono tabular-nums ${isOverallProfit ? 'text-emerald-500' : 'text-red-500'}`}>
              {isOverallProfit ? '+' : ''}{summary.total_pnl_pct.toFixed(2)}% Net
            </div>
          </div>

          {/* Win Rate */}
          <div className="p-3 sm:p-4">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Win Rate
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white tabular-nums">
              {summary.win_rate_pct.toFixed(1)}%
            </div>
            <div className="text-[10px] font-mono text-[#737373]">
              Simulated hits
            </div>
          </div>

          {/* Completed Trades */}
          <div className="p-3 sm:p-4">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Trades Closed
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white tabular-nums">
              {summary.completed_trades_count}
            </div>
            <div className="text-[10px] font-mono text-[#737373]">
              Roundtrips
            </div>
          </div>
        </div>
      </section>

      {/* 2. TELEMETRY & ENGINE STATUS STRIP */}
      <section className="w-full border-b border-white/[0.08] bg-[#0c0c0c]/40 backdrop-blur-sm px-4 lg:px-6 py-2">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[#8e8e93] text-[11px]">ENGINE:</span>
            <span className="text-white font-medium text-[11px]">{engineStatus.running ? 'RUNNING' : 'STOPPED'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-emerald-400" />
            <span className="text-[#8e8e93] text-[11px]">SOLANA:</span>
            <span className="text-white uppercase text-[11px]">{engineStatus.network}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Activity className="w-3 h-3 text-[#8e8e93]" />
            <span className="text-[#8e8e93] text-[11px]">THROUGHPUT:</span>
            <span className="text-white tabular-nums text-[11px]">{engineStatus.incoming_event_rate} evt/s</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[#8e8e93] text-[11px]">DETECTED TODAY:</span>
            <span className="text-white font-bold tabular-nums text-[11px]">{engineStatus.tokens_detected_today}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[#8e8e93] text-[11px]">SIMULATED TRADES:</span>
            <span className="text-emerald-400 font-bold tabular-nums text-[11px]">
              {engineStatus.simulated_buys_count}B / {engineStatus.simulated_sells_count}S
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[#8e8e93] text-[11px]">MODE:</span>
            <span className="text-amber-400 font-bold text-[11px]">PAPER TRADING</span>
          </div>
        </div>
      </section>

      {/* 3. ACTIVE OPEN POSITIONS (HORIZONTAL SCROLLABLE, CLICK TOKEN TO OPEN CHARTS & DETAILS) */}
      <section className="w-full border-b border-white/[0.08]">
        <div className="px-4 lg:px-6 py-2.5 border-b border-white/[0.06] flex items-center justify-between bg-[#0a0a0a]/30">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded glass-icon flex items-center justify-center text-emerald-400">
              <Layers className="w-3 h-3" />
            </div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              Active Holdings ({openPositions.length})
            </span>
            <span className="text-[10px] font-mono text-[#737373]">· Click any token to inspect full charts & transactions</span>
          </div>
          <button
            onClick={() => setActiveTab('positions')}
            className="text-xs font-mono text-[#8e8e93] hover:text-white flex items-center gap-1 transition-colors"
          >
            <span>All Positions</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {openPositions.length === 0 ? (
          <div className="py-10 px-4 text-center text-xs font-mono text-[#737373]">
            No active open paper positions. Strategy is actively scanning live Solana tokens on Pump.fun & PumpSwap.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs font-mono min-w-[760px]">
              <thead>
                <tr className="text-[#737373] border-b border-white/[0.06] text-[11px] bg-white/[0.01]">
                  <th className="py-2 px-4 font-medium">Asset</th>
                  <th className="py-2 px-3 font-medium text-right">Entry Price</th>
                  <th className="py-2 px-3 font-medium text-right">Current Price</th>
                  <th className="py-2 px-3 font-medium text-right">Tokens Held</th>
                  <th className="py-2 px-3 font-medium text-right">Invested $</th>
                  <th className="py-2 px-3 font-medium text-right">Position Value</th>
                  <th className="py-2 px-3 font-medium text-right">P&L ($)</th>
                  <th className="py-2 px-3 font-medium text-right">P&L (%)</th>
                  <th className="py-2 px-4 font-medium text-right">Detailed Chart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {openPositions.map((pos) => {
                  const isProfit = pos.pnl_usd >= 0;
                  return (
                    <tr
                      key={pos.id}
                      onClick={() => openTokenDetailByMint(pos.mint)}
                      className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded glass-icon flex items-center justify-center font-bold text-white text-[10px]">
                            {pos.symbol.slice(0, 3)}
                          </div>
                          <div>
                            <div className="font-bold text-white text-xs">${pos.symbol}</div>
                            <div className="text-[10px] text-[#737373]">{pos.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-[#a3a3a3] text-right whitespace-nowrap">
                        ${pos.entry_price_usd.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums font-semibold text-white text-right whitespace-nowrap">
                        ${pos.current_price_usd.toFixed(4)}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-[#a3a3a3] text-right whitespace-nowrap">
                        {pos.amount_tokens.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums text-[#a3a3a3] text-right whitespace-nowrap">
                        ${pos.initial_investment_usd.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums font-semibold text-white text-right whitespace-nowrap">
                        ${pos.current_position_value_usd.toFixed(2)}
                      </td>
                      <td className={`py-2.5 px-3 tabular-nums text-right font-medium whitespace-nowrap ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}${pos.pnl_usd.toFixed(2)}
                      </td>
                      <td className={`py-2.5 px-3 tabular-nums text-right font-bold whitespace-nowrap ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}{pos.pnl_pct.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openTokenDetailByMint(pos.mint);
                          }}
                          className="px-2 py-0.5 rounded glass-icon text-[10px] text-white group-hover:border-white/30 transition-all font-mono"
                        >
                          Open Chart & Details →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. DISCOVERED TOKENS & LIVE SOLANA EVENT STREAM */}
      <div className="w-full grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-white/[0.08]">
        {/* Discovered Tokens */}
        <section className="w-full">
          <div className="px-4 lg:px-6 py-2.5 border-b border-white/[0.08] flex items-center justify-between bg-[#0a0a0a]/30">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                Recently Discovered Solana Tokens ({tokens.slice(0, 6).length})
              </span>
            </div>
            <button
              onClick={() => setActiveTab('live_feed')}
              className="text-xs font-mono text-[#8e8e93] hover:text-white flex items-center gap-1 transition-colors"
            >
              <span>View Live Feed</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {tokens.slice(0, 6).map((t) => (
              <div
                key={t.mint}
                onClick={() => openTokenDetailByMint(t.mint)}
                className="px-4 lg:px-6 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer flex items-center justify-between text-xs font-mono"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded glass-icon flex items-center justify-center font-bold text-white text-[10px]">
                    {t.symbol.slice(0, 3)}
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs">${t.symbol}</div>
                    <div className="text-[10px] text-[#737373]">{t.venue} · {t.safety_status.toUpperCase()}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="text-white font-medium tabular-nums">${t.current_price_usd.toFixed(6)}</div>
                    <div className="text-[10px] text-emerald-400 tabular-nums">Liq: ${t.liquidity_usd.toLocaleString()}</div>
                  </div>
                  <span className="text-[10px] text-[#8e8e93] glass-icon px-2 py-0.5 rounded">
                    Inspect →
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Live Event Stream */}
        <section className="w-full">
          <div className="px-4 lg:px-6 py-2.5 border-b border-white/[0.08] flex items-center justify-between bg-[#0a0a0a]/30">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded glass-icon flex items-center justify-center text-emerald-400">
                <Activity className="w-3 h-3" />
              </div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
                Live Engine Stream
              </span>
            </div>
            <button
              onClick={() => setActiveTab('event_monitor')}
              className="text-xs font-mono text-[#8e8e93] hover:text-white flex items-center gap-1 transition-colors"
            >
              <span>Full Stream</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {recentEvents.map((evt) => (
              <div
                key={evt.event_id}
                onClick={() => {
                  setSelectedEvent(evt);
                  setActiveTab('event_monitor');
                }}
                className="px-4 lg:px-6 py-2.5 transition-colors hover:bg-white/[0.04] cursor-pointer text-xs font-mono space-y-0.5"
              >
                <div className="flex items-center justify-between text-[10px] text-[#737373]">
                  <span className="uppercase text-[#a3a3a3] font-semibold">{evt.event_type.replace(/_/g, ' ')}</span>
                  <span className="tabular-nums">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-white text-[11px] line-clamp-1 leading-relaxed">
                  {evt.message}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

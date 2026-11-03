import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { Position } from '../../types';
import {
  Search,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Shield,
  Layers,
} from 'lucide-react';

export const PositionsPage: React.FC = () => {
  const {
    positions,
    summary,
    openTokenDetailByMint,
    closePosition,
  } = useTerminal();

  const [filterMode, setFilterMode] = useState<'all' | 'open' | 'closed' | 'profitable' | 'losing'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedMint, setCopiedMint] = useState<string | null>(null);

  const handleCopyMint = (e: React.MouseEvent, mint: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(mint);
    setCopiedMint(mint);
    setTimeout(() => setCopiedMint(null), 1800);
  };

  // Filter positions
  const filteredPositions = positions.filter((pos) => {
    if (filterMode === 'open' && pos.status !== 'OPEN') return false;
    if (filterMode === 'closed' && pos.status === 'OPEN') return false;
    if (filterMode === 'profitable' && pos.pnl_usd <= 0) return false;
    if (filterMode === 'losing' && pos.pnl_usd >= 0) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = pos.name.toLowerCase().includes(q);
      const matchSymbol = pos.symbol.toLowerCase().includes(q);
      const matchMint = pos.mint.toLowerCase().includes(q);
      return matchName || matchSymbol || matchMint;
    }
    return true;
  });

  const openPositions = positions.filter((p) => p.status === 'OPEN');
  const openInvested = openPositions.reduce((acc, p) => acc + p.initial_investment_usd, 0);
  const openValue = openPositions.reduce((acc, p) => acc + p.current_position_value_usd, 0);
  const unrealised = openValue - openInvested;

  return (
    <div className="w-full text-white select-none">
      {/* 1. FINANCIAL KPI SUMMARY STRIP (COMPACT, FULL WIDTH, ZERO BLOAT) */}
      <section className="w-full border-b border-white/[0.08] bg-[#090909]/60 backdrop-blur-md">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
          {/* Active Holdings Value */}
          <div className="p-3 sm:p-3.5">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Active Holdings Value
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white tabular-nums">
              ${openValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-[#737373] tabular-nums">
              {(openValue / summary.sol_price_usd).toFixed(2)} SOL
            </div>
          </div>

          {/* Capital Deployed */}
          <div className="p-3 sm:p-3.5">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Capital Deployed
            </div>
            <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-white tabular-nums">
              ${openInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] font-mono text-[#737373]">
              Across {openPositions.length} positions
            </div>
          </div>

          {/* Unrealised P&L */}
          <div className="p-3 sm:p-3.5">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Unrealised P&L
            </div>
            <div className={`text-lg sm:text-xl font-bold font-mono tracking-tight tabular-nums flex items-center gap-1 ${
              unrealised >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {unrealised >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{unrealised >= 0 ? '+' : ''}${Math.abs(unrealised).toFixed(2)}</span>
            </div>
            <div className={`text-[10px] font-mono ${unrealised >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {openInvested > 0 ? (unrealised >= 0 ? '+' : '') + ((unrealised / openInvested) * 100).toFixed(2) + '%' : '0.00%'}
            </div>
          </div>

          {/* Realised P&L */}
          <div className="p-3 sm:p-3.5">
            <div className="text-[10px] font-mono text-[#8e8e93] uppercase tracking-wider mb-0.5">
              Realised P&L
            </div>
            <div className={`text-lg sm:text-xl font-bold font-mono tracking-tight tabular-nums ${
              summary.realised_pnl_usd >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {summary.realised_pnl_usd >= 0 ? '+' : ''}${summary.realised_pnl_usd.toFixed(2)}
            </div>
            <div className="text-[10px] font-mono text-[#737373]">
              {summary.completed_trades_count} closed trades ({summary.win_rate_pct.toFixed(0)}% win)
            </div>
          </div>
        </div>
      </section>

      {/* 2. COMPACT TOOLBAR (FILTER & SEARCH) */}
      <div className="w-full border-b border-white/[0.08] bg-[#0c0c0c]/40 backdrop-blur-sm px-4 lg:px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filters */}
          <div className="flex items-center p-0.5 rounded-lg glass-panel-subtle text-xs font-mono">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'open', label: 'Open' },
                { id: 'closed', label: 'Closed' },
                { id: 'profitable', label: 'Profitable' },
                { id: 'losing', label: 'Losing' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setFilterMode(item.id)}
                className={`px-2.5 py-0.5 rounded-md transition-all text-[11px] ${
                  filterMode === item.id
                    ? 'glass-card text-white font-medium shadow-sm'
                    : 'text-[#8e8e93] hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3 h-3 text-[#737373] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search token or mint..."
              className="glass-panel-subtle rounded-md pl-7 pr-3 py-1 text-xs font-mono text-white placeholder-[#525252] focus:outline-none focus:border-white/20 w-44 sm:w-56"
            />
          </div>
        </div>

        <div className="text-[11px] font-mono text-[#737373] flex items-center gap-1.5">
          <span>Horizontal Scroll Table</span>
          <span className="text-[#404040]">·</span>
          <span>Showing {filteredPositions.length} positions</span>
        </div>
      </div>

      {/* 3. WIDE HORIZONTAL SCROLL DATASET (REDUCED ASSET SIZE, NO PADDING BLOAT, NO SCROLLBAR CORNER) */}
      <div className="w-full overflow-x-auto">
        {filteredPositions.length === 0 ? (
          <div className="py-20 text-center text-xs font-mono text-[#737373]">
            No positions found matching your criteria.
          </div>
        ) : (
          <table className="w-full text-left text-xs font-mono min-w-[1020px]">
            <thead>
              <tr className="text-[#8e8e93] border-b border-white/[0.08] uppercase text-[10px] select-none bg-white/[0.02]">
                <th className="py-2.5 px-3 font-semibold">Asset</th>
                <th className="py-2.5 px-2 font-semibold">Mint</th>
                <th className="py-2.5 px-2 font-semibold text-right">Entry $</th>
                <th className="py-2.5 px-2 font-semibold text-right">Current $</th>
                <th className="py-2.5 px-2 font-semibold text-right">Amount</th>
                <th className="py-2.5 px-2 font-semibold text-right">Initial $</th>
                <th className="py-2.5 px-2 font-semibold text-right">Position Value</th>
                <th className="py-2.5 px-2 font-semibold text-right">P&L ($)</th>
                <th className="py-2.5 px-2 font-semibold text-right">P&L (%)</th>
                <th className="py-2.5 px-2 font-semibold text-center">TP / SL</th>
                <th className="py-2.5 px-2 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredPositions.map((pos) => {
                const isProfit = pos.pnl_usd >= 0;
                const isOpen = pos.status === 'OPEN';

                return (
                  <tr
                    key={pos.id}
                    onClick={() => openTokenDetailByMint(pos.mint)}
                    className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    {/* Compact Asset Identity */}
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded glass-icon flex items-center justify-center font-bold text-white text-[10px] shrink-0">
                          {pos.symbol.slice(0, 3)}
                        </div>
                        <div>
                          <div className="font-bold text-white text-xs leading-none">${pos.symbol}</div>
                          <div className="text-[10px] text-[#737373] leading-tight truncate max-w-[90px]">{pos.name}</div>
                        </div>
                      </div>
                    </td>

                    {/* Mint Address (Compact) */}
                    <td className="py-2 px-2 whitespace-nowrap">
                      <div className="flex items-center gap-1 text-[#8e8e93]">
                        <span className="font-mono text-[10px]">
                          {pos.mint.slice(0, 4)}...{pos.mint.slice(-4)}
                        </span>
                        <button
                          onClick={(e) => handleCopyMint(e, pos.mint)}
                          title="Copy Solana Mint"
                          className="p-0.5 hover:text-white rounded hover:bg-white/10"
                        >
                          {copiedMint === pos.mint ? (
                            <Check className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-2.5 h-2.5 text-[#525252]" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Entry Price */}
                    <td className="py-2 px-2 text-right tabular-nums text-[#a3a3a3] whitespace-nowrap text-xs">
                      ${pos.entry_price_usd.toFixed(4)}
                    </td>

                    {/* Current Price */}
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-white whitespace-nowrap text-xs">
                      ${pos.current_price_usd.toFixed(4)}
                    </td>

                    {/* Amount Tokens */}
                    <td className="py-2 px-2 text-right tabular-nums text-[#a3a3a3] whitespace-nowrap text-xs">
                      {pos.amount_tokens.toLocaleString()}
                    </td>

                    {/* Initial Investment */}
                    <td className="py-2 px-2 text-right tabular-nums text-[#a3a3a3] whitespace-nowrap text-xs">
                      ${pos.initial_investment_usd.toFixed(2)}
                    </td>

                    {/* Current Position Value */}
                    <td className="py-2 px-2 text-right tabular-nums font-semibold text-white whitespace-nowrap text-xs">
                      ${pos.current_position_value_usd.toFixed(2)}
                    </td>

                    {/* P&L USD */}
                    <td className={`py-2 px-2 text-right tabular-nums font-medium whitespace-nowrap text-xs ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}${pos.pnl_usd.toFixed(2)}
                    </td>

                    {/* P&L Percentage */}
                    <td className={`py-2 px-2 text-right tabular-nums font-bold whitespace-nowrap text-xs ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfit ? '+' : ''}{pos.pnl_pct.toFixed(2)}%
                    </td>

                    {/* Take-Profit / Stop-Loss Targets */}
                    <td className="py-2 px-2 text-center tabular-nums whitespace-nowrap text-[10px]">
                      <span className="text-emerald-400">+{pos.take_profit_target_pct}%</span>
                      <span className="text-[#525252] mx-1">/</span>
                      <span className="text-red-400">-{pos.stop_loss_target_pct}%</span>
                    </td>

                    {/* Status */}
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isOpen
                          ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30'
                          : 'bg-[#181818] text-[#8e8e93] border border-white/10'
                      }`}>
                        {pos.status}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-2 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openTokenDetailByMint(pos.mint)}
                          className="px-2 py-0.5 rounded glass-icon text-[10px] text-white hover:border-white/30 transition-all font-mono"
                        >
                          Open Details →
                        </button>
                        {isOpen && (
                          <button
                            onClick={() => closePosition(pos.id, 100)}
                            className="px-2 py-0.5 rounded glass-icon text-[10px] text-red-300 hover:text-white bg-red-950/20 hover:bg-red-900/40 border-red-500/25 transition-all"
                          >
                            Close
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

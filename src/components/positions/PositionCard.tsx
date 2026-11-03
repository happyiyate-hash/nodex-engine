import React, { useState } from 'react';
import { Position } from '../../types';
import {
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Zap,
  Target,
  Clock,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';

export type CardSizeMode = 'compact' | 'standard' | 'expanded';

interface PositionCardProps {
  position: Position;
  cardSize?: CardSizeMode;
  onOpenDetail: (mint: string) => void;
  onClosePosition: (id: string, percentage: number) => void;
  isMobile?: boolean;
}

export const PositionCard: React.FC<PositionCardProps> = ({
  position,
  cardSize = 'standard',
  onOpenDetail,
  onClosePosition,
  isMobile = false,
}) => {
  const [copiedMint, setCopiedMint] = useState(false);
  const [confirmSell, setConfirmSell] = useState<number | null>(null);

  const isProfit = position.pnl_usd >= 0;
  const isOpen = position.status === 'OPEN';

  const handleCopyMint = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(position.mint);
    setCopiedMint(true);
    setTimeout(() => setCopiedMint(false), 1800);
  };

  const handleQuickClose = (e: React.MouseEvent, pct: number) => {
    e.stopPropagation();
    if (confirmSell === pct) {
      onClosePosition(position.id, pct);
      setConfirmSell(null);
    } else {
      setConfirmSell(pct);
      setTimeout(() => setConfirmSell(null), 3000);
    }
  };

  // Status badge styling
  const renderStatus = () => {
    if (position.status === 'OPEN') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          ACTIVE
        </span>
      );
    }
    if (position.status === 'TAKE_PROFIT') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
          TP EXIT (+{position.take_profit_target_pct}%)
        </span>
      );
    }
    if (position.status === 'STOP_LOSS') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-red-500/10 text-red-300 border border-red-500/20">
          SL EXIT (-{position.stop_loss_target_pct}%)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono text-[#8e8e93] bg-white/[0.04] border border-white/10">
        CLOSED
      </span>
    );
  };

  // --- 1. COMPACT CARD ---
  if (cardSize === 'compact' && !isMobile) {
    return (
      <div
        onClick={() => onOpenDetail(position.mint)}
        className="glass-card rounded-2xl p-4 cursor-pointer transition-all duration-200 group relative overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3">
          {/* Token Info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl glass-icon flex items-center justify-center font-mono font-bold text-white shrink-0">
              {position.symbol.slice(0, 3)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-sm font-mono truncate">${position.symbol}</span>
                {renderStatus()}
              </div>
              <div className="text-[11px] text-[#8e8e93] font-mono truncate">{position.name}</div>
            </div>
          </div>

          {/* Quick Financials */}
          <div className="text-right shrink-0 font-mono">
            <div className="text-sm font-bold text-white tabular-nums">
              ${position.current_position_value_usd.toFixed(2)}
            </div>
            <div className={`text-xs font-semibold tabular-nums ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
              {isProfit ? '+' : ''}${position.pnl_usd.toFixed(2)} ({isProfit ? '+' : ''}{position.pnl_pct.toFixed(2)}%)
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between text-[11px] font-mono text-[#737373]">
          <div>Entry: ${position.entry_price_usd.toFixed(4)}</div>
          <div className="text-white font-medium">Curr: ${position.current_price_usd.toFixed(4)}</div>
          {isOpen && (
            <button
              onClick={(e) => handleQuickClose(e, 100)}
              className="px-2 py-0.5 rounded-lg glass-icon text-[10px] text-red-300 hover:text-white hover:bg-red-950/40 border-red-500/20"
            >
              {confirmSell === 100 ? 'Confirm Close?' : 'Close'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // --- 2. EXPANDED CARD (Deep Institutional Desktop View) ---
  if (cardSize === 'expanded' && !isMobile) {
    return (
      <div
        onClick={() => onOpenDetail(position.mint)}
        className="glass-card rounded-2xl p-5 cursor-pointer transition-all duration-200 group relative space-y-4"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl glass-icon flex items-center justify-center font-mono font-bold text-base text-white shrink-0 shadow-inner">
              {position.symbol.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base font-mono tracking-tight">${position.symbol}</span>
                <span className="text-[10px] font-mono text-[#737373] uppercase tracking-wider">{position.venue}</span>
                {renderStatus()}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-xs font-mono text-[#8e8e93]">
                <span>{position.name}</span>
                <span>·</span>
                <span className="text-[11px] text-[#737373]">
                  {position.mint.slice(0, 4)}...{position.mint.slice(-4)}
                </span>
                <button
                  onClick={handleCopyMint}
                  title="Copy Mint Address"
                  className="p-1 rounded-md glass-icon text-[#737373] hover:text-white transition-colors"
                >
                  {copiedMint ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>

          {/* Large P&L Pill */}
          <div className="text-right font-mono">
            <div className={`text-xl font-bold tabular-nums tracking-tight ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
              {isProfit ? '+' : ''}${position.pnl_usd.toFixed(2)}
            </div>
            <div className={`text-xs font-semibold tabular-nums ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
              {isProfit ? '+' : ''}{position.pnl_pct.toFixed(2)}% Net
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-2.5 p-3 rounded-xl glass-panel-subtle font-mono text-xs">
          <div>
            <div className="text-[10px] text-[#737373] uppercase">Position Value</div>
            <div className="font-bold text-white tabular-nums text-sm mt-0.5">
              ${position.current_position_value_usd.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#525252]">
              {position.amount_tokens.toLocaleString()} tokens
            </div>
          </div>

          <div>
            <div className="text-[10px] text-[#737373] uppercase">Invested Capital</div>
            <div className="font-medium text-[#d4d4d8] tabular-nums text-sm mt-0.5">
              ${position.initial_investment_usd.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#525252]">
              {position.initial_investment_sol.toFixed(2)} SOL
            </div>
          </div>

          <div>
            <div className="text-[10px] text-[#737373] uppercase">Entry Price</div>
            <div className="font-medium text-[#d4d4d8] tabular-nums text-sm mt-0.5">
              ${position.entry_price_usd.toFixed(5)}
            </div>
            <div className="text-[10px] text-[#525252]">
              {new Date(position.entry_time).toLocaleTimeString()}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-[#737373] uppercase">Current Price</div>
            <div className="font-bold text-white tabular-nums text-sm mt-0.5">
              ${position.current_price_usd.toFixed(5)}
            </div>
            <div className="text-[10px] text-emerald-400 flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" />
              <span>Live Tick</span>
            </div>
          </div>
        </div>

        {/* Stop Loss / Take Profit Target Progress Bar */}
        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex items-center justify-between text-[11px] text-[#737373]">
            <span className="text-red-400">SL Target: -{position.stop_loss_target_pct}%</span>
            <span className="text-emerald-400">TP Target: +{position.take_profit_target_pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden flex">
            <div
              className={`h-full ${isProfit ? 'bg-emerald-400' : 'bg-red-400'} rounded-full transition-all`}
              style={{
                width: `${Math.min(100, Math.max(8, (Math.abs(position.pnl_pct) / position.take_profit_target_pct) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
          <div className="text-[11px] font-mono text-[#737373] flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span>Entered {new Date(position.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className="flex items-center gap-2">
            {isOpen ? (
              <>
                <button
                  onClick={(e) => handleQuickClose(e, 50)}
                  className="px-3 py-1.5 rounded-xl glass-icon text-xs font-mono text-white hover:border-white/30 transition-all"
                >
                  {confirmSell === 50 ? 'Confirm 50%?' : 'Sell 50%'}
                </button>
                <button
                  onClick={(e) => handleQuickClose(e, 100)}
                  className="px-3 py-1.5 rounded-xl glass-icon text-xs font-mono font-medium text-red-300 hover:text-white bg-red-950/20 hover:bg-red-900/40 border-red-500/25 transition-all"
                >
                  {confirmSell === 100 ? 'Confirm 100%?' : 'Close 100%'}
                </button>
              </>
            ) : (
              <span className="text-xs font-mono text-[#737373]">Position Settled</span>
            )}

            <button
              onClick={() => onOpenDetail(position.mint)}
              className="p-1.5 rounded-xl glass-icon text-[#8e8e93] hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 3. STANDARD CLEAN CARD (Default for Desktop & Fluid Mobile) ---
  return (
    <div
      onClick={() => onOpenDetail(position.mint)}
      className="glass-card rounded-2xl p-4 sm:p-5 cursor-pointer transition-all duration-200 group relative space-y-3.5"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl glass-icon flex items-center justify-center font-mono font-bold text-white shrink-0 text-sm shadow-inner">
            {position.symbol.slice(0, 3)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base font-mono tracking-tight truncate">${position.symbol}</span>
              {renderStatus()}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-xs font-mono text-[#8e8e93] truncate">
              <span className="truncate">{position.name}</span>
              <span>·</span>
              <span className="text-[#737373]">{position.mint.slice(0, 4)}...{position.mint.slice(-4)}</span>
              <button
                onClick={handleCopyMint}
                title="Copy Solana Mint"
                className="p-0.5 hover:text-white text-[#737373]"
              >
                {copiedMint ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* Current Position Value */}
        <div className="text-right font-mono shrink-0">
          <div className="text-base sm:text-lg font-bold text-white tabular-nums tracking-tight">
            ${position.current_position_value_usd.toFixed(2)}
          </div>
          <div className={`text-xs font-semibold tabular-nums flex items-center justify-end gap-1 ${
            isProfit ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {isProfit ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{isProfit ? '+' : ''}${position.pnl_usd.toFixed(2)} ({isProfit ? '+' : ''}{position.pnl_pct.toFixed(2)}%)</span>
          </div>
        </div>
      </div>

      {/* Financial Details Row */}
      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl glass-panel-subtle font-mono text-xs text-center">
        <div>
          <div className="text-[10px] text-[#737373] uppercase">Entry</div>
          <div className="text-white font-medium tabular-nums mt-0.5">${position.entry_price_usd.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#737373] uppercase">Current</div>
          <div className="text-white font-semibold tabular-nums mt-0.5">${position.current_price_usd.toFixed(4)}</div>
        </div>
        <div>
          <div className="text-[10px] text-[#737373] uppercase">Initial $</div>
          <div className="text-[#a3a3a3] font-medium tabular-nums mt-0.5">${position.initial_investment_usd.toFixed(2)}</div>
        </div>
      </div>

      {/* Target Progress Bar */}
      <div className="space-y-1 font-mono text-[10px]">
        <div className="flex items-center justify-between text-[#737373]">
          <span>SL: -{position.stop_loss_target_pct}%</span>
          <span>TP: +{position.take_profit_target_pct}%</span>
        </div>
        <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden flex">
          <div
            className={`h-full ${isProfit ? 'bg-emerald-400' : 'bg-red-400'} rounded-full transition-all`}
            style={{
              width: `${Math.min(100, Math.max(8, (Math.abs(position.pnl_pct) / position.take_profit_target_pct) * 100))}%`,
            }}
          />
        </div>
      </div>

      {/* Card Footer with Quick Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]" onClick={(e) => e.stopPropagation()}>
        <div className="text-[11px] font-mono text-[#737373]">
          Venue: <span className="text-[#a3a3a3] uppercase">{position.venue}</span>
        </div>

        <div className="flex items-center gap-2">
          {isOpen ? (
            <>
              <button
                onClick={(e) => handleQuickClose(e, 50)}
                className="px-2.5 py-1 rounded-xl glass-icon text-[11px] font-mono text-white hover:border-white/30 transition-all"
              >
                {confirmSell === 50 ? 'Confirm 50%?' : 'Sell 50%'}
              </button>
              <button
                onClick={(e) => handleQuickClose(e, 100)}
                className="px-2.5 py-1 rounded-xl glass-icon text-[11px] font-mono font-medium text-red-300 hover:text-white bg-red-950/20 hover:bg-red-900/40 border-red-500/25 transition-all"
              >
                {confirmSell === 100 ? 'Confirm Close?' : 'Close'}
              </button>
            </>
          ) : (
            <button
              onClick={() => onOpenDetail(position.mint)}
              className="px-2.5 py-1 rounded-xl glass-icon text-[11px] font-mono text-[#a3a3a3] hover:text-white transition-all flex items-center gap-1"
            >
              <span>Inspect</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

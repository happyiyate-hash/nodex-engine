import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { Search, Copy, Check, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { OverviewPage } from './OverviewPage';

type LiveSection = 'stream' | 'detected' | 'positions';

export const LiveFeedPage: React.FC = () => {
  const { tokens, positions, openTokenDetailByMint } = useTerminal();
  const [section, setSection] = useState<LiveSection>('stream');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedMint, setCopiedMint] = useState<string | null>(null);

  const filteredTokens = tokens.filter((token) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return token.name.toLowerCase().includes(query) ||
      token.symbol.toLowerCase().includes(query) ||
      token.mint.toLowerCase().includes(query) ||
      token.creator_wallet.toLowerCase().includes(query);
  });

  const filteredPositions = positions.filter((position) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return position.name.toLowerCase().includes(query) ||
      position.symbol.toLowerCase().includes(query) ||
      position.mint.toLowerCase().includes(query);
  });

  const copyMint = async (event: React.MouseEvent, mint: string) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(mint);
      setCopiedMint(mint);
      window.setTimeout(() => setCopiedMint(null), 1600);
    } catch {
      setCopiedMint(null);
    }
  };

  const safety = (status: string) => {
    if (status === 'verified') return <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400"><ShieldCheck className="h-3 w-3" /> SAFE</span>;
    if (status === 'warning') return <span className="inline-flex items-center gap-1 text-[9px] text-amber-400"><ShieldAlert className="h-3 w-3" /> WARNING</span>;
    return <span className="inline-flex items-center gap-1 text-[9px] text-red-400"><ShieldX className="h-3 w-3" /> HIGH RISK</span>;
  };

  const qualification = (status: string) => {
    const styles: Record<string, string> = {
      qualified: 'text-emerald-400',
      bought_paper: 'text-emerald-300',
      under_analysis: 'text-amber-300',
      rejected: 'text-red-400',
      newly_detected: 'text-white/45',
    };
    const labels: Record<string, string> = {
      qualified: 'APPROVED',
      bought_paper: 'PAPER ENTRY',
      under_analysis: 'SCANNING',
      rejected: 'REJECTED',
      newly_detected: 'DETECTED',
    };
    return <span className={`text-[9px] font-semibold tracking-wide ${styles[status] || 'text-white/45'}`}>{labels[status] || status.replace(/_/g, ' ').toUpperCase()}</span>;
  };

  return (
    <main className="flex min-h-full w-full flex-col bg-[#080808] text-white">
      <div className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#080808]/95 px-3 pb-2 pt-3 backdrop-blur-xl sm:px-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-semibold tracking-wide">Live</div>
          <div className="text-[9px] tabular-nums text-white/35">
            {section === 'stream' ? tokens.length : section === 'positions' ? positions.length : 'LIVE'}
          </div>
        </div>
        <nav aria-label="Live sections" className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-[#0d0d0d] p-1">
          {([
            ['stream', 'Stream'],
            ['detected', 'Detection'],
            ['positions', 'Position'],
          ] as [LiveSection, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setSection(value); setSearchQuery(''); }}
              aria-current={section === value ? 'page' : undefined}
              className={`rounded-lg px-2 py-2 text-[10px] font-semibold transition-all ${section === value ? 'bg-[#242424] text-white shadow-sm' : 'text-white/40 hover:text-white/75'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        {(section === 'stream' || section === 'positions') && (
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={section === 'stream' ? 'Search token or mint' : 'Search positions'}
              className="h-9 w-full rounded-lg border border-white/[0.07] bg-[#101010] pl-9 pr-3 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-white/20"
            />
          </div>
        )}
      </div>

      {section === 'detected' ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <OverviewPage />
        </div>
      ) : section === 'positions' ? (
        <div className="flex-1 px-3 pb-5 pt-2 sm:px-5">
          {filteredPositions.length === 0 ? (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-[#0d0d0d] px-4 text-center">
              <p className="text-[11px] font-medium text-white/65">{searchQuery ? 'No matching positions' : 'No positions yet'}</p>
              <p className="mt-1 text-[9px] text-white/30">Confirmed paper entries will appear here.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredPositions.map((position) => {
                const profitable = position.pnl_usd >= 0;
                return (
                  <article
                    key={position.id}
                    onClick={() => openTokenDetailByMint(position.mint)}
                    className="cursor-pointer rounded-xl border border-white/[0.07] bg-[#101010] px-2.5 py-2 transition-colors hover:border-white/[0.13]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.09] bg-[#242424]">
                        <span className="text-[11px] font-semibold text-white/75">{String(position.symbol || position.name).replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-[11px] font-semibold text-white">{position.name}</span>
                          <span className="shrink-0 text-[8px] font-medium text-white/40">${position.symbol}</span>
                        </div>
                        <div className="mt-0.5 text-[8px] text-white/35">{position.amount_tokens.toLocaleString('en-US', { maximumFractionDigits: 2 })} tokens · {position.status === 'OPEN' ? 'OPEN POSITION' : 'CLOSED'}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={`text-[16px] font-bold leading-none tracking-tight tabular-nums ${profitable ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>{profitable ? '+' : '−'}${Math.abs(position.pnl_usd).toFixed(2)}</div>
                        <div className={`mt-1 text-[9px] font-semibold tabular-nums ${profitable ? 'text-[#83b982]/80' : 'text-[#c77b7b]/80'}`}>{position.pnl_pct >= 0 ? '+' : ''}{position.pnl_pct.toFixed(2)}%</div>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/[0.055] pt-2 text-[8px]">
                      <div><div className="text-white/30">Entry</div><div className="mt-0.5 font-medium tabular-nums text-white/75">${position.entry_price_usd.toFixed(6)}</div></div>
                      <div><div className="text-white/30">Current</div><div className="mt-0.5 font-medium tabular-nums text-white/75">${position.current_price_usd.toFixed(6)}</div></div>
                      <div><div className="text-white/30">Value</div><div className="mt-0.5 font-medium tabular-nums text-white/75">${position.current_position_value_usd.toFixed(2)}</div></div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[8px] text-white/35">
                      <span>{position.status}</span>
                      <span className="text-white/45">Open token details ↗</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 px-3 pb-5 pt-2 sm:px-5">
          {filteredTokens.length === 0 ? (
            <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-[#0d0d0d] px-4 text-center">
              <p className="text-[11px] font-medium text-white/65">{searchQuery ? 'No matching tokens' : 'Waiting for live tokens'}</p>
              <p className="mt-1 text-[9px] text-white/30">{searchQuery ? 'Try another name, symbol, or mint address.' : 'New discoveries will appear here automatically.'}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredTokens.map((token) => (
                <article key={token.mint} onClick={() => openTokenDetailByMint(token.mint)} className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-white/[0.06] bg-[#101010] px-2.5 py-2 transition-colors hover:border-white/[0.12] hover:bg-[#141414]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#202020] text-[10px] font-semibold text-white/75">{token.symbol.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[11px] font-semibold text-white">{token.name}</span>
                      <span className="shrink-0 text-[9px] text-white/35">${token.symbol}</span>
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-2">
                      {qualification(token.qualification_status)}
                      <span className="truncate text-[8px] text-white/25">{token.venue}</span>
                      {safety(token.safety_status)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] font-medium tabular-nums text-white">${token.current_price_usd.toFixed(6)}</div>
                    <div className="mt-1 text-[8px] tabular-nums text-white/35">MC ${token.market_cap_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                  </div>
                  <button type="button" onClick={(event) => copyMint(event, token.mint)} aria-label="Copy mint address" className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/75">
                    {copiedMint === token.mint ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
};

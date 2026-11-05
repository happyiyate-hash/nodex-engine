import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { Search, Copy, Check, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

export const LiveFeedPage: React.FC = () => {
  const { tokens, openTokenDetailByMint } = useTerminal();
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
    <main className="min-h-full w-full bg-[#080808] px-3 pb-5 pt-3 text-white sm:px-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[13px] font-semibold tracking-wide text-white">Live</h1>
          <p className="mt-0.5 text-[9px] text-white/35">New token activity</p>
        </div>
        <div className="shrink-0 text-[9px] tabular-nums text-white/40">{filteredTokens.length} TOKENS</div>
      </header>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search token or mint"
          className="h-9 w-full rounded-lg border border-white/[0.07] bg-[#101010] pl-9 pr-3 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-white/20"
        />
      </div>

      {filteredTokens.length === 0 ? (
        <div className="flex min-h-36 flex-col items-center justify-center rounded-lg border border-white/[0.06] bg-[#0d0d0d] px-4 text-center">
          <p className="text-[11px] font-medium text-white/65">{searchQuery ? 'No matching tokens' : 'Waiting for live tokens'}</p>
          <p className="mt-1 text-[9px] text-white/30">{searchQuery ? 'Try another name, symbol, or mint address.' : 'New discoveries will appear here automatically.'}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredTokens.map((token) => (
            <article
              key={token.mint}
              onClick={() => openTokenDetailByMint(token.mint)}
              className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg border border-white/[0.06] bg-[#101010] px-2.5 py-2 transition-colors hover:border-white/[0.12] hover:bg-[#141414]"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-[#202020] text-[10px] font-semibold text-white/75">
                {token.symbol.slice(0, 2).toUpperCase()}
              </div>
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
              <button
                type="button"
                onClick={(event) => copyMint(event, token.mint)}
                aria-label="Copy mint address"
                className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/75"
              >
                {copiedMint === token.mint ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
};

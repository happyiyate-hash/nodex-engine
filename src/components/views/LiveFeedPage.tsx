import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { DiscoveredToken, QualificationStatus, SafetyRating, Venue } from '../../types';
import {
  Search,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Flame,
  ArrowUpDown,
  ShoppingBag,
} from 'lucide-react';

export const LiveFeedPage: React.FC = () => {
  const {
    tokens,
    launches,
    settings,
    openTokenDetailByMint,
    executeManualPaperBuy,
  } = useTerminal();

  const [searchQuery, setSearchQuery] = useState('');
  const [venueFilter, setVenueFilter] = useState<'ALL' | Venue>('ALL');
  const [qualFilter, setQualFilter] = useState<'ALL' | QualificationStatus>('ALL');
  const [safetyFilter, setSafetyFilter] = useState<'ALL' | SafetyRating>('ALL');
  const [copiedMint, setCopiedMint] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'launch_time' | 'liquidity_usd' | 'bonding_curve_progress_pct'>('launch_time');
  const [sortAsc, setSortAsc] = useState(false);

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopiedMint(text);
    setTimeout(() => setCopiedMint(null), 1800);
  };

  const filteredTokens = tokens.filter((t) => {
    if (venueFilter !== 'ALL' && t.venue !== venueFilter) return false;
    if (qualFilter !== 'ALL' && t.qualification_status !== qualFilter) return false;
    if (safetyFilter !== 'ALL' && t.safety_status !== safetyFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = t.name.toLowerCase().includes(q);
      const matchSymbol = t.symbol.toLowerCase().includes(q);
      const matchMint = t.mint.toLowerCase().includes(q);
      const matchCreator = t.creator_wallet.toLowerCase().includes(q);
      return matchName || matchSymbol || matchMint || matchCreator;
    }
    return true;
  });

  const sortedTokens = [...filteredTokens].sort((a, b) => {
    if (sortField === 'liquidity_usd') {
      return sortAsc ? a.liquidity_usd - b.liquidity_usd : b.liquidity_usd - a.liquidity_usd;
    }
    if (sortField === 'bonding_curve_progress_pct') {
      return sortAsc
        ? a.bonding_curve_progress_pct - b.bonding_curve_progress_pct
        : b.bonding_curve_progress_pct - a.bonding_curve_progress_pct;
    }
    const timeA = new Date(a.launch_time).getTime();
    const timeB = new Date(b.launch_time).getTime();
    return sortAsc ? timeA - timeB : timeB - timeA;
  });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const renderSafetyBadge = (status: SafetyRating) => {
    switch (status) {
      case 'verified':
        return (
          <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>VERIFIED</span>
          </span>
        );
      case 'warning':
        return (
          <span className="flex items-center gap-1 text-amber-400 font-mono text-[11px]">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>WARNING</span>
          </span>
        );
      case 'danger':
      default:
        return (
          <span className="flex items-center gap-1 text-red-400 font-mono text-[11px]">
            <ShieldX className="w-3.5 h-3.5" />
            <span>HIGH RISK</span>
          </span>
        );
    }
  };

  const renderQualBadge = (status: QualificationStatus) => {
    switch (status) {
      case 'bought_paper':
        return (
          <span className="px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-medium">
            BOUGHT PAPER
          </span>
        );
      case 'qualified':
        return (
          <span className="px-2 py-0.5 rounded bg-cyan-950/50 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-medium">
            QUALIFIED
          </span>
        );
      case 'under_analysis':
        return (
          <span className="px-2 py-0.5 rounded bg-[#1e1e1e] text-[#a3a3a3] border border-white/10 text-[10px] font-mono">
            ANALYZING
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2 py-0.5 rounded bg-red-950/40 text-red-300 border border-red-800/40 text-[10px] font-mono">
            REJECTED
          </span>
        );
      case 'newly_detected':
      default:
        return (
          <span className="px-2 py-0.5 rounded bg-[#1a1a1a] text-white border border-white/10 text-[10px] font-mono">
            NEW
          </span>
        );
    }
  };

  return (
    <div className="w-full text-white select-none">
      {/* 1. Header Strip (Full Width) */}
      <div className="w-full border-b border-white/[0.08] bg-[#090909]/60 backdrop-blur-md px-4 lg:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-mono font-bold text-white tracking-wide uppercase">
              Live Token Discovery Feed
            </h1>
            <span className="text-[10px] font-mono text-emerald-400 font-semibold glass-icon px-2 py-0.5 rounded-full">
              RUST BACKEND STREAM
            </span>
          </div>
          <p className="text-[11px] font-mono text-[#737373] mt-0.5">
            Live Pump.fun launch records from the Rust backend. Market metrics and full token dossiers are not yet exposed.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search mint, symbol, dev wallet..."
            className="glass-panel-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-white placeholder-[#525252] focus:outline-none focus:border-white/20 w-full sm:w-64"
          />
        </div>
      </div>

      <section className="px-4 lg:px-6 py-4 border-b border-white/[0.08] bg-[#0b0b0b]/40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">Confirmed launch records</h2>
          <span className="text-[10px] font-mono text-[#737373]">{launches.length} records loaded</span>
        </div>
        {launches.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-[#737373]">
            No launch records received yet. This list populates from the backend database and live launch events.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] font-mono">
              <thead className="text-[#737373] uppercase border-b border-white/[0.08]">
                <tr><th className="py-2 pr-3">Mint address</th><th className="py-2 px-3">Creator</th><th className="py-2 px-3">Source</th><th className="py-2 px-3">Slot</th><th className="py-2 px-3">Detected</th><th className="py-2 pl-3 text-right">Transaction</th></tr>
              </thead>
              <tbody>
                {launches.map((launch) => (
                  <tr key={launch.id} className="border-b border-white/[0.05] hover:bg-white/[0.02]">
                    <td className="py-2.5 pr-3 text-white break-all max-w-[240px]">{launch.mint_address}</td>
                    <td className="py-2.5 px-3 text-[#a3a3a3] break-all max-w-[180px]">{launch.creator_address || 'Not supplied'}</td>
                    <td className="py-2.5 px-3 text-[#a3a3a3]">{launch.source}</td>
                    <td className="py-2.5 px-3 tabular-nums text-[#a3a3a3]">{launch.slot.toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-[#a3a3a3] whitespace-nowrap">{new Date(launch.detected_at).toLocaleString()}</td>
                    <td className="py-2.5 pl-3 text-right"><a className="text-cyan-400 hover:text-white" href={`https://solscan.io/tx/${launch.signature}`} target="_blank" rel="noopener noreferrer">View TX ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. Filter Bar (Full Width) */}
      <div className="w-full border-b border-white/[0.08] bg-[#0c0c0c]/40 backdrop-blur-sm px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          {/* Venue filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#737373] text-[11px] uppercase">Venue:</span>
            <div className="flex items-center p-0.5 rounded-lg glass-panel-subtle">
              {(['ALL', 'pump.fun', 'raydium', 'pumpswap'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVenueFilter(v)}
                  className={`px-2 py-0.5 rounded-md text-[11px] transition-all ${
                    venueFilter === v ? 'glass-card text-white font-medium shadow-sm' : 'text-[#8e8e93] hover:text-white'
                  }`}
                >
                  {v === 'ALL' ? 'All Venues' : v}
                </button>
              ))}
            </div>
          </div>

          {/* Qualification status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[#737373] text-[11px] uppercase">Strategy:</span>
            <div className="flex items-center p-0.5 rounded-lg glass-panel-subtle">
              {(['ALL', 'qualified', 'bought_paper', 'rejected', 'under_analysis'] as const).map((q) => (
                <button
                  key={q}
                  onClick={() => setQualFilter(q)}
                  className={`px-2 py-0.5 rounded-md text-[11px] transition-all ${
                    qualFilter === q ? 'glass-card text-white font-medium shadow-sm' : 'text-[#8e8e93] hover:text-white'
                  }`}
                >
                  {q === 'ALL' ? 'All' : q.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Total found */}
        <div className="text-[#737373] text-xs tabular-nums">
          Showing <span className="text-white font-bold">{sortedTokens.length}</span> tokens
        </div>
      </div>

      {/* 3. Full-Width Edge-to-Edge Data Table (Directly on Main Background) */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="text-[#8e8e93] bg-white/[0.02] border-b border-white/[0.08] uppercase text-[11px] select-none">
              <th className="py-3 px-4 font-semibold">Token / Mint</th>
              <th className="py-3 px-3 font-semibold">Creator Wallet</th>
              <th
                className="py-3 px-3 font-semibold cursor-pointer hover:text-white"
                onClick={() => toggleSort('launch_time')}
              >
                <div className="flex items-center gap-1">
                  <span>Age / Launch</span>
                  <ArrowUpDown className="w-3 h-3 text-[#525252]" />
                </div>
              </th>
              <th className="py-3 px-3 font-semibold text-right">Price (USD)</th>
              <th className="py-3 px-3 font-semibold text-right">Market Cap</th>
              <th
                className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-white"
                onClick={() => toggleSort('liquidity_usd')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Liquidity</span>
                  <ArrowUpDown className="w-3 h-3 text-[#525252]" />
                </div>
              </th>
              <th className="py-3 px-3 font-semibold text-right">5m Volume</th>
              <th className="py-3 px-3 font-semibold text-center">Buys / Sells</th>
              <th
                className="py-3 px-3 font-semibold text-right cursor-pointer hover:text-white"
                onClick={() => toggleSort('bonding_curve_progress_pct')}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Bonding Curve</span>
                  <ArrowUpDown className="w-3 h-3 text-[#525252]" />
                </div>
              </th>
              <th className="py-3 px-3 font-semibold">Venue</th>
              <th className="py-3 px-3 font-semibold">Safety</th>
              <th className="py-3 px-3 font-semibold">Strategy</th>
              <th className="py-3 px-4 font-semibold text-right">Quick Buy</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {sortedTokens.map((t) => {
              const launchAgoSec = Math.floor((Date.now() - new Date(t.launch_time).getTime()) / 1000);
              const isRecent = launchAgoSec < 120;

              return (
                <tr
                  key={t.mint}
                  onClick={() => openTokenDetailByMint(t.mint)}
                  className="hover:bg-white/[0.04] transition-colors cursor-pointer group"
                >
                  {/* Token identity */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg glass-icon flex items-center justify-center font-bold text-white text-[11px] relative">
                        {t.symbol.slice(0, 3)}
                        {isRecent && (
                          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-black" />
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-1.5">
                          <span>${t.symbol}</span>
                          {t.bonding_curve_progress_pct >= 85 && (
                            <span className="flex items-center text-amber-400 text-[10px]" title="Near Raydium Migration!">
                              <Flame className="w-3 h-3 fill-amber-400" />
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#737373] truncate max-w-[110px]">{t.name}</div>
                      </div>
                    </div>
                  </td>

                  {/* Creator */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <div className="flex items-center gap-1 text-[#8e8e93] text-[11px]">
                      <span>{t.creator_wallet.slice(0, 4)}...{t.creator_wallet.slice(-4)}</span>
                      <button
                        onClick={(e) => handleCopy(e, t.creator_wallet)}
                        title="Copy creator address"
                        className="p-1 hover:text-white rounded hover:bg-white/10"
                      >
                        {copiedMint === t.creator_wallet ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-[#525252]" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Launch age */}
                  <td className="py-3.5 px-3 whitespace-nowrap text-[#a3a3a3] tabular-nums">
                    {launchAgoSec < 60
                      ? `${launchAgoSec}s ago`
                      : `${Math.floor(launchAgoSec / 60)}m ${launchAgoSec % 60}s ago`}
                  </td>

                  {/* Current price */}
                  <td className="py-3.5 px-3 text-right tabular-nums font-semibold text-white whitespace-nowrap">
                    ${t.current_price_usd.toFixed(6)}
                  </td>

                  {/* Market cap */}
                  <td className="py-3.5 px-3 text-right tabular-nums text-[#a3a3a3] whitespace-nowrap">
                    ${t.market_cap_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>

                  {/* Liquidity */}
                  <td className="py-3.5 px-3 text-right tabular-nums text-white whitespace-nowrap font-medium">
                    ${t.liquidity_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>

                  {/* Volume */}
                  <td className="py-3.5 px-3 text-right tabular-nums text-[#a3a3a3] whitespace-nowrap">
                    ${t.volume_5m_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>

                  {/* Buys / Sells */}
                  <td className="py-3.5 px-3 text-center tabular-nums whitespace-nowrap text-[11px]">
                    <span className="text-emerald-400 font-semibold">{t.tx_buys_5m}</span>
                    <span className="text-[#525252] mx-1">/</span>
                    <span className="text-red-400">{t.tx_sells_5m}</span>
                  </td>

                  {/* Bonding curve */}
                  <td className="py-3.5 px-3 text-right tabular-nums whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-14 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            t.bonding_curve_progress_pct > 80
                              ? 'bg-amber-400'
                              : 'bg-emerald-400'
                          }`}
                          style={{ width: `${Math.min(100, t.bonding_curve_progress_pct)}%` }}
                        />
                      </div>
                      <span className="text-white font-medium text-[11px]">
                        {t.bonding_curve_progress_pct.toFixed(0)}%
                      </span>
                    </div>
                  </td>

                  {/* Venue */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] glass-icon font-mono uppercase text-[#a3a3a3]">
                      {t.venue}
                    </span>
                  </td>

                  {/* Safety */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    {renderSafetyBadge(t.safety_status)}
                  </td>

                  {/* Strategy */}
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    {renderQualBadge(t.qualification_status)}
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => executeManualPaperBuy(t.mint, 0.5)}
                      title="Simulate 0.5 SOL Paper Buy"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg glass-icon text-xs text-white hover:border-emerald-500/40 hover:text-emerald-400 transition-all font-mono"
                    >
                      <ShoppingBag className="w-3 h-3 text-emerald-400" />
                      <span>Buy 0.5S</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

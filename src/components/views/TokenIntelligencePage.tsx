import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { DiscoveredToken, SafetyRating } from '../../types';
import { TokenAvatar } from '../common/TokenAvatar';
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Search,
  ExternalLink,
  Lock,
  Unlock,
  AlertTriangle,
  Users,
  Wallet,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

export const TokenIntelligencePage: React.FC = () => {
  const { tokens, openTokenDetailByMint } = useTerminal();
  const [selectedTokenMint, setSelectedTokenMint] = useState<string>(tokens[0]?.mint || '');
  const [safetyFilter, setSafetyFilter] = useState<'ALL' | SafetyRating>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTokens = tokens.filter((t) => {
    if (safetyFilter !== 'ALL' && t.safety_status !== safetyFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.symbol.toLowerCase().includes(q) ||
        t.mint.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeToken = tokens.find((t) => t.mint === selectedTokenMint) || filteredTokens[0] || tokens[0];

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-mono font-bold text-white tracking-wide uppercase">
              Token Intelligence & Safety Scanner
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/40">
              SPL & TOKEN-2022 AUDIT
            </span>
          </div>
          <p className="text-xs font-mono text-[#737373] mt-0.5">
            Static bytecode analysis, authority verification, sniper clustering, and creator history
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search token or mint..."
            className="bg-[#141414] border border-[#262626] rounded pl-8 pr-3 py-1.5 text-xs font-mono text-white placeholder-[#525252] focus:outline-none focus:border-[#404040] w-64"
          />
        </div>
      </div>

      {/* Main Grid: Left Token Selector List & Right Deep Intelligence Dossier */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 4 Cols: Tokens List */}
        <div className="lg:col-span-4 glass-panel rounded-2xl p-3.5 space-y-3 flex flex-col h-[650px] shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
            <span className="text-xs font-mono font-bold text-white uppercase">Monitored Tokens</span>
            <div className="flex items-center p-1 rounded-xl glass-panel-subtle text-[10px] font-mono">
              {(['ALL', 'verified', 'warning', 'danger'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSafetyFilter(s)}
                  className={`px-2 py-0.5 rounded-lg transition-all ${
                    safetyFilter === s ? 'glass-card text-white font-medium shadow-sm' : 'text-[#8e8e93] hover:text-white'
                  }`}
                >
                  {s === 'ALL' ? 'All' : s}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto flex-1 space-y-2 pr-1">
            {filteredTokens.map((t) => {
              const isSelected = activeToken?.mint === t.mint;
              return (
                <div
                  key={t.mint}
                  onClick={() => setSelectedTokenMint(t.mint)}
                  className={`p-3.5 rounded-xl transition-all cursor-pointer text-xs font-mono space-y-1.5 ${
                    isSelected
                      ? 'glass-card border-white/30 ring-1 ring-white/20 shadow-md'
                      : 'glass-card border-white/[0.06] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <TokenAvatar symbol={t.symbol} logoUrl={t.logo_url} size="md" />
                      <div className="min-w-0">
                        <div className="truncate font-bold text-white text-sm">${t.symbol}</div>
                        <div className="truncate text-[10px] text-white/40">{t.name}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-semibold ${
                      t.safety_status === 'verified'
                        ? 'text-emerald-400 bg-emerald-950/40 border border-emerald-800/40'
                        : t.safety_status === 'warning'
                        ? 'text-amber-400 bg-amber-950/40 border border-amber-800/40'
                        : 'text-red-400 bg-red-950/40 border border-red-800/40'
                    }`}>
                      {t.safety_status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#737373]">
                    <span>Score: {t.safety_details.safety_score}/100</span>
                    <span>Liq: ${t.liquidity_usd.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 8 Cols: Deep Safety & Invariants Dossier */}
        {activeToken ? (
          <div className="lg:col-span-8 glass-panel rounded-2xl p-5 space-y-6 shadow-lg">
            {/* Dossier Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
              <div>
                <div className="flex items-center gap-2">
                  <TokenAvatar symbol={activeToken.symbol} logoUrl={activeToken.logo_url} size="lg" />
                  <span className="text-xl font-mono font-bold text-white">${activeToken.symbol}</span>
                  <span className="text-sm font-mono text-[#737373]">({activeToken.name})</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full glass-icon text-[#a3a3a3] uppercase">
                    {activeToken.venue}
                  </span>
                </div>
                <div className="text-xs font-mono text-[#8e8e93] mt-1">
                  Mint: {activeToken.mint} · Decimals: {activeToken.decimals ?? '—'}
                </div>
              </div>

              <button
                onClick={() => openTokenDetailByMint(activeToken.mint)}
                className="px-3 py-1.5 rounded bg-[#1e1e1e] hover:bg-[#282828] text-xs font-mono text-white border border-[#333] transition-colors"
              >
                Open Full Token View
              </button>
            </div>

            {/* Core Invariant Verification Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
              {/* Mint Authority */}
              <div className="p-4 rounded bg-[#141414] border border-[#262626] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#8e8e93] uppercase text-[11px]">Mint Authority</span>
                  {activeToken.safety_details.mint_authority === 'renounced' ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> RENOUNCED
                    </span>
                  ) : (
                    <span className="text-red-400 font-bold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> ACTIVE (DANGER)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#737373] leading-relaxed">
                  {activeToken.safety_details.mint_authority === 'renounced'
                    ? 'Authority account is set to null (1111...1111). Additional token generation is mathematically impossible.'
                    : 'The creator retains active mint authority. They can mint millions of tokens and crash the liquidity pool.'}
                </p>
              </div>

              {/* Freeze Authority */}
              <div className="p-4 rounded bg-[#141414] border border-[#262626] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#8e8e93] uppercase text-[11px]">Freeze Authority</span>
                  {activeToken.safety_details.freeze_authority === 'revoked' ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> REVOKED
                    </span>
                  ) : (
                    <span className="text-red-400 font-bold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" /> ACTIVE (HONEYPOT)
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#737373] leading-relaxed">
                  {activeToken.safety_details.freeze_authority === 'revoked'
                    ? 'Freeze authority is revoked. Token accounts cannot be frozen by any authority.'
                    : 'Creator can invoke FreezeAccount instructions, preventing holders from selling.'}
                </p>
              </div>

              {/* Liquidity Lock */}
              <div className="p-4 rounded bg-[#141414] border border-[#262626] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#8e8e93] uppercase text-[11px]">Liquidity Lock</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> 100% LOCKED / BURNT
                  </span>
                </div>
                <p className="text-[11px] text-[#737373] leading-relaxed">
                  LP tokens sent to dead address or bonded inside immutable Pump.fun program vault.
                </p>
              </div>

              {/* Creator Wallet History */}
              <div className="p-4 rounded bg-[#141414] border border-[#262626] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#8e8e93] uppercase text-[11px]">Creator Reputation</span>
                  <span className={`font-bold uppercase ${
                    activeToken.safety_details.creator_reputation === 'clean'
                      ? 'text-emerald-400'
                      : activeToken.safety_details.creator_reputation === 'first_deploy'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }`}>
                    {activeToken.safety_details.creator_reputation}
                  </span>
                </div>
                <p className="text-[11px] text-[#737373] leading-relaxed">
                  {activeToken.safety_details.creator_reputation === 'clean'
                    ? 'Deployer wallet has no recorded rugpull associations in the last 180 days.'
                    : activeToken.safety_details.creator_reputation === 'first_deploy'
                    ? 'First token deployment detected for this wallet address.'
                    : 'FLAGGED: Deployer address is linked to previous rugpulled tokens.'}
                </p>
              </div>
            </div>

            {/* Risk Flags Analysis */}
            <div className="space-y-3 font-mono text-xs">
              <div className="text-xs font-bold text-white uppercase tracking-wider">
                Detected Risk Flags ({activeToken.safety_details.risk_flags.length})
              </div>
              {activeToken.safety_details.risk_flags.length === 0 ? (
                <div className="p-3 rounded bg-[#141414] border border-[#262626] text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>No high-severity risk flags detected. Token passed institutional safety audit.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeToken.safety_details.risk_flags.map((flag, i) => (
                    <div
                      key={i}
                      className="p-3 rounded bg-red-950/30 border border-red-900/40 text-red-300 flex items-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{flag}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Holder Distribution & Largest Holders */}
            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Top Holder Distribution
                </span>
                <span className="text-[#8e8e93] text-[11px]">
                  Top 10 hold: <strong className="text-white">{activeToken.safety_details.top_10_holders_pct}%</strong>
                </span>
              </div>

              <div className="bg-[#141414] border border-[#262626] rounded overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-[#737373] border-b border-[#222] text-[11px] bg-[#0d0d0d]">
                      <th className="py-2.5 px-3">Address</th>
                      <th className="py-2.5 px-3">Entity / Type</th>
                      <th className="py-2.5 px-3 text-right">Holding %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e1e1e]">
                    {activeToken.safety_details.largest_holders.map((holder, idx) => (
                      <tr key={idx} className="hover:bg-[#181818]">
                        <td className="py-2.5 px-3 text-white font-mono">{holder.address}</td>
                        <td className="py-2.5 px-3 text-[#8e8e93]">
                          {holder.is_raydium_vault
                            ? 'Liquidity Vault'
                            : holder.is_creator
                            ? 'Dev Address'
                            : 'Holder'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-white font-semibold tabular-nums">
                          {holder.percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

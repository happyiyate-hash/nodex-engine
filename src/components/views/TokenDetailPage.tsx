import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { ArrowLeft, Copy, Check, ExternalLink, ShieldCheck, ShieldAlert } from 'lucide-react';

const usd = (value: number, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—';
const number = (value: number, digits = 2) => Number.isFinite(value)
  ? value.toLocaleString('en-US', { maximumFractionDigits: digits })
  : '—';
const short = (value: string) => value ? value.slice(0, 6) + '…' + value.slice(-6) : 'Unavailable';

export const TokenDetailPage: React.FC = () => {
  const { selectedToken, closeTokenDetail, positions } = useTerminal();
  const [copied, setCopied] = useState(false);
  if (!selectedToken) return null;

  const token = selectedToken;
  const safety = token.safety_details;
  const position = positions.find((item) => item.mint === token.mint && item.status === 'OPEN');
  const tone = token.safety_status === 'verified' ? 'text-emerald-400' : token.safety_status === 'danger' ? 'text-red-400' : 'text-amber-400';

  const copyMint = async () => {
    try {
      await navigator.clipboard.writeText(token.mint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const metrics = [
    ['Market cap', usd(token.market_cap_usd, 0)],
    ['Liquidity', usd(token.liquidity_usd, 0)],
    ['5m volume', usd(token.volume_5m_usd, 0)],
    ['Buys / sells', number(token.tx_buys_5m, 0) + ' / ' + number(token.tx_sells_5m, 0)],
    ['Bonding curve', number(token.bonding_curve_progress_pct, 1) + '%'],
    ['Venue', token.venue],
  ];
  const checks = [
    ['Mint authority', safety.mint_authority === 'renounced' ? 'Renounced' : safety.mint_authority === 'active' ? 'Active' : 'Unavailable'],
    ['Freeze authority', safety.freeze_authority === 'revoked' ? 'Revoked' : safety.freeze_authority === 'active' ? 'Active' : 'Unavailable'],
    ['Top 10 holders', number(safety.top_10_holders_pct, 1) + '%'],
    ['Developer holding', number(safety.dev_holding_pct, 1) + '%'],
    ['Liquidity lock', safety.liquidity_locked ? number(safety.liquidity_locked_pct, 1) + '% locked' : 'Not confirmed'],
    ['Honeypot risk', safety.honeypot_risk === 'none' ? 'None detected' : safety.honeypot_risk === 'high' ? 'High' : safety.honeypot_risk === 'low' ? 'Low' : 'Unavailable'],
  ];

  return (
    <main className="h-full min-h-0 w-full overflow-y-auto bg-[#080808] text-white">
      <header className="sticky top-0 z-30 w-full bg-[#080808]/65 backdrop-blur-2xl">
        <div className="flex h-11 items-center px-4 sm:px-6">
          <button type="button" onClick={closeTokenDetail} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/[0.1] hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" /> Go back
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-6">
        <section className="grid gap-4 rounded-xl border border-white/[0.08] bg-[#101010] p-4 sm:grid-cols-[1fr_auto] sm:items-end sm:p-5">
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">Token overview</div>
            <div className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">{usd(token.current_price_usd, 6)}</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/45">
              <span>Mint: {short(token.mint)}</span>
              <span>Creator: {short(token.creator_wallet)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className={'rounded-md border border-white/[0.09] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider ' + tone}>{token.safety_status}</span>
            <span className="rounded-md border border-white/[0.09] px-2.5 py-1.5 text-[10px] text-white/55">{token.qualification_status.replace(/_/g, ' ')}</span>
          </div>
        </section>

        {position && (
          <section className="overflow-hidden rounded-xl border border-emerald-500/20 bg-[#0d1511]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/10 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Open paper position</div>
              <span className={'text-xs font-semibold tabular-nums ' + (position.pnl_usd >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {position.pnl_usd >= 0 ? '+' : ''}{usd(position.pnl_usd)} ({position.pnl_pct >= 0 ? '+' : ''}{number(position.pnl_pct)}%)
              </span>
            </div>
            <div className="grid grid-cols-2 divide-x divide-y divide-white/[0.06] sm:grid-cols-4 sm:divide-y-0">
              {[
                ['Tokens held', number(position.amount_tokens, 4)],
                ['Invested', usd(position.initial_investment_usd)],
                ['Entry price', usd(position.entry_price_usd, 6)],
                ['Position value', usd(position.current_position_value_usd)],
              ].map(([label, value]) => <div key={label} className="px-4 py-3"><div className="text-[10px] text-white/40">{label}</div><div className="mt-1 text-sm font-semibold tabular-nums">{value}</div></div>)}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2.5 text-xs font-semibold text-white/75">Market data</div>
          <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/[0.08] bg-[#101010] sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map(([label, value]) => <div key={label} className="min-w-0 border-b border-r border-white/[0.06] px-3 py-3 last:border-r-0"><div className="text-[10px] text-white/40">{label}</div><div className="mt-1 truncate text-sm font-medium tabular-nums">{value}</div></div>)}
          </div>
        </section>

        <section>
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <div className="text-xs font-semibold text-white/75">Security checks</div>
            {safety.safety_score > 0 ? (
              <div className={'flex items-center gap-1.5 text-xs font-semibold ' + tone}>
                {token.safety_status === 'verified' ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                Score {number(safety.safety_score, 0)}/100
              </div>
            ) : <span className="text-[10px] text-white/35">No completed security score</span>}
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
            {checks.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 bg-[#101010] px-3.5 py-3"><span className="text-xs text-white/50">{label}</span><span className="text-xs font-medium text-white/75">{value}</span></div>)}
          </div>
          {safety.risk_flags.length > 0 && <div className="mt-3 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3.5 py-3"><div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Risk flags</div><ul className="space-y-1">{safety.risk_flags.map((flag, index) => <li key={flag + index} className="text-xs text-white/65">• {flag}</li>)}</ul></div>}
        </section>
      </div>
    </main>
  );
};

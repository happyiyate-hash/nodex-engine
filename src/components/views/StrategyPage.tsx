import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { StrategyConfig } from '../../types';
import {
  Cpu,
  Save,
  Check,
  AlertCircle,
  Sliders,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  History,
} from 'lucide-react';

export const StrategyPage: React.FC = () => {
  const {
    strategyConfig,
    strategyDecisions,
    saveStrategyConfig,
    openTokenDetailByMint,
  } = useTerminal();

  const [form, setForm] = useState<StrategyConfig>({ ...strategyConfig });
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleChange = (key: keyof StrategyConfig, value: number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSavedSuccess(false);
    setErrorMessage(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    // Validation
    if (form.min_liquidity_usd < 1000) {
      setErrorMessage('Minimum liquidity must be at least $1,000.');
      setIsSaving(false);
      return;
    }
    if (form.stop_loss_pct <= 0 || form.take_profit_pct <= 0) {
      setErrorMessage('Stop loss and take profit targets must be greater than 0%.');
      setIsSaving(false);
      return;
    }

    try {
      const ok = await saveStrategyConfig(form);
      if (ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch {
      setErrorMessage('Failed to communicate with Axum strategy endpoint.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-[#262626]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-mono font-bold text-white tracking-wide uppercase">
              Strategy & Risk Engine Configuration
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-600/30">
              PAPER TRADING RULES
            </span>
          </div>
          <p className="text-xs font-mono text-[#737373] mt-0.5">
            Define automated qualification thresholds, risk envelopes, and stop targets sent to NodeX Rust core
          </p>
        </div>

        {/* Status notification */}
        {savedSuccess && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 text-xs font-mono">
            <Check className="w-3.5 h-3.5" />
            <span>Rules saved & deployed to Axum Engine</span>
          </div>
        )}
        {errorMessage && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-red-950/40 border border-red-700/50 text-red-300 text-xs font-mono">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Strategy Form */}
      <form onSubmit={handleSave} className="glass-panel rounded-2xl p-5 space-y-6 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#8e8e93]" />
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              Qualification & Risk Invariants (PUT /api/v1/strategy)
            </span>
          </div>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-xs font-mono font-bold transition-all disabled:opacity-50 shadow-md"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Deploying...' : 'Deploy Strategy Rules'}</span>
          </button>
        </div>

        {/* 10 Configurable Fields Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs font-mono">
          {/* Minimum Liquidity */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Minimum Liquidity ($)</label>
            <input
              type="number"
              value={form.min_liquidity_usd}
              onChange={(e) => handleChange('min_liquidity_usd', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-[#737373]">Tokens with liquidity below this are rejected</span>
          </div>

          {/* Maximum Entry Price */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Maximum Entry Price ($)</label>
            <input
              type="number"
              step="0.001"
              value={form.max_entry_price_usd}
              onChange={(e) => handleChange('max_entry_price_usd', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-[#737373]">Upper price cap for micro-cap entries</span>
          </div>

          {/* Max Investment Per Token */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Max Investment Per Token (SOL)</label>
            <input
              type="number"
              step="0.1"
              value={form.max_investment_per_token_sol}
              onChange={(e) => handleChange('max_investment_per_token_sol', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-[#737373]">Allocated paper position size per buy</span>
          </div>

          {/* Max Simultaneous Positions */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Max Simultaneous Positions</label>
            <input
              type="number"
              value={form.max_simultaneous_positions}
              onChange={(e) => handleChange('max_simultaneous_positions', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-[#737373]">Safety cap on concurrent open positions</span>
          </div>

          {/* Minimum Safety Score */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Minimum Safety Score (0-100)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={form.min_safety_score}
              onChange={(e) => handleChange('min_safety_score', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-[#737373]">Calculated from mint, freeze, snipers, honeypot</span>
          </div>

          {/* Maximum Slippage */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Maximum Slippage (%)</label>
            <input
              type="number"
              step="0.1"
              value={form.max_slippage_pct}
              onChange={(e) => handleChange('max_slippage_pct', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-[#737373]">Max allowable price impact during execution</span>
          </div>

          {/* Stop Loss */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Stop Loss Target (%)</label>
            <input
              type="number"
              step="0.5"
              value={form.stop_loss_pct}
              onChange={(e) => handleChange('stop_loss_pct', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-red-400">Auto market-sell trigger if price drops below this</span>
          </div>

          {/* Take Profit */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Take Profit Target (%)</label>
            <input
              type="number"
              step="0.5"
              value={form.take_profit_pct}
              onChange={(e) => handleChange('take_profit_pct', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-emerald-400">Target exit threshold for simulated profits</span>
          </div>

          {/* Minimum Buy Activity */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Min 5m Buy Volume ($)</label>
            <input
              type="number"
              value={form.min_5m_buy_volume_usd}
              onChange={(e) => handleChange('min_5m_buy_volume_usd', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-[#737373]">Ensures organic momentum before entering</span>
          </div>

          {/* Max Holder Concentration */}
          <div className="space-y-1.5">
            <label className="text-[#a3a3a3] uppercase text-[11px]">Max Top 10 Concentration (%)</label>
            <input
              type="number"
              step="0.5"
              value={form.max_top10_holder_concentration_pct}
              onChange={(e) => handleChange('max_top10_holder_concentration_pct', Number(e.target.value))}
              className="w-full glass-panel-subtle rounded-xl px-3 py-2 text-white focus:outline-none focus:border-white/20"
            />
            <span className="text-[10px] text-[#737373]">Rejects tokens where top 10 wallets hold more</span>
          </div>
        </div>

        {/* Automation Toggles */}
        <div className="pt-4 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl glass-panel-subtle">
            <input
              type="checkbox"
              checked={form.auto_buy_enabled}
              onChange={(e) => handleChange('auto_buy_enabled', e.target.checked)}
              className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0 w-4 h-4"
            />
            <div className="text-xs font-mono">
              <div className="text-white font-medium">Automated Paper Buys</div>
              <div className="text-[10px] text-[#737373]">Auto-execute when token meets all criteria</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl glass-panel-subtle">
            <input
              type="checkbox"
              checked={form.trailing_stop_enabled}
              onChange={(e) => handleChange('trailing_stop_enabled', e.target.checked)}
              className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0 w-4 h-4"
            />
            <div className="text-xs font-mono">
              <div className="text-white font-medium">Trailing Stop Loss</div>
              <div className="text-[10px] text-[#737373]">Lock in gains as price appreciates</div>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl glass-panel-subtle">
            <input
              type="checkbox"
              checked={form.blacklist_creators_with_prior_rugs}
              onChange={(e) => handleChange('blacklist_creators_with_prior_rugs', e.target.checked)}
              className="rounded bg-black/40 border-white/20 text-emerald-500 focus:ring-0 w-4 h-4"
            />
            <div className="text-xs font-mono">
              <div className="text-white font-medium">Blacklist Known Ruggers</div>
              <div className="text-[10px] text-[#737373]">Block wallets linked to past scams</div>
            </div>
          </label>
        </div>
      </form>

      {/* Recent Strategy Decisions Ledger */}
      <section className="glass-panel rounded-2xl p-5 space-y-4 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#8e8e93]" />
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              Recent Strategy Qualification Decisions
            </h2>
          </div>
          <span className="text-xs font-mono text-[#737373]">
            Audit log of why tokens were accepted or rejected
          </span>
        </div>

        <div className="space-y-3">
          {strategyDecisions.map((dec) => {
            const isAccepted = dec.outcome === 'ACCEPTED';
            return (
              <div
                key={dec.id}
                className="p-4 rounded-xl glass-card space-y-3 font-mono text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#1e1e1e]">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${
                      isAccepted
                        ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50'
                        : 'bg-red-950/40 text-red-300 border-red-700/50'
                    }`}>
                      {dec.outcome}
                    </span>
                    <button
                      onClick={() => openTokenDetailByMint(dec.token_mint)}
                      className="font-bold text-white hover:underline text-sm"
                    >
                      ${dec.token_symbol}
                    </button>
                    <span className="text-[#737373] text-[11px]">
                      ({dec.token_mint.slice(0, 6)}...{dec.token_mint.slice(-4)})
                    </span>
                  </div>

                  <span className="text-[#737373] text-[11px] tabular-nums">
                    {new Date(dec.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                {/* Explanation text */}
                <div className="space-y-1">
                  <div className="text-[#a3a3a3] text-[11px] font-medium">Decision Summary:</div>
                  <ul className="list-disc list-inside text-[#737373] text-[11px] space-y-0.5">
                    {dec.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>

                {/* Condition checks table */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 pt-1 text-[11px]">
                  {dec.checks.map((chk, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded border ${
                        chk.passed
                          ? 'bg-[#181818] border-[#292929] text-[#a3a3a3]'
                          : 'bg-red-950/20 border-red-900/30 text-red-300'
                      }`}
                    >
                      <div className="text-[10px] text-[#737373] truncate">{chk.name}</div>
                      <div className="font-semibold tabular-nums mt-0.5 text-white">{chk.actual}</div>
                      <div className="text-[9px] text-[#525252]">{chk.required}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

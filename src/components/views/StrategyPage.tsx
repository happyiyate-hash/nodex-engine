import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { StrategyConfig } from '../../types';
import {
  AlertCircle, ChevronDown, History, ShieldCheck, SlidersHorizontal,
  TrendingDown, TrendingUp, X,
} from 'lucide-react';

type RiskTarget = 'stop_loss_pct' | 'take_profit_pct';

const stopLossOptions = [5, 10, 15, 20, 25, 30];
const takeProfitOptions = [10, 20, 30, 50, 75, 100];

const NumberField = ({
  label, suffix, value, onChange, hint, step = '1',
}: {
  label: string; suffix?: string; value: number; onChange: (value: number) => void;
  hint?: string; step?: string;
}) => (
  <label className="block min-w-0">
    <span className="mb-2 block text-[11px] font-medium text-white/65">{label}</span>
    <span className="flex h-11 items-center rounded-xl border border-white/[0.09] bg-[#101010] px-3 focus-within:border-white/25">
      <input
        type="number" min="0" step={step} value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold tabular-nums text-white outline-none"
      />
      {suffix && <span className="ml-2 shrink-0 text-[11px] text-white/35">{suffix}</span>}
    </span>
    {hint && <span className="mt-1.5 block text-[10px] leading-relaxed text-white/35">{hint}</span>}
  </label>
);

const ToggleRow = ({
  title, detail, checked, onChange,
}: {
  title: string; detail: string; checked: boolean; onChange: (checked: boolean) => void;
}) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
    <span className="min-w-0">
      <span className="block text-[12px] font-medium text-white/85">{title}</span>
      <span className="mt-0.5 block text-[10px] leading-relaxed text-white/40">{detail}</span>
    </span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
    <span className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-white' : 'bg-white/15'}`}>
      <span className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${checked ? 'left-[21px] bg-black' : 'left-[3px] bg-white/75'}`} />
    </span>
  </label>
);

export const StrategyPage: React.FC = () => {
  const { strategyConfig, strategyDecisions, openTokenDetailByMint } = useTerminal();
  const [form, setForm] = useState<StrategyConfig>({ ...strategyConfig });
  const [customTarget, setCustomTarget] = useState<RiskTarget | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [draftNotice, setDraftNotice] = useState(false);

  const update = (key: keyof StrategyConfig, value: number | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
    setDraftNotice(true);
  };

  const openCustom = (target: RiskTarget) => {
    setCustomTarget(target);
    setCustomValue(String(form[target] || ''));
  };

  const applyCustom = () => {
    const value = Number(customValue);
    if (!Number.isFinite(value) || value <= 0 || value > 1000) return;
    if (customTarget) update(customTarget, value);
    setCustomTarget(null);
  };

  const targetCard = (
    target: RiskTarget,
    title: string,
    description: string,
    options: number[],
    Icon: typeof TrendingDown,
    tone: 'loss' | 'profit',
  ) => {
    const value = form[target];
    const enabled = value > 0;
    const isLoss = tone === 'loss';
    return (
      <section className="min-w-0 rounded-2xl border border-white/[0.09] bg-[#0d0d0d] p-4">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${isLoss ? 'bg-rose-500/[0.10] text-rose-300' : 'bg-emerald-500/[0.10] text-emerald-300'}`}>
            <Icon className="h-[19px] w-[19px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-white">{title}</h3>
              <label className="flex shrink-0 cursor-pointer items-center gap-2">
                <span className="text-[10px] text-white/40">{enabled ? 'On' : 'Off'}</span>
                <input
                  type="checkbox" checked={enabled}
                  onChange={(event) => update(target, event.target.checked ? (isLoss ? 10 : 25) : 0)}
                  className="peer sr-only"
                />
                <span className={`relative h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-white' : 'bg-white/15'}`}>
                  <span className={`absolute top-[2px] size-4 rounded-full transition-all ${enabled ? 'left-[19px] bg-black' : 'left-[2px] bg-white/70'}`} />
                </span>
              </label>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-white/40">{description}</p>
          </div>
        </div>
        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-[30px] font-semibold leading-none tracking-tight tabular-nums text-white">{enabled ? value : '—'}</span>
          <span className="text-[13px] text-white/45">%</span>
          <span className="ml-auto text-[10px] text-white/35">{enabled ? 'Target selected' : 'Disabled'}</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {options.map((option) => (
            <button
              key={option} type="button" disabled={!enabled}
              onClick={() => update(target, option)}
              className={`h-9 rounded-lg border text-[11px] font-semibold tabular-nums transition-colors disabled:opacity-35 ${value === option ? (isLoss ? 'border-rose-300/50 bg-rose-400/15 text-rose-200' : 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200') : 'border-white/[0.08] bg-white/[0.025] text-white/65'}`}
            >
              {option}%
            </button>
          ))}
        </div>
        <button
          type="button" disabled={!enabled} onClick={() => openCustom(target)}
          className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.13] text-[11px] font-medium text-white/60 disabled:opacity-35"
        >
          Custom percentage <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </section>
    );
  };

  return (
    <div className="w-full space-y-5 pb-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Paper trading</p>
          <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-white">Strategy & risk</h2>
        </div>
        <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1 text-[9px] font-medium text-amber-200/80">Draft settings</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {targetCard('stop_loss_pct', 'Stop loss', 'Close a simulated position when it falls by this percentage from entry.', stopLossOptions, TrendingDown, 'loss')}
        {targetCard('take_profit_pct', 'Take profit', 'Close a simulated position when profit reaches this percentage.', takeProfitOptions, TrendingUp, 'profit')}
      </div>

      <section className="w-full rounded-2xl border border-white/[0.09] bg-[#0d0d0d] p-4">
        <div className="mb-4 flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-white/55" />
          <div>
            <h3 className="text-[13px] font-semibold text-white">Entry & position limits</h3>
            <p className="mt-0.5 text-[10px] text-white/35">Define which launches qualify and how much each paper entry can use.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <NumberField label="Minimum liquidity" suffix="USD" value={form.min_liquidity_usd} onChange={(v) => update('min_liquidity_usd', v)} />
          <NumberField label="Maximum entry price" suffix="USD" step="0.000001" value={form.max_entry_price_usd} onChange={(v) => update('max_entry_price_usd', v)} />
          <NumberField label="Paper position size" suffix="SOL" step="0.01" value={form.max_investment_per_token_sol} onChange={(v) => update('max_investment_per_token_sol', v)} />
          <NumberField label="Maximum open positions" value={form.max_simultaneous_positions} onChange={(v) => update('max_simultaneous_positions', Math.floor(v))} />
        </div>
      </section>

      <section className="w-full rounded-2xl border border-white/[0.09] bg-[#0d0d0d] p-4">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-white/55" />
          <div>
            <h3 className="text-[13px] font-semibold text-white">Token safety filters</h3>
            <p className="mt-0.5 text-[10px] text-white/35">Qualification thresholds applied before a paper entry.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <NumberField label="Minimum safety score" suffix="/ 100" value={form.min_safety_score} onChange={(v) => update('min_safety_score', Math.min(100, v))} />
          <NumberField label="Maximum slippage" suffix="%" step="0.1" value={form.max_slippage_pct} onChange={(v) => update('max_slippage_pct', v)} />
          <NumberField label="Minimum 5m buy volume" suffix="USD" value={form.min_5m_buy_volume_usd} onChange={(v) => update('min_5m_buy_volume_usd', v)} />
          <NumberField label="Maximum top-10 concentration" suffix="%" step="0.5" value={form.max_top10_holder_concentration_pct} onChange={(v) => update('max_top10_holder_concentration_pct', v)} />
        </div>
      </section>

      <section className="w-full divide-y divide-white/[0.07] rounded-2xl border border-white/[0.09] bg-[#0d0d0d] px-4">
        <div className="py-3.5">
          <h3 className="text-[13px] font-semibold text-white">Automation</h3>
          <p className="mt-0.5 text-[10px] text-white/35">Optional paper-trading behaviour.</p>
        </div>
        <ToggleRow title="Automated paper buys" detail="Open a simulated position when all qualification rules pass." checked={form.auto_buy_enabled} onChange={(v) => update('auto_buy_enabled', v)} />
        <ToggleRow title="Trailing stop loss" detail="Raise the exit threshold as an open position gains value." checked={form.trailing_stop_enabled} onChange={(v) => update('trailing_stop_enabled', v)} />
        {form.trailing_stop_enabled && (
          <div className="pb-3">
            <NumberField label="Trailing callback" suffix="%" step="0.5" value={form.trailing_stop_callback_pct} onChange={(v) => update('trailing_stop_callback_pct', v)} />
          </div>
        )}
        <ToggleRow title="Blacklist known rug creators" detail="Reject launches linked to creators with prior rug activity." checked={form.blacklist_creators_with_prior_rugs} onChange={(v) => update('blacklist_creators_with_prior_rugs', v)} />
      </section>

      <div className="flex items-start gap-2 px-1 text-[10px] leading-relaxed text-white/35">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>These are editable draft values in this screen. Backend strategy persistence is not connected yet, so they are not deployed to the Rust engine.</p>
      </div>

      <section className="w-full border-t border-white/[0.08] pt-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-white/45" />
          <h3 className="text-[12px] font-semibold text-white">Recent qualification decisions</h3>
        </div>
        {strategyDecisions.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-white/35">No strategy decisions recorded yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {strategyDecisions.map((decision) => (
              <button key={decision.id} type="button" onClick={() => openTokenDetailByMint(decision.token_mint)} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-white/85">${decision.token_symbol} · {decision.outcome}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-white/40">{decision.reasons.join(' · ')}</span>
                </span>
                <span className="shrink-0 text-[10px] tabular-nums text-white/35">{new Date(decision.timestamp).toLocaleTimeString()}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {customTarget && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCustomTarget(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="custom-target-title" className="w-full max-w-lg rounded-t-3xl border border-white/[0.12] bg-[#111] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 id="custom-target-title" className="text-[15px] font-semibold text-white">Custom {customTarget === 'stop_loss_pct' ? 'stop loss' : 'take profit'}</h3>
                <p className="mt-1 text-[10px] text-white/40">Enter a target percentage.</p>
              </div>
              <button type="button" onClick={() => setCustomTarget(null)} aria-label="Close custom percentage" className="grid size-9 place-items-center rounded-full bg-white/[0.07] text-white/70"><X className="h-4 w-4" /></button>
            </div>
            <label className="block">
              <span className="mb-2 block text-[10px] text-white/45">Percentage</span>
              <span className="flex h-14 items-center rounded-xl border border-white/[0.12] bg-black px-4">
                <input autoFocus type="number" min="0.1" max="1000" step="0.1" value={customValue} onChange={(event) => setCustomValue(event.target.value)} placeholder="Enter percentage" className="min-w-0 flex-1 bg-transparent text-[22px] font-semibold tabular-nums text-white outline-none placeholder:text-white/20" />
                <span className="text-[16px] text-white/45">%</span>
              </span>
            </label>
            <button type="button" onClick={applyCustom} disabled={!Number.isFinite(Number(customValue)) || Number(customValue) <= 0 || Number(customValue) > 1000} className="mt-4 h-12 w-full rounded-xl bg-white text-[12px] font-semibold text-black disabled:opacity-35">Apply target</button>
          </section>
        </div>
      )}
      {draftNotice && <span className="sr-only" aria-live="polite">Draft settings changed.</span>}
    </div>
  );
};

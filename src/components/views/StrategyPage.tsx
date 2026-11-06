import React, { useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { StrategyConfig } from '../../types';
import {
  AlertCircle, Check, ChevronDown, History, ShieldCheck, SlidersHorizontal,
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
  <label className="block min-w-0 border-b border-white/[0.07] py-3">
    <span className="mb-2 block text-[11px] font-medium text-white/60">{label}</span>
    <span className="flex h-10 items-center border-b border-white/[0.14] focus-within:border-white/50">
      <input
        type="number" min="0" step={step} value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium tabular-nums text-white outline-none"
      />
      {suffix && <span className="ml-2 shrink-0 text-[11px] text-white/40">{suffix}</span>}
    </span>
    {hint && <span className="mt-1.5 block text-[10px] leading-relaxed text-white/35">{hint}</span>}
  </label>
);

const ToggleRow = ({
  title, detail, checked, onChange,
}: {
  title: string; detail: string; checked: boolean; onChange: (checked: boolean) => void;
}) => (
  <label className="flex cursor-pointer items-center justify-between gap-4 border-b border-white/[0.07] py-3">
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
  const [activeTarget, setActiveTarget] = useState<RiskTarget | null>(null);
  const [customValue, setCustomValue] = useState('');

  const update = (key: keyof StrategyConfig, value: number | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const openTarget = (target: RiskTarget) => {
    setActiveTarget(target);
    setCustomValue(form[target] > 0 ? String(form[target]) : '');
  };

  const applyCustom = () => {
    const value = Number(customValue);
    if (!Number.isFinite(value) || value <= 0 || value > 1000 || !activeTarget) return;
    update(activeTarget, value);
    setActiveTarget(null);
  };

  const targetRow = (
    target: RiskTarget,
    title: string,
    _description: string,
    Icon: typeof TrendingDown,
    tone: 'loss' | 'profit',
  ) => {
    const value = form[target];
    const enabled = value > 0;
    const isLoss = tone === 'loss';
    return (
      <button
        type="button"
        onClick={() => openTarget(target)}
        aria-label={`Configure ${title}`}
        className="flex min-h-[76px] min-w-0 flex-col justify-between rounded-xl border border-white/[0.09] bg-white/[0.025] p-3 text-left transition-colors hover:bg-white/[0.055] active:scale-[0.99]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`grid size-6 shrink-0 place-items-center rounded-full ${isLoss ? 'bg-rose-400/[0.10] text-rose-300' : 'bg-emerald-400/[0.10] text-emerald-300'}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[11px] font-semibold text-white/85">{title}</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-white/35" />
        </span>
        <span className={`mt-2 pl-8 text-[14px] font-semibold leading-none tabular-nums ${enabled ? 'text-white' : 'text-white/35'}`}>
          {enabled ? `${value}%` : 'Off'}
        </span>
      </button>
    );
  };

  return (
    <div className="w-full pb-8 text-white">
      <div className="border-b border-white/[0.08] pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Paper trading</p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/45">Set risk targets, entry limits and qualification rules for simulated positions.</p>
      </div>

      <section className="pt-1">
        <div className="flex items-center gap-2 border-b border-white/[0.08] py-3">
          <SlidersHorizontal className="h-4 w-4 text-white/50" />
          <h3 className="text-[12px] font-semibold text-white/90">Exit targets</h3>
        </div>
        <div className="grid grid-cols-2 gap-2.5 py-3">
          {targetRow('stop_loss_pct', 'Stop loss', '', TrendingDown, 'loss')}
          {targetRow('take_profit_pct', 'Take profit', '', TrendingUp, 'profit')}
        </div>
      </section>

      <section className="pt-5">
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2">
          <SlidersHorizontal className="h-4 w-4 text-white/50" />
          <h3 className="text-[12px] font-semibold text-white/90">Entry & position limits</h3>
        </div>
        <p className="py-2 text-[10px] text-white/40">Define which launches qualify and how much each paper entry can use.</p>
        <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
          <NumberField label="Minimum liquidity" suffix="USD" value={form.min_liquidity_usd} onChange={(v) => update('min_liquidity_usd', v)} />
          <NumberField label="Maximum entry price" suffix="USD" step="0.000001" value={form.max_entry_price_usd} onChange={(v) => update('max_entry_price_usd', v)} />
          <NumberField label="Paper position size" suffix="SOL" step="0.01" value={form.max_investment_per_token_sol} onChange={(v) => update('max_investment_per_token_sol', v)} />
          <NumberField label="Maximum open positions" value={form.max_simultaneous_positions} onChange={(v) => update('max_simultaneous_positions', Math.floor(v))} />
        </div>
      </section>

      <section className="pt-5">
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2">
          <ShieldCheck className="h-4 w-4 text-white/50" />
          <h3 className="text-[12px] font-semibold text-white/90">Token safety filters</h3>
        </div>
        <p className="py-2 text-[10px] text-white/40">Qualification thresholds applied before a paper entry.</p>
        <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
          <NumberField label="Minimum safety score" suffix="/ 100" value={form.min_safety_score} onChange={(v) => update('min_safety_score', Math.min(100, v))} />
          <NumberField label="Maximum slippage" suffix="%" step="0.1" value={form.max_slippage_pct} onChange={(v) => update('max_slippage_pct', v)} />
          <NumberField label="Minimum 5m buy volume" suffix="USD" value={form.min_5m_buy_volume_usd} onChange={(v) => update('min_5m_buy_volume_usd', v)} />
          <NumberField label="Maximum top-10 concentration" suffix="%" step="0.5" value={form.max_top10_holder_concentration_pct} onChange={(v) => update('max_top10_holder_concentration_pct', v)} />
        </div>
      </section>

      <section className="pt-5">
        <div className="flex items-center gap-2 border-b border-white/[0.08] pb-2">
          <Check className="h-4 w-4 text-white/50" />
          <h3 className="text-[12px] font-semibold text-white/90">Automation</h3>
        </div>
        <p className="py-2 text-[10px] text-white/40">Optional paper-trading behaviour.</p>
        <ToggleRow title="Automated paper buys" detail="Open a simulated position when all qualification rules pass." checked={form.auto_buy_enabled} onChange={(v) => update('auto_buy_enabled', v)} />
        <ToggleRow title="Trailing stop loss" detail="Raise the exit threshold as an open position gains value." checked={form.trailing_stop_enabled} onChange={(v) => update('trailing_stop_enabled', v)} />
        {form.trailing_stop_enabled && (
          <NumberField label="Trailing callback" suffix="%" step="0.5" value={form.trailing_stop_callback_pct} onChange={(v) => update('trailing_stop_callback_pct', v)} />
        )}
        <ToggleRow title="Blacklist known rug creators" detail="Reject launches linked to creators with prior rug activity." checked={form.blacklist_creators_with_prior_rugs} onChange={(v) => update('blacklist_creators_with_prior_rugs', v)} />
      </section>

      <section className="mt-6 border-t border-white/[0.08] pt-4">
        <div className="mb-2 flex items-center gap-2">
          <History className="h-4 w-4 text-white/45" />
          <h3 className="text-[12px] font-semibold text-white">Recent qualification decisions</h3>
        </div>
        {strategyDecisions.length === 0 ? (
          <p className="py-4 text-[11px] text-white/35">No strategy decisions recorded yet.</p>
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

      {activeTarget && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveTarget(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="target-sheet-title" className="w-full max-w-lg rounded-t-[26px] border-t border-white/[0.12] bg-[#111] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 id="target-sheet-title" className="text-[15px] font-semibold text-white"> {activeTarget === 'stop_loss_pct' ? 'Stop loss' : 'Take profit'} </h3>
                <p className="mt-1 text-[10px] text-white/40">Choose a preset or enter your own percentage.</p>
              </div>
              <button type="button" onClick={() => setActiveTarget(null)} aria-label="Close target settings" className="grid size-9 place-items-center rounded-full bg-white/[0.07] text-white/70"><X className="h-4 w-4" /></button>
            </div>

            <div className="mb-4 flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <p className="text-[12px] font-medium text-white/85">Enable target</p>
                <p className="mt-0.5 text-[10px] text-white/40">Turn this exit rule on or off independently.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form[activeTarget] > 0}
                onClick={() => update(activeTarget, form[activeTarget] > 0 ? 0 : (activeTarget === 'stop_loss_pct' ? 10 : 25))}
                className={`relative h-[22px] w-10 rounded-full transition-colors ${form[activeTarget] > 0 ? 'bg-white' : 'bg-white/15'}`}
              >
                <span className={`absolute top-[3px] size-4 rounded-full transition-all ${form[activeTarget] > 0 ? 'left-[21px] bg-black' : 'left-[3px] bg-white/75'}`} />
              </button>
            </div>

            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/40">Quick percentages</p>
            <div className="grid grid-cols-3 gap-2">
              {(activeTarget === 'stop_loss_pct' ? stopLossOptions : takeProfitOptions).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => update(activeTarget, option)}
                  className={`h-10 rounded-full border text-[12px] font-semibold tabular-nums transition-colors ${form[activeTarget] === option ? 'border-white bg-white text-black' : 'border-white/[0.12] bg-white/[0.035] text-white/75'}`}
                >
                  {option}%
                </button>
              ))}
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-[10px] font-medium text-white/45">Custom percentage</span>
              <span className="flex h-12 items-center border-b border-white/[0.18] focus-within:border-white/60">
                <input
                  autoFocus
                  type="number"
                  min="0.1"
                  max="1000"
                  step="0.1"
                  value={customValue}
                  onChange={(event) => setCustomValue(event.target.value)}
                  placeholder="Enter amount"
                  className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold tabular-nums text-white outline-none placeholder:text-white/20"
                />
                <span className="ml-2 text-[15px] font-medium text-white/50">%</span>
              </span>
            </label>
            <button
              type="button"
              onClick={applyCustom}
              disabled={!Number.isFinite(Number(customValue)) || Number(customValue) <= 0 || Number(customValue) > 1000}
              className="mt-5 h-12 w-full rounded-full bg-white text-[12px] font-semibold text-black disabled:opacity-35"
            >
              Apply custom target
            </button>
          </section>
        </div>
      )}
    </div>
  );
};

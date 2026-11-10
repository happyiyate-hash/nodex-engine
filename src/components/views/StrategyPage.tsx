import React, { useEffect, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { StrategyConfig } from '../../types';
import {
  Check, ChevronDown, ChevronRight, History, ShieldAlert, ShieldCheck, SlidersHorizontal,
  TrendingUp, X,
} from 'lucide-react';

type RiskTarget = 'stop_loss_pct' | 'take_profit_pct';

const stopLossOptions = [5, 10, 15, 20, 25, 30];
const takeProfitOptions = [10, 20, 30, 50, 75, 100];

const NumberField = ({
  label, suffix, value, onChange, hint, step = '1', disabled = false,
}: {
  label: string; suffix?: string; value: number; onChange: (value: number) => void;
  hint?: string; step?: string; disabled?: boolean;
}) => (
  <label className="block min-w-0 border-b border-white/[0.07] py-3">
    <span className="mb-2 block text-[11px] font-medium text-white/60">{label}</span>
    <span className="flex h-10 items-center border-b border-white/[0.14] focus-within:border-white/50">
      <input
        type="number" min="0" step={step} value={value} disabled={disabled}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium tabular-nums text-white outline-none disabled:cursor-not-allowed disabled:text-white/35"
      />
      {suffix && <span className="ml-2 shrink-0 text-[11px] text-white/40">{suffix}</span>}
    </span>
    {hint && <span className="mt-1.5 block text-[10px] leading-relaxed text-white/35">{hint}</span>}
  </label>
);

const ToggleRow = ({
  title, detail, checked, onChange, disabled = false,
}: {
  title: string; detail: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) => (
  <label className={`flex items-center justify-between gap-4 border-b border-white/[0.07] py-3 ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}>
    <span className="min-w-0">
      <span className="block text-[12px] font-medium text-white/85">{title}</span>
      <span className="mt-0.5 block text-[10px] leading-relaxed text-white/40">{detail}</span>
    </span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
    <span className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-white' : 'bg-white/15'}`}>
      <span className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${checked ? 'left-[21px] bg-black' : 'left-[3px] bg-white/75'}`} />
    </span>
  </label>
);

export const StrategyPage: React.FC = () => {
  const { strategyConfig, strategyDecisions, openTokenDetailByMint, saveStrategyConfig, engineStatus } = useTerminal();
  const paperMode = engineStatus.operating_mode.toLowerCase() !== 'real';
  const [form, setForm] = useState<StrategyConfig>({ ...strategyConfig });
  const [appliedConfig, setAppliedConfig] = useState<StrategyConfig>({ ...strategyConfig });
  const [activeTarget, setActiveTarget] = useState<RiskTarget | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [showAdvancedExit, setShowAdvancedExit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    setForm({ ...strategyConfig });
    setAppliedConfig({ ...strategyConfig });
  }, [strategyConfig]);

  const hasUnappliedChanges = JSON.stringify(form) !== JSON.stringify(appliedConfig);

  const update = (key: keyof StrategyConfig, value: StrategyConfig[keyof StrategyConfig]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applySettings = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const saved = await saveStrategyConfig(form);
      if (saved) {
        setAppliedConfig({ ...form });
        setSaveMessage('Trading configuration saved to the backend.');
      } else {
        setSaveMessage('The backend did not accept this configuration.');
      }
    } finally {
      setSaving(false);
    }
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

  const targetRow = (target: RiskTarget, title: string, Icon: typeof ShieldAlert, tone: 'loss' | 'profit') => {
    const value = form[target];
    const enabled = value > 0;
    return (
      <button
        type="button"
        onClick={() => openTarget(target)}
        aria-label={`Configure ${title}`}
        className="flex w-full items-center justify-between gap-3 border-b border-white/[0.08] py-3 text-left transition-colors hover:bg-white/[0.025] active:bg-white/[0.045]"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Icon className={`h-[17px] w-[17px] shrink-0 ${tone === 'loss' ? 'text-rose-300' : 'text-emerald-300'}`} />
          <span className={`text-[13px] font-semibold ${tone === 'loss' ? 'text-rose-300' : 'text-emerald-300'}`}>{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={`text-[12px] font-semibold tabular-nums ${enabled ? 'text-white/85' : 'text-white/35'}`}>
            {enabled ? `${value}%` : 'Disabled'}
          </span>
          <ChevronRight className="h-4 w-4 text-white/35" />
        </span>
      </button>
    );
  };

  return (
    <div className="w-full pb-24 text-white">
      <section className="pt-0">
        <div className="border-b border-white/[0.08] pb-2">
          <h3 className="text-[13px] font-semibold text-white/90">Exit Settings</h3>
          <p className="mt-1 text-[10px] text-white/40">Manage how your paper positions exit automatically.</p>
        </div>
        {targetRow('stop_loss_pct', 'Stop Loss', ShieldAlert, 'loss')}
        {targetRow('take_profit_pct', 'Take Profit', TrendingUp, 'profit')}
        <button
          type="button"
          onClick={() => setShowAdvancedExit((current) => !current)}
          aria-expanded={showAdvancedExit}
          className="flex w-full items-center justify-between py-3 text-left"
        >
          <span className="text-[11px] font-medium text-white/45">Advanced exit options</span>
          <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${showAdvancedExit ? 'rotate-180' : ''}`} />
        </button>
        {showAdvancedExit && (
          <div className="border-t border-white/[0.07] pl-1">
            <ToggleRow title="Trailing stop loss" detail="Raise the exit threshold as an open position gains value." checked={form.trailing_stop_enabled} onChange={(v) => update('trailing_stop_enabled', v)} />
            {form.trailing_stop_enabled && (
              <NumberField label="Trailing callback" suffix="%" step="0.5" value={form.trailing_stop_callback_pct} onChange={(v) => update('trailing_stop_callback_pct', v)} />
            )}
            <p className="py-2 text-[10px] text-white/30">Break-even protection and partial profit taking can be added here later.</p>
          </div>
        )}
      </section>

      <section className="pt-3">
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
          <NumberField
            label="Paper Starting Balance"
            suffix={form.paper_starting_balance_currency}
            value={form.paper_starting_balance}
            disabled={!paperMode}
            onChange={(v) => update('paper_starting_balance', v)}
            hint={paperMode ? "Initial simulated capital. It can only be changed before the first paper trade." : "Available only in Paper mode."}
          />
          <label className={`block min-w-0 border-b border-white/[0.07] py-3 ${paperMode ? '' : 'opacity-40'}`}>
            <span className="mb-2 block text-[11px] font-medium text-white/60">Balance currency</span>
            <select
              value={form.paper_starting_balance_currency}
              disabled={!paperMode}
              onChange={(event) => update('paper_starting_balance_currency', event.target.value as 'USD' | 'SOL')}
              className="h-10 w-full border-b border-white/[0.14] bg-transparent text-[13px] text-white outline-none disabled:cursor-not-allowed"
            >
              <option value="USD" className="bg-[#111]">USD</option>
              <option value="SOL" className="bg-[#111]">SOL</option>
            </select>
          </label>
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
        <ToggleRow title="Blacklist known rug creators" detail="Reject launches linked to creators with prior rug activity." checked={form.blacklist_creators_with_prior_rugs} onChange={(v) => update('blacklist_creators_with_prior_rugs', v)} />
      </section>

      <section className="mt-5 border-t border-white/[0.08] pt-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-white/50" />
          <h3 className="text-[12px] font-semibold text-white">Engine execution & diagnostics</h3>
        </div>
        <p className="py-2 text-[10px] text-white/40">These controls are persisted by the backend and applied to each new token scan.</p>
        <ToggleRow
          title="Diagnostic-only mode"
          detail={form.diagnostic_mode ? "ON · Collect evidence for inspection without issuing a verification verdict." : "OFF · Run the scanner's full verification decision path."}
          checked={form.diagnostic_mode}
          onChange={(v) => update('diagnostic_mode', v)}
        />
        <ToggleRow
          title="Block unverified trades"
          detail="When ON, only scans whose security checks are all explicitly VERIFIED may pass the execution gate."
          checked={form.block_unverified_trades}
          onChange={(v) => update('block_unverified_trades', v)}
        />
        <ToggleRow
          title="Global execution master switch"
          detail="OFF · Locked until the paper execution module is connected. Real execution is not available."
          checked={false}
          onChange={() => update('execution_enabled', false)}
          disabled
        />
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

      {hasUnappliedChanges && (
        <button
          type="button"
          onClick={applySettings}
          disabled={saving}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[70] inline-flex h-11 min-w-[112px] items-center justify-center gap-2 rounded-full bg-white px-5 text-[12px] font-semibold text-black shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.97] disabled:opacity-50"
          aria-label="Apply strategy configuration changes"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          {saving ? 'Saving…' : 'Apply'}
        </button>
      )}
      {saveMessage && <p className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] right-4 z-[70] max-w-[min(90vw,320px)] rounded-lg border border-white/[0.10] bg-[#171717] px-3 py-2 text-[10px] text-white/75">{saveMessage}</p>}

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

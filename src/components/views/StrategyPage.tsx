import React, { useEffect, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { StrategyConfig } from '../../types';
import { Check, ChevronDown, ChevronRight, ShieldAlert, ShieldCheck, TrendingUp, X } from 'lucide-react';

type RiskTarget = 'stop_loss_pct' | 'take_profit_pct';

const stopLossOptions = [5, 10, 15, 20, 25, 30];
const takeProfitOptions = [10, 20, 30, 50, 75, 100];

const ToggleRow = ({ title, detail, checked, onChange }: {
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
  const { strategyConfig, saveStrategyConfig } = useTerminal();
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

  const update = (key: keyof StrategyConfig, value: number | boolean) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applySettings = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      const saved = await saveStrategyConfig(form);
      if (saved) {
        setAppliedConfig({ ...form });
        setSaveMessage('Exit settings saved to the backend.');
      } else {
        setSaveMessage('The backend did not accept these settings.');
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
      <div className="border-b border-white/[0.08] pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Paper trading</p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/45">Set risk targets, entry limits and qualification rules for simulated positions.</p>
      </div>

      <section className="pt-2">
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
              <label className="block min-w-0 border-b border-white/[0.07] py-3">
                <span className="mb-2 block text-[11px] font-medium text-white/60">Trailing callback</span>
                <span className="flex h-10 items-center border-b border-white/[0.14] focus-within:border-white/50">
                  <input type="number" min="0" step="0.5" value={form.trailing_stop_callback_pct} onChange={(event) => update('trailing_stop_callback_pct', Math.max(0, Number(event.target.value) || 0))} className="min-w-0 flex-1 bg-transparent text-[14px] font-medium tabular-nums text-white outline-none" />
                  <span className="ml-2 shrink-0 text-[11px] text-white/40">%</span>
                </span>
              </label>
            )}
          </div>
        )}
      </section>

      {hasUnappliedChanges && (
        <button
          type="button"
          onClick={applySettings}
          disabled={saving}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-[70] inline-flex h-11 min-w-[112px] items-center justify-center gap-2 rounded-full bg-white px-5 text-[12px] font-semibold text-black shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.97] disabled:opacity-50"
          aria-label="Apply exit settings changes"
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
                <h3 id="target-sheet-title" className="text-[15px] font-semibold text-white">{activeTarget === 'stop_loss_pct' ? 'Stop loss' : 'Take profit'}</h3>
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
                <input type="number" min="0.1" max="1000" step="0.1" value={customValue} onChange={(event) => setCustomValue(event.target.value)} placeholder="Enter amount" className="min-w-0 flex-1 bg-transparent text-[20px] font-semibold tabular-nums text-white outline-none placeholder:text-white/20" />
                <span className="ml-2 text-[15px] font-medium text-white/50">%</span>
              </span>
            </label>
            <button type="button" onClick={applyCustom} disabled={!Number.isFinite(Number(customValue)) || Number(customValue) <= 0 || Number(customValue) > 1000} className="mt-5 h-12 w-full rounded-full bg-white text-[12px] font-semibold text-black disabled:opacity-35">Apply custom target</button>
          </section>
        </div>
      )}
    </div>
  );
};

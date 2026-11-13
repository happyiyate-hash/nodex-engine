import React, { useEffect, useState } from 'react';
import { Check, Loader2, Shield, X } from 'lucide-react';
import { useTerminal } from '../../context/TerminalContext';
import { Position, PositionRiskSettings } from '../../types';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const NumberField: React.FC<{
  label: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}> = ({ label, value, suffix = '%', min = 0, max = 1000, onChange }) => (
  <label className="flex items-center justify-between gap-3 py-2.5">
    <span className="text-[11px] text-white/65">{label}</span>
    <span className="flex h-9 w-[112px] shrink-0 items-center rounded-lg border border-white/[0.10] bg-white/[0.035] px-2.5 focus-within:border-white/25">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        className="w-full min-w-0 bg-transparent text-right text-[13px] font-semibold tabular-nums text-white outline-none"
      />
      <span className="ml-1 text-[10px] text-white/35">{suffix}</span>
    </span>
  </label>
);

const ToggleRow: React.FC<{ label: string; description: string; checked: boolean; onChange: (value: boolean) => void }> = ({
  label, description, checked, onChange,
}) => (
  <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 py-3 text-left">
    <span className="min-w-0">
      <span className="block text-[11px] font-semibold text-white">{label}</span>
      <span className="mt-0.5 block text-[9px] text-white/40">{description}</span>
    </span>
    <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-white/15'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </span>
  </button>
);

export const PositionRiskSettingsSheet: React.FC<{ position: Position }> = ({ position }) => {
  const { updatePositionRisk } = useTerminal();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [stopLossEnabled, setStopLossEnabled] = useState(position.stop_loss_target_pct > 0);
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(position.take_profit_target_pct > 0);
  const [stopLossPct, setStopLossPct] = useState(position.stop_loss_target_pct || 20);
  const [takeProfitPct, setTakeProfitPct] = useState(position.take_profit_target_pct || 50);
  const [trailingEnabled, setTrailingEnabled] = useState(Boolean(position.trailing_stop_enabled));
  const [activationPct, setActivationPct] = useState(position.trailing_activation_profit_pct ?? 20);
  const [callbackPct, setCallbackPct] = useState(position.trailing_stop_callback_pct ?? 10);
  const [maximumProfitPct, setMaximumProfitPct] = useState(position.maximum_profit_pct ?? 500);

  useEffect(() => {
    if (!open) {
      setStopLossEnabled(position.stop_loss_target_pct > 0);
      setTakeProfitEnabled(position.take_profit_target_pct > 0);
      setStopLossPct(position.stop_loss_target_pct || 20);
      setTakeProfitPct(position.take_profit_target_pct || 50);
      setTrailingEnabled(Boolean(position.trailing_stop_enabled));
      setActivationPct(position.trailing_activation_profit_pct ?? 20);
      setCallbackPct(position.trailing_stop_callback_pct ?? 10);
      setMaximumProfitPct(position.maximum_profit_pct ?? 500);
      setError('');
    }
  }, [open, position]);

  const apply = async () => {
    if (saving || position.status !== 'OPEN') return;
    setSaving(true);
    setError('');
    const risk: PositionRiskSettings = {
      // A zero percentage disables that protection on this position only.
      stop_loss_pct: stopLossEnabled ? stopLossPct : 0,
      take_profit_pct: takeProfitEnabled ? takeProfitPct : 0,
      trailing_stop_enabled: trailingEnabled,
      trailing_activation_profit_pct: activationPct,
      trailing_stop_callback_pct: callbackPct,
      maximum_profit_pct: maximumProfitPct,
    };
    try {
      const saved = await updatePositionRisk(position.id, risk);
      if (!saved) throw new Error('The engine could not save protection for this position.');
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this position.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.045] px-2.5 text-[9px] font-semibold text-white/75 transition hover:border-white/25 hover:bg-white/[0.08]"
      >
        <Shield className="h-3 w-3" />
        Edit protection
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => { event.stopPropagation(); if (event.target === event.currentTarget && !saving) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`position-risk-title-${position.id}`} className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/[0.10] bg-[#101010] shadow-2xl sm:rounded-2xl">
            <header className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3.5">
              <div className="min-w-0">
                <h2 id={`position-risk-title-${position.id}`} className="text-[13px] font-semibold text-white">Position protection</h2>
                <p className="mt-0.5 truncate text-[10px] text-white/40">{position.name} · ${position.symbol} · applies to this position only</p>
              </div>
              <button type="button" onClick={() => !saving && setOpen(false)} aria-label="Close position protection" className="rounded-lg p-2 text-white/45 hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="rounded-xl border border-white/[0.08] px-3.5">
                <div className="border-b border-white/[0.07]">
                  <ToggleRow label="Stop-loss" description="Close this position when it falls to your chosen loss limit" checked={stopLossEnabled} onChange={setStopLossEnabled} />
                </div>
                {stopLossEnabled && <NumberField label="Stop-loss distance" value={stopLossPct} min={0.1} max={95} onChange={setStopLossPct} />}
                <div className="border-t border-white/[0.07]">
                  <ToggleRow label="Take-profit" description="Close this position when it reaches your profit target" checked={takeProfitEnabled} onChange={setTakeProfitEnabled} />
                </div>
                {takeProfitEnabled && <NumberField label="Take-profit target" value={takeProfitPct} min={0.1} max={1000} onChange={setTakeProfitPct} />}
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.08] px-3.5">
                <ToggleRow label="Trailing stop-loss" description="Trail the exit level as this token's price rises" checked={trailingEnabled} onChange={setTrailingEnabled} />
                {trailingEnabled && (
                  <div className="border-t border-white/[0.07]">
                    <NumberField label="Activate after profit" value={activationPct} min={0.1} max={5000} onChange={setActivationPct} />
                    <div className="border-t border-white/[0.06]"><NumberField label="Trailing distance" value={callbackPct} min={0.1} max={100} onChange={setCallbackPct} /></div>
                    <div className="border-t border-white/[0.06]"><NumberField label="Maximum profit target" value={maximumProfitPct} min={0} max={10000} onChange={setMaximumProfitPct} /></div>
                    <p className="pb-2 text-[9px] leading-relaxed text-white/35">When trailing stop is enabled, the engine uses trailing protection instead of the fixed stop-loss and take-profit exits for this position.</p>
                  </div>
                )}
              </div>
              {error && <div role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-[10px] text-red-200">{error}</div>}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-white/[0.08] bg-[#0d0d0d] px-4 py-3">
              <span className="text-[9px] text-white/35">Paper position · ${position.id.slice(0, 8)}</span>
              <button type="button" onClick={apply} disabled={saving || position.status !== 'OPEN'} className="inline-flex h-10 min-w-[125px] items-center justify-center gap-2 rounded-lg bg-white px-4 text-[11px] font-bold text-black transition hover:bg-white/85 disabled:cursor-wait disabled:opacity-60">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {saving ? 'Saving…' : 'Save for this token'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
};

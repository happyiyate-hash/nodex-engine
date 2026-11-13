import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, ShieldCheck, SlidersHorizontal, X, Loader2 } from 'lucide-react';
import { useTerminal } from '../../context/TerminalContext';
import { PositionRiskSettings, StrategyConfig } from '../../types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const NumberField: React.FC<{
  label: string;
  value: number;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, suffix = '%', min = 0, max = 500, step = 1, onChange }) => (
  <label className="flex items-center justify-between gap-3 py-2.5">
    <span className="text-[12px] text-white/65">{label}</span>
    <span className="flex h-9 w-[112px] shrink-0 items-center rounded-lg border border-white/[0.10] bg-white/[0.035] px-2.5 focus-within:border-white/25">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        className="w-full min-w-0 bg-transparent text-right text-[13px] font-semibold tabular-nums text-white outline-none"
      />
      <span className="ml-1 text-[10px] text-white/35">{suffix}</span>
    </span>
  </label>
);

export const PositionRiskSettingsSheet: React.FC = () => {
  const { positions, strategyConfig, saveStrategyConfig, updatePositionRisk } = useTerminal();
  const [open, setOpen] = useState(false);
  const [trailingSetupOpen, setTrailingSetupOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<StrategyConfig>(strategyConfig);
  const [activationPct, setActivationPct] = useState(20);
  const [maximumProfitPct, setMaximumProfitPct] = useState(500);

  const openPositions = useMemo(() => positions.filter((position) => position.status === 'OPEN'), [positions]);

  useEffect(() => {
    if (!open) {
      setDraft(strategyConfig);
      const firstOpen = positions.find((position) => position.status === 'OPEN');
      setActivationPct(firstOpen?.trailing_activation_profit_pct ?? 20);
      setMaximumProfitPct(firstOpen?.maximum_profit_pct ?? 500);
    }
  }, [strategyConfig, positions, open]);

  const updateDraft = (patch: Partial<StrategyConfig>) => setDraft((current) => ({ ...current, ...patch }));

  const apply = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      // Save the strategy defaults first so future paper entries inherit them.
      const saved = await saveStrategyConfig({
        ...strategyConfig,
        stop_loss_pct: draft.stop_loss_pct,
        take_profit_pct: draft.take_profit_pct,
        trailing_stop_enabled: draft.trailing_stop_enabled,
        trailing_stop_callback_pct: draft.trailing_stop_callback_pct,
      });
      if (!saved) throw new Error('Could not save the default risk settings.');

      // Apply the same protection policy to every currently open position.
      const risk: PositionRiskSettings = {
        stop_loss_pct: draft.stop_loss_pct,
        take_profit_pct: draft.take_profit_pct,
        trailing_stop_enabled: draft.trailing_stop_enabled,
        trailing_activation_profit_pct: activationPct,
        trailing_stop_callback_pct: draft.trailing_stop_callback_pct,
        maximum_profit_pct: maximumProfitPct,
      };
      const results = await Promise.all(openPositions.map((position) => updatePositionRisk(position.id, risk)));
      const failed = results.filter((result) => !result).length;
      if (failed > 0) throw new Error(`Defaults saved, but ${failed} of ${openPositions.length} open positions could not be updated. Reopen settings and apply again.`);
      setOpen(false);
      setTrailingSetupOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not apply position protection.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.045] px-3 text-[11px] font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/[0.08]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Risk settings
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="position-risk-title" className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-white/[0.10] bg-[#101010] shadow-2xl sm:rounded-2xl">
            <header className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3.5 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.05]"><ShieldCheck className="h-4 w-4 text-white/75" /></div>
                <div>
                  <h2 id="position-risk-title" className="text-[14px] font-semibold text-white">Position protection</h2>
                  <p className="mt-0.5 text-[10px] text-white/40">Default rules and protection for open positions</p>
                </div>
              </div>
              <button type="button" onClick={() => !saving && setOpen(false)} aria-label="Close risk settings" className="rounded-lg p-2 text-white/45 hover:bg-white/[0.07] hover:text-white"><X className="h-4 w-4" /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              <div className="mb-4 flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5 py-3">
                <div>
                  <div className="text-[11px] font-semibold text-white">Apply to all positions</div>
                  <div className="mt-0.5 text-[10px] text-white/40">{openPositions.length} currently open · also saves defaults for future entries</div>
                </div>
                <span className="rounded-md bg-white/[0.07] px-2 py-1 text-[9px] font-medium text-white/55">PAPER</span>
              </div>

              <div className="rounded-xl border border-white/[0.08] px-3.5">
                <div className="border-b border-white/[0.07] py-3">
                  <div className="text-[11px] font-semibold text-white">Loss and profit limits</div>
                  <p className="mt-0.5 text-[10px] text-white/40">Percentage measured against each position's entry price</p>
                </div>
                <NumberField label="Initial stop-loss" value={draft.stop_loss_pct} min={1} max={95} onChange={(value) => updateDraft({ stop_loss_pct: value })} />
                <div className="border-t border-white/[0.06]"><NumberField label="Take-profit target" value={draft.take_profit_pct} min={1} max={1000} onChange={(value) => updateDraft({ take_profit_pct: value })} /></div>
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.08] px-3.5">
                <button type="button" onClick={() => { const next = !draft.trailing_stop_enabled; updateDraft({ trailing_stop_enabled: next }); if (next) setTrailingSetupOpen(true); }} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                  <div>
                    <div className="text-[11px] font-semibold text-white">Trailing stop-loss</div>
                    <div className="mt-0.5 text-[10px] text-white/40">Move the protective exit upward as price rises</div>
                  </div>
                  <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${draft.trailing_stop_enabled ? 'bg-emerald-500' : 'bg-white/15'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${draft.trailing_stop_enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} /></span>
                </button>
                {draft.trailing_stop_enabled && (
                  <div className="flex items-center justify-between border-t border-white/[0.07] py-2.5">
                    <div className="text-[10px] text-white/55">Activation +{activationPct}% · callback {draft.trailing_stop_callback_pct}%</div>
                    <button type="button" onClick={() => setTrailingSetupOpen(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-white/80 hover:bg-white/[0.07]">Configure <ChevronDown className="h-3 w-3" /></button>
                  </div>
                )}
              </div>

              {error && <div role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-[10px] text-red-200">{error}</div>}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-white/[0.08] bg-[#0d0d0d] px-4 py-3.5 sm:px-5">
              <span className="text-[9px] text-white/35">Updates {openPositions.length} open positions</span>
              <button type="button" onClick={apply} disabled={saving} className="inline-flex h-10 min-w-[132px] items-center justify-center gap-2 rounded-lg bg-white px-4 text-[11px] font-bold text-black transition hover:bg-white/85 disabled:cursor-wait disabled:opacity-60">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {saving ? 'Applying…' : 'Apply to all'}
              </button>
            </footer>

            {trailingSetupOpen && draft.trailing_stop_enabled && (
              <div className="absolute inset-0 z-10 flex items-end bg-black/65 backdrop-blur-[2px] sm:items-center sm:p-6">
                <div className="w-full rounded-t-2xl border border-white/[0.10] bg-[#171717] p-4 shadow-2xl sm:rounded-2xl">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-[13px] font-semibold text-white">Trailing stop setup</h3>
                      <p className="mt-0.5 text-[10px] text-white/40">Choose when trailing protection starts and how closely it follows.</p>
                    </div>
                    <button type="button" onClick={() => setTrailingSetupOpen(false)} aria-label="Close trailing setup" className="rounded-lg p-2 text-white/45 hover:bg-white/[0.07]"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="divide-y divide-white/[0.07]">
                    <NumberField label="Activate after profit" value={activationPct} min={1} max={1000} onChange={setActivationPct} />
                    <NumberField label="Trailing distance" value={draft.trailing_stop_callback_pct} min={1} max={95} onChange={(value) => updateDraft({ trailing_stop_callback_pct: value })} />
                    <NumberField label="Maximum profit target" value={maximumProfitPct} min={1} max={10000} onChange={setMaximumProfitPct} />
                  </div>
                  <button type="button" onClick={() => setTrailingSetupOpen(false)} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white text-[11px] font-bold text-black"><Check className="h-3.5 w-3.5" /> Save trailing settings</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
};

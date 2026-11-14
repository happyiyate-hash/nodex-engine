import React, { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { CreatorIntelligence, StrategyConfig } from '../../types';
import { apiClient } from '../../services/rest';
import { useToast } from '../ui/ToastProvider';
import {
  Activity, Check, ChevronDown, ChevronRight, History, ShieldAlert, ShieldCheck, SlidersHorizontal,
  TrendingUp, X, Plus, Pencil, Users, Wallet, BarChart3,
} from 'lucide-react';

type RiskTarget = 'stop_loss_pct' | 'take_profit_pct';

const stopLossOptions = [5, 10, 15, 20, 25, 30];
const takeProfitOptions = [10, 20, 30, 50, 75, 100];

const NumberField = ({
  label, suffix, value, onChange, hint, step = '1', disabled = false, min = 0, max,
}: {
  label: string; suffix?: string; value: number; onChange: (value: number) => void;
  hint?: string; step?: string; disabled?: boolean; min?: number; max?: number;
}) => {
  // Keep the editable text separate from the numeric setting. Converting an
  // empty input to 0 on every keystroke makes the zero impossible to delete.
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(String(value));
  }, [value]);

  const handleChange = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === '' || raw === '-' || raw.endsWith('.')) return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) onChange(Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, parsed)));
  };

  const handleBlur = () => {
    if (draft.trim() === '' || draft === '-') {
      onChange(min);
      setDraft(String(min));
      return;
    }
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      const normalized = Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, parsed));
      onChange(normalized);
      setDraft(String(normalized));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <label className="block min-w-0 border-b border-white/[0.07] py-3">
      <span className="mb-2 block text-[11px] font-medium text-white/60">{label}</span>
      <span className="flex h-10 items-center border-b border-white/[0.14] focus-within:border-white/50">
        <input
          ref={inputRef}
          type="number" inputMode="decimal" min={min} max={max} step={step}
          value={draft} disabled={disabled}
          onChange={(event) => handleChange(event.target.value)}
          onBlur={handleBlur}
          className="min-w-0 flex-1 bg-transparent text-[14px] font-medium tabular-nums text-white outline-none disabled:cursor-not-allowed disabled:text-white/35"
        />
        {suffix && <span className="ml-2 shrink-0 text-[11px] text-white/40">{suffix}</span>}
      </span>
      {hint && <span className="mt-1.5 block text-[10px] leading-relaxed text-white/35">{hint}</span>}
    </label>
  );
};

const ToggleRow = ({
  title, detail, checked, onChange, disabled = false, Icon,
}: {
  title: string; detail?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
  Icon?: typeof ShieldAlert;
}) => (
  <label className={`flex items-center justify-between gap-4 border-b border-white/[0.07] py-3 ${disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}>
    <span className="flex min-w-0 items-center gap-3">
      {Icon && <Icon className="h-[17px] w-[17px] shrink-0 text-white/55" />}
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-white/85">{title}</span>
        {detail && <span className="mt-0.5 block text-[10px] leading-relaxed text-white/40">{detail}</span>}
      </span>
    </span>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
    <span className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-white' : 'bg-white/15'}`}>
      <span className={`absolute top-[3px] h-4 w-4 rounded-full transition-all ${checked ? 'left-[21px] bg-black' : 'left-[3px] bg-white/75'}`} />
    </span>
  </label>
);

export const StrategyPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { strategyConfig, strategyDecisions, openTokenDetailByMint, saveStrategyConfig, engineStatus } = useTerminal();
  const { showToast, updateToast } = useToast();
  const paperMode = engineStatus.operating_mode.toLowerCase() !== 'real';
  const [form, setForm] = useState<StrategyConfig>({ ...strategyConfig });
  const [appliedConfig, setAppliedConfig] = useState<StrategyConfig>({ ...strategyConfig });
  const [activeTarget, setActiveTarget] = useState<RiskTarget | null>(null);
  const [customValue, setCustomValue] = useState('');
  const [showAdvancedExit, setShowAdvancedExit] = useState(false);
  const [trailingSheetOpen, setTrailingSheetOpen] = useState(false);
  const [trailingDraft, setTrailingDraft] = useState({
    enabled: Boolean(strategyConfig.trailing_stop_enabled),
    activation: strategyConfig.trailing_activation_profit_pct,
    callback: strategyConfig.trailing_stop_callback_pct,
  });
  const [creatorIntelligence, setCreatorIntelligence] = useState<CreatorIntelligence[]>([]);
  const [creatorLoading, setCreatorLoading] = useState(true);
  const [creatorLoadError, setCreatorLoadError] = useState('');
  const [selectedCreatorAddress, setSelectedCreatorAddress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newEntriesEnabled, setNewEntriesEnabled] = useState(false);
  const [savingEntryPermission, setSavingEntryPermission] = useState(false);
  const [ownerSheetOpen, setOwnerSheetOpen] = useState(false);
  const [editingOwnerIndex, setEditingOwnerIndex] = useState<number | null>(null);
  const [ownerAddress, setOwnerAddress] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [ownerError, setOwnerError] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.getCreatorIntelligence(500)
      .then((records) => { if (active) { setCreatorIntelligence(records); setCreatorLoadError(''); } })
      .catch((error) => { if (active) setCreatorLoadError(error instanceof Error ? error.message : 'Creator intelligence could not be loaded.'); })
      .finally(() => { if (active) setCreatorLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setForm({ ...strategyConfig });
    setAppliedConfig({ ...strategyConfig });
  }, [strategyConfig]);

  useEffect(() => {
    let active = true;
    apiClient.getEngineControl()
      .then((control) => { if (active) setNewEntriesEnabled(Boolean(control.new_entries_enabled)); })
      .catch(() => { if (active) setNewEntriesEnabled(false); });
    return () => { active = false; };
  }, []);

  const updateNewEntriesPermission = async (enabled: boolean) => {
    if (savingEntryPermission) return;
    setSavingEntryPermission(true);
    try {
      const result = await apiClient.updateEngineControl('configure', { new_entries_enabled: enabled });
      setNewEntriesEnabled(Boolean(result.engine.new_entries_enabled));
      showToast({
        title: enabled ? 'Paper entries enabled' : 'Paper entries disabled',
        description: enabled
          ? 'The engine may now open simulated positions when every other paper-entry gate passes.'
          : 'The engine will not open new paper positions.',
        tone: 'success',
        duration: 4500,
      });
    } catch (error) {
      showToast({
        title: 'Could not update paper-entry permission',
        description: error instanceof Error ? error.message : 'The backend rejected the runtime control change.',
        tone: 'error',
        duration: 6500,
      });
    } finally {
      setSavingEntryPermission(false);
    }
  };

  const hasUnappliedChanges = JSON.stringify(form) !== JSON.stringify(appliedConfig);

  const update = (key: keyof StrategyConfig, value: StrategyConfig[keyof StrategyConfig]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applySettings = async () => {
    if (saving) return;
    if (form.maximum_profit_pct !== 0 && (form.maximum_profit_pct < 100 || form.maximum_profit_pct > 100000)) {
      showToast({ title: 'Invalid maximum profit ceiling', description: 'Set it to 0 to disable, or choose a value from 100% to 100000%.', tone: 'error', duration: 5000 });
      return;
    }
    setSaving(true);
    const toastId = showToast({
      title: 'Saving trading configuration…',
      description: 'Sending the updated strategy settings to the NodeX backend.',
      tone: 'loading',
    });
    try {
      const saved = await saveStrategyConfig(form);
      if (saved) {
        setAppliedConfig({ ...form });
        updateToast(toastId, {
          title: 'Trading configuration saved',
          description: 'The backend accepted the updated settings and returned the saved configuration.',
          tone: 'success',
          duration: 4500,
        });
      } else {
        updateToast(toastId, {
          title: 'Configuration was not saved',
          description: 'The backend did not accept the update. Review the backend error and try again.',
          tone: 'error',
          duration: 6500,
        });
      }
    } catch (error) {
      updateToast(toastId, {
        title: 'Configuration save failed',
        description: error instanceof Error ? error.message : 'The backend could not save the trading configuration.',
        tone: 'error',
        duration: 6500,
      });
    } finally {
      setSaving(false);
    }
  };

  const openOwnerSheet = (index: number | null = null, initialAddress = '', initialLabel = '') => {
    setEditingOwnerIndex(index);
    setOwnerAddress(index === null ? initialAddress : form.preferred_owners[index]?.address || '');
    setOwnerLabel(index === null ? initialLabel : form.preferred_owners[index]?.label || '');
    setOwnerError('');
    setOwnerSheetOpen(true);
  };

  const saveOwner = () => {
    const address = ownerAddress.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      setOwnerError('Enter a valid-looking Solana base58 wallet address (32–44 characters).');
      return;
    }
    if (form.preferred_owners.some((owner, index) => owner.address === address && index !== editingOwnerIndex)) {
      setOwnerError('This wallet is already on your preferred-owner list.');
      return;
    }
    const next = [...form.preferred_owners];
    const owner = { address, label: ownerLabel.trim().slice(0, 80) };
    if (editingOwnerIndex === null) next.push(owner);
    else next[editingOwnerIndex] = owner;
    update('preferred_owners', next);
    setOwnerSheetOpen(false);
    showToast({ title: editingOwnerIndex === null ? 'Preferred owner added' : 'Preferred owner updated', description: 'This change is pending. Press Apply to save it to the backend.', tone: 'info' });
  };

  const removeOwner = (index: number) => {
    update('preferred_owners', form.preferred_owners.filter((_, itemIndex) => itemIndex !== index));
    showToast({ title: 'Preferred owner removed from draft', description: 'Press Apply to save this change to the backend.', tone: 'info' });
  };

  const openTrailingSheet = () => {
    setTrailingDraft({
      enabled: Boolean(form.trailing_stop_enabled),
      activation: form.trailing_activation_profit_pct,
      callback: form.trailing_stop_callback_pct,
    });
    setTrailingSheetOpen(true);
  };

  const applyTrailingDraft = () => {
    if (trailingDraft.enabled && (
      !Number.isFinite(trailingDraft.activation) || trailingDraft.activation <= 0 || trailingDraft.activation > 1000 ||
      !Number.isFinite(trailingDraft.callback) || trailingDraft.callback <= 0 || trailingDraft.callback > 100
    )) return;
    update('trailing_stop_enabled', trailingDraft.enabled);
    update('trailing_activation_profit_pct', trailingDraft.activation);
    update('trailing_stop_callback_pct', trailingDraft.callback);
    setTrailingSheetOpen(false);
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

  const developerRows = Array.from(new Set([
    ...creatorIntelligence.map((creator) => creator.creator_address),
    ...form.preferred_owners.map((owner) => owner.address),
  ]))
    .map((address) => ({
      address,
      preferredIndex: form.preferred_owners.findIndex((owner) => owner.address === address),
      preferredOwner: form.preferred_owners.find((owner) => owner.address === address),
      intelligence: creatorIntelligence.find((creator) => creator.creator_address === address),
    }))
    .sort((a, b) => {
      if (a.preferredIndex >= 0 && b.preferredIndex < 0) return -1;
      if (b.preferredIndex >= 0 && a.preferredIndex < 0) return 1;
      return (b.intelligence?.activity_score ?? -1) - (a.intelligence?.activity_score ?? -1);
    });
  const selectedDeveloper = developerRows.find((developer) => developer.address === selectedCreatorAddress) ?? null;

  return (
    <div className={embedded ? "w-full min-w-0 bg-black text-white" : "flex h-full w-full flex-col overflow-hidden bg-black text-white"}>
      {!embedded && <header className="shrink-0 flex-none border-b border-white/[0.08] bg-black/95 px-4 pb-3 pt-[max(env(safe-area-inset-top,0px),12px)] backdrop-blur-xl">
        <h1 className="text-[15px] font-semibold tracking-tight text-white">Strategy &amp; Risk Configuration</h1>
        <p className="mt-0.5 text-[10px] text-white/40">Risk rules, take profit, stop loss, and paper execution parameters.</p>
      </header>}
      <div className={embedded ? "w-full min-w-0 px-3" : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-4"}>
        <section className="pt-0">
        <ToggleRow
          title="Paper Execution"
          checked={Boolean(form.execution_enabled)}
          onChange={(enabled) => update('execution_enabled', enabled)}
          disabled={!paperMode || saving}
          Icon={ShieldCheck}
        />
        <div className="border-b border-white/[0.08] pb-2">
          <h3 className="text-[13px] font-semibold text-white/90">Exit Settings</h3>
          <p className="mt-1 text-[10px] text-white/40">Manage how your paper positions exit automatically.</p>
        </div>
        {!form.trailing_stop_enabled && (
          <>
            {targetRow('stop_loss_pct', 'Stop Loss', ShieldAlert, 'loss')}
            {targetRow('take_profit_pct', 'Take Profit', TrendingUp, 'profit')}
          </>
        )}
        <NumberField
          label="Maximum Profit Ceiling"
          suffix="%"
          min={0}
          max={100000}
          step="10"
          value={form.maximum_profit_pct}
          onChange={(value) => update('maximum_profit_pct', value)}
          hint="Optional hard exit while trailing stop is enabled. Set to 0 to disable; otherwise minimum 100%."
        />
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] py-3">
          <button type="button" onClick={openTrailingSheet} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <TrendingUp className="h-[17px] w-[17px] shrink-0 text-white/55" />
            <span className="text-[13px] font-semibold text-white/85">Trailing Stop Loss</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
          </button>
          <button
            type="button"
            role="switch"
            aria-label="Enable trailing stop loss"
            aria-checked={Boolean(form.trailing_stop_enabled)}
            disabled={saving || !paperMode}
            onClick={() => update('trailing_stop_enabled', !form.trailing_stop_enabled)}
            className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors disabled:opacity-40 ${form.trailing_stop_enabled ? 'bg-white' : 'bg-white/15'}`}
          >
            <span className={`absolute top-[3px] size-4 rounded-full transition-all ${form.trailing_stop_enabled ? 'left-[21px] bg-black' : 'left-[3px] bg-white/75'}`} />
          </button>
        </div>
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
            <ToggleRow title="Automatically recover token-account rent" detail="After a full sale settles and the token balance is zero, close the simulated token account and return its locked rent to available paper SOL. Rent recovery is not counted as trading profit." checked={form.auto_recover_token_account_rent} onChange={(v) => update('auto_recover_token_account_rent', v)} />
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
          <NumberField
            label="Paper position size"
            suffix="USD"
            step="0.50"
            value={form.max_investment_per_token_usd}
            onChange={(v) => update('max_investment_per_token_usd', v)}
            hint="Fixed dollar budget per token. The backend converts it to SOL using the latest valid SOL/USD quote when preparing an order."
          />
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
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-white/60" />
              <h3 className="text-[13px] font-semibold text-white">Developer Intelligence</h3>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-white/40">One profile per creator wallet. Manual entries and automatically learned intelligence appear together.</p>
          </div>
          <button type="button" onClick={() => openOwnerSheet()} disabled={form.preferred_owners.length >= 500} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-[10px] font-semibold text-white/85 disabled:opacity-35">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <p className="text-[9px] uppercase tracking-wider text-white/40">Tracked developers</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums text-white">{developerRows.length}</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <p className="text-[9px] uppercase tracking-wider text-white/40">Manual preferred</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums text-white">{form.preferred_owners.length}<span className="ml-1 text-[10px] font-normal text-white/35">/ 500</span></p>
          </div>
        </div>

        <div className="mb-2">
          <ToggleRow title="Strict preferred-owner mode" detail="When ON, only creator wallets on your manual preferred list proceed through the configured scan path. Every candidate still faces the full security checks." checked={form.whitelist_only_mode} onChange={(value) => update('whitelist_only_mode', value)} />
        </div>

        {creatorLoadError && <p className="mb-2 rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[10px] text-amber-200/80">Automatic intelligence could not be loaded: {creatorLoadError}</p>}
        {creatorLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[10px] text-white/40"><Activity className="h-4 w-4 animate-pulse" /> Loading developer records…</div>
        ) : developerRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-7 text-center">
            <Wallet className="mx-auto h-5 w-5 text-white/25" />
            <p className="mt-2 text-[11px] font-medium text-white/65">No developers tracked yet</p>
            <p className="mt-1 text-[10px] text-white/35">Add a creator wallet manually. Automatically learned profiles will appear here when the backend records observations.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {developerRows.map((developer) => {
              const intelligence = developer.intelligence;
              const label = developer.preferredOwner?.label || intelligence?.display_label || 'Unnamed developer';
              return (
                <button key={developer.address} type="button" onClick={() => setSelectedCreatorAddress(developer.address)} className="flex w-full min-w-0 items-center gap-3 py-3 text-left transition-colors hover:bg-white/[0.025] active:bg-white/[0.045]">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.09] bg-white/[0.035]"><Wallet className="h-4 w-4 text-white/55" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold text-white/85">{label}</span>
                    <span className="mt-1 block truncate font-mono text-[9px] text-white/35">{developer.address}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {developer.preferredIndex >= 0 && <span className="rounded-full border border-sky-300/20 bg-sky-300/[0.06] px-1.5 py-0.5 text-[8px] font-semibold text-sky-200/80">MANUAL</span>}
                      {intelligence ? <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.05] px-1.5 py-0.5 text-[8px] font-semibold text-emerald-200/80">INTELLIGENCE</span> : <span className="text-[9px] text-white/35">Awaiting automatic observations</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {intelligence ? <>
                      <span className="block text-[15px] font-semibold tabular-nums text-white">{intelligence.activity_score.toFixed(1)}</span>
                      <span className="block text-[8px] uppercase tracking-wider text-white/35">Activity</span>
                      <span className="mt-1 block text-[9px] tabular-nums text-white/45">{intelligence.observations_count} obs.</span>
                    </> : <span className="block text-[9px] text-white/35">No data yet</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
                </button>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[9px] leading-relaxed text-white/30">Activity score is the backend's current metric, not a verified overall reputation rating. Launch outcomes, migrations and manual score overrides require additional backend support.</p>
      </section>

      {selectedDeveloper && (
        <div className="fixed inset-0 z-[105] flex items-end justify-center bg-black/75 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedCreatorAddress(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="developer-sheet-title" className="max-h-[88dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-[26px] border-t border-white/[0.12] bg-[#101010] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/35">Developer profile</p>
                <h3 id="developer-sheet-title" className="mt-1 truncate text-[16px] font-semibold text-white">{selectedDeveloper.preferredOwner?.label || selectedDeveloper.intelligence?.display_label || 'Unnamed developer'}</h3>
                <p className="mt-1 break-all font-mono text-[9px] leading-relaxed text-white/45">{selectedDeveloper.address}</p>
              </div>
              <button type="button" onClick={() => setSelectedCreatorAddress(null)} aria-label="Close developer details" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white/70"><X className="h-4 w-4" /></button>
            </div>

            {selectedDeveloper.intelligence ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/[0.09] bg-white/[0.035] p-3">
                    <p className="text-[9px] uppercase tracking-wider text-white/40">Activity score</p>
                    <p className="mt-1 text-[26px] font-semibold tabular-nums text-white">{selectedDeveloper.intelligence.activity_score.toFixed(1)}<span className="ml-1 text-[11px] font-normal text-white/35">/ 100</span></p>
                  </div>
                  <div className="rounded-xl border border-white/[0.09] bg-white/[0.035] p-3">
                    <p className="text-[9px] uppercase tracking-wider text-white/40">Observations</p>
                    <p className="mt-1 text-[26px] font-semibold tabular-nums text-white">{selectedDeveloper.intelligence.observations_count}</p>
                    <p className="text-[9px] text-white/35">{selectedDeveloper.intelligence.qualified_observations} qualified</p>
                  </div>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {[
                    { label: 'Buy count', value: selectedDeveloper.intelligence.buy_count, Icon: BarChart3 },
                    { label: 'Sell count', value: selectedDeveloper.intelligence.sell_count, Icon: Activity },
                    { label: 'Unique buyers', value: selectedDeveloper.intelligence.unique_buyers, Icon: Users },
                    { label: 'Independent buyers', value: selectedDeveloper.intelligence.independent_buyers, Icon: Users },
                  ].map((metric) => (
                    <div key={metric.label} className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-3">
                      <metric.Icon className="h-4 w-4 shrink-0 text-white/40" />
                      <span className="min-w-0"><span className="block text-[9px] text-white/40">{metric.label}</span><span className="mt-0.5 block text-[14px] font-semibold tabular-nums text-white/85">{metric.value.toLocaleString()}</span></span>
                    </div>
                  ))}
                </div>
                <div className="mb-4 rounded-xl border border-white/[0.08] p-3">
                  <div className="flex items-center justify-between gap-3"><span className="text-[10px] text-white/45">Sniper concentration</span><span className="text-[12px] font-semibold tabular-nums text-white">{selectedDeveloper.intelligence.sniper_concentration_pct.toFixed(1)}%</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white/70" style={{ width: `${Math.max(0, Math.min(100, selectedDeveloper.intelligence.sniper_concentration_pct))}%` }} /></div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-[9px] text-white/35"><span>Source: {selectedDeveloper.intelligence.source}</span><span>Updated {new Date(selectedDeveloper.intelligence.updated_at).toLocaleString()}</span></div>
                </div>
              </>
            ) : (
              <div className="mb-4 rounded-xl border border-dashed border-white/10 px-4 py-6 text-center">
                <Activity className="mx-auto h-5 w-5 text-white/30" />
                <p className="mt-2 text-[11px] font-medium text-white/70">No automatic intelligence recorded</p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/40">This address is saved in your manual preferred-owner configuration. Its intelligence metrics will appear here when the backend records observations for this wallet.</p>
              </div>
            )}

            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-white/45" /><p className="text-[10px] font-semibold text-white/75">Reputation controls</p></div>
              <p className="mt-2 text-[10px] leading-relaxed text-white/40">Manual score overrides, risk labels, launch counts, migration history and per-token outcomes are not exposed by the current backend API. They will be connected in the backend phase; this screen will not fabricate those values.</p>
            </div>

            <div className="mt-4 flex gap-2">
              {selectedDeveloper.preferredIndex >= 0 ? (
                <button type="button" onClick={() => { const index = selectedDeveloper.preferredIndex; setSelectedCreatorAddress(null); openOwnerSheet(index); }} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/[0.14] text-[11px] font-semibold text-white/85"><Pencil className="h-3.5 w-3.5" /> Edit manual entry</button>
              ) : (
                <button type="button" onClick={() => { const address = selectedDeveloper.address; const label = selectedDeveloper.intelligence?.display_label || ''; setSelectedCreatorAddress(null); openOwnerSheet(null, address, label); }} disabled={form.preferred_owners.length >= 500} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/[0.14] text-[11px] font-semibold text-white/85 disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add to preferred owners</button>
              )}
              <button type="button" onClick={() => setSelectedCreatorAddress(null)} className="h-11 rounded-full bg-white px-5 text-[11px] font-semibold text-black">Close</button>
            </div>
          </section>
        </div>
      )}

      {ownerSheetOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 px-0 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) setOwnerSheetOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="owner-sheet-title" className="w-full max-w-xl rounded-t-2xl border border-white/[0.10] bg-[#111] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-[0_-18px_60px_rgba(0,0,0,.6)]">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-5 flex items-center justify-between gap-3"><div><h3 id="owner-sheet-title" className="text-[14px] font-semibold text-white">{editingOwnerIndex === null ? 'Add preferred owner' : 'Edit preferred owner'}</h3><p className="mt-1 text-[10px] text-white/40">Use the creator/deployer wallet address.</p></div><button type="button" onClick={() => setOwnerSheetOpen(false)} aria-label="Close owner editor" className="rounded-lg p-2 text-white/50"><X className="h-4 w-4" /></button></div>
            <div className="space-y-4">
              <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-white/65">Solana wallet address</span><input value={ownerAddress} onChange={(event) => { setOwnerAddress(event.target.value.trim()); setOwnerError(''); }} placeholder="Paste wallet address" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="w-full rounded-xl border border-white/10 bg-[#090909] px-3 py-3 font-mono text-[11px] text-white outline-none focus:border-white/35" /></label>
              <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-white/65">Label (optional)</span><input value={ownerLabel} onChange={(event) => setOwnerLabel(event.target.value.slice(0, 80))} placeholder="e.g. Trusted creator" maxLength={80} className="w-full rounded-xl border border-white/10 bg-[#090909] px-3 py-3 text-[12px] text-white outline-none focus:border-white/35" /></label>
              {ownerError && <p className="text-[10px] text-rose-300" role="alert">{ownerError}</p>}
              <button type="button" onClick={saveOwner} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-[11px] font-bold text-black"><Check className="h-4 w-4" /> {editingOwnerIndex === null ? 'Add owner to settings' : 'Save owner changes'}</button>
            </div>
          </section>
        </div>
      )}

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

      {trailingSheetOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTrailingSheetOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="trailing-sheet-title" className="w-full max-w-lg rounded-t-[26px] border-t border-white/[0.12] bg-[#111] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-2xl">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 id="trailing-sheet-title" className="text-[15px] font-semibold text-white">Trailing Stop Loss</h3>
                <p className="mt-1 text-[10px] text-white/40">Configure when trailing protection starts and how closely it follows price.</p>
              </div>
              <button type="button" onClick={() => setTrailingSheetOpen(false)} aria-label="Close trailing stop settings" className="grid size-9 place-items-center rounded-full bg-white/[0.07] text-white/70"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex items-center justify-between border-b border-white/[0.08] py-3">
              <span className="text-[12px] font-medium text-white/85">Enable trailing stop loss</span>
              <button type="button" role="switch" aria-checked={trailingDraft.enabled} onClick={() => setTrailingDraft((current) => ({ ...current, enabled: !current.enabled }))} className={`relative h-[22px] w-10 rounded-full transition-colors ${trailingDraft.enabled ? 'bg-white' : 'bg-white/15'}`}>
                <span className={`absolute top-[3px] size-4 rounded-full transition-all ${trailingDraft.enabled ? 'left-[21px] bg-black' : 'left-[3px] bg-white/75'}`} />
              </button>
            </div>
            {trailingDraft.enabled && (
              <div className="pt-2">
                <NumberField label="Activate after profit" suffix="%" step="0.5" min={0.1} max={1000} value={trailingDraft.activation} onChange={(value) => setTrailingDraft((current) => ({ ...current, activation: value }))} hint="Trailing protection starts once the position reaches this profit." />
                <NumberField label="Trailing distance (callback)" suffix="%" step="0.5" min={0.1} max={100} value={trailingDraft.callback} onChange={(value) => setTrailingDraft((current) => ({ ...current, callback: value }))} hint="Distance below the highest price reached after activation." />
              </div>
            )}
            <button type="button" onClick={applyTrailingDraft} disabled={trailingDraft.enabled && (trailingDraft.activation <= 0 || trailingDraft.activation > 1000 || trailingDraft.callback <= 0 || trailingDraft.callback > 100)} className="mt-5 h-12 w-full rounded-full bg-white text-[12px] font-semibold text-black disabled:opacity-35">
              Apply
            </button>
          </section>
        </div>
      )}

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
    </div>
  );
};

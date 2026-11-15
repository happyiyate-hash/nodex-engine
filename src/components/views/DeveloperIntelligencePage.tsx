import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, BarChart3, Check, Clock3, Copy, Layers3, Pencil, Plus, Search, ShieldAlert, TrendingUp, Users, Wallet, X } from 'lucide-react';
import { apiClient } from '../../services/rest';
import { useTerminal } from '../../context/TerminalContext';
import { useToast } from '../ui/ToastProvider';
import { CreatorIntelligence, PreferredOwner } from '../../types';

type Developer = { address: string; owner?: PreferredOwner; intelligence?: CreatorIntelligence };
const shortAddress = (value: string) => value.length > 18 ? value.slice(0, 7) + '…' + value.slice(-7) : value;

export const DeveloperIntelligencePage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { strategyConfig, saveStrategyConfig } = useTerminal();
  const { showToast } = useToast();
  const [records, setRecords] = useState<CreatorIntelligence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addressDraft, setAddressDraft] = useState('');
  const [labelDraft, setLabelDraft] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setRecords(await apiClient.getCreatorIntelligence(500)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load developer intelligence.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const developers = useMemo<Developer[]>(() => {
    const addresses = Array.from(new Set([
      ...records.map((r) => r.creator_address),
      ...strategyConfig.preferred_owners.map((o) => o.address),
    ]));
    return addresses.map((address) => ({
      address,
      owner: strategyConfig.preferred_owners.find((o) => o.address === address),
      intelligence: records.find((r) => r.creator_address === address),
    })).sort((a, b) => {
      if (a.owner && !b.owner) return -1;
      if (b.owner && !a.owner) return 1;
      return (b.intelligence?.activity_score ?? -1) - (a.intelligence?.activity_score ?? -1);
    });
  }, [records, strategyConfig.preferred_owners]);

  const selected = developers.find((d) => d.address === selectedAddress) || null;
  const filtered = developers.filter((d) => {
    const q = search.trim().toLowerCase();
    return !q || d.address.toLowerCase().includes(q) || (d.owner?.label || d.intelligence?.display_label || '').toLowerCase().includes(q);
  });

  const openAdd = () => { setAddressDraft(''); setLabelDraft(''); setFormError(''); setEditOpen(true); };
  const openEdit = () => {
    if (!selected) return;
    setAddressDraft(selected.address);
    setLabelDraft(selected.owner?.label || selected.intelligence?.display_label || '');
    setFormError('');
    setEditOpen(true);
  };
  const saveDeveloper = async () => {
    const address = addressDraft.trim();
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) { setFormError('Enter a valid-looking Solana wallet address.'); return; }
    const current = strategyConfig.preferred_owners || [];
    const originalIndex = current.findIndex((o) => o.address === (selected?.address || address));
    if (current.some((o, i) => o.address === address && i !== originalIndex)) { setFormError('This wallet is already manually registered.'); return; }
    if (originalIndex < 0 && current.length >= 500) { setFormError('The manual preferred-owner limit of 500 has been reached.'); return; }
    const next = [...current];
    const entry = { address, label: labelDraft.trim().slice(0, 80) };
    if (originalIndex >= 0) next[originalIndex] = entry; else next.push(entry);
    setSaving(true);
    try {
      const ok = await saveStrategyConfig({ ...strategyConfig, preferred_owners: next });
      if (!ok) throw new Error('The backend did not confirm the configuration update.');
      setEditOpen(false); setSelectedAddress(address);
      showToast({ title: originalIndex >= 0 ? 'Developer details saved' : 'Developer added', description: 'Manual developer settings were saved.', tone: 'success' });
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Could not save developer details.'); }
    finally { setSaving(false); }
  };
  const copyAddress = async (value: string) => {
    try { await navigator.clipboard.writeText(value); showToast({ title: 'Wallet address copied', tone: 'success' }); }
    catch { showToast({ title: 'Copy unavailable', description: 'Your device did not allow copying this address.', tone: 'warning' }); }
  };

  const header = (title: string, subtitle: string, back: () => void, action?: React.ReactNode) => (
    <header className="flex shrink-0 items-center gap-3 bg-black px-4 pb-3 pt-[max(env(safe-area-inset-top,0px),12px)] backdrop-blur-xl">
      <button type="button" onClick={back} aria-label="Go back" className="grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.09] bg-white/[0.035] text-white/75"><ArrowLeft className="h-4 w-4" /></button>
      <div className="min-w-0 flex-1"><h1 className="truncate text-[15px] font-semibold text-white">{title}</h1><p className="mt-0.5 truncate text-[10px] text-white/40">{subtitle}</p></div>
      {action}
    </header>
  );

  if (selected) {
    const info = selected.intelligence;
    const stats = info ? [
      ['Observations', info.observations_count, Activity], ['Qualified', info.qualified_observations, ShieldAlert],
      ['Buy count', info.buy_count, TrendingUp], ['Sell count', info.sell_count, BarChart3],
      ['Unique buyers', info.unique_buyers, Users], ['Independent buyers', info.independent_buyers, Users],
    ] as const : [];
    return <div className="flex h-full min-h-0 w-full flex-col bg-black text-white">
      {header('Developer profile', 'Creator intelligence and wallet record', () => setSelectedAddress(null),
        <button type="button" onClick={openEdit} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 text-[10px] font-semibold text-white/85"><Pencil className="h-3.5 w-3.5" /> Edit</button>)}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-4">
        <section className="relative overflow-hidden rounded-xl bg-[#171717] p-3.5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-orange-400/20 to-amber-300/10"><Wallet className="h-5 w-5 text-amber-300" /></div>
            <div className="min-w-0 flex-1"><h2 className="truncate text-[16px] font-semibold">{selected.owner?.label || info?.display_label || 'Unnamed developer'}</h2><p className="mt-1 break-all font-mono text-[10px] text-white/40">{selected.address}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{selected.owner && <span className="rounded-full bg-orange-400/10 px-2 py-1 text-[8px] font-semibold text-orange-200">MANUALLY ADDED</span>}{info && <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[8px] font-semibold text-amber-200">INTELLIGENCE RECORD</span>}</div>
            </div>
            <button type="button" onClick={() => void copyAddress(selected.address)} aria-label="Copy address" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-white/60"><Copy className="h-4 w-4" /></button>
          </div>
        </section>
        <section className="mt-5"><div className="mb-2 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Reputation overview</h3><span className="text-[9px] text-white/30">Backend data</span></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-[#17130f] p-3"><p className="text-[9px] uppercase tracking-wider text-orange-200/75">Activity score</p><p className="mt-1 text-[28px] font-semibold tabular-nums">{info ? info.activity_score.toFixed(1) : '—'}<span className="ml-1 text-[10px] font-normal text-white/35">/ 100</span></p><p className="mt-1 text-[9px] text-white/35">Not yet a verified overall reputation rating</p></div>
            <div className="rounded-xl bg-[#19160f] p-3"><p className="text-[9px] uppercase tracking-wider text-amber-200/75">Observations</p><p className="mt-1 text-[28px] font-semibold tabular-nums">{info ? info.observations_count.toLocaleString() : '—'}</p><p className="mt-1 text-[9px] text-white/35">{info ? info.qualified_observations.toLocaleString() + ' qualified' : 'No automatic observations yet'}</p></div>
          </div>
        </section>
        <section className="mt-5"><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Activity statistics</h3>
          {info ? <div className="grid grid-cols-2 gap-2">{stats.map(([label, value, Icon], index) => <div key={label} className={`flex items-center gap-3 rounded-xl bg-[#171717] p-3 ${['bg-[#171717]','bg-[#1b1711]','bg-[#171717]','bg-[#1b1711]','bg-[#171717]','bg-[#1b1711]'][index % 6]}`}><Icon className="h-4 w-4 shrink-0 text-white/65" /><div><p className="text-[9px] text-white/40">{label}</p><p className="mt-0.5 text-[15px] font-semibold tabular-nums">{value.toLocaleString()}</p></div></div>)}</div>
            : <div className="rounded-xl bg-[#171717] px-4 py-6 text-center text-[10px] leading-relaxed text-white/40">No automatic activity statistics have been recorded for this manually added wallet yet.</div>}
          {info && <div className="mt-2 rounded-xl bg-[#171717] p-3"><div className="flex items-center justify-between"><span className="text-[10px] text-white/45">Sniper concentration</span><span className="text-[12px] font-semibold tabular-nums">{info.sniper_concentration_pct.toFixed(1)}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-white/75" style={{ width: Math.max(0, Math.min(100, info.sniper_concentration_pct)) + '%' }} /></div><div className="mt-3 flex justify-between gap-3 text-[9px] text-white/35"><span>{info.source}</span><span>{new Date(info.updated_at).toLocaleString()}</span></div></div>}
        </section>
        <section className="mt-5"><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Launch history</h3><div className="flex items-start gap-3 rounded-xl bg-[#171717] p-3"><Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-white/35" /><div><p className="text-[11px] font-medium text-white/75">Token launch records are not available yet</p><p className="mt-1 text-[10px] leading-relaxed text-white/40">The current creator-intelligence API does not return per-token launch, graduation or migration history. This section will use real backend records when that data is added.</p></div></div></section>
        <section className="mt-3"><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">Manual controls</h3><div className="rounded-xl bg-[#171717] p-3 text-[10px] leading-relaxed text-white/40">Edit currently manages the manual preferred-owner wallet and label. Manual score overrides and risk labels need backend support and are not shown as editable until they can be saved.</div></section>
      </div>
      {editOpen && <EditSheet title="Edit developer details" address={addressDraft} setAddress={setAddressDraft} label={labelDraft} setLabel={setLabelDraft} error={formError} saving={saving} onClose={() => setEditOpen(false)} onSave={() => void saveDeveloper()} />}
    </div>;
  }

  return <div className="flex h-full min-h-0 w-full flex-col bg-black text-white">
    {header('Developer Intelligence', 'All manually added and automatically discovered creators', onBack,
      <button type="button" onClick={openAdd} className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-black"><Plus className="h-4 w-4" /></button>)}
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10 pt-4">
      <div className="mb-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-wider text-white/40">Tracked developers</p><p className="mt-1 text-[23px] font-semibold tabular-nums">{developers.length}</p></div><div className="rounded-xl bg-[#171717] p-3"><p className="text-[9px] uppercase tracking-wider text-white/40">Manual profiles</p><p className="mt-1 text-[23px] font-semibold tabular-nums">{strategyConfig.preferred_owners.length}<span className="ml-1 text-[10px] font-normal text-white/35">/ 500</span></p></div></div>
      <label className="relative mb-4 block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search developer or wallet address" className="h-11 w-full rounded-xl bg-[#171717] pl-10 pr-3 text-[11px] text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-amber-400/30" /></label>
      {error && <div className="mb-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[10px] text-amber-200/80">{error}<button type="button" onClick={() => void load()} className="ml-2 underline">Retry</button></div>}
      {loading ? <div className="flex items-center justify-center gap-2 py-12 text-[10px] text-white/40"><Activity className="h-4 w-4 animate-pulse" /> Loading developer records…</div>
        : filtered.length === 0 ? <div className="rounded-xl bg-[#171717] px-5 py-10 text-center"><Users className="mx-auto h-6 w-6 text-white/25" /><p className="mt-3 text-[12px] font-medium text-white/70">{developers.length ? 'No matching developers' : 'No developers tracked yet'}</p><p className="mt-1 text-[10px] leading-relaxed text-white/35">Add a wallet manually or wait for the backend to record creator intelligence.</p><button type="button" onClick={openAdd} className="mt-4 rounded-full bg-white px-4 py-2 text-[10px] font-semibold text-black">Add developer</button></div>
        : <div className="space-y-2">{filtered.map((developer) => {
          const info = developer.intelligence; const label = developer.owner?.label || info?.display_label || 'Unnamed developer';
          const palette = developer.owner ? 'bg-gradient-to-r from-orange-500/[0.12] via-[#1b160f] to-[#19150f]' : 'bg-gradient-to-r from-amber-400/[0.10] via-[#1a1712] to-[#18150f]';
          return <button key={developer.address} type="button" onClick={() => setSelectedAddress(developer.address)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:brightness-110 active:scale-[0.99] ${palette}`}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${developer.owner ? 'bg-orange-400/10' : 'bg-amber-300/10'}`}><Wallet className={`h-[17px] w-[17px] ${developer.owner ? 'text-orange-300' : 'text-amber-200'}`} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-white/90">{label}</span><span className="mt-1 block truncate font-mono text-[9px] text-white/35">{shortAddress(developer.address)}</span><span className="mt-1.5 flex flex-wrap items-center gap-1.5">{developer.owner && <span className="rounded-full bg-orange-400/10 px-1.5 py-0.5 text-[8px] font-semibold text-orange-200">MANUAL</span>}{info && <span className="rounded-full bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-semibold text-amber-200">TRACKED</span>}{!info && <span className="text-[8px] text-white/30">Awaiting observations</span>}</span></span>
            <span className="shrink-0 text-right"><span className={`block text-[13px] font-bold tabular-nums ${info ? 'text-amber-200' : 'text-white/35'}`}>{info ? info.activity_score.toFixed(1) : '—'}</span><span className="text-[8px] uppercase tracking-wider text-white/40">Activity</span></span><span className="grid size-8 shrink-0 place-items-center rounded-full bg-black/25 text-white/45 transition-all group-hover:translate-x-0.5 group-hover:bg-white/[0.09] group-hover:text-white"><ArrowRight className="h-4 w-4" /></span>
          </button>;
        })}</div>}
      <p className="mt-4 flex items-center gap-1.5 text-[9px] text-white/30"><Clock3 className="h-3 w-3" /> Automatic records reflect only data currently returned by the backend.</p>
    </div>
    {editOpen && <EditSheet title="Add developer" address={addressDraft} setAddress={setAddressDraft} label={labelDraft} setLabel={setLabelDraft} error={formError} saving={saving} onClose={() => setEditOpen(false)} onSave={() => void saveDeveloper()} />}
  </div>;
};

const EditSheet: React.FC<{ title: string; address: string; setAddress: (v: string) => void; label: string; setLabel: (v: string) => void; error: string; saving: boolean; onClose: () => void; onSave: () => void }> = ({ title, address, setAddress, label, setLabel, error, saving, onClose, onSave }) => (
  <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" className="w-full max-w-xl rounded-t-[26px] border-t border-white/[0.12] bg-[#111] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-2xl">
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
      <div className="mb-5 flex items-center justify-between"><div><h2 className="text-[15px] font-semibold text-white">{title}</h2><p className="mt-1 text-[10px] text-white/40">Manual preferred-owner settings</p></div><button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-white/60"><X className="h-4 w-4" /></button></div>
      <div className="space-y-4"><label className="block"><span className="mb-1.5 block text-[10px] font-medium text-white/60">Solana wallet address</span><input value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="Paste developer wallet address" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="h-11 w-full rounded-xl border border-white/10 bg-black px-3 font-mono text-[10px] text-white outline-none focus:border-white/30" /></label>
      <label className="block"><span className="mb-1.5 block text-[10px] font-medium text-white/60">Developer label</span><input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 80))} placeholder="Optional name or note" maxLength={80} className="h-11 w-full rounded-xl border border-white/10 bg-black px-3 text-[11px] text-white outline-none focus:border-white/30" /></label>
      {error && <p role="alert" className="text-[10px] text-rose-300">{error}</p>}
      <button type="button" onClick={onSave} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-[11px] font-bold text-black disabled:opacity-50">{saving ? 'Saving…' : <><Check className="h-4 w-4" /> Save developer</>}</button></div>
    </section>
  </div>
);

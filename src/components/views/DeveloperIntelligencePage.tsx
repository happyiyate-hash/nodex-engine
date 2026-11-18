import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, Check, Clock3, Copy, Pencil, Plus, Search, Users, Wallet, X } from 'lucide-react';
import { apiClient } from '../../services/rest';
import { useTerminal } from '../../context/TerminalContext';
import { useToast } from '../ui/ToastProvider';
import { CreatorReputation, CreatorTrainingToken, PreferredOwner } from '../../types';

type Developer = { address: string; owner?: PreferredOwner; reputation?: CreatorReputation };
const shortAddress = (value: string) => value.length > 18 ? value.slice(0, 7) + '…' + value.slice(-7) : value;

export const DeveloperIntelligencePage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { strategyConfig, saveStrategyConfig } = useTerminal();
  const { showToast } = useToast();
  const [records, setRecords] = useState<CreatorReputation[]>([]);
  const [developerTokens, setDeveloperTokens] = useState<Array<{ token: CreatorTrainingToken; detail: Record<string, any> | null }>>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensError, setTokensError] = useState('');
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
    try { setRecords(await apiClient.getCreatorReputation(500)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load developer reputation.'); }
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
      reputation: records.find((r) => r.creator_address === address),
    })).sort((a, b) => {
      if (a.owner && !b.owner) return -1;
      if (b.owner && !a.owner) return 1;
      return (b.reputation?.overall_score ?? -1) - (a.reputation?.overall_score ?? -1);
    });
  }, [records, strategyConfig.preferred_owners]);

  const selected = developers.find((d) => d.address === selectedAddress) || null;

  useEffect(() => {
    if (!selectedAddress) {
      setDeveloperTokens([]);
      setTokensError('');
      setTokensLoading(false);
      return;
    }
    let active = true;
    setTokensLoading(true);
    setTokensError('');
    void (async () => {
      try {
        const training = await apiClient.getCreatorTraining(selectedAddress, 500);
        const matching = [...training.tokens].sort((a, b) => Date.parse(b.launched_at) - Date.parse(a.launched_at));
        const details = await Promise.all(matching.map(async (token) => {
          try { return { token, detail: await apiClient.getTokenState(token.mint_address) }; }
          catch { return { token, detail: null }; }
        }));
        if (active) setDeveloperTokens(details);
      } catch (e) {
        if (active) setTokensError(e instanceof Error ? e.message : 'Could not load this developer’s training records.');
      } finally {
        if (active) setTokensLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selectedAddress]);
  const infoLabel = (developer: Developer) => developer.owner?.label || 'Developer ' + shortAddress(developer.address);
  const filtered = developers.filter((d) => {
    const q = search.trim().toLowerCase();
    return !q || d.address.toLowerCase().includes(q) || (d.owner?.label || 'Developer ' + shortAddress(d.address)).toLowerCase().includes(q);
  });

  const openAdd = () => { setAddressDraft(''); setLabelDraft(''); setFormError(''); setEditOpen(true); };
  const openEdit = () => {
    if (!selected) return;
    setAddressDraft(selected.address);
    setLabelDraft(selected.owner?.label || 'Developer ' + shortAddress(selected.address));
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

  const headerPanel = (title: string, meta: string, back: () => void, action?: React.ReactNode, extra?: React.ReactNode) => (
    <header className={`relative z-10 flex shrink-0 flex-col rounded-b-[22px] bg-[#151515] px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+8px)] ${extra ? 'min-h-[138px]' : 'min-h-[104px]'}`}>
      <div className="flex h-9 min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={back} aria-label="Go back" className="grid size-9 shrink-0 place-items-center rounded-full bg-black/55 text-white shadow-sm active:scale-95"><ArrowLeft className="h-4 w-4" /></button>
          <h1 className="truncate text-[16px] font-semibold tracking-tight text-white">{title}</h1>
        </div>
        {action}
      </div>
      <div className="mt-1 flex justify-end">
        <span className="shrink-0 text-[10px] font-medium text-orange-200/75">{meta}</span>
      </div>
      {extra}
    </header>
  );

  if (selected) {
    const info = selected.reputation;
    return <div className="flex h-full min-h-0 w-full flex-col bg-black text-white">
      {headerPanel('Developer profile', 'PROFILE', () => setSelectedAddress(null),
        <button type="button" onClick={openEdit} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-black/55 px-3 text-[10px] font-semibold text-white active:scale-95"><Pencil className="h-3.5 w-3.5" /> Edit</button>,
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="min-w-0 rounded-lg bg-black/25 px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-1"><span className="truncate text-[9px] text-orange-100/65">Developer score</span><span className="text-[15px] font-bold tabular-nums text-orange-100">{info?.overall_score != null && info.sample_status === 'established' ? info.overall_score.toFixed(1) : '—'}<span className="ml-0.5 text-[8px] font-normal text-white/35">/100</span></span></div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300" style={{ width: `${info?.sample_status === 'established' ? Math.max(0, Math.min(100, info.overall_score ?? 0)) : 0}%` }} /></div><p className="mt-1 text-[8px] text-white/40">{info?.sample_status === 'established' ? 'Established evidence' : info ? 'Score withheld until evidence is established' : 'No reputation evidence yet'}</p>
          </div>
          <div className="min-w-0 rounded-lg bg-black/25 px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-1"><span className="truncate text-[9px] text-amber-100/65">Evidence confidence</span><span className="text-[15px] font-bold tabular-nums text-amber-100">{info ? info.confidence_pct.toFixed(1) : '—'}<span className="ml-0.5 text-[8px] font-normal text-white/35">%</span></span></div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-yellow-200" style={{ width: `${Math.max(0, Math.min(100, info?.confidence_pct ?? 0))}%` }} /></div>
          </div>
        </div>)}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-10 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Recorded tokens</h2>
          <span className="text-[9px] tabular-nums text-white/35">{developerTokens.length} tokens</span>
        </div>
        {tokensLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-[#171717] py-10 text-[10px] text-white/40"><Activity className="h-4 w-4 animate-pulse" /> Loading recorded tokens…</div>
        ) : tokensError ? (
          <div className="rounded-xl bg-[#171717] px-4 py-6 text-center text-[10px] leading-relaxed text-white/45">{tokensError}<button type="button" onClick={() => setSelectedAddress(null)} className="ml-1 text-white underline">Back</button></div>
        ) : developerTokens.length === 0 ? (
          <div className="rounded-xl bg-[#171717] px-4 py-8 text-center text-[10px] leading-relaxed text-white/40">No token launch records are currently associated with this developer.</div>
        ) : (
          <div className="space-y-2">
            {developerTokens.map(({ token, detail }) => {
              const identity = detail?.identity || {};
              const security = detail?.security || {};
              const rawScore = security.safety_score ?? security.security_score ?? security.overall_score ?? security.score;
              const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? Math.max(0, Math.min(100, rawScore)) : null;
              const tokenName = typeof identity.name === 'string' && identity.name.trim() ? identity.name : 'Unknown token';
              const symbol = typeof identity.symbol === 'string' && identity.symbol.trim() ? identity.symbol : '';
              const decision = typeof security.decision === 'string' ? security.decision : 'UNVERIFIED';
              return (
                <article key={token.mint_address} className="rounded-xl bg-[#171717] px-3 py-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-semibold text-white">{tokenName}{symbol ? <span className="ml-1.5 text-[10px] font-medium text-white/45">${symbol}</span> : null}</p>
                      <p className="mt-1 truncate font-mono text-[9px] text-white/35">{shortAddress(token.mint_address)}</p>
                      <p className="mt-1 text-[8px] uppercase tracking-wider text-white/35">{token.lifecycle_status.replace(/_/g, ' ')} · {new Date(token.launched_at).toLocaleDateString()}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[16px] font-bold tabular-nums text-white">{score === null ? '—' : score.toFixed(1) + '%'}</p>
                      <p className="text-[8px] uppercase tracking-wider text-white/40">Security</p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-300 transition-[width]" style={{ width: score === null ? '0%' : score + '%' }} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      {editOpen && <EditSheet title="Edit developer details" address={addressDraft} setAddress={setAddressDraft} label={labelDraft} setLabel={setLabelDraft} error={formError} saving={saving} onClose={() => setEditOpen(false)} onSave={() => void saveDeveloper()} />}
    </div>;
  }

  return <div className="flex h-full min-h-0 w-full flex-col bg-black text-white">
    {headerPanel('Preferred Owners', `${developers.length} developers`, onBack,
      <button type="button" onClick={openAdd} aria-label="Add developer" className="grid size-9 shrink-0 place-items-center rounded-full bg-black/55 text-white active:scale-95"><Plus className="h-4 w-4" /></button>,
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-black/25 px-2.5 py-2"><p className="text-[8px] uppercase tracking-wider text-white/40">Total</p><p className="mt-0.5 text-[17px] font-semibold tabular-nums text-white">{developers.length}</p></div>
        <div className="rounded-lg bg-black/25 px-2.5 py-2"><p className="text-[8px] uppercase tracking-wider text-orange-200/65">Manual</p><p className="mt-0.5 text-[17px] font-semibold tabular-nums text-orange-100">{developers.filter((d) => !!d.owner).length}</p></div>
        <div className="rounded-lg bg-black/25 px-2.5 py-2"><p className="text-[8px] uppercase tracking-wider text-amber-200/65">Auto tracked</p><p className="mt-0.5 text-[17px] font-semibold tabular-nums text-amber-100">{developers.filter((d) => !d.owner && !!d.reputation).length}</p></div>
      </div>)}
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-10 pt-3">
      <label className="relative mb-3 block"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search developer or wallet address" className="h-9 w-full rounded-lg bg-[#171717] pl-9 pr-3 text-[11px] text-white outline-none placeholder:text-white/30 focus:ring-1 focus:ring-amber-400/30" /></label>
      {error && <div className="mb-3 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-[10px] text-amber-200/80">{error}<button type="button" onClick={() => void load()} className="ml-2 underline">Retry</button></div>}
      {loading ? <div className="flex items-center justify-center gap-2 py-12 text-[10px] text-white/40"><Activity className="h-4 w-4 animate-pulse" /> Loading developer records…</div>
        : filtered.length === 0 ? <div className="rounded-xl bg-[#171717] px-5 py-10 text-center"><Users className="mx-auto h-6 w-6 text-white/25" /><p className="mt-3 text-[12px] font-medium text-white/70">{developers.length ? 'No matching developers' : 'No developers tracked yet'}</p><p className="mt-1 text-[10px] leading-relaxed text-white/35">Add a wallet manually or wait for the backend to collect launch and market evidence.</p><button type="button" onClick={openAdd} className="mt-4 rounded-full bg-white px-4 py-2 text-[10px] font-semibold text-black">Add developer</button></div>
        : <div className="space-y-2">{filtered.map((developer) => {
          const info = developer.reputation; const label = developer.owner?.label || ('Developer ' + shortAddress(developer.address));
          const palette = 'bg-[#171717]';
          return <button key={developer.address} type="button" onClick={() => setSelectedAddress(developer.address)} className={`group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-white shadow-sm transition-colors hover:bg-[#1d1d1d] active:scale-[0.99] ${palette}`}>
            <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${'bg-white/[0.07]'}`}><Wallet className={`h-[17px] w-[17px] ${'text-white'}`} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold text-white">{label}</span><span className="mt-1 block truncate font-mono text-[9px] text-white/40">{shortAddress(developer.address)}</span><span className="mt-1.5 flex flex-wrap items-center gap-1.5">{developer.owner && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold text-white/80">MANUAL</span>}{info && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] font-semibold text-white/80">TRACKED</span>}{!info && <span className="text-[8px] text-white/35">Awaiting observations</span>}{info && <span className="rounded-full bg-amber-300/10 px-1.5 py-0.5 text-[8px] font-semibold text-amber-100/80">{info.sample_status.replace(/_/g, ' ').toUpperCase()}</span>}</span></span>
            <span className="shrink-0 text-right"><span className={`block text-[13px] font-bold tabular-nums ${info ? 'text-white' : 'text-white/40'}`}>{info?.overall_score != null && info.sample_status === 'established' ? info.overall_score.toFixed(1) : '—'}</span><span className="text-[8px] uppercase tracking-wider text-white/40">Reputation</span><span className="mt-0.5 block text-[8px] text-white/35">{info ? (info.sample_status === 'established' ? 'ESTABLISHED' : info.sample_status === 'developing' ? 'DEVELOPING' : 'INSUFFICIENT DATA') + ' · ' + info.confidence_pct.toFixed(0) + '% evidence' : 'AWAITING EVIDENCE'}</span></span><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.07] text-white transition-all group-hover:translate-x-0.5 group-hover:bg-white/[0.12] group-hover:text-white"><ArrowRight className="h-4 w-4" /></span>
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

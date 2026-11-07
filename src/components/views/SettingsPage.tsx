import React, { useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Bell, Check, ChevronRight,
  Database, HardDrive, Pause, Play, PlugZap, Radar, RefreshCw,
  SlidersHorizontal, Trash2, Wifi,
} from 'lucide-react';
import { useTerminal } from '../../context/TerminalContext';
import { apiClient } from '../../services/api';
import { StrategyPage } from './StrategyPage';

type RuntimeControlKey = 'token_discovery_enabled' | 'new_entries_enabled' | 'position_monitoring_enabled';
type SettingsSection =
  | 'home'
  | 'engine'
  | 'connections'
  | 'discovery'
  | 'trading'
  | 'notifications'
  | 'storage'
  | 'diagnostics';

const sections = [
  { id: 'engine', title: 'Engine Control', description: 'Start, pause and manage engine operations.', icon: Activity },
  { id: 'connections', title: 'API & Connections', description: 'Connect this app to your NodeX backend.', icon: PlugZap },
  { id: 'discovery', title: 'Token Discovery', description: 'Scanning sources, approval modes and filters.', icon: Radar },
  { id: 'trading', title: 'Trading Configuration', description: 'Stop loss, take profit, position sizing and risk.', icon: SlidersHorizontal },
  { id: 'notifications', title: 'Notifications', description: 'Choose which engine events should alert you.', icon: Bell },
  { id: 'storage', title: 'Data & Storage', description: 'Database records, history and cleanup tools.', icon: Database },
  { id: 'diagnostics', title: 'Diagnostics & Monitoring', description: 'Engine health, connections and runtime logs.', icon: Activity },
] as const;

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="block space-y-1.5">
    <span className="block text-[11px] font-medium text-white/75">{label}</span>
    {children}
    {hint && <span className="block text-[10px] leading-relaxed text-white/35">{hint}</span>}
  </label>
);

const inputClass = 'w-full rounded-xl border border-white/[0.10] bg-[#101010] px-3.5 py-3 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-white/30';

const SectionHeader = ({ title, description, onBack, action }: {
  title: string; description: string; onBack: () => void; action?: React.ReactNode;
}) => (
  <header className="sticky top-0 z-40 -mx-4 border-b border-white/[0.08] bg-black/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
    <div className="flex min-h-10 items-center gap-3">
      <button type="button" onClick={onBack} aria-label="Back to Settings" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/75 transition-colors hover:bg-white/[0.08] active:scale-95">
        <ArrowLeft className="h-[18px] w-[18px]" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-white">{title}</h1>
      </div>
      {action}
    </div>
    <p className="ml-12 mt-0.5 text-[10px] text-white/40">{description}</p>
  </header>
);

const StatusLine = ({ label, value, good }: { label: string; value: string; good?: boolean }) => (
  <div className="flex items-center justify-between gap-3 py-3">
    <span className="text-[12px] text-white/60">{label}</span>
    <span className={`text-[11px] font-medium ${good === undefined ? 'text-white/65' : good ? 'text-emerald-300' : 'text-amber-300'}`}>{value}</span>
  </div>
);

export const SettingsPage: React.FC<{ onSubpageChange?: (isSubpage: boolean) => void }> = ({ onSubpageChange }) => {
  const {
    engineStatus, toggleEngine, settings, updateSettings, backendError,
  } = useTerminal();
  const [section, setSection] = useState<SettingsSection>('home');
  const navigateSection = (next: SettingsSection) => { setSection(next); onSubpageChange?.(next !== 'home'); };
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [websocketUrl, setWebsocketUrl] = useState(settings.wsUrlOverride);
  const [operatorKey, setOperatorKey] = useState(settings.adminApiKey);
  const [savingConnection, setSavingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionErrorField, setConnectionErrorField] = useState<'url' | 'key' | ''>('');
  const [connectionSuccess, setConnectionSuccess] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [storageMessage, setStorageMessage] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [notificationChoices, setNotificationChoices] = useState({
    engine: true, connection: true, qualified: true, paperTrades: true, risk: true, diagnostics: true,
  });
  const [runtimeControls, setRuntimeControls] = useState({
    token_discovery_enabled: false,
    new_entries_enabled: false,
    position_monitoring_enabled: true,
  });
  const [runtimeControlMessage, setRuntimeControlMessage] = useState('');
  const [updatingRuntimeControl, setUpdatingRuntimeControl] = useState(false);
  const [engineMode, setEngineMode] = useState<'paper' | 'real'>('paper');
  const [availableModes, setAvailableModes] = useState({ paper: true, real: false });

  useEffect(() => {
    let active = true;
    apiClient.getEngineControl().then((state) => {
      if (!active) return;
      setEngineMode(state.mode);
      setAvailableModes(state.available_modes || {
        paper: state.mode === 'paper',
        real: state.real_trading_available,
      });
      setRuntimeControls({
        token_discovery_enabled: state.token_discovery_enabled,
        new_entries_enabled: state.new_entries_enabled,
        position_monitoring_enabled: state.position_monitoring_enabled,
      });
    }).catch((error) => {
      if (active) setRuntimeControlMessage(error instanceof Error ? error.message : 'Could not load runtime controls.');
    });
    return () => { active = false; };
  }, []);

  const updateRuntimeControl = async (key: RuntimeControlKey, enabled: boolean) => {
    setUpdatingRuntimeControl(true);
    setRuntimeControlMessage('');
    try {
      const updates: { token_discovery_enabled?: boolean; new_entries_enabled?: boolean; position_monitoring_enabled?: boolean } = {};
      updates[key] = enabled;
      const result = await apiClient.updateEngineControl('configure', updates);
      setRuntimeControls({
        token_discovery_enabled: result.engine.token_discovery_enabled,
        new_entries_enabled: result.engine.new_entries_enabled,
        position_monitoring_enabled: result.engine.position_monitoring_enabled,
      });
      setRuntimeControlMessage('Runtime control updated.');
    } catch (error) {
      setRuntimeControlMessage(error instanceof Error ? error.message : 'Could not update runtime control.');
    } finally {
      setUpdatingRuntimeControl(false);
    }
  };

  useEffect(() => {
    setBackendUrl(settings.backendUrl);
    setWebsocketUrl(settings.wsUrlOverride);
    setOperatorKey(settings.adminApiKey);
  }, [settings.backendUrl, settings.wsUrl, settings.adminApiKey]);

  const connectionDirty =
    backendUrl.trim() !== settings.backendUrl ||
    websocketUrl.trim() !== settings.wsUrlOverride ||
    operatorKey.trim() !== settings.adminApiKey;

  const attachConnection = async () => {
    setSavingConnection(true);
    setConnectionMessage('');
    setConnectionErrorField('');
    setConnectionSuccess(false);
    try {
      const cleanBackendUrl = backendUrl.trim().replace(/\\/$/, '');
      if (!cleanBackendUrl) {
        setConnectionErrorField('url');
        throw new Error('Enter the REST API server URL.');
      }
      const parsedBackend = new URL(cleanBackendUrl);
      if (!['http:', 'https:'].includes(parsedBackend.protocol) || parsedBackend.pathname !== '/' || parsedBackend.search || parsedBackend.hash) {
        setConnectionErrorField('url');
        throw new Error('Enter a valid server origin, e.g. https://your-domain.com.');
      }
      const cleanWsUrl = websocketUrl.trim();
      if (cleanWsUrl) {
        const parsedWs = new URL(cleanWsUrl);
        if (!['ws:', 'wss:'].includes(parsedWs.protocol)) {
          setConnectionErrorField('url');
          throw new Error('WebSocket URL must start with ws:// or wss://.');
        }
      }
      if (!operatorKey.trim()) {
        setConnectionErrorField('key');
        throw new Error('Enter the backend API key.');
      }

      await apiClient.verifyConnection({
        backendUrl: cleanBackendUrl,
        wsUrlOverride: cleanWsUrl,
        adminApiKey: operatorKey.trim(),
      });

      updateSettings({
        backendUrl: cleanBackendUrl,
        wsUrlOverride: cleanWsUrl,
        adminApiKey: operatorKey.trim(),
      });
      setConnectionSuccess(true);
      setConnectionMessage('Attached to NodeX backend.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not attach to the backend.';
      if (/401|403|unauthori[sz]ed|forbidden|operator api key|admin key/i.test(message)) {
        setConnectionErrorField('key');
        setConnectionMessage('API key not accepted. Check the key and try again.');
      } else {
        setConnectionErrorField('url');
        setConnectionMessage(/could not reach|timed out|failed to fetch|networkerror/i.test(message)
          ? 'Backend not reachable. Check the REST URL, server and CORS settings.'
          : message);
      }
    } finally {
      setSavingConnection(false);
    }
  };

  const clearEngineHistory = async () => {
    setClearingHistory(true);
    setStorageMessage('');
    try {
      const result = await apiClient.clearEngineHistory(settings.adminApiKey);
      setStorageMessage(`Cleanup completed · ${result.deleted_token_records} token records and ${result.deleted_raw_event_records} raw event records removed. Paper-trading records preserved.`);
      setShowClearConfirm(false);
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : 'Engine history cleanup failed.');
    } finally {
      setClearingHistory(false);
    }
  };

  const pageTitle = sections.find((item) => item.id === section)?.title || 'Settings';
  const pageDescription = sections.find((item) => item.id === section)?.description || 'Manage your NodeX engine configuration.';

  return (
    <div className={`w-full bg-black px-4 text-white ${section === 'home' ? 'min-h-[calc(100dvh-6rem)] pb-28' : 'min-h-full pb-8'}`}>
      {section === 'home' ? (
        <>
          <header className="sticky top-0 z-40 -mx-4 border-b border-white/[0.08] bg-black/95 px-4 backdrop-blur-xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex h-14 items-center justify-between">
              <h1 className="text-[15px] font-semibold tracking-tight text-white">Settings</h1>
              <button
                type="button"
                onClick={toggleEngine}
                aria-label={engineStatus.running ? 'Pause engine' : 'Resume engine'}
                title={engineStatus.running ? 'Pause engine' : 'Resume engine'}
                className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_2px_10px_rgba(255,255,255,0.08)] transition-transform active:scale-95"
              >
                {engineStatus.running ? <Pause className="h-4 w-4" strokeWidth={2.5} /> : <Play className="h-4 w-4 fill-current" strokeWidth={2.5} />}
              </button>
            </div>
          </header>

          <div className="pb-4 pt-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">NodeX control centre</p>
                <p className="mt-1 text-[12px] text-white/55">Configuration and engine management</p>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider ${engineStatus.running ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300' : 'border-amber-500/25 bg-amber-500/[0.08] text-amber-300'}`}>
                {engineStatus.running ? 'Running' : 'Paused'}
              </span>
            </div>
            <div className="divide-y divide-white/[0.07]">
              {sections.map(({ id, title, description, icon: Icon }) => (
                <button key={id} type="button" onClick={() => navigateSection(id)} className="group flex w-full items-center gap-3 py-4 text-left transition-colors active:bg-white/[0.025]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171717] text-white/80">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-white/90">{title}</span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-white/40">{description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-white/30 transition-transform group-active:translate-x-0.5" />
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <SectionHeader
          title={pageTitle}
          description={pageDescription}
          onBack={() => navigateSection('home')}
          action={section === 'trading' ? (
            <div className="flex shrink-0 items-center rounded-full border border-white/[0.12] bg-white/[0.035] p-1" aria-label="Trading mode">
              <span
                aria-current={engineMode === 'paper' ? 'true' : undefined}
                title={availableModes.paper ? 'Paper trading is available' : 'Paper trading is unavailable'}
                className={`rounded-full px-3 py-1.5 text-[10px] font-semibold ${engineMode === 'paper' ? 'bg-white text-black' : 'text-white/35'}`}
              >Paper</span>
              <button
                type="button"
                disabled={!availableModes.real}
                aria-disabled={!availableModes.real}
                title={availableModes.real ? 'Real trading is available' : 'Real trading is not available yet'}
                className={`rounded-full px-3 py-1.5 text-[10px] font-medium ${engineMode === 'real' ? 'bg-white text-black' : 'text-white/25'} disabled:cursor-not-allowed`}
              >Real</button>
            </div>
          ) : undefined}
        />
      )}

      {section === 'engine' && (
        <div className="space-y-5 pt-5">
          <div className="border-b border-white/[0.08] pb-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-white">Engine runtime</p>
                <p className="mt-1 text-[10px] text-white/40">Control the running backend process.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] ${engineStatus.running ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300'}`}>{engineStatus.running ? 'Running' : 'Paused'}</span>
            </div>
            <button type="button" onClick={toggleEngine} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-[12px] font-semibold text-black transition-transform active:scale-[0.99]">
              {engineStatus.running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {engineStatus.running ? 'Pause engine' : 'Resume engine'}
            </button>
            <p className="mt-2 text-[10px] text-white/35">This sends the existing pause/resume command to the backend.</p>
          </div>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">Runtime controls</p>
            {([
              ['token_discovery_enabled', 'Token discovery', 'Allow the engine to process newly discovered launches.'],
              ['new_entries_enabled', 'New paper entries', 'Allow new simulated positions when strategy rules pass.'],
              ['position_monitoring_enabled', 'Position monitoring', 'Continue tracking and marking existing open positions.'],
            ] as const).map(([key, title, detail]) => (
              <label key={key} className="flex items-center justify-between gap-3 border-b border-white/[0.07] py-3">
                <span><span className="block text-[12px] text-white/80">{title}</span><span className="mt-0.5 block text-[10px] text-white/35">{detail}</span></span>
                <input
                  type="checkbox"
                  checked={runtimeControls[key]}
                  disabled={updatingRuntimeControl || !settings.adminApiKey}
                  onChange={(event) => updateRuntimeControl(key, event.target.checked)}
                  className="h-4 w-4 accent-white disabled:opacity-40"
                />
              </label>
            ))}
          </div>
          {runtimeControlMessage && <p className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-[10px] text-white/65">{runtimeControlMessage}</p>}
          {!settings.adminApiKey && <p className="text-[10px] text-amber-200/75">Save the Engine API key in API & Connections to change runtime controls.</p>}
          {backendError && <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-3 text-[10px] text-amber-200">{backendError}</p>}
        </div>
      )}

      {section === 'connections' && (
        <div className="space-y-4 pt-5 pb-28">
          <Field label="REST API server URL">
            <input
              className={`${inputClass} ${connectionErrorField === 'url' ? 'border-red-400 focus:border-red-400' : ''}`}
              type="url"
              value={backendUrl}
              onChange={(e) => { setBackendUrl(e.target.value); setConnectionErrorField(''); setConnectionMessage(''); setConnectionSuccess(false); }}
              placeholder="https://your-server.com"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          <Field label="WebSocket URL (optional)">
            <input
              className={inputClass}
              type="url"
              value={websocketUrl}
              onChange={(e) => { setWebsocketUrl(e.target.value); setConnectionMessage(''); setConnectionSuccess(false); }}
              placeholder="wss://your-server.com/api/v1/ws"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Backend API key">
            <input
              className={`${inputClass} ${connectionErrorField === 'key' ? 'border-red-400 focus:border-red-400' : ''}`}
              type="password"
              value={operatorKey}
              onChange={(e) => { setOperatorKey(e.target.value); setConnectionErrorField(''); setConnectionMessage(''); setConnectionSuccess(false); }}
              placeholder="Paste operator API key"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="new-password"
            />
          </Field>
          {connectionMessage && (
            <p className={`text-[11px] ${connectionSuccess ? 'text-emerald-300' : 'text-red-300'}`} role="status">
              {connectionMessage}
            </p>
          )}
          {connectionDirty && (
            <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] z-50 flex justify-center px-5 pointer-events-none">
              <button
                type="button"
                onClick={attachConnection}
                disabled={savingConnection}
                className="pointer-events-auto flex min-w-32 items-center justify-center gap-2 rounded-xl bg-white px-7 py-3 text-[13px] font-semibold text-black shadow-[0_8px_30px_rgba(0,0,0,0.55)] transition-transform active:scale-95 disabled:opacity-60"
              >
                {savingConnection ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                {savingConnection ? 'Attaching…' : 'Attach'}
              </button>
            </div>
          )}
        </div>
      )}

      {section === 'discovery' && (
        <div className="space-y-4 pt-5">
          <div><p className="text-[13px] font-semibold">Scanning configuration</p><p className="mt-1 text-[10px] text-white/40">These controls define how the engine should discover and qualify launches.</p></div>
          {[
            ['Automatic approval', 'Approve tokens when all configured qualification rules pass.'],
            ['Manual approval', 'Hold qualifying tokens for an operator decision.'],
            ['Pump.fun source', 'Include new Pump.fun launches in discovery.'],
            ['PumpSwap source', 'Include supported PumpSwap launch activity.'],
          ].map(([title, description]) => (
            <div key={title} className="border-b border-white/[0.08] py-3">
              <p className="text-[12px] text-white/85">{title}</p><p className="mt-1 text-[10px] text-white/40">{description}</p>
            </div>
          ))}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[10px] leading-relaxed text-amber-100/75">Discovery configuration is not yet connected to a backend persistence endpoint. No changes are applied from this screen yet.</div>
        </div>
      )}

      {section === 'trading' && (
        <div className="pt-3">
          <div className="mb-3 flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
            <span className="text-[10px] text-white/45">Backend-reported mode</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/80">{engineMode}</span>
          </div>
          {!availableModes.real && (
            <p className="mb-3 text-[10px] text-white/35">Real trading is not available yet. The backend currently supports paper trading only.</p>
          )}
          <StrategyPage />
        </div>
      )}

      {section === 'notifications' && (
        <div className="space-y-1 pt-5">
          <p className="mb-3 text-[10px] text-white/40">Choose which categories should generate notifications. Events remain available in the Events tab.</p>
          {([
            ['engine', 'Engine state changes', 'Engine started, paused or stopped.'],
            ['connection', 'Connection alerts', 'Provider disconnected or recovered.'],
            ['qualified', 'Token qualification', 'A token passed or failed discovery rules.'],
            ['paperTrades', 'Paper-trading activity', 'Simulated positions opened or closed.'],
            ['risk', 'Risk triggers', 'Stop loss, take profit or risk limits triggered.'],
            ['diagnostics', 'System diagnostics', 'Important errors and database warnings.'],
          ] as const).map(([key, title, description]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between gap-3 border-b border-white/[0.08] py-3">
              <span><span className="block text-[12px] text-white/85">{title}</span><span className="mt-0.5 block text-[10px] text-white/40">{description}</span></span>
              <input type="checkbox" checked={notificationChoices[key]} onChange={(e) => setNotificationChoices((current) => ({ ...current, [key]: e.target.checked }))} className="h-4 w-4 accent-white" />
            </label>
          ))}
          <p className="pt-3 text-[10px] text-white/35">Notification preferences are currently held in this screen only; persistent notification preferences will be added with the backend settings API.</p>
        </div>
      )}

      {section === 'storage' && (
        <div className="space-y-5 pt-5">
          <div><p className="text-[13px] font-semibold">Engine data maintenance</p><p className="mt-1 text-[10px] text-white/40">Manage stored token and raw event history on the backend.</p></div>
          <div className="flex items-start gap-3 border-b border-white/[0.08] pb-4">
            <HardDrive className="mt-0.5 h-5 w-5 text-white/55" />
            <div><p className="text-[12px] text-white/85">Clear engine history</p><p className="mt-1 text-[10px] leading-relaxed text-white/40">Uses the existing backend maintenance endpoint to remove token records and raw event records. Paper-trading records are preserved by the endpoint.</p></div>
          </div>
          {!showClearConfirm ? (
            <button type="button" onClick={() => setShowClearConfirm(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/25 py-3 text-[12px] font-medium text-red-300"><Trash2 className="h-4 w-4" /> Review history cleanup</button>
          ) : (
            <div className="space-y-3 rounded-xl border border-red-500/25 bg-red-500/[0.05] p-3">
              <p className="text-[12px] font-semibold text-red-200">Clear stored engine history?</p>
              <p className="text-[10px] leading-relaxed text-red-100/65">This action cannot be undone. Token and raw event history will be removed. Paper-trading records are preserved by the current endpoint.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowClearConfirm(false)} className="flex-1 rounded-lg border border-white/15 py-2 text-[11px] text-white/70">Cancel</button>
                <button type="button" onClick={clearEngineHistory} disabled={clearingHistory || !settings.adminApiKey} className="flex-1 rounded-lg bg-red-500 py-2 text-[11px] font-semibold text-white disabled:opacity-40">{clearingHistory ? 'Cleaning…' : 'Confirm cleanup'}</button>
              </div>
              {!settings.adminApiKey && <p className="text-[10px] text-amber-200/80">This maintenance action requires backend operator authorization. Configure that authorization in the backend deployment; it is intentionally not exposed in this app.</p>}
            </div>
          )}
          {storageMessage && <p className="break-words rounded-lg border border-white/[0.08] bg-white/[0.025] p-3 text-[10px] text-white/65">{storageMessage}</p>}
        </div>
      )}

      {section === 'diagnostics' && (
        <div className="space-y-4 pt-5">
          <div><p className="text-[13px] font-semibold">Runtime health</p><p className="mt-1 text-[10px] text-white/40">Live values currently reported by the connected backend.</p></div>
          <div className="divide-y divide-white/[0.08]">
            <StatusLine label="Engine" value={engineStatus.running ? 'Running' : 'Paused'} good={engineStatus.running} />
            <StatusLine label="Solana stream" value={engineStatus.solana_connected ? 'Connected' : 'Disconnected'} good={engineStatus.solana_connected} />
            <StatusLine label="PumpSwap stream" value={engineStatus.pumpswap_connected ? 'Connected' : 'Disconnected'} good={engineStatus.pumpswap_connected} />
            <StatusLine label="WebSocket" value={engineStatus.ws_status || 'Unknown'} good={engineStatus.ws_status === 'connected'} />
            <StatusLine label="Database" value={engineStatus.database_status || 'Unknown'} />
            <StatusLine label="RPC provider" value={engineStatus.provider_name || 'Unknown'} />
            <StatusLine label="RPC latency" value={engineStatus.rpc_latency_ms ? `${engineStatus.rpc_latency_ms} ms` : 'Not reported'} />
            <StatusLine label="Reconnect attempts" value={String(engineStatus.reconnection_count ?? 0)} />
          </div>
          <button type="button" onClick={testConnection} disabled={testingConnection} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.12] py-3 text-[12px] text-white/80 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${testingConnection ? 'animate-spin' : ''}`} /> {testingConnection ? 'Checking…' : 'Check backend health'}
          </button>
          {backendError && <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[10px] text-amber-100/75"><AlertTriangle className="h-4 w-4 shrink-0" />{backendError}</div>}
        </div>
      )}
    </div>
  );
};

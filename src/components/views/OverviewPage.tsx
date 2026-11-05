import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenLaunchRecord, NodeXEvent } from '../../types';
import { Activity, Circle, Copy, ExternalLink, LoaderCircle, Search, ShieldCheck, ShieldX } from 'lucide-react';

type ChangeDirection = 'up' | 'down' | null;
type FeedFilter = 'all' | 'analyzing' | 'qualified' | 'paper';

interface RollingDigitProps {
  digit: string;
  balanceDirection: ChangeDirection;
}

type PipelineStatus = 'DETECTED' | 'ANALYZING' | 'QUALIFIED' | 'REJECTED' | 'PAPER ENTRY' | 'BUY FAILED';

interface LaunchView {
  launch: TokenLaunchRecord;
  status: PipelineStatus;
  reason: string;
  updatedAt: string;
  scanStarted: boolean;
}

const DEMO_TOKEN_SEEDS = [
  {
    "name": "Aether",
    "symbol": "AETH",
    "outcome": "REJECTED"
  },
  {
    "name": "Nova Protocol",
    "symbol": "NOVA",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Velora",
    "symbol": "VLR",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Orbit Labs",
    "symbol": "ORBT",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Nebula",
    "symbol": "NEB",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Solstice",
    "symbol": "SOLT",
    "outcome": "REJECTED"
  },
  {
    "name": "Kairo",
    "symbol": "KAI",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Prism",
    "symbol": "PRSM",
    "outcome": "REJECTED"
  },
  {
    "name": "Vertex",
    "symbol": "VRTX",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Lumen",
    "symbol": "LMN",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Driftwood",
    "symbol": "DRFT",
    "outcome": "REJECTED"
  },
  {
    "name": "Axiom",
    "symbol": "AXM",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Monarch",
    "symbol": "MNCH",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Helix",
    "symbol": "HLX",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Aurora",
    "symbol": "AURA",
    "outcome": "REJECTED"
  },
  {
    "name": "Quanta",
    "symbol": "QNT",
    "outcome": "REJECTED"
  },
  {
    "name": "Solis",
    "symbol": "SOLS",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Cipher",
    "symbol": "CIPH",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Flux",
    "symbol": "FLUX",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Zenith",
    "symbol": "ZEN",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Mirage",
    "symbol": "MRG",
    "outcome": "REJECTED"
  },
  {
    "name": "Atlas",
    "symbol": "ATLS",
    "outcome": "REJECTED"
  },
  {
    "name": "Onyx",
    "symbol": "ONYX",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Pulse",
    "symbol": "PLS",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Cinder",
    "symbol": "CNDR",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Echo",
    "symbol": "ECHO",
    "outcome": "REJECTED"
  },
  {
    "name": "Vanta",
    "symbol": "VNT",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Sable",
    "symbol": "SABL",
    "outcome": "QUALIFIED"
  },
  {
    "name": "Lyra",
    "symbol": "LYRA",
    "outcome": "REJECTED"
  },
  {
    "name": "Astra",
    "symbol": "ASTR",
    "outcome": "QUALIFIED"
  }
] as const;

interface DemoLaunchView extends LaunchView {
  demo: true;
  progress: number;
  scanStage: string;
  arrivalKey: string;
}

const REEL_DIGITS = Array.from({ length: 50 }, (_, index) => String(index % 10));

const RollingDigit: React.FC<RollingDigitProps> = ({ digit, balanceDirection }) => {
  const initialIndex = 20 + Number(digit);
  const lastDigit = useRef(digit);
  const targetIndex = useRef(initialIndex);
  const frameRef = useRef<number | null>(null);
  const [reelIndex, setReelIndex] = useState(initialIndex);
  const [isRolling, setIsRolling] = useState(false);

  useLayoutEffect(() => {
    const previous = lastDigit.current;
    if (previous === digit) return;
    lastDigit.current = digit;
    const from = Number(previous);
    const to = Number(digit);
    if (from === to) return;

    let nextIndex = targetIndex.current;
    if (from === 9 && to === 0 && balanceDirection === 'up') nextIndex += 1;
    else if (from === 0 && to === 9 && balanceDirection === 'down') nextIndex -= 1;
    else if (to > from) nextIndex += to - from;
    else nextIndex -= from - to;

    targetIndex.current = nextIndex;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    setIsRolling(false);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        setIsRolling(true);
        setReelIndex(nextIndex);
        frameRef.current = null;
      });
    });
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [digit, balanceDirection]);

  const finishRoll = (event: React.TransitionEvent<HTMLSpanElement>) => {
    if (event.propertyName !== 'transform' || !isRolling) return;
    const centeredIndex = 20 + Number(digit);
    targetIndex.current = centeredIndex;
    setIsRolling(false);
    setReelIndex(centeredIndex);
  };

  return (
    <span className="inline-block h-[1em] w-[0.62em] min-w-[0.62em] shrink-0 overflow-hidden align-bottom text-center">
      <span onTransitionEnd={finishRoll} className="flex flex-col will-change-transform" style={{
        transform: `translate3d(0, -${reelIndex}em, 0)`,
        transition: isRolling ? 'transform 420ms cubic-bezier(0.22, 0.72, 0.25, 1)' : 'none',
      }}>
        {REEL_DIGITS.map((value, index) => <span className="block h-[1em] w-full shrink-0 leading-[1em]" key={index}>{value}</span>)}
      </span>
    </span>
  );
};

const getLaunchView = (launch: TokenLaunchRecord, events: NodeXEvent[]): LaunchView => {
  const related = events.filter((event) =>
    event.token_mint === launch.mint_address || event.data?.mint_address === launch.mint_address
  );
  const findEvent = (type: string) => related.find((event) => event.event_type === type);
  const scanUpdate = findEvent('token_scan_update') || findEvent('safety_check_completed');
  const scanStarted = Boolean(findEvent('token_scan_started'));
  const paperBuy = findEvent('paper_buy_executed');
  const paperBuyFailed = findEvent('paper_buy_failed');
  const strategyRejected = findEvent('strategy_rejected_token');
  const decision = String(scanUpdate?.data?.decision || scanUpdate?.data?.status || '').toLowerCase();

  let status: PipelineStatus = 'DETECTED';
  let reason = 'Launch detected. Waiting for the security scanner.';
  let updatedAt = launch.detected_at;

  if (paperBuy) {
    status = 'PAPER ENTRY';
    reason = 'Paper entry confirmed by the backend.';
    updatedAt = paperBuy.timestamp;
  } else if (paperBuyFailed) {
    status = 'BUY FAILED';
    reason = String(paperBuyFailed.data?.reason || paperBuyFailed.data?.message || 'Paper entry was not completed.');
    updatedAt = paperBuyFailed.timestamp;
  } else if (strategyRejected || decision.includes('reject')) {
    status = 'REJECTED';
    reason = String(strategyRejected?.data?.reason || strategyRejected?.data?.message || scanUpdate?.data?.decision_reason || scanUpdate?.data?.reason || 'The token did not pass the risk or strategy checks.');
    updatedAt = (strategyRejected || scanUpdate)!.timestamp;
  } else if (decision.includes('approv') || decision.includes('qualif')) {
    status = 'QUALIFIED';
    reason = String(scanUpdate?.data?.decision_reason || scanUpdate?.data?.reason || 'Security scan completed and strategy filters passed.');
    updatedAt = scanUpdate!.timestamp;
  } else if (scanStarted || scanUpdate) {
    status = scanUpdate ? 'ANALYZING' : 'ANALYZING';
    reason = scanUpdate
      ? String(scanUpdate.data?.message || scanUpdate.data?.reason || 'Security scan update received.')
      : 'Security checks are running.';
    updatedAt = (scanUpdate || findEvent('token_scan_started'))!.timestamp;
  }

  return { launch, status, reason, updatedAt, scanStarted };
};

const timeAgo = (value: string) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'time unavailable';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

const statusStyle: Record<PipelineStatus, string> = {
  DETECTED: 'border-white/10 bg-white/[0.045] text-[#b7b7b7]',
  ANALYZING: 'border-amber-500/20 bg-amber-500/[0.07] text-[#d2b47c]',
  QUALIFIED: 'border-emerald-500/20 bg-emerald-500/[0.07] text-[#83b982]',
  REJECTED: 'border-red-500/20 bg-red-500/[0.07] text-[#c77b7b]',
  'PAPER ENTRY': 'border-emerald-500/25 bg-emerald-500/[0.10] text-[#83b982]',
  'BUY FAILED': 'border-red-500/20 bg-red-500/[0.07] text-[#c77b7b]',
};

export const OverviewPage: React.FC = () => {
  const { launches, events, engineStatus } = useTerminal();
  const [portfolioValue, setPortfolioValue] = useState(12840.56);
  const [profitLoss, setProfitLoss] = useState(12.4);
  const [portfolioFlash, setPortfolioFlash] = useState<ChangeDirection>(null);
  const [balanceDirection, setBalanceDirection] = useState<ChangeDirection>(null);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [demoLaunches, setDemoLaunches] = useState<DemoLaunchView[]>([]);
  const [expandedScans, setExpandedScans] = useState<string[]>([]);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const movements = [-18.75, 32.4, -41.2, 55.6, -22.3, 14.8, -35.5, 48.2, -9.6, 26.1];
    let tick = 0;
    let flashStart: ReturnType<typeof setTimeout> | null = null;
    const scheduleUpdate = () => {
      updateTimer.current = setTimeout(() => {
        const change = movements[tick % movements.length];
        tick += 1;
        const direction: ChangeDirection = change >= 0 ? 'up' : 'down';
        setBalanceDirection(direction);
        setPortfolioValue((current) => Math.max(0, current + change));
        setProfitLoss((current) => current + change);
        setPortfolioFlash(null);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashStart = setTimeout(() => setPortfolioFlash(direction), 16);
        flashTimer.current = setTimeout(() => setPortfolioFlash(null), 190);
        scheduleUpdate();
      }, 300 + Math.floor(Math.random() * 1800));
    };
    scheduleUpdate();
    return () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (flashStart) clearTimeout(flashStart);
    };
  }, []);

  // Demo-only stream: 30 fixed sample tokens arrive one by one. Each token
  // advances on its own clock so several scans overlap naturally.
  useEffect(() => {
    const startedAt = Date.now();
    const arrivalInterval = 900;
    const scanDuration = 5200;
    const refresh = () => {
      const elapsed = Date.now() - startedAt;
      const totalArrivals = Math.floor(elapsed / arrivalInterval) + 1;
      const firstArrival = Math.max(0, totalArrivals - 30);
      const visible: DemoLaunchView[] = [];

      for (let arrival = firstArrival; arrival < totalArrivals; arrival += 1) {
        const seedIndex = arrival % DEMO_TOKEN_SEEDS.length;
        const seed = DEMO_TOKEN_SEEDS[seedIndex];
        const age = elapsed - arrival * arrivalInterval;
        const cycle = Math.floor(arrival / DEMO_TOKEN_SEEDS.length);
        const detectedAt = new Date(Date.now() - age).toISOString();
        const status: PipelineStatus = age < 650
          ? 'DETECTED'
          : age < scanDuration
            ? 'ANALYZING'
            : seed.outcome;
        const progress = status === 'DETECTED'
          ? 0
          : status === 'ANALYZING'
            ? Math.min(94, Math.round(((age - 650) / (scanDuration - 650)) * 100))
            : 100;
        const scanStage = status === 'DETECTED'
          ? 'New launch received'
          : status === 'ANALYZING'
            ? progress < 28 ? 'Checking token authorities' : progress < 55 ? 'Inspecting holder distribution' : progress < 82 ? 'Reviewing liquidity signals' : 'Finalizing risk assessment'
            : status === 'QUALIFIED'
              ? 'Passed demo strategy filters'
              : 'Demo risk checks failed';

        const mint = `DEMO-${seed.symbol}-${cycle}-${arrival}`;
        const launch: TokenLaunchRecord = {
          id: mint,
          mint_address: mint,
          creator_address: null,
          source: 'pump.fun · demo',
          signature: mint,
          slot: 0,
          detected_at: detectedAt,
        };
        visible.push({
          launch,
          status,
          reason: scanStage,
          updatedAt: new Date(Date.now() - Math.max(0, age - 650)).toISOString(),
          scanStarted: age >= 650,
          demo: true,
          progress,
          scanStage,
          arrivalKey: mint,
        });
      }
      setDemoLaunches(visible.reverse());
    };

    refresh();
    const timer = setInterval(refresh, 250);
    return () => clearInterval(timer);
  }, []);

  const realLaunchViews = useMemo(
    () => launches.map((launch) => ({ ...getLaunchView(launch, events), demo: false as const, progress: 0, scanStage: '', arrivalKey: launch.id || launch.signature })),
    [launches, events]
  );
  const launchViews = useMemo(
    () => [...demoLaunches, ...realLaunchViews].sort((a, b) => new Date(b.launch.detected_at).getTime() - new Date(a.launch.detected_at).getTime()),
    [demoLaunches, realLaunchViews]
  );
  const counts = useMemo(() => ({
    detected: launchViews.length,
    analyzing: launchViews.filter((item) => item.status === 'ANALYZING').length,
    qualified: launchViews.filter((item) => item.status === 'QUALIFIED').length,
    paper: launchViews.filter((item) => item.status === 'PAPER ENTRY').length,
  }), [launchViews]);

  const filteredLaunches = launchViews.filter((item) => {
    if (filter === 'analyzing' && item.status !== 'ANALYZING') return false;
    if (filter === 'qualified' && item.status !== 'QUALIFIED') return false;
    if (filter === 'paper' && item.status !== 'PAPER ENTRY') return false;
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      return item.launch.mint_address.toLowerCase().includes(query) ||
        (item.launch.creator_address || '').toLowerCase().includes(query) ||
        item.launch.source.toLowerCase().includes(query) ||
        ('demo' in item && item.demo && DEMO_TOKEN_SEEDS.some((seed) => seed.name.toLowerCase().includes(query) || seed.symbol.toLowerCase().includes(query)));
    }
    return true;
  });

  const connected = engineStatus.ws_status === 'connected' && engineStatus.running;
  const engineLabel = !engineStatus.running ? 'ENGINE PAUSED' : engineStatus.ws_status === 'connected' ? 'ENGINE ONLINE' : 'RECONNECTING';
  const formatUsd = (value: number) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isProfitable = profitLoss >= 0;
  const formattedPortfolio = formatUsd(portfolioValue);

  const copyMint = async (event: React.MouseEvent, mint: string) => {
    event.stopPropagation();
    try { await navigator.clipboard.writeText(mint); } catch { /* Clipboard access may be unavailable in embedded browsers. */ }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      <style>{`@keyframes token-arrive { from { opacity: 0; transform: translate3d(0,-14px,0) scale(0.985); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } } @keyframes border-travel { to { stroke-dashoffset: -320; } }`}</style>
      <section aria-label="Overview controls" className="relative -mx-px flex w-[calc(100%+2px)] shrink-0 flex-col overflow-hidden rounded-t-none rounded-b-[26px] border-x border-b border-t-0 border-white/[0.13] bg-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.38)] sm:rounded-b-[30px]">
        

        <div className="shrink-0 px-3 pt-9 sm:px-4 sm:pt-10">
          <div className="flex min-h-[82px] items-center rounded-xl bg-[#181818] px-3.5 py-3 sm:min-h-[94px] sm:px-5">
            <div className="w-[34%] min-w-0 pr-2">
              <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/40 sm:text-[10px]">P&L</div>
              <div aria-live="polite" className={`mt-1 flex items-center gap-1 truncate text-[14px] font-semibold tracking-tight tabular-nums sm:text-base ${isProfitable ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>
                <span aria-hidden="true" className="text-[10px] leading-none">{isProfitable ? '▲' : '▼'}</span>
                <span>{isProfitable ? '+' : '−'}${formatUsd(profitLoss)}</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 border-l border-white/[0.08] pl-3 text-center sm:pl-5">
              <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/45 sm:text-[10px]">Portfolio</div>
              <div aria-live="polite" className={`mt-0.5 flex justify-center whitespace-nowrap text-[25px] font-bold leading-none tracking-[-0.055em] tabular-nums transition-colors duration-150 ease-out sm:text-[32px] ${portfolioFlash === 'up' ? 'text-[#83b982]' : portfolioFlash === 'down' ? 'text-[#c77b7b]' : 'text-white'}`}>
                <span className="mr-0.5 text-white/65">$</span>
                {Array.from(formattedPortfolio).map((character, index) => /[0-9]/.test(character)
                  ? <RollingDigit key={index} digit={character} balanceDirection={balanceDirection} />
                  : <span className="inline-block h-[1em] leading-[1em]" key={index}>{character}</span>)}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-3 pt-3 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold tracking-tight text-white sm:text-base">Live Detection</h1>
              <p className="mt-0.5 text-[10px] text-white/40 sm:text-[11px]">Solana launch intelligence</p>
            </div>
            <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-semibold tracking-[0.08em] ${connected ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-[#83b982]' : 'border-white/10 bg-white/[0.035] text-white/50'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#83b982] animate-pulse' : 'bg-white/35'}`} />
              {engineLabel}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            <div className="rounded-lg bg-[#121212] px-3 py-2.5">
              <div className="text-[19px] font-semibold leading-none tabular-nums text-white">{counts.detected}</div>
              <div className="mt-1.5 text-[9px] uppercase tracking-[0.09em] text-white/40">Detected</div>
            </div>
            <div className="rounded-lg bg-[#121212] px-3 py-2.5">
              <div className="text-[19px] font-semibold leading-none tabular-nums text-[#d2b47c]">{counts.analyzing}</div>
              <div className="mt-1.5 text-[9px] uppercase tracking-[0.09em] text-white/40">Analyzing</div>
            </div>
            <div className="rounded-lg bg-[#121212] px-3 py-2.5">
              <div className="text-[19px] font-semibold leading-none tabular-nums text-[#83b982]">{counts.qualified}</div>
              <div className="mt-1.5 text-[9px] uppercase tracking-[0.09em] text-white/40">Qualified</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-col px-3 pb-0 sm:px-4 sm:pb-0">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <div>
              <h2 className="text-[12px] font-semibold text-white">Token discoveries</h2>
              <p className="mt-0.5 text-[9px] text-white/35">Newest launches first · Demo stream active</p>
            </div>
            <div className="relative w-[42%] max-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mint..." aria-label="Search detected tokens" className="h-8 w-full rounded-lg border border-white/[0.07] bg-[#101010] pl-8 pr-2 text-[10px] text-white placeholder:text-white/25 outline-none focus:border-white/20" />
            </div>
          </div>

          <div className="mb-2 flex shrink-0 gap-1 overflow-x-auto pb-1">
            {([
              ['all', 'All'],
              ['analyzing', 'Analyzing'],
              ['qualified', 'Qualified'],
              ['paper', 'Paper'],
            ] as [FeedFilter, string][]).map(([value, label]) => (
              <button key={value} onClick={() => setFilter(value)} className={`shrink-0 rounded-md px-3 py-1.5 text-[10px] transition-colors ${filter === value ? 'bg-[#242424] text-white' : 'text-white/40 hover:text-white/75'}`}>
                {label}{value === 'all' ? ` · ${counts.detected}` : value === 'analyzing' ? ` · ${counts.analyzing}` : value === 'qualified' ? ` · ${counts.qualified}` : ` · ${counts.paper}`}
              </button>
            ))}
          </div>

        </div>
      </section>

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-0 sm:px-4 sm:pb-0">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-transparent">
            {filteredLaunches.length === 0 ? (
              <div className="flex min-h-[190px] flex-col items-center justify-center px-6 py-8 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025]">
                  <Activity className="h-4 w-4 text-white/35" />
                </div>
                <div className="text-[11px] font-medium text-white/75">{launches.length === 0 ? 'Waiting for token discoveries' : 'No tokens match this filter'}</div>
                <p className="mt-1.5 max-w-[230px] text-[10px] leading-relaxed text-white/35">{launches.length === 0 ? 'New Solana launches will appear here as soon as the backend confirms them.' : 'Try another status filter or search term.'}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.055]">
                {filteredLaunches.map((item) => {
                  const { launch, status, reason, updatedAt } = item;
                  const demoItem = 'demo' in item && item.demo ? item : null;
                  const demo = Boolean(demoItem);
                  const demoSeed = demo ? DEMO_TOKEN_SEEDS.find((seed) => seed.symbol === launch.mint_address.split('-')[1]) : null;
                  return (
                  <article
                    key={demoItem ? demoItem.arrivalKey : launch.id || launch.signature}
                    className={`relative mb-1 overflow-hidden rounded-xl border bg-white/[0.025] backdrop-blur-xl transition-all duration-300 ${status === 'ANALYZING' ? 'border-amber-400/20 shadow-[0_0_14px_rgba(210,180,124,0.07)]' : status === 'QUALIFIED' || status === 'PAPER ENTRY' ? 'border-emerald-400/20' : status === 'REJECTED' || status === 'BUY FAILED' ? 'border-red-400/15' : 'border-white/[0.07]'} ${demo ? 'animate-[token-arrive_520ms_cubic-bezier(0.2,0.75,0.25,1)]' : 'animate-[token-arrive_360ms_ease-out]'}`}
                  >
                    {status === 'ANALYZING' && <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none"><rect x="0.75" y="0.75" width="98.5" height="58.5" rx="9" fill="none" stroke="rgba(210,180,124,0.75)" strokeWidth="1.2" strokeDasharray="24 296" className="animate-[border-travel_5s_linear_infinite]" /></svg>}
                    <button
                      type="button"
                      onClick={() => setExpandedScans((current) => current.includes(launch.mint_address) ? current.filter((mint) => mint !== launch.mint_address) : [...current, launch.mint_address])}
                      className="relative flex min-h-[50px] w-full items-center gap-2 px-2 py-1 text-left"
                      aria-expanded={expandedScans.includes(launch.mint_address)}
                    >
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${status === 'ANALYZING' ? 'border-amber-400/20 bg-amber-400/[0.07]' : status === 'QUALIFIED' || status === 'PAPER ENTRY' ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : status === 'REJECTED' || status === 'BUY FAILED' ? 'border-red-400/20 bg-red-400/[0.06]' : 'border-white/[0.07] bg-[#171717]'}`}>
                        {status === 'ANALYZING' ? <LoaderCircle className="h-4 w-4 animate-spin text-[#d2b47c]" /> : status === 'QUALIFIED' || status === 'PAPER ENTRY' ? <ShieldCheck className="h-4 w-4 text-[#83b982]" /> : status === 'REJECTED' || status === 'BUY FAILED' ? <ShieldX className="h-4 w-4 text-[#c77b7b]" /> : <Activity className="h-4 w-4 text-white/45" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[11px] font-semibold text-white">{demoSeed ? demoSeed.name : `${launch.mint_address.slice(0, 6)}…${launch.mint_address.slice(-5)}`}</span>
                          {demoSeed && <span className="shrink-0 text-[8px] text-white/35">{demoSeed.symbol}</span>}
                        </div>
                        <div className="mt-0.5 truncate text-[9px] text-white/35">{demo ? 'SIMULATED EXAMPLE' : launch.source || 'Solana'} · {timeAgo(launch.detected_at)}</div>
                      </div>
                      <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[8px] font-semibold tracking-wide ${statusStyle[status]}`}>{status}</span>
                      <span className="ml-0.5 text-[10px] text-white/30">{expandedScans.includes(launch.mint_address) ? '−' : '+'}</span>
                    </button>
                    {status === 'ANALYZING' && demo && <div className="mx-2.5 mb-1 h-[2px] overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-[#d2b47c] transition-[width] duration-300" style={{ width: `${demoItem?.progress ?? 0}%` }} /></div>}
                    {expandedScans.includes(launch.mint_address) && (
                      <div className="relative border-t border-white/[0.06] px-2 py-1.5">
                        <p className="text-[9px] leading-relaxed text-white/55">{reason}</p>
                        {!demo && (() => {
                          const reportEvent = events.find((event) => event.event_type === 'token_scan_update' && (event.data?.mint_address === launch.mint_address || event.token_mint === launch.mint_address));
                          const report = reportEvent?.data;
                          const checks = Array.isArray(report?.checks) ? report.checks : [];
                          return (
                            <div className="mt-2 space-y-1.5">
                              {checks.length > 0 ? checks.map((check: any, index: number) => (
                                <div key={check.name || index} className="flex items-start justify-between gap-3 text-[9px]">
                                  <span className="min-w-0 text-white/45">{String(check.name || 'Security check').replace(/_/g, ' ')}</span>
                                  <span className={`shrink-0 font-medium ${String(check.status).toLowerCase() === 'passed' || String(check.status).toLowerCase() === 'ok' ? 'text-emerald-300' : String(check.status).toLowerCase() === 'failed' ? 'text-red-300' : 'text-amber-200'}`}>{String(check.status || 'unverified').toUpperCase()}</span>
                                </div>
                              )) : <div className="text-[9px] text-white/35">{status === 'ANALYZING' ? 'Backend scanner is running. Individual check results have not arrived yet.' : 'No detailed scan report is available for this launch.'}</div>}
                              {report && <div className="mt-2 border-t border-white/[0.06] pt-2 text-[9px] text-white/40">Mint authority: {report.mint_authority ? 'Present' : 'None reported'} · Freeze authority: {report.freeze_authority ? 'Present' : 'None reported'}</div>}
                              {report?.decision_reason && <p className="mt-1 text-[9px] text-white/55">{String(report.decision_reason)}</p>}
                            </div>
                          );
                        })()}
                        {demo && <span className="mt-1 inline-block text-[8px] text-white/25">Illustrative demo state — not a live security result</span>}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[8px] text-white/25">Updated {timeAgo(updatedAt)}</span>
                          <div className="flex items-center gap-3">
                            {demo ? <span className="text-[8px] text-white/25">DEMO ONLY</span> : <><button onClick={(event) => copyMint(event, launch.mint_address)} className="inline-flex items-center gap-1 text-[9px] text-white/40"><Copy className="h-3 w-3" /> Copy</button><a href={`https://solscan.io/token/${launch.mint_address}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[9px] text-white/40">Inspect <ExternalLink className="h-3 w-3" /></a></>}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-2 flex shrink-0 items-center justify-between text-[8px] text-white/25">
            <span>{filteredLaunches.length} shown · {launches.length} loaded</span>
            <span className="inline-flex items-center gap-1"><Circle className="h-1.5 w-1.5 fill-current" /> Backend event-driven</span>
          </div>
      </div>
    </div>
  );
};

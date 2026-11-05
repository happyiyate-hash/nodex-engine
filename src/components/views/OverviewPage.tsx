import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenLaunchRecord, NodeXEvent } from '../../types';
import { Activity, Circle, Copy, ExternalLink, Search, ShieldCheck } from 'lucide-react';

type ChangeDirection = 'up' | 'down' | null;
type FeedFilter = 'detected' | 'qualified' | 'positions';

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


interface DemoPosition {
  id: string;
  mint: string;
  name: string;
  symbol: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number;
  openedAt: number;
  status: 'OPEN' | 'CLOSED';
  peakPrice: number;
  peakPnlPct: number;
  trailingActivated: boolean;
  trailingStopPrice: number;
  lastPriceStep: number;
  belowStopSamples: number;
  exitPrice?: number;
  exitReason?: string;
}
interface SimToken {
  launch: TokenLaunchRecord;
  seed: typeof DEMO_TOKEN_SEEDS[number];
  index: number;
  detectedAt: number;
  status: PipelineStatus;
  progress: number;
  scanStage: string;
  positionId?: string;
}
interface SimulationState {
  startedAt: number;
  cash: number;
  tokens: Map<number, SimToken>;
  positions: Map<string, DemoPosition>;
}
const DEMO_STARTING_BALANCE = 10000;
const DEMO_TRADE_SIZE = 50;
const DEMO_ENTRY_PRICES = [0.00042, 0.00115, 0.00078, 0.0024, 0.00063, 0.0018, 0.00095, 0.0031, 0.00054, 0.00135];
const DEMO_PRICE_PATHS = Array.from({ length: 30 }, (_, index) => {
  const variation = (index % 5) * 0.8;
  const pullback = (index % 3) * 0.6;
  return [
    10 + variation, 8 + variation, 20 + variation, 16 + variation,
    28 + variation, 24 + variation, 18 + variation, 12 + pullback,
    11 + pullback,
  ];
});
const INITIAL_STOP_LOSS_PCT = 8;
const TAKE_PROFIT_ACTIVATION_PCT = 10;
const TRAILING_DRAWDOWN_PCT = 8;
const STOP_CONFIRMATION_SAMPLES = 2;

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
  const [portfolioValue, setPortfolioValue] = useState(DEMO_STARTING_BALANCE);
  const [profitLoss, setProfitLoss] = useState(0);
  const [profitLossPct, setProfitLossPct] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(DEMO_STARTING_BALANCE);
  const [investedBalance, setInvestedBalance] = useState(0);
  const [openPositionCount, setOpenPositionCount] = useState(0);
  const [hourlyProfitLoss, setHourlyProfitLoss] = useState(0);
  const [portfolioFlash, setPortfolioFlash] = useState<ChangeDirection>(null);
  const [balanceDirection, setBalanceDirection] = useState<ChangeDirection>(null);
  const [filter, setFilter] = useState<FeedFilter>('detected');
  const [search, setSearch] = useState('');
  const [demoLaunches, setDemoLaunches] = useState<DemoLaunchView[]>([]);
  const [demoPositions, setDemoPositions] = useState<DemoPosition[]>([]);
  const [expandedScans, setExpandedScans] = useState<string[]>([]);
  useEffect(() => {
    const simulation: SimulationState = {
      startedAt: Date.now(),
      cash: DEMO_STARTING_BALANCE,
      tokens: new Map(),
      positions: new Map(),
    };
    let previousPortfolioValue = DEMO_STARTING_BALANCE;
    const portfolioHistory: Array<{ timestamp: number; value: number }> = [{ timestamp: simulation.startedAt, value: DEMO_STARTING_BALANCE }];
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - simulation.startedAt;
      const arrivals = Math.min(30, Math.floor(elapsed / 900) + 1);

      for (let index = 0; index < arrivals; index += 1) {
        if (simulation.tokens.has(index)) continue;
        const seed = DEMO_TOKEN_SEEDS[index];
        const mint = `DEMO-${seed.symbol}-${index + 1}`;
        const detectedAt = simulation.startedAt + index * 900;
        simulation.tokens.set(index, {
          index, seed, detectedAt, status: 'DETECTED', progress: 0,
          scanStage: 'New launch received',
          launch: {
            id: mint, mint_address: mint, creator_address: null,
            source: 'Demo launch stream', signature: mint, slot: 0,
            detected_at: new Date(detectedAt).toISOString(),
          },
        });
      }

      for (const token of simulation.tokens.values()) {
        const age = now - token.detectedAt;
        if (age < 650) {
          token.status = 'DETECTED'; token.progress = 0; token.scanStage = 'New launch received';
        } else if (age < 5200) {
          token.status = 'ANALYZING';
          token.progress = Math.min(94, Math.round(((age - 650) / 4550) * 100));
          token.scanStage = token.progress < 28 ? 'Checking mint authority' : token.progress < 52 ? 'Checking freeze authority' : token.progress < 76 ? 'Inspecting holder distribution' : 'Reviewing final risk signals';
        } else if (token.seed.outcome === 'REJECTED') {
          token.status = 'REJECTED'; token.progress = 100; token.scanStage = 'Demo risk checks failed';
        } else {
          token.progress = 100;
          const positionId = `paper-${token.index}`;
          const existing = simulation.positions.get(positionId);
          if (!existing) {
            const entryPrice = DEMO_ENTRY_PRICES[token.index % DEMO_ENTRY_PRICES.length];
            const quantity = DEMO_TRADE_SIZE / entryPrice;
            if (simulation.cash >= DEMO_TRADE_SIZE) {
              simulation.cash -= DEMO_TRADE_SIZE;
              simulation.positions.set(positionId, {
                id: positionId, mint: token.launch.mint_address,
                name: token.seed.name, symbol: token.seed.symbol,
                entryPrice, currentPrice: entryPrice, quantity,
                invested: DEMO_TRADE_SIZE, value: DEMO_TRADE_SIZE,
                pnl: 0, pnlPct: 0, openedAt: now, status: 'OPEN',
                peakPrice: entryPrice, peakPnlPct: 0,
                trailingActivated: false,
                trailingStopPrice: entryPrice * (1 - INITIAL_STOP_LOSS_PCT / 100),
                lastPriceStep: 0, belowStopSamples: 0,
              });
              token.positionId = positionId;
              token.status = 'PAPER ENTRY';
              token.scanStage = 'Paper buy executed';
            } else {
              token.status = 'QUALIFIED'; token.scanStage = 'Qualified · balance limit reached';
            }
          } else {
            token.status = existing.status === 'OPEN' ? 'PAPER ENTRY' : 'QUALIFIED';
            token.scanStage = existing.status === 'OPEN' ? 'Paper position open' : 'Paper position closed';
          }
        }
      }

      for (const position of simulation.positions.values()) {
        if (position.status !== 'OPEN') continue;
        const tokenIndex = Number(position.id.replace('paper-', ''));
        const path = DEMO_PRICE_PATHS[tokenIndex % DEMO_PRICE_PATHS.length];
        const age = now - position.openedAt;
        const stepMs = 5000 + ((tokenIndex * 613) % 4000);
        const step = Math.floor(age / stepMs);
        if (step < 1 || step <= position.lastPriceStep) continue;
        position.lastPriceStep = step;
        const movement = path[Math.min(step - 1, path.length - 1)] / 100;
        position.currentPrice = position.entryPrice * (1 + movement);
        position.peakPrice = Math.max(position.peakPrice, position.currentPrice);
        position.pnlPct = ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100;
        position.peakPnlPct = ((position.peakPrice - position.entryPrice) / position.entryPrice) * 100;
        if (!position.trailingActivated && position.peakPnlPct >= TAKE_PROFIT_ACTIVATION_PCT) {
          position.trailingActivated = true;
        }
        position.trailingStopPrice = position.trailingActivated
          ? position.peakPrice * (1 - TRAILING_DRAWDOWN_PCT / 100)
          : position.entryPrice * (1 - INITIAL_STOP_LOSS_PCT / 100);
        position.value = position.quantity * position.currentPrice;
        position.pnl = position.value - position.invested;

        const stopWasHit = position.currentPrice <= position.trailingStopPrice;
        position.belowStopSamples = stopWasHit ? position.belowStopSamples + 1 : 0;
        if (position.belowStopSamples >= STOP_CONFIRMATION_SAMPLES) {
          position.status = 'CLOSED';
          position.exitPrice = position.currentPrice;
          position.exitReason = position.trailingActivated
            ? 'Trailing stop confirmed'
            : 'Initial stop-loss confirmed';
          const saleProceeds = position.quantity * position.exitPrice;
          position.value = saleProceeds;
          position.pnl = saleProceeds - position.invested;
          position.pnlPct = (position.pnl / position.invested) * 100;
          simulation.cash += saleProceeds;
        }
      }

      const positionList = Array.from(simulation.positions.values()).sort((a, b) => b.openedAt - a.openedAt);
      const openPositions = positionList.filter((position) => position.status === 'OPEN');
      const invested = openPositions.reduce((sum, position) => sum + position.invested, 0);
      const marketValue = openPositions.reduce((sum, position) => sum + position.value, 0);
      const totalValue = simulation.cash + marketValue;
      const pnl = totalValue - DEMO_STARTING_BALANCE;
      setDemoLaunches(Array.from(simulation.tokens.values()).sort((a, b) => b.detectedAt - a.detectedAt).map((token) => ({
        launch: token.launch, status: token.status,
        reason: token.scanStage, updatedAt: new Date(now).toISOString(),
        scanStarted: token.status !== 'DETECTED', demo: true,
        progress: token.progress, scanStage: token.scanStage,
        arrivalKey: token.launch.id,
      })));
      setDemoPositions(positionList);
      setAvailableBalance(simulation.cash);
      setInvestedBalance(invested);
      setOpenPositionCount(openPositions.length);
      portfolioHistory.push({ timestamp: now, value: totalValue });
      const hourCutoff = now - 60 * 60 * 1000;
      while (portfolioHistory.length > 2 && portfolioHistory[1].timestamp <= hourCutoff) portfolioHistory.shift();
      const hourBaseline = portfolioHistory[0]?.value ?? totalValue;
      setHourlyProfitLoss(totalValue - hourBaseline);
      setPortfolioValue(totalValue);
      setProfitLoss(pnl);
      setProfitLossPct((pnl / DEMO_STARTING_BALANCE) * 100);
      const portfolioDelta = totalValue - previousPortfolioValue;
      if (portfolioDelta > 0.000001) {
        setBalanceDirection('up');
        setPortfolioFlash('up');
      } else if (portfolioDelta < -0.000001) {
        setBalanceDirection('down');
        setPortfolioFlash('down');
      } else {
        setPortfolioFlash(null);
      }
      previousPortfolioValue = totalValue;
    }, 200);
    return () => { clearInterval(timer); };
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
    detected: launchViews.filter((item) => ['DETECTED', 'ANALYZING', 'REJECTED', 'BUY FAILED'].includes(item.status)).length,
    qualified: launchViews.filter((item) => item.status === 'QUALIFIED').length,
    positions: demoPositions.length + launchViews.filter((item) => item.status === 'PAPER ENTRY' && !('demo' in item && item.demo)).length,
  }), [launchViews, demoPositions]);

  const filteredLaunches = launchViews.filter((item) => {
    if (filter === 'detected' && !['DETECTED', 'ANALYZING', 'REJECTED', 'BUY FAILED'].includes(item.status)) return false;
    if (filter === 'qualified' && item.status !== 'QUALIFIED') return false;
    if (filter === 'positions') return false;
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      const demoSeed = 'demo' in item && item.demo ? DEMO_TOKEN_SEEDS.find((seed) => seed.symbol === item.launch.mint_address.split('-')[1]) : null;
      return item.launch.mint_address.toLowerCase().includes(query) ||
        (item.launch.creator_address || '').toLowerCase().includes(query) ||
        String(item.launch.source || '').toLowerCase().includes(query) ||
        Boolean(demoSeed && (demoSeed.name.toLowerCase().includes(query) || demoSeed.symbol.toLowerCase().includes(query)));
    }
    return true;
  });

  const filteredPositions = demoPositions.filter((position) => {
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return position.name.toLowerCase().includes(query) || position.symbol.toLowerCase().includes(query) || position.mint.toLowerCase().includes(query);
  });
  const backendPaperEntries = launchViews.filter((item) => item.status === 'PAPER ENTRY' && !('demo' in item && item.demo) && (
    !search.trim() || item.launch.mint_address.toLowerCase().includes(search.trim().toLowerCase()) ||
    String(item.launch.source || '').toLowerCase().includes(search.trim().toLowerCase())
  ));

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
      <style>{`@keyframes token-arrive { from { opacity: 0; transform: translate3d(0,-14px,0) scale(0.985); } to { opacity: 1; transform: translate3d(0,0,0) scale(1); } }`}</style>
      <section aria-label="Overview controls" className="relative -mx-px flex w-[calc(100%+2px)] shrink-0 flex-col overflow-hidden rounded-t-none rounded-b-[26px] border-x border-b border-t-0 border-white/[0.13] bg-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.38)] sm:rounded-b-[30px]">
        

        <div className="shrink-0 px-3 pt-9 sm:px-4 sm:pt-10">
          <div className="flex min-h-[82px] items-center rounded-xl bg-[#181818] px-3.5 py-3 sm:min-h-[94px] sm:px-5">
            <div className="w-[34%] min-w-0 pr-2">
              <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/40 sm:text-[10px]">P&L</div>
              <div aria-live="polite" className={`mt-1 flex items-center gap-1 truncate text-[14px] font-semibold tracking-tight tabular-nums sm:text-base ${isProfitable ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>
                <span aria-hidden="true" className="text-[10px] leading-none">{isProfitable ? '▲' : '▼'}</span>
                <span>{isProfitable ? '+' : '−'}{formatUsd(Math.abs(profitLossPct))}%</span>
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
              <div className="mt-1 flex justify-center gap-3 text-[8px] text-white/35"><span>Available ${formatUsd(availableBalance)}</span><span>Invested ${formatUsd(investedBalance)}</span></div>
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

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="min-w-0 rounded-lg bg-[#121212] px-3 py-2.5">
              <div className="text-[19px] font-semibold leading-none tabular-nums text-white">{openPositionCount}</div>
              <div className="mt-1.5 text-[9px] uppercase tracking-[0.09em] text-white/40">Open positions</div>
            </div>
            <div className="min-w-0 rounded-lg bg-[#121212] px-3 py-2.5">
              <div className={`truncate text-[19px] font-semibold leading-none tabular-nums ${hourlyProfitLoss >= 0 ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>
                {hourlyProfitLoss >= 0 ? '+' : '−'}${formatUsd(Math.abs(hourlyProfitLoss))}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-[0.09em] text-white/40">P&L · 1H</span>
                <span className="text-[8px] text-white/25">Rolling hour</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-col px-3 pb-0 sm:px-4 sm:pb-0">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <div>
              <h2 className="text-[12px] font-semibold text-white">Token discoveries</h2>
              <p className="mt-0.5 text-[9px] text-white/35">{demoLaunches.length}/30 demo tokens · {demoLaunches.length >= 30 ? 'Batch complete' : 'Scanning batch'}</p>
            </div>
            <div className="relative w-[42%] max-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mint..." aria-label="Search tokens in selected category" className="h-8 w-full rounded-lg border border-white/[0.07] bg-[#101010] pl-8 pr-2 text-[10px] text-white placeholder:text-white/25 outline-none focus:border-white/20" />
            </div>
          </div>

        </div>
      </section>

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-0 sm:px-4 sm:pb-0">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-transparent">
            {filter === 'positions' ? (
              <div className="space-y-1.5 pb-2">
                {filteredPositions.length === 0 && backendPaperEntries.length === 0 ? (
                  <div className="flex min-h-[190px] flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025]"><Activity className="h-4 w-4 text-white/35" /></div>
                    <div className="text-[11px] font-medium text-white/75">No purchased tokens yet</div>
                    <p className="mt-1.5 max-w-[230px] text-[10px] leading-relaxed text-white/35">Paper positions will appear here after a buy is executed.</p>
                  </div>
                ) : (
                  <>
                    {filteredPositions.map((position) => <article key={position.id} className="rounded-xl border border-white/[0.07] bg-[#101010] px-2.5 py-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.09] bg-[#242424]">
                          <span className="text-[12px] font-semibold text-white/75">{String(position.symbol || position.name).replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase()}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[11px] font-semibold text-white">{position.name}</span>
                            <span className="shrink-0 text-[8px] font-medium text-white/40">${position.symbol}</span>
                          </div>
                          <div className="mt-0.5 text-[8px] text-white/35">{position.quantity.toLocaleString('en-US',{maximumFractionDigits:2})} tokens · {position.status === 'OPEN' ? 'OPEN POSITION' : 'CLOSED'}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`text-[16px] font-bold leading-none tracking-tight tabular-nums ${position.pnl >= 0 ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>{position.pnl >= 0 ? '+' : '−'}${formatUsd(Math.abs(position.pnl))}</div>
                          <div className={`mt-1 text-[9px] font-semibold tabular-nums ${position.pnlPct >= 0 ? 'text-[#83b982]/80' : 'text-[#c77b7b]/80'}`}>{position.pnlPct >= 0 ? '+' : ''}{position.pnlPct.toFixed(2)}%</div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/[0.055] pt-2 text-[8px]">
                        <div><div className="text-white/30">Entry</div><div className="mt-0.5 font-medium tabular-nums text-white/75">${position.entryPrice.toFixed(6)}</div></div>
                        <div><div className="text-white/30">Current</div><div className="mt-0.5 font-medium tabular-nums text-white/75">${position.currentPrice.toFixed(6)}</div></div>
                        <div><div className="text-white/30">Value</div><div className="mt-0.5 font-medium tabular-nums text-white/75">${formatUsd(position.value)}</div></div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[8px] text-white/35">
                        <span>Peak <span className="font-medium text-[#83b982]">+{position.peakPnlPct.toFixed(2)}%</span></span>
                        <span>Stop <span className="font-medium text-white/65">${position.trailingStopPrice.toFixed(6)}</span></span>
                        <span>{position.status === 'CLOSED' ? (position.exitReason || 'Closed') : position.trailingActivated ? 'TRAILING' : 'PROTECTING'}</span>
                      </div>
                      <div className="mt-1 text-[8px] text-white/30">{position.status === 'CLOSED' ? `Exit: ${position.exitReason || 'Stop reached'}` : position.trailingActivated ? 'Take-profit armed · tracking peak with 8% trailing stop' : 'Initial 8% stop · trailing activates after +10%'}</div>
                    </article>)}
                    {backendPaperEntries.map((item) => <article key={item.launch.id || item.launch.signature} className="rounded-xl border border-white/[0.07] bg-[#101010] px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0"><div className="truncate text-[10px] font-semibold text-white">{item.launch.mint_address.slice(0, 8)}…{item.launch.mint_address.slice(-5)}</div><div className="mt-0.5 text-[8px] text-white/35">PAPER POSITION · {item.launch.source || 'Solana'}</div></div>
                        <span className="rounded-md border border-emerald-400/20 bg-emerald-400/[0.06] px-1.5 py-0.5 text-[8px] font-semibold text-[#83b982]">BOUGHT</span>
                      </div>
                      <div className="mt-2 text-[8px] text-white/45">Mint: {item.launch.mint_address}</div>
                    </article>)}
                  </>
                )}
              </div>
            ) : filteredLaunches.length === 0 ? (
              <div className="flex min-h-[190px] flex-col items-center justify-center px-6 py-8 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025]"><Activity className="h-4 w-4 text-white/35" /></div>
                <div className="text-[11px] font-medium text-white/75">{filter === 'qualified' ? 'No qualified tokens yet' : 'Waiting for token discoveries'}</div>
                <p className="mt-1.5 max-w-[230px] text-[10px] leading-relaxed text-white/35">{filter === 'qualified' ? 'Tokens will appear here after passing the security and strategy checks.' : 'New Solana launches will appear here as soon as the backend confirms them.'}</p>
              </div>
            ) : (
              <div className="space-y-1.5 pb-2">
                {filteredLaunches.map((item) => {
                  const { launch, status, reason, updatedAt } = item;
                  const demoItem = 'demo' in item && item.demo ? item : null;
                  const demo = Boolean(demoItem);
                  const demoSeed = demo ? DEMO_TOKEN_SEEDS.find((seed) => seed.symbol === launch.mint_address.split('-')[1]) : null;
                  const reportEvent = events.find((event) => event.event_type === 'token_scan_update' && (event.data?.mint_address === launch.mint_address || event.token_mint === launch.mint_address));
                  const report = reportEvent?.data;
                  const checks = Array.isArray(report?.checks) ? report.checks : [];
                  const tokenData = launch as any;
                  const price = Number(tokenData.current_price ?? tokenData.price_usd ?? tokenData.price ?? report?.price_usd ?? report?.current_price);
                  const marketCap = Number(tokenData.market_cap ?? tokenData.market_cap_usd ?? report?.market_cap_usd);
                  const cardName = demoSeed?.name || tokenData.name || tokenData.token_name || `${launch.mint_address.slice(0, 7)}…${launch.mint_address.slice(-5)}`;
                  const cardSymbol = demoSeed?.symbol || tokenData.symbol || tokenData.token_symbol || '';
                  const isQualified = filter === 'qualified';
                  const demoCheck = demoItem?.scanStage || 'Waiting for scan result';
                  const checkRows = checks.length > 0 ? checks : [
                    { name: 'Mint authority', status: demo ? (demoCheck.toLowerCase().includes('mint') ? 'CHECKING' : 'PENDING') : 'PENDING' },
                    { name: 'Freeze authority', status: demo ? (demoCheck.toLowerCase().includes('freeze') ? 'CHECKING' : 'PENDING') : 'PENDING' },
                    { name: 'Rug-pull risk', status: demo ? (demoCheck.toLowerCase().includes('risk') || demoCheck.toLowerCase().includes('holder') ? 'CHECKING' : 'PENDING') : 'PENDING' },
                    { name: 'Risk score', status: status === 'QUALIFIED' ? 'PASSED' : 'PENDING' },
                  ];
                  return (
                    <article key={demoItem ? demoItem.arrivalKey : launch.id || launch.signature} className={`rounded-lg border bg-[#101010] px-2 py-1.5 ${isQualified ? 'border-emerald-400/20' : 'border-white/[0.07]'} ${demo ? 'animate-[token-arrive_520ms_cubic-bezier(0.2,0.75,0.25,1)]' : ''}`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-[#242424]">
                          {(() => {
                            const imageUrl = tokenData.image_url || tokenData.image_uri || tokenData.logo_uri || tokenData.image;
                            return imageUrl
                              ? <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                              : <span className="text-[11px] font-semibold text-white/75">{String(cardSymbol || cardName).replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase()}</span>;
                          })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[11px] font-semibold leading-tight text-white">{cardName}</span>
                            {cardSymbol && <span className="shrink-0 text-[8px] font-medium text-white/40">${cardSymbol}</span>}
                          </div>
                          <div className="mt-0.5 truncate text-[8px] leading-tight text-white/35">{launch.source || 'Solana'} · {timeAgo(launch.detected_at)}</div>
                        </div>
                        {isQualified
                          ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-1.5 py-0.5 text-[7px] font-semibold tracking-wide text-[#83b982]"><ShieldCheck className="h-2.5 w-2.5" /> VERIFIED</span>
                          : <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[7px] font-semibold tracking-wide ${status === 'ANALYZING' ? 'border-amber-400/20 bg-amber-400/[0.06] text-[#d2b47c]' : status === 'REJECTED' || status === 'BUY FAILED' ? 'border-red-400/20 bg-red-400/[0.06] text-[#c77b7b]' : 'border-white/[0.08] bg-white/[0.03] text-white/50'}`}>
                            {status === 'ANALYZING' && <span className="h-1 w-1 animate-pulse rounded-full bg-current" />}
                            {status === 'ANALYZING' ? 'SCANNING' : status === 'REJECTED' || status === 'BUY FAILED' ? status : 'DETECTED'}
                          </span>}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-white/[0.055] pt-1.5">
                        {checkRows.map((check: any, index: number) => {
                          const result = String(check.status || 'PENDING').toUpperCase();
                          const passed = ['PASSED', 'PASS', 'OK', 'SAFE', 'CLEAR'].includes(result);
                          const failed = ['FAILED', 'FAIL', 'REJECTED', 'RISKY'].includes(result);
                          return <span key={check.name || index} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[7px] leading-tight ${passed ? 'border-emerald-400/15 bg-emerald-400/[0.045] text-[#83b982]' : failed ? 'border-red-400/15 bg-red-400/[0.045] text-[#c77b7b]' : 'border-white/[0.06] bg-white/[0.025] text-[#b9a77f]'}`}>
                            <span className="opacity-75">{String(check.name || 'Security check').replace(/_/g, ' ')}</span>
                            <span className="font-semibold">{result}</span>
                          </span>;
                        })}
                      </div>
                      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 border-t border-white/[0.055] pt-1.5">
                        <div className="flex min-w-0 items-center gap-3 text-[8px]">
                          <span className="whitespace-nowrap text-white/35">Price <span className="font-medium tabular-nums text-white/80">{Number.isFinite(price) && price > 0 ? `$${price.toFixed(8)}` : '—'}</span></span>
                          <span className="whitespace-nowrap text-white/35">MCap <span className="font-medium tabular-nums text-white/80">{Number.isFinite(marketCap) && marketCap > 0 ? `$${marketCap.toLocaleString('en-US',{maximumFractionDigits:0})}` : '—'}</span></span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5 text-[8px] text-white/35">
                          <span>{demo ? 'DEMO' : `${launch.mint_address.slice(0, 5)}…${launch.mint_address.slice(-4)}`}</span>
                          <button onClick={(event) => copyMint(event, launch.mint_address)} aria-label="Copy token mint" className="inline-flex items-center gap-0.5 text-white/45"><Copy className="h-2.5 w-2.5" />Copy</button>
                          {!demo && <a href={`https://solscan.io/token/${launch.mint_address}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-white/45">Inspect <ExternalLink className="h-2.5 w-2.5" /></a>}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-2 grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-[#090909] p-1">
            {([
              ['detected', 'Detected', counts.detected],
              ['qualified', 'Qualified', counts.qualified],
              ['positions', 'Position', counts.positions],
            ] as [FeedFilter, string, number][]).map(([value, label, count]) => (
              <button key={value} onClick={() => setFilter(value)} className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[9px] font-semibold transition-colors ${filter === value ? 'bg-[#242424] text-white' : 'text-white/40 hover:text-white/75'}`}>
                <span>{label}</span><span className="text-[8px] tabular-nums text-white/35">· {count}</span>
              </button>
            ))}
          </div>
                    <div className="mt-2 flex shrink-0 items-center justify-between text-[8px] text-white/25">
            <span>{filter === 'positions' ? filteredPositions.length + backendPaperEntries.length : filteredLaunches.length} shown · {launches.length} loaded</span>
            <span className="inline-flex items-center gap-1"><Circle className="h-1.5 w-1.5 fill-current" /> Backend event-driven</span>
          </div>
      </div>
    </div>
  );
};
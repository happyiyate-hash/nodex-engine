import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenLaunchRecord, NodeXEvent } from '../../types';
import { Activity, KeyRound, ScanSearch, ShieldCheck, ShieldX, Users, Globe } from 'lucide-react';

type ChangeDirection = 'up' | 'down' | null;

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
  const [activePanel, setActivePanel] = useState<'discoveries' | 'positions'>('discoveries');
  const [portfolioFlash, setPortfolioFlash] = useState<ChangeDirection>(null);
  const [balanceDirection, setBalanceDirection] = useState<ChangeDirection>(null);
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
  const filteredLaunches = launchViews.filter((item) => item.status !== 'PAPER ENTRY');

  const connected = engineStatus.ws_status === 'connected' && engineStatus.running;
  const engineLabel = !engineStatus.running ? 'ENGINE PAUSED' : engineStatus.ws_status === 'connected' ? 'ENGINE ONLINE' : 'RECONNECTING';
  const formatUsd = (value: number) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isProfitable = profitLoss >= 0;
  const formattedPortfolio = formatUsd(portfolioValue);

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
            <button type="button" onClick={() => setActivePanel('positions')} aria-pressed={activePanel === 'positions'} className={`min-w-0 rounded-lg px-3 py-2.5 text-left transition-colors ${activePanel === 'positions' ? 'bg-[#242424] ring-1 ring-white/15' : 'bg-[#121212]'}`}>
              <div className="text-[19px] font-semibold leading-none tabular-nums text-white">{openPositionCount}</div>
              <div className="mt-1.5 text-[9px] uppercase tracking-[0.09em] text-white/40">Open positions</div>
            </button>
            <button type="button" onClick={() => setActivePanel('discoveries')} aria-pressed={activePanel === 'discoveries'} className={`min-w-0 rounded-lg px-3 py-2.5 text-left transition-colors ${activePanel === 'discoveries' ? 'bg-[#242424] ring-1 ring-white/15' : 'bg-[#121212]'}`}>
              <div className={`truncate text-[19px] font-semibold leading-none tabular-nums ${hourlyProfitLoss >= 0 ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>
                {hourlyProfitLoss >= 0 ? '+' : '−'}${formatUsd(Math.abs(hourlyProfitLoss))}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-[0.09em] text-white/40">P&L · 1H</span>
                <span className="text-[8px] text-white/25">Rolling hour</span>
              </div>
            </button>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-col px-3 pb-0 sm:px-4 sm:pb-0">
          <div className="mb-1 flex shrink-0 items-center justify-between">
            <h2 className="text-[12px] font-semibold text-white">{activePanel === 'positions' ? 'Open positions' : 'Token discoveries'}</h2>
            <span className="text-[9px] text-white/30">{activePanel === 'positions' ? openPositionCount : filteredLaunches.length}</span>
          </div>
        </div>
      </section>

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-0 sm:px-4 sm:pb-0">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-transparent">
            {activePanel === 'positions' ? (
              demoPositions.filter((position) => position.status === 'OPEN').length === 0 ? (
                <div className="px-2 py-6 text-center text-[10px] text-white/35">No open positions yet.</div>
              ) : (
                <div className="flex flex-col gap-0">
                  {demoPositions.filter((position) => position.status === 'OPEN').map((position) => (
                    <article key={position.id} className="flex items-center gap-3 border-b border-white/[0.06] px-2 py-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#171717] text-[9px] font-semibold text-white/70">{position.symbol.slice(0,3)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-semibold text-white">{position.name} <span className="text-white/35">{position.symbol}</span></div>
                        <div className="mt-0.5 text-[9px] text-white/35">Entry ${position.entryPrice.toFixed(6)} · Value ${formatUsd(position.value)}</div>
                      </div>
                      <div className={`shrink-0 text-right text-[10px] font-semibold tabular-nums ${position.pnl >= 0 ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>
                        {position.pnl >= 0 ? '+' : '−'}${formatUsd(Math.abs(position.pnl))}
                        <div className="mt-0.5 text-[8px] font-normal">{position.pnlPct >= 0 ? '+' : ''}{position.pnlPct.toFixed(2)}%</div>
                      </div>
                    </article>
                  ))}
                </div>
              )
            ) : filteredLaunches.length === 0 ? (
              <div className="px-2 py-6 text-center text-[10px] text-white/35">{launches.length === 0 ? 'Waiting for token discoveries' : 'No token discoveries yet.'}</div>
            ) : (
              <div className="flex flex-col gap-0">
                {filteredLaunches.map((item) => {
                  const { launch, status, reason, updatedAt } = item;
                  const demoItem = 'demo' in item && item.demo ? item : null;
                  const demo = Boolean(demoItem);
                  const demoSeed = demo ? DEMO_TOKEN_SEEDS.find((seed) => seed.symbol === launch.mint_address.split('-')[1]) : null;
                  const scanEvent = events.filter((event) => event.event_type === 'token_scan_progress' && (event.data?.mint_address === launch.mint_address || event.token_mint === launch.mint_address)).slice(-1)[0];
                  const scanPercent = demo ? (demoItem?.progress ?? 0) : Math.max(0, Math.min(100, Number(scanEvent?.data?.progress ?? 0)));
                  const scanMessage = demo ? (demoItem?.scanStage ?? 'Scanning token') : String(scanEvent?.data?.message || 'Security scan running');
                  const scanStage = demo ? (demoItem?.scanStage ?? '') : String(scanEvent?.data?.stage || '');
                  const StageIcon = scanStage === 'authorities' ? KeyRound : scanStage === 'holder_distribution' ? Users : scanStage === 'rugcheck' ? Globe : ScanSearch;
                  return (
                    <article key={demoItem ? demoItem.arrivalKey : launch.id || launch.signature} className="border-b border-white/[0.055]">
                      <button type="button" onClick={() => setExpandedScans((current) => current.includes(launch.mint_address) ? current.filter((mint) => mint !== launch.mint_address) : [...current, launch.mint_address])} className="flex min-h-[48px] w-full items-center gap-2 px-2 py-1 text-left" aria-expanded={expandedScans.includes(launch.mint_address)}>
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${status === 'ANALYZING' ? 'bg-amber-400/[0.07]' : status === 'QUALIFIED' || status === 'PAPER ENTRY' ? 'bg-emerald-400/[0.06]' : status === 'REJECTED' || status === 'BUY FAILED' ? 'bg-red-400/[0.06]' : 'bg-[#171717]'}`}>
                          {status === 'ANALYZING' ? <StageIcon className="h-4 w-4 text-[#b79a63]" /> : status === 'QUALIFIED' || status === 'PAPER ENTRY' ? <ShieldCheck className="h-4 w-4 text-[#83b982]" /> : status === 'REJECTED' || status === 'BUY FAILED' ? <ShieldX className="h-4 w-4 text-[#c77b7b]" /> : <Activity className="h-4 w-4 text-white/45" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[11px] font-semibold text-white">{demoSeed ? demoSeed.name : `${launch.mint_address.slice(0, 6)}…${launch.mint_address.slice(-5)}`}</span>
                            {demoSeed && <span className="shrink-0 text-[8px] text-white/35">{demoSeed.symbol}</span>}
                          </div>
                          <div className="mt-0.5 truncate text-[9px] text-white/35">{demo ? 'SIMULATED EXAMPLE' : launch.source || 'Solana'} · {timeAgo(launch.detected_at)}</div>
                        </div>
                        <span className={`shrink-0 text-[8px] font-semibold tracking-wide ${statusStyle[status]}`}>{status}</span>
                        <span className="text-[10px] text-white/30">{expandedScans.includes(launch.mint_address) ? '−' : '+'}</span>
                      </button>
                      {status === 'ANALYZING' && (
                        <div className="px-2 pb-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="truncate text-[8px] text-[#b79a63]/80">{scanMessage}</span>
                            <span className="shrink-0 text-[8px] tabular-nums text-white/30">{scanPercent}%</span>
                          </div>
                          <div className="h-[2px] overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full bg-[#8c754c] transition-[width] duration-500" style={{width:`${scanPercent}%`}} /></div>
                        </div>
                      )}
                      {expandedScans.includes(launch.mint_address) && (
                        <div className="px-2 pb-2 text-[9px] text-white/50">
                          <p>{reason}</p>
                          <div className="mt-1 text-[8px] text-white/25">Updated {timeAgo(updatedAt)}</div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
      </div>
    </div>
  );
};
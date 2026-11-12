import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenLaunchRecord, NodeXEvent, TokenDiagnostic } from '../../types';
import { Activity, Circle, Copy, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { TokenAvatar } from '../common/TokenAvatar';
import { PortfolioBalanceSnapshot, restClient } from '../../services/rest';

type ChangeDirection = 'up' | 'down' | null;

interface AnimatedCardScanProgressProps {
  status: string;
  progress: number | null;
  children: (presentation: { complete: boolean; displayProgress: number }) => React.ReactNode;
}

const AnimatedCardScanProgress: React.FC<AnimatedCardScanProgressProps> = ({
  status, progress, children,
}) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const progressRef = useRef(0);
  const terminal = status !== 'scanning';
  const terminalScanStatuses = ['verified', 'unverified', 'blocked', 'rejected', 'strategy_rejected', 'failed'];
  const hasProgress = status === 'scanning' || progress !== null || terminalScanStatuses.includes(status);
  const target = terminal ? 100 : Math.max(0, Math.min(99, progress ?? 0));

  useEffect(() => {
    if (!hasProgress) return;
    let frame = 0;
    let previous = 0;
    const animate = (now: number) => {
      if (!previous) previous = now;
      const elapsed = Math.min(50, now - previous);
      previous = now;
      // Keep the visual scan moving until the full card has been covered,
      // even when the backend has already delivered its final lifecycle state.
      const next = Math.min(target, progressRef.current + elapsed * 0.075);
      progressRef.current = next;
      setDisplayProgress(next);
      if (next + 0.01 < target) frame = requestAnimationFrame(animate);
    };
    if (progressRef.current < target) frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [hasProgress, target]);

  if (!hasProgress) return <>{children({ complete: true, displayProgress: 100 })}</>;
  const complete = terminal && displayProgress >= 99.99;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] rounded-xl bg-[#B8C5D5]/[0.11]"
        style={{
          clipPath: `inset(0 ${100 - displayProgress}% 0 0 round 0.75rem)`,
          opacity: complete ? 0 : 1,
        }}
      />
      {children({ complete, displayProgress })}
    </>
  );
};
type FeedFilter = 'detected' | 'qualified' | 'positions';

interface RollingDigitProps {
  digit: string;
  balanceDirection: ChangeDirection;
}

type PipelineStatus = string;

interface LaunchView {
  launch: TokenLaunchRecord;
  status: PipelineStatus;
  reason: string;
  updatedAt: string;
  scanStarted: boolean;
}

interface AutoFitNumberProps { fullText: string; compactText: string; className: string; maxFontSize: number; minFontSize: number; balanceDirection: ChangeDirection; }

const AutoFitNumber: React.FC<AutoFitNumberProps> = ({ fullText, compactText, className, maxFontSize, minFontSize, balanceDirection }) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);
  const [compact, setCompact] = useState(false);
  // Refit only when the rendered width can materially change (digit count or
  // container size). Updating a digit at the same magnitude must not restart
  // the font-size calculation while its reel is moving.
  useLayoutEffect(() => {
    setFontSize(maxFontSize);
    setCompact(false);
  }, [fullText.length, maxFontSize]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = textRef.current;
    if (!container || !content) return;

    const fit = () => {
      if (compact) return;
      const available = container.clientWidth;
      const required = content.scrollWidth;
      if (!available || !required) return;

      if (required > available + 1) {
        const nextSize = Math.max(minFontSize, Math.round(fontSize * (available / required) * 10) / 10);
        if (nextSize < fontSize - 0.1) setFontSize(nextSize);
        else if (fontSize <= minFontSize) setCompact(true);
      } else if (fontSize < maxFontSize && required < available - 2) {
        const nextSize = Math.min(maxFontSize, Math.round(fontSize * (available / required) * 10) / 10);
        if (nextSize > fontSize + 0.1) setFontSize(nextSize);
      }
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [compact, fontSize, fullText.length, maxFontSize, minFontSize]);
  const displayText = compact ? compactText : fullText;
  let digitPositionFromRight = 0;
  const renderedCharacters = Array.from(displayText).reverse().map((character) => {
    if (/[0-9]/.test(character)) {
      const position = digitPositionFromRight++;
      return <RollingDigit key={`digit-place-${position}`} digit={character} balanceDirection={balanceDirection} />;
    }
    return <span key={`separator-after-place-${digitPositionFromRight}`} className="inline-block h-[1em] leading-[1em]">{character}</span>;
  }).reverse();
  return <span ref={containerRef} className="inline-block min-w-0 max-w-full overflow-hidden align-middle"><span ref={textRef} className={className} style={{ fontSize: compact ? minFontSize : fontSize }}>{renderedCharacters}</span></span>;
};

const compactNumber = (value: number) => {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  const units = [{ limit: 1_000_000_000, suffix: 'B', divisor: 1_000_000_000 }, { limit: 1_000_000, suffix: 'M', divisor: 1_000_000 }, { limit: 1_000, suffix: 'K', divisor: 1_000 }];
  const unit = units.find((item) => absolute >= item.limit);
  if (!unit) return sign + absolute.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const scaled = absolute / unit.divisor;
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return sign + scaled.toLocaleString('en-US', { maximumFractionDigits: digits }) + unit.suffix;
};

const REEL_CENTER = 50;
const REEL_DIGITS = Array.from({ length: 100 }, (_, index) => String(index % 10));

const RollingDigit: React.FC<RollingDigitProps> = ({ digit, balanceDirection }) => {
  const initialIndex = REEL_CENTER + Number(digit);
  const lastDigit = useRef(digit);
  const targetIndex = useRef(initialIndex);
  const [reelIndex, setReelIndex] = useState(initialIndex);
  const [isRolling, setIsRolling] = useState(false);

  useLayoutEffect(() => {
    const previous = lastDigit.current;
    if (previous === digit) return;

    lastDigit.current = digit;
    const from = Number(previous);
    const to = Number(digit);
    if (from === to) return;

    // Keep every changed place moving in the portfolio's direction. This
    // preserves carry/borrow motion (9 -> 0 and 0 -> 9) at every magnitude.
    let delta: number;
    if (balanceDirection === 'up') {
      delta = (to - from + 10) % 10;
    } else if (balanceDirection === 'down') {
      delta = -((from - to + 10) % 10);
    } else {
      const forward = (to - from + 10) % 10;
      const backward = forward - 10;
      delta = Math.abs(forward) <= Math.abs(backward) ? forward : backward;
    }

    if (delta === 0) return;

    // Retarget the running CSS transition instead of cancelling it and
    // restarting from a stale reel position. The browser continues from the
    // currently rendered position, so rapid price ticks cannot expose a gap.
    const nextIndex = targetIndex.current + delta;
    targetIndex.current = nextIndex;
    setIsRolling(true);
    setReelIndex(nextIndex);
  }, [digit, balanceDirection]);

  const finishRoll = (event: React.TransitionEvent<HTMLSpanElement>) => {
    if (event.propertyName !== 'transform' || !isRolling) return;
    if (targetIndex.current % 10 !== Number(digit)) return;

    // Recenter only after the latest destination is reached. The center and
    // destination show the same digit, so this reset is visually invisible.
    const centeredIndex = REEL_CENTER + Number(digit);
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

const getLaunchView = (launch: TokenLaunchRecord, token?: any): LaunchView => {
  // The backend's persisted activity is the sole source of token lifecycle.
  // This helper intentionally does not inspect the event history.
  const status = String(token?.lifecycle_status || 'unknown').toLowerCase();
  const reason = String(token?.lifecycle_sub_event || token?.lifecycle_stage || token?.safety_details?.decision_reason || '');
  const updatedAt = String(token?.lifecycle_updated_at || launch.detected_at);
  return {
    launch,
    status,
    reason,
    updatedAt,
    scanStarted: status === 'scanning',
  };
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
  UNVERIFIED: 'border-amber-500/20 bg-amber-500/[0.07] text-[#d2b47c]',
  FAILED: 'border-red-500/20 bg-red-500/[0.07] text-[#c77b7b]',
};

export const OverviewPage: React.FC<{ embeddedMode?: 'detected' | 'positions' }> = ({ embeddedMode }) => {
  const { launches, events, engineStatus, openTokenDetailByMint, profile, positions, tokens } = useTerminal();
  const [livePortfolioBalance, setLivePortfolioBalance] = useState<PortfolioBalanceSnapshot | null>(null);
  const latestSolPriceUpdate = events.find((event) => event.event_type === 'sol_price_update')?.timestamp || '';
  const latestPortfolioUpdate = events.find((event) => event.event_type === 'portfolio_summary_updated')?.timestamp || '';
  useEffect(() => {
    let active = true;
    const refreshPortfolio = () => {
      restClient.getPortfolioBalance()
        .then((balance) => { if (active) setLivePortfolioBalance(balance); })
        .catch(() => { /* Keep the last known authoritative valuation if REST is temporarily unavailable. */ });
    };
    refreshPortfolio();
    // SOL quotes refresh every 10 seconds on the backend. Poll as a recovery
    // path as well, so a missed WebSocket event cannot freeze the dashboard.
    const interval = window.setInterval(refreshPortfolio, 10000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [latestSolPriceUpdate, latestPortfolioUpdate]);

  const portfolioSource = livePortfolioBalance ?? profile?.portfolio;
  const portfolioValue = Number(portfolioSource?.portfolio_balance_usd ?? 0);
  const availableBalanceUsd = Number(portfolioSource?.available_balance_usd ?? 0);
  const investedBalanceUsd = Number(portfolioSource?.invested_balance_usd ?? 0);
  const profitLoss = Number(portfolioSource?.total_pnl_usd ?? 0);
  const unrealizedProfitUsd = Number(portfolioSource?.unrealized_pnl_usd ?? 0);
  const startingBalanceUsd = Number(portfolioSource?.starting_balance_usd ?? 0);
  const profitLossPct = Number(
    portfolioSource?.total_pnl_pct ??
    (startingBalanceUsd > 0 ? (profitLoss / startingBalanceUsd) * 100 : 0)
  );
  const openPositionCount = Number(profile?.portfolio?.position_count ?? positions.filter((position) => position.status === 'OPEN').length);
  const hourlyProfitLoss = typeof profile?.portfolio?.hourly_pnl_sol === 'number' ? profile.portfolio.hourly_pnl_sol : null;
  const [portfolioFlash, setPortfolioFlash] = useState<ChangeDirection>(null);
  const [balanceDirection, setBalanceDirection] = useState<ChangeDirection>(null);
  const previousPortfolioValueRef = useRef<number | null>(null);
  const portfolioFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animate only changes to a real, loaded portfolio snapshot. The first
  // snapshot establishes the baseline and does not flash on initial page load.
  useEffect(() => {
    if (!portfolioSource || !Number.isFinite(portfolioValue)) return;

    const previousValue = previousPortfolioValueRef.current;
    previousPortfolioValueRef.current = portfolioValue;
    if (previousValue === null) return;

    const difference = portfolioValue - previousValue;
    if (Math.abs(difference) < 0.000001) return;

    const direction: ChangeDirection = difference > 0 ? 'up' : 'down';
    setPortfolioFlash(direction);
    setBalanceDirection(direction);

    if (portfolioFlashTimeoutRef.current !== null) {
      clearTimeout(portfolioFlashTimeoutRef.current);
    }
    portfolioFlashTimeoutRef.current = setTimeout(() => {
      setPortfolioFlash(null);
      setBalanceDirection(null);
      portfolioFlashTimeoutRef.current = null;
    }, 650);
  }, [portfolioSource, portfolioValue]);

  useEffect(() => () => {
    if (portfolioFlashTimeoutRef.current !== null) {
      clearTimeout(portfolioFlashTimeoutRef.current);
    }
  }, []);

  const [filter, setFilter] = useState<FeedFilter>('detected');
  const [search, setSearch] = useState('');
  const [expandedScans, setExpandedScans] = useState<string[]>([]);
  const [expandedErrors, setExpandedErrors] = useState<string[]>([]);

  const launchViews = useMemo(
    () => launches.map((launch) => getLaunchView(launch, tokens.find((token) => token.mint === launch.mint_address))).sort((a, b) => new Date(b.launch.detected_at).getTime() - new Date(a.launch.detected_at).getTime()),
    [launches, tokens]
  );
  const counts = useMemo(() => ({
    detected: launchViews.length,
    qualified: launchViews.filter((item) => item.status === 'verified').length,
    positions: openPositionCount,
  }), [launchViews, openPositionCount]);

  const filteredLaunches = launchViews.filter((item) => {
    if (filter === 'qualified' && item.status !== 'verified') return false;
    if (filter === 'positions') return false;
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return item.launch.mint_address.toLowerCase().includes(query) ||
      (item.launch.creator_address || '').toLowerCase().includes(query) ||
      String(item.launch.source || '').toLowerCase().includes(query);
  });

  const filteredPositions = positions.filter((position) => {
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return position.name.toLowerCase().includes(query) || position.symbol.toLowerCase().includes(query) || position.mint.toLowerCase().includes(query);
  });
  const backendPaperEntries = launchViews.filter((item) => item.status === 'bought_paper' && (
    !search.trim() || item.launch.mint_address.toLowerCase().includes(search.trim().toLowerCase()) ||
    String(item.launch.source || '').toLowerCase().includes(search.trim().toLowerCase())
  ));

  const connected = engineStatus.ws_status === 'connected' && engineStatus.running;
  const engineLabel = !engineStatus.running ? 'ENGINE PAUSED' : engineStatus.ws_status === 'connected' ? 'ENGINE ONLINE' : 'RECONNECTING';
  const formatSol = (value: number) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  const formatUsd = (value: number) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Display-only precision: start at five decimals and remove one for each
  // additional integer digit, never showing fewer than two decimal places.
  // Truncation keeps the displayed value from rounding up or down.
  const formatPortfolio = (value: number) => {
    const absolute = Math.abs(value);
    const integerDigits = Math.max(1, Math.floor(absolute).toString().length);
    const decimalPlaces = Math.max(2, 6 - integerDigits);
    const factor = 10 ** decimalPlaces;
    const truncated = Math.trunc(absolute * factor) / factor;
    return truncated.toLocaleString('en-US', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    });
  };
  const formatPnlDisplay = (value: number) => {
    const absolute = Math.abs(value);
    const factor = 10 ** 7;
    const truncated = Math.trunc(absolute * factor) / factor;
    return truncated.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 7 });
  };
  const isProfitable = profitLoss >= 0;
  const formattedPortfolio = formatPortfolio(portfolioValue);

  const copyMint = async (event: React.MouseEvent, mint: string) => {
    event.stopPropagation();
    try { await navigator.clipboard.writeText(mint); } catch { /* Clipboard access may be unavailable in embedded browsers. */ }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      {!embeddedMode && <section aria-label="Overview controls" className="relative -mx-px flex w-[calc(100%+2px)] shrink-0 flex-col overflow-hidden rounded-t-none rounded-b-[26px] border-x border-b border-t-0 border-white/[0.13] bg-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.38)] sm:rounded-b-[30px]">
        

        <div className="shrink-0 px-3 pt-9 sm:px-4 sm:pt-10">
          <div className="flex min-h-[82px] items-center rounded-xl bg-[#181818] px-3.5 py-3 sm:min-h-[94px] sm:px-5">
            <div className="w-[34%] min-w-0 pr-2">
              <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/40 sm:text-[10px]">P&L</div>
              <div aria-live="polite" className={`mt-1 flex h-[14px] items-center gap-1 truncate text-[14px] font-semibold leading-none tracking-tight tabular-nums sm:text-base ${isProfitable ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>
                <span aria-hidden="true" className="inline-flex h-full shrink-0 items-center text-[10px] leading-none">{isProfitable ? '▲' : '▼'}</span>
                <span className="inline-flex h-full shrink-0 items-center text-[10px] leading-none">{isProfitable ? '+' : '−'}</span><AutoFitNumber fullText={formatSol(Math.abs(profitLossPct)) + '%'} compactText={compactNumber(Math.abs(profitLossPct)) + '%'} maxFontSize={14} minFontSize={9} balanceDirection={balanceDirection} className="block whitespace-nowrap font-semibold leading-none tracking-tight tabular-nums" />
              </div>
            </div>
            <div className="min-w-0 flex-1 border-l border-white/[0.08] pl-3 text-center sm:pl-5">
              <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/45 sm:text-[10px]">Portfolio</div>
              <div aria-live="polite" className={`mt-0.5 flex min-w-0 justify-center transition-colors duration-150 ease-out ${portfolioFlash === 'up' ? 'text-[#83b982]' : portfolioFlash === 'down' ? 'text-[#c77b7b]' : 'text-white'}`}>
                <span aria-hidden="true" className="inline-flex shrink-0 items-center text-[25px] font-bold leading-none tracking-[-0.055em] text-white">$</span>
                <AutoFitNumber fullText={formattedPortfolio} compactText={compactNumber(portfolioValue)} maxFontSize={25} minFontSize={14} balanceDirection={balanceDirection} className="block whitespace-nowrap font-bold leading-none tracking-[-0.055em] tabular-nums" />
              </div>
              <div className="mt-1.5 flex items-baseline justify-center gap-2.5"><span className="inline-flex items-baseline gap-0.5"><span className="mr-0.5 text-[8px] font-medium uppercase tracking-wide text-white/35">Available</span><span className="text-[9px] font-medium leading-none tabular-nums text-white/40">$</span><span className="text-[10px] font-medium leading-none tracking-tight tabular-nums text-white/65">{formatUsd(availableBalanceUsd)}</span></span><span className="inline-flex items-baseline gap-0.5 text-[8px] text-white/35"><span className="mr-0.5">Invested</span><span className="text-[9px] font-medium leading-none tabular-nums text-white/40">$</span><span className="text-[10px] font-medium leading-none tracking-tight tabular-nums text-white/65">{formatUsd(investedBalanceUsd)}</span></span></div>
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
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#83b982]' : 'bg-white/35'}`} />
              {engineLabel}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <div className="min-w-0 rounded-lg bg-[#121212] px-3 py-2.5">
              <div className="text-[19px] font-semibold leading-none tabular-nums text-white">{openPositionCount}</div>
              <div className="mt-1.5 text-[9px] uppercase tracking-[0.09em] text-white/40">Open positions</div>
            </div>
            <div className="min-w-0 rounded-lg bg-[#121212] px-3 py-2.5">
              <div className="min-w-0 whitespace-nowrap text-[19px] font-semibold leading-none tabular-nums" style={{ color: unrealizedProfitUsd > 0 ? '#83b982' : unrealizedProfitUsd < 0 ? '#c77b7b' : '#ffffff' }}>
                {unrealizedProfitUsd > 0 ? '+' : unrealizedProfitUsd < 0 ? '−' : ''}{'$'}{formatPnlDisplay(unrealizedProfitUsd)}
              </div>
              <div className="mt-1.5 text-[9px] uppercase tracking-[0.09em] text-white/40">Unrealized P&amp;L</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-col px-3 pb-0 sm:px-4 sm:pb-0">
          <div className="mb-2 flex shrink-0 items-center gap-1.5">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mint..." aria-label="Search tokens" className="h-7 w-full rounded-md border border-white/[0.07] bg-[#101010] pl-7 pr-2 text-[9px] text-white placeholder:text-white/25 outline-none focus:border-white/20" />
            </div>
            <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-white/[0.07] bg-[#0d0d0d] p-0.5" role="group" aria-label="Token feed view">
              <button type="button" onClick={() => setFilter('detected')} aria-pressed={filter === 'detected'} className={`rounded px-2 py-1 text-[8px] font-semibold transition-colors ${filter === 'detected' ? 'bg-[#292929] text-white' : 'text-white/40 hover:text-white/70'}`}>Detect</button>
              <button type="button" onClick={() => setFilter('positions')} aria-pressed={filter === 'positions'} className={`rounded px-2 py-1 text-[8px] font-semibold transition-colors ${filter === 'positions' ? 'bg-[#292929] text-white' : 'text-white/40 hover:text-white/70'}`}>Position</button>
            </div>
          </div>

        </div>
      </section>}

      <div className={`${embeddedMode ? "relative flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-0" : "mt-2 flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-0 sm:px-3 sm:pb-0"}`}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-transparent">
            {embeddedMode === 'positions' || (!embeddedMode && filter === 'positions') ? (
              <div className="space-y-1.5 pb-2">
                {filteredPositions.length === 0 && backendPaperEntries.length === 0 ? (
                  <div className="flex min-h-[190px] flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.025]"><Activity className="h-4 w-4 text-white/35" /></div>
                    <div className="text-[11px] font-medium text-white/75">No purchased tokens yet</div>
                    <p className="mt-1.5 max-w-[230px] text-[10px] leading-relaxed text-white/35">Paper positions will appear here after a buy is executed.</p>
                  </div>
                ) : (
                  <>
                    {filteredPositions.map((position) => <article key={position.id} role="button" tabIndex={0}
                      onClick={() => openTokenDetailByMint(position.mint, {
                        name: position.name,
                        symbol: position.symbol,
                        launch_time: position.entry_time,
                        current_price_sol: position.current_price_sol,
                        venue: position.venue,
                        qualification_status: 'bought_paper',
                        safety_status: 'warning',
                      })}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTokenDetailByMint(position.mint); } }}
                      className="cursor-pointer border-b border-white/[0.07] bg-transparent px-0 py-3 last:border-b-0 focus:outline-none focus:ring-1 focus:ring-white/30">
                      <div className="flex items-center gap-2.5">
                        <TokenAvatar
                          symbol={position.symbol || position.name || position.mint}
                          logoUrl={position.logo_url || tokens.find((token) => token.mint === position.mint)?.logo_url}
                          size="lg"
                          className="h-9 w-9"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[11px] font-semibold text-white">{position.name || position.mint.slice(0, 7) + '…' + position.mint.slice(-5)}</span>
                            {position.symbol && <span className="shrink-0 text-[8px] font-medium text-white/40">${position.symbol}</span>}
                          </div>
                          <div className="mt-0.5 text-[8px] text-white/35">{position.amount_tokens.toLocaleString('en-US',{maximumFractionDigits:2})} tokens · {position.status === 'OPEN' ? 'OPEN POSITION' : 'CLOSED'}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={'text-[15px] font-bold leading-none tracking-tight tabular-nums ' + ((position.pnl_sol ?? 0) >= 0 ? 'text-[#83b982]' : 'text-[#c77b7b]')}>
                            {position.pnl_sol == null ? '—' : (position.pnl_sol >= 0 ? '+' : '−') + formatSol(Math.abs(position.pnl_sol)) + ' SOL'}
                          </div>
                          <div className={'mt-1 text-[9px] font-semibold tabular-nums ' + (position.pnl_pct >= 0 ? 'text-[#83b982]/80' : 'text-[#c77b7b]/80')}>{position.pnl_pct >= 0 ? '+' : ''}{position.pnl_pct.toFixed(2)}%</div>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/[0.055] pt-2 text-[8px]">
                        <div><div className="text-white/30">Entry</div><div className="mt-0.5 font-medium tabular-nums text-white/75">{position.entry_price_sol > 0 ? position.entry_price_sol.toFixed(8) + ' SOL' : '—'}</div></div>
                        <div><div className="text-white/30">Current</div><div className="mt-0.5 font-medium tabular-nums text-white/75">{position.current_price_sol > 0 ? position.current_price_sol.toFixed(8) + ' SOL' : '—'}</div></div>
                        <div><div className="text-white/30">Value</div><div className="mt-0.5 font-medium tabular-nums text-white/75">{position.current_position_value_sol == null ? '—' : formatSol(position.current_position_value_sol) + ' SOL'}</div></div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[8px] text-white/35">
                        <span>{position.take_profit_target_pct > 0 ? 'Take profit ' + position.take_profit_target_pct + '%' : 'Take profit —'}</span>
                        <span>{position.stop_loss_target_pct > 0 ? 'Stop loss ' + position.stop_loss_target_pct + '%' : 'Stop loss —'}</span>
                        <span>{position.venue}</span>
                      </div>
                    </article>)}
                    {backendPaperEntries.map((item) => <article key={item.launch.id || item.launch.signature} role="button" tabIndex={0} onClick={() => openTokenDetailByMint(item.launch.mint_address)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openTokenDetailByMint(item.launch.mint_address); } }} className="cursor-pointer rounded-xl border border-white/[0.07] bg-[#101010] px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-white/30">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black">
                          <span className="text-[11px] font-semibold text-white/70">S</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[10px] font-semibold text-white">{item.launch.mint_address.slice(0, 8)}…{item.launch.mint_address.slice(-5)}</div>
                          <div className="mt-0.5 text-[8px] text-white/35">PAPER POSITION · {item.launch.source || 'Solana'}</div>
                        </div>
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-1 text-[8px] font-semibold text-[#83b982]">BOUGHT</span>
                      </div>
                      <div className="mt-2 border-t border-white/[0.055] pt-2 text-[8px] text-white/45">Mint: {item.launch.mint_address}</div>
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
                  const matchesLaunch = (event: NodeXEvent) => event.data?.mint_address
                    ? event.data.mint_address === launch.mint_address
                    : event.token_mint === launch.mint_address;
                  const progressEvent = events.find((event) => event.event_type === 'token_scan_progress' && matchesLaunch(event));
                  const reportEvent = events.find((event) => event.event_type === 'token_scan_update' && matchesLaunch(event))
                    || progressEvent
                    || events.find((event) => ['token_scan_completed', 'token_scan_failed'].includes(event.event_type) && matchesLaunch(event));
                  const tokenData = (tokens.find((token) => token.mint === launch.mint_address) || launch) as any;
                  // Prefer the live event while present, then fall back to the full
                  // persisted security report carried by token_state_updated.
                  // Persisted token state is authoritative; transient scan events are fallback only.
                  // This prevents an older scan payload from replacing a newer authority-monitor update.
                  const persistedReport = tokenData.safety_details && typeof tokenData.safety_details === 'object'
                    ? tokenData.safety_details
                    : {};
                  const eventReport = reportEvent?.data && typeof reportEvent.data === 'object'
                    ? reportEvent.data
                    : {};
                  const report = { ...eventReport, ...persistedReport };
                  if (!Array.isArray(report.checks) || report.checks.length === 0) {
                    if (Array.isArray(eventReport.checks) && eventReport.checks.length > 0) report.checks = eventReport.checks;
                  }
                  if (!Array.isArray(report.provider_responses) || report.provider_responses.length === 0) {
                    if (Array.isArray(eventReport.provider_responses) && eventReport.provider_responses.length > 0) report.provider_responses = eventReport.provider_responses;
                  }
                  const monitoringEvent = events.find((event) => event.event_type === 'token_monitoring_update' && (event.data?.mint_address === launch.mint_address || event.token_mint === launch.mint_address));
                  const monitoringData = monitoringEvent?.data;

                  const checks = Array.isArray(report?.checks) ? report.checks : [];
                  // TerminalContext normalizes market ticks to current_price_usd/current_price_sol.
                  // Prefer USD for the card's dollar display; if only SOL is known, label it as SOL.
                  const priceUsd = Number(
                    tokenData.current_price_usd ??
                    tokenData.price_usd ??
                    report?.price_usd ??
                    report?.current_price_usd
                  );
                  const priceSol = Number(
                    tokenData.current_price_sol ??
                    tokenData.price_sol ??
                    report?.price_sol
                  );
                  const hasUsdPrice = Number.isFinite(priceUsd) && priceUsd > 0;
                  const hasSolPrice = Number.isFinite(priceSol) && priceSol > 0;
                  const price = hasUsdPrice ? priceUsd : hasSolPrice ? priceSol : Number.NaN;
                  const priceCurrency = hasUsdPrice ? 'USD' : hasSolPrice ? 'SOL' : '';
                  const marketCap = Number(tokenData.market_cap_usd ?? tokenData.market_cap ?? report?.market_cap_usd);
                  const cardName = tokenData.name || tokenData.token_name || `${launch.mint_address.slice(0, 7)}…${launch.mint_address.slice(-5)}`;
                  const cardSymbol = tokenData.symbol || tokenData.token_symbol || '';
                  const isQualified = status === 'QUALIFIED' || status === 'PAPER ENTRY';
                  const checkRows = checks;
                  const diagnostics: TokenDiagnostic[] = Array.isArray(tokenData.diagnostics) ? tokenData.diagnostics : [];
                  const scanStage = String(progressEvent?.data?.stage || tokenData.scan_stage || report?.stage || '').replace(/[_-]+/g, ' ').trim();
                  // This card is a pure view of the backend's canonical activity snapshot.
                  // Never infer a lifecycle from event names, strategy fallbacks or missing fields.
                  const lifecycleStatus = String(tokenData.lifecycle_status || '').toLowerCase();
                  const lifecycleLabel = String(tokenData.lifecycle_label || 'Awaiting status');
                  const rawLifecycleProgress = tokenData.lifecycle_progress;
                  const lifecycleProgressValue = rawLifecycleProgress == null ? Number.NaN : Number(rawLifecycleProgress);
                  const lifecycleProgress = Number.isFinite(lifecycleProgressValue)
                    ? Math.max(0, Math.min(100, lifecycleProgressValue)) : null;
                  const lifecycleSubEvent = String(tokenData.lifecycle_sub_event || tokenData.lifecycle_stage || '');
                  const securityStatus = String(tokenData.qualification_status || '').toLowerCase();
                  const securityLabel = securityStatus === 'qualified' ? 'Verified'
                    : securityStatus === 'rejected' ? 'Rejected'
                    : securityStatus === 'unverified' ? 'Unverified'
                    : securityStatus === 'under_analysis' ? 'Scanning'
                    : 'Pending';
                  const marketFeedStatus = String(tokenData.monitoring_status || '').toLowerCase();
                  const marketFeedLabel = marketFeedStatus === 'active' ? 'Active · data flowing'
                    : marketFeedStatus === 'subscribed' ? 'Subscribed · awaiting first update'
                    : marketFeedStatus === 'pending' ? 'Connecting'
                    : marketFeedStatus === 'waiting_for_capacity' ? 'Waiting for capacity'
                    : marketFeedStatus === 'failed' ? 'Failed'
                    : marketFeedStatus === 'removed' || marketFeedStatus === 'completed' ? 'Stopped'
                    : 'Not connected';
                  const marketFeedReason = String(tokenData.monitoring_reason || '');
                  const strategyDecision = String(tokenData.strategy_decision || '').toLowerCase();
                  const strategyLabel = strategyDecision === 'evaluate_paper_entry' ? 'Entry conditions met'
                    : strategyDecision === 'reject' ? 'Rejected by strategy'
                    : strategyDecision === 'wait' ? 'Waiting for entry'
                    : 'Not evaluated';
                  const strategyReasons = Array.isArray(tokenData.strategy_reasons)
                    ? tokenData.strategy_reasons.map(String).filter(Boolean).join(' · ')
                    : '';
                  const isLifecycleProgress = lifecycleStatus === 'scanning' && lifecycleProgress !== null;
                  const errorDetails = tokenData.lifecycle_error || diagnostics.find((diagnostic) =>
                    ['error', 'critical', 'fatal'].includes(String(diagnostic.severity || '').toLowerCase())
                  );
                  const errorExpanded = expandedErrors.includes(launch.mint_address);
                  const statusTone = ({
                    verified: 'bg-emerald-400/[0.10] text-emerald-300',
                    rejected: 'bg-red-400/[0.10] text-red-300',
                    strategy_rejected: 'bg-red-400/[0.10] text-red-300',
                    failed: 'bg-red-400/[0.10] text-red-300',
                    sell_failed: 'bg-red-400/[0.10] text-red-300',
                    unverified: 'bg-amber-300/[0.10] text-amber-200',
                    scanning: 'bg-sky-400/[0.10] text-sky-200',
                    monitoring: 'bg-violet-400/[0.10] text-violet-200',
                    monitoring_stopped: 'bg-white/[0.07] text-white/65',
                    evaluating: 'bg-sky-400/[0.10] text-sky-200',
                    executing_buy: 'bg-amber-300/[0.10] text-amber-200',
                    bought_paper: 'bg-emerald-400/[0.10] text-emerald-300',
                    buy_failed: 'bg-red-400/[0.10] text-red-300',
                  } as Record<string, string>)[lifecycleStatus] || 'bg-white/[0.08] text-white/75';
                  const errorMessage = String(errorDetails?.message || '');
                  return (
                    <article
                      key={launch.id || launch.signature}
                      data-token-card
                      className="relative isolate mb-1 overflow-hidden rounded-xl border border-x-white/[0.10] border-t-white/[0.16] border-b-white/[0.04] bg-gradient-to-b from-[#1c1c1c] via-[#121212] to-[#0d0d0d] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_2px_rgba(0,0,0,0.42),0_5px_14px_rgba(0,0,0,0.48)] before:pointer-events-none before:absolute before:inset-x-3 before:top-0 before:z-20 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/25 before:to-transparent last:mb-0"
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-0"
                        style={{ background: 'radial-gradient(ellipse at 0% 0%, rgb(var(--token-accent-rgb, 184 197 213) / 0.24), transparent 62%)' }}
                      />
                      <AnimatedCardScanProgress
                        key={launch.mint_address}
                        status={lifecycleStatus}
                        progress={lifecycleProgress}
                      >
                        {({ complete, displayProgress }) => (
                      <div className="relative z-10">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <TokenAvatar
                          symbol={cardSymbol || cardName}
                          logoUrl={tokenData.logo_url || tokenData.image_url || tokenData.image_uri || tokenData.logo_uri || tokenData.image}
                          size="md"
                          className="!h-9 !w-9 !rounded-2xl shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className="min-w-0 truncate text-[12px] font-semibold leading-tight text-white">{cardName}</span>
                            {cardSymbol && <span className="shrink-0 text-[9px] font-medium text-white/45">${cardSymbol}</span>}
                          </div>
<div className="mt-1 flex min-w-0 items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-[9px] leading-tight text-white/60" title={complete ? (lifecycleSubEvent || lifecycleLabel) : 'Security scan in progress'}>
                              {complete ? (lifecycleSubEvent || lifecycleLabel) : 'Scanning'}
                            </span>
                            {!complete && <span className="shrink-0 text-[8px] font-medium tabular-nums text-white/65">{Math.round(displayProgress)}%</span>}
                          </div>
                          {complete && (
                            <div className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[8px] leading-tight text-white/55">
                              <span>Security: <span className={securityStatus === 'qualified' ? 'text-emerald-300' : securityStatus === 'rejected' ? 'text-red-300' : 'text-amber-200'}>{securityLabel}</span></span>
                              <span>Market feed: <span className={marketFeedStatus === 'active' ? 'text-emerald-300' : marketFeedStatus === 'failed' ? 'text-red-300' : 'text-amber-200'}>{marketFeedLabel}</span></span>
                              {strategyDecision && <span>Paper entry: <span className={strategyDecision === 'evaluate_paper_entry' ? 'text-emerald-300' : strategyDecision === 'reject' ? 'text-red-300' : 'text-white/75'}>{strategyLabel}</span></span>}
                            </div>
                          )}
                          {complete && marketFeedReason && marketFeedStatus !== 'active' && (
                            <p className="mt-0.5 truncate text-[8px] leading-tight text-amber-200/75" title={marketFeedReason}>{marketFeedReason}</p>
                          )}
                          {complete && strategyReasons && (
                            <p className="mt-0.5 truncate text-[8px] leading-tight text-white/45" title={strategyReasons}>{strategyReasons}</p>
                          )}
                          {errorDetails && (
                            <div className="mt-1">
                              <button
                                type="button"
                                aria-expanded={errorExpanded}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedErrors((previous) => previous.includes(launch.mint_address)
                                    ? previous.filter((mint) => mint !== launch.mint_address)
                                    : [...previous, launch.mint_address]);
                                }}
                                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[8px] font-medium text-red-200/75 transition-colors duration-300 hover:bg-red-400/[0.08] hover:text-red-100"
                              >
                                <span className="h-1 w-1 rounded-full bg-red-300" />
                                {errorExpanded ? 'Hide error details' : 'Error details'}
                                <span aria-hidden="true" className="transition-transform duration-300 ease-out">{errorExpanded ? '▴' : '▾'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className={`max-w-[116px] truncate rounded-md px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${complete ? statusTone : 'bg-sky-400/[0.10] text-sky-200'}`}>
                            {complete ? lifecycleLabel : 'SCANNING'}
                          </span>
                          <button
                            type="button"
                            aria-label={`Copy ${cardName} contract address`}
                            title="Copy contract address"
                            onClick={(event) => { event.stopPropagation(); void navigator.clipboard?.writeText(launch.mint_address); }}
                            className="inline-flex max-w-[116px] items-center gap-1 rounded px-1 py-0.5 text-white/40 transition-colors hover:text-white/80"
                          >
                            <Copy className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate font-mono text-[8px]">{launch.mint_address.slice(0, 5)}…{launch.mint_address.slice(-4)}</span>
                          </button>
                        </div>
                      </div>
                      {errorDetails && (
                        <div
                          className="relative z-10 grid transition-[grid-template-rows,opacity] duration-[420ms] ease-out"
                          style={{
                            gridTemplateRows: errorExpanded ? '1fr' : '0fr',
                            opacity: errorExpanded ? 1 : 0,
                          }}
                          aria-hidden={!errorExpanded}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div className="pt-2 text-left text-[9px] text-white/65">
                              <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-white/40">
                                {errorDetails?.stage && <span>Stage: {String(errorDetails.stage)}</span>}
                                {errorDetails?.provider && <span>Provider: {String(errorDetails.provider)}</span>}
                                {errorDetails?.severity && <span>Severity: {String(errorDetails.severity)}</span>}
                                {errorDetails?.occurred_at && <span>{new Date(String(errorDetails.occurred_at)).toLocaleString()}</span>}
                              </div>
                              <p className="whitespace-pre-wrap break-words text-red-100/85">{errorMessage || 'No error message was supplied.'}</p>
                              {errorDetails?.raw_response != null && (
                                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-[8px] text-white/45">
                                  {typeof errorDetails.raw_response === 'string'
                                    ? errorDetails.raw_response
                                    : JSON.stringify(errorDetails.raw_response, null, 2)}
                                </pre>
                              )}
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  aria-label={`Copy ${cardName} error details`}
                                  title="Copy full error details"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void navigator.clipboard?.writeText(JSON.stringify(errorDetails, null, 2));
                                  }}
                                  className="inline-flex items-center justify-center rounded-md p-1 text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/85"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      </div>
                        )}
                      </AnimatedCardScanProgress>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-4 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />

      </div>
    </div>
  );
};
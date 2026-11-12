import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenLaunchRecord, TokenDiagnostic } from '../../types';
import { Activity, Circle, Copy, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { TokenAvatar } from '../common/TokenAvatar';

type ChangeDirection = 'up' | 'down' | null;

interface AnimatedCardScanOverlayProps {
  status: string;
  progress: number | null;
  attempt?: number;
}

const AnimatedCardScanOverlay: React.FC<AnimatedCardScanOverlayProps> = ({ status, progress, attempt = 0 }) => {
  const [displayProgress, setDisplayProgress] = useState(0);
  const [scanVisible, setScanVisible] = useState(false);
  const scanStartedRef = useRef(false);
  const currentAttemptRef = useRef(attempt);

  useEffect(() => {
    if (attempt !== currentAttemptRef.current) {
      currentAttemptRef.current = attempt;
      scanStartedRef.current = false;
      setDisplayProgress(0);
      setScanVisible(false);
    }

    if (status === 'scanning') {
      scanStartedRef.current = true;
      setScanVisible(true);
      const target = Math.max(1, Math.min(100, progress == null ? 1 : progress));
      setDisplayProgress(target);
      return undefined;
    }

    if (!scanStartedRef.current) return undefined;

    // Let CSS interpolate the final handoff. Avoid a requestAnimationFrame
    // loop and React state update on every frame for every scanning token.
    setDisplayProgress(100);
    const timeout = window.setTimeout(() => {
      scanStartedRef.current = false;
      setScanVisible(false);
      setDisplayProgress(0);
    }, 360);
    return () => window.clearTimeout(timeout);
  }, [status, progress, attempt]);

  if (!scanVisible) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1] rounded-[10px] bg-[#B8C5D5]/[0.11] transition-[clip-path,opacity] duration-300 ease-out"
      style={{
        clipPath: `inset(0 ${100 - displayProgress}% 0 0 round 10px)`,
        opacity: status !== 'scanning' && displayProgress >= 99.99 ? 0 : 1,
        transition: status === 'scanning'
          ? 'clip-path 180ms linear, opacity 300ms ease-out'
          : 'clip-path 360ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease-out',
      }}
    />
  );
};

const lifecycleBadgeTones: Record<string, string> = {
  verified: 'bg-emerald-400/[0.10] text-emerald-300',
  rejected: 'bg-red-400/[0.10] text-red-300',
  failed: 'bg-red-400/[0.10] text-red-300',
  unverified: 'bg-amber-300/[0.10] text-amber-200',
  scanning: 'bg-sky-400/[0.10] text-sky-200',
  retrying: 'bg-amber-300/[0.10] text-amber-200',
  monitoring: 'bg-violet-400/[0.10] text-violet-200',
  monitoring_stopped: 'bg-white/[0.07] text-white/65',
  bought_paper: 'bg-emerald-400/[0.10] text-emerald-300',
};

const TokenLifecycleBadge: React.FC<{ status: string; label: string }> = ({ status, label }) => {
  const [shown, setShown] = useState({ status, label });
  useEffect(() => {
    if (shown.status === 'scanning' && status !== 'scanning') {
      const timeout = window.setTimeout(() => setShown({ status, label }), 360);
      return () => window.clearTimeout(timeout);
    }
    setShown({ status, label });
    return undefined;
  }, [status, label]);
  const tone = lifecycleBadgeTones[shown.status] || 'bg-white/[0.08] text-white/75';
  return (
    <span className={`max-w-[116px] truncate rounded-md px-2 py-1 text-[8px] font-semibold uppercase tracking-[0.07em] ${tone}`}>
      {shown.label}
    </span>
  );
};

const TokenCardSubtitle: React.FC<{ status: string; subtitle: string }> = ({ status, subtitle }) => {
  const [visibleSubtitle, setVisibleSubtitle] = useState(subtitle);
  useEffect(() => {
    if (status !== 'scanning' && visibleSubtitle === 'Scanning') {
      const handoff = window.setTimeout(() => setVisibleSubtitle(subtitle), 360);
      return () => window.clearTimeout(handoff);
    }
    setVisibleSubtitle(subtitle);
    if (status !== 'monitoring' || !subtitle || subtitle === 'Monitoring market activity') return;
    const timeout = window.setTimeout(() => setVisibleSubtitle('Monitoring market activity'), 7000);
    return () => window.clearTimeout(timeout);
  }, [status, subtitle]);
  return <span className="min-w-0 flex-1 truncate text-[9px] leading-tight text-white/60" title={visibleSubtitle}>{visibleSubtitle}</span>;
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
  // Portfolio values are hydrated from the initial backend snapshot and then
  // updated by the backend's portfolio WebSocket events. Do not poll the
  // balance REST endpoint here; that duplicates the live stream and adds load.
  const portfolioSource = profile?.portfolio;
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

  // Backend snapshots are external data. Ignore malformed entries before they
  // reach render code (one missing mint must never blank the entire app).
  const safeTokens = useMemo(
    () => (Array.isArray(tokens) ? tokens.filter((token) =>
      Boolean(token && typeof token.mint === 'string' && token.mint.trim().length > 0)
    ) : []),
    [tokens]
  );
  const safeLaunches = useMemo(
    () => (Array.isArray(launches) ? launches.filter((launch) =>
      Boolean(launch && typeof launch.mint_address === 'string' && launch.mint_address.trim().length > 0)
    ) : []),
    [launches]
  );
  const tokensByMint = useMemo(
    () => new Map(safeTokens.map((token) => [token.mint, token])),
    [safeTokens]
  );
  const launchViews = useMemo(
    () => safeLaunches
      .map((launch) => getLaunchView(launch, tokensByMint.get(launch.mint_address)))
      .sort((a, b) => {
        const left = Date.parse(String(a.launch.detected_at || ''));
        const right = Date.parse(String(b.launch.detected_at || ''));
        return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
      }),
    [safeLaunches, tokensByMint]
  );
  const counts = useMemo(() => ({
    detected: launchViews.length,
    qualified: launchViews.filter((item) => item.status === 'verified').length,
    positions: openPositionCount,
  }), [launchViews, openPositionCount]);

  const filteredLaunches = useMemo(() => launchViews.filter((item) => {
    if (filter === 'qualified' && item.status !== 'verified') return false;
    if (filter === 'positions') return false;
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return item.launch.mint_address.toLowerCase().includes(query) ||
      (item.launch.creator_address || '').toLowerCase().includes(query) ||
      String(item.launch.source || '').toLowerCase().includes(query);
  }), [launchViews, filter, search]);

  // Render every token currently supplied by the backend. Scrolling only
  // moves through the list; it never controls whether tokens are mounted.
  const visibleLaunches = filteredLaunches;

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

  // Keep the already-built card element tree stable across unrelated context updates
  // (connection status, portfolio snapshots, event counters). Only rebuild the feed
  // when its actual launch/token data or expanded error state changes.
  const renderedLaunchCards = useMemo(() => visibleLaunches.map((item) => {
                  const { launch } = item;
                  const tokenData = (tokensByMint.get(launch.mint_address) || launch) as any;
                  const cardName = tokenData.name || tokenData.token_name || `${launch.mint_address.slice(0, 7)}…${launch.mint_address.slice(-5)}`;
                  const cardSymbol = tokenData.symbol || tokenData.token_symbol || '';

                  const lifecycleStatus = String(tokenData.lifecycle_status || 'unknown').toLowerCase();
                  const lifecycleLabel = String(tokenData.lifecycle_label || (lifecycleStatus === 'scanning' ? 'Scanning' : 'Awaiting status'));
                  const lifecycleSubEvent = String(tokenData.lifecycle_sub_event || (
                    lifecycleStatus === 'verified' ? 'Getting market data'
                    : lifecycleStatus === 'monitoring' ? 'Monitoring market activity'
                    : lifecycleStatus === 'scanning' ? 'Scanning' : lifecycleLabel
                  ));
                  const rawLifecycleProgress = tokenData.lifecycle_progress;
                  const lifecycleProgressValue = rawLifecycleProgress == null ? Number.NaN : Number(rawLifecycleProgress);
                  const lifecycleProgress = Number.isFinite(lifecycleProgressValue)
                    ? Math.max(0, Math.min(100, lifecycleProgressValue)) : null;
                  const diagnostics: TokenDiagnostic[] = Array.isArray(tokenData.diagnostics) ? tokenData.diagnostics : [];
                  const errorDetails = tokenData.lifecycle_error || diagnostics.find((diagnostic) =>
                    ['error', 'critical', 'fatal'].includes(String(diagnostic.severity || '').toLowerCase())
                  );
                  const errorExpanded = expandedErrors.includes(launch.mint_address);
                  const errorMessage = String(errorDetails?.message || '');
                  return (
                    <article
                      key={launch.id || launch.signature || launch.mint_address}
                      data-token-card
                      className="token-card-surface relative isolate mb-1 overflow-hidden rounded-[10px] border border-white/[0.075] bg-[#080808] px-2 py-1.5 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-20 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/35 before:to-transparent after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-20 after:h-px after:bg-white/[0.035] last:mb-0"
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 z-0"
                        style={{ background: 'linear-gradient(90deg, rgb(var(--token-accent-rgb, 153 69 255) / 0.12) 0%, rgb(var(--token-accent-rgb, 153 69 255) / 0.065) 48%, rgb(var(--token-accent-rgb, 153 69 255) / 0.018) 100%)' }}
                      />
                      <AnimatedCardScanOverlay status={lifecycleStatus} progress={lifecycleProgress} attempt={Number(tokenData.scan_attempt || 0)} />
                      <div className="relative z-10">
                        <div className="flex min-w-0 items-center gap-2">
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
                            <div className="mt-1 flex min-w-0 items-center gap-2">
                              <TokenCardSubtitle status={lifecycleStatus} subtitle={lifecycleSubEvent} />
                              {lifecycleStatus === 'scanning' && lifecycleProgress !== null && (
                                <span className="shrink-0 text-[8px] font-medium tabular-nums text-white/65">{Math.round(lifecycleProgress)}%</span>
                              )}
                                  {errorDetails && (
                                    <button
                                      type="button"
                                      aria-label={errorExpanded ? 'Hide error details' : 'Show error details'}
                                      title={errorExpanded ? 'Hide error details' : 'Show error details'}
                                      aria-expanded={errorExpanded}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setExpandedErrors((previous) => previous.includes(launch.mint_address)
                                          ? previous.filter((mint) => mint !== launch.mint_address)
                                          : [...previous, launch.mint_address]);
                                      }}
                                      className="inline-flex shrink-0 items-center gap-0.5 rounded px-0.5 text-[8px] leading-none text-red-200/70 hover:text-red-100"
                                    >
                                      <span>{errorExpanded ? 'Hide' : 'Error'}</span>
                                      <span aria-hidden="true">{errorExpanded ? '▴' : '▾'}</span>
                                    </button>
                                  )}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <TokenLifecycleBadge status={lifecycleStatus} label={lifecycleLabel} />
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
                        {errorDetails && errorExpanded && (
                          <div className="mt-1 rounded-md bg-black/45 p-2 text-[9px] text-white/65">
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
                        )}
                      </div>
                    </article>
                  );
                }), [visibleLaunches, tokensByMint, expandedErrors]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      {!embeddedMode && <section aria-label="Overview controls" className="relative flex-none w-full shrink-0 bg-transparent px-3 pt-[max(env(safe-area-inset-top,0px),16px)] sm:px-4" style={{ backgroundImage: "radial-gradient(ellipse 120% 72% at 50% 0%, rgba(229, 177, 74, 0.22) 0%, rgba(231, 137, 55, 0.13) 34%, rgba(231, 137, 55, 0.055) 62%, rgba(0, 0, 0, 0) 100%), linear-gradient(180deg, rgba(201, 143, 49, 0.075) 0%, rgba(0, 0, 0, 0) 100%)" }}>
        <div className="flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-medium uppercase tracking-[0.15em] text-white/40">Portfolio</div>
            <div aria-live="polite" className={`mt-1 flex min-w-0 items-baseline transition-colors duration-150 ease-out ${portfolioFlash === 'up' ? 'text-[#83b982]' : portfolioFlash === 'down' ? 'text-[#c77b7b]' : 'text-white'}`}>
              <span aria-hidden="true" className="shrink-0 text-[27px] font-bold leading-none tracking-[-0.055em] text-white sm:text-[30px]">$</span>
              <AutoFitNumber fullText={formattedPortfolio} compactText={compactNumber(portfolioValue)} maxFontSize={30} minFontSize={14} balanceDirection={balanceDirection} className="block whitespace-nowrap font-bold leading-none tracking-[-0.055em] tabular-nums" />
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="inline-flex items-baseline gap-1"><span className="text-[8px] font-medium uppercase tracking-wide text-white/35">Available</span><span className="text-[10px] font-medium tabular-nums text-white/70">${formatUsd(availableBalanceUsd)}</span></span>
              <span className="inline-flex items-baseline gap-1"><span className="text-[8px] font-medium uppercase tracking-wide text-white/35">Invested</span><span className="text-[10px] font-medium tabular-nums text-white/70">${formatUsd(investedBalanceUsd)}</span></span>
            </div>
          </div>
          <div className="shrink-0 pb-0.5 text-right">
            <div className="text-[8px] font-medium uppercase tracking-[0.13em] text-white/35">P&amp;L</div>
            <div aria-live="polite" className={`mt-1 flex items-center justify-end gap-1 text-[13px] font-semibold leading-none tracking-tight tabular-nums sm:text-sm ${isProfitable ? 'text-[#83b982]' : 'text-[#c77b7b]'}`}>
              <span aria-hidden="true" className="text-[9px]">{isProfitable ? '▲' : '▼'}</span>
              <span>{isProfitable ? '+' : '−'}<AutoFitNumber fullText={formatSol(Math.abs(profitLossPct)) + '%'} compactText={compactNumber(Math.abs(profitLossPct)) + '%'} maxFontSize={14} minFontSize={9} balanceDirection={balanceDirection} className="block whitespace-nowrap font-semibold leading-none tracking-tight tabular-nums" /></span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex min-h-9 items-center justify-between gap-3 border-y border-white/[0.07] py-2">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-[13px] font-semibold tracking-tight text-white">Live Detection</h1>
            <span className="hidden text-[9px] text-white/35 sm:inline">Solana launch intelligence</span>
          </div>
          <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[8px] font-semibold tracking-[0.07em] ${connected ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-[#83b982]' : 'border-white/10 bg-white/[0.035] text-white/50'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[#83b982]' : 'bg-white/35'}`} />
            {engineLabel}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
            <span className="text-[8px] font-medium uppercase tracking-[0.08em] text-white/40">Open positions</span>
            <span className="text-[14px] font-semibold leading-none tabular-nums text-white">{openPositionCount}</span>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
            <span className="truncate text-[8px] font-medium uppercase tracking-[0.08em] text-white/40">Unrealized P&amp;L</span>
            <span className="shrink-0 text-[12px] font-semibold leading-none tabular-nums" style={{ color: unrealizedProfitUsd > 0 ? '#83b982' : unrealizedProfitUsd < 0 ? '#c77b7b' : '#ffffff' }}>
              {unrealizedProfitUsd > 0 ? '+' : unrealizedProfitUsd < 0 ? '−' : ''}{'$'}{formatPnlDisplay(unrealizedProfitUsd)}
            </span>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 flex-col pb-0">
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

      <div className={`${embeddedMode ? "relative flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-0" : "relative mt-2 flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-0 sm:px-3 sm:pb-0"}`}>
          <div
            className="token-feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain bg-transparent pb-24"
          >
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
                {renderedLaunchCards}
              </div>
            )}
          </div>
          {!embeddedMode && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-20 h-14 bg-gradient-to-b from-black/95 via-black/70 to-transparent" />}

      </div>
    </div>
  );
};
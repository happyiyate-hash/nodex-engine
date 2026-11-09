import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenLaunchRecord, NodeXEvent, TokenDiagnostic } from '../../types';
import { Activity, Circle, Copy, ExternalLink, Search, ShieldCheck } from 'lucide-react';
import { TokenAvatar } from '../common/TokenAvatar';
import { PortfolioBalanceSnapshot, restClient } from '../../services/rest';

type ChangeDirection = 'up' | 'down' | null;
type FeedFilter = 'detected' | 'qualified' | 'positions';

interface RollingDigitProps {
  digit: string;
  balanceDirection: ChangeDirection;
}

type PipelineStatus = 'DETECTED' | 'ANALYZING' | 'QUALIFIED' | 'REJECTED' | 'UNVERIFIED' | 'FAILED' | 'PAPER ENTRY' | 'BUY FAILED';

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

const getLaunchView = (launch: TokenLaunchRecord, events: NodeXEvent[], token?: any): LaunchView => {
  const related: NodeXEvent[] = (events as NodeXEvent[]).filter((event: NodeXEvent) =>
    event.token_mint === launch.mint_address || event.data?.mint_address === launch.mint_address
  );
  const findEvent = (type: string): NodeXEvent | undefined =>
    related.find((event: NodeXEvent) => String(event.event_type) === type);
  const scanUpdate = findEvent('token_scan_update') || findEvent('token_scan_progress') || findEvent('safety_check_completed');
  const scanCompleted = findEvent('token_scan_completed');
  const scanFailed = findEvent('token_scan_failed');
  const scanStarted = Boolean(findEvent('token_scan_started'));
  const paperBuy = findEvent('paper_buy_executed');
  const paperBuyFailed = findEvent('paper_buy_failed');
  const strategyRejected = findEvent('strategy_rejected_token');
  const decision = String(
    scanFailed?.data?.decision || scanCompleted?.data?.decision ||
    scanUpdate?.data?.decision || scanUpdate?.data?.status || ''
  ).toLowerCase();
  const terminalStatus = String(scanFailed?.data?.status || scanCompleted?.data?.status || '').toLowerCase();
  // The event feed is intentionally capped. The persisted token snapshot is the
  // durable source of truth when scan events age out of the browser history.
  const security = token?.safety_details || {};
  const persistedDecision = String(security.decision || '').toLowerCase();
  const persistedStatus = String(security.status || '').toLowerCase();
  const persistedReason = String(security.decision_reason || security.error || '');
  // Scan lifecycle is also persisted on the token record. Do not rely only on
  // the capped event history: once old scan events roll off, DETECTED must not
  // overwrite a terminal UNVERIFIED/FAILED result.
  const tokenScanStatus = String(token?.scan_status || '').toLowerCase();
  const tokenQualification = String(token?.qualification_status || '').toLowerCase();
  const tokenScanReason = String(token?.rejection_reason || '');

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
  } else if (
    Boolean(scanFailed) || terminalStatus === 'failed' || persistedStatus === 'failed' ||
    tokenScanStatus === 'failed'
  ) {
    status = 'FAILED';
    reason = String(scanFailed?.data?.decision_reason || scanFailed?.data?.message || scanFailed?.data?.error || persistedReason || 'Security scan failed. This token remains unverified and blocked.');
    updatedAt = scanFailed?.timestamp || scanCompleted?.timestamp || security.scanned_at || launch.detected_at;
  } else if (security.diagnostic_only === true) {
    status = 'UNVERIFIED';
    reason = String(persistedReason || 'Diagnostic-only mode is active. Provider responses are being collected; no token is being verified or approved.');
    updatedAt = scanFailed?.timestamp || scanCompleted?.timestamp || security.scanned_at || launch.detected_at;
  } else if (
    persistedDecision === 'unverified' || ['unverified', 'unknown'].includes(persistedStatus) ||
    tokenScanStatus === 'unverified' || tokenQualification === 'unverified' ||
    scanCompleted && (['unverified', 'unknown', 'failed'].includes(terminalStatus) || decision.includes('unverified') || decision.includes('unknown'))
  ) {
    status = 'UNVERIFIED';
    reason = String(scanFailed?.data?.decision_reason || scanCompleted?.data?.decision_reason || scanUpdate?.data?.decision_reason || scanUpdate?.data?.reason || persistedReason || tokenScanReason || 'Security checks did not produce a verifiable result. Automatic entry remains blocked.');
    updatedAt = scanFailed?.timestamp || scanCompleted?.timestamp || security.scanned_at || launch.detected_at;
  } else if (strategyRejected || decision.includes('reject') || persistedDecision === 'rejected' || persistedStatus === 'rejected') {
    status = 'REJECTED';
    reason = String(strategyRejected?.data?.reason || strategyRejected?.data?.message || scanUpdate?.data?.decision_reason || scanUpdate?.data?.reason || persistedReason || 'The token did not pass the risk or strategy checks.');
    updatedAt = (strategyRejected || scanUpdate)?.timestamp || security.scanned_at || launch.detected_at;
  } else if (decision.includes('approv') || decision.includes('qualif') || persistedDecision === 'approved') {
    status = 'QUALIFIED';
    reason = String(scanUpdate?.data?.decision_reason || scanUpdate?.data?.reason || persistedReason || 'Security scan completed and strategy filters passed.');
    updatedAt = scanUpdate?.timestamp || security.scanned_at || launch.detected_at;
  } else if (scanStarted || scanUpdate || persistedStatus === 'scanning' || tokenScanStatus === 'scanning' || tokenQualification === 'under_analysis') {
    status = 'ANALYZING';
    reason = scanUpdate
      ? String(scanUpdate.data?.message || scanUpdate.data?.reason || 'Security scan update received.')
      : 'Security checks are running.';
    updatedAt = (scanUpdate || findEvent('token_scan_started'))?.timestamp || security.scanned_at || launch.detected_at;
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
  UNVERIFIED: 'border-amber-500/20 bg-amber-500/[0.07] text-[#d2b47c]',
  FAILED: 'border-red-500/20 bg-red-500/[0.07] text-[#c77b7b]',
};

export const OverviewPage: React.FC<{ embeddedMode?: 'detected' | 'positions' }> = ({ embeddedMode }) => {
  const { launches, events, engineStatus, openTokenDetailByMint, profile, positions, tokens } = useTerminal();
  const [livePortfolioBalance, setLivePortfolioBalance] = useState<PortfolioBalanceSnapshot | null>(null);
  const latestSolPriceUpdate = events.find((event) => event.event_type === 'sol_price_update')?.timestamp || '';
  useEffect(() => {
    let active = true;
    restClient.getPortfolioBalance()
      .then((balance) => { if (active) setLivePortfolioBalance(balance); })
      .catch(() => { /* Keep the last known profile valuation if the live endpoint is unavailable. */ });
    return () => { active = false; };
  }, [latestSolPriceUpdate]);

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
  const portfolioFlash: ChangeDirection = null;
  const balanceDirection: ChangeDirection = null;
  const [filter, setFilter] = useState<FeedFilter>('detected');
  const [search, setSearch] = useState('');
  const [expandedScans, setExpandedScans] = useState<string[]>([]);
  const [expandedErrors, setExpandedErrors] = useState<string[]>([]);

  const launchViews = useMemo(
    () => launches.map((launch) => getLaunchView(launch, events, tokens.find((token) => token.mint === launch.mint_address))).sort((a, b) => new Date(b.launch.detected_at).getTime() - new Date(a.launch.detected_at).getTime()),
    [launches, events, tokens]
  );
  const counts = useMemo(() => ({
    detected: launchViews.filter((item) => ['DETECTED', 'ANALYZING', 'QUALIFIED', 'PAPER ENTRY', 'REJECTED', 'UNVERIFIED', 'FAILED', 'BUY FAILED'].includes(item.status)).length,
    qualified: launchViews.filter((item) => ['QUALIFIED', 'PAPER ENTRY'].includes(item.status)).length,
    positions: openPositionCount,
  }), [launchViews, openPositionCount]);

  const filteredLaunches = launchViews.filter((item) => {
    if (filter === 'detected' && !['DETECTED', 'ANALYZING', 'QUALIFIED', 'PAPER ENTRY', 'REJECTED', 'UNVERIFIED', 'FAILED', 'BUY FAILED'].includes(item.status)) return false;
    if (filter === 'qualified' && !['QUALIFIED', 'PAPER ENTRY'].includes(item.status)) return false;
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
  const backendPaperEntries = launchViews.filter((item) => item.status === 'PAPER ENTRY' && (
    !search.trim() || item.launch.mint_address.toLowerCase().includes(search.trim().toLowerCase()) ||
    String(item.launch.source || '').toLowerCase().includes(search.trim().toLowerCase())
  ));

  const connected = engineStatus.ws_status === 'connected' && engineStatus.running;
  const engineLabel = !engineStatus.running ? 'ENGINE PAUSED' : engineStatus.ws_status === 'connected' ? 'ENGINE ONLINE' : 'RECONNECTING';
  const formatSol = (value: number) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  const formatUsd = (value: number) => Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const isProfitable = profitLoss >= 0;
  const formattedPortfolio = formatUsd(portfolioValue);

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
              <div className="flex min-w-0 items-baseline whitespace-nowrap text-[19px] font-semibold leading-none tabular-nums text-white">
                <span className="mr-0.5">$</span><span className="truncate">{formatUsd(unrealizedProfitUsd)}</span>
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

      <div className={`${embeddedMode ? "relative flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-0" : "mt-2 flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-0 sm:px-4 sm:pb-0"}`}>
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
                  const matchesLaunch = (event: NodeXEvent) => event.data?.mint_address === launch.mint_address || event.token_mint === launch.mint_address;
                  const progressEvent = events.find((event) => event.event_type === 'token_scan_progress' && matchesLaunch(event));
                  const reportEvent = events.find((event) => event.event_type === 'token_scan_update' && matchesLaunch(event))
                    || progressEvent
                    || events.find((event) => ['token_scan_completed', 'token_scan_failed'].includes(event.event_type) && matchesLaunch(event));
                  const tokenData = (tokens.find((token) => token.mint === launch.mint_address) || launch) as any;
                  // Prefer the live event while present, then fall back to the full
                  // persisted security report carried by token_state_updated.
                  const report = { ...(tokenData.safety_details || {}), ...(reportEvent?.data || {}) };
                  const monitoringEvent = events.find((event) => event.event_type === 'token_monitoring_update' && (event.data?.mint_address === launch.mint_address || event.token_mint === launch.mint_address));
                  const monitoringData = monitoringEvent?.data;

                  const checks = Array.isArray(report?.checks) ? report.checks : [];
                  const price = Number(tokenData.current_price ?? tokenData.price_usd ?? tokenData.price ?? report?.price_usd ?? report?.current_price);
                  const marketCap = Number(tokenData.market_cap ?? tokenData.market_cap_usd ?? report?.market_cap_usd);
                  const cardName = tokenData.name || tokenData.token_name || `${launch.mint_address.slice(0, 7)}…${launch.mint_address.slice(-5)}`;
                  const cardSymbol = tokenData.symbol || tokenData.token_symbol || '';
                  const isQualified = status === 'QUALIFIED' || status === 'PAPER ENTRY';
                  const checkRows = checks;
                  const diagnostics: TokenDiagnostic[] = Array.isArray(tokenData.diagnostics) ? tokenData.diagnostics : [];
                  const scanStage = String(progressEvent?.data?.stage || tokenData.scan_stage || report?.stage || '').replace(/[_-]+/g, ' ').trim();
                  const errorExpanded = expandedErrors.includes(launch.mint_address);
                  return (
                    <article key={launch.id || launch.signature} className="border-b border-white/[0.07] bg-transparent px-0 py-3 last:border-b-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
                          {(() => {
                            const imageUrl = tokenData.logo_url || tokenData.image_url || tokenData.image_uri || tokenData.logo_uri || tokenData.image;
                            return <TokenAvatar symbol={cardSymbol || cardName} logoUrl={imageUrl} size="lg" className="h-8 w-8 border-0" />;
                          })()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-[11px] font-semibold leading-tight text-white">{cardName}</span>
                            {cardSymbol && <span className="shrink-0 text-[8px] font-medium text-white/40">${cardSymbol}</span>}
                          </div>
                          <div className="mt-0.5 truncate text-[8px] leading-tight text-white/35">{launch.source || 'Solana'} · {timeAgo(launch.detected_at)}</div>
                          {monitoringData && <div className="mt-1 flex items-center gap-1.5 text-[8px] font-medium text-sky-300/75">
                            <span className="h-1 w-1 rounded-full bg-sky-300" />
                            WATCHING · Authorities {String(monitoringData.authority_status || 'unknown').toUpperCase()} · {Number(monitoringData.rechecks || 0)} rechecks
                          </div>}
                        </div>
                        {isQualified
                          ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-1.5 py-0.5 text-[7px] font-semibold tracking-wide text-[#83b982]"><ShieldCheck className="h-2.5 w-2.5" /> VERIFIED</span>
                          : <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[7px] font-semibold tracking-wide ${status === 'ANALYZING' ? 'border-amber-400/20 bg-amber-400/[0.06] text-[#d2b47c]' : status === 'REJECTED' || status === 'BUY FAILED' || status === 'FAILED' ? 'border-red-400/20 bg-red-400/[0.06] text-[#c77b7b]' : status === 'UNVERIFIED' ? 'border-amber-400/20 bg-amber-400/[0.06] text-[#d2b47c]' : 'border-white/[0.08] bg-white/[0.03] text-white/50'}`}>
                            {status === 'ANALYZING' && <span className="h-1 w-1 rounded-full bg-current" />}
                            {status === 'ANALYZING' ? 'SCANNING' : status === 'UNVERIFIED' ? 'UNVERIFIED' : status === 'FAILED' ? 'SCAN FAILED' : status === 'REJECTED' || status === 'BUY FAILED' ? status : 'DETECTED'}
                          </span>}
                      </div>
                      <div className="mt-1.5 border-t border-white/[0.055] pt-1.5">
                        {status === 'ANALYZING' ? (() => {
                          const progress = Number(report?.progress_pct ?? report?.progress);
                          return <div className="flex min-h-[22px] items-center gap-2">
                            <span className="text-[10px] font-medium tracking-wide text-[#d2b47c]">{scanStage ? 'Checking ' + scanStage : report?.message || 'Security scan in progress'}</span>
                            {Number.isFinite(progress) && progress >= 0 && <span className="ml-auto text-[9px] tabular-nums text-white/45">{Math.min(100, Math.round(progress))}%</span>}
                          </div>;
                        })() : (
                          <div className="flex min-h-[22px] items-center justify-between gap-2">
                            <span className={`text-[9px] font-medium ${status === 'QUALIFIED' || status === 'PAPER ENTRY' ? 'text-[#83b982]' : status === 'REJECTED' || status === 'BUY FAILED' ? 'text-[#d2a064]' : 'text-white/45'}`}>
                              {status === 'QUALIFIED' || status === 'PAPER ENTRY' ? 'Security checks completed' : status === 'REJECTED' || status === 'BUY FAILED' ? 'Risk checks flagged this token' : status === 'UNVERIFIED' ? 'Scan incomplete — automatic entry blocked' : status === 'FAILED' ? 'Security scan failed — automatic entry blocked' : 'Waiting for security scan'}
                            </span>
                            <span className="text-[8px] text-white/30">{checkRows.length} checks</span>
                          </div>
                        )}
                        <button type="button" onClick={() => setExpandedScans((current) => current.includes(launch.mint_address) ? current.filter((mint) => mint !== launch.mint_address) : [...current, launch.mint_address])} className="mt-1 flex w-full items-center justify-between text-left text-[8px] text-white/35 transition-colors hover:text-white/65">
                          <span>{expandedScans.includes(launch.mint_address) ? 'Hide scan details' : 'View scan details'}</span>
                          <span className="text-[10px]">{expandedScans.includes(launch.mint_address) ? '−' : '+'}</span>
                        </button>
                        {expandedScans.includes(launch.mint_address) && <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 bg-transparent py-2">
                          {checkRows.map((check: any, index: number) => {
                            const result = String(check.status || 'PENDING').toUpperCase();
                            const passed = ['PASSED', 'PASS', 'OK', 'SAFE', 'CLEAR'].includes(result);
                            const flagged = ['FAILED', 'FAIL', 'REJECTED', 'RISKY', 'WARNING', 'RISK', 'DETECTED'].includes(result);
                            return <div key={check.name || index} className="flex min-w-0 items-center justify-between gap-1 text-[8px]">
                              <span className="truncate text-white/55">{String(check.name || 'Security check').replace(/_/g, ' ')}</span>
                              <span className={`shrink-0 font-semibold ${passed ? 'text-[#83b982]' : flagged ? 'text-amber-300' : 'text-white/35'}`}>{passed ? 'PASS' : flagged ? (result === 'DETECTED' ? 'RISK' : result) : result}</span>
                            </div>;
                          })}
                          {report?.risk_score !== undefined && <div className="col-span-2 border-t border-white/[0.06] pt-1 text-[8px] text-white/55">Risk score: <span className="font-semibold text-white/80">{String(report.risk_score)}</span></div>}
                          {report?.diagnostic_only === true && <div className="col-span-2 border-t border-white/[0.06] pt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-amber-300/75">Diagnostic-only mode · verification disabled</div>}
                          {report?.diagnostic_assessment !== undefined && report?.diagnostic_assessment !== null && <details className="col-span-2 border-t border-white/[0.06] pt-1">
                            <summary className="cursor-pointer select-none text-[8px] font-medium text-white/45 hover:text-white/75">Provisional parser assessment JSON (not used to verify)</summary>
                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/60 p-2 font-mono text-[8px] leading-relaxed text-[#c9c9c9]">{JSON.stringify(report.diagnostic_assessment, null, 2)}</pre>
                          </details>}
                          {report?.rugcheck?.raw_response !== undefined && <details className="col-span-2 border-t border-white/[0.06] pt-1">
                            <summary className="cursor-pointer select-none text-[8px] font-medium text-white/45 hover:text-white/75">RugCheck provider response JSON</summary>
                            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/60 p-2 font-mono text-[8px] leading-relaxed text-[#c9c9c9]">{JSON.stringify(report.rugcheck.raw_response, null, 2)}</pre>
                          </details>}
                          {Array.isArray(report?.provider_responses) && report.provider_responses.map((providerResponse: any, index: number) => <details key={providerResponse.id || providerResponse.method || index} className="col-span-2 border-t border-white/[0.06] pt-1">
                            <summary className="cursor-pointer select-none text-[8px] font-medium text-white/45 hover:text-white/75">{String(providerResponse.provider || 'Provider')} · {String(providerResponse.method || 'request')} response JSON</summary>
                            <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/60 p-2 font-mono text-[8px] leading-relaxed text-[#c9c9c9]">{JSON.stringify(providerResponse.response ?? providerResponse, null, 2)}</pre>
                          </details>)}
                          {reason && <div className="col-span-2 border-t border-white/[0.06] pt-1 text-[8px] leading-relaxed text-white/45">{reason}</div>}
                        </div>}
                      </div>
                      {diagnostics.length > 0 && <section className="mt-2 border-t border-red-400/[0.12] pt-1.5">
                        <button type="button" aria-expanded={errorExpanded} onClick={() => setExpandedErrors((current) => errorExpanded ? current.filter((mint) => mint !== launch.mint_address) : [...current, launch.mint_address])} className="flex w-full items-center justify-between gap-2 py-1 text-left">
                          <span className="flex min-w-0 items-center gap-1.5 text-[9px] font-semibold text-[#d28b83]">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c77b7b]" />
                            {diagnostics.length} diagnostic {diagnostics.length === 1 ? 'error' : 'errors'}
                          </span>
                          <span className="text-[9px] text-white/40">{errorExpanded ? 'Hide error details −' : 'View error details +'}</span>
                        </button>
                        {errorExpanded && <div className="mt-1 space-y-2 pb-1">
                          {diagnostics.slice().reverse().map((diagnostic, index) => <div key={diagnostic.occurred_at || index} className="rounded-lg border border-red-400/[0.12] bg-red-400/[0.035] p-2">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[8px] font-semibold uppercase tracking-wide text-[#d28b83]">
                              <span>{diagnostic.stage || 'Processing'}</span>
                              <span className="text-white/30">·</span>
                              <span>{diagnostic.provider || 'Provider'}</span>
                              {diagnostic.occurred_at && <span className="ml-auto font-normal normal-case text-white/30">{new Date(diagnostic.occurred_at).toLocaleString()}</span>}
                            </div>
                            <p className="mt-1 break-words text-[9px] leading-relaxed text-white/75">{diagnostic.message || 'An error occurred without a message.'}</p>
                            {diagnostic.raw_response !== undefined && <details className="mt-2">
                              <summary className="cursor-pointer select-none text-[8px] font-medium text-white/45 hover:text-white/75">Provider response JSON</summary>
                              <pre className="mt-1 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-md bg-black/60 p-2 font-mono text-[8px] leading-relaxed text-[#c9c9c9]">{JSON.stringify(diagnostic.raw_response, null, 2)}</pre>
                            </details>}
                          </div>)}
                        </div>}
                      </section>}
                      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2 border-t border-white/[0.055] pt-1.5">
                        <div className="flex min-w-0 items-center gap-3 text-[8px]">
                          <span className="whitespace-nowrap text-white/35">Price <span className="font-medium tabular-nums text-white/80">{Number.isFinite(price) && price > 0 ? `$${price.toFixed(8)}` : '—'}</span></span>
                          <span className="whitespace-nowrap text-white/35">MCap <span className="font-medium tabular-nums text-white/80">{Number.isFinite(marketCap) && marketCap > 0 ? `$${marketCap.toLocaleString('en-US',{maximumFractionDigits:0})}` : '—'}</span></span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5 text-[8px] text-white/35">
                          <span>{`${launch.mint_address.slice(0, 5)}…${launch.mint_address.slice(-4)}`}</span>
                          <button onClick={(event) => copyMint(event, launch.mint_address)} aria-label="Copy token mint" className="inline-flex items-center gap-0.5 text-white/45"><Copy className="h-2.5 w-2.5" />Copy</button>
                          <a href={`https://solscan.io/token/${launch.mint_address}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-white/45">Inspect <ExternalLink className="h-2.5 w-2.5" /></a>
                        </div>
                      </div>
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

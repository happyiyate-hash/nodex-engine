import React, { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenAvatar } from '../common/TokenAvatar';
import { DotMatrixChart } from '../common/DotMatrixChart';
import { marketDataService } from '../../services/marketData';
import {
  ChevronLeft,
  Copy,
  Check,
  ChartLine,
  ChartCandlestick,
} from 'lucide-react';

interface TokenDataSnapshot {
  mint: string;
  identity: { name?: string | null; symbol?: string | null; logo_url?: string | null; mint_address?: string; creator_address?: string | null; created_at?: string | null };
  market: { price_usd?: number | null; price_sol?: number | null; market_cap_usd?: number | null; liquidity_usd?: number | null; change_1m_pct?: number | null; change_5m_pct?: number | null; change_24h_pct?: number | null; volume_24h_usd?: number | null; transactions_24h?: number | null; buy_volume_usd?: number | null; sell_volume_usd?: number | null; buy_pressure_pct?: number | null };
  chart: { timeframe: string; points: Array<{ timestamp_ms: number; open: number; high: number; low: number; close: number; volume: number }> };
  trades: { recent: Array<{ signature: string; event_index: number; side: string; trader?: string | null; amount_sol?: number | null; token_amount?: number | null; price_usd?: number | null; volume_usd?: number | null; timestamp_ms: number }> };
  holders: { total_count?: number | null; top_10_ownership_pct?: number | null; largest: Array<{ address: string; token_amount: number; supply_pct?: number | null; rank: number }> };
  info: { decimals?: number | null; total_supply?: string | null; circulating_supply?: string | null; token_standard?: string | null; creator_address?: string | null };
  data_status?: Record<string, string>;
}

export const TokenDetailPage: React.FC = () => {
  const {
    selectedToken,
    tokens,
    closeTokenDetail,
    positions,
  } = useTerminal();

  const [copiedMint, setCopiedMint] = useState(false);
  const [timeframe, setTimeframe] = useState<'1S' | '5S' | '10S' | '1M' | '5M' | '15M' | '30M' | '1H' | '24H'>('1S');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [activeDetailTab, setActiveDetailTab] = useState<'Info' | 'Holders' | 'Position' | 'Trades'>('Info');
  const [tradeFilter, setTradeFilter] = useState<'All' | 'Buys' | 'Sells'>('All');
  const [floatingAmounts, setFloatingAmounts] = useState<Array<{ id: number; amount: number; side: 'buy' | 'sell' }>>([]);
  const timeframeScrollRef = useRef<HTMLDivElement>(null);
  const tfDragStateRef = useRef<{ active: boolean; startX: number; startScrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressTimeframeClickRef = useRef(false);
  const [scrubPrice, setScrubPrice] = useState<number | null>(null);
  const [scrubTime, setScrubTime] = useState<string | null>(null);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const pageScrollRef = useRef<HTMLElement>(null);
  const marketDataSocketRef = useRef<WebSocket | null>(null);
  const [marketDataSnapshot, setMarketDataSnapshot] = useState<TokenDataSnapshot | null>(null);
  const [marketDataLoading, setMarketDataLoading] = useState(false);
  const [marketDataError, setMarketDataError] = useState('');
  const [marketDataStreamConnected, setMarketDataStreamConnected] = useState(false);
  const [marketDataStreamError, setMarketDataStreamError] = useState('');

  // Resolve the selected token from the shared registry on every render so live
  // token merges are reflected immediately instead of displaying a stale snapshot.
  const activeToken = selectedToken
    ? (tokens.find((token) => token.mint === selectedToken.mint) || selectedToken)
    : null;

  // Load the selected mint from the independent Token Data service. The mint
  // is part of the snapshot URL and the saved Market Data key is sent as x-api-key.
  useEffect(() => {
    const mint = activeToken?.mint;
    if (!mint) return;
    let cancelled = false;
    const loadSnapshot = async () => {
      setMarketDataLoading(true);
      setMarketDataError('');
      setMarketDataSnapshot(null);
      const settings = marketDataService.loadSettings();
      if (!settings.restUrl || !settings.apiKey) {
        setMarketDataError('Market Data API is not configured. Add its REST URL and API key in Settings.');
        setMarketDataLoading(false);
        return;
      }
      try {
        const baseUrl = settings.restUrl.endsWith('/') ? settings.restUrl : settings.restUrl + '/';
        const url = new URL('api/v1/tokens/' + encodeURIComponent(mint) + '/snapshot?timeframe=' + encodeURIComponent(timeframe), baseUrl);
        const response = await fetch(url.toString(), { headers: { 'x-api-key': settings.apiKey } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload === 'string' ? payload : (payload.error || payload.message || 'Token snapshot request failed (HTTP ' + response.status + ').'));
        if (!cancelled) setMarketDataSnapshot(payload as TokenDataSnapshot);
      } catch (error) {
        if (!cancelled) setMarketDataError(error instanceof Error ? error.message : 'Could not load token market data.');
      } finally {
        if (!cancelled) setMarketDataLoading(false);
      }
    };
    void loadSnapshot();
    return () => { cancelled = true; };
  }, [activeToken?.mint, timeframe]);

  // One authenticated WebSocket session per selected token. The API key is
  // exchanged for a short-lived ticket; the mint and topics are sent in subscribe.
  useEffect(() => {
    const mint = activeToken?.mint;
    if (!mint) return;
    let cancelled = false;
    let socket: WebSocket | null = null;
    const connect = async () => {
      const settings = marketDataService.loadSettings();
      if (!settings.restUrl || !settings.apiKey || !settings.wsUrl) {
        setMarketDataStreamConnected(false);
        setMarketDataStreamError('Market Data WebSocket is not configured.');
        return;
      }
      try {
        socket = await marketDataService.connectWebSocket(settings);
        if (cancelled) { socket.close(); return; }
        marketDataSocketRef.current = socket;
        setMarketDataStreamConnected(true);
        setMarketDataStreamError('');
        socket.send(JSON.stringify({
          command: 'subscribe',
          mint,
          topics: ['token.market', 'token.chart', 'token.trades', 'token.activity', 'token.holders', 'token.info', 'token.creator'],
        }));
        socket.send(JSON.stringify({ command: 'set_chart_timeframe', timeframe }));
        socket.addEventListener('message', (messageEvent) => {
          let message: any;
          try { message = JSON.parse(String(messageEvent.data)); } catch { return; }
          if (message.event === 'resync_required') {
            setMarketDataStreamError('Market Data stream requested a refresh. Reopen this token to resync.');
            return;
          }
          if (message.event === 'error') {
            setMarketDataStreamError(String(message.message || message.code || 'Market Data stream reported an error.'));
            return;
          }
          const data = message.data && typeof message.data === 'object' ? message.data : {};
          const topic = String(message.topic || '');
          if (topic === 'token.market') {
            const patch = data.market && typeof data.market === 'object' ? data.market : data;
            setMarketDataSnapshot((previous) => previous ? { ...previous, market: { ...previous.market, ...patch } } : previous);
          } else if (topic === 'token.chart') {
            const point = data.point || data.candle || data;
            const timestamp = Number(point.timestamp_ms || point.time || message.timestamp_ms || 0);
            const close = Number(point.close ?? point.price ?? 0);
            if (timestamp > 0 && close > 0) {
              const normalized = { timestamp_ms: timestamp, open: Number(point.open ?? close), high: Number(point.high ?? close), low: Number(point.low ?? close), close, volume: Number(point.volume || 0) };
              setMarketDataSnapshot((previous) => previous ? {
                ...previous,
                chart: { ...previous.chart, points: [...previous.chart.points.filter((item) => item.timestamp_ms !== timestamp), normalized].sort((a, b) => a.timestamp_ms - b.timestamp_ms).slice(-5000) },
              } : previous);
            }
          } else if (topic === 'token.trades') {
            const trade = data.trade || data;
            if (trade.signature) setMarketDataSnapshot((previous) => previous ? {
              ...previous,
              trades: { recent: [trade, ...previous.trades.recent.filter((item) => item.signature !== trade.signature)].slice(0, 100) },
            } : previous);
          } else if (topic === 'token.holders') {
            const holders = data.holders && typeof data.holders === 'object' ? data.holders : data;
            setMarketDataSnapshot((previous) => previous ? { ...previous, holders: { ...previous.holders, ...holders } } : previous);
          } else if (topic === 'token.info' || topic === 'token.creator') {
            setMarketDataSnapshot((previous) => previous ? {
              ...previous,
              identity: { ...previous.identity, ...(data.identity || {}), ...(topic === 'token.creator' ? { creator_address: data.creator_address || data.address } : {}) },
              info: { ...previous.info, ...(data.info || {}) },
            } : previous);
          } else if (topic === 'token.activity') {
            const side = String(data.side || data.type || '').toLowerCase();
            const amount = Number(data.amount_sol ?? data.amount ?? data.volume_sol ?? 0);
            if ((side === 'buy' || side === 'sell') && amount > 0) {
              const id = Number(message.sequence || message.timestamp_ms || Date.now());
              setFloatingAmounts((current) => [...current.filter((item) => Date.now() - item.id < 3600), { id, amount, side }].slice(-12));
            }
          }
        });
        socket.addEventListener('close', () => {
          if (!cancelled) {
            setMarketDataStreamConnected(false);
            setMarketDataStreamError('Market Data stream disconnected.');
          }
        });
        socket.addEventListener('error', () => {
          if (!cancelled) {
            setMarketDataStreamConnected(false);
            setMarketDataStreamError('Market Data stream connection error.');
          }
        });
      } catch (error) {
        if (!cancelled) {
          setMarketDataStreamConnected(false);
          setMarketDataStreamError(error instanceof Error ? error.message : 'Could not connect to Market Data stream.');
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
      if (socket) socket.close();
      if (marketDataSocketRef.current === socket) marketDataSocketRef.current = null;
      setMarketDataStreamConnected(false);
    };
  }, [activeToken?.mint]);

  useEffect(() => {
    const socket = marketDataSocketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ command: 'set_chart_timeframe', timeframe }));
    }
  }, [timeframe]);

  if (!activeToken) return null;
  const activePosition = positions.find((position) => position.mint === activeToken.mint && position.status === 'OPEN');
  const chartHistory: import('../../types').PricePoint[] = (marketDataSnapshot?.chart?.points || []).map((point) => ({
    time: Number(point.timestamp_ms),
    price: Number(point.close),
    open: Number(point.open),
    high: Number(point.high),
    low: Number(point.low),
    close: Number(point.close),
    volume: Number(point.volume || 0),
  })).filter((point) => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.price) && point.price > 0);
  const lastChartPoint = chartHistory[chartHistory.length - 1];
  const liveTokenPrice = Number(marketDataSnapshot?.market?.price_usd ?? lastChartPoint?.close ?? 0);
  const currentPrice = scrubPrice ?? liveTokenPrice;
  const marketCap = marketDataSnapshot?.market?.market_cap_usd ?? null;
  const marketChangePct = marketDataSnapshot?.market?.change_24h_pct ?? null;
  const isPositive = (marketChangePct ?? 0) >= 0;
  const entryPriceUsd = activePosition?.entry_price_usd;
  const hasMarketPrice = Number.isFinite(liveTokenPrice) && liveTokenPrice > 0;
  const hasChartData = chartHistory.length > 0;
  const formatCompactMarketCap = (value: number | null | undefined) => {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  };
  const formatUsd = (value: number | null | undefined, maximumFractionDigits = 2) => {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits }).format(Number(value));
  };

  const handleCopyMint = () => {
    navigator.clipboard.writeText(activeToken.mint);
    setCopiedMint(true);
    setTimeout(() => setCopiedMint(false), 2000);
  };



  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#000000] text-white select-none font-sans">
      {/* The safe area remains covered while the token navigation stays permanently visible. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-50 bg-[#000000]"
        style={{ height: 'env(safe-area-inset-top)' }}
      />
      <header
        className="absolute inset-x-0 z-40 w-full border-b border-white/[0.06] bg-[#000000] px-3 py-1.5 shadow-[0_6px_18px_rgba(0,0,0,0.22)] sm:px-5"
        style={{ top: 'calc(env(safe-area-inset-top) - 2px)' }}
      >
        <div className="relative flex h-12 w-full items-center">
          <div
            aria-hidden={isHeaderExpanded}
            className={`absolute inset-0 flex items-center justify-between gap-3 transition-opacity ease-out ${
              isHeaderExpanded
                ? 'pointer-events-none opacity-0 duration-150 delay-0'
                : 'pointer-events-auto opacity-100 duration-200 delay-100'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                tabIndex={isHeaderExpanded ? -1 : 0}
                onClick={closeTokenDetail}
                aria-label="Go back"
                title="Go back"
                className="inline-flex h-10 w-9 shrink-0 items-center justify-center text-white/55 transition-colors hover:text-white/80 active:text-white"
              >
                <ChevronLeft className="h-[29px] w-[29px]" strokeWidth={1.8} />
              </button>
              <span className="truncate text-[12px] font-medium tracking-wide text-white/65">
                {activeToken.symbol || 'Token'}
              </span>
            </div>
          </div>

          <div
            aria-hidden={!isHeaderExpanded}
            className={`absolute inset-0 flex items-center justify-between gap-3 transition-opacity ease-out ${
              isHeaderExpanded
                ? 'pointer-events-auto opacity-100 duration-200 delay-100'
                : 'pointer-events-none opacity-0 duration-150 delay-0'
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="relative shrink-0">
                <TokenAvatar
                  symbol={activeToken.symbol}
                  logoUrl={activeToken.logo_url}
                  size="lg"
                  className="!h-[46px] !w-[46px] shrink-0 !rounded-lg !text-lg"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-[4px] border-[1.5px] border-[#000000] bg-[#000000] shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
                >
                  <img
                    src="/assets/token-fallbacks/solana-logo.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </span>
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-1 leading-tight">
                <span className="truncate text-[12px] font-semibold tracking-wide text-white/90">
                  {activeToken.symbol || 'Token'}
                </span>
                <button
                  type="button"
                  tabIndex={isHeaderExpanded ? 0 : -1}
                  onClick={handleCopyMint}
                  aria-label="Copy contract address"
                  title="Copy contract address"
                  className="flex min-w-0 items-center gap-1 text-[9px] font-mono text-white/40 transition-colors hover:text-white/75"
                >
                  <span className="truncate">{activeToken.mint.slice(0, 4)}...{activeToken.mint.slice(-4)}</span>
                  {copiedMint ? <Check className="h-2.5 w-2.5 shrink-0 text-emerald-400" /> : <Copy className="h-2.5 w-2.5 shrink-0" />}
                </button>
              </div>
            </div>
            <div className="shrink-0 text-right leading-none">
              <div className="font-sans text-[14px] font-semibold tabular-nums tracking-tight text-white">
                {hasMarketPrice ? formatCompactMarketCap(marketCap) : 'MC unavailable'}
              </div>
              <div className={`mt-1 flex items-center justify-end gap-0.5 font-mono text-[10px] font-semibold ${isPositive ? 'text-[#6CE094]' : 'text-[#F06A6A]'}`}>
                <span>{marketChangePct == null ? 'Change unavailable' : `${isPositive ? '▲ +' : '▼ '}${marketChangePct.toFixed(2)}%`}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 59px)' }}
      >
      {/* One continuous page scroller: overview, chart, sticky tabs, and tab content share the same scroll. */}
      <section
        ref={pageScrollRef}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-none bg-[#000000] [touch-action:pan-y]"
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          setIsHeaderExpanded((prev) => (prev ? top > 48 : top > 72));
        }}
      >
      {/* Compact token overview: identity on the left, market cap and change on the right. */}
      <div className="relative w-full min-w-0 max-w-full overflow-x-clip bg-[#000000] px-3 pt-2 pb-2">
        <div className="relative z-20 flex w-full min-w-0 items-center justify-between gap-3 bg-[#000000]">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative shrink-0">
              <TokenAvatar
                symbol={activeToken.symbol}
                logoUrl={activeToken.logo_url}
                size="lg"
                className="!h-[52px] !w-[52px] shrink-0 !rounded-lg !text-xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-1 -right-1 flex h-[20px] w-[20px] items-center justify-center overflow-hidden rounded-[5px] border-[1.5px] border-[#000000] bg-[#000000] shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
              >
                <img
                  src="/assets/token-fallbacks/solana-logo.png"
                  alt=""
                  className="h-full w-full object-cover"
                />
              </span>
            </div>
            <div className="flex min-w-0 flex-col justify-center gap-1">
              <p className="truncate text-[13px] font-semibold tracking-tight text-white/95">
                {activeToken.name || activeToken.symbol || 'Unknown token'}
              </p>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[12px] font-medium tracking-wide text-white/55">
                  {activeToken.symbol || 'Token'}
                </span>
                <button
                  type="button"
                  onClick={handleCopyMint}
                  aria-label="Copy contract address"
                  title="Copy contract address"
                  className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-white/45 transition-colors hover:text-white/90"
                >
                  {copiedMint ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>
          <div className="shrink-0 -mr-1.5 text-right">
            <p className="pr-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-white/40">Market Cap</p>
            <p className="mt-0.5 pr-1.5 font-sans text-[16px] font-normal tabular-nums tracking-tight text-white/95">
              {formatCompactMarketCap(marketCap)}
            </p>
            <div className="mt-0.5 flex justify-end">
              <span
                className={`inline-flex items-center justify-center gap-1 rounded-[4px] px-2 py-1 font-sans text-[12.5px] font-semibold tabular-nums leading-none transition-colors ${
                  isPositive ? 'bg-[#6CE094]/15 text-[#6CE094]' : 'bg-[#F06A6A]/15 text-[#F06A6A]'
                }`}
              >
                {marketChangePct != null && (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 12 12"
                    className="h-2.5 w-2.5 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="miter"
                  >
                    {isPositive ? (
                      <path d="M2 7.8 L6 3.6 L10 7.8" />
                    ) : (
                      <path d="M2 4.2 L6 8.4 L10 4.2" />
                    )}
                  </svg>
                )}
                <span>{marketChangePct == null ? '—' : `${Math.abs(marketChangePct).toFixed(2)}%`}</span>
              </span>
            </div>
          </div>
        </div>
          {/* Live Scrub Indicator (if dragging); kept inside the plot area. */}
        {scrubTime && (
          <div className="absolute top-3 right-4 z-10 rounded border border-white/10 bg-[#0a0a0c]/80 px-2 py-0.5 font-mono text-[10px] text-white/50">
            {scrubTime}
          </div>
        )}

        {/* Demo-only animation preview; connect verified backend swap events here later. */}
        <style>{`
          @keyframes nodex-money-flow {
            0% { transform: translate3d(0, 0, 0); opacity: 0; }
            10% { opacity: 0.92; }
            76% { opacity: 0.78; }
            100% { transform: translate3d(0, -286px, 0); opacity: 0; }
          }
          @keyframes nodex-money-flow-sell {
            0% { transform: translate3d(0, 0, 0); opacity: 0; }
            10%, 76% { opacity: 1; }
            100% { transform: translate3d(0, -286px, 0); opacity: 0; }
          }
        `}</style>
        {/* Chart canvas spans edge-to-edge; controls sit beneath its time axis. */}
        <div className="relative z-0 -mx-3 -mt-3 w-[calc(100%+1.5rem)]">
          <DotMatrixChart
            key={`${activeToken.mint.slice(0, 7)}..${activeToken.mint.slice(-5)}`}
            currentPrice={liveTokenPrice}
            marketCap={marketCap ?? undefined}
            entryPrice={activePosition ? entryPriceUsd : undefined}
            priceHistory={chartHistory}
            isPositive={isPositive}
            timeframe={timeframe}
            chartType={chartType}
            height={328}
            onPriceHover={(p, t) => {
              setScrubPrice(p);
              setScrubTime(t);
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
          >
            {/* A very soft left-edge brush settles the stream against the chart
                without dimming the clear center or covering the moving amounts. */}
            <div
              className="absolute inset-y-0 left-0 w-[112px]"
              style={{
                background:
                  'linear-gradient(to right, rgba(0,0,0,0.17) 0%, rgba(0,0,0,0.11) 34%, rgba(0,0,0,0.045) 68%, rgba(0,0,0,0) 100%)',
              }}
            />
            {/* Keep the middle fully readable; ease each amount in from below
                and out toward the top across roughly 30% of the chart height. */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 70%, transparent 100%)',
              }}
            >
              {floatingAmounts.map((item) => (
                <span
                  key={item.id}
                  className={`absolute bottom-5 whitespace-nowrap font-sans text-[11px] font-light tabular-nums tracking-[-0.02em] ${
                    item.side === 'buy' ? 'text-[#6CE094]' : 'text-[#FF4D4D]'
                  }`}
                  style={{
                    left: '10px',
                    animation: item.side === 'buy'
                      ? 'nodex-money-flow 3.4s linear forwards'
                      : 'nodex-money-flow-sell 3.4s linear forwards',
                  }}
                >
                  <span className="inline-flex items-center gap-0.5">
                    <span aria-hidden="true" className="text-[11px] font-bold leading-none">
                      {item.side === 'buy' ? '▲' : '▼'}
                    </span>
                    {formatUsd(item.amount)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-1 flex h-14 w-full items-center bg-[#000000] font-sans">
          <div className="relative flex h-full min-w-0 flex-1 items-center overflow-hidden">
            <div
              ref={timeframeScrollRef}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                const el = timeframeScrollRef.current;
                if (!el) return;
                tfDragStateRef.current = {
                  active: true,
                  startX: e.clientX,
                  startScrollLeft: el.scrollLeft,
                  moved: false,
                };
              }}
              onPointerMove={(e) => {
                const state = tfDragStateRef.current;
                if (!state.active) return;
                const el = timeframeScrollRef.current;
                if (!el) return;
                const dx = e.clientX - state.startX;
                if (Math.abs(dx) > 4) state.moved = true;
                if (state.moved) {
                  el.scrollLeft = state.startScrollLeft - dx;
                }
              }}
              onPointerUp={() => {
                if (tfDragStateRef.current.moved) {
                  suppressTimeframeClickRef.current = true;
                  window.setTimeout(() => {
                    suppressTimeframeClickRef.current = false;
                  }, 0);
                }
                tfDragStateRef.current.active = false;
                tfDragStateRef.current.moved = false;
              }}
              onPointerCancel={() => {
                tfDragStateRef.current.active = false;
                tfDragStateRef.current.moved = false;
              }}
              className="flex h-full w-full min-w-0 touch-auto select-none items-center gap-1 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
            >
            {(['1S', '5S', '10S', '1M', '5M', '15M', '30M', '1H', '24H'] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={(e) => {
                  if (suppressTimeframeClickRef.current) return;
                  setTimeframe(tf);
                }}
                className={`inline-flex h-7 min-w-[2.75rem] shrink-0 touch-auto items-center justify-center rounded-[5px] px-2 font-sans text-[13px] font-medium leading-none tracking-[0.02em] transition-colors ${
                  timeframe === tf ? 'bg-white/[0.12] text-white' : 'text-white/65 hover:text-white/90'
                }`}
              >
                {tf}
              </button>
            ))}
            </div>
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-[2] w-3" style={{ background: 'linear-gradient(to right, #000 0%, rgba(0,0,0,0.48) 38%, transparent 100%)' }} />
            <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-[2] w-3" style={{ background: 'linear-gradient(to left, #000 0%, rgba(0,0,0,0.52) 42%, transparent 100%)' }} />
          </div>

          <div aria-hidden="true" className="mx-1.5 h-7 w-px shrink-0 bg-white/25" />

          <div className="relative flex shrink-0 items-center justify-end gap-1 pl-0.5 pr-1">
            <button
              type="button"
              aria-label="Line chart"
              title="Line chart"
              aria-pressed={chartType === 'line'}
              onClick={() => setChartType('line')}
              className={`flex h-9 w-10 items-center justify-center rounded-md transition-colors ${
                chartType === 'line' ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/85'
              }`}
            >
              <ChartLine className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              aria-label="Candlestick chart"
              title="Candlestick chart"
              aria-pressed={chartType === 'candle'}
              onClick={() => setChartType('candle')}
              className={`flex h-9 w-10 items-center justify-center rounded-md transition-colors ${
                chartType === 'candle' ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white/85'
              }`}
            >
              <ChartCandlestick className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </div>
        </div>

      </div>

        {/* Tabs stick at the top of the same page scroller after the overview moves away. */}
        {/* Detail navigation: horizontally scrollable tabs with a continuously sliding indicator. */}
        <nav
          aria-label="Token details"
          className="sticky top-0 z-30 mt-0.5 w-full bg-[#000000]"
        >
          <div className="mx-1.5 border-b border-white/25">
            <div
              className="w-full overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
            >
              <div className="relative flex min-w-full w-max items-stretch">
              {(['Info', 'Holders', 'Position', 'Trades'] as const).map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  aria-current={activeDetailTab === tab ? 'page' : undefined}
                  onClick={() => setActiveDetailTab(tab)}
                  className={`relative z-[1] inline-flex h-9 w-[86px] shrink-0 items-center justify-center px-1 text-[14px] font-light leading-none tracking-normal transition-colors ${
                    activeDetailTab === tab ? 'text-white' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {tab}
                </button>
              ))}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[-1px] left-0 z-[2] h-[2px] w-[86px] rounded-full bg-white transition-transform duration-300 ease-out"
                style={{ transform: `translateX(${(['Info', 'Holders', 'Position', 'Trades'] as const).indexOf(activeDetailTab) * 86}px)` }}
              />
              </div>
            </div>
          </div>
        </nav>
      <div
        className="w-full min-w-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
      {activeDetailTab === 'Info' && (
        <section aria-label="Token information" className="w-full space-y-6 px-3 pb-6 pt-5">
          <div className="space-y-4">
            <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Market Statistics</h2>
            <div className="grid grid-cols-2 gap-x-5 gap-y-5">
              {[
                { label: 'Market Cap', value: '$42.5K' },
                { label: 'Liquidity', value: '$18.2K' },
                { label: '24H Volume', value: '$126K' },
                { label: '24H Transactions', value: '2,481' },
                { label: 'Total Supply', value: '1B' },
                { label: 'Circulating Supply', value: '850M' },
              ].map((item) => (
                <div key={item.label} className="min-w-0 space-y-1">
                  <p className="text-[11px] font-normal text-white/40">{item.label}</p>
                  <p className="truncate font-mono text-[17px] font-medium leading-tight tracking-tight text-white/95">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-white/[0.10] pt-5">
            <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Token Details</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Token Standard</span>
                <span className="text-[12px] font-medium text-white/85">SPL Token</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Decimals</span>
                <span className="font-mono text-[12px] font-medium text-white/85">6</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Created At</span>
                <span className="text-[12px] font-medium text-white/85">Nov 14, 2026</span>
              </div>
              <div className="space-y-4 border-t border-white/[0.10] pt-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-[104px] shrink-0 text-[12px] text-white/40">Creator</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-white/75">
                    {activeToken.creator_wallet ? `${activeToken.creator_wallet.slice(0, 5)}...${activeToken.creator_wallet.slice(-5)}` : 'Unavailable'}
                  </span>
                  <button
                    type="button"
                    disabled={!activeToken.creator_wallet}
                    onClick={() => {
                      if (!activeToken.creator_wallet) return;
                      navigator.clipboard.writeText(activeToken.creator_wallet);
                    }}
                    aria-label="Copy creator address"
                    title="Copy creator address"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/90 disabled:opacity-25"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-[104px] shrink-0 text-[12px] text-white/40">Mint Address</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-white/75">
                    {`${activeToken.mint.slice(0, 5)}...${activeToken.mint.slice(-5)}`}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMint}
                    aria-label="Copy mint address"
                    title="Copy mint address"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/90"
                  >
                    {copiedMint ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-white/25">Preview data · Values will be connected to live token data later.</p>
        </section>
      )}

      {activeDetailTab === 'Holders' && (
        <section aria-label="Token holders" className="w-full space-y-6 px-1 pb-8 pt-5">
          <div className="grid w-full grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-lg bg-white/[0.12] px-3 py-2.5">
              <p className="text-[11px] text-white/55">Total Holders</p>
              <p className="mt-0.5 font-mono text-[19px] font-medium tracking-tight text-white/95">8,426</p>
            </div>
            <div className="min-w-0 rounded-lg bg-white/[0.12] px-3 py-2.5">
              <p className="text-[11px] text-white/55">Top 10 Ownership</p>
              <p className="mt-0.5 font-mono text-[19px] font-medium tracking-tight text-white/95">34.8%</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Largest Holders</h2>
              <span className="text-[10px] text-white/35">Ranked by balance</span>
            </div>
            <div className="w-full">
              {[
                { address: '7xKX9mPq2vRt4nHs8aBcDeFgHiJkLmNpQrStUvWxYz12', balance: '82.4M', share: 8.24, initials: '7X' },
                { address: '9pLm3qRs6tUv8wXy2zAbCdEfGhJkMnPqRtUvWxYz1234', balance: '61.8M', share: 6.18, initials: '9P' },
                { address: '4dEf7gHi2jKl5mNp8qRsTuVwXyZaBcDeFgHiJkLmN567', balance: '48.2M', share: 4.82, initials: '4D' },
                { address: '2aBc5dEf8gHi1jKl4mNpQrStUvWxYzAbCdEfGhJkL890', balance: '36.5M', share: 3.65, initials: '2A' },
                { address: '8wXy1zAb4cDe7fGh2jKl5mNpQrStUvWxYzAbCdEfG345', balance: '29.1M', share: 2.91, initials: '8W' },
                { address: '5mNp8qRs1tUv4wXy7zAbCdEfGhJkLmNpQrStUvWxYz678', balance: '24.7M', share: 2.47, initials: '5M' },
                { address: '3qRs6tUv9wXy2zAbCdEfGhJkLmNpQrStUvWxYzAbC901', balance: '19.3M', share: 1.93, initials: '3Q' },
                { address: '6tUv9wXy2zAbCdEfGhJkLmNpQrStUvWxYzAbCdEfG234', balance: '16.8M', share: 1.68, initials: '6T' },
                { address: '1zAb4cDe7fGh2jKl5mNpQrStUvWxYzAbCdEfGhJkL567', balance: '14.2M', share: 1.42, initials: '1Z' },
                { address: '0xYz3aBc6dEf9gHi2jKl5mNpQrStUvWxYzAbCdEfG890', balance: '12.1M', share: 1.21, initials: '0X' },
              ].map((holder, index) => (
                <div key={holder.address} className="border-b border-white/[0.07] py-3.5 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[10px] font-semibold tracking-wide text-white/75">
                      {holder.initials}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-mono text-[11px] text-white/80">{holder.address.slice(0, 5)}...{holder.address.slice(-5)}</span>
                      <span className="font-mono text-[11px] font-medium text-white/95">{holder.balance}</span>
                    </div>
                    <div className="flex w-[76px] shrink-0 flex-col items-end gap-1.5">
                      <span className="font-mono text-[11px] text-white/65">{holder.share.toFixed(2)}%</span>
                      <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/[0.12]">
                        <div className="h-full rounded-full bg-white" style={{ width: `${Math.min((holder.share / 10) * 100, 100)}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Copy holder wallet address ${index + 1}`}
                      title="Copy wallet address"
                      onClick={() => navigator.clipboard.writeText(holder.address)}
                      className="shrink-0 rounded p-1 text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/90"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-white/25">Preview data · Wallets are illustrative and will be replaced with verified on-chain holders.</p>
        </section>
      )}

      {activeDetailTab === 'Position' && (
        <section aria-label="Token position" className="w-full space-y-5 px-3 pb-8 pt-5">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-[19px] font-semibold leading-tight tracking-tight text-white/95">
              {(displayPosition.name || activeToken.name || '').length <= 18
                ? (displayPosition.name || activeToken.name || displayPosition.symbol || activeToken.symbol || 'Token')
                : (displayPosition.symbol || activeToken.symbol || 'Token')}
            </h2>
            <span className="shrink-0 rounded-md bg-white/[0.08] px-2.5 py-1 text-[9px] font-semibold tracking-[0.08em] text-white/70">
              {activePosition ? 'OPEN' : 'DEMO'}
            </span>
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-white/40">Position value</p>
              <p className="truncate font-sans text-[27px] font-semibold leading-tight tracking-tight tabular-nums text-white">
                {formatUsd(displayPosition.current_position_value_usd)}
              </p>
            </div>
            <div className="min-w-0 space-y-1 text-right">
              <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-white/40">Unrealized P&amp;L</p>
              <p className={`truncate font-mono text-[17px] font-semibold leading-tight tabular-nums ${displayPosition.pnl_usd >= 0 ? 'text-[#6CE094]' : 'text-[#F06A6A]'}`}>
                {displayPosition.pnl_usd >= 0 ? '+' : '−'}{formatUsd(Math.abs(displayPosition.pnl_usd))}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-white/[0.10] py-4">
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-white/40">Entry Price</p>
              <p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">
                {formatUsd(displayPosition.entry_price_usd, 8)}
              </p>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-white/40">Current Price</p>
              <p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">
                {formatUsd(displayPosition.current_price_usd, 8)}
              </p>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-white/40">Invested Amount</p>
              <p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">
                {formatUsd(displayPosition.initial_investment_usd)}
              </p>
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-[10px] text-white/40">Total Holdings</p>
              <p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">
                {new Intl.NumberFormat('en-US', {
                  notation: 'compact',
                  maximumFractionDigits: 2,
                }).format(displayPosition.amount_tokens)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-white/40">Opened</span>
            <span className="text-[10px] tabular-nums text-white/65">{new Date(displayPosition.entry_time).toLocaleString()}</span>
          </div>
          {!activePosition && (
            <p className="text-[10px] text-white/25">Illustrative values only · This is not a real or recorded paper position.</p>
          )}
        </section>
      )}


      {activeDetailTab === 'Trades' && (
        <section aria-label="Token trades" className="w-full space-y-5 px-3 pb-8 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold tracking-tight text-white/95">Recent Trades</h2>
              <p className="mt-1 text-[10px] text-white/40">Latest activity for this token</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.10] px-2 py-1 text-[9px] font-medium tracking-wide text-amber-300/80">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-300/70" />
              DEMO DATA
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-md bg-white/[0.07] px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-white/40">Buy Volume</p>
              <p className="mt-1 font-mono text-[18px] font-medium tabular-nums text-[#6CE094]">{formatUsd(24.86 * 149.60)}</p>
            </div>
            <div className="min-w-0 rounded-md bg-white/[0.07] px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-white/40">Sell Volume</p>
              <p className="mt-1 font-mono text-[18px] font-medium tabular-nums text-[#F06A6A]">{formatUsd(15.32 * 149.60)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-white/55">Buy / Sell Pressure</span>
              <span className="font-mono tabular-nums text-white/55">62% <span className="text-white/25">/</span> 38%</span>
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.10]">
              <div className="h-full w-[62%] bg-[#6CE094]" />
              <div className="h-full w-[38%] bg-[#F06A6A]" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-white/[0.10] pb-3">
            <h3 className="text-[12px] font-medium text-white/85">Trade History <span className="ml-1 text-white/35">(8)</span></h3>
            <div className="flex items-center gap-1 rounded-md bg-white/[0.06] p-0.5">
              {(['All', 'Buys', 'Sells'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={tradeFilter === filter}
                  onClick={() => setTradeFilter(filter)}
                  className={`rounded-sm px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    tradeFilter === filter ? 'bg-white/[0.14] text-white' : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-0">
            {[
              { side: 'BUY', wallet: '7xKX9mPq2vRt4nHs8aBcDeFgHiJkLmNpQrStUvWxYz12', sol: '4.25', tokens: '342.8K', price: '$0.0000124', time: '2s ago' },
              { side: 'BUY', wallet: '9pLm3qRs6tUv8wXy2zAbCdEfGhJkMnPqRtUvWxYz1234', sol: '1.80', tokens: '145.2K', price: '$0.0000124', time: '8s ago' },
              { side: 'SELL', wallet: '4dEf7gHi2jKl5mNp8qRsTuVwXyZaBcDeFgHiJkLmN567', sol: '2.65', tokens: '214.1K', price: '$0.0000123', time: '14s ago' },
              { side: 'BUY', wallet: '2aBc5dEf8gHi1jKl4mNpQrStUvWxYzAbCdEfGhJkL890', sol: '6.10', tokens: '493.6K', price: '$0.0000124', time: '21s ago' },
              { side: 'SELL', wallet: '8wXy1zAb4cDe7fGh2jKl5mNpQrStUvWxYzAbCdEfG345', sol: '3.40', tokens: '275.8K', price: '$0.0000123', time: '29s ago' },
              { side: 'BUY', wallet: '5mNp8qRs1tUv4wXy7zAbCdEfGhJkLmNpQrStUvWxYz678', sol: '5.75', tokens: '464.9K', price: '$0.0000124', time: '36s ago' },
              { side: 'BUY', wallet: '3qRs6tUv9wXy2zAbCdEfGhJkLmNpQrStUvWxYzAbC901', sol: '2.96', tokens: '239.1K', price: '$0.0000124', time: '48s ago' },
              { side: 'SELL', wallet: '6tUv9wXy2zAbCdEfGhJkLmNpQrStUvWxYzAbCdEfG234', sol: '9.27', tokens: '751.3K', price: '$0.0000123', time: '1m ago' },
            ]
              .filter((trade) => tradeFilter === 'All' || (tradeFilter === 'Buys' ? trade.side === 'BUY' : trade.side === 'SELL'))
              .map((trade, index) => (
                <div key={trade.wallet} className="flex min-w-0 items-center gap-2.5 border-b border-white/[0.07] py-2 last:border-b-0">
                  <span className={`inline-flex h-5 w-[42px] shrink-0 items-center justify-center rounded-sm text-[9px] font-bold tracking-wide ${
                    trade.side === 'BUY' ? 'bg-[#6CE094]/[0.12] text-[#6CE094]' : 'bg-[#F06A6A]/[0.12] text-[#F06A6A]'
                  }`}>
                    {trade.side}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-mono text-[10px] text-white/75">{trade.wallet.slice(0, 5)}...{trade.wallet.slice(-5)}</span>
                      <button
                        type="button"
                        aria-label="Copy trader wallet"
                        title="Copy trader wallet"
                        onClick={() => navigator.clipboard.writeText(trade.wallet)}
                        className="shrink-0 text-white/30 transition-colors hover:text-white/80"
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <span className="text-[9px] text-white/35">{trade.tokens} tokens · {trade.time}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`font-mono text-[11px] font-medium tabular-nums ${
                      trade.side === 'BUY' ? 'text-[#6CE094]' : 'text-[#F06A6A]'
                    }`}>{formatUsd(Number(trade.sol) * 149.60)}</p>
                  </div>
                </div>
              ))}
          </div>
          <p className="pt-1 text-center text-[9px] text-amber-300/45">Illustrative sample trades · Not live Solana transactions</p>
        </section>
      )}

      </div>

    </section>
    </div>
    </div>
  );
};
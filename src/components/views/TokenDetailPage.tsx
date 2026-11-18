import React, { useEffect, useRef, useState } from 'react';
import type { PricePoint } from '../../types';
import { useTerminal } from '../../context/TerminalContext';
import { marketDataService } from '../../services/marketData';
import type { TokenDataSnapshot, TokenDataStreamEvent, TokenDataTrade } from '../../services/marketData';
import { wsService } from '../../services/websocket';
import { TokenAvatar } from '../common/TokenAvatar';
import { DotMatrixChart } from '../common/DotMatrixChart';
import {
  ChevronLeft,
  Copy,
  Check,
  ChartLine,
  ChartCandlestick,
} from 'lucide-react';

const numberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toPricePoint = (value: any): PricePoint | null => {
  const time = numberOrNull(value?.timestamp_ms ?? value?.time);
  const close = numberOrNull(value?.close ?? value?.price);
  if (time === null || time <= 1_000_000 || close === null || close <= 0) return null;
  const open = numberOrNull(value?.open) ?? close;
  const high = numberOrNull(value?.high) ?? Math.max(open, close);
  const low = numberOrNull(value?.low) ?? Math.min(open, close);
  return {
    time,
    price: close,
    open,
    high,
    low,
    close,
    volume: numberOrNull(value?.volume) ?? 0,
  };
};

const mergePricePoints = (previous: PricePoint[], incoming: PricePoint[]): PricePoint[] => {
  const byTime = new Map<number, PricePoint>();
  for (const point of previous) byTime.set(point.time, point);
  for (const point of incoming) {
    const existing = byTime.get(point.time);
    if (!existing) {
      byTime.set(point.time, point);
      continue;
    }
    const open = existing.open ?? point.open ?? existing.price;
    const high = Math.max(existing.high ?? existing.price, point.high ?? point.price);
    const low = Math.min(existing.low ?? existing.price, point.low ?? point.price);
    const close = point.close ?? point.price;
    byTime.set(point.time, {
      ...existing,
      ...point,
      open,
      high,
      low,
      close,
      price: close,
      volume: point.volume,
    });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-6000);
};

const mergeTokenTrades = (previous: TokenDataTrade[], incoming: TokenDataTrade[]): TokenDataTrade[] => {
  const byId = new Map<string, TokenDataTrade>();
  for (const trade of [...previous, ...incoming]) {
    const key = String(trade.signature || '') + ':' + String(trade.event_index ?? trade.timestamp_ms);
    byId.set(key, trade);
  }
  return [...byId.values()]
    .sort((a, b) => (numberOrNull(b.timestamp_ms) ?? 0) - (numberOrNull(a.timestamp_ms) ?? 0))
    .slice(0, 100);
};

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
  const [sectionLoading, setSectionLoading] = useState({ market: true, info: true, holders: true, trades: true, chart: true });
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
  const [tokenPrice, setTokenPrice] = useState(0);
  const [marketMetrics, setMarketMetrics] = useState<TokenDataSnapshot['market']>({});
  const [snapshotMarketCap, setSnapshotMarketCap] = useState<number | null>(null);
  const [botMarketCap, setBotMarketCap] = useState<number | null>(null);
  const [chartHistory, setChartHistory] = useState<PricePoint[]>([]);
  const [shortChartHistory, setShortChartHistory] = useState<PricePoint[]>([]);
  const [recentTrades, setRecentTrades] = useState<TokenDataTrade[]>([]);
  const [holdersSnapshot, setHoldersSnapshot] = useState<TokenDataSnapshot['holders'] | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenDataSnapshot['info'] | null>(null);
  const [tokenIdentity, setTokenIdentity] = useState<TokenDataSnapshot['identity'] | null>(null);
  const [marketDataConnected, setMarketDataConnected] = useState(false);
  const [marketDataLoading, setMarketDataLoading] = useState(false);
  const [marketDataError, setMarketDataError] = useState<string | null>(null);

  // Resolve the selected token from the shared registry on every render so live
  // token merges are reflected immediately instead of displaying a stale snapshot.
  const activeToken = selectedToken
    ? (tokens.find((token) => token.mint === selectedToken.mint) || selectedToken)
    : tokens[0];

  // Always start each newly opened token on the 1-second chart, regardless of
  // the timeframe selected on a previously viewed token.
  useEffect(() => {
    setTimeframe('1S');
  }, [activeToken?.mint]);

  // Token Data owns price, historical candles, confirmed swaps, volumes and holders.
  // Load the 1-minute 48-hour history once; the 1S/5S/10S view starts from the
  // snapshot price and grows only from real live candle events.
  useEffect(() => {
    const mint = activeToken?.mint;
    if (!mint) return;

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let reconnectAttempt = 0;
    let snapshotFallbackTimer: number | undefined;
    const settings = marketDataService.normalizeMarketDataSettings(marketDataService.loadSettings());

    setMarketDataLoading(true);
    setSectionLoading({ market: true, info: true, holders: true, trades: true, chart: true });
    setMarketDataConnected(false);
    setMarketDataError(null);
    setScrubPrice(null);
    setScrubTime(null);
    setTokenPrice(0);
    setMarketMetrics({});
    setSnapshotMarketCap(null);
    setBotMarketCap(null);
    setChartHistory([]);
    setShortChartHistory([]);
    setRecentTrades([]);
    setHoldersSnapshot(null);
    setTokenInfo(null);
    setTokenIdentity(null);

    const applyMarket = (data: Record<string, any>) => {
      const normalized = { ...data };
      if (normalized.transactions_24h == null && normalized.confirmed_transactions_24h != null) {
        normalized.transactions_24h = normalized.confirmed_transactions_24h;
      }
      setMarketMetrics((previous) => {
        const next = { ...previous, ...normalized };
        for (const [key, value] of Object.entries(normalized)) {
          if (value === null && previous[key] !== undefined && previous[key] !== null) {
            next[key] = previous[key];
          }
        }
        return next;
      });
      const price = numberOrNull(data.price_usd);
      if (price !== null && price > 0) {
        setTokenPrice(price);
        const seedTime = Math.floor(Date.now() / 1000) * 1000;
        const seed: PricePoint = {
          time: seedTime,
          price,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: 0,
        };
        setShortChartHistory((previous) => previous.length ? previous : [seed]);
        setChartHistory((previous) => previous.length ? previous : [seed]);
      }
      const cap = numberOrNull(data.market_cap_usd);
      if (cap !== null && cap > 0) setSnapshotMarketCap(cap);
    };

    const applyTrade = (data: TokenDataTrade) => {
      if (!data || typeof data !== 'object') return;
      setRecentTrades((previous) => mergeTokenTrades(previous, [data]));
      const price = numberOrNull(data.price_usd);
      if (price !== null && price > 0) setTokenPrice(price);
    };

    const handleMessage = (message: TokenDataStreamEvent) => {
      if (disposed || (message.mint && message.mint !== mint)) return;
      const data = message.data && typeof message.data === 'object'
        ? message.data as Record<string, any>
        : {};

      if (message.event === 'snapshot_completed') {
        if (snapshotFallbackTimer !== undefined) window.clearTimeout(snapshotFallbackTimer);
        setSectionLoading({ market: false, info: false, holders: false, trades: false, chart: false });
        return;
      }

      if (message.event === 'snapshot_section') {
        if (message.topic === 'token.market') {
          applyMarket(data);
          setSectionLoading((previous) => ({ ...previous, market: false }));
        }
        if (message.topic === 'token.trades') {
          if (Array.isArray(data.recent)) setRecentTrades((previous) => mergeTokenTrades(previous, data.recent as TokenDataTrade[]));
          setSectionLoading((previous) => ({ ...previous, trades: false }));
        }
        if (message.topic === 'token.holders') {
          setHoldersSnapshot(data as TokenDataSnapshot['holders']);
          setSectionLoading((previous) => ({ ...previous, holders: false }));
        }
        if (message.topic === 'token.info') {
          setTokenInfo(data as TokenDataSnapshot['info']);
          setSectionLoading((previous) => ({ ...previous, info: false }));
        }
        if (message.topic === 'token.identity') {
          setTokenIdentity(data as TokenDataSnapshot['identity']);
          setSectionLoading((previous) => ({ ...previous, info: false }));
        }
        return;
      }

      if (message.event === 'chart_history_completed') {
        setSectionLoading((previous) => ({ ...previous, chart: false }));
        return;
      }

      if (message.event === 'chart_history_chunk' && Array.isArray(data.points)) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const points = data.points
          .map(toPricePoint)
          .filter((point): point is PricePoint => point !== null && point.time >= cutoff);
        setChartHistory((previous) => mergePricePoints(previous, points));
        return;
      }

      if (message.event === 'market_update' && message.topic === 'token.market') {
        applyMarket(data);
        return;
      }

      if (message.event === 'trade_update' && message.topic === 'token.trades') {
        applyTrade(data as unknown as TokenDataTrade);
        return;
      }

      if (message.event === 'candle_update' && message.topic === 'token.chart') {
        const candle = data.candle && typeof data.candle === 'object' ? data.candle : data;
        const point = toPricePoint(candle);
        const candleTimeframe = String(data.timeframe || candle.timeframe || '');
        if (!point) return;
        if (candleTimeframe === '1S') {
          setShortChartHistory((previous) => mergePricePoints(previous, [point]));
        } else if (candleTimeframe === '1M') {
          setChartHistory((previous) => mergePricePoints(previous, [point]));
        }
        return;
      }

      if (message.event === 'holders_update' && message.topic === 'token.holders') {
        setHoldersSnapshot(data as TokenDataSnapshot['holders']);
        return;
      }

      if (message.event === 'resync_required') {
        try {
          socket?.send(JSON.stringify({ command: 'request_snapshot', timeframe: '1M' }));
        } catch {
          // The reconnect handler will obtain a fresh snapshot if this socket is gone.
        }
        return;
      }

      if (message.event === 'snapshot_error' || message.event === 'error') {
        if (message.event === 'snapshot_error') setSectionLoading({ market: false, info: false, holders: false, trades: false, chart: false });
        const detail = String(data.message || data.code || 'Market Data returned an error.');
        if (message.event === 'error') setMarketDataConnected(false);
        setMarketDataError(detail);
      }
    };

    const scheduleReconnect = (reason?: string) => {
      if (disposed || reconnectTimer !== undefined || !settings.wsUrl) return;
      if (reason) setMarketDataError(reason);
      const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(reconnectAttempt, 5)));
      reconnectAttempt += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        openSocket();
      }, delay);
    };

    const openSocket = () => {
      if (disposed || !settings.wsUrl) return;
      try {
        socket = marketDataService.connectTokenStream(
          settings,
          mint,
          '1M',
          handleMessage,
          (connected, message) => {
            if (disposed) return;
            setMarketDataConnected(connected);
            if (connected) {
              reconnectAttempt = 0;
              setMarketDataError(null);
            } else {
              scheduleReconnect(message || 'Market Data stream disconnected.');
            }
          },
        );
      } catch (error) {
        scheduleReconnect(error instanceof Error ? error.message : 'Could not connect to Market Data.');
      }
    };

    const loadSnapshotThenSubscribe = async () => {
      try {
        const snapshot = await marketDataService.getTokenSnapshot(settings, mint, '1M');
        if (disposed) return;
        setMarketMetrics(snapshot.market || {});
        setSectionLoading((previous) => ({ ...previous, market: false, info: false, holders: false, trades: false, chart: false }));
        setSnapshotMarketCap(numberOrNull(snapshot.market?.market_cap_usd));
        setTokenIdentity(snapshot.identity || null);
        setTokenInfo(snapshot.info || null);
        setHoldersSnapshot(snapshot.holders || null);
        setRecentTrades(mergeTokenTrades([], snapshot.trades?.recent || []));

        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const history = (snapshot.chart?.points || [])
          .map(toPricePoint)
          .filter((point): point is PricePoint => point !== null && point.time >= cutoff)
          .sort((a, b) => a.time - b.time);
        const latestHistoryPrice = history.length ? history[history.length - 1].close ?? history[history.length - 1].price : null;
        const snapshotPrice = numberOrNull(snapshot.market?.price_usd);
        const initialPrice = snapshotPrice !== null && snapshotPrice > 0
          ? snapshotPrice
          : numberOrNull(latestHistoryPrice);
        if (initialPrice !== null && initialPrice > 0) {
          setTokenPrice(initialPrice);
          const parsedAsOf = Date.parse(snapshot.as_of || '');
          const seedTime = Math.floor((Number.isFinite(parsedAsOf) ? parsedAsOf : Date.now()) / 1000) * 1000;
          const seed: PricePoint = {
            time: seedTime,
            price: initialPrice,
            open: initialPrice,
            high: initialPrice,
            low: initialPrice,
            close: initialPrice,
            volume: 0,
          };
          setShortChartHistory([seed]);
          setChartHistory(mergePricePoints(history, [seed]));
        } else {
          setChartHistory(mergePricePoints([], history));
        }
      } catch (error) {
        if (!disposed) {
          setMarketDataError('Snapshot: ' + (error instanceof Error ? error.message : 'Could not load Token Data snapshot.'));
        }
      } finally {
        if (!disposed) {
          setMarketDataLoading(false);
          if (!settings.wsUrl) setSectionLoading({ market: false, info: false, holders: false, trades: false, chart: false });
          if (!settings.wsUrl && !settings.restUrl) setMarketDataError('Set the Token Data REST and WebSocket URLs in Settings.');
          else if (!settings.wsUrl) setMarketDataError((previous) => previous || 'Token Data WebSocket URL is not configured.');
        }
      }
    };

    // Subscribe immediately: Token Data sends its progressive initial snapshot as
    // part of the subscribe command, so a slow REST request cannot delay the stream.
    if (settings.wsUrl) {
      openSocket();
      snapshotFallbackTimer = window.setTimeout(() => {
        if (!disposed) setSectionLoading({ market: false, info: false, holders: false, trades: false, chart: false });
      }, 12000);
    }
    void loadSnapshotThenSubscribe();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (snapshotFallbackTimer !== undefined) window.clearTimeout(snapshotFallbackTimer);
      socket?.close(1000, 'Token details closed');
    };
  }, [activeToken?.mint]);

  // NodeX Engine owns the live USD market-cap ticks and the actual paper position.
  // Position events are merged into TerminalContext; this page only reads that state.
  useEffect(() => {
    const mint = activeToken?.mint;
    if (!mint) return;
    const unsubscribe = wsService.subscribe((event) => {
      if (event.token_mint !== mint) return;
      if (event.event_type === 'market_tick') {
        const cap = numberOrNull(event.data?.market_cap_usd);
        if (cap !== null && cap > 0) setBotMarketCap(cap);
      }
      if (String(event.event_type) === 'token_detail_snapshot') {
        const cap = numberOrNull(event.data?.snapshot?.market?.market_cap_usd);
        if (cap !== null && cap > 0) setBotMarketCap(cap);
      }
    });
    wsService.subscribeTokenUpdates(mint);
    return () => {
      unsubscribe();
      wsService.unsubscribeToken(mint);
    };
  }, [activeToken?.mint]);

  if (!activeToken) return null;
  const activePosition = positions.find((p) => p.mint === activeToken.mint && p.status === 'OPEN');
  const liveTokenPrice = tokenPrice;
  const currentPrice = scrubPrice ?? liveTokenPrice;
  const marketCapForChart = botMarketCap ?? snapshotMarketCap;
  const displayMarketCap = marketCapForChart !== null && liveTokenPrice > 0
    ? marketCapForChart * (currentPrice / liveTokenPrice)
    : marketCapForChart;
  const marketChangePct = numberOrNull(marketMetrics.change_24h_pct);
  const isPositive = (marketChangePct ?? 0) >= 0;
  const entryPriceUsd = activePosition?.entry_price_usd;
  const chartHistoryForView = ['1S', '5S', '10S'].includes(timeframe) || chartHistory.length === 0
    ? shortChartHistory
    : chartHistory;
  const buyVolume = numberOrNull(marketMetrics.buy_volume_usd);
  const sellVolume = numberOrNull(marketMetrics.sell_volume_usd);
  const buyPressure = numberOrNull(marketMetrics.buy_pressure_pct)
    ?? (buyVolume !== null && sellVolume !== null && buyVolume + sellVolume > 0
      ? buyVolume / (buyVolume + sellVolume) * 100
      : null);
  const sellPressure = buyPressure === null ? null : Math.max(0, 100 - buyPressure);
  const filteredTrades = recentTrades.filter((trade) => {
    const side = String(trade.side || '').toLowerCase();
    return tradeFilter === 'All' || (tradeFilter === 'Buys' ? side === 'buy' : side === 'sell');
  });
  const creatorAddress = tokenIdentity?.creator_address || tokenInfo?.creator_address || activeToken.creator_wallet || '';
  const displayTokenName = tokenIdentity?.name || activeToken.name || activeToken.symbol || 'Unknown token';
  const displayTokenSymbol = tokenIdentity?.symbol || activeToken.symbol || 'Token';
  const displayTokenLogo = tokenIdentity?.logo_url || activeToken.logo_url;
  const formatCompactMarketCap = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const formatUsd = (value: number, maximumFractionDigits = 2) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits,
    }).format(Number.isFinite(value) ? value : 0);

  const formatOptionalUsd = (value: unknown) => {
    const parsed = numberOrNull(value);
    return parsed === null ? '—' : formatUsd(parsed);
  };

  const formatTradeVolume = (trade: TokenDataTrade) => {
    const usd = numberOrNull(trade.volume_usd);
    if (usd !== null) return formatUsd(usd);
    const sol = numberOrNull(trade.amount_sol);
    return sol === null ? '—' : sol.toFixed(4) + ' SOL';
  };

  const formatCompactNumber = (value: unknown) => {
    const parsed = numberOrNull(value);
    return parsed === null ? '—' : new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(parsed);
  };

  const formatSupply = (value: string | null | undefined) => {
    if (value == null || value === '') return '—';
    const parsed = numberOrNull(value);
    return parsed === null ? value : formatCompactNumber(parsed);
  };

  const formatTimeAgo = (timestamp: number) => {
    const age = Math.max(0, Date.now() - timestamp);
    if (age < 60_000) return Math.max(1, Math.floor(age / 1000)) + 's ago';
    if (age < 3_600_000) return Math.floor(age / 60_000) + 'm ago';
    if (age < 86_400_000) return Math.floor(age / 3_600_000) + 'h ago';
    return Math.floor(age / 86_400_000) + 'd ago';
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
                {displayTokenSymbol}
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
                  symbol={displayTokenSymbol}
                  logoUrl={displayTokenLogo}
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
                  {displayTokenSymbol}
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
                {displayMarketCap === null ? 'MC unavailable' : formatCompactMarketCap(displayMarketCap)}
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
                symbol={displayTokenSymbol}
                logoUrl={displayTokenLogo}
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
                {displayTokenName}
              </p>
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[12px] font-medium tracking-wide text-white/55">
                  {displayTokenSymbol}
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
              {displayMarketCap === null ? '—' : formatCompactMarketCap(displayMarketCap)}
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

        {/* Chart canvas spans edge-to-edge; controls sit beneath its time axis. */}
        <div className="relative z-0 -mx-3 -mt-3 w-[calc(100%+1.5rem)]">
          <DotMatrixChart
            key={`${activeToken.mint.slice(0, 7)}..${activeToken.mint.slice(-5)}`}
            tokenMint={activeToken.mint}
            currentPrice={liveTokenPrice}
            marketCap={marketCapForChart ?? undefined}
            entryPrice={activePosition ? entryPriceUsd : undefined}
            priceHistory={chartHistoryForView}
            isPositive={isPositive}
            timeframe={timeframe}
            chartType={chartType}
            height={328}
            onPriceHover={(p, t) => {
              setScrubPrice(p);
              setScrubTime(t);
            }}
          />
          {sectionLoading.chart && (
            <div aria-label="Loading chart history" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
              <div className="absolute inset-x-0 top-[38%] h-px bg-white/[0.06]" />
              <div className="absolute inset-x-0 top-[58%] h-px bg-white/[0.07]" />
              <div className="absolute inset-x-0 top-[78%] h-px bg-white/[0.05]" />
              <div className="absolute inset-x-3 top-[44%] h-7 animate-pulse rounded-full bg-white/[0.035] blur-md" />
            </div>
          )}
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
                  { label: 'Market Cap', value: displayMarketCap === null ? '—' : formatCompactMarketCap(displayMarketCap) },
                { label: 'Liquidity', value: formatOptionalUsd(marketMetrics.liquidity_usd) },
                { label: '24H Volume', value: formatOptionalUsd(marketMetrics.volume_24h_usd) },
                { label: '24H Transactions', value: numberOrNull(marketMetrics.transactions_24h) === null ? '—' : Number(marketMetrics.transactions_24h).toLocaleString('en-US') },
                { label: 'Total Supply', value: formatSupply(tokenInfo?.total_supply) },
                { label: 'Circulating Supply', value: formatSupply(tokenInfo?.circulating_supply) },
              ].map((item) => (
                <div key={item.label} className="min-w-0 space-y-1">
                  <p className="text-[11px] font-normal text-white/40">{item.label}</p>
                  {sectionLoading.market && ['Market Cap', 'Liquidity', '24H Volume', '24H Transactions'].includes(item.label) ? (
                    <div className="mt-1 h-[18px] w-24 animate-pulse rounded bg-white/[0.09]" />
                  ) : sectionLoading.info && ['Total Supply', 'Circulating Supply'].includes(item.label) ? (
                    <div className="mt-1 h-[18px] w-24 animate-pulse rounded bg-white/[0.09]" />
                  ) : (
                    <p className="truncate font-mono text-[17px] font-medium leading-tight tracking-tight text-white/95">{item.value}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-white/[0.10] pt-5">
            <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Token Details</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Token Standard</span>
                {sectionLoading.info ? <span className="h-3 w-20 animate-pulse rounded bg-white/[0.09]" /> : <span className="text-[12px] font-medium text-white/85">{tokenInfo?.token_standard || '—'}</span>}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Decimals</span>
                {sectionLoading.info ? <span className="h-3 w-10 animate-pulse rounded bg-white/[0.09]" /> : <span className="font-mono text-[12px] font-medium text-white/85">{tokenInfo?.decimals == null ? '—' : tokenInfo.decimals}</span>}
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Created At</span>
                <span className="text-[12px] font-medium text-white/85">
                  {sectionLoading.info ? <span className="inline-block h-3 w-24 animate-pulse rounded bg-white/[0.09]" /> : tokenIdentity?.created_at && Number.isFinite(Date.parse(tokenIdentity.created_at))
                    ? new Date(tokenIdentity.created_at).toLocaleString()
                    : '—'}
                </span>
              </div>
              <div className="space-y-4 border-t border-white/[0.10] pt-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-[104px] shrink-0 text-[12px] text-white/40">Creator</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-white/75">
                    {creatorAddress ? creatorAddress.slice(0, 5) + '...' + creatorAddress.slice(-5) : 'Unavailable'}
                  </span>
                  <button
                    type="button"
                    disabled={!creatorAddress}
                    onClick={() => {
                      if (creatorAddress) navigator.clipboard.writeText(creatorAddress);
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
                    {activeToken.mint.slice(0, 5) + '...' + activeToken.mint.slice(-5)}
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
          {marketDataError && (
            <p className="text-[10px] text-amber-300/55">{marketDataError}</p>
          )}
        </section>
      )}

      {activeDetailTab === 'Holders' && (
        <section aria-label="Token holders" className="w-full space-y-6 px-1 pb-8 pt-5">
          <div className="grid w-full grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-lg bg-white/[0.12] px-3 py-2.5">
              <p className="text-[11px] text-white/55">Total Holders</p>
              {sectionLoading.holders ? <div className="mt-1 h-6 w-20 animate-pulse rounded bg-white/[0.09]" /> : <p className="mt-0.5 font-mono text-[19px] font-medium tracking-tight text-white/95">{holdersSnapshot?.total_count == null ? '—' : Number(holdersSnapshot.total_count).toLocaleString('en-US')}</p>}
            </div>
            <div className="min-w-0 rounded-lg bg-white/[0.12] px-3 py-2.5">
              <p className="text-[11px] text-white/55">Top 10 Ownership</p>
              {sectionLoading.holders ? <div className="mt-1 h-6 w-20 animate-pulse rounded bg-white/[0.09]" /> : <p className="mt-0.5 font-mono text-[19px] font-medium tracking-tight text-white/95">{numberOrNull(holdersSnapshot?.top_10_ownership_pct) === null ? '—' : numberOrNull(holdersSnapshot?.top_10_ownership_pct)?.toFixed(2) + '%'}</p>}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Largest Holders</h2>
              <span className="text-[10px] text-white/35">Ranked by balance</span>
            </div>
            <div className="w-full">
              {sectionLoading.holders ? (
                <div className="space-y-3 py-2">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="flex items-center gap-3 border-b border-white/[0.06] py-2"><div className="h-9 w-9 animate-pulse rounded-full bg-white/[0.08]" /><div className="flex-1 space-y-2"><div className="h-3 w-28 animate-pulse rounded bg-white/[0.09]" /><div className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" /></div><div className="h-3 w-12 animate-pulse rounded bg-white/[0.08]" /></div>)}</div>
              ) : holdersSnapshot?.largest?.length ? holdersSnapshot.largest.map((holder, index) => {
                const share = numberOrNull(holder.supply_pct);
                return (
                  <div key={holder.address} className="border-b border-white/[0.07] py-3.5 last:border-b-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[10px] font-semibold tracking-wide text-white/75">
                        {holder.address.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-mono text-[11px] text-white/80">{holder.address.slice(0, 5)}...{holder.address.slice(-5)}</span>
                        <span className="font-mono text-[11px] font-medium text-white/95">{formatCompactNumber(holder.token_amount)}</span>
                      </div>
                      <div className="flex w-[76px] shrink-0 flex-col items-end gap-1.5">
                        <span className="font-mono text-[11px] text-white/65">{share === null ? '—' : share.toFixed(2) + '%'}</span>
                        <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/[0.12]">
                          <div className="h-full rounded-full bg-white" style={{ width: share === null ? '0%' : String(Math.max(0, Math.min(100, share * 10))) + '%' }} />
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label={'Copy holder wallet address ' + (index + 1)}
                        title="Copy wallet address"
                        onClick={() => navigator.clipboard.writeText(holder.address)}
                        className="shrink-0 rounded p-1 text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/90"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <p className="py-6 text-center text-[11px] text-white/35">Verified holder data is not available for this token yet.</p>
              )}
            </div>
          </div>
          {marketDataError && <p className="text-[10px] text-amber-300/55">{marketDataError}</p>}
        </section>
      )}

      {activeDetailTab === 'Position' && (
        <section aria-label="Token position" className="w-full space-y-5 px-3 pb-8 pt-5">
          {activePosition ? (
            <>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <h2 className="min-w-0 truncate text-[19px] font-semibold leading-tight tracking-tight text-white/95">
                  {(activePosition.name || displayTokenName || '').length <= 18
                    ? (activePosition.name || displayTokenName || activePosition.symbol || displayTokenSymbol || 'Token')
                    : (activePosition.symbol || displayTokenSymbol || 'Token')}
                </h2>
                <span className="shrink-0 rounded-md bg-white/[0.08] px-2.5 py-1 text-[9px] font-semibold tracking-[0.08em] text-white/70">OPEN</span>
              </div>

              <div className="grid grid-cols-2 items-end gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-white/40">Position value</p>
                  <p className="truncate font-sans text-[27px] font-semibold leading-tight tracking-tight tabular-nums text-white">
                    {formatUsd(activePosition.current_position_value_usd)}
                  </p>
                </div>
                <div className="min-w-0 space-y-1 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-white/40">Unrealized P&amp;L</p>
                  <p className={'truncate font-mono text-[17px] font-semibold leading-tight tabular-nums ' + (activePosition.pnl_usd >= 0 ? 'text-[#6CE094]' : 'text-[#F06A6A]')}>
                    {activePosition.pnl_usd >= 0 ? '+' : '−'}{formatUsd(Math.abs(activePosition.pnl_usd))}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-white/[0.10] py-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] text-white/40">Entry Price</p>
                  <p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">{formatUsd(activePosition.entry_price_usd, 8)}</p>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] text-white/40">Current Price</p>
                  <p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">{formatUsd(activePosition.current_price_usd, 8)}</p>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] text-white/40">Invested Amount</p>
                  <p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">{formatUsd(activePosition.initial_investment_usd)}</p>
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] text-white/40">Total Holdings</p>
                  <p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">{formatCompactNumber(activePosition.amount_tokens)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-white/40">Opened</span>
                <span className="text-[10px] tabular-nums text-white/65">
                  {activePosition.entry_time && Number.isFinite(Date.parse(activePosition.entry_time))
                    ? new Date(activePosition.entry_time).toLocaleString()
                    : '—'}
                </span>
              </div>
            </>
          ) : (
            <div className="rounded-lg bg-white/[0.06] px-4 py-5">
              <p className="text-[12px] font-medium text-white/85">No open paper position for this token.</p>
              <p className="mt-1 text-[10px] leading-relaxed text-white/40">When NodeX records an open position, its live balance and P&amp;L will appear here.</p>
            </div>
          )}
        </section>
      )}

      {activeDetailTab === 'Trades' && (
        <section aria-label="Token trades" className="w-full space-y-5 px-3 pb-8 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold tracking-tight text-white/95">Recent Trades</h2>
              <p className="mt-1 text-[10px] text-white/40">Confirmed Solana swaps for this token</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.10] px-2 py-1 text-[9px] font-medium tracking-wide text-white/65">
              <span className={'h-1.5 w-1.5 rounded-full ' + (marketDataConnected ? 'bg-[#6CE094]' : 'bg-amber-300/70')} />
              {marketDataConnected ? 'LIVE' : marketDataLoading ? 'SYNCING' : 'OFFLINE'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-md bg-white/[0.07] px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-white/40">Buy Volume</p>
              {sectionLoading.market ? <div className="mt-2 h-6 w-28 animate-pulse rounded bg-white/[0.09]" /> : <p className="mt-1 font-mono text-[18px] font-medium tabular-nums text-[#6CE094]">{formatOptionalUsd(buyVolume)}</p>}
            </div>
            <div className="min-w-0 rounded-md bg-white/[0.07] px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-white/40">Sell Volume</p>
              {sectionLoading.market ? <div className="mt-2 h-6 w-28 animate-pulse rounded bg-white/[0.09]" /> : <p className="mt-1 font-mono text-[18px] font-medium tabular-nums text-[#F06A6A]">{formatOptionalUsd(sellVolume)}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-white/55">Buy / Sell Pressure</span>
              {sectionLoading.market ? <span className="h-3 w-20 animate-pulse rounded bg-white/[0.09]" /> : <span className="font-mono tabular-nums text-white/55">{buyPressure === null ? '—' : buyPressure.toFixed(1) + '%'}<span className="text-white/25"> / </span>{sellPressure === null ? '—' : sellPressure.toFixed(1) + '%'}</span>}
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.10]">
              <div className="h-full bg-[#6CE094]" style={{ width: buyPressure === null ? '0%' : String(Math.max(0, Math.min(100, buyPressure))) + '%' }} />
              <div className="h-full bg-[#F06A6A]" style={{ width: sellPressure === null ? '0%' : String(Math.max(0, Math.min(100, sellPressure))) + '%' }} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-white/[0.10] pb-3">
            <h3 className="text-[12px] font-medium text-white/85">Trade History <span className="ml-1 text-white/35">({recentTrades.length})</span></h3>
            <div className="flex items-center gap-1 rounded-md bg-white/[0.06] p-0.5">
              {(['All', 'Buys', 'Sells'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={tradeFilter === filter}
                  onClick={() => setTradeFilter(filter)}
                  className={'rounded-sm px-2.5 py-1 text-[10px] font-medium transition-colors ' + (tradeFilter === filter ? 'bg-white/[0.14] text-white' : 'text-white/45 hover:text-white/80')}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-0">
            {sectionLoading.trades ? (
              <div className="space-y-3 py-2">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="flex items-center gap-3 border-b border-white/[0.06] py-2"><div className="h-5 w-10 animate-pulse rounded-sm bg-white/[0.08]" /><div className="flex-1 space-y-2"><div className="h-3 w-24 animate-pulse rounded bg-white/[0.09]" /><div className="h-2.5 w-16 animate-pulse rounded bg-white/[0.06]" /></div><div className="h-3 w-16 animate-pulse rounded bg-white/[0.08]" /></div>)}</div>
            ) : filteredTrades.length ? filteredTrades.map((trade) => {
              const side = String(trade.side || '').toUpperCase();
              const wallet = trade.trader || '';
              const tokenAmount = numberOrNull(trade.token_amount);
              return (
                <div key={String(trade.signature || '') + ':' + String(trade.event_index ?? trade.timestamp_ms)} className="flex min-w-0 items-center gap-2.5 border-b border-white/[0.07] py-2 last:border-b-0">
                  <span className={'inline-flex h-5 w-[42px] shrink-0 items-center justify-center rounded-sm text-[9px] font-bold tracking-wide ' + (side === 'BUY' ? 'bg-[#6CE094]/[0.12] text-[#6CE094]' : 'bg-[#F06A6A]/[0.12] text-[#F06A6A]')}>
                    {side || '—'}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-mono text-[10px] text-white/75">
                        {wallet ? wallet.slice(0, 5) + '...' + wallet.slice(-5) : 'Wallet unavailable'}
                      </span>
                      <button
                        type="button"
                        disabled={!wallet}
                        aria-label="Copy trader wallet"
                        title="Copy trader wallet"
                        onClick={() => wallet && navigator.clipboard.writeText(wallet)}
                        className="shrink-0 text-white/30 transition-colors hover:text-white/80 disabled:opacity-25"
                      >
                        <Copy className="h-2.5 w-2.5" />
                      </button>
                    </div>
                    <span className="text-[9px] text-white/35">
                      {tokenAmount === null ? 'Token amount unavailable' : formatCompactNumber(tokenAmount) + ' tokens'}
                      {' · '}{formatTimeAgo(numberOrNull(trade.timestamp_ms) ?? Date.now())}
                    </span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={'font-mono text-[11px] font-medium tabular-nums ' + (side === 'BUY' ? 'text-[#6CE094]' : 'text-[#F06A6A]')}>
                      {formatTradeVolume(trade)}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] tabular-nums text-white/35">
                      {numberOrNull(trade.price_usd) === null ? '—' : formatUsd(numberOrNull(trade.price_usd)!, 8)}
                    </p>
                  </div>
                </div>
              );
            }) : (
              <p className="py-8 text-center text-[11px] text-white/35">No confirmed swaps have been received for this token yet.</p>
            )}
          </div>
          {marketDataError && <p className="pt-1 text-[10px] text-amber-300/55">{marketDataError}</p>}
        </section>
      )}

      

      </div>

    </section>
    </div>
    </div>
  );
};
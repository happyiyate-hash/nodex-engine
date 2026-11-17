import React, { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../../context/TerminalContext';
import { TokenAvatar } from '../common/TokenAvatar';
import { DotMatrixChart } from '../common/DotMatrixChart';
import { wsService } from '../../services/websocket';
import { CandleEngine, type ConfirmedTrade } from '../../services/candleEngine';
import { apiClient } from '../../services/rest';
import { marketDataService } from '../../services/marketData';
import {
  ChevronLeft,
  Copy,
  Check,
  ChartLine,
  ChartCandlestick,
  X,
} from 'lucide-react';

type TokenChartPoint = { timestamp_ms: number; open: number; high: number; low: number; close: number; volume: number };
type FloatingTradeAmount = { id: string; amount: number; side: 'buy' | 'sell'; unit: 'USD' | 'SOL'; delayMs: number };

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

function normalizeTokenDetailSnapshot(raw: Record<string, any>, mint: string): TokenDataSnapshot {
  const identity = raw.identity && typeof raw.identity === 'object' ? raw.identity : {};
  const market = raw.market && typeof raw.market === 'object' ? raw.market : {};
  const statistics = raw.statistics && typeof raw.statistics === 'object' ? raw.statistics : {};
  const rawChart = raw.chart && typeof raw.chart === 'object' ? raw.chart : {};
  const rawPoints = Array.isArray(rawChart.points) ? rawChart.points : Array.isArray(rawChart.candles) ? rawChart.candles : [];
  const points: TokenChartPoint[] = rawPoints.map((candle: Record<string, any>) => {
    const rawTime = candle.timestamp_ms ?? candle.open_time_ms ?? candle.time ?? candle.timestamp ?? candle.open_time;
    const timestamp = Number(rawTime);
    return {
      timestamp_ms: Number.isFinite(timestamp) ? (timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp) : Date.parse(String(rawTime || '')),
      open: Number(candle.open ?? candle.open_price ?? candle.close ?? 0),
      high: Number(candle.high ?? candle.high_price ?? candle.close ?? 0),
      low: Number(candle.low ?? candle.low_price ?? candle.close ?? 0),
      close: Number(candle.close ?? candle.close_price ?? candle.price ?? 0),
      volume: Number(candle.volume_usd ?? candle.volume_sol ?? candle.volume ?? 0),
    };
  }).filter((point: TokenChartPoint) =>
    Number.isFinite(point.timestamp_ms) && point.timestamp_ms > 0 &&
    Number.isFinite(point.open) && point.open > 0 &&
    Number.isFinite(point.high) && point.high > 0 &&
    Number.isFinite(point.low) && point.low > 0 &&
    Number.isFinite(point.close) && point.close > 0
  );
  return {
    mint,
    identity: { ...identity, mint_address: mint },
    market: {
      ...market,
      change_24h_pct: market.change_24h_pct ?? market.price_change_24h_pct ?? null,
      volume_24h_usd: market.volume_24h_usd ?? market.volume_24h ?? null,
      transactions_24h: market.transactions_24h ?? market.transactions_24h_count ?? null,
      volume_5m_usd: market.volume_5m_usd ?? statistics.volume_5m_usd ?? null,
      volume_1h_usd: market.volume_1h_usd ?? statistics.volume_1h_usd ?? null,
      buy_volume_usd: market.buy_volume_usd ?? statistics.buy_volume_usd ?? null,
      sell_volume_usd: market.sell_volume_usd ?? statistics.sell_volume_usd ?? null,
    },
    chart: { timeframe: String(rawChart.timeframe || '5m').toUpperCase(), points },
    trades: { recent: Array.isArray(raw.trades?.recent) ? raw.trades.recent : [] },
    holders: {
      total_count: raw.holders?.total_count ?? market.holders ?? null,
      top_10_ownership_pct: raw.holders?.top_10_ownership_pct ?? null,
      largest: Array.isArray(raw.holders?.largest) ? raw.holders.largest : [],
    },
    info: {
      ...(raw.info && typeof raw.info === 'object' ? raw.info : {}),
      decimals: identity.decimals ?? raw.info?.decimals ?? null,
      total_supply: identity.total_supply ?? identity.total_supply_raw ?? raw.info?.total_supply ?? null,
      creator_address: identity.creator_address ?? raw.info?.creator_address ?? null,
    },
    data_status: {
      ...(raw.data_status && typeof raw.data_status === 'object' ? raw.data_status : {}),
      snapshot: 'available',
      chart: rawChart.status || (points.length ? 'available' : 'unavailable'),
    },
  };
}

function emptyTokenSnapshot(mint: string, timeframe = '1M'): TokenDataSnapshot {
  return {
    mint, identity: { mint_address: mint }, market: {},
    chart: { timeframe, points: [] }, trades: { recent: [] },
    holders: { largest: [] }, info: {}, data_status: {},
  };
}

export const TokenDetailPage: React.FC = () => {
  const {
    selectedToken,
    tokens,
    closeTokenDetail,
    positions,
  } = useTerminal();

  const [copiedMint, setCopiedMint] = useState(false);
  const [timeframe, setTimeframe] = useState<'1S' | '5S' | '10S' | '1M' | '5M' | '15M' | '30M' | '1H' | '24H'>('5M');
  const [chartType, setChartType] = useState<'line' | 'candle'>('line');
  const [activeDetailTab, setActiveDetailTab] = useState<'Info' | 'Holders' | 'Position' | 'Trades'>('Info');
  const [tradeFilter, setTradeFilter] = useState<'All' | 'Buys' | 'Sells'>('All');
  const [floatingAmounts, setFloatingAmounts] = useState<FloatingTradeAmount[]>([]);
  const nextFloatingAnimationAtRef = useRef(0);
  const [chartSeriesByTimeframe, setChartSeriesByTimeframe] = useState<Record<string, TokenChartPoint[]>>({});
  const tradeCandleEngineRef = useRef(new CandleEngine());
  const lastTradeCursorRef = useRef(0);
  const timeframeScrollRef = useRef<HTMLDivElement>(null);
  const tfDragStateRef = useRef<{ active: boolean; startX: number; startScrollLeft: number; moved: boolean }>({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressTimeframeClickRef = useRef(false);
  const [scrubTime, setScrubTime] = useState<string | null>(null);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const pageScrollRef = useRef<HTMLElement>(null);
  // Primary market-data quotes take precedence; engine ticks fill gaps only.
  const [marketDataSnapshot, setMarketDataSnapshot] = useState<TokenDataSnapshot | null>(null);
  const [marketDataLoading, setMarketDataLoading] = useState(false);
  const [tokenSnapshotLoading, setTokenSnapshotLoading] = useState(true);
  const [tokenSnapshotError, setTokenSnapshotError] = useState('');
  const [sniperSubscriptionStatus, setSniperSubscriptionStatus] = useState<'connecting' | 'connected' | 'rejected' | 'disconnected'>('connecting');
  const [marketDataBackendStatus, setMarketDataBackendStatus] = useState<'not_configured' | 'connecting' | 'loading' | 'received' | 'failed'>('not_configured');
  const [marketDataBackendError, setMarketDataBackendError] = useState('');
  const [marketDataWsStatus, setMarketDataWsStatus] = useState<'connecting' | 'connected' | 'subscribed' | 'disconnected' | 'error'>('disconnected');
  const [snapshotSections, setSnapshotSections] = useState<Record<string, 'loading' | 'available' | 'unavailable'>>({});
  const marketDataSocketRef = useRef<WebSocket | null>(null);
  const marketDataFallbackTimerRef = useRef<number | null>(null);
  const [chartHistoryLoading, setChartHistoryLoading] = useState(false);
  const [marketDataError, setMarketDataError] = useState('');
  const [marketDataStreamConnected, setMarketDataStreamConnected] = useState(false);
  const [latestConfirmedTradePrice, setLatestConfirmedTradePrice] = useState<number | null>(null);
  const [marketDataStreamError, setMarketDataStreamError] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');

  // Resolve the selected token from the shared registry on every render so live
  // token merges are reflected immediately instead of displaying a stale snapshot.
  const activeToken = selectedToken
    ? (tokens.find((token) => token.mint === selectedToken.mint) || selectedToken)
    : null;

  useEffect(() => {
    tradeCandleEngineRef.current.reset();
    lastTradeCursorRef.current = 0;
    setLatestConfirmedTradePrice(null);
    setMarketDataSnapshot(null);
    setChartSeriesByTimeframe({});
    setTokenSnapshotLoading(true);
    setTokenSnapshotError('');
    setSniperSubscriptionStatus('connecting');
    setMarketDataBackendStatus('connecting');
    setMarketDataBackendError('');
    setMarketDataWsStatus('connecting');
    setSnapshotSections({
      identity: 'loading', market: 'loading', chart: 'loading',
      trades: 'loading', holders: 'loading', info: 'loading',
    });
    setChartHistoryLoading(true);
    setConnectionNotice('');
    setTimeframe('5M');
    setScrubTime(null);
  }, [activeToken?.mint]);

  // Keep connection and loading failures visible until the user dismisses them.
  // A successful recovery does not auto-hide an error already shown to the user.
  useEffect(() => {
    const message = marketDataStreamError || marketDataError;
    if (message && !message.startsWith('Recovering confirmed trades after a stream gap')) {
      setConnectionNotice(message);
    }
  }, [marketDataError, marketDataStreamError]);

  // NodeX sniper engine is the single live source for market cap and confirmed trades.
  // Market ticks update the market panel only; confirmed trades alone feed CandleEngine.
  useEffect(() => {
    const mint = activeToken?.mint;
    if (!mint) return;

    let currentSolUsd = 0;
    setMarketDataLoading(true);
    setTokenSnapshotLoading(true);
    setTokenSnapshotError('');
    setChartHistoryLoading(true);
    setMarketDataError('');
    setMarketDataStreamError('');
    setSniperSubscriptionStatus('connecting');

    // Fetch the durable token dossier independently of the sniper subscription.
    // A rejected/no-position sniper subscription must never cancel this REST request.
    let cancelled = false;
    void apiClient.getTokenState(mint).then((rawSnapshot) => {
      if (cancelled) return;
      const normalized = normalizeTokenDetailSnapshot(rawSnapshot, mint);
      setMarketDataSnapshot((previous) => {
        if (!previous || previous.mint !== mint) return normalized;
        return {
          ...normalized,
          market: { ...normalized.market, ...previous.market },
          chart: previous.chart?.points?.length ? previous.chart : normalized.chart,
          trades: { recent: previous.trades?.recent?.length ? previous.trades.recent : normalized.trades.recent },
          holders: previous.holders?.largest?.length ? previous.holders : normalized.holders,
          info: { ...normalized.info, ...previous.info },
        };
      });
      const chartTimeframe = normalized.chart.timeframe.toUpperCase();
      if (normalized.chart.points.length > 0) {
        setChartSeriesByTimeframe((previous) => ({ ...previous, [chartTimeframe]: normalized.chart.points }));
      }
      setTokenSnapshotLoading(false);
      setMarketDataLoading(false);
      if (chartTimeframe === timeframe.toUpperCase() || ['1S', '5S', '10S'].includes(timeframe) || !normalized.chart.points.length) {
        setChartHistoryLoading(false);
      }
    }).catch((error) => {
      if (cancelled) return;
      const rawMessage = error instanceof Error ? error.message : String(error);
      const message = rawMessage.includes('404')
        ? 'This mint is not registered in the sniper engine snapshot yet. The independent Market Data request continues.'
        : rawMessage;
      setTokenSnapshotError(message);
      setTokenSnapshotLoading(false);
      // If the REST dossier is absent and the live subscription is rejected,
      // show a deliberate unavailable state rather than an endless skeleton.
    });

    // The independent Token Data service owns market, chart, trades, holders and token info.
    // Its progressive WebSocket snapshot is separate from NodeX's sniper subscription above.
    const tokenDataSettings = marketDataService.normalizeMarketDataSettings(marketDataService.loadSettings());
    let marketSnapshotStarted = false;
    let marketSnapshotCompleted = false;
    let marketFallbackStarted = false;

    const markSection = (section: string, available: boolean) => {
      setSnapshotSections((previous) => ({ ...previous, [section]: available ? 'available' : 'unavailable' }));
    };

    const applyMarketDataSnapshot = (raw: Record<string, any>) => {
      if (cancelled) return;
      const normalized = normalizeTokenDetailSnapshot(raw, mint);
      setMarketDataSnapshot((previous) => {
        if (!previous || previous.mint !== mint) return normalized;
        return {
          ...previous,
          identity: { ...previous.identity, ...normalized.identity },
          market: { ...previous.market, ...normalized.market },
          chart: normalized.chart.points.length ? normalized.chart : previous.chart,
          trades: { recent: normalized.trades.recent.length ? normalized.trades.recent : previous.trades.recent },
          holders: normalized.holders.largest.length || normalized.holders.total_count != null ? normalized.holders : previous.holders,
          info: { ...previous.info, ...normalized.info },
          data_status: { ...previous.data_status, ...normalized.data_status },
        };
      });
      if (normalized.chart.points.length > 0) {
        setChartSeriesByTimeframe((previous) => ({ ...previous, [normalized.chart.timeframe]: normalized.chart.points }));
      }
      const status = raw.data_status && typeof raw.data_status === 'object' ? raw.data_status : {};
      for (const section of ['identity', 'market', 'chart', 'trades', 'holders', 'info']) {
        const value = String(status[section] || '');
        markSection(section, value !== 'unavailable' && value !== 'failed');
      }
      setMarketDataBackendStatus('received');
      setMarketDataBackendError('');
      if (normalized.chart.points.length > 0 || String(status.chart || '') === 'unavailable') {
        setChartHistoryLoading(false);
      }
    };

    const loadMarketDataRestFallback = async (reason: string) => {
      if (cancelled || marketFallbackStarted || !tokenDataSettings.restUrl) return;
      marketFallbackStarted = true;
      setMarketDataBackendStatus('loading');
      setMarketDataBackendError(reason);
      try {
        const raw = await marketDataService.getTokenSnapshot<Record<string, any>>(mint, timeframe, tokenDataSettings);
        if (cancelled) return;
        applyMarketDataSnapshot(raw);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setMarketDataBackendStatus('failed');
        setMarketDataBackendError(message);
        setSnapshotSections({
          identity: 'unavailable', market: 'unavailable', chart: 'unavailable',
          trades: 'unavailable', holders: 'unavailable', info: 'unavailable',
        });
        setChartHistoryLoading(false);
      }
    };

    if (!tokenDataSettings.restUrl || !tokenDataSettings.wsUrl) {
      setMarketDataBackendStatus('not_configured');
      setMarketDataWsStatus('disconnected');
      setMarketDataBackendError('Configure the independent Market Data REST and WebSocket URLs in Settings.');
      setSnapshotSections({
        identity: 'unavailable', market: 'unavailable', chart: 'unavailable',
        trades: 'unavailable', holders: 'unavailable', info: 'unavailable',
      });
      setChartHistoryLoading(false);
    } else {
      void (async () => {
        try {
          const socket = await marketDataService.connectWebSocket(tokenDataSettings, (connected, message) => {
            if (cancelled) return;
            setMarketDataWsStatus(connected ? 'connected' : 'disconnected');
            if (!connected && !marketSnapshotCompleted) {
              void loadMarketDataRestFallback(message || 'Market Data WebSocket disconnected before its snapshot completed.');
            }
          });
          if (cancelled) {
            socket.close();
            return;
          }
          marketDataSocketRef.current = socket;
          socket.onmessage = (messageEvent) => {
            if (cancelled) return;
            let event: Record<string, any>;
            try {
              event = JSON.parse(String(messageEvent.data));
            } catch {
              setMarketDataBackendError('Market Data sent an unreadable WebSocket message.');
              return;
            }
            if (event.mint && event.mint !== mint) return;
            const data = event.data && typeof event.data === 'object' ? event.data : {};

            if (event.event === 'subscribed') {
              setMarketDataWsStatus('subscribed');
              return;
            }
            if (event.event === 'snapshot_started') {
              marketSnapshotStarted = true;
              setMarketDataBackendStatus('loading');
              setSnapshotSections({
                identity: 'loading', market: 'loading', chart: 'loading',
                trades: 'loading', holders: 'loading', info: 'loading',
              });
              return;
            }
            if (event.event === 'snapshot_section') {
              const topic = String(event.topic || '');
              if (topic === 'token.market') {
                setMarketDataSnapshot((previous) => {
                  const base = previous?.mint === mint ? previous : emptyTokenSnapshot(mint);
                  return { ...base, market: { ...base.market, ...data } };
                });
                markSection('market', Object.values(data).some((value) => value !== null && value !== undefined));
              } else if (topic === 'token.identity' || topic === 'token.creator') {
                setMarketDataSnapshot((previous) => {
                  const base = previous?.mint === mint ? previous : emptyTokenSnapshot(mint);
                  return { ...base, identity: { ...base.identity, ...data } };
                });
                markSection('identity', Boolean(data.name || data.symbol || data.logo_url || data.creator_address));
              } else if (topic === 'token.info') {
                setMarketDataSnapshot((previous) => {
                  const base = previous?.mint === mint ? previous : emptyTokenSnapshot(mint);
                  return { ...base, info: { ...base.info, ...data } };
                });
                markSection('info', Object.values(data).some((value) => value !== null && value !== undefined));
              } else if (topic === 'token.holders') {
                setMarketDataSnapshot((previous) => {
                  const base = previous?.mint === mint ? previous : emptyTokenSnapshot(mint);
                  return { ...base, holders: { ...base.holders, ...data, largest: Array.isArray(data.largest) ? data.largest : [] } };
                });
                markSection('holders', Boolean(data.total_count != null || data.top_10_ownership_pct != null || data.largest?.length));
              } else if (topic === 'token.trades') {
                setMarketDataSnapshot((previous) => {
                  const base = previous?.mint === mint ? previous : emptyTokenSnapshot(mint);
                  return { ...base, trades: { recent: Array.isArray(data.recent) ? data.recent : [] } };
                });
                markSection('trades', Array.isArray(data.recent) && data.recent.length > 0);
              }
              return;
            }
            if (event.event === 'chart_history_started') {
              setChartHistoryLoading(true);
              setSnapshotSections((previous) => ({ ...previous, chart: 'loading' }));
              return;
            }
            if (event.event === 'chart_history_chunk') {
              const chartTimeframe = String(data.timeframe || timeframe).toUpperCase();
              const points: TokenChartPoint[] = (Array.isArray(data.points) ? data.points : []).map((point: Record<string, any>) => ({
                timestamp_ms: Number(point.timestamp_ms),
                open: Number(point.open),
                high: Number(point.high),
                low: Number(point.low),
                close: Number(point.close),
                volume: Number(point.volume || 0),
              })).filter((point: TokenChartPoint) => Number.isFinite(point.timestamp_ms) && point.timestamp_ms > 0 && point.close > 0);
              setChartSeriesByTimeframe((previous) => ({
                ...previous,
                [chartTimeframe]: [...(previous[chartTimeframe] || []), ...points],
              }));
              return;
            }
            if (event.event === 'chart_history_completed') {
              const chartTimeframe = String(data.timeframe || timeframe).toUpperCase();
              setChartHistoryLoading(false);
              markSection('chart', data.status === 'available' && Number(data.point_count || 0) > 0);
              if (chartTimeframe === timeframe.toUpperCase()) setMarketDataLoading(false);
              return;
            }
            if (event.event === 'market_update' && event.topic === 'token.market') {
              setMarketDataSnapshot((previous) => {
                const base = previous?.mint === mint ? previous : emptyTokenSnapshot(mint);
                return { ...base, market: { ...base.market, ...data } };
              });
              markSection('market', true);
              return;
            }
            if (event.event === 'snapshot_completed') {
              marketSnapshotCompleted = true;
              setMarketDataBackendStatus('received');
              setSnapshotSections((previous) => Object.fromEntries(
                Object.entries(previous).map(([key, value]) => [key, value === 'loading' ? 'unavailable' : value])
              ) as Record<string, 'loading' | 'available' | 'unavailable'>);
              setChartHistoryLoading(false);
              return;
            }
            if (event.event === 'snapshot_error' || event.event === 'error') {
              const message = String(event.message || event.code || 'Market Data snapshot failed.');
              setMarketDataBackendError(message);
              setMarketDataWsStatus('error');
              void loadMarketDataRestFallback(message);
              return;
            }
            if (event.event === 'resync_required') {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ command: 'request_snapshot', timeframe }));
              }
            }
          };
          socket.send(JSON.stringify({
            command: 'subscribe',
            mint,
            timeframe,
            topics: ['token.market', 'token.chart', 'token.trades', 'token.activity', 'token.holders', 'token.info', 'token.creator'],
          }));
          marketDataFallbackTimerRef.current = window.setTimeout(() => {
            if (!cancelled && !marketSnapshotStarted) {
              void loadMarketDataRestFallback('Market Data WebSocket did not start its token snapshot.');
            }
          }, 12000);
        } catch (error) {
          if (cancelled) return;
          setMarketDataWsStatus('error');
          const message = error instanceof Error ? error.message : String(error);
          void loadMarketDataRestFallback(message);
        }
      })();
    }

    const serverTimeframe: Record<string, '1m' | '5m' | '15m' | '30m' | '1h' | '24h'> = {
      '1M': '1m',
      '5M': '5m',
      '15M': '15m',
      '30M': '30m',
      '1H': '1h',
      '24H': '24h',
    };
    const requestedTimeframe = serverTimeframe[timeframe];
    wsService.subscribeToken(mint, requestedTimeframe || '5m');

    const unsubscribeStatus = wsService.onStatusChange((status) => {
      const connected = status === 'connected';
      setMarketDataStreamConnected(connected);
      setSniperSubscriptionStatus(connected ? 'connecting' : 'disconnected');
      if (!connected) {
        setMarketDataStreamError('NodeX sniper engine stream is disconnected.');
        setChartHistoryLoading(false);
      } else setMarketDataStreamError('');
    });

    const unsubscribeEvents = wsService.subscribe((event) => {
      const data = event.data && typeof event.data === 'object' ? event.data : {};
      const eventMint = String(data.mint_address || data.token_mint || data.base_mint || event.token_mint || '');
      if (eventMint && eventMint !== mint) return;

      if (event.event_type === 'market_tick' || event.event_type === 'market_price_update' || event.event_type === 'token_market_update') {
        if (eventMint !== mint) return;
        const solUsd = Number(data.sol_price_usd);
        if (Number.isFinite(solUsd) && solUsd > 0 && String(data.sol_price_status || '').toLowerCase() === 'live') {
          currentSolUsd = solUsd;
        }
        const patch: Record<string, number> = {};
        const priceUsd = Number(data.price_usd);
        const priceSol = Number(data.price_sol);
        const marketCapUsd = Number(data.market_cap_usd);
        const marketCapSol = Number(data.market_cap_sol);
        const change1m = Number(data.price_change_1m_pct);
        const change5m = Number(data.price_change_5m_pct);
        if (Number.isFinite(priceUsd) && priceUsd > 0) patch.price_usd = priceUsd;
        else if (Number.isFinite(priceSol) && priceSol > 0 && currentSolUsd > 0) patch.price_usd = priceSol * currentSolUsd;
        if (Number.isFinite(priceSol) && priceSol > 0) patch.price_sol = priceSol;
        if (Number.isFinite(marketCapUsd) && marketCapUsd > 0) patch.market_cap_usd = marketCapUsd;
        else if (Number.isFinite(marketCapSol) && marketCapSol > 0 && currentSolUsd > 0) patch.market_cap_usd = marketCapSol * currentSolUsd;
        if (Number.isFinite(change1m)) patch.change_1m_pct = change1m;
        if (Number.isFinite(change5m)) patch.change_5m_pct = change5m;
        if (Object.keys(patch).length > 0) {
          setMarketDataSnapshot((previous) => {
            const base = previous?.mint === mint ? previous : emptyTokenSnapshot(mint);
            return { ...base, market: { ...base.market, ...patch } };
          });
        }
        setMarketDataLoading(false);
        return;
      }

      if (event.event_type === 'confirmed_trade_update') {
        if (eventMint !== mint) return;
        const priceSol = Number(data.price_sol);
        const suppliedPriceUsd = Number(data.price_usd);
        const priceUsd = Number.isFinite(suppliedPriceUsd) && suppliedPriceUsd > 0
          ? suppliedPriceUsd
          : Number.isFinite(priceSol) && priceSol > 0 && currentSolUsd > 0
            ? priceSol * currentSolUsd
            : 0;
        if (!(priceUsd > 0)) return;
        const trade: ConfirmedTrade = {
          signature: String(data.signature || ''),
          event_index: Number(data.event_index || 0),
          side: String(data.side || ''),
          price_usd: priceUsd,
          volume_usd: Number(data.volume_sol || 0) * currentSolUsd,
          timestamp_ms: Number(data.timestamp_ms || 0),
        };
        if (!trade.signature || !tradeCandleEngineRef.current.addTrade(trade)) return;
        setLatestConfirmedTradePrice(priceUsd);
        setMarketDataSnapshot((previous) => {
          const base = previous?.mint === mint ? previous : emptyTokenSnapshot(mint);
          const recent = [...(base.trades?.recent || []), {
            signature: trade.signature,
            event_index: trade.event_index,
            side: String(data.side || ''),
            price_usd: priceUsd,
            volume_usd: trade.volume_usd,
            token_amount: Number(data.token_amount_raw || 0) / Math.pow(10, Number(data.token_decimals ?? 6)),
            timestamp_ms: trade.timestamp_ms,
          }].slice(-200);
          return { ...base, trades: { recent } };
        });
        return;
      }

      if (event.event_type === 'token_detail_snapshot') {
        const snapshot = data.snapshot;
        if (snapshot && typeof snapshot === 'object') {
          const normalized = normalizeTokenDetailSnapshot(snapshot as Record<string, any>, mint);
          setMarketDataSnapshot((previous) => previous?.mint === mint
            ? { ...normalized, market: { ...normalized.market, ...previous.market } }
            : normalized);
          if (normalized.chart.points.length > 0) {
            setChartSeriesByTimeframe((previous) => ({ ...previous, [normalized.chart.timeframe]: normalized.chart.points }));
          }
        }
        setSniperSubscriptionStatus('connected');
        setTokenSnapshotLoading(false);
        // Request chart history only after the engine confirms this mint is subscribed.
        wsService.setChartTimeframe(mint, requestedTimeframe || '5m');
        setMarketDataLoading(false);
        return;
      }

      if (event.event_type === 'chart_history_snapshot') {
        if (eventMint !== mint) return;
        const backendTimeframe = String(data.timeframe || '');
        const uiTimeframe = backendTimeframe.toUpperCase();
        if (uiTimeframe !== timeframe || !Array.isArray(data.candles)) return;
        const points: TokenChartPoint[] = data.candles.map((candle: any) => ({
          timestamp_ms: Number(candle.open_time_ms),
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
          volume: Number(candle.volume_sol || 0) * currentSolUsd,
        })).filter((point: TokenChartPoint) =>
          Number.isFinite(point.timestamp_ms) && point.timestamp_ms > 0 &&
          Number.isFinite(point.open) && Number.isFinite(point.high) &&
          Number.isFinite(point.low) && Number.isFinite(point.close) &&
          point.open > 0 && point.high > 0 && point.low > 0 && point.close > 0
        );
        setChartSeriesByTimeframe((previous) => ({ ...previous, [timeframe]: points }));
        setChartHistoryLoading(false);
        setMarketDataLoading(false);
        return;
      }

      if (event.event_type === 'command_rejected') {
        const command = String(data.command || '');
        if (command === 'subscribe_token') {
          setSniperSubscriptionStatus('rejected');
          setMarketDataStreamError(String(data.reason || 'NodeX engine rejected the token subscription.'));
          // Keep the independent REST dossier request alive. If it also failed,
          // finish the chart skeleton and render the explicit empty state.
          setChartHistoryLoading(false);
          setMarketDataLoading(false);
        } else if (command === 'set_chart_timeframe') {
          // History failure must not mark the live market stream as disconnected.
          setChartHistoryLoading(false);
          setMarketDataError(String(data.reason || 'The engine could not load chart history for this timeframe.'));
        }
      }
    });

    return () => {
      cancelled = true;
      if (marketDataFallbackTimerRef.current !== null) {
        window.clearTimeout(marketDataFallbackTimerRef.current);
        marketDataFallbackTimerRef.current = null;
      }
      marketDataSocketRef.current?.close();
      marketDataSocketRef.current = null;
      unsubscribeEvents();
      unsubscribeStatus();
      wsService.unsubscribeToken(mint);
    };
  }, [activeToken?.mint, timeframe]);


  if (!activeToken) return null;
  const activePosition = positions.find((position) => position.mint === activeToken.mint && position.status === 'OPEN');
  const cachedChartPoints = chartSeriesByTimeframe[timeframe] || [];
  // Prefer the backend's timeframe-specific OHLC series whenever present.
  // REST provides the historical baseline for the selected timeframe.
  // Confirmed WebSocket trades update only the local candles layered over it.
  const historicalChartPoints = cachedChartPoints.length > 0
    ? cachedChartPoints
    : (marketDataSnapshot?.chart?.timeframe === timeframe
      ? marketDataSnapshot.chart.points || []
      : []);

  const locallyAggregatedPoints = (() => {
    const merged = new Map<number, TokenChartPoint>(
      historicalChartPoints.map((point) => [point.timestamp_ms, point])
    );
    for (const point of tradeCandleEngineRef.current.getPoints(timeframe)) {
      merged.set(point.timestamp_ms, point);
    }
    return [...merged.values()]
      .sort((a, b) => a.timestamp_ms - b.timestamp_ms)
      .slice(-5000);
  })();
  const chartHistory: import('../../types').PricePoint[] = locallyAggregatedPoints.map((point) => ({
    time: Number(point.timestamp_ms),
    price: Number(point.close),
    open: Number(point.open),
    high: Number(point.high),
    low: Number(point.low),
    close: Number(point.close),
    volume: Number(point.volume || 0),
  })).filter((point) => Number.isFinite(point.time) && point.time > 0 && Number.isFinite(point.price) && point.price > 0);
  const lastChartPoint = chartHistory[chartHistory.length - 1];
  const tokenName = marketDataSnapshot?.identity?.name || activeToken.name || activeToken.symbol || 'Unknown token';
  const tokenSymbol = marketDataSnapshot?.identity?.symbol || activeToken.symbol || 'Token';
  const tokenLogoUrl = marketDataSnapshot?.identity?.logo_url || activeToken.logo_url;
  const creatorAddress = marketDataSnapshot?.identity?.creator_address || marketDataSnapshot?.info?.creator_address || activeToken.creator_wallet || '';
  // Chart price is the last confirmed swap, never an account/market-cap quote.
  const liveTokenPrice = Number(latestConfirmedTradePrice ?? lastChartPoint?.close ?? 0);
  const marketCap = marketDataSnapshot?.market?.market_cap_usd ?? null;
  const marketChangePct = marketDataSnapshot?.market?.change_24h_pct ?? null;
  const isPositive = (marketChangePct ?? 0) >= 0;
  const entryPriceUsd = activePosition?.entry_price_usd;
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
      <style>{`
        @keyframes nodex-toast-drop {
          from { opacity: 0; transform: translate3d(0, -12px, 0); }
          to { opacity: 1; transform: translate3d(0, 0, 0); }
        }
      `}</style>
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
                {tokenSymbol}
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
                  symbol={tokenSymbol}
                  logoUrl={tokenLogoUrl}
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
                  {tokenSymbol}
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
                {snapshotSections.market === 'loading' || tokenSnapshotLoading
                  ? <span aria-label="Loading market cap" className="inline-block h-4 w-20 animate-pulse rounded bg-white/[0.08]" />
                  : marketCap != null ? formatCompactMarketCap(marketCap) : 'MC unavailable'}
              </div>
              <div className={`mt-1 flex items-center justify-end gap-0.5 font-mono text-[10px] font-semibold ${isPositive ? 'text-[#6CE094]' : 'text-[#F06A6A]'}`}>
                <span>{snapshotSections.market === 'loading' || tokenSnapshotLoading
                  ? <span aria-label="Loading market change" className="inline-block h-2.5 w-16 animate-pulse rounded bg-white/[0.08]" />
                  : marketChangePct == null ? 'Change unavailable' : `${isPositive ? '▲ +' : '▼ '}${Math.abs(Number(marketChangePct)).toFixed(2)}%`}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {connectionNotice && (
        <div className="pointer-events-none absolute inset-x-0 z-[60] px-3" style={{ top: 'calc(env(safe-area-inset-top) + 64px)' }} role="alert" aria-live="assertive">
          <div className="pointer-events-auto flex min-w-0 animate-[nodex-toast-drop_220ms_ease-out] items-start gap-2.5 rounded-lg border border-[#F0B45A]/30 bg-[#241A0B]/95 px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-[#F0B45A]" aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words text-[11px] leading-relaxed text-[#F6D7A8]">{connectionNotice}</p>
            <button type="button" onClick={() => setConnectionNotice('')} aria-label="Dismiss notification" title="Dismiss notification" className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#F6D7A8]/70 transition-colors hover:bg-white/[0.08] hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
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
                symbol={tokenSymbol}
                logoUrl={tokenLogoUrl}
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
                {tokenName}
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
              {snapshotSections.market === 'loading' || tokenSnapshotLoading
                ? <span aria-label="Loading market cap" className="inline-block h-4 w-20 animate-pulse rounded bg-white/[0.08]" />
                : formatCompactMarketCap(marketCap)}
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
                <span>{snapshotSections.market === 'loading' || tokenSnapshotLoading
                  ? <span aria-label="Loading market change" className="inline-block h-3 w-12 animate-pulse rounded bg-white/[0.08]" />
                  : marketChangePct == null ? '—' : `${Math.abs(marketChangePct).toFixed(2)}%`}</span>
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

        {/* Live activity animation, populated only by verified backend activity events. */}
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

          {hasChartData ? (
            <div className="relative">
              <DotMatrixChart
                key={activeToken.mint + ':' + timeframe}
                currentPrice={liveTokenPrice}
                marketCap={marketCap ?? undefined}
                entryPrice={activePosition ? entryPriceUsd : undefined}
                priceHistory={chartHistory}
                isPositive={isPositive}
                timeframe={timeframe}
                chartType={chartType}
                height={328}
                onPriceHover={(_price, t) => {
                  setScrubTime(t);
                }}
              />
              {chartHistoryLoading && (
                <div role="status" aria-live="polite" className="pointer-events-none absolute left-3 top-3 z-30 rounded border border-white/[0.10] bg-black/75 px-2 py-1 text-[9px] text-white/55 backdrop-blur-sm">
                  Loading chart history…
                </div>
              )}
            </div>
          ) : chartHistoryLoading || tokenSnapshotLoading || snapshotSections.chart === 'loading' ? (
            <div aria-label="Loading chart data" className="h-[328px] w-full animate-pulse bg-white/[0.025]">
              <div className="flex h-full flex-col justify-between p-5">
                <div className="h-3 w-24 rounded bg-white/[0.07]" />
                <div className="h-24 w-full rounded bg-white/[0.035]" />
                <div className="h-3 w-32 rounded bg-white/[0.07]" />
              </div>
            </div>
          ) : (
            <div role="status" aria-live="polite" className="flex h-[328px] w-full flex-col items-center justify-center gap-2 border-y border-white/[0.06] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.045),rgba(255,255,255,0.008)_58%,transparent_78%)] px-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.025]">
                <ChartLine className="h-4 w-4 text-white/35" />
              </div>
              <span className="text-[11px] font-medium text-white/65">No chart history yet</span>
              <span className="max-w-[250px] text-[10px] leading-relaxed text-white/35">
                {tokenSnapshotError
                  ? 'The token snapshot could not be loaded. Live confirmed trades will appear here when the stream is available.'
                  : `No saved candles are available for ${timeframe}. Waiting for new confirmed trades.`}
              </span>
            </div>
          )}
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
                  onAnimationEnd={() => setFloatingAmounts((current) => current.filter((entry) => entry.id !== item.id))}
                  className={`absolute bottom-5 whitespace-nowrap font-sans text-[11px] font-light tabular-nums tracking-[-0.02em] ${
                    item.side === 'buy' ? 'text-[#6CE094]' : 'text-[#FF4D4D]'
                  }`}
                  style={{
                    left: '10px',
                    animation: item.side === 'buy'
                      ? `nodex-money-flow 3.4s linear ${item.delayMs}ms both`
                      : `nodex-money-flow-sell 3.4s linear ${item.delayMs}ms both`,
                  }}
                >
                  <span className="inline-flex items-center gap-0.5">
                    <span aria-hidden="true" className="text-[11px] font-bold leading-none">
                      {item.side === 'buy' ? '▲' : '▼'}
                    </span>
                    {item.unit === 'USD' ? formatUsd(item.amount) : item.amount.toFixed(4) + ' SOL'}
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
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-white/[0.07] bg-white/[0.018] p-3">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-white/35">NodeX REST · engine</p>
              <p className={`mt-1 truncate text-[10px] font-medium ${tokenSnapshotLoading ? 'text-amber-300/80' : tokenSnapshotError ? 'text-red-300/80' : 'text-emerald-300/80'}`}>
                {tokenSnapshotLoading ? 'Requesting token state…' : tokenSnapshotError ? 'Request failed' : 'Response received'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-white/35">NodeX WebSocket · sniper</p>
              <p className={`mt-1 truncate text-[10px] font-medium ${sniperSubscriptionStatus === 'connected' ? 'text-emerald-300/80' : sniperSubscriptionStatus === 'rejected' || sniperSubscriptionStatus === 'disconnected' ? 'text-red-300/80' : 'text-amber-300/80'}`}>
                {sniperSubscriptionStatus === 'connecting' ? 'Subscribing…' : sniperSubscriptionStatus === 'connected' ? 'Subscribed' : sniperSubscriptionStatus === 'rejected' ? 'Subscription rejected' : 'Disconnected'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-white/35">Market Data · snapshot</p>
              <p className={`mt-1 truncate text-[10px] font-medium ${marketDataBackendStatus === 'received' ? 'text-emerald-300/80' : marketDataBackendStatus === 'failed' ? 'text-red-300/80' : 'text-amber-300/80'}`}>
                {marketDataBackendStatus === 'not_configured' ? 'Not configured' : marketDataBackendStatus === 'connecting' ? 'Connecting…' : marketDataBackendStatus === 'loading' ? 'Loading sections…' : marketDataBackendStatus === 'received' ? 'Snapshot received' : 'Request failed'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-white/35">Market Data · live stream</p>
              <p className={`mt-1 truncate text-[10px] font-medium ${marketDataWsStatus === 'subscribed' ? 'text-emerald-300/80' : marketDataWsStatus === 'error' || marketDataWsStatus === 'disconnected' ? 'text-red-300/80' : 'text-amber-300/80'}`}>
                {marketDataWsStatus === 'connecting' ? 'Connecting…' : marketDataWsStatus === 'connected' ? 'Connected · subscribing' : marketDataWsStatus === 'subscribed' ? 'Subscribed' : marketDataWsStatus === 'error' ? 'Stream error' : 'Disconnected'}
              </p>
            </div>
            <div className="col-span-2 grid grid-cols-3 gap-x-2 gap-y-1 border-t border-white/[0.06] pt-2">
              {(['identity', 'market', 'chart', 'trades', 'holders', 'info'] as const).map((section) => {
                const status = snapshotSections[section] || 'loading';
                return (
                  <div key={section} className="flex min-w-0 items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status === 'available' ? 'bg-emerald-300' : status === 'loading' ? 'animate-pulse bg-amber-300' : 'bg-white/20'}`} />
                    <span className="truncate text-[9px] capitalize text-white/45">{section}</span>
                    <span className="ml-auto text-[8px] text-white/25">{status === 'available' ? 'OK' : status === 'loading' ? '…' : 'N/A'}</span>
                  </div>
                );
              })}
            </div>
            {tokenSnapshotError && (
              <p className="col-span-2 break-words text-[10px] leading-relaxed text-red-300/70">NodeX: {tokenSnapshotError}</p>
            )}
            {marketDataBackendError && (
              <p className="col-span-2 break-words text-[10px] leading-relaxed text-amber-200/65">Market Data: {marketDataBackendError}</p>
            )}
            {marketDataStreamError && (
              <p className="col-span-2 break-words text-[10px] leading-relaxed text-amber-200/65">Sniper stream: {marketDataStreamError}</p>
            )}
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Market Statistics</h2>
              <span className="text-[9px] font-mono text-white/30">
                {snapshotSections.market === 'loading' || tokenSnapshotLoading ? 'FETCHING MARKET DATA' : snapshotSections.market === 'available' ? 'MARKET DATA RECEIVED' : 'MARKET DATA UNAVAILABLE'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-5">
              {[
                { label: 'Market Cap', value: formatCompactMarketCap(marketDataSnapshot?.market?.market_cap_usd), section: 'market' },
                { label: 'Liquidity', value: formatUsd(marketDataSnapshot?.market?.liquidity_usd), section: 'market' },
                { label: '24H Volume', value: formatUsd(marketDataSnapshot?.market?.volume_24h_usd), section: 'market' },
                { label: '24H Transactions', value: marketDataSnapshot?.market?.transactions_24h == null ? '—' : Number(marketDataSnapshot.market.transactions_24h).toLocaleString('en-US'), section: 'market' },
                { label: 'Total Supply', value: marketDataSnapshot?.info?.total_supply || '—', section: 'info' },
                { label: 'Circulating Supply', value: marketDataSnapshot?.info?.circulating_supply || '—', section: 'info' },
              ].map((item) => (
                <div key={item.label} className="min-w-0 space-y-1">
                  <p className="text-[11px] font-normal text-white/40">{item.label}</p>
                  {(tokenSnapshotLoading || snapshotSections[item.section] === 'loading') && item.value === '—' ? (
                    <div aria-label={`Loading ${item.label}`} className="h-[21px] w-24 max-w-full animate-pulse rounded bg-white/[0.075]" />
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
                <span className="text-[12px] font-medium text-white/85">{marketDataSnapshot?.info?.token_standard || 'Unavailable'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Decimals</span>
                <span className="font-mono text-[12px] font-medium text-white/85">{marketDataSnapshot?.info?.decimals ?? 'Unavailable'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[12px] text-white/40">Created At</span>
                <span className="text-[12px] font-medium text-white/85">
                  {marketDataSnapshot?.identity?.created_at ? new Date(marketDataSnapshot.identity.created_at).toLocaleString() : 'Unavailable'}
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
                      const creator = creatorAddress;
                      if (creator) navigator.clipboard.writeText(creator);
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
                    {activeToken.mint.slice(0, 5)}...{activeToken.mint.slice(-5)}
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
        </section>
      )}

      {activeDetailTab === 'Holders' && (
        <section aria-label="Token holders" className="w-full space-y-6 px-1 pb-8 pt-5">
          <div className="grid w-full grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-lg bg-white/[0.12] px-3 py-2.5">
              <p className="text-[11px] text-white/55">Total Holders</p>
              {snapshotSections.holders === 'loading' || tokenSnapshotLoading
                ? <div aria-label="Loading total holders" className="mt-2 h-5 w-20 animate-pulse rounded bg-white/[0.08]" />
                : <p className="mt-0.5 font-mono text-[19px] font-medium tracking-tight text-white/95">{marketDataSnapshot?.holders?.total_count == null ? '—' : Number(marketDataSnapshot.holders.total_count).toLocaleString('en-US')}</p>}
            </div>
            <div className="min-w-0 rounded-lg bg-white/[0.12] px-3 py-2.5">
              <p className="text-[11px] text-white/55">Top 10 Ownership</p>
              {snapshotSections.holders === 'loading' || tokenSnapshotLoading
                ? <div aria-label="Loading top holder concentration" className="mt-2 h-5 w-20 animate-pulse rounded bg-white/[0.08]" />
                : <p className="mt-0.5 font-mono text-[19px] font-medium tracking-tight text-white/95">{marketDataSnapshot?.holders?.top_10_ownership_pct == null ? '—' : Number(marketDataSnapshot.holders.top_10_ownership_pct).toFixed(2) + '%'}</p>}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium tracking-[0.01em] text-white/90">Largest Holders</h2>
              <span className="text-[10px] text-white/35">Ranked by balance</span>
            </div>
            <div className="w-full">
              {(marketDataSnapshot?.holders?.largest || []).map((holder, index) => (
                <div key={holder.address} className="border-b border-white/[0.07] py-3.5 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[10px] font-semibold tracking-wide text-white/75">
                      {holder.address.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-mono text-[11px] text-white/80">{holder.address.slice(0, 5)}...{holder.address.slice(-5)}</span>
                      <span className="font-mono text-[11px] font-medium text-white/95">{Number(holder.token_amount).toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
                    </div>
                    <div className="flex w-[76px] shrink-0 flex-col items-end gap-1.5">
                      <span className="font-mono text-[11px] text-white/65">{holder.supply_pct == null ? '—' : Number(holder.supply_pct).toFixed(2) + '%'}</span>
                      <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/[0.12]">
                        <div className="h-full rounded-full bg-white" style={{ width: holder.supply_pct == null ? '0%' : Math.min(Number(holder.supply_pct), 100) + '%' }} />
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
              ))}
              {snapshotSections.holders === 'loading' || tokenSnapshotLoading ? (
                <div className="space-y-3 py-3" aria-label="Loading holder data">
                  {[0, 1, 2, 3].map((item) => <div key={item} className="flex items-center gap-3 animate-pulse"><div className="h-9 w-9 rounded-full bg-white/[0.07]" /><div className="flex-1 space-y-2"><div className="h-2 w-28 rounded bg-white/[0.07]" /><div className="h-2 w-16 rounded bg-white/[0.045]" /></div><div className="h-2 w-12 rounded bg-white/[0.06]" /></div>)}
                </div>
              ) : (marketDataSnapshot?.holders?.largest || []).length === 0 && (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] px-5 py-8 text-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025]"><Copy className="h-4 w-4 text-white/25" /></div>
                  <p className="text-[11px] font-medium text-white/65">Holder data unavailable</p>
                  <p className="max-w-[230px] text-[10px] leading-relaxed text-white/35">A complete holder index is not available from the current data provider.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeDetailTab === 'Position' && (
        <section aria-label="Token position" className="w-full space-y-5 px-3 pb-8 pt-5">
          {activePosition ? (
            <>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <h2 className="min-w-0 truncate text-[19px] font-semibold leading-tight tracking-tight text-white/95">
                  {(activePosition.name || tokenName || '').length <= 18 ? (activePosition.name || tokenName || activePosition.symbol || tokenSymbol) : (activePosition.symbol || tokenSymbol)}
                </h2>
                <span className="shrink-0 rounded-md bg-white/[0.08] px-2.5 py-1 text-[9px] font-semibold tracking-[0.08em] text-white/70">OPEN</span>
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-white/40">Position value</p>
                  <p className="truncate font-sans text-[27px] font-semibold leading-tight tracking-tight tabular-nums text-white">{formatUsd(activePosition.current_position_value_usd)}</p>
                </div>
                <div className="min-w-0 space-y-1 text-right">
                  <p className="text-[10px] font-medium uppercase tracking-[0.11em] text-white/40">Unrealized P&amp;L</p>
                  <p className={'truncate font-mono text-[17px] font-semibold leading-tight tabular-nums ' + (activePosition.pnl_usd >= 0 ? 'text-[#6CE094]' : 'text-[#F06A6A]')}>
                    {activePosition.pnl_usd >= 0 ? '+' : '−'}{formatUsd(Math.abs(activePosition.pnl_usd))}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-white/[0.10] py-4">
                <div className="min-w-0 space-y-1"><p className="text-[10px] text-white/40">Entry Price</p><p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">{formatUsd(activePosition.entry_price_usd, 8)}</p></div>
                <div className="min-w-0 space-y-1"><p className="text-[10px] text-white/40">Current Price</p><p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">{formatUsd(activePosition.current_price_usd, 8)}</p></div>
                <div className="min-w-0 space-y-1"><p className="text-[10px] text-white/40">Invested Amount</p><p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">{formatUsd(activePosition.initial_investment_usd)}</p></div>
                <div className="min-w-0 space-y-1"><p className="text-[10px] text-white/40">Total Holdings</p><p className="truncate font-mono text-[13px] font-medium tabular-nums text-white/90">{Number(activePosition.amount_tokens).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 })}</p></div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] text-white/40">Opened</span>
                <span className="text-[10px] tabular-nums text-white/65">{new Date(activePosition.entry_time).toLocaleString()}</span>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-[11px] text-white/40">No open paper position for this token.</p>
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
            <span className={'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.10] px-2 py-1 text-[9px] font-medium tracking-wide ' + (marketDataWsStatus === 'subscribed' ? 'text-emerald-300/80' : 'text-white/40')}>
              <span className={'h-1.5 w-1.5 rounded-full ' + (marketDataWsStatus === 'subscribed' ? 'bg-emerald-300/70' : 'bg-white/30')} />
              {marketDataWsStatus === 'subscribed' ? 'LIVE MARKET DATA' : marketDataBackendStatus === 'received' ? 'SNAPSHOT' : 'WAITING'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0 rounded-md bg-white/[0.07] px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-white/40">Buy Volume</p>
              {snapshotSections.market === 'loading' || tokenSnapshotLoading
                ? <div aria-label="Loading buy volume" className="mt-2 h-5 w-24 animate-pulse rounded bg-white/[0.08]" />
                : <p className="mt-1 font-mono text-[18px] font-medium tabular-nums text-[#6CE094]">{formatUsd(marketDataSnapshot?.market?.buy_volume_usd)}</p>}
            </div>
            <div className="min-w-0 rounded-md bg-white/[0.07] px-3 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.09em] text-white/40">Sell Volume</p>
              {snapshotSections.market === 'loading' || tokenSnapshotLoading
                ? <div aria-label="Loading sell volume" className="mt-2 h-5 w-24 animate-pulse rounded bg-white/[0.08]" />
                : <p className="mt-1 font-mono text-[18px] font-medium tabular-nums text-[#F06A6A]">{formatUsd(marketDataSnapshot?.market?.sell_volume_usd)}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-medium text-white/55">Buy / Sell Pressure</span>
              {snapshotSections.market === 'loading' || tokenSnapshotLoading
                ? <span aria-label="Loading buy and sell pressure" className="inline-block h-3 w-20 animate-pulse rounded bg-white/[0.08]" />
                : <span className="font-mono tabular-nums text-white/55">{marketDataSnapshot?.market?.buy_pressure_pct == null ? '—' : Number(marketDataSnapshot.market.buy_pressure_pct).toFixed(1) + '%'} <span className="text-white/25">/</span> {marketDataSnapshot?.market?.buy_pressure_pct == null ? '—' : (100 - Number(marketDataSnapshot.market.buy_pressure_pct)).toFixed(1) + '%'}</span>}
            </div>
            <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.10]">
              <div className="h-full bg-[#6CE094]" style={{ width: marketDataSnapshot?.market?.buy_pressure_pct == null ? '0%' : Math.max(0, Math.min(100, Number(marketDataSnapshot.market.buy_pressure_pct))) + '%' }} />
              <div className="h-full bg-[#F06A6A]" style={{ width: marketDataSnapshot?.market?.buy_pressure_pct == null ? '0%' : Math.max(0, Math.min(100, 100 - Number(marketDataSnapshot.market.buy_pressure_pct))) + '%' }} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-white/[0.10] pb-3">
            <h3 className="text-[12px] font-medium text-white/85">Trade History <span className="ml-1 text-white/35">({(marketDataSnapshot?.trades?.recent || []).length})</span></h3>
            <div className="flex items-center gap-1 rounded-md bg-white/[0.06] p-0.5">
              {(['All', 'Buys', 'Sells'] as const).map((filter) => (
                <button key={filter} type="button" aria-pressed={tradeFilter === filter} onClick={() => setTradeFilter(filter)} className={'rounded-sm px-2.5 py-1 text-[10px] font-medium transition-colors ' + (tradeFilter === filter ? 'bg-white/[0.14] text-white' : 'text-white/45 hover:text-white/80')}>
                  {filter}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-0">
            {(marketDataSnapshot?.trades?.recent || [])
              .filter((trade) => tradeFilter === 'All' || (tradeFilter === 'Buys' ? String(trade.side).toLowerCase() === 'buy' : String(trade.side).toLowerCase() === 'sell'))
              .map((trade) => {
                const side = String(trade.side || '').toUpperCase();
                const trader = String(trade.trader || '');
                const amount = trade.volume_usd;
                const ageSeconds = Math.max(0, Math.floor((Date.now() - Number(trade.timestamp_ms)) / 1000));
                const age = ageSeconds < 60 ? ageSeconds + 's ago' : ageSeconds < 3600 ? Math.floor(ageSeconds / 60) + 'm ago' : Math.floor(ageSeconds / 3600) + 'h ago';
                return (
                  <div key={trade.signature + ':' + trade.event_index} className="flex min-w-0 items-center gap-2.5 border-b border-white/[0.07] py-2 last:border-b-0">
                    <span className={'inline-flex h-5 w-[42px] shrink-0 items-center justify-center rounded-sm text-[9px] font-bold tracking-wide ' + (side === 'BUY' ? 'bg-[#6CE094]/[0.12] text-[#6CE094]' : 'bg-[#F06A6A]/[0.12] text-[#F06A6A]')}>{side || '—'}</span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-mono text-[10px] text-white/75">{trader ? trader.slice(0, 5) + '...' + trader.slice(-5) : 'Wallet unavailable'}</span>
                        {trader && <button type="button" aria-label="Copy trader wallet" title="Copy trader wallet" onClick={() => navigator.clipboard.writeText(trader)} className="shrink-0 text-white/30 transition-colors hover:text-white/80"><Copy className="h-2.5 w-2.5" /></button>}
                      </div>
                      <span className="text-[9px] text-white/35">{trade.token_amount == null ? 'Token amount unavailable' : Number(trade.token_amount).toLocaleString('en-US', { maximumFractionDigits: 4 }) + ' tokens'} · {age}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={'font-mono text-[11px] font-medium tabular-nums ' + (side === 'BUY' ? 'text-[#6CE094]' : 'text-[#F06A6A]')}>{formatUsd(amount)}</p>
                      {trade.price_usd != null && <p className="text-[9px] text-white/35">{formatUsd(trade.price_usd, 8)}</p>}
                    </div>
                  </div>
                );
              })}
            {snapshotSections.trades === 'loading' || tokenSnapshotLoading ? (
              <div aria-label="Loading recent trades" className="space-y-3 py-4">
                {[0, 1, 2, 3].map((item) => <div key={item} className="flex animate-pulse items-center gap-3 border-b border-white/[0.05] pb-3"><div className="h-5 w-10 rounded bg-white/[0.07]" /><div className="flex-1 space-y-2"><div className="h-2 w-28 rounded bg-white/[0.07]" /><div className="h-2 w-16 rounded bg-white/[0.045]" /></div><div className="h-3 w-14 rounded bg-white/[0.07]" /></div>)}
              </div>
            ) : (marketDataSnapshot?.trades?.recent || []).filter((trade) => tradeFilter === 'All' || (tradeFilter === 'Buys' ? String(trade.side).toLowerCase() === 'buy' : String(trade.side).toLowerCase() === 'sell')).length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] px-5 py-8 text-center">
                <p className="text-[11px] font-medium text-white/65">No recent trades returned</p>
                <p className="max-w-[230px] text-[10px] leading-relaxed text-white/35">The provider has no trade history for this token and timeframe.</p>
              </div>
            )}
          </div>
        </section>
      )}

      </div>

    </section>
    </div>
    </div>
  );
};
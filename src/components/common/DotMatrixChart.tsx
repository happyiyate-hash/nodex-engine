import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaData,
  AreaSeries,
  AutoscaleInfo,
  CandlestickData,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  IPriceLine,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  LineStyle,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
  createChart,
} from 'lightweight-charts';
import { PricePoint } from '../../types';

export interface PriceTick {
  time: string;
  timestamp: number;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

interface DotMatrixChartProps {
  currentPrice: number;
  entryPrice?: number;
  priceHistory?: PricePoint[];
  isPositive?: boolean;
  timeframe?: string;
  chartType?: 'line' | 'candle';
  onPriceHover?: (price: number | null, time: string | null) => void;
  height?: number;
}

type CanvasTarget = Parameters<IPrimitivePaneRenderer['draw']>[0];

/**
 * Easy-to-edit visual configuration for the TradingView chart,
 * dot-matrix background, calm filled halo live dot, and right-axis price card.
 */
const CHART_THEME = {
  background: '#000000',
  dots: {
    enabled: true,
    spacing: 7,
    radius: 0.6,
    maxOpacity: 0.22,
    sheenColor: '232, 238, 248',
  },
  upColor: '#6CE094',
  upTopColor: 'rgba(108, 224, 148, 0.10)',
  upBottomColor: 'rgba(108, 224, 148, 0.0)',
  upBadgeBg: '#3CC66C',
  downColor: '#F06A6A',
  downTopColor: 'rgba(240, 106, 106, 0.10)',
  downBottomColor: 'rgba(240, 106, 106, 0.0)',
  downBadgeBg: '#DC4C4C',
  lineWidth: 2 as const,
  gridHorzColor: 'rgba(255,255,255,0.04)',
  axisTextColor: 'rgba(255,255,255,0.46)',
  crosshairColor: 'rgba(255,255,255,0.32)',
  crosshairLabelBg: '#18191c',
  entryLineColor: 'rgba(250,204,21,0.55)',
  liveDot: {
    radius: 4.5,
    haloRadius: 7,
    haloMaxRadius: 17,
    haloPeriodMs: 2600,
  },
  liveBadge: {
    minWidth: 48,
    height: 17,
    rightInset: 2,
    textColor: '#FFFFFF',
  },
  directionCard: {
    width: 18,
    height: 22,
    radius: 5,
    upColor: '#6CE094',
    upGlow: '#A7F3C0',
    downColor: '#F06A6A',
    downGlow: '#FCA5A5',
    cycleMs: 950,
  },
};

const BASE_RIGHT_OFFSET = 8;

const TIMEFRAME_INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1H': 60 * 60_000,
  '24H': 60 * 60_000,
};

// Exact step interval per bar in Line mode: backward scroll advances continuously
// at 1 bar per `stepMs` instead of stepping and pausing.
const TIMEFRAME_LIVE_STEP_MS: Record<string, number> = {
  '1m': 1_000,
  '5m': 3_000,
  '15m': 6_000,
  '30m': 10_000,
  '1H': 15_000,
  '24H': 30_000,
};

// Minimum vertical price span (fraction of price) per timeframe so higher
// timeframes stay calm while scaling smoothly without discrete step jumps.
const TIMEFRAME_Y_SPAN_RATIO: Record<string, number> = {
  '1m': 0.045,
  '5m': 0.09,
  '15m': 0.16,
  '30m': 0.26,
  '1H': 0.40,
  '24H': 0.65,
};

const formatBucketTime = (timestampMs: number, timeframe: string) => {
  const date = new Date(timestampMs);
  if (timeframe === '24H' || timeframe === '1H') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeframe === '1m' ? { second: '2-digit' as const } : {}),
  });
};

const formatPrice = (price: number) => {
  if (!Number.isFinite(price)) return '—';
  if (price === 0) return '0';
  const abs = Math.abs(price);
  if (abs < 0.000001) return price.toExponential(2);
  if (abs < 0.001) return price.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  if (abs < 1) return price.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (abs < 1000) return price.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const hexToRgba = (hex: string, alpha: number) => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
};

interface NormalizedBar {
  time: UTCTimestamp;
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface LiveRenderState {
  displayPrice: number;
  subBarFraction: number;
  trendDirection: 'up' | 'down';
}

/**
 * Custom TradingView Series Primitive executed inside TradingView's own
 * synchronized canvas pass:
 * - Connects the last settled bar cleanly to the continuously gliding live tip
 *   (with matching area light refraction underneath)
 * - Draws the horizontal dashed price guide
 * - Draws the bigger live dot + calm single-pulse filled halo locked strictly at the tip
 * - Syncs the right-axis live-price pill card to the exact Y coordinate
 */
class LiveTipPrimitive implements ISeriesPrimitive<Time> {
  private attachedParams: SeriesAttachedParameter<Time, SeriesType> | null = null;
  private readonly mode: 'line' | 'candle';
  private readonly getChartType: () => 'line' | 'candle';
  private readonly getColors: () => {
    line: string;
    top: string;
    bottom: string;
  };
  private readonly getLiveState: () => LiveRenderState;
  private readonly onBadgeSync: (
    price: number | null,
    yCoord: number | null,
    plotW: number,
    plotH: number,
  ) => void;

  private readonly paneView: IPrimitivePaneView = {
    zOrder: (): PrimitivePaneViewZOrder => 'top',
    renderer: (): IPrimitivePaneRenderer => ({
      draw: (target: CanvasTarget) => this.drawOnPane(target),
    }),
  };

  constructor(options: {
    mode: 'line' | 'candle';
    getChartType: () => 'line' | 'candle';
    getColors: () => { line: string; top: string; bottom: string };
    getLiveState: () => LiveRenderState;
    onBadgeSync: (
      price: number | null,
      yCoord: number | null,
      plotW: number,
      plotH: number,
    ) => void;
  }) {
    this.mode = options.mode;
    this.getChartType = options.getChartType;
    this.getColors = options.getColors;
    this.getLiveState = options.getLiveState;
    this.onBadgeSync = options.onBadgeSync;
  }

  public attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.attachedParams = param;
  }

  public detached(): void {
    this.attachedParams = null;
  }

  public requestRedraw(): void {
    this.attachedParams?.requestUpdate();
  }

  public paneViews(): readonly IPrimitivePaneView[] {
    if (this.getChartType() !== this.mode) return [];
    return [this.paneView];
  }

  private drawOnPane(target: CanvasTarget): void {
    const params = this.attachedParams;
    if (!params || this.getChartType() !== this.mode) return;

    const data = params.series.data();
    if (!data || data.length === 0) {
      this.onBadgeSync(null, null, 0, 0);
      return;
    }

    const last = data[data.length - 1] as unknown as {
      time: Time;
      value?: number;
      close?: number;
    };
    const barClose =
      typeof last.value === 'number'
        ? last.value
        : typeof last.close === 'number'
          ? last.close
          : null;

    if (barClose === null || !Number.isFinite(barClose)) {
      this.onBadgeSync(null, null, 0, 0);
      return;
    }

    const first = data[0] as unknown as {
      time: Time;
      value?: number;
      open?: number;
      close?: number;
    };
    const firstVal =
      typeof first.value === 'number'
        ? first.value
        : typeof first.open === 'number'
          ? first.open
          : typeof first.close === 'number'
            ? first.close
            : null;
    const xFirst = params.chart.timeScale().timeToCoordinate(first.time);
    const yFirst =
      firstVal !== null && Number.isFinite(firstVal)
        ? params.series.priceToCoordinate(firstVal)
        : null;

    const liveState = this.getLiveState();
    const livePrice =
      Number.isFinite(liveState.displayPrice) && liveState.displayPrice > 0
        ? liveState.displayPrice
        : barClose;

    const yBar = params.series.priceToCoordinate(barClose);
    const yLive = params.series.priceToCoordinate(livePrice);
    const xLast = params.chart.timeScale().timeToCoordinate(last.time);
    const colors = this.getColors();

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const plotW = mediaSize.width;
      const plotH = mediaSize.height;

      // In Candle mode, lock guide + card strictly to the rendered candle close
      // so the candle body, dashed guide, and right-axis card never separate.
      const displayValue = this.mode === 'candle' ? barClose : livePrice;
      const guideY =
        this.mode === 'candle'
          ? yBar
          : yLive !== null && Number.isFinite(yLive)
            ? yLive
            : yBar;
      if (guideY === null || !Number.isFinite(guideY)) {
        this.onBadgeSync(null, null, plotW, plotH);
        return;
      }

      // Compute exact continuous live tip X position ahead of the sliding bar
      let liveX: number | null = xLast;
      if (
        this.mode === 'line' &&
        xLast !== null &&
        Number.isFinite(xLast)
      ) {
        let spacing = params.chart.timeScale().options().barSpacing || 5;
        if (data.length >= 2) {
          const prev = data[data.length - 2] as unknown as { time: Time };
          const xPrev = params.chart.timeScale().timeToCoordinate(prev.time);
          if (xPrev !== null && Number.isFinite(xPrev) && xLast - xPrev > 0.2) {
            spacing = xLast - xPrev;
          }
        }
        const frac = Math.max(0, Math.min(0.9999, liveState.subBarFraction));
        liveX = xLast + frac * spacing;
      }

      // Sync the right-axis pill card to the exact rendered price & Y coordinate
      this.onBadgeSync(displayValue, guideY, plotW, plotH);

      ctx.save();

      // Clip inside plot pane bounds (include full right-edge connector stroke)
      ctx.beginPath();
      ctx.rect(0, 0, plotW + 1, plotH);
      ctx.clip();

      // Precompute shared relative area gradient matching TradingView AreaSeries
      let areaGrad: CanvasGradient | null = null;
      if (this.mode === 'line') {
        let minY: number = guideY;
        if (yBar !== null && Number.isFinite(yBar)) {
          minY = Math.min(minY, yBar);
        }
        if (yFirst !== null && Number.isFinite(yFirst)) {
          minY = Math.min(minY, yFirst);
        }
        const visRange = params.chart.timeScale().getVisibleLogicalRange();
        const minScanIdx = visRange
          ? Math.max(0, Math.floor(visRange.from))
          : Math.max(0, data.length - 120);
        const maxScanIdx = visRange
          ? Math.min(data.length - 1, Math.ceil(visRange.to))
          : data.length - 1;
        for (let i = minScanIdx; i <= maxScanIdx; i++) {
          const item = data[i] as unknown as { value?: number };
          if (typeof item.value === 'number') {
            const cy = params.series.priceToCoordinate(item.value);
            if (cy !== null && Number.isFinite(cy) && cy < minY) {
              minY = cy;
            }
          }
        }
        const gradTop = Math.max(0, Math.min(minY, plotH - 1));
        areaGrad = ctx.createLinearGradient(0, gradTop, 0, plotH);
        areaGrad.addColorStop(0, colors.top);
        areaGrad.addColorStop(1, colors.bottom);
      }

      // 0. In Line mode, extend the starting back of the line & shadow continuously
      // all the way to the left edge (x = 0) when data starts mid-chart.
      if (
        this.mode === 'line' &&
        areaGrad &&
        xFirst !== null &&
        yFirst !== null &&
        Number.isFinite(xFirst) &&
        Number.isFinite(yFirst) &&
        xFirst > 0.25
      ) {
        const joinX = Math.min(plotW, xFirst + 0.5);
        ctx.fillStyle = areaGrad;
        ctx.beginPath();
        ctx.moveTo(0, yFirst);
        ctx.lineTo(joinX, yFirst);
        ctx.lineTo(joinX, plotH);
        ctx.lineTo(0, plotH);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = colors.line;
        ctx.lineWidth = CHART_THEME.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(0, yFirst);
        ctx.lineTo(joinX, yFirst);
        ctx.stroke();
      }

      // 1. In Line mode, draw the live continuous tail from last settled point -> live tip
      if (
        this.mode === 'line' &&
        areaGrad &&
        xLast !== null &&
        yBar !== null &&
        liveX !== null &&
        Number.isFinite(xLast) &&
        Number.isFinite(yBar) &&
        Number.isFinite(liveX) &&
        liveX - xLast > 0.15
      ) {
        ctx.fillStyle = areaGrad;
        ctx.beginPath();
        ctx.moveTo(xLast, yBar);
        ctx.lineTo(liveX, guideY);
        ctx.lineTo(liveX, plotH);
        ctx.lineTo(xLast, plotH);
        ctx.closePath();
        ctx.fill();

        // Crisp continuous line extension
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = CHART_THEME.lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(xLast, yBar);
        ctx.lineTo(liveX, guideY);
        ctx.stroke();
      }

      // Compute centered X for the two directional V chevrons between dot/candle and right axis
      const tipEdgeX =
        this.mode === 'line'
          ? liveX !== null && Number.isFinite(liveX)
            ? liveX + CHART_THEME.liveDot.radius + 4
            : null
          : xLast !== null && Number.isFinite(xLast)
            ? xLast + 5
            : null;
      const axisEdgeX = plotW - 4;
      const showChevrons =
        tipEdgeX !== null && axisEdgeX - tipEdgeX >= CHART_THEME.directionCard.width + 4;
      const chevronX = showChevrons && tipEdgeX !== null ? (tipEdgeX + axisEdgeX) / 2 : null;

      // 2. Straight wire connecting ONLY the live dot/candle directly to the right-axis card
      // (stops strictly between the dot/candle and the card — never stretches backward).
      const badgeH = CHART_THEME.liveBadge.height;
      const cardCenterY =
        Math.max(2, Math.min(plotH - badgeH - 1, guideY - badgeH / 2)) + badgeH / 2;
      const wireStartX =
        this.mode === 'line'
          ? liveX !== null && Number.isFinite(liveX)
            ? Math.max(0, Math.min(plotW, liveX))
            : null
          : xLast !== null && Number.isFinite(xLast)
            ? Math.max(0, Math.min(plotW, xLast + 3))
            : null;

      if (wireStartX !== null && plotW - wireStartX > 1) {
        ctx.strokeStyle = hexToRgba(colors.line, 0.8);
        ctx.lineWidth = 1.25;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (chevronX !== null && chevronX > wireStartX + 4) {
          const gapHalf = 8;
          ctx.moveTo(wireStartX, guideY);
          ctx.lineTo(Math.max(wireStartX, chevronX - gapHalf), guideY);
          ctx.moveTo(Math.min(plotW, chevronX + gapHalf), cardCenterY);
          ctx.lineTo(plotW, cardCenterY);
        } else {
          ctx.moveTo(wireStartX, guideY);
          ctx.lineTo(plotW, cardCenterY);
        }
        ctx.stroke();
      }

      // 3. In Line mode, draw the single calm pulsing filled halo + bigger dot tightly locked at (liveX, guideY)
      if (
        this.mode === 'line' &&
        liveX !== null &&
        Number.isFinite(liveX) &&
        liveX >= -24 &&
        liveX <= plotW + 24
      ) {
        const now = performance.now();
        const period = CHART_THEME.liveDot.haloPeriodMs;
        const baseR = CHART_THEME.liveDot.radius;
        const wrapR = CHART_THEME.liveDot.haloRadius;
        const maxR = CHART_THEME.liveDot.haloMaxRadius;

        // Subtle filled wrap that stays anchored right around the dot
        ctx.fillStyle = hexToRgba(colors.line, 0.2);
        ctx.beginPath();
        ctx.arc(liveX, guideY, wrapR, 0, Math.PI * 2);
        ctx.fill();

        // Single calm expanding & fading filled halo pulse (one pulse per cycle, no stroked rings)
        const cycle = (now % period) / period;
        const activeFraction = 0.72;
        if (cycle < activeFraction) {
          const t = cycle / activeFraction;
          const eased = 1 - Math.pow(1 - t, 2.2);
          const pulseRadius = wrapR + eased * (maxR - wrapR);
          const fadeIn = t < 0.14 ? t / 0.14 : 1;
          const fadeOut = Math.pow(1 - t, 1.35);
          const pulseAlpha = 0.4 * fadeIn * fadeOut;

          ctx.fillStyle = hexToRgba(colors.line, pulseAlpha);
          ctx.beginPath();
          ctx.arc(liveX, guideY, pulseRadius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Bigger crisp live dot tightly fixed to the line's tip
        ctx.fillStyle = colors.line;
        ctx.beginPath();
        ctx.arc(liveX, guideY, baseR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // Bright center pinpoint
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(liveX, guideY, 1.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Two borderless directional V chevrons centered between dot/candlestick and right-axis card
      if (showChevrons && chevronX !== null) {
        const cardX = chevronX;
        const cardH = CHART_THEME.directionCard.height;
        const cardY = Math.max(cardH / 2 + 4, Math.min(plotH - cardH / 2 - 4, guideY));

        const isUp = liveState.trendDirection === 'up';
        const baseColor = isUp
          ? CHART_THEME.directionCard.upColor
          : CHART_THEME.directionCard.downColor;
        const brightColor = isUp
          ? CHART_THEME.directionCard.upGlow
          : CHART_THEME.directionCard.downGlow;

        // Two wide sharp V chevrons cycling on/off in opposite phases along travel direction
        const phase = (performance.now() % CHART_THEME.directionCard.cycleMs) / CHART_THEME.directionCard.cycleMs;
        // Phase A leads in direction of travel; Phase B is offset by half cycle (off while A is on)
        const waveA = Math.pow(0.5 + 0.5 * Math.cos(phase * Math.PI * 2), 1.8);
        const waveB = Math.pow(0.5 + 0.5 * Math.cos((phase + 0.5) * Math.PI * 2), 1.8);

        const topAlpha = isUp ? 0.16 + 0.84 * waveB : 0.16 + 0.84 * waveA;
        const botAlpha = isUp ? 0.16 + 0.84 * waveA : 0.16 + 0.84 * waveB;

        const wingW = 5.1;
        const dropH = 3.6;
        const rowOffset = 3.1;

        const drawChevron = (cy: number, alpha: number) => {
          const isLit = alpha > 0.55;
          ctx.save();
          ctx.lineJoin = 'miter';
          ctx.miterLimit = 6;
          ctx.lineCap = 'round';
          ctx.lineWidth = isLit ? 1.9 : 1.6;
          ctx.strokeStyle = isLit
            ? hexToRgba(brightColor, alpha)
            : hexToRgba(baseColor, alpha);
          if (isLit) {
            ctx.shadowColor = baseColor;
            ctx.shadowBlur = 6;
          }
          ctx.beginPath();
          if (isUp) {
            ctx.moveTo(cardX - wingW, cy + dropH / 2);
            ctx.lineTo(cardX, cy - dropH / 2);
            ctx.lineTo(cardX + wingW, cy + dropH / 2);
          } else {
            ctx.moveTo(cardX - wingW, cy - dropH / 2);
            ctx.lineTo(cardX, cy + dropH / 2);
            ctx.lineTo(cardX + wingW, cy - dropH / 2);
          }
          ctx.stroke();
          ctx.restore();
        };

        drawChevron(cardY - rowOffset, topAlpha);
        drawChevron(cardY + rowOffset, botAlpha);
      }

      ctx.restore();
    });
  }
}

export const DotMatrixChart: React.FC<DotMatrixChartProps> = ({
  currentPrice,
  entryPrice,
  priceHistory,
  isPositive = true,
  timeframe = '24H',
  chartType = 'line',
  onPriceHover,
  height = 272,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dotCanvasRef = useRef<HTMLCanvasElement>(null);
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const timeTicksCanvasRef = useRef<HTMLCanvasElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineTipPrimitiveRef = useRef<LiveTipPrimitive | null>(null);
  const candleTipPrimitiveRef = useRef<LiveTipPrimitive | null>(null);
  const entryPriceLineRef = useRef<IPriceLine | null>(null);

  // Continuous live-motion refs (60fps smooth price, horizontal scroll, and Y scale)
  const committedBarsRef = useRef<NormalizedBar[]>([]);
  const rawTargetPriceRef = useRef<number>(currentPrice > 0 ? currentPrice : 0);
  const smoothedPriceRef = useRef<number>(currentPrice > 0 ? currentPrice : 0);
  const subBarFractionRef = useRef<number>(0);
  const trendDirectionRef = useRef<'up' | 'down'>(isPositive ? 'up' : 'down');
  const directionAnchorPriceRef = useRef<number>(currentPrice > 0 ? currentPrice : 0);
  const lastTickWallMsRef = useRef<number>(Date.now());
  const stepMsRef = useRef<number>(TIMEFRAME_LIVE_STEP_MS[timeframe] || 30_000);
  const resolutionModeRef = useRef<'live-step' | 'buckets'>('live-step');

  const isUserPannedRef = useRef<boolean>(false);
  const isApplyingAutoScrollRef = useRef<boolean>(false);
  const lastAppliedScrollPosRef = useRef<number>(BASE_RIGHT_OFFSET);

  const latestVisibleBoundsRef = useRef<{ min: number; max: number } | null>(null);
  const targetYRangeRef = useRef<{ minValue: number; maxValue: number } | null>(null);
  const animYRangeRef = useRef<{ minValue: number; maxValue: number } | null>(null);

  const prevSeedMetaRef = useRef<{
    key: string;
    firstTime: number;
    length: number;
  } | null>(null);

  const [containerWidth, setContainerWidth] = useState(0);
  const [isPanned, setIsPanned] = useState(false);

  const { seedBars, resolutionMode, stepMs } = useMemo<{
    seedBars: NormalizedBar[];
    resolutionMode: 'live-step' | 'buckets';
    stepMs: number;
  }>(() => {
    const interval = TIMEFRAME_INTERVAL_MS[timeframe] || TIMEFRAME_INTERVAL_MS['24H'];
    const validRaw = (priceHistory || [])
      .filter(
        (point) =>
          Number.isFinite(point.price) &&
          point.price > 0 &&
          Number.isFinite(point.time) &&
          point.time > 1_000_000,
      )
      .slice()
      .sort((a, b) => a.time - b.time);

    if (validRaw.length === 0) {
      const liveStep = TIMEFRAME_LIVE_STEP_MS[timeframe] || 5_000;
      if (Number.isFinite(currentPrice) && currentPrice > 0) {
        const nowSec = Math.floor(Date.now() / 1000) as UTCTimestamp;
        const nowMs = nowSec * 1000;
        const stepSec = Math.max(1, Math.floor(liveStep / 1000));
        return {
          resolutionMode: chartType === 'line' ? 'live-step' : 'buckets',
          stepMs: chartType === 'line' ? liveStep : interval,
          seedBars: [
            {
              time: (nowSec - stepSec) as UTCTimestamp,
              timestampMs: nowMs - stepSec * 1000,
              open: currentPrice,
              high: currentPrice,
              low: currentPrice,
              close: currentPrice,
            },
            {
              time: nowSec,
              timestampMs: nowMs,
              open: currentPrice,
              high: currentPrice,
              low: currentPrice,
              close: currentPrice,
            },
          ],
        };
      }
      return {
        resolutionMode: 'buckets',
        stepMs: interval,
        seedBars: [],
      };
    }

    const spanMs = validRaw[validRaw.length - 1].time - validRaw[0].time;
    const useLiveStep = chartType === 'line' && spanMs < interval * 3;
    const activeStepMs = useLiveStep
      ? TIMEFRAME_LIVE_STEP_MS[timeframe] || 5_000
      : interval;

    // Anchor live-step buckets to the first point's second so continuous
    // scrolling starts right from elapsed time 0 without initial phase offset jumps.
    const originMs = useLiveStep
      ? Math.floor(validRaw[0].time / 1000) * 1000
      : 0;

    const buckets = new Map<number, NormalizedBar>();
    for (const point of validRaw) {
      const bucketMs = useLiveStep
        ? originMs + Math.max(0, Math.floor((point.time - originMs) / activeStepMs)) * activeStepMs
        : Math.floor(point.time / activeStepMs) * activeStepMs;
      const bucketSec = Math.floor(bucketMs / 1000) as UTCTimestamp;
      const open =
        Number.isFinite(point.open) && (point.open as number) > 0
          ? (point.open as number)
          : point.price;
      const high =
        Number.isFinite(point.high) && (point.high as number) > 0
          ? (point.high as number)
          : Math.max(open, point.price);
      const low =
        Number.isFinite(point.low) && (point.low as number) > 0
          ? (point.low as number)
          : Math.min(open, point.price);
      const close =
        Number.isFinite(point.close) && (point.close as number) > 0
          ? (point.close as number)
          : point.price;

      const existing = buckets.get(bucketSec);
      if (!existing) {
        buckets.set(bucketSec, {
          time: bucketSec,
          timestampMs: bucketMs,
          open,
          high,
          low,
          close,
        });
      } else {
        existing.high = Math.max(existing.high, high);
        existing.low = Math.min(existing.low, low);
        existing.close = close;
      }
    }

    let ordered = Array.from(buckets.values()).sort((a, b) => a.time - b.time);

    // Ensure a 1-bar line session immediately renders a baseline segment.
    if (chartType === 'line' && ordered.length === 1) {
      const only = ordered[0];
      const stepSec = Math.max(1, Math.floor(activeStepMs / 1000));
      ordered = [
        {
          time: (only.time - stepSec) as UTCTimestamp,
          timestampMs: only.timestampMs - stepSec * 1000,
          open: only.open,
          high: only.open,
          low: only.open,
          close: only.open,
        },
        only,
      ];
    }

    if (!useLiveStep && timeframe === '24H' && ordered.length > 24) {
      const latestMs = ordered[ordered.length - 1].timestampMs;
      return {
        resolutionMode: 'buckets',
        stepMs: activeStepMs,
        seedBars: ordered
          .filter((bar) => bar.timestampMs >= latestMs - 24 * 60 * 60_000)
          .slice(-24),
      };
    }

    return {
      resolutionMode: useLiveStep ? 'live-step' : 'buckets',
      stepMs: activeStepMs,
      seedBars: ordered.slice(-2000),
    };
  }, [priceHistory, currentPrice, timeframe, chartType]);

  stepMsRef.current = stepMs;
  resolutionModeRef.current = resolutionMode;

  const onPriceHoverRef = useRef(onPriceHover);
  onPriceHoverRef.current = onPriceHover;

  const timeframeRef = useRef(timeframe);
  timeframeRef.current = timeframe;

  const chartTypeRef = useRef(chartType);
  chartTypeRef.current = chartType;

  const isPositiveRef = useRef(isPositive);
  isPositiveRef.current = isPositive;

  // Helper to compute continuous target Y-axis range without any threshold jumps.
  // Allows price to travel all the way down to the bottom boundary (above the bottom brush)
  // before shrinking/rescaling while preserving clean top headroom.
  const computeTargetYRange = useCallback(
    (rawMin: number, rawMax: number, tf: string) => {
      const liveVal = smoothedPriceRef.current;
      const visMin =
        liveVal > 0 && Number.isFinite(liveVal) ? Math.min(rawMin, liveVal) : rawMin;
      const visMax =
        liveVal > 0 && Number.isFinite(liveVal) ? Math.max(rawMax, liveVal) : rawMax;
      const spanRatio = TIMEFRAME_Y_SPAN_RATIO[tf] ?? 0.26;
      const mid = (visMin + visMax) / 2;
      const tfMinSpan = Math.max(Math.abs(mid) * spanRatio, 1e-10);
      const rawSpan = Math.max(0, visMax - visMin);

      const flatBlend = Math.max(0, 1 - rawSpan / (tfMinSpan * 0.4));
      const bottomFrac = 0.012 + 0.22 * flatBlend;
      const topFrac = 0.1 + 0.12 * flatBlend;
      const activeBand = Math.max(0.4, 1 - topFrac - bottomFrac);
      const effectiveSpan = Math.max(tfMinSpan, rawSpan / activeBand);

      const minValue = Math.max(0, visMin - effectiveSpan * bottomFrac);
      const maxValue = minValue + effectiveSpan;
      return { minValue, maxValue };
    },
    [],
  );

  // Draw the pure-black + fading dot-matrix background canvas behind TradingView.
  const drawDotBackground = useCallback(() => {
    const canvas = dotCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const hostW = containerRef.current?.clientWidth || containerWidth;
    if (hostW <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, hostW);
    const h = height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = CHART_THEME.background;
    ctx.fillRect(0, 0, w, h);

    if (!CHART_THEME.dots.enabled) return;

    const { spacing, radius, maxOpacity, sheenColor } = CHART_THEME.dots;
    const smoothstep = (t: number) => {
      const c = Math.max(0, Math.min(1, t));
      return c * c * (3 - 2 * c);
    };
    const startOffset = 5;
    for (let y = startOffset; y < h - startOffset; y += spacing) {
      const normY = y / h;
      const fadeY =
        normY < 0.3
          ? 0.08 + 0.92 * smoothstep(normY / 0.3)
          : normY > 0.78
            ? 0.06 + 0.94 * smoothstep((1 - normY) / 0.22)
            : 1;

      for (let x = startOffset; x < w - startOffset; x += spacing) {
        const normX = x / w;
        const fadeX =
          normX < 0.24
            ? 0.08 + 0.92 * smoothstep(normX / 0.24)
            : normX > 0.68
              ? 0.06 + 0.94 * smoothstep((1 - normX) / 0.32)
              : 1;

        const dx = (normX - 0.45) * 1.15;
        const dy = (normY - 0.5) * 1.15;
        const dist = Math.min(1, Math.hypot(dx, dy));
        const sheenBoost = 0.86 + 0.14 * (1 - dist);

        const alpha = Math.max(0, Math.min(0.26, maxOpacity * fadeY * fadeX * sheenBoost));
        if (alpha <= 0.005) continue;

        ctx.fillStyle = `rgba(${sheenColor}, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [containerWidth, height]);

  useEffect(() => {
    drawDotBackground();
  }, [drawDotBackground]);

  // Measure container width with ResizeObserver.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientWidth > 0) setContainerWidth(el.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Synchronously position the right-axis live-price pill card inside the right axis column.
  const syncBadgeDom = useCallback(
    (price: number | null, yCoord: number | null, plotW: number, plotH: number) => {
      const badge = badgeRef.current;
      const chart = chartRef.current;
      if (!badge || !chart) return;

      const hostW = tvContainerRef.current?.clientWidth || containerRef.current?.clientWidth || 0;
      if (price === null || yCoord === null || !Number.isFinite(yCoord) || hostW <= 0 || plotH <= 0) {
        badge.style.opacity = '0';
        return;
      }

      const axisW = Math.max(48, chart.priceScale('right').width() || hostW - plotW || 52);
      const badgeH = CHART_THEME.liveBadge.height;
      const badgeW = Math.max(CHART_THEME.liveBadge.minWidth, axisW - 3);
      const badgeX = Math.max(plotW, Math.min(plotW + 1, hostW - badgeW - CHART_THEME.liveBadge.rightInset));
      const badgeY = Math.max(2, Math.min(plotH - badgeH - 1, yCoord - badgeH / 2));

      badge.style.opacity = '1';
      badge.style.width = `${badgeW}px`;
      badge.style.height = `${badgeH}px`;
      badge.style.transform = `translate3d(${badgeX}px, ${badgeY}px, 0)`;

      const formatted = formatPrice(price);
      if (badge.textContent !== formatted) {
        badge.textContent = formatted;
      }
    },
    [],
  );

  // Create TradingView Lightweight Chart instance once on mount.
  useEffect(() => {
    const host = tvContainerRef.current;
    if (!host) return;

    const axisFontFamily = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif";
    const chart = createChart(host, {
      autoSize: true,
      width: Math.max(1, host.clientWidth || 320),
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: CHART_THEME.axisTextColor,
        fontFamily: axisFontFamily,
        fontSize: 9.5,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: {
        borderVisible: false,
        entireTextOnly: true,
        minimumWidth: 68,
        scaleMargins: { top: 0.11, bottom: 0.015 },
      },
      timeScale: {
        borderVisible: true,
        borderColor: 'rgba(255,255,255,0.035)',
        ticksVisible: false,
        timeVisible: true,
        secondsVisible: timeframeRef.current === '1m',
        rightOffset: BASE_RIGHT_OFFSET,
        barSpacing: 5,
        minBarSpacing: 1.5,
        fixLeftEdge: false,
        shiftVisibleRangeOnNewBar: false,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: CHART_THEME.crosshairColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: CHART_THEME.crosshairLabelBg,
        },
        horzLine: {
          color: CHART_THEME.crosshairColor,
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: CHART_THEME.crosshairLabelBg,
        },
      },
      localization: {
        priceFormatter: formatPrice,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Continuous smooth Y-axis scale provider driven by 60fps interpolated bounds.
    const smoothAutoscaleProvider = (
      baseImplementation: () => AutoscaleInfo | null,
    ): AutoscaleInfo | null => {
      const res = baseImplementation();
      if (!res || !res.priceRange) return res;

      const rawMin = res.priceRange.minValue;
      const rawMax = res.priceRange.maxValue;
      if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) return res;

      latestVisibleBoundsRef.current = { min: rawMin, max: rawMax };
      const computedTarget = computeTargetYRange(rawMin, rawMax, timeframeRef.current);
      targetYRangeRef.current = computedTarget;

      if (!animYRangeRef.current) {
        animYRangeRef.current = { ...computedTarget };
      }

      return {
        priceRange: {
          minValue: animYRangeRef.current.minValue,
          maxValue: animYRangeRef.current.maxValue,
        },
      };
    };

    const lineColor = isPositive ? CHART_THEME.upColor : CHART_THEME.downColor;
    const topColor = isPositive ? CHART_THEME.upTopColor : CHART_THEME.downTopColor;
    const bottomColor = isPositive ? CHART_THEME.upBottomColor : CHART_THEME.downBottomColor;
    const lineSeries = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor,
      relativeGradient: true,
      lineWidth: CHART_THEME.lineWidth,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBackgroundColor: '#FFFFFF',
      crosshairMarkerBorderColor: lineColor,
      crosshairMarkerBorderWidth: 1,
      autoscaleInfoProvider: smoothAutoscaleProvider,
      priceFormat: {
        type: 'custom',
        minMove: 0.000000001,
        formatter: formatPrice,
      },
      visible: chartTypeRef.current === 'line',
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_THEME.upColor,
      downColor: CHART_THEME.downColor,
      wickUpColor: CHART_THEME.upColor,
      wickDownColor: CHART_THEME.downColor,
      borderVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      autoscaleInfoProvider: smoothAutoscaleProvider,
      priceFormat: {
        type: 'custom',
        minMove: 0.000000001,
        formatter: formatPrice,
      },
      visible: chartTypeRef.current === 'candle',
    });

    const getPalette = () =>
      isPositiveRef.current
        ? {
            line: CHART_THEME.upColor,
            top: CHART_THEME.upTopColor,
            bottom: CHART_THEME.upBottomColor,
          }
        : {
            line: CHART_THEME.downColor,
            top: CHART_THEME.downTopColor,
            bottom: CHART_THEME.downBottomColor,
          };

    const getLiveState = (): LiveRenderState => ({
      displayPrice: smoothedPriceRef.current,
      subBarFraction: subBarFractionRef.current,
      trendDirection: trendDirectionRef.current,
    });

    const lineTipPrimitive = new LiveTipPrimitive({
      mode: 'line',
      getChartType: () => chartTypeRef.current,
      getColors: getPalette,
      getLiveState,
      onBadgeSync: syncBadgeDom,
    });
    const candleTipPrimitive = new LiveTipPrimitive({
      mode: 'candle',
      getChartType: () => chartTypeRef.current,
      getColors: getPalette,
      getLiveState,
      onBadgeSync: syncBadgeDom,
    });
    lineSeries.attachPrimitive(lineTipPrimitive);
    candleSeries.attachPrimitive(candleTipPrimitive);

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;
    candleSeriesRef.current = candleSeries;
    lineTipPrimitiveRef.current = lineTipPrimitive;
    candleTipPrimitiveRef.current = candleTipPrimitive;
    prevSeedMetaRef.current = null;
    targetYRangeRef.current = null;
    animYRangeRef.current = null;
    latestVisibleBoundsRef.current = null;

    // Replace the chart library's heavier time-axis tick marks with fine hairlines.
    const drawTimeScaleTicks = () => {
      const canvas = timeTicksCanvasRef.current;
      if (!canvas) return;

      const width = host.clientWidth;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const canvasHeight = 5;
      if (width <= 0) return;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(canvasHeight * dpr);
      canvas.style.width = String(width) + 'px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, canvasHeight);

      const visibleRange = chart.timeScale().getVisibleLogicalRange();
      if (!visibleRange || visibleRange.to <= visibleRange.from) return;

      const plotRight = width - chart.priceScale('right').width();
      ctx.strokeStyle = 'rgba(255,255,255,0.24)';
      ctx.lineWidth = 0.6;
      ctx.lineCap = 'butt';

      // Five fine tick marks follow the visible time range while it scrolls.
      for (let index = 0; index <= 4; index += 1) {
        const logical =
          visibleRange.from + ((visibleRange.to - visibleRange.from) * index) / 4;
        const x = chart.timeScale().logicalToCoordinate(logical as never);
        if (x === null || !Number.isFinite(x) || x < 0 || x > plotRight) continue;

        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0.5);
        ctx.lineTo(Math.round(x) + 0.5, 3.2);
        ctx.stroke();
      }
    };

    const handleLogicalRange = () => {
      drawTimeScaleTicks();
      if (isApplyingAutoScrollRef.current) return;
      const range = chart.timeScale().getVisibleLogicalRange();
      const total = committedBarsRef.current.length;
      const currentScrollPos = chart.timeScale().scrollPosition();
      const expectedPos =
        BASE_RIGHT_OFFSET +
        (chartTypeRef.current === 'line' ? subBarFractionRef.current : 0);

      // Only pause continuous backward scrolling on an intentional horizontal pan
      if (
        chartTypeRef.current === 'line' &&
        (currentScrollPos < expectedPos - 3.0 ||
          currentScrollPos > expectedPos + 6.0 ||
          (range !== null && total > 6 && range.to < total - 2.0))
      ) {
        isUserPannedRef.current = true;
      } else if (
        isUserPannedRef.current &&
        Math.abs(currentScrollPos - expectedPos) <= 1.5 &&
        (!range || range.to >= total - 1.5)
      ) {
        isUserPannedRef.current = false;
      }

      if (range && total > 0) {
        const pannedLeft = total > 6 && range.to < total - 2.0;
        setIsPanned(pannedLeft || isUserPannedRef.current);
      } else {
        setIsPanned(false);
      }
    };

    const handleCrosshairMove = (
      param: Parameters<Parameters<IChartApi['subscribeCrosshairMove']>[0]>[0],
    ) => {
      if (!param.point || param.time === undefined) {
        onPriceHoverRef.current?.(null, null);
        return;
      }
      const activeSeries =
        chartTypeRef.current === 'line'
          ? lineSeriesRef.current
          : candleSeriesRef.current;
      if (!activeSeries) return;

      const value = param.seriesData.get(activeSeries) as
        | { value?: number; close?: number }
        | undefined;
      const hoveredPrice =
        typeof value?.value === 'number'
          ? value.value
          : typeof value?.close === 'number'
            ? value.close
            : null;

      if (hoveredPrice === null || !Number.isFinite(hoveredPrice)) {
        onPriceHoverRef.current?.(null, null);
        return;
      }

      const timeMs =
        typeof param.time === 'number' ? param.time * 1000 : Date.now();
      onPriceHoverRef.current?.(
        hoveredPrice,
        formatBucketTime(timeMs, timeframeRef.current),
      );
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleLogicalRange);
    chart.subscribeCrosshairMove(handleCrosshairMove);
    drawTimeScaleTicks();

    const tickResizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(drawTimeScaleTicks);
    });
    tickResizeObserver.observe(host);

    // Unified 60fps animation loop:
    // 1. Velocity-adaptive price smoothing (moves fast on spikes, gently on small ticks)
    // 2. Continuous backward scrolling at exact 1 bar / stepMs timing (no stop-and-go)
    // 3. Smooth continuous Y-axis scale easing (no shrink-stop-shrink-stop)
    let rafId: number | null = null;
    let prevPerfNow = performance.now();

    const animateFrame = (nowPerf: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (nowPerf - prevPerfNow) / 1000));
      prevPerfNow = nowPerf;

      if (
        typeof document === 'undefined' ||
        document.visibilityState !== 'hidden'
      ) {
        // 1. Smoothly track latest target price & live movement direction
        const targetP = rawTargetPriceRef.current;
        if (targetP > 0 && Number.isFinite(targetP)) {
          if (directionAnchorPriceRef.current <= 0) {
            directionAnchorPriceRef.current = targetP;
          } else {
            const anchorDelta = targetP - directionAnchorPriceRef.current;
            const eps = directionAnchorPriceRef.current * 0.0008;
            if (anchorDelta > eps) {
              trendDirectionRef.current = 'up';
              directionAnchorPriceRef.current = targetP;
            } else if (anchorDelta < -eps) {
              trendDirectionRef.current = 'down';
              directionAnchorPriceRef.current = targetP;
            }
          }

          const curP = smoothedPriceRef.current;
          if (!(curP > 0 && Number.isFinite(curP))) {
            smoothedPriceRef.current = targetP;
          } else {
            if (targetP > curP * 1.0008) {
              trendDirectionRef.current = 'up';
            } else if (targetP < curP * 0.9992) {
              trendDirectionRef.current = 'down';
            }
            const diff = targetP - curP;
            const priceRate = 9.5;
            const blend = 1 - Math.exp(-priceRate * dt);
            smoothedPriceRef.current =
              Math.abs(diff) <= targetP * 1e-7 ? targetP : curP + diff * blend;
          }
        }

        const displayP =
          smoothedPriceRef.current > 0 ? smoothedPriceRef.current : targetP;

        // 2. Smooth continuous horizontal backward motion + timed bar commits in Line mode
        const committed = committedBarsRef.current;
        const activeStepMs = Math.max(1_000, stepMsRef.current);
        const stepSec = Math.max(1, Math.floor(activeStepMs / 1000));
        const nowWall = Date.now();
        const isFeedLive =
          nowWall - lastTickWallMsRef.current <= Math.max(activeStepMs * 1.5, 6_000);

        let committedNewBar = false;
        if (
          chartTypeRef.current === 'line' &&
          committed.length > 0 &&
          displayP > 0
        ) {
          if (isFeedLive) {
            let last = committed[committed.length - 1];
            let catchupGuard = 0;
            while (
              nowWall - last.timestampMs >= activeStepMs &&
              catchupGuard < 8
            ) {
              const nextMs = last.timestampMs + activeStepMs;
              const nextSec = (last.time + stepSec) as UTCTimestamp;
              const nextBar: NormalizedBar = {
                time: nextSec,
                timestampMs: nextMs,
                open: displayP,
                high: displayP,
                low: displayP,
                close: displayP,
              };
              committed.push(nextBar);
              if (committed.length > 2000) {
                committed.splice(0, committed.length - 2000);
              }
              lineSeries.update({ time: nextSec, value: displayP });
              last = nextBar;
              committedNewBar = true;
              catchupGuard += 1;
            }
            subBarFractionRef.current = Math.max(
              0,
              Math.min(0.9999, (nowWall - last.timestampMs) / activeStepMs),
            );
          } else {
            subBarFractionRef.current = 0;
          }

          if (!isUserPannedRef.current) {
            const targetScrollPos = BASE_RIGHT_OFFSET + subBarFractionRef.current;
            lastAppliedScrollPosRef.current = targetScrollPos;
            isApplyingAutoScrollRef.current = true;
            try {
              chart.timeScale().scrollToPosition(targetScrollPos, false);
            } finally {
              isApplyingAutoScrollRef.current = false;
            }
          }
        } else if (
          chartTypeRef.current === 'candle' &&
          committed.length > 0 &&
          displayP > 0
        ) {
          // Smoothly move the active candle body/wick in lockstep with the line & card;
          // candle mode stays horizontally still until a new candle is created.
          subBarFractionRef.current = 0;
          const activeCandle = committed[committed.length - 1];
          const nextHigh = Math.max(activeCandle.high, activeCandle.open, displayP);
          const nextLow = Math.min(activeCandle.low, activeCandle.open, displayP);
          const relChange =
            Math.abs(displayP - activeCandle.close) /
            Math.max(1e-10, activeCandle.close);
          if (
            relChange > 1e-6 ||
            nextHigh !== activeCandle.high ||
            nextLow !== activeCandle.low
          ) {
            activeCandle.close = displayP;
            activeCandle.high = nextHigh;
            activeCandle.low = nextLow;
            isApplyingAutoScrollRef.current = true;
            try {
              candleSeries.update({
                time: activeCandle.time,
                open: activeCandle.open,
                high: activeCandle.high,
                low: activeCandle.low,
                close: activeCandle.close,
              });
            } finally {
              isApplyingAutoScrollRef.current = false;
            }
            committedNewBar = true;
          }
        }

        // 3. Smooth Y-axis scale easing without sudden step jumps
        if (latestVisibleBoundsRef.current) {
          const nextTarget = computeTargetYRange(
            latestVisibleBoundsRef.current.min,
            latestVisibleBoundsRef.current.max,
            timeframeRef.current,
          );
          targetYRangeRef.current = nextTarget;

          if (!animYRangeRef.current) {
            animYRangeRef.current = { ...nextTarget };
          } else {
            const anim = animYRangeRef.current;
            const scaleRate = 5.5;
            const scaleBlend = 1 - Math.exp(-scaleRate * dt);
            const prevMin = anim.minValue;
            const prevMax = anim.maxValue;

            anim.minValue += (nextTarget.minValue - anim.minValue) * scaleBlend;
            anim.maxValue += (nextTarget.maxValue - anim.maxValue) * scaleBlend;

            // Keep live dot cleanly inside visible band even on huge rapid spikes,
            // allowing downward moves to reach right down to the bottom boundary first.
            if (displayP > 0 && Number.isFinite(displayP)) {
              const curSpan = Math.max(1e-10, anim.maxValue - anim.minValue);
              if (displayP > anim.maxValue - curSpan * 0.06) {
                anim.maxValue = displayP + curSpan * 0.06;
              }
              if (displayP < anim.minValue + curSpan * 0.018) {
                anim.minValue = Math.max(0, displayP - curSpan * 0.018);
              }
            }

            const span = Math.max(1e-10, anim.maxValue - anim.minValue);
            const scaleChanged =
              Math.abs(anim.minValue - prevMin) / span > 1e-4 ||
              Math.abs(anim.maxValue - prevMax) / span > 1e-4;

            if (scaleChanged && !committedNewBar && committed.length > 0) {
              const lastBar = committed[committed.length - 1];
              if (chartTypeRef.current === 'line') {
                lineSeries.update({ time: lastBar.time, value: lastBar.close });
              } else {
                candleSeries.update({
                  time: lastBar.time,
                  open: lastBar.open,
                  high: lastBar.high,
                  low: lastBar.low,
                  close: lastBar.close,
                });
              }
            }
          }
        }

        // Keep halo & live tail synced at 60fps
        if (chartTypeRef.current === 'line') {
          lineTipPrimitive.requestRedraw();
        } else {
          candleTipPrimitive.requestRedraw();
        }
      }

      rafId = window.requestAnimationFrame(animateFrame);
    };

    rafId = window.requestAnimationFrame(animateFrame);

    let disposed = false;
    document.fonts?.ready?.then(() => {
      if (!disposed) {
        chart.applyOptions({ layout: { fontFamily: axisFontFamily } });
      }
    });

    return () => {
      disposed = true;
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      tickResizeObserver.disconnect();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleLogicalRange);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      lineSeries.detachPrimitive(lineTipPrimitive);
      candleSeries.detachPrimitive(candleTipPrimitive);
      lineTipPrimitiveRef.current = null;
      candleTipPrimitiveRef.current = null;
      entryPriceLineRef.current = null;
      lineSeriesRef.current = null;
      candleSeriesRef.current = null;
      chartRef.current = null;
      prevSeedMetaRef.current = null;
      targetYRangeRef.current = null;
      animYRangeRef.current = null;
      latestVisibleBoundsRef.current = null;
      chart.remove();
    };
  }, [computeTargetYRange, height, syncBadgeDom]);

  // Reset user pan state and re-enable autoScale when timeframe or chart mode switches.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    isUserPannedRef.current = false;
    lastAppliedScrollPosRef.current = BASE_RIGHT_OFFSET;
    setIsPanned(false);
    chart.applyOptions({
      timeScale: {
        secondsVisible: timeframe === '1m',
      },
    });
    chart.priceScale('right').applyOptions({ autoScale: true });
  }, [timeframe, chartType]);

  // Keep line/candle colors, area refraction gradient & active series visibility synced.
  useEffect(() => {
    const lineColor = isPositive ? CHART_THEME.upColor : CHART_THEME.downColor;
    const topColor = isPositive ? CHART_THEME.upTopColor : CHART_THEME.downTopColor;
    const bottomColor = isPositive ? CHART_THEME.upBottomColor : CHART_THEME.downBottomColor;
    lineSeriesRef.current?.applyOptions({
      lineColor,
      topColor,
      bottomColor,
      crosshairMarkerBorderColor: lineColor,
      visible: chartType === 'line',
    });
    candleSeriesRef.current?.applyOptions({
      visible: chartType === 'candle',
    });
  }, [isPositive, chartType]);

  // Sync incoming prices & handle initial seeding / timeframe switches cleanly.
  useEffect(() => {
    const chart = chartRef.current;
    const lineSeries = lineSeriesRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !lineSeries || !candleSeries) return;

    if (Number.isFinite(currentPrice) && currentPrice > 0) {
      rawTargetPriceRef.current = currentPrice;
      lastTickWallMsRef.current = Date.now();
    }

    const firstTime = seedBars[0]?.time ?? 0;
    const seedKey = `${timeframe}:${chartType}:${resolutionMode}`;
    const prev = prevSeedMetaRef.current;

    const firstTimeMovedUnexpectedly =
      prev !== null &&
      prev.firstTime !== firstTime &&
      (firstTime < prev.firstTime || seedBars.length < 2000);

    const needsFullReseed =
      prev === null ||
      prev.key !== seedKey ||
      firstTimeMovedUnexpectedly ||
      Math.abs(seedBars.length - prev.length) > 4;

    if (needsFullReseed) {
      const cloned = seedBars.map((bar) => ({ ...bar }));
      committedBarsRef.current = cloned;

      const lineData: AreaData<UTCTimestamp>[] = cloned.map((bar) => ({
        time: bar.time,
        value: bar.close,
      }));
      const candleData: CandlestickData<UTCTimestamp>[] = cloned.map((bar) => ({
        time: bar.time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));

      isApplyingAutoScrollRef.current = true;
      try {
        lineSeries.setData(lineData);
        candleSeries.setData(candleData);

        if (cloned.length > 0) {
          const lastBar = cloned[cloned.length - 1];
          if (!(smoothedPriceRef.current > 0)) {
            smoothedPriceRef.current =
              currentPrice > 0 ? currentPrice : lastBar.close;
          }
          const activeStepMs = Math.max(1_000, stepMsRef.current);
          subBarFractionRef.current =
            chartType === 'line'
              ? Math.max(0, Math.min(0.9999, (Date.now() - lastBar.timestampMs) / activeStepMs))
              : 0;

          isUserPannedRef.current = false;
          const pos = BASE_RIGHT_OFFSET + subBarFractionRef.current;
          lastAppliedScrollPosRef.current = pos;
          chart.timeScale().scrollToPosition(pos, false);
          setIsPanned(false);
        }
      } finally {
        isApplyingAutoScrollRef.current = false;
      }

      prevSeedMetaRef.current =
        seedBars.length > 0
          ? { key: seedKey, firstTime, length: seedBars.length }
          : null;
      return;
    }

    // In Candle mode, keep candlesticks smoothed during the active candle and
    // scroll backward ONLY when a brand-new candle bucket is created.
    if (chartType === 'candle' && seedBars.length > 0) {
      const latest = seedBars[seedBars.length - 1];
      const committed = committedBarsRef.current;
      const currentDisplay =
        smoothedPriceRef.current > 0
          ? smoothedPriceRef.current
          : latest.close;

      if (committed.length === 0 || latest.time > committed[committed.length - 1].time) {
        const prevCandle = committed[committed.length - 1];
        const openPrice = prevCandle ? prevCandle.close : latest.open;
        const nextCandle: NormalizedBar = {
          time: latest.time,
          timestampMs: latest.timestampMs,
          open: openPrice,
          high: Math.max(openPrice, currentDisplay),
          low: Math.min(openPrice, currentDisplay),
          close: currentDisplay,
        };
        committed.push(nextCandle);
        if (committed.length > 2000) {
          committed.splice(0, committed.length - 2000);
        }
        isApplyingAutoScrollRef.current = true;
        try {
          candleSeries.update({
            time: nextCandle.time,
            open: nextCandle.open,
            high: nextCandle.high,
            low: nextCandle.low,
            close: nextCandle.close,
          });
          if (!isUserPannedRef.current) {
            lastAppliedScrollPosRef.current = BASE_RIGHT_OFFSET;
            chart.timeScale().scrollToPosition(BASE_RIGHT_OFFSET, false);
          }
        } finally {
          isApplyingAutoScrollRef.current = false;
        }
      }
    }

    prevSeedMetaRef.current = {
      key: seedKey,
      firstTime,
      length: seedBars.length,
    };
  }, [seedBars, resolutionMode, timeframe, chartType, currentPrice]);

  // Render optional entry price line on the active series.
  useEffect(() => {
    const activeSeries =
      chartType === 'line' ? lineSeriesRef.current : candleSeriesRef.current;
    if (!activeSeries) return;

    if (entryPriceLineRef.current) {
      try {
        lineSeriesRef.current?.removePriceLine(entryPriceLineRef.current);
      } catch {
        // ignore if already removed from other series
      }
      try {
        candleSeriesRef.current?.removePriceLine(entryPriceLineRef.current);
      } catch {
        // ignore if already removed from other series
      }
      entryPriceLineRef.current = null;
    }

    if (entryPrice != null && Number.isFinite(entryPrice) && entryPrice > 0) {
      entryPriceLineRef.current = activeSeries.createPriceLine({
        price: entryPrice,
        color: CHART_THEME.entryLineColor,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'ENTRY',
      });
    }
  }, [entryPrice, chartType]);

  const resetView = () => {
    isUserPannedRef.current = false;
    const targetPos =
      BASE_RIGHT_OFFSET +
      (chartTypeRef.current === 'line' ? subBarFractionRef.current : 0);
    lastAppliedScrollPosRef.current = targetPos;
    chartRef.current?.priceScale('right').applyOptions({ autoScale: true });
    chartRef.current?.timeScale().scrollToPosition(targetPos, false);
    setIsPanned(false);
    onPriceHover?.(null, null);
  };

  const badgeBg = isPositive ? CHART_THEME.upBadgeBg : CHART_THEME.downBadgeBg;

  return (
    <div
      ref={containerRef}
      style={{ height, touchAction: 'pan-y' }}
      className="relative w-full min-w-0 max-w-full select-none overflow-hidden bg-[#000000]"
      onDoubleClick={resetView}
    >
      {/* Layer 1: Pure black + small, tight, subtle fading dot-matrix grid */}
      <canvas
        ref={dotCanvasRef}
        style={{ width: '100%', height }}
        className="pointer-events-none absolute inset-0 block max-w-full"
      />

      {/* Layer 1.5: Subtle top and bottom edge brushes; fade gently inward without dark bands. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-20"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.07) 0%, rgba(0,0,0,0.13) 38%, rgba(0,0,0,0.08) 68%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-20"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.07) 0%, rgba(0,0,0,0.13) 38%, rgba(0,0,0,0.08) 68%, rgba(0,0,0,0) 100%)',
          }}
        />
      </div>

      {/* Layer 2: TradingView Lightweight Charts engine (renders line, light glow, dot & axis ticks) */}
      <div
        ref={tvContainerRef}
        style={{ width: '100%', height }}
        className="relative z-[1] w-full min-w-0 max-w-full overflow-hidden"
      />
      {/* Fine custom time-axis ticks; the heavier native marks are disabled. */}
      <canvas
        ref={timeTicksCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[21px] left-0 z-[2] h-[5px] max-w-full"
        style={{ width: '100%', height: 5 }}
      />

      {/* Layer 2.5: Gentle axis-edge brushes; numbers fade only as they approach the outer edges. */}
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
        <div
          className="absolute right-0 top-0 h-16 w-[72px]"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.10) 24%, rgba(0,0,0,0.045) 58%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div
          className="absolute right-0 bottom-0 h-16 w-[72px]"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.10) 24%, rgba(0,0,0,0.045) 58%, rgba(0,0,0,0) 100%)',
          }}
        />
      </div>

      {/* Layer 2.6: Very light top-edge seam blend. */}
      <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-10"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.045) 0%, rgba(0,0,0,0.025) 55%, rgba(0,0,0,0) 100%)',
          }}
        />
      </div>

      {/* Layer 3: Right-axis live-price pill card with clean crisp typography */}
      <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden">
        <div
          ref={badgeRef}
          style={{
            left: 0,
            top: 0,
            opacity: 0,
            backgroundColor: badgeBg,
            color: CHART_THEME.liveBadge.textColor,
            fontFamily: "'Barlow Semi Condensed', -apple-system, BlinkMacSystemFont, sans-serif",
          }}
          className="absolute flex items-center justify-center rounded-full px-1.5 text-[9.5px] font-medium tabular-nums leading-none shadow-[0_2px_10px_rgba(0,0,0,0.55)]"
        />
      </div>

      {/* Empty state */}
      {seedBars.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center font-mono text-[11px] text-white/40">
          Chart data unavailable
        </div>
      )}

      {/* Return to live right edge when panned */}
      {isPanned && (
        <button
          type="button"
          onClick={resetView}
          className="absolute bottom-7 right-[72px] z-[5] rounded border border-white/15 bg-[#111]/90 px-2 py-1 font-mono text-[9px] text-white/70 hover:text-white"
        >
          LIVE
        </button>
      )}
    </div>
  );
};

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
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

interface PriceScale {
  min: number;
  max: number;
}

// Appropriate intervals for chart windows
const TIMEFRAME_INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1H': 60 * 60_000,
  '24H': 24 * 60 * 60_000,
};

const formatBucketTime = (timestamp: number, timeframe: string) => {
  const date = new Date(timestamp);
  if (timeframe === '24H' || timeframe === '1H') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(timeframe === '1m' ? { second: '2-digit' as const } : {}),
  });
};

const niceStep = (rawStep: number) => {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
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

const getNiceTicks = (min: number, max: number, targetCount = 5) => {
  const step = niceStep((max - min) / Math.max(1, targetCount - 1));
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first, guard = 0; value <= max + step * 0.000001 && guard < 20; value += step, guard++) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return ticks;
};

export const DotMatrixChart: React.FC<DotMatrixChartProps> = ({
  currentPrice,
  entryPrice,
  priceHistory,
  isPositive = true,
  timeframe = '24H',
  chartType = 'line',
  onPriceHover,
  height = 340,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState(
    typeof window !== 'undefined' ? Math.min(window.innerWidth, 1200) : 600
  );
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [view, setView] = useState({ end: Number.POSITIVE_INFINITY, count: 60 });
  const [isPanned, setIsPanned] = useState(false);
  const dragRef = useRef<{ x: number; end: number; moved: boolean } | null>(null);
  const scaleRef = useRef<PriceScale | null>(null);
  const pointerRef = useRef<number | null>(null);

  // Each timestamp belongs to one fixed horizontal time slot. All ticks inside
  // that slot update its OHLC values; completed slots remain immutable.
  const points = useMemo<PriceTick[]>(() => {
      const interval = TIMEFRAME_INTERVAL_MS[timeframe] || TIMEFRAME_INTERVAL_MS['24H'];
    const validRaw = (priceHistory || [])
      .filter((point) => Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.time) && point.time > 1_000_000)
      .slice()
      .sort((a, b) => a.time - b.time);
    const buckets = new Map<number, PriceTick>();
    validRaw.forEach((point) => {
      const bucketTime = Math.floor(point.time / interval) * interval;
      const open = Number.isFinite(point.open) && (point.open as number) > 0 ? (point.open as number) : point.price;
      const high = Number.isFinite(point.high) && (point.high as number) > 0 ? (point.high as number) : Math.max(open, point.price);
      const low = Number.isFinite(point.low) && (point.low as number) > 0 ? (point.low as number) : Math.min(open, point.price);
      const close = Number.isFinite(point.close) && (point.close as number) > 0 ? (point.close as number) : point.price;
      const existing = buckets.get(bucketTime);
      if (!existing) {
        buckets.set(bucketTime, {
          timestamp: bucketTime,
          time: formatBucketTime(bucketTime, timeframe),
          price: close, open, high, low,
          volume: Math.max(0, Number(point.volume || 0)),
        });
      } else {
        existing.high = Math.max(existing.high, high);
        existing.low = Math.min(existing.low, low);
        existing.price = close;
        existing.volume += Math.max(0, Number(point.volume || 0));
      }
    });
    return Array.from(buckets.values()).slice(-500);
  }, [timeframe, priceHistory]);


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

  useEffect(() => {
    setView((previous) => ({ ...previous, end: Number.POSITIVE_INFINITY }));
    setIsPanned(false);
    setHoverIndex(null);
  }, [timeframe]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, containerWidth);
    const h = height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Pure black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const padTop = 22;
    const padBottom = 26;
    const padLeft = 14;
    const padRight = 78;
    const plotW = Math.max(1, w - padLeft - padRight);
    const plotH = Math.max(1, h - padTop - padBottom);

    // Subtle fading dot matrix
    const dotSpacing = 16;
    for (let y = 10; y < h - 10; y += dotSpacing) {
      const norm = y / h;
      const alpha = norm < 0.22 ? 0.14 * (norm / 0.22) : norm > 0.78 ? 0.14 * ((1 - norm) / 0.22) : 0.14;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha).toFixed(3)})`;
      for (let x = 10; x < w - 10; x += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (points.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Chart data unavailable', w / 2, h / 2);
      return;
    }

    const endIndex = Number.isFinite(view.end)
      ? Math.min(points.length - 1, Math.max(0, Math.floor(view.end)))
      : points.length - 1;
    const count = Math.max(10, Math.min(points.length, Math.floor(view.count)));
    const startIndex = Math.max(0, endIndex - count + 1);
    const visible = points.slice(startIndex, endIndex + 1);

    // Scale calculation from high/low extremes
    const dataMin = Math.min(...visible.map((p) => p.low));
    const dataMax = Math.max(...visible.map((p) => p.high));
    const dataRange = dataMax - dataMin;
    const minRange = Math.max(Math.abs(dataMax) * 0.005, 0.00000001);
    const fittedRange = Math.max(dataRange, minRange);
    const padding = fittedRange * 0.14;
    const center = (dataMin + dataMax) / 2;
    const target: PriceScale = dataRange > 0
      ? { min: Math.max(0, dataMin - padding), max: dataMax + padding }
      : { min: Math.max(0, center - fittedRange / 2 - padding), max: center + fittedRange / 2 + padding };

    // Scale smoothing
    const previous = scaleRef.current;
    const desiredScale = target;
    if (!previous || !Number.isFinite(previous.min) || !Number.isFinite(previous.max) || (previous.max - previous.min) <= 0) {
      scaleRef.current = target;
    } else {
      scaleRef.current = {
        min: previous.min + (target.min - previous.min) * 0.22,
        max: previous.max + (target.max - previous.max) * 0.22,
      };
    }
    const scale = scaleRef.current;
    const rawScaleRange = scale.max - scale.min;
    const scaleRange = Number.isFinite(rawScaleRange) && rawScaleRange > 0 ? rawScaleRange : 1;

    const getY = (price: number) => {
      if (!Number.isFinite(price) || !Number.isFinite(scale.min) || !Number.isFinite(scaleRange)) {
        return padTop + plotH / 2;
      }
      const y = padTop + plotH - ((price - scale.min) / scaleRange) * plotH;
      return Number.isFinite(y) ? y : padTop + plotH / 2;
    };

    const rightLiveInset = Math.min(3, plotW * 0.012);
    const livePlotW = Math.max(1, plotW - rightLiveInset);

    const slotWidth = livePlotW / count;
    const getSlotX = (index: number) => padLeft + (index + 0.5) * slotWidth;
    const getLineX = (index: number) => getSlotX(index);

    // Nice-number price grid lines & right axis ticks
    const ticks = getNiceTicks(scale.min, scale.max, 5);
    ctx.lineWidth = 1;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    ticks.forEach((tick) => {
      const y = getY(tick);
      if (y < padTop - 2 || y > padTop + plotH + 2) return;
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.fillText(formatPrice(tick), w - 5, y);
    });

    const lineColor = isPositive ? '#B8FF35' : '#FF4057';

    // 1. LINE CHART MODE
    if (chartType === 'line') {
      const drawPath = () => {
        ctx.beginPath();
        visible.forEach((point, index) => {
          const x = getLineX(index);
          const y = getY(point.price);
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            const px = getLineX(index - 1);
            const py = getY(visible[index - 1].price);
            const mid = (px + x) / 2;
            ctx.bezierCurveTo(mid, py, mid, y, x, y);
          }
        });
      };

      if (visible.length > 1) {
        // Glowing Area Gradient
        const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
        areaGrad.addColorStop(0, isPositive ? 'rgba(184,255,53,0.16)' : 'rgba(255,64,87,0.16)');
        areaGrad.addColorStop(0.6, isPositive ? 'rgba(184,255,53,0.025)' : 'rgba(255,64,87,0.025)');
        areaGrad.addColorStop(1, 'rgba(0,0,0,0)');

        drawPath();
        ctx.lineTo(getLineX(visible.length - 1), padTop + plotH);
        ctx.lineTo(getLineX(0), padTop + plotH);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // High-clarity glowing stroke
        ctx.save();
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 4;
        drawPath();
        const strokeGradient = ctx.createLinearGradient(padLeft, 0, padLeft + livePlotW, 0);
        if (isPositive) {
          strokeGradient.addColorStop(0, '#72D91B');
          strokeGradient.addColorStop(0.55, '#B8FF35');
          strokeGradient.addColorStop(1, '#E0FF78');
        } else {
          strokeGradient.addColorStop(0, '#B91C3B');
          strokeGradient.addColorStop(0.55, '#FF4057');
          strokeGradient.addColorStop(1, '#FF8A8A');
        }
        ctx.strokeStyle = strokeGradient;
        ctx.lineWidth = 1.55;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // 2. CANDLESTICK CHART MODE
      const candleWidth = Math.max(1.5, slotWidth * 0.94);

      visible.forEach((candle, index) => {
        const x = getSlotX(index);
        const openY = getY(candle.open);
        const closeY = getY(candle.price);
        const highY = getY(candle.high);
        const lowY = getY(candle.low);
        const rising = candle.price >= candle.open;
        const color = rising ? '#B8FF35' : '#FF4057';

        // High / Low Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();

        // Open / Close Body
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));
        const candleGradient = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyHeight);
        if (rising) {
          candleGradient.addColorStop(0, '#E0FF78');
          candleGradient.addColorStop(1, '#72D91B');
        } else {
          candleGradient.addColorStop(0, '#FF8A8A');
          candleGradient.addColorStop(1, '#B91C3B');
        }
        ctx.fillStyle = candleGradient;
        ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
      });
    }

    // One pinpoint marks the active price. No backward tracker or moving
    // connector is drawn across historical data.
    const latest = visible[visible.length - 1];
    const latestX = getSlotX(visible.length - 1);
    const latestY = getY(latest.price);
    ctx.save();
    ctx.beginPath();
    ctx.arc(latestX, latestY, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.restore();

    const badgeW = 58;
    const badgeH = 17;
    const badgeX = w - badgeW - 4;
    const badgeY = Math.max(padTop - 2, Math.min(padTop + plotH - badgeH + 2, latestY - badgeH / 2));
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatPrice(latest.price), badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

    // Bottom time axis ticks (4-5 labels across the chart width)
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = '8.5px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const timeStep = Math.max(1, Math.floor(visible.length / 4));
    for (let i = 0; i < visible.length; i += timeStep) {
      const tx = chartType === 'line'
        ? getLineX(i)
        : getSlotX(i);
      ctx.fillText(visible[i].time, tx, padTop + plotH + 8);
    }

    // Hover crosshair and tooltip
    if (hoverIndex !== null && hoverIndex >= startIndex && hoverIndex <= endIndex) {
      const localIndex = hoverIndex - startIndex;
      const point = points[hoverIndex];
      const hx = chartType === 'line'
        ? getLineX(localIndex)
        : getSlotX(localIndex);
      const hy = getY(point.price);

      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + plotH);
      ctx.moveTo(padLeft, hy);
      ctx.lineTo(w - padRight, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Time pill at bottom
      ctx.fillStyle = '#18191c';
      ctx.beginPath();
      ctx.roundRect(Math.max(padLeft, Math.min(w - padRight - 54, hx - 27)), padTop + plotH + 4, 54, 18, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(point.time, Math.max(padLeft + 27, Math.min(w - padRight - 27, hx)), padTop + plotH + 13);
    }

  }, [points, view, containerWidth, height, isPositive, hoverIndex, chartType]);

  useEffect(() => {
    draw();
    return undefined;
  }, [draw]);

  const updateHover = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padLeft = 14;
    const padRight = 78;
    const rightLiveInset = Math.min(16, Math.max(1, containerWidth - padLeft - padRight) * 0.06);
    const livePlotW = Math.max(1, containerWidth - padLeft - padRight - rightLiveInset);

    if (x < padLeft || x > containerWidth - padRight) {
      setHoverIndex(null);
      onPriceHover?.(null, null);
      return;
    }
    const endIndex = Number.isFinite(view.end)
      ? Math.min(points.length - 1, Math.max(0, Math.floor(view.end)))
      : points.length - 1;
    const count = Math.max(10, Math.min(points.length, Math.floor(view.count)));
    const startIndex = Math.max(0, endIndex - count + 1);
    const visibleCount = endIndex - startIndex + 1;
    const ratio = Math.max(0, Math.min(1, (x - padLeft) / livePlotW));
    const index = startIndex + Math.round(ratio * Math.max(0, visibleCount - 1));
    const safeIndex = Math.max(0, Math.min(points.length - 1, index));
    setHoverIndex(safeIndex);
    onPriceHover?.(points[safeIndex]?.price ?? null, points[safeIndex]?.time ?? null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerRef.current = event.pointerId;
    dragRef.current = {
      x: event.clientX,
      end: Number.isFinite(view.end) ? view.end : points.length - 1,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag && pointerRef.current === event.pointerId) {
      const delta = event.clientX - drag.x;
      if (Math.abs(delta) > 4) drag.moved = true;
      if (drag.moved) {
        const plotW = Math.max(1, containerWidth - 92);
        const shift = Math.round((-delta / plotW) * Math.max(10, view.count));
        const end = Math.max(10, Math.min(points.length - 1, drag.end + shift));
        setView((previous) => ({ ...previous, end }));
        setIsPanned(end < points.length - 1);
        setHoverIndex(null);
        onPriceHover?.(null, null);
      } else {
        updateHover(event.clientX);
      }
      return;
    }
    updateHover(event.clientX);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerRef.current === event.pointerId) {
      pointerRef.current = null;
      dragRef.current = null;
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.15 : 0.87;
    setView((previous) => {
      const nextCount = Math.max(10, Math.min(Math.max(points.length, 10), Math.round(previous.count * factor)));
      return { ...previous, count: nextCount };
    });
    setIsPanned(true);
  };

  const resetView = () => {
    setView((previous) => ({ ...previous, end: Number.POSITIVE_INFINITY, count: 60 }));
    setIsPanned(false);
    setHoverIndex(null);
    onPriceHover?.(null, null);
  };

  return (
    <div className="relative w-full bg-[#000000] select-none overflow-hidden" ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, touchAction: 'none' }}
        className="w-full cursor-crosshair block"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (!dragRef.current) {
            setHoverIndex(null);
            onPriceHover?.(null, null);
          }
        }}
        onWheel={handleWheel}
        onDoubleClick={resetView}
      />
      {isPanned && (
        <button
          type="button"
          onClick={resetView}
          className="absolute bottom-2 right-[84px] rounded border border-white/10 bg-[#111]/90 px-2 py-1 text-[9px] font-mono text-white/55 hover:text-white"
        >
          LIVE
        </button>
      )}
    </div>
  );
};

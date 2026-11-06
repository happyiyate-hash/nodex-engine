import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { PricePoint } from '../../types';

export interface PriceTick {
  time: string;
  timestamp: number;
  price: number;
}

interface DotMatrixChartProps {
  currentPrice: number;
  entryPrice?: number;
  priceHistory?: PricePoint[];
  isPositive?: boolean;
  timeframe?: string;
  onPriceHover?: (price: number | null, time: string | null) => void;
  height?: number;
}

interface PriceScale {
  min: number;
  max: number;
}

// Each selector is a candle interval, not a rolling look-back window.
const TIMEFRAME_INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1H': 60 * 60_000,
  '24H': 24 * 60 * 60_000,
};

const formatBucketTime = (timestamp: number, timeframe: string) => {
  const date = new Date(timestamp);
  if (timeframe === '24H') {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
  priceHistory,
  isPositive = true,
  timeframe = '24H',
  onPriceHover,
  height = 340,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [view, setView] = useState({ end: Number.POSITIVE_INFINITY, count: 60 });
  const [isPanned, setIsPanned] = useState(false);
  const dragRef = useRef<{ x: number; end: number; moved: boolean } | null>(null);
  const scaleRef = useRef<PriceScale | null>(null);
  const animationRef = useRef<number | null>(null);
  const pointerRef = useRef<number | null>(null);

  const points = useMemo<PriceTick[]>(() => {
    const interval = TIMEFRAME_INTERVAL_MS[timeframe] || TIMEFRAME_INTERVAL_MS['24H'];
    const raw = (priceHistory || [])
      .filter((point) => Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.time))
      .slice()
      .sort((a, b) => a.time - b.time);

    // Add the latest quote to the raw tape. It is folded into the active
    // interval below, so a price update changes the current row instead of
    // creating a new timestamp/row for every tick.
    const now = Date.now();
    const lastRaw = raw[raw.length - 1];
    if (currentPrice > 0 && (!lastRaw || lastRaw.price !== currentPrice || Math.floor(lastRaw.time / interval) !== Math.floor(now / interval))) {
      raw.push({ time: now, price: currentPrice, volume: 0 });
    }

    const buckets = new Map<number, PriceTick & { open: number; high: number; low: number; volume: number }>();
    raw.forEach((point) => {
      const bucketTime = Math.floor(point.time / interval) * interval;
      const open = Number.isFinite(point.open) && (point.open as number) > 0 ? point.open as number : point.price;
      const high = Number.isFinite(point.high) && (point.high as number) > 0 ? point.high as number : point.price;
      const low = Number.isFinite(point.low) && (point.low as number) > 0 ? point.low as number : point.price;
      const close = Number.isFinite(point.close) && (point.close as number) > 0 ? point.close as number : point.price;
      const existing = buckets.get(bucketTime);
      if (!existing) {
        buckets.set(bucketTime, {
          timestamp: bucketTime,
          time: formatBucketTime(bucketTime, timeframe),
          price: close,
          open,
          high,
          low,
          volume: Number(point.volume || 0),
        });
        return;
      }
      existing.high = Math.max(existing.high, high);
      existing.low = Math.min(existing.low, low);
      existing.price = close;
      existing.volume += Number(point.volume || 0);
    });

    // One plotted point per interval. The active bucket's close is replaced
    // as quotes arrive; a fresh row is created only when the interval rolls.
    return Array.from(buckets.values()).slice(-300);
  }, [currentPrice, timeframe, priceHistory]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // A timeframe change returns to live-follow. Panning pauses that follow mode.
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
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const padTop = 35;
    const padBottom = 35;
    const padLeft = 12;
    const padRight = 76;
    const plotW = Math.max(1, w - padLeft - padRight);
    const plotH = Math.max(1, h - padTop - padBottom);

    const dotSpacing = 16;
    for (let y = 8; y < h; y += dotSpacing) {
      const norm = y / h;
      const alpha = norm < 0.25 ? 0.12 * (norm / 0.25) : norm > 0.75 ? 0.12 * ((1 - norm) / 0.25) : 0.12;
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, alpha).toFixed(3)})`;
      for (let x = 8; x < w; x += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (points.length === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for market data', w / 2, h / 2);
      return;
    }

    const endIndex = Number.isFinite(view.end) ? Math.min(points.length - 1, Math.max(0, Math.floor(view.end))) : points.length - 1;
    const count = Math.max(2, Math.min(points.length, Math.floor(view.count)));
    const startIndex = Math.max(0, endIndex - count + 1);
    const visible = points.slice(startIndex, endIndex + 1);
    const prices = visible.map((point) => point.price);
    const dataMin = Math.min(...prices);
    const dataMax = Math.max(...prices);
    const dataRange = dataMax - dataMin;
    // Fit the complete visible price window on every update. A minimum span keeps
    // quiet/flat markets readable, while real spikes expand the same shared scale.
    const minimumRange = Math.max(Math.abs(dataMax) * 0.002, Number.EPSILON);
    const fittedRange = Math.max(dataRange, minimumRange);
    const padding = fittedRange * 0.12;
    const center = (dataMin + dataMax) / 2;
    const target: PriceScale = dataRange > 0
      ? { min: dataMin - padding, max: dataMax + padding }
      : { min: center - fittedRange / 2 - padding, max: center + fittedRange / 2 + padding };

    // One animated scale maps every historical point, axis tick, grid line,
    // cursor and live-price marker. When the range expands, older movement is
    // naturally compressed; a sharp reversal compresses the previous highs.
    const previous = scaleRef.current;
    const desiredScale = target;
    if (!previous || !Number.isFinite(previous.min) || !Number.isFinite(previous.max)) {
      scaleRef.current = target;
    } else {
      scaleRef.current = {
        min: previous.min + (target.min - previous.min) * 0.18,
        max: previous.max + (target.max - previous.max) * 0.18,
      };
    }
    const scale = scaleRef.current;
    const scaleRange = Math.max(scale.max - scale.min, Number.EPSILON);
    const getY = (price: number) => padTop + plotH - ((price - scale.min) / scaleRange) * plotH;
    const getX = (index: number) => padLeft + (visible.length <= 1 ? 1 : index / (visible.length - 1)) * plotW;

    // Nice-number price axis; ticks are generated from the active scale range.
    const ticks = getNiceTicks(scale.min, scale.max, 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ticks.forEach((tick) => {
      const y = getY(tick);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();
      ctx.fillText(formatPrice(tick), w - 5, y);
    });

    const lineColor = isPositive ? '#10B981' : '#EF4444';
    const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    areaGrad.addColorStop(0, isPositive ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.22)');
    areaGrad.addColorStop(0.55, isPositive ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)');
    areaGrad.addColorStop(1, 'rgba(0,0,0,0)');

    const drawPath = () => {
      ctx.beginPath();
      visible.forEach((point, index) => {
        const x = getX(index);
        const y = getY(point.price);
        if (index === 0) ctx.moveTo(x, y);
        else {
          const previousPoint = visible[index - 1];
          const px = getX(index - 1);
          const py = getY(previousPoint.price);
          const mid = (px + x) / 2;
          ctx.bezierCurveTo(mid, py, mid, y, x, y);
        }
      });
    };

    if (visible.length > 1) {
      drawPath();
      ctx.lineTo(getX(visible.length - 1), padTop + plotH);
      ctx.lineTo(getX(0), padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = areaGrad;
      ctx.fill();
    }

    drawPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    const latest = visible[visible.length - 1];
    const latestX = getX(visible.length - 1);
    const latestY = getY(latest.price);
    ctx.strokeStyle = isPositive ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, latestY);
    ctx.lineTo(latestX, latestY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = isPositive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isPositive ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isPositive ? '#34D399' : '#F87171';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    const badgeW = 58;
    const badgeH = 18;
    const badgeX = w - badgeW - 3;
    const badgeY = Math.max(padTop - 2, Math.min(padTop + plotH - badgeH + 2, latestY - badgeH / 2));
    ctx.strokeStyle = lineColor;
    ctx.beginPath();
    ctx.moveTo(latestX, latestY);
    ctx.lineTo(badgeX, badgeY + badgeH / 2);
    ctx.stroke();
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(formatPrice(latest.price), badgeX + badgeW / 2, badgeY + 12);

    if (hoverIndex !== null && hoverIndex >= startIndex && hoverIndex <= endIndex) {
      const localIndex = hoverIndex - startIndex;
      const point = points[hoverIndex];
      const hx = getX(localIndex);
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
      ctx.fillStyle = '#18191c';
      ctx.beginPath();
      ctx.roundRect(Math.max(padLeft, Math.min(w - padRight - 52, hx - 26)), padTop + plotH + 4, 52, 18, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(point.time, Math.max(padLeft + 26, Math.min(w - padRight - 26, hx)), padTop + plotH + 16);
    }

    // Continue easing until the interpolated scale reaches its target.
    const desiredRange = Math.max(desiredScale.max - desiredScale.min, Number.EPSILON);
    if (Math.abs(scale.min - desiredScale.min) > desiredRange * 0.0005 ||
        Math.abs(scale.max - desiredScale.max) > desiredRange * 0.0005) {
      animationRef.current = requestAnimationFrame(draw);
    } else {
      scaleRef.current = desiredScale;
    }
  }, [points, view, containerWidth, height, isPositive, hoverIndex]);

  useEffect(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    draw();
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    };
  }, [draw]);

  const updateHover = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padLeft = 12;
    const padRight = 76;
    const plotW = Math.max(1, containerWidth - padLeft - padRight);
    if (x < padLeft || x > containerWidth - padRight) {
      setHoverIndex(null);
      onPriceHover?.(null, null);
      return;
    }
    const endIndex = Number.isFinite(view.end) ? Math.min(points.length - 1, Math.max(0, Math.floor(view.end))) : points.length - 1;
    const count = Math.max(2, Math.min(points.length, Math.floor(view.count)));
    const startIndex = Math.max(0, endIndex - count + 1);
    const visibleCount = endIndex - startIndex + 1;
    const ratio = Math.max(0, Math.min(1, (x - padLeft) / plotW));
    const index = startIndex + Math.round(ratio * Math.max(0, visibleCount - 1));
    setHoverIndex(index);
    onPriceHover?.(points[index]?.price ?? null, points[index]?.time ?? null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerRef.current = event.pointerId;
    dragRef.current = { x: event.clientX, end: Number.isFinite(view.end) ? view.end : points.length - 1, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag && pointerRef.current === event.pointerId) {
      const delta = event.clientX - drag.x;
      if (Math.abs(delta) > 4) drag.moved = true;
      if (drag.moved) {
        const plotW = Math.max(1, containerWidth - 88);
        const shift = Math.round((-delta / plotW) * Math.max(2, view.count));
        const end = Math.max(1, Math.min(points.length - 1, drag.end + shift));
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
      const nextCount = Math.max(8, Math.min(Math.max(points.length, 8), Math.round(previous.count * factor)));
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
        style={{ width: containerWidth, height, touchAction: 'none' }}
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
          className="absolute bottom-2 right-[78px] rounded border border-white/10 bg-[#111]/90 px-2 py-1 text-[9px] font-mono text-white/55"
        >
          LIVE
        </button>
      )}
    </div>
  );
};

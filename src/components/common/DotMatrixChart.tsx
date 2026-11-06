import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { PricePoint } from '../../types';

export interface PriceTick {
  time: string;
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

export const DotMatrixChart: React.FC<DotMatrixChartProps> = ({
  currentPrice,
  entryPrice,
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

  // Generate smooth price points leading up to current price
  const points = useMemo<PriceTick[]>(() => {
    const count = 50;
    const now = Date.now();
    const stepMs = timeframe === '1m' ? 1200 : timeframe === '5m' ? 6000 : timeframe === '15m' ? 18000 : timeframe === '1H' ? 72000 : 1728000;
    const historical = (priceHistory || []).filter((point) => Number.isFinite(point.price) && point.price > 0).slice(-count);
    if (historical.length > 0) {
      const livePoints = historical.map((point) => ({
        time: new Date(point.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        price: point.price,
      }));
      const latest = livePoints[livePoints.length - 1];
      if (currentPrice > 0 && latest.price !== currentPrice) {
        livePoints.push({
          time: new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          price: currentPrice,
        });
      }
      if (livePoints.length === 1) {
        livePoints.push({ ...livePoints[0] });
      }
      return livePoints.slice(-count);
    }

    const result: PriceTick[] = [];

    const base = entryPrice ? entryPrice * 0.94 : currentPrice * 0.88;
    const target = currentPrice;

    for (let i = 0; i < count; i++) {
      const progress = i / (count - 1);
      // Realistic trending curve
      const trend = base + (target - base) * Math.pow(progress, 0.85);
      const wave1 = Math.sin(i * 0.35) * currentPrice * 0.018;
      const wave2 = Math.cos(i * 0.7) * currentPrice * 0.012;
      const val = i === count - 1 ? target : Math.max(base * 0.8, trend + wave1 + wave2);

      const d = new Date(now - (count - 1 - i) * stepMs);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      result.push({
        time: timeStr,
        price: val,
      });
    }

    return result;
  }, [currentPrice, entryPrice, timeframe, priceHistory]);

  // Handle responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      if (el) setContainerWidth(el.clientWidth);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Main Canvas Rendering
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth;
    const h = height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // 1. Pure Black Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    const padTop = 35;
    const padBottom = 35;
    const padLeft = 12;
    const padRight = 76; // reserved right gutter for compact price labels
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Price scaling
    const prices = points.map((p) => p.price);
    if (entryPrice) prices.push(entryPrice);
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;
    minPrice -= range * 0.06;
    maxPrice += range * 0.06;
    const effRange = maxPrice - minPrice;

    const getY = (price: number) => padTop + plotH - ((price - minPrice) / effRange) * plotH;
    const getX = (idx: number) => padLeft + (idx / (points.length - 1)) * plotW;

    // 2. Dot Matrix Background that fades out at top and bottom
    const dotSpacing = 16;
    const rows = Math.floor(h / dotSpacing);
    const cols = Math.floor(w / dotSpacing);

    for (let r = 0; r < rows; r++) {
      const dotY = r * dotSpacing + 8;
      // Fade out at top (< 25% height) and bottom (> 75% height)
      const normY = dotY / h;
      let alpha = 0.12;
      if (normY < 0.25) {
        alpha = 0.12 * (normY / 0.25);
      } else if (normY > 0.75) {
        alpha = 0.12 * ((1 - normY) / 0.25);
      }

      ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, alpha).toFixed(3)})`;
      for (let c = 0; c < cols; c++) {
        const dotX = c * dotSpacing + 8;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3. Subtle Horizontal Price Guidelines
    const numGuides = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;
    for (let g = 1; g <= numGuides; g++) {
      const guidePrice = minPrice + (effRange * g) / (numGuides + 1);
      const gy = getY(guidePrice);
      ctx.beginPath();
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(w - padRight, gy);
      ctx.stroke();
    }

    // 4. Subtle Area Gradient below the line
    const areaGrad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
    if (isPositive) {
      areaGrad.addColorStop(0, 'rgba(16, 185, 129, 0.22)');
      areaGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.05)');
      areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    } else {
      areaGrad.addColorStop(0, 'rgba(239, 68, 68, 0.22)');
      areaGrad.addColorStop(0.5, 'rgba(239, 68, 68, 0.05)');
      areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    }

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0].price));
    for (let i = 1; i < points.length; i++) {
      const p0 = { x: getX(i - 1), y: getY(points[i - 1].price) };
      const p1 = { x: getX(i), y: getY(points[i].price) };
      const mx = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(mx, p0.y, mx, p1.y, p1.x, p1.y);
    }
    ctx.lineTo(getX(points.length - 1), padTop + plotH);
    ctx.lineTo(getX(0), padTop + plotH);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // 5. Glowing Chart Trajectory Line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0].price));
    for (let i = 1; i < points.length; i++) {
      const p0 = { x: getX(i - 1), y: getY(points[i - 1].price) };
      const p1 = { x: getX(i), y: getY(points[i].price) };
      const mx = (p0.x + p1.x) / 2;
      ctx.bezierCurveTo(mx, p0.y, mx, p1.y, p1.x, p1.y);
    }
    ctx.strokeStyle = isPositive ? '#10B981' : '#EF4444';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 6. Latest Point Coordinates (The active point chasing the target)
    const latestIdx = points.length - 1;
    const latestX = getX(latestIdx);
    const latestY = getY(points[latestIdx].price);

    // 7. Straight Tracker Line from the Circle to the Back!
    // "you put another straight line to the back from that circle straight line to the back"
    ctx.strokeStyle = isPositive ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, latestY);
    ctx.lineTo(latestX, latestY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 8. The Circle (Bead) with pulsing radar rings
    // Outer radar wave
    ctx.fillStyle = isPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 7, 0, Math.PI * 2);
    ctx.fill();

    // Mid halo
    ctx.fillStyle = isPositive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Solid core bead
    ctx.fillStyle = isPositive ? '#34D399' : '#F87171';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 9. Right-side price scale. Keep labels inside the reserved gutter.
    const formatPrice = (price: number) => price < 0.001
      ? `${price.toFixed(6)}`
      : price < 1
      ? `${price.toFixed(4)}`
      : `${price.toFixed(2)}`;

    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    for (let tick = 0; tick <= 4; tick++) {
      const value = maxPrice - (effRange * tick) / 4;
      const y = padTop + (plotH * tick) / 4;
      if (Math.abs(y - latestY) > 13) {
        ctx.fillText(formatPrice(value), w - 5, y);
      }
    }

    // Compact live-price tag aligned with the latest chart point.
    const badgeW = 58;
    const badgeH = 18;
    const badgeX = w - badgeW - 3;
    const badgeY = Math.max(padTop - 2, Math.min(padTop + plotH - badgeH + 2, latestY - badgeH / 2));

    ctx.strokeStyle = isPositive ? '#10B981' : '#EF4444';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(latestX, latestY);
    ctx.lineTo(badgeX, badgeY + badgeH / 2);
    ctx.stroke();

    ctx.fillStyle = isPositive ? '#10B981' : '#EF4444';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(formatPrice(currentPrice), badgeX + badgeW / 2, badgeY + 12);

    // 10. Interactive Scrub Crosshair (Touch/Mouse)
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < points.length) {
      const pt = points[hoverIndex];
      const hx = getX(hoverIndex);
      const hy = getY(pt.price);

      // Vertical guide
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + plotH);
      ctx.stroke();

      // Horizontal guide
      ctx.beginPath();
      ctx.moveTo(padLeft, hy);
      ctx.lineTo(w - padRight, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Active point circle
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Hover Time pill at bottom
      ctx.fillStyle = '#18191c';
      ctx.beginPath();
      ctx.roundRect(hx - 26, padTop + plotH + 4, 52, 18, 4);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pt.time, hx, padTop + plotH + 16);
    }
  }, [points, containerWidth, height, isPositive, currentPrice, entryPrice, hoverIndex]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handlePointer = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padLeft = 12;
    const padRight = 76;
    const plotW = containerWidth - padLeft - padRight;

    if (x < padLeft || x > containerWidth - padRight) {
      setHoverIndex(null);
      if (onPriceHover) onPriceHover(null, null);
      return;
    }

    const ratio = Math.max(0, Math.min(1, (x - padLeft) / plotW));
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIndex(idx);

    if (onPriceHover && points[idx]) {
      onPriceHover(points[idx].price, points[idx].time);
    }
  };

  const handlePointerEnd = () => {
    setHoverIndex(null);
    if (onPriceHover) onPriceHover(null, null);
  };

  return (
    <div className="relative w-full bg-[#000000] select-none overflow-hidden" ref={containerRef}>
      <canvas
        ref={canvasRef}
        style={{ width: containerWidth, height }}
        className="w-full touch-none cursor-crosshair block"
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={handlePointerEnd}
        onTouchStart={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointer(e.touches[0].clientX);
        }}
        onTouchEnd={handlePointerEnd}
      />
    </div>
  );
};

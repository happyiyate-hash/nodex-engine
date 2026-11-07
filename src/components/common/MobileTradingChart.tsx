import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';

export interface CandleDataPoint {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MobileTradingChartProps {
  symbol: string;
  currentPrice: number;
  data?: CandleDataPoint[];
  entryPrice?: number;
  isPositive?: boolean;
  timeframe?: string;
  onPriceHover?: (price: number | null, time: string | null) => void;
  height?: number;
}

export const MobileTradingChart: React.FC<MobileTradingChartProps> = ({
  symbol,
  currentPrice,
  data,
  entryPrice,
  isPositive = true,
  timeframe = '24H',
  onPriceHover,
  height = 360,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [chartType, setChartType] = useState<'area' | 'candles'>('area');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);

  // Chart history must come from the backend; no local price path is generated.
  const candles = useMemo<CandleDataPoint[]>(() => (data || [])
    .filter((point) => Number.isFinite(point.close) && point.close > 0)
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp), [data]);



  // Responsive width observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      if (el) setContainerWidth(el.clientWidth);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Canvas drawing routine
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = containerWidth;
    const h = height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Padding
    const padTop = 30;
    const padBottom = 40;
    const padLeft = 12;
    const padRight = 65; // room for price scale
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBottom;

    // Min & Max prices
    const prices = candles.flatMap((c) => [c.low, c.high]);
    if (entryPrice) prices.push(entryPrice);
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;
    minPrice -= range * 0.05;
    maxPrice += range * 0.05;
    const effectiveRange = maxPrice - minPrice;

    const getY = (val: number) => padTop + plotH - ((val - minPrice) / effectiveRange) * plotH;
    const getX = (index: number) => padLeft + (index / (candles.length - 1)) * plotW;

    // 1. Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const priceAtLine = minPrice + (effectiveRange * i) / gridSteps;
      const y = getY(priceAtLine);

      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - padRight, y);
      ctx.stroke();

      // Price scale text
      ctx.setLineDash([]);
      ctx.fillStyle = '#71717a';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        priceAtLine < 0.001 ? `$${priceAtLine.toFixed(6)}` : priceAtLine < 1 ? `$${priceAtLine.toFixed(4)}` : `$${priceAtLine.toFixed(2)}`,
        w - padRight + 8,
        y + 3
      );
      ctx.setLineDash([4, 4]);
    }
    ctx.setLineDash([]);

    // 2. Volume Bars at the bottom
    const maxVol = Math.max(...candles.map((c) => c.volume));
    const volHeightMax = plotH * 0.22;
    const barWidth = Math.max(2, (plotW / candles.length) * 0.65);

    candles.forEach((c, idx) => {
      const x = getX(idx);
      const isUp = c.close >= c.open;
      const volH = (c.volume / maxVol) * volHeightMax;
      const volY = padTop + plotH - volH;

      ctx.fillStyle = isUp ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(x - barWidth / 2, volY, barWidth, volH);
    });

    // 3. Entry Price Horizontal Line (if held)
    if (entryPrice && entryPrice >= minPrice && entryPrice <= maxPrice) {
      const entryY = getY(entryPrice);
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(padLeft, entryY);
      ctx.lineTo(w - padRight, entryY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Badge
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(w - padRight + 2, entryY - 8, 48, 16);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ENTRY', w - padRight + 26, entryY + 4);
    }

    // 4. Main Chart Rendering: Area Line or Candlesticks
    if (chartType === 'area') {
      // Area Gradient Fill
      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
      if (isPositive) {
        grad.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
        grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.05)');
        grad.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
      } else {
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
        grad.addColorStop(0.7, 'rgba(239, 68, 68, 0.05)');
        grad.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
      }

      ctx.beginPath();
      ctx.moveTo(getX(0), getY(candles[0].close));
      for (let i = 1; i < candles.length; i++) {
        const prevX = getX(i - 1);
        const prevY = getY(candles[i - 1].close);
        const curX = getX(i);
        const curY = getY(candles[i].close);
        const midX = (prevX + curX) / 2;
        ctx.bezierCurveTo(midX, prevY, midX, curY, curX, curY);
      }
      ctx.lineTo(getX(candles.length - 1), padTop + plotH);
      ctx.lineTo(getX(0), padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Smooth Stroke Line
      ctx.beginPath();
      ctx.moveTo(getX(0), getY(candles[0].close));
      for (let i = 1; i < candles.length; i++) {
        const prevX = getX(i - 1);
        const prevY = getY(candles[i - 1].close);
        const curX = getX(i);
        const curY = getY(candles[i].close);
        const midX = (prevX + curX) / 2;
        ctx.bezierCurveTo(midX, prevY, midX, curY, curX, curY);
      }
      ctx.strokeStyle = isPositive ? '#10B981' : '#EF4444';
      ctx.lineWidth = 2.2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    } else {
      // Candlesticks Mode
      candles.forEach((c, idx) => {
        const x = getX(idx);
        const isUp = c.close >= c.open;
        const color = isUp ? '#10B981' : '#EF4444';

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x, getY(c.high));
        ctx.lineTo(x, getY(c.low));
        ctx.stroke();

        // Body
        const bodyTop = getY(Math.max(c.open, c.close));
        const bodyBottom = getY(Math.min(c.open, c.close));
        const bodyH = Math.max(2, bodyBottom - bodyTop);

        ctx.fillStyle = color;
        ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyH);
      });
    }

    // 5. Crosshair when hovering / touching
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < candles.length) {
      const pt = candles[hoverIndex];
      const hx = getX(hoverIndex);
      const hy = getY(pt.close);

      // Vertical crosshair
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, padTop + plotH);
      ctx.stroke();

      // Horizontal crosshair
      ctx.beginPath();
      ctx.moveTo(padLeft, hy);
      ctx.lineTo(w - padRight, hy);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point circle
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Hover Price badge on right
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(w - padRight + 2, hy - 9, 60, 18);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(
        pt.close < 0.001 ? `$${pt.close.toFixed(6)}` : pt.close < 1 ? `$${pt.close.toFixed(4)}` : `$${pt.close.toFixed(2)}`,
        w - padRight + 6,
        hy + 4
      );

      // Hover Time badge at bottom
      ctx.fillStyle = '#18191c';
      ctx.fillRect(hx - 24, padTop + plotH + 4, 48, 16);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.strokeRect(hx - 24, padTop + plotH + 4, 48, 16);
      ctx.fillStyle = '#d4d4d8';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pt.time, hx, padTop + plotH + 16);
    } else {
      // Time labels at bottom
      ctx.fillStyle = '#71717a';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      const timeStep = Math.max(1, Math.floor(candles.length / 5));
      for (let i = 0; i < candles.length; i += timeStep) {
        ctx.fillText(candles[i].time, getX(i), padTop + plotH + 18);
      }
    }
  }, [candles, containerWidth, height, chartType, hoverIndex, isPositive, entryPrice]);

  useEffect(() => {
    drawChart();
  }, [drawChart]);

  // Touch and Mouse Scrub Handlers
  const handlePointerMove = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padLeft = 12;
    const padRight = 65;
    const plotW = containerWidth - padLeft - padRight;

    if (x < padLeft || x > containerWidth - padRight) {
      setHoverIndex(null);
      if (onPriceHover) onPriceHover(null, null);
      return;
    }

    const ratio = Math.max(0, Math.min(1, (x - padLeft) / plotW));
    const index = Math.round(ratio * (candles.length - 1));
    setHoverIndex(index);

    if (onPriceHover && candles[index]) {
      onPriceHover(candles[index].close, candles[index].time);
    }
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
    if (onPriceHover) onPriceHover(null, null);
  };

  // Coordinates for the signature Pump.fun pulse beacon dot at latest candle
  const latestDotPosition = useMemo(() => {
    if (candles.length === 0) return null;
    const padTop = 30;
    const padBottom = 40;
    const padLeft = 12;
    const padRight = 65;
    const plotW = containerWidth - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const prices = candles.flatMap((c) => [c.low, c.high]);
    if (entryPrice) prices.push(entryPrice);
    let minPrice = Math.min(...prices);
    let maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;
    minPrice -= range * 0.05;
    maxPrice += range * 0.05;
    const effectiveRange = maxPrice - minPrice;

    const latest = candles[candles.length - 1];
    const x = padLeft + plotW;
    const y = padTop + plotH - ((latest.close - minPrice) / effectiveRange) * plotH;

    return { x, y };
  }, [candles, containerWidth, height, entryPrice]);

  return (
    <div className="relative w-full select-none" ref={containerRef}>
      {/* Chart Type Toggles (Area vs Candles) */}
      <div className="absolute top-2 left-3 z-20 flex items-center gap-1 bg-[#121316]/90 backdrop-blur-md p-0.5 rounded-lg border border-white/10 text-[10px] font-mono">
        <button
          onClick={() => setChartType('area')}
          className={`px-2 py-0.5 rounded transition-colors ${
            chartType === 'area' ? 'bg-[#27272a] text-white font-medium' : 'text-[#71717a] hover:text-white'
          }`}
        >
          Line
        </button>
        <button
          onClick={() => setChartType('candles')}
          className={`px-2 py-0.5 rounded transition-colors ${
            chartType === 'candles' ? 'bg-[#27272a] text-white font-medium' : 'text-[#71717a] hover:text-white'
          }`}
        >
          Candles
        </button>
      </div>

      {/* Canvas draws only backend-provided candle history. */}
      <canvas
        ref={canvasRef}
        style={{ width: containerWidth, height }}
        className="w-full touch-none cursor-crosshair block"
        onMouseMove={(e) => handlePointerMove(e.clientX)}
        onMouseLeave={handlePointerLeave}
        onTouchStart={(e) => {
          if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
        }}
        onTouchMove={(e) => {
          if (e.touches[0]) handlePointerMove(e.touches[0].clientX);
        }}
        onTouchEnd={handlePointerLeave}
      />
      {candles.length === 0 && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-white/40">Waiting for backend chart data…</div>}

      {/* Static latest-price marker */}
      {hoverIndex === null && latestDotPosition && latestDotPosition.x > 0 && latestDotPosition.y > 0 && (
        <div
          className="absolute pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2"
          style={{ left: latestDotPosition.x, top: latestDotPosition.y }}
        >
          {/* Glowing blur halo */}
          <span
            className={`absolute -inset-1 rounded-full blur-[3px] opacity-90 ${
              isPositive ? 'bg-emerald-400 shadow-[0_0_12px_#10b981]' : 'bg-red-400 shadow-[0_0_12px_#ef4444]'
            }`}
          />
          {/* Core bright dot */}
          <span
            className={`relative block w-2.5 h-2.5 rounded-full ring-2 ring-[#080808] ${
              isPositive ? 'bg-emerald-300' : 'bg-red-300'
            }`}
          />
        </div>
      )}
    </div>
  );
};

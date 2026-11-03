import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';

interface ChartDataPoint {
  time: string | number;
  value: number;
}

interface TradingChartProps {
  data: ChartDataPoint[];
  height?: number;
  color?: string;
  isPositive?: boolean;
  valuePrefix?: string;
  showTimeScale?: boolean;
  showLivePulseDot?: boolean; // Pump.fun style live blinking dot
}

export const TradingChart: React.FC<TradingChartProps> = ({
  data,
  height = 340,
  color = '#22c55e',
  isPositive = true,
  valuePrefix = '$',
  showTimeScale = true,
  showLivePulseDot = true,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const [pulseDotPos, setPulseDotPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const lineColor = isPositive ? '#22c55e' : '#ef4444';
    const topFillColor = isPositive ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.28)';
    const bottomFillColor = 'rgba(7, 7, 7, 0.0)';

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#737373',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)', style: 1 },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)', style: 1 },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(255, 255, 255, 0.15)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#171717',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.15)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#171717',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.06)',
        visible: showTimeScale,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
    });

    let areaSeries: any;
    try {
      if (typeof (chart as any).addAreaSeries === 'function') {
        areaSeries = (chart as any).addAreaSeries({
          lineColor: lineColor,
          topColor: topFillColor,
          bottomColor: bottomFillColor,
          lineWidth: 2.5,
          priceFormat: {
            type: 'custom',
            formatter: (price: number) => {
              if (price < 0.01) return `${valuePrefix}${price.toFixed(6)}`;
              if (price < 1) return `${valuePrefix}${price.toFixed(4)}`;
              return `${valuePrefix}${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            },
          },
        });
      }
    } catch {
      // Fallback
    }

    if (areaSeries && data.length > 0) {
      try {
        areaSeries.setData(data);
        chart.timeScale().fitContent();
      } catch (err) {
        console.warn('Chart setData error:', err);
      }
    }

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    // Pump.fun style: calculate and position the live price pulse dot
    const updatePulseDot = () => {
      if (!chart || !areaSeries || data.length === 0) return;
      try {
        const latest = data[data.length - 1];
        const y = areaSeries.priceToCoordinate(latest.value);
        const x = chart.timeScale().timeToCoordinate(latest.time as any);
        if (x !== null && y !== null && !isNaN(x) && !isNaN(y)) {
          setPulseDotPos({ x, y });
        } else {
          // If time scale coordinate isn't ready, anchor near right edge
          if (chartContainerRef.current && y !== null && !isNaN(y)) {
            setPulseDotPos({ x: chartContainerRef.current.clientWidth - 55, y });
          }
        }
      } catch {
        // ignore
      }
    };

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: height,
        });
        setTimeout(updatePulseDot, 60);
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    // Small delay to let canvas layout settle for pulse dot coordinate
    const timer = setTimeout(updatePulseDot, 120);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height, isPositive, color, valuePrefix, showTimeScale]);

  return (
    <div className="relative w-full overflow-hidden select-none" style={{ height }}>
      {/* Lightweight-charts full-width canvas */}
      <div ref={chartContainerRef} className="w-full h-full" />

      {/* Pump.fun signature LIVE PULSING BEACON DOT at the latest price point */}
      {showLivePulseDot && pulseDotPos && pulseDotPos.x > 0 && pulseDotPos.y > 0 && (
        <div
          className="absolute pointer-events-none z-20 -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
          style={{ left: pulseDotPos.x, top: pulseDotPos.y }}
        >
          {/* Radar ping ring */}
          <span
            className={`absolute -inset-2 rounded-full animate-ping opacity-75 ${
              isPositive ? 'bg-emerald-400' : 'bg-red-400'
            }`}
          />
          {/* Outer glowing halo */}
          <span
            className={`absolute -inset-1 rounded-full blur-[2px] opacity-90 ${
              isPositive ? 'bg-emerald-400 shadow-[0_0_12px_#22c55e]' : 'bg-red-400 shadow-[0_0_12px_#ef4444]'
            }`}
          />
          {/* Core solid bright beacon dot */}
          <span
            className={`relative block w-2.5 h-2.5 rounded-full ring-2 ring-black ${
              isPositive ? 'bg-emerald-300' : 'bg-red-300'
            }`}
          />
        </div>
      )}
    </div>
  );
};

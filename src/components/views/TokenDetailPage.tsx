import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AreaSeries, ColorType, createChart, LineStyle, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { useTerminal } from '../../context/TerminalContext';
import type { PricePoint } from '../../types';

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: value > 1 ? 2 : 6,
}).format(value);

const quantity = (value: number) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
}).format(value);

const TokenPriceChart: React.FC<{ history: PricePoint[]; entryPrice?: number }> = ({ history, entryPrice }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const chartData = useMemo(() => history
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price) && point.price > 0)
    .map((point) => ({
      time: Math.floor(point.time > 1_000_000_000_000 ? point.time / 1000 : point.time) as UTCTimestamp,
      value: point.price,
    }))
    .sort((a, b) => Number(a.time) - Number(b.time))
    .filter((point, index, rows) => index === 0 || point.time > rows[index - 1].time), [history]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || chartData.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 224,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: '#080808' },
        textColor: 'rgba(220,220,220,0.56)',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.035)' },
        horzLines: { color: 'rgba(255,255,255,0.055)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
      },
      crosshair: { vertLine: { color: 'rgba(255,255,255,0.18)', labelBackgroundColor: '#292929' }, horzLine: { color: 'rgba(255,255,255,0.18)', labelBackgroundColor: '#292929' } },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: '#83CDA0',
      topColor: 'rgba(103,195,139,0.22)',
      bottomColor: 'rgba(103,195,139,0.015)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    series.setData(chartData);
    if (entryPrice && entryPrice > 0) {
      series.createPriceLine({
        price: entryPrice,
        color: '#C6A66A',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'ENTRY',
      });
    }
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0) chart.applyOptions({ width: container.clientWidth });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [chartData, entryPrice]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[224px] flex-col items-center justify-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015]">
        <div className="h-px w-16 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <span className="text-xs text-white/35">Waiting for market price history</span>
        <span className="text-[10px] text-white/20">Chart appears when price updates arrive</span>
      </div>
    );
  }

  return <div ref={containerRef} className="h-[224px] w-full overflow-hidden" />;
};

export const TokenDetailPage: React.FC = () => {
  const { closeTokenDetail, selectedToken, positions } = useTerminal();

  if (!selectedToken) return null;

  const position = positions.find((item) => item.mint === selectedToken.mint && item.status === 'OPEN');
  const history = selectedToken.price_history_5m || [];
  const firstPrice = history.find((point) => point.price > 0)?.price;
  const latestHistoryPrice = [...history].reverse().find((point) => point.price > 0)?.price;
  const displayedPrice = selectedToken.current_price_usd > 0
    ? selectedToken.current_price_usd
    : latestHistoryPrice || 0;
  const changePct = firstPrice && latestHistoryPrice && firstPrice > 0
    ? ((latestHistoryPrice - firstPrice) / firstPrice) * 100
    : null;
  const isPositive = (changePct ?? 0) >= 0;
  const pnlPositive = (position?.pnl_usd ?? 0) >= 0;

  return (
    <main className="relative h-full min-h-0 w-full overflow-y-auto bg-[#080808] pb-24 text-white">
      <div aria-hidden="true" className="h-[env(safe-area-inset-top)] min-h-0 w-full bg-[#080808]/75 backdrop-blur-2xl" />
      <header className="sticky top-0 z-30 h-[76px] w-full border-b border-white/[0.12] bg-[#080808]/85 px-3 pb-2 pt-3 shadow-[0_1px_0_rgba(255,255,255,0.025)] backdrop-blur-2xl sm:px-5">
        <div className="flex h-full items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={closeTokenDetail}
              aria-label="Go back"
              title="Go back"
              className="grid size-10 shrink-0 place-items-center rounded-full border border-white/[0.20] bg-white/[0.045] text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_12px_rgba(0,0,0,0.28)] transition hover:border-white/[0.32] hover:bg-white/[0.09] hover:text-white active:scale-95"
            >
              <ArrowLeft className="size-[17px]" strokeWidth={2.1} />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{selectedToken.name}</div>
              <div className="truncate text-[10px] tracking-[0.12em] text-white/40">{selectedToken.symbol} · {selectedToken.venue}</div>
            </div>
          </div>
          <span className="rounded-full border border-white/[0.10] bg-white/[0.045] px-2.5 py-1 text-[9px] font-semibold tracking-[0.14em] text-white/55">
            PAPER
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pb-8 pt-4 sm:px-5">
        <section className="flex items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-white/[0.10] bg-white/[0.055] text-lg font-semibold text-white/80">
            {selectedToken.symbol.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{selectedToken.name}</div>
            <div className="text-[11px] text-white/40">{selectedToken.symbol} / USD</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-xl font-semibold tracking-tight text-white">{displayedPrice > 0 ? money(displayedPrice) : '—'}</div>
            <div className={`text-xs font-semibold ${changePct === null ? 'text-white/35' : isPositive ? 'text-[#83CDA0]' : 'text-[#D58B8B]'}`}>
              {changePct === null ? '—' : `${changePct > 0 ? '+' : ''}${changePct.toFixed(2)}%`}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/[0.075] bg-[#0D0D0D] p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Price chart</div>
            <div className="text-[10px] text-white/30">5-minute history</div>
          </div>
          <TokenPriceChart history={history} entryPrice={position?.entry_price_usd} />
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Your position</h2>
            <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold tracking-[0.12em] ${position ? 'border-[#83CDA0]/20 bg-[#83CDA0]/[0.08] text-[#83CDA0]' : 'border-white/[0.10] bg-white/[0.035] text-white/40'}`}>
              {position ? 'OPEN' : 'NO OPEN POSITION'}
            </span>
          </div>

          {position ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-white/35">Entry price</div>
                  <div className="font-mono text-sm font-medium">{money(position.entry_price_usd)}</div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-white/35">Current price</div>
                  <div className="font-mono text-sm font-medium">{money(position.current_price_usd)}</div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-white/35">Tokens bought</div>
                  <div className="font-mono text-sm font-medium">{quantity(position.amount_tokens)} {selectedToken.symbol}</div>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                  <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-white/35">Entry value</div>
                  <div className="font-mono text-sm font-medium">{money(position.initial_investment_usd)}</div>
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${pnlPositive ? 'border-[#83CDA0]/20 bg-[#83CDA0]/[0.07]' : 'border-[#D58B8B]/20 bg-[#D58B8B]/[0.07]'}`}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">Unrealized profit / loss</div>
                <div className="flex items-baseline justify-between gap-2">
                  <div className={`font-mono text-2xl font-semibold tracking-tight ${pnlPositive ? 'text-[#83CDA0]' : 'text-[#D58B8B]'}`}>
                    {position.pnl_usd > 0 ? '+' : ''}{money(position.pnl_usd)}
                  </div>
                  <div className={`font-mono text-base font-semibold ${pnlPositive ? 'text-[#83CDA0]' : 'text-[#D58B8B]'}`}>
                    {position.pnl_pct > 0 ? '+' : ''}{position.pnl_pct.toFixed(2)}%
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-white/45">Current position value: {money(position.current_position_value_usd)}</div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
              <div className="text-xs font-medium text-white/65">No open paper position for this token</div>
              <div className="mt-1 text-[10px] text-white/35">Position details will appear here when a paper buy is recorded.</div>
            </div>
          )}
        </section>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-4 bg-gradient-to-t from-white/[0.055] via-white/[0.018] to-transparent" />
    </main>
  );
};

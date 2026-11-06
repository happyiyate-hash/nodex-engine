import React, { useEffect, useId, useMemo, useRef } from 'react';
import { useTerminal } from '../../context/TerminalContext';

const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: value > 0 && value < 1 ? 8 : 2,
}).format(value);

const quantity = (value: number) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
}).format(value);

const TradingViewChart: React.FC<{ symbol: string }> = ({ symbol }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetId = useId().replace(/:/g, '');
  const tradingViewSymbol = useMemo(() => {
    const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return clean ? clean + 'USD' : 'BTCUSD';
  }, [symbol]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.innerHTML = '';

    const widget = document.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    widget.style.width = '100%';
    widget.style.height = '100%';

    const attribution = document.createElement('div');
    attribution.className = 'tradingview-widget-copyright';
    attribution.style.display = 'none';

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.text = JSON.stringify({
      autosize: true,
      symbol: tradingViewSymbol,
      interval: '5',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: '#080808',
      gridColor: 'rgba(255,255,255,0.045)',
      allow_symbol_change: true,
      calendar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_side_toolbar: false,
      save_image: false,
      details: false,
      hotlist: false,
      withdateranges: true,
      compareSymbols: [],
      studies: [],
      support_host: 'https://www.tradingview.com',
      overrides: {
        'scalesProperties.showLeftScale': true,
        'scalesProperties.showRightScale': true,
        'paneProperties.background': '#080808',
        'paneProperties.backgroundType': 'solid',
        'paneProperties.vertGridProperties.color': 'rgba(255,255,255,0.035)',
        'paneProperties.horzGridProperties.color': 'rgba(255,255,255,0.055)',
      },
    });

    container.append(widget, attribution, script);
    return () => {
      container.innerHTML = '';
    };
  }, [tradingViewSymbol, widgetId]);

  return (
    <div
      ref={containerRef}
      id={`tradingview-chart-${widgetId}`}
      className="tradingview-widget-container w-full overflow-hidden"
      style={{ height: 480, minHeight: 480 }}
    />
  );
};

export const TokenDetailPage: React.FC = () => {
  const { closeTokenDetail, selectedToken, positions } = useTerminal();

  if (!selectedToken) return null;

  const position = positions.find((item) => item.mint === selectedToken.mint && item.status === 'OPEN');
  const currentPrice = selectedToken.current_price_usd > 0 ? selectedToken.current_price_usd : position?.current_price_usd || 0;
  const priceChange = 0;
  const pnlPositive = (position?.pnl_usd ?? 0) >= 0;

  return (
    <main className="relative h-full min-h-0 w-full overflow-y-auto bg-[#080808] text-white">
      <div aria-hidden="true" className="h-[env(safe-area-inset-top)] min-h-0 w-full bg-[#080808]" />

      <section className="w-full px-3 pb-4 pt-3 sm:px-5">
        <div className="flex w-full items-center gap-3">
          <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-white/[0.12] bg-[#171717] text-lg font-semibold text-white/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            {selectedToken.symbol.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold text-white">{selectedToken.name}</div>
            <div className="mt-0.5 truncate text-[11px] text-white/40">{selectedToken.symbol} · {selectedToken.venue}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-[20px] font-semibold tracking-tight text-white">{money(currentPrice)}</div>
            <div className={`font-mono text-[11px] font-semibold ${priceChange >= 0 ? 'text-[#83CDA0]' : 'text-[#D58B8B]'}`}>
              {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </div>
          </div>
        </div>
      </section>

      <section className="w-full border-y border-white/[0.07] bg-[#080808]">
        <div className="flex items-center justify-between px-3 pb-2 pt-1 sm:px-5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/45">Price chart</span>
          <span className="text-[10px] text-white/30">USD · TradingView</span>
        </div>
        <TradingViewChart symbol={selectedToken.symbol} />
      </section>

      <section className="flex w-full flex-col gap-3 px-3 pb-8 pt-4 sm:px-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Your position</h2>
          <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold tracking-[0.12em] ${position ? 'border-[#83CDA0]/20 bg-[#83CDA0]/[0.08] text-[#83CDA0]' : 'border-white/[0.10] bg-white/[0.035] text-white/40'}`}>
            {position ? 'OPEN' : 'NO OPEN POSITION'}
          </span>
        </div>

        {position ? (
          <>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-b border-white/[0.07] pb-3">
              <div>
                <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-white/35">Entry price</div>
                <div className="font-mono text-[13px] font-medium">{money(position.entry_price_usd)}</div>
              </div>
              <div>
                <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-white/35">Current price</div>
                <div className="font-mono text-[13px] font-medium">{money(position.current_price_usd)}</div>
              </div>
              <div>
                <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-white/35">Tokens bought</div>
                <div className="font-mono text-[13px] font-medium">{quantity(position.amount_tokens)} {selectedToken.symbol}</div>
              </div>
              <div>
                <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-white/35">Entry value</div>
                <div className="font-mono text-[13px] font-medium">{money(position.initial_investment_usd)}</div>
              </div>
            </div>
            <div className="flex items-end justify-between gap-3 py-1">
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-white/40">Unrealized P&L</div>
                <div className={`font-mono text-[24px] font-semibold tracking-tight ${pnlPositive ? 'text-[#83CDA0]' : 'text-[#D58B8B]'}`}>
                  {position.pnl_usd > 0 ? '+' : ''}{money(position.pnl_usd)}
                </div>
                <div className="mt-1 text-[10px] text-white/35">Position value {money(position.current_position_value_usd)}</div>
              </div>
              <div className={`pb-1 font-mono text-[15px] font-semibold ${pnlPositive ? 'text-[#83CDA0]' : 'text-[#D58B8B]'}`}>
                {position.pnl_pct > 0 ? '+' : ''}{position.pnl_pct.toFixed(2)}%
              </div>
            </div>
          </>
        ) : (
          <div className="border-y border-white/[0.06] py-4 text-center">
            <div className="text-xs font-medium text-white/60">No open paper position for this token</div>
            <div className="mt-1 text-[10px] text-white/35">Position information appears after a paper buy is recorded.</div>
          </div>
        )}
      </section>

    </main>
  );
};

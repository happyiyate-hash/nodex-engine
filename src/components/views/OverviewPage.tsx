import React, { useEffect, useRef, useState } from 'react';

type ChangeDirection = 'up' | 'down' | null;

export const OverviewPage: React.FC = () => {
  // Demo-only market movement until the real portfolio summary is connected.
  const [portfolioValue, setPortfolioValue] = useState(12840.56);
  const [profitLoss, setProfitLoss] = useState(12.4);
  const [portfolioFlash, setPortfolioFlash] = useState<ChangeDirection>(null);
  const [profitLossFlash, setProfitLossFlash] = useState<ChangeDirection>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    const movements = [-18.75, 32.4, -41.2, 55.6, -22.3, 14.8, -35.5, 48.2];

    const interval = setInterval(() => {
      const change = movements[tick.current % movements.length];
      tick.current += 1;
      const direction: ChangeDirection = change >= 0 ? 'up' : 'down';

      setPortfolioValue((current) => Math.max(0, current + change));
      setProfitLoss((current) => current + change);
      setPortfolioFlash(direction);
      setProfitLossFlash(direction);

      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => {
        setPortfolioFlash(null);
        setProfitLossFlash(null);
      }, 950);
    }, 2600);

    return () => {
      clearInterval(interval);
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, []);

  const formatUsd = (value: number) =>
    Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const isProfitable = profitLoss >= 0;
  const flashColor = (direction: ChangeDirection) => {
    if (direction === 'up') return 'text-[#75e58a] [text-shadow:0_0_18px_rgba(75,230,112,0.72)]';
    if (direction === 'down') return 'text-[#ff7777] [text-shadow:0_0_18px_rgba(255,75,75,0.72)]';
    return '';
  };

  return (
    <div className="min-h-full w-full bg-black">
      <section
        aria-label="Overview workspace"
        className="relative h-[82dvh] min-h-[560px] w-full overflow-hidden rounded-b-[30px] rounded-t-[30px] border border-white/[0.13] border-b-white/[0.22] bg-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.07)] sm:h-[84dvh] sm:rounded-[34px]"
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.16] to-transparent" />

        <div className="px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="flex min-h-[82px] items-center rounded-xl bg-[#181818] px-3.5 py-3 sm:min-h-[94px] sm:px-5">
            <div className="w-[34%] min-w-0 pr-2">
              <div className="text-[9px] font-medium uppercase tracking-[0.13em] text-white/40 sm:text-[10px]">
                P&L
              </div>
              <div
                aria-live="polite"
                className={`mt-1 truncate text-[14px] font-semibold tracking-tight tabular-nums transition-all duration-700 ease-out sm:text-base ${
                  profitLossFlash ? flashColor(profitLossFlash) : isProfitable ? 'text-[#9dbb98]' : 'text-[#d18d8d]'
                }`}
              >
                {isProfitable ? '+' : '−'}${formatUsd(profitLoss)}
              </div>
            </div>

            <div className="min-w-0 flex-1 border-l border-white/[0.08] pl-3 text-center sm:pl-5">
              <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/45 sm:text-[10px]">
                Portfolio
              </div>
              <div
                aria-live="polite"
                className={`mt-0.5 whitespace-nowrap text-[25px] font-bold leading-none tracking-[-0.055em] tabular-nums transition-all duration-700 ease-out sm:text-[32px] ${
                  portfolioFlash ? flashColor(portfolioFlash) : 'text-white'
                }`}
              >
                <span className="mr-0.5 text-white/65">$</span>{formatUsd(portfolioValue)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

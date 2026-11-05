import React from 'react';

export const OverviewPage: React.FC = () => {
  // Temporary display values until the portfolio summary endpoint is connected.
  const portfolioValue = 12840.56;
  const profitLoss = 1240.56;
  const isProfitable = profitLoss >= 0;

  const formatUsd = (value: number) =>
    Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
              <div className={`mt-1 truncate text-[14px] font-semibold tracking-tight tabular-nums sm:text-base ${isProfitable ? 'text-[#9dbb98]' : 'text-[#d18d8d]'}`}>
                {isProfitable ? '+' : '−'}${formatUsd(profitLoss)}
              </div>
            </div>

            <div className="min-w-0 flex-1 border-l border-white/[0.08] pl-3 text-center sm:pl-5">
              <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/45 sm:text-[10px]">
                Portfolio
              </div>
              <div className="mt-0.5 whitespace-nowrap text-[25px] font-bold leading-none tracking-[-0.055em] text-white tabular-nums sm:text-[32px]">
                <span className="mr-0.5 text-white/65">$</span>{formatUsd(portfolioValue)}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

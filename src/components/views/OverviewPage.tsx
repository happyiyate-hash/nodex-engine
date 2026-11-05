import React from 'react';
import { useTerminal } from '../../context/TerminalContext';

const lamportsToSol = (value: number) => value / 1_000_000_000;

const formatSol = (value: number) =>
  `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} SOL`;

export const OverviewPage: React.FC = () => {
  const { paperWallet, summary } = useTerminal();

  const walletBalanceLamports = paperWallet
    ? paperWallet.available_balance_lamports +
      paperWallet.invested_balance_lamports +
      paperWallet.locked_rent_lamports
    : 0;
  const balanceSol = lamportsToSol(walletBalanceLamports);
  const startingBalanceSol = paperWallet
    ? lamportsToSol(paperWallet.starting_balance_lamports)
    : 0;
  const totalProfitSol = balanceSol - startingBalanceSol;
  const solPrice = summary.sol_price_usd;
  const hasWallet = paperWallet !== null;

  return (
    <div className="min-h-full w-full bg-black">
      <section
        aria-label="Overview workspace"
        className="relative h-[82dvh] min-h-[560px] w-full overflow-hidden rounded-b-[30px] rounded-t-[30px] border border-white/[0.13] border-b-white/[0.22] bg-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.48),inset_0_1px_0_rgba(255,255,255,0.07)] sm:h-[84dvh] sm:rounded-[34px]"
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.16] to-transparent" />

        <div className="px-3 pt-3 sm:px-4 sm:pt-4">
          <div className="grid grid-cols-2 items-center rounded-xl bg-[#171717] px-3.5 py-2.5 sm:px-4 sm:py-3">
            <div className="min-w-0 pr-3">
              <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/45 sm:text-[10px]">
                Actual balance
              </div>
              <div className="mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-tight text-white tabular-nums sm:text-lg">
                {hasWallet ? formatSol(balanceSol) : '—'}
              </div>
              {hasWallet && solPrice > 0 && (
                <div className="mt-0.5 text-[9px] text-white/40 tabular-nums sm:text-[10px]">
                  ${(balanceSol * solPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>

            <div className="min-w-0 border-l border-white/[0.08] pl-3 sm:pl-4">
              <div className="text-[9px] font-medium uppercase tracking-[0.12em] text-white/45 sm:text-[10px]">
                Total profit
              </div>
              <div className={`mt-0.5 truncate text-[15px] font-semibold leading-tight tracking-tight tabular-nums sm:text-lg ${totalProfitSol >= 0 ? 'text-[#a8c5a5]' : 'text-[#d49a9a]'}`}>
                {hasWallet ? `${totalProfitSol >= 0 ? '+' : '−'}${formatSol(Math.abs(totalProfitSol))}` : '—'}
              </div>
              {hasWallet && solPrice > 0 && (
                <div className={`mt-0.5 text-[9px] tabular-nums sm:text-[10px] ${totalProfitSol >= 0 ? 'text-[#8fa98d]' : 'text-[#bd8585]'}`}>
                  {totalProfitSol >= 0 ? '+' : '−'}${(Math.abs(totalProfitSol) * solPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

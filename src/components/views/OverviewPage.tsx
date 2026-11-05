import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

type ChangeDirection = 'up' | 'down' | null;

interface RollingDigitProps {
  digit: string;
  balanceDirection: ChangeDirection;
}

const RollingDigit: React.FC<RollingDigitProps> = ({ digit, balanceDirection }) => {
  const lastDigit = useRef(digit);
  const frameRef = useRef<number | null>(null);
  const [sequence, setSequence] = useState<string[]>([digit]);
  const [offset, setOffset] = useState(0);
  const [isRolling, setIsRolling] = useState(false);

  useLayoutEffect(() => {
    const previous = lastDigit.current;
    if (previous === digit) return;

    lastDigit.current = digit;
    const from = Number(previous);
    const to = Number(digit);
    let nextSequence: string[];
    let rollDirection: 'up' | 'down';

    if (from === 9 && to === 0 && balanceDirection === 'up') {
      nextSequence = ['9', '0'];
      rollDirection = 'up';
    } else if (from === 0 && to === 9 && balanceDirection === 'down') {
      nextSequence = ['0', '9'];
      rollDirection = 'down';
    } else if (to > from) {
      nextSequence = Array.from({ length: to - from + 1 }, (_, index) => String(from + index));
      rollDirection = 'up';
    } else if (to < from) {
      nextSequence = Array.from({ length: from - to + 1 }, (_, index) => String(from - index));
      rollDirection = 'down';
    } else {
      return;
    }

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    setSequence(nextSequence);
    setOffset(0);
    setIsRolling(false);

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = requestAnimationFrame(() => {
        setIsRolling(true);
        // Incrementing digits travel upward; decrementing digits travel downward.
        setOffset(rollDirection === 'up' ? -(nextSequence.length - 1) : nextSequence.length - 1);
        frameRef.current = null;
      });
    });

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [digit, balanceDirection]);

  const finishRoll = (event: React.TransitionEvent<HTMLSpanElement>) => {
    if (event.propertyName !== 'transform' || !isRolling) return;
    setIsRolling(false);
    setSequence([digit]);
    setOffset(0);
  };

  if (sequence.length === 1) {
    return <span className="inline-block h-[1em] leading-[1em]">{digit}</span>;
  }

  return (
    <span className="inline-block h-[1em] overflow-hidden align-bottom">
      <span
        onTransitionEnd={finishRoll}
        className="flex flex-col will-change-transform"
        style={{
          transform: `translate3d(0, ${offset}em, 0)`,
          transition: isRolling
            ? 'transform 360ms cubic-bezier(0.22, 0.72, 0.25, 1)'
            : 'none',
        }}
      >
        {sequence.map((value, index) => (
          <span className="block h-[1em] shrink-0 leading-[1em]" key={index}>{value}</span>
        ))}
      </span>
    </span>
  );
};

export const OverviewPage: React.FC = () => {
  // Demo-only values. Each simulated update arrives independently at a varied interval.
  const [portfolioValue, setPortfolioValue] = useState(12840.56);
  const [profitLoss, setProfitLoss] = useState(12.4);
  const [portfolioFlash, setPortfolioFlash] = useState<ChangeDirection>(null);
  const [balanceDirection, setBalanceDirection] = useState<ChangeDirection>(null);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    const movements = [-18.75, 32.4, -41.2, 55.6, -22.3, 14.8, -35.5, 48.2, -9.6, 26.1];

    const scheduleUpdate = () => {
      const delay = 300 + Math.floor(Math.random() * 1800);
      updateTimer.current = setTimeout(() => {
        const change = movements[tick.current % movements.length];
        tick.current += 1;
        const direction: ChangeDirection = change >= 0 ? 'up' : 'down';

        setBalanceDirection(direction);
        setPortfolioValue((current) => Math.max(0, current + change));
        setProfitLoss((current) => current + change);

        setPortfolioFlash(null);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setPortfolioFlash(direction), 16);
        flashTimer.current = setTimeout(() => setPortfolioFlash(null), 190);

        scheduleUpdate();
      }, delay);
    };

    scheduleUpdate();
    return () => {
      if (updateTimer.current) clearTimeout(updateTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const formatUsd = (value: number) =>
    Math.abs(value).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const isProfitable = profitLoss >= 0;
  const pnlColor = isProfitable ? 'text-[#83b982]' : 'text-[#c77b7b]';
  const formattedPortfolio = formatUsd(portfolioValue);

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
                className={`mt-1 flex items-center gap-1 truncate text-[14px] font-semibold tracking-tight tabular-nums sm:text-base ${pnlColor}`}
              >
                <span aria-hidden="true" className="text-[10px] leading-none">
                  {isProfitable ? '▲' : '▼'}
                </span>
                <span>{isProfitable ? '+' : '−'}${formatUsd(profitLoss)}</span>
              </div>
            </div>

            <div className="min-w-0 flex-1 border-l border-white/[0.08] pl-3 text-center sm:pl-5">
              <div className="text-[9px] font-medium uppercase tracking-[0.16em] text-white/45 sm:text-[10px]">
                Portfolio
              </div>
              <div
                aria-live="polite"
                className={`mt-0.5 flex justify-center whitespace-nowrap text-[25px] font-bold leading-none tracking-[-0.055em] tabular-nums transition-colors duration-150 ease-out sm:text-[32px] ${
                  portfolioFlash === 'up'
                    ? 'text-[#83b982]'
                    : portfolioFlash === 'down'
                      ? 'text-[#c77b7b]'
                      : 'text-white'
                }`}
              >
                <span className="mr-0.5 text-white/65">$</span>
                {Array.from(formattedPortfolio).map((character, index) => (
                  /[0-9]/.test(character)
                    ? <RollingDigit key={index} digit={character} balanceDirection={balanceDirection} />
                    : <span className="inline-block h-[1em] leading-[1em]" key={index}>{character}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

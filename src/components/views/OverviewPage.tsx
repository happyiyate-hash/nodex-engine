import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

type ChangeDirection = 'up' | 'down' | null;

interface RollingDigitProps {
  digit: string;
}

const RollingDigit: React.FC<RollingDigitProps> = ({ digit }) => {
  const lastDigit = useRef(digit);
  const [sequence, setSequence] = useState<string[]>([digit]);
  const [direction, setDirection] = useState<ChangeDirection>(null);
  const [isRolling, setIsRolling] = useState(false);

  useLayoutEffect(() => {
    const previous = lastDigit.current;
    if (previous === digit) return;

    lastDigit.current = digit;
    const from = Number(previous);
    const to = Number(digit);

    // Every digit chooses its own direction. It does not inherit the
    // direction of the overall portfolio balance.
    if (to > from) {
      setDirection('up');
      setSequence(Array.from({ length: to - from + 1 }, (_, index) => String(from + index)));
      setIsRolling(false);
      const startTimer = window.setTimeout(() => setIsRolling(true), 20);
      const finishTimer = window.setTimeout(() => {
        setIsRolling(false);
        setSequence([digit]);
        setDirection(null);
      }, 430);
      return () => {
        window.clearTimeout(startTimer);
        window.clearTimeout(finishTimer);
      };
    }

    if (to < from) {
      setDirection('down');
      setSequence(Array.from({ length: from - to + 1 }, (_, index) => String(from - index)));
      setIsRolling(false);
      const startTimer = window.setTimeout(() => setIsRolling(true), 20);
      const finishTimer = window.setTimeout(() => {
        setIsRolling(false);
        setSequence([digit]);
        setDirection(null);
      }, 430);
      return () => {
        window.clearTimeout(startTimer);
        window.clearTimeout(finishTimer);
      };
    }
  }, [digit]);

  if (sequence.length === 1 || direction === null) {
    return <span className="inline-block">{digit}</span>;
  }

  // The track contains every intermediate digit: e.g. 1→5 rolls
  // 1, 2, 3, 4, 5 upward; 5→3 rolls 5, 4, 3 downward.
  const startOffset = direction === 'up' ? 0 : -(sequence.length - 1) * 100;
  const endOffset = direction === 'up' ? -(sequence.length - 1) * 100 : 0;
  const translate = isRolling ? endOffset : startOffset;

  return (
    <span className="inline-block h-[1em] overflow-hidden align-bottom">
      <span
        className="flex flex-col"
        style={{
          transform: `translateY(${translate}%)`,
          transition: isRolling
            ? 'transform 390ms cubic-bezier(0.22, 1.25, 0.36, 1)'
            : 'none',
        }}
      >
        {sequence.map((value, index) => (
          <span className="block h-[1em] leading-[1em]" key={index}>{value}</span>
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
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef(0);

  useEffect(() => {
    const movements = [-18.75, 32.4, -41.2, 55.6, -22.3, 14.8, -35.5, 48.2, -9.6, 26.1];

    const scheduleUpdate = () => {
      // Randomly vary the arrival time: roughly 300 ms to 2.1 seconds.
      const delay = 300 + Math.floor(Math.random() * 1800);
      updateTimer.current = setTimeout(() => {
        const change = movements[tick.current % movements.length];
        tick.current += 1;
        const direction: ChangeDirection = change >= 0 ? 'up' : 'down';

        setPortfolioValue((current) => Math.max(0, current + change));
        setProfitLoss((current) => current + change);

        // Keep the brief balance color cue; P&L remains independently colored.
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
                    ? <RollingDigit key={index} digit={character} />
                    : <span className="inline-block" key={index}>{character}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

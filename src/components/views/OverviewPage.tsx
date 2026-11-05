import React from 'react';

export const OverviewPage: React.FC = () => {
  return (
    <div className="min-h-full w-full bg-black">
      <section
        aria-label="Overview workspace"
        className="relative h-[82dvh] min-h-[560px] w-full overflow-hidden rounded-b-[30px] border-x border-b border-t-0 border-white/[0.13] border-b-white/[0.22] bg-[#050505] shadow-[0_18px_55px_rgba(0,0,0,0.48)] sm:h-[84dvh] sm:rounded-b-[34px]"
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.16] to-transparent" />
      </section>
    </div>
  );
};

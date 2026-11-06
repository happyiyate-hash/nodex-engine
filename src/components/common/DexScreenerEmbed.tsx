import React, { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';

interface DexScreenerEmbedProps {
  mint: string;
  symbol: string;
  height?: number;
}

export const DexScreenerEmbed: React.FC<DexScreenerEmbedProps> = ({
  mint,
  symbol,
  height = 420,
}) => {
  const [key, setKey] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const embedUrl = `https://dexscreener.com/solana/${mint}?embed=1&theme=dark&trades=0&info=0`;

  return (
    <div className="relative w-full overflow-hidden bg-[#0a0a0c] border-y border-[#1e2025]" style={{ height }}>
      {/* Loading skeleton */}
      {!loaded && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0a0c] text-white/50 space-y-2">
          <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-[11px] font-mono">Loading TradingView Solana DEX Feed...</span>
        </div>
      )}

      {/* Official DexScreener Solana TradingView Widget */}
      <iframe
        key={key}
        src={embedUrl}
        title={`${symbol} TradingView Chart`}
        className="w-full h-full border-0 select-none"
        onLoad={() => setLoaded(true)}
        allow="clipboard-write"
      />

      {/* Floating Refresh & Open Controls */}
      <div className="absolute top-2 right-3 z-20 flex items-center gap-1.5 bg-[#121316]/90 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 text-[10px] font-mono text-white/70">
        <button
          onClick={() => {
            setLoaded(false);
            setKey((k) => k + 1);
          }}
          className="hover:text-white transition-colors flex items-center gap-1"
          title="Reload Chart"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
        <span className="text-white/20">|</span>
        <a
          href={`https://dexscreener.com/solana/${mint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-white transition-colors flex items-center gap-1"
          title="Open in DexScreener"
        >
          <span>DEX</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
};

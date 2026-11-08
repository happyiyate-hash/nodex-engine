import React, { useEffect, useMemo, useState } from 'react';

interface TokenAvatarProps {
  symbol: string;
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function resolveImageUrl(value?: string): string {
  const candidate = (value || '').trim();
  if (!candidate) return '';
  if (candidate.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + candidate.slice(7).replace(/^ipfs\//, '');
  if (candidate.startsWith('ar://')) return 'https://arweave.net/' + candidate.slice(5).replace(/^\//, '');
  if (/^https:\/\//i.test(candidate)) return candidate;
  if (/^http:\/\//i.test(candidate)) return candidate.replace(/^http:\/\//i, 'https://');
  return '';
}

export const TokenAvatar: React.FC<TokenAvatarProps> = ({ symbol, logoUrl, size = 'md', className = '' }) => {
  const cleanSymbol = (symbol || '?').toUpperCase().trim() || '?';
  const imageUrl = useMemo(() => resolveImageUrl(logoUrl), [logoUrl]);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const sizeClasses = {
    sm: 'w-5 h-5 text-[9px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm',
  }[size];

  useEffect(() => {
    setAttempt(0);
    setLoaded(false);
    setFailed(false);
  }, [imageUrl]);

  useEffect(() => {
    if (!imageUrl || loaded || failed || attempt >= 5) return;
    const delays = [900, 1800, 3500, 6500, 10000];
    const timer = window.setTimeout(() => setAttempt((current) => current + 1), delays[attempt]);
    return () => window.clearTimeout(timer);
  }, [attempt, failed, imageUrl, loaded]);

  const fallback = (
    <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-white">
      {cleanSymbol.slice(0, 2)}
    </span>
  );

  return (
    <div className={`${sizeClasses} relative rounded-full overflow-hidden shrink-0 bg-[#1e2024] border border-white/10 shadow-sm ${className}`}>
      {fallback}
      {imageUrl && !failed && (
        <img
          key={`${imageUrl}-${attempt}`}
          src={imageUrl}
          alt={`${symbol} logo`}
          loading="eager"
          decoding="async"
          fetchPriority="low"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => {
            // Let the staggered retry timer advance the attempt; don't turn a
            // single transient network failure into an immediate fallback.
            if (attempt >= 5) setFailed(true);
          }}
        />
      )}
      {imageUrl && !loaded && !failed && (
        <span className="absolute inset-0 animate-pulse bg-white/[0.06]" aria-label="Loading token logo" />
      )}
    </div>
  );
};

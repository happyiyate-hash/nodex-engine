import React, { useEffect, useMemo, useState } from 'react';

interface TokenAvatarProps {
  symbol: string;
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function resolveImageUrls(value?: string): string[] {
  const candidate = (value || '').trim();
  if (!candidate) return [];
  const ipfsPath = candidate.startsWith('ipfs://')
    ? candidate.slice(7).replace(/^ipfs\//, '').replace(/^\//, '')
    : candidate.match(/^https?:\/\/(?:ipfs\.io|cloudflare-ipfs\.com|dweb\.link)\/ipfs\/(.+)$/i)?.[1];
  if (ipfsPath) {
    const path = ipfsPath.replace(/^ipfs\//, '').replace(/^\//, '');
    return [
      'https://ipfs.io/ipfs/' + path,
      'https://cloudflare-ipfs.com/ipfs/' + path,
      'https://dweb.link/ipfs/' + path,
    ];
  }
  if (candidate.startsWith('ar://')) return ['https://arweave.net/' + candidate.slice(5).replace(/^\//, '')];
  if (/^(https?:\/\/|data:image\/)/i.test(candidate) || candidate.startsWith('/')) {
    return [candidate.startsWith('http://') ? candidate.replace(/^http:\/\//i, 'https://') : candidate];
  }
  return [];
}

export const TokenAvatar: React.FC<TokenAvatarProps> = ({ symbol, logoUrl, size = 'md', className = '' }) => {
  const cleanSymbol = (symbol || '?').toUpperCase().trim() || '?';
  const imageUrls = useMemo(() => resolveImageUrls(logoUrl), [logoUrl]);
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryPending, setRetryPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sizeClasses = {
    sm: 'w-5 h-5 text-[9px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm',
  }[size];

  const imageUrl = imageUrls[gatewayIndex] || '';

  useEffect(() => {
    setGatewayIndex(0);
    setRetryAttempt(0);
    setRetryPending(false);
    setLoaded(false);
  }, [logoUrl]);

  // Retry transient CDN/network failures indefinitely with a capped backoff.
  // A URL is never marked permanently failed just because one request failed.
  useEffect(() => {
    if (!imageUrl || loaded || !retryPending) return;
    const delays = [1000, 2000, 4000, 8000, 15000, 30000, 60000];
    const timer = window.setTimeout(() => {
      if (imageUrls.length > 1) {
        setGatewayIndex((index) => (index + 1) % imageUrls.length);
      }
      setRetryAttempt((attempt) => attempt + 1);
      setRetryPending(false);
    }, delays[Math.min(retryAttempt, delays.length - 1)]);
    return () => window.clearTimeout(timer);
  }, [imageUrl, loaded, retryAttempt, retryPending]);

  const fallback = (
    <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-white">
      {cleanSymbol.slice(0, 2)}
    </span>
  );

  return (
    <div className={sizeClasses + ' relative rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-[#30343a] via-[#17191d] to-[#090a0c] shadow-[inset_0_1px_1px_rgba(255,255,255,0.16),0_3px_9px_rgba(0,0,0,0.55)] ' + className}>
      {fallback}
      {imageUrl && (
        <img
          key={imageUrl + '-' + retryAttempt}
          src={imageUrl}
          alt={symbol + ' logo'}
          loading="eager"
          decoding="async"
          fetchPriority="auto"
          className={'absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ' + (loaded ? 'opacity-100' : 'opacity-0')}
          onLoad={() => {
            setLoaded(true);
            setRetryPending(false);
          }}
          onError={() => {
            setLoaded(false);
            if (gatewayIndex < imageUrls.length - 1) {
              setGatewayIndex((index) => index + 1);
              setRetryAttempt(0);
            } else {
              setRetryPending(true);
            }
          }}
        />
      )}
      {imageUrl && !loaded && (
        <span className="absolute inset-0 animate-pulse bg-white/[0.06]" aria-label="Loading token logo" />
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';

interface TokenAvatarProps {
  symbol: string;
  logoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Cache both successful and unsuccessful extractions so a logo is never
// repeatedly sampled while its token moves through the feed.
const logoAccentCache = new Map<string, string | null>();
const MAX_LOGO_ACCENT_CACHE = 500;

function extractDominantAccent(image: HTMLImageElement): string | null {
  const cacheKey = image.currentSrc || image.src;
  if (!cacheKey) return null;
  if (logoAccentCache.has(cacheKey)) return logoAccentCache.get(cacheKey) ?? null;

  let accent: string | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context unavailable');

    context.drawImage(image, 0, 0, 24, 24);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    const buckets = new Map<number, { count: number; red: number; green: number; blue: number; saturation: number }>();

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha < 0.55) continue;

      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const brightness = (red + green + blue) / 3;
      const saturation = maximum === 0 ? 0 : (maximum - minimum) / maximum;

      // Ignore near-black, near-white and neutral pixels. They should not
      // tint a dark card or overpower the logo's actual identity.
      if (brightness < 22 || brightness > 246 || saturation < 0.12) continue;

      const redBin = red >> 4;
      const greenBin = green >> 4;
      const blueBin = blue >> 4;
      const key = (redBin << 8) | (greenBin << 4) | blueBin;
      const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0, saturation: 0 };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      bucket.saturation += saturation;
      buckets.set(key, bucket);
    }

    let best: { count: number; red: number; green: number; blue: number; saturation: number } | null = null;
    let bestScore = 0;
    for (const bucket of buckets.values()) {
      const averageSaturation = bucket.saturation / bucket.count;
      const score = bucket.count * (0.65 + averageSaturation);
      if (score > bestScore) {
        best = bucket;
        bestScore = score;
      }
    }

    if (best) {
      const red = Math.round(best.red / best.count);
      const green = Math.round(best.green / best.count);
      const blue = Math.round(best.blue / best.count);
      accent = `${red} ${green} ${blue}`;
    }
  } catch {
    // Some image hosts do not permit canvas pixel reads (CORS). The logo
    // itself can still display normally; the card simply keeps its neutral look.
    accent = null;
  }

  if (logoAccentCache.size >= MAX_LOGO_ACCENT_CACHE) {
    const oldestKey = logoAccentCache.keys().next().value;
    if (oldestKey) logoAccentCache.delete(oldestKey);
  }
  logoAccentCache.set(cacheKey, accent);
  return accent;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [gatewayIndex, setGatewayIndex] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [retryPending, setRetryPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
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
    setLogoFailed(false);
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

  const showingSolanaFallback = !imageUrl || logoFailed;

  useEffect(() => {
    const card = rootRef.current?.closest<HTMLElement>('[data-token-card]');
    if (!card) return;
    if (showingSolanaFallback) {
      card.style.setProperty('--token-accent-rgb', '153 69 255');
    }
  }, [showingSolanaFallback, logoUrl]);

  return (
    <div ref={rootRef} className={sizeClasses + ' relative rounded-full overflow-hidden shrink-0 ' + (showingSolanaFallback ? 'bg-gradient-to-br from-[#241638] via-[#160f22] to-[#09070e] shadow-[inset_0_1px_1px_rgba(190,145,255,0.12),0_3px_9px_rgba(0,0,0,0.55)] ' : 'bg-gradient-to-br from-[#30343a] via-[#17191d] to-[#090a0c] shadow-[inset_0_1px_1px_rgba(255,255,255,0.16),0_3px_9px_rgba(0,0,0,0.55)] ') + className}>
      {fallback}
      <img
        src="/assets/token-fallbacks/solana-logo.png"
        alt="Solana logo"
        loading="eager"
        decoding="async"
        fetchPriority="auto"
        className={'absolute inset-0 h-full w-full object-cover ' + (loaded && !logoFailed ? 'opacity-0' : 'opacity-100')}
      />
      {imageUrl && (
        <img
          key={imageUrl + '-' + retryAttempt}
          src={imageUrl}
          crossOrigin="anonymous"
          alt={symbol + ' logo'}
          loading="eager"
          decoding="async"
          fetchPriority="auto"
          className={'absolute inset-0 h-full w-full object-cover ' + (loaded ? 'opacity-100' : 'opacity-0')}
          onLoad={(event) => {
            const accent = extractDominantAccent(event.currentTarget);
            if (accent) {
              rootRef.current?.closest<HTMLElement>('[data-token-card]')?.style.setProperty('--token-accent-rgb', accent);
            }
            setLoaded(true);
            setLogoFailed(false);
            setRetryPending(false);
          }}
          onError={() => {
            setLoaded(false);
            if (gatewayIndex < imageUrls.length - 1) {
              setGatewayIndex((index) => index + 1);
              setRetryAttempt(0);
            } else {
              setLogoFailed(true);
              setRetryPending(true);
            }
          }}
        />
      )}
      {imageUrl && !loaded && !logoFailed && (
        <span className="absolute inset-0 bg-black/[0.08]" aria-label="Loading token logo" />
      )}
    </div>
  );
};

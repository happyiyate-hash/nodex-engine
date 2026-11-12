import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context unavailable');

    context.drawImage(image, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const chromaticBuckets = new Map<number, {
      count: number;
      red: number;
      green: number;
      blue: number;
      saturation: number;
    }>();
    const neutralBuckets = new Map<number, {
      count: number;
      red: number;
      green: number;
      blue: number;
    }>();
    let visiblePixelCount = 0;
    let chromaticPixelCount = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const alpha = pixels[index + 3] / 255;
      if (alpha < 0.55) continue;

      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const chroma = max - min;
      const saturation = max === 0 ? 0 : chroma / max;
      visiblePixelCount += 1;

      // Treat a colour as a real subject/accent candidate only when it has
      // enough saturation and colour separation to stand apart from grey,
      // black or white backgrounds.
      if (saturation >= 0.22 && chroma >= 28 && max >= 38 && max <= 250) {
        const hueValue = max === red
          ? ((green - blue) / chroma + (green < blue ? 6 : 0))
          : max === green
            ? (blue - red) / chroma + 2
            : (red - green) / chroma + 4;
        const hue = hueValue / 6;
        const hueBin = Math.floor(hue * 24) % 24;
        const saturationBin = Math.min(3, Math.floor(saturation * 4));
        const valueBin = Math.min(3, Math.floor((max / 256) * 4));
        const key = (hueBin << 4) | (saturationBin << 2) | valueBin;
        const bucket = chromaticBuckets.get(key) || {
          count: 0, red: 0, green: 0, blue: 0, saturation: 0,
        };
        bucket.count += 1;
        bucket.red += red;
        bucket.green += green;
        bucket.blue += blue;
        bucket.saturation += saturation;
        chromaticBuckets.set(key, bucket);
        chromaticPixelCount += 1;
      } else {
        // Keep a separate neutral palette for genuinely monochrome artwork.
        const key = ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
        const bucket = neutralBuckets.get(key) || {
          count: 0, red: 0, green: 0, blue: 0,
        };
        bucket.count += 1;
        bucket.red += red;
        bucket.green += green;
        bucket.blue += blue;
        neutralBuckets.set(key, bucket);
      }
    }

    let bestColor: { count: number; red: number; green: number; blue: number; score: number } | null = null;
    // If colour occupies a meaningful part of the image, ignore neutral
    // background pixels. This lets a noticeable pink shirt or flower win
    // over a much larger black/white/grey background.
    const hasMeaningfulColor = visiblePixelCount > 0 &&
      chromaticPixelCount >= Math.max(8, Math.ceil(visiblePixelCount * 0.025));

    if (hasMeaningfulColor) {
      for (const bucket of chromaticBuckets.values()) {
        const averageSaturation = bucket.saturation / bucket.count;
        // Saturation-weighted frequency favours a clear, distinctive hue
        // without allowing a single colourful pixel to determine the card.
        const score = bucket.count * (0.35 + averageSaturation * 2.4);
        if (!bestColor || score > bestColor.score) {
          bestColor = {
            count: bucket.count,
            red: bucket.red,
            green: bucket.green,
            blue: bucket.blue,
            score,
          };
        }
      }
    }

    if (bestColor) {
      accent = `${Math.round(bestColor.red / bestColor.count)} ${Math.round(bestColor.green / bestColor.count)} ${Math.round(bestColor.blue / bestColor.count)}`;
    } else {
      // No meaningful chromatic subject was found: preserve black, white,
      // charcoal and grey tones for monochrome logos.
      let bestNeutral: { count: number; red: number; green: number; blue: number } | null = null;
      for (const bucket of neutralBuckets.values()) {
        if (!bestNeutral || bucket.count > bestNeutral.count) bestNeutral = bucket;
      }
      if (bestNeutral) {
        accent = `${Math.round(bestNeutral.red / bestNeutral.count)} ${Math.round(bestNeutral.green / bestNeutral.count)} ${Math.round(bestNeutral.blue / bestNeutral.count)}`;
      }
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
  if (accent) logoAccentCache.set(cacheKey, accent);
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

  useLayoutEffect(() => {
    const card = rootRef.current?.closest<HTMLElement>('[data-token-card]');
    if (!card) return;
    // Start each new logo with the subtle Solana purple. Its successfully
    // extracted token color replaces this value in the image onLoad handler.
    if (showingSolanaFallback || logoUrl) {
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

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
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context unavailable');

    context.drawImage(image, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    const buckets = new Map<number, {
      count: number;
      red: number;
      green: number;
      blue: number;
      weight: number;
    }>();
    let visiblePixels = 0;

    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const index = (y * 64 + x) * 4;
        const alpha = pixels[index + 3] / 255;
        if (alpha < 0.25) continue;

        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const max = Math.max(red, green, blue);
        const min = Math.min(red, green, blue);
        const chroma = max - min;
        const saturation = max === 0 ? 0 : chroma / max;
        const brightness = (red * 0.299 + green * 0.587 + blue * 0.114);

        // Discard only near-black and clipped-white pixels. Low-saturation
        // warm colours are retained because they often represent skin or beige fabric.
        if (brightness < 22 || brightness > 250) continue;
        visiblePixels += 1;

        let hue = 0;
        if (chroma > 0) {
          const hueValue = max === red
            ? ((green - blue) / chroma + (green < blue ? 6 : 0))
            : max === green
              ? (blue - red) / chroma + 2
              : (red - green) / chroma + 4;
          hue = (hueValue / 6) * 360;
        }

        // Keep hue resolution fine enough to distinguish red, orange, pink,
        // green and blue, while grouping lighting variations of the same colour.
        const hueBin = chroma < 12 ? 36 : Math.floor(hue / 10) % 36;
        const saturationBin = Math.min(4, Math.floor(saturation * 5));
        const valueBin = Math.min(4, Math.floor((brightness / 256) * 5));
        const key = (hueBin << 6) | (saturationBin << 3) | valueBin;
        const bucket = buckets.get(key) || {
          count: 0, red: 0, green: 0, blue: 0, weight: 0,
        };

        // Warm, moderately saturated pixels are common skin tones. Give them
        // a fair chance instead of classifying them as unimportant neutrals.
        const isWarmSkinRange = hue <= 55 || hue >= 345;
        const skinToneBoost = isWarmSkinRange && saturation >= 0.12 && saturation <= 0.58
          ? 1.35
          : 1;
        // Mild centre weighting reduces the influence of borders and frames.
        const dx = (x - 31.5) / 31.5;
        const dy = (y - 31.5) / 31.5;
        const centreWeight = 1 + Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy)) * 0.25;
        const saturationWeight = 0.9 + saturation * 1.15;
        const pixelWeight = alpha * skinToneBoost * centreWeight * saturationWeight;

        bucket.count += 1;
        bucket.red += red * pixelWeight;
        bucket.green += green * pixelWeight;
        bucket.blue += blue * pixelWeight;
        bucket.weight += pixelWeight;
        buckets.set(key, bucket);
      }
    }

    let best: { count: number; red: number; green: number; blue: number; score: number; weight: number } | null = null;
    for (const bucket of buckets.values()) {
      // Frequency remains the main signal; weighting gently favours colours
      // that are visible and recognisable without letting a few pixels win.
      const score = bucket.count * (bucket.weight / bucket.count);
      if (!best || score > best.score) {
        best = {
          count: bucket.count,
          red: bucket.red,
          green: bucket.green,
          blue: bucket.blue,
          score,
          weight: bucket.weight,
        };
      }
    }

    if (best && visiblePixels > 0) {
      accent = `${Math.round(best.red / best.weight)} ${Math.round(best.green / best.weight)} ${Math.round(best.blue / best.weight)}`;
    }
  } catch {
    // Cross-origin images without CORS permission cannot be sampled by canvas.
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
  // Track the exact URL that loaded/failed; a boolean can refer to the previous token image.
  const [loadedImageUrl, setLoadedImageUrl] = useState('');
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const [sampledAccent, setSampledAccent] = useState<{ url: string; color: string | null } | null>(null);
  const [failedAccentProbeUrl, setFailedAccentProbeUrl] = useState('');
  const sizeClasses = {
    sm: 'w-5 h-5 text-[9px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm',
  }[size];

  const imageUrl = imageUrls[gatewayIndex] || '';
  const loaded = Boolean(imageUrl) && loadedImageUrl === imageUrl;
  const logoFailed = Boolean(imageUrl) && failedImageUrl === imageUrl;

  // Reset synchronously after a token's logo URL changes. A passive effect
  // can run after a cached image's onLoad event and accidentally erase the
  // newly-loaded state, leaving the Solana fallback stuck over the artwork.
  useLayoutEffect(() => {
    setGatewayIndex(0);
    setRetryAttempt(0);
    setRetryPending(false);
    setLoadedImageUrl('');
    setFailedImageUrl('');
    setSampledAccent(null);
    setFailedAccentProbeUrl('');
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

  // Keep the Solana mark only until this token's exact logo URL has loaded.
  const showingSolanaFallback = !imageUrl || !loaded || logoFailed;

  useLayoutEffect(() => {
    const card = rootRef.current?.closest<HTMLElement>('[data-token-card]');
    if (!card || !showingSolanaFallback) return;
    // The Solana placeholder keeps its established purple accent.
    card.style.setProperty('--token-accent-rgb', '153 69 255');
    card.style.setProperty('--token-accent-secondary-rgb', '153 69 255');
  }, [showingSolanaFallback, logoUrl]);

  useEffect(() => {
    if (!loaded || !imageUrl) return;
    const hasSample = sampledAccent?.url === imageUrl;
    const probeFailed = failedAccentProbeUrl === imageUrl;
    if (!hasSample && !probeFailed) return;

    const card = rootRef.current?.closest<HTMLElement>('[data-token-card]');
    if (!card) return;
    // A real token logo is visible, but its colour could not be sampled:
    // use the NodeX orange-and-gold fallback in that case only.
    const accent = hasSample ? sampledAccent.color : null;
    card.style.setProperty('--token-accent-rgb', accent || '231 137 55');
    card.style.setProperty('--token-accent-secondary-rgb', accent || '229 177 74');
  }, [loaded, imageUrl, sampledAccent, failedAccentProbeUrl]);

  return (
    <div ref={rootRef} className={sizeClasses + ' relative rounded-full overflow-hidden shrink-0 ' + (showingSolanaFallback ? 'bg-gradient-to-br from-[#241638] via-[#160f22] to-[#09070e] shadow-[inset_0_1px_1px_rgba(190,145,255,0.12),0_3px_9px_rgba(0,0,0,0.55)] ' : 'bg-gradient-to-br from-[#30343a] via-[#17191d] to-[#090a0c] shadow-[inset_0_1px_1px_rgba(255,255,255,0.16),0_3px_9px_rgba(0,0,0,0.55)] ') + className}>
      {fallback}
      {showingSolanaFallback && (
        <img
          src="/assets/token-fallbacks/solana-logo.png"
          alt="Solana logo"
          loading="eager"
          decoding="async"
          fetchPriority="auto"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {imageUrl && (
        <img
          key={imageUrl + '-' + retryAttempt}
          src={imageUrl}
          alt={symbol + ' logo'}
          loading="eager"
          decoding="async"
          fetchPriority="auto"
          className={'absolute inset-0 h-full w-full object-cover ' + (loaded && !logoFailed ? 'opacity-100' : 'opacity-0')}
          onLoad={(event) => {
            // Ignore a late load from an image belonging to the previous token.
            if (event.currentTarget.getAttribute('src') !== imageUrl) return;

            // This display image intentionally has no crossOrigin attribute:
            // some token metadata hosts omit CORS headers, and their logos must
            // still render. A separate CORS-enabled probe below samples colour.
            // This state change removes the Solana replacement image immediately.
            setLoadedImageUrl(imageUrl);
            setFailedImageUrl('');
            setRetryPending(false);
          }}
          onError={() => {
            setLoadedImageUrl('');
            if (gatewayIndex < imageUrls.length - 1) {
              setGatewayIndex((index) => index + 1);
              setRetryAttempt(0);
            } else {
              setFailedImageUrl(imageUrl);
              setRetryPending(true);
            }
          }}
        />
      )}
      {imageUrl && (
        <img
          key={imageUrl + '-accent-probe'}
          src={imageUrl}
          alt=""
          aria-hidden="true"
          crossOrigin="anonymous"
          loading="eager"
          decoding="async"
          className="pointer-events-none absolute h-px w-px opacity-0"
          onLoad={(event) => {
            if (event.currentTarget.getAttribute('src') !== imageUrl) return;
            const accent = extractDominantAccent(event.currentTarget);
            setSampledAccent({ url: imageUrl, color: accent });
          }}
          onError={() => {
            setFailedAccentProbeUrl(imageUrl);
          }}
        />
      )}
      {imageUrl && !loaded && !logoFailed && (
        <span className="absolute inset-0 bg-black/[0.08]" aria-label="Loading token logo" />
      )}
    </div>
  );
};

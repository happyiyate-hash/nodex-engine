import type { DiscoveredToken } from '../types';

const TOKENCARE_ENDPOINT = 'https://back-end-gamma-ebon.vercel.app/api/developer';
const RETRY_STORAGE_KEY = 'nodex.tokencare.logo-retry.v1';
const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

type TokenCareResult = { mint: string; logoUrl: string | null; error?: string };

function readRetryMap(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(RETRY_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function writeRetryMap(value: Record<string, number>): void {
  try { localStorage.setItem(RETRY_STORAGE_KEY, JSON.stringify(value)); } catch { /* best effort */ }
}

export function isTokenCareRetryBlocked(mint: string): boolean {
  const attempts = readRetryMap();
  const attemptedAt = Number(attempts[mint] || 0);
  return attemptedAt > 0 && Date.now() - attemptedAt < RETRY_COOLDOWN_MS;
}

async function recoverOne(token: DiscoveredToken, apiKey: string): Promise<TokenCareResult> {
  try {
    const response = await fetch(TOKENCARE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({
        service: 'token',
        action: 'logo',
        params: { blockchain: 'solana', address: token.mint },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success !== true) {
      const retries = readRetryMap();
      retries[token.mint] = Date.now();
      writeRetryMap(retries);
      return { mint: token.mint, logoUrl: null, error: String(payload?.message || payload?.error || `TokenCare HTTP ${response.status}`) };
    }
    const logoUrl = typeof payload?.data?.logo_url === 'string' ? payload.data.logo_url.trim() : '';
    if (!logoUrl) {
      const retries = readRetryMap();
      retries[token.mint] = Date.now();
      writeRetryMap(retries);
      return { mint: token.mint, logoUrl: null, error: 'TokenCare returned no logo URL.' };
    }
    const retries = readRetryMap();
    delete retries[token.mint];
    writeRetryMap(retries);
    return { mint: token.mint, logoUrl };
  } catch (error) {
    const retries = readRetryMap();
    retries[token.mint] = Date.now();
    writeRetryMap(retries);
    return { mint: token.mint, logoUrl: null, error: error instanceof Error ? error.message : 'TokenCare request failed.' };
  }
}

/** The published TokenCare schema is single-asset. Grouping happens in NodeX;
 * each grouped item is sent using the documented single-asset request shape. */
export async function recoverTokenLogoGroup(tokens: DiscoveredToken[], apiKey: string): Promise<TokenCareResult[]> {
  const candidates = tokens.filter((token) => token.mint && !token.logo_url && !isTokenCareRetryBlocked(token.mint));
  const results: TokenCareResult[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      results.push(await recoverOne(candidates[index], apiKey));
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, candidates.length) }, () => worker()));
  return results;
}

import type { DiscoveredToken } from '../types';
import { recordRequest, updateRequest } from './engineLogs';

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
  const requestBody = {
    service: 'token',
    action: 'logo',
    params: { blockchain: 'solana', address: token.mint },
  };
  const started = performance.now();
  const at = new Date().toISOString();
  const action = `TokenCare POST /api/developer · ${token.mint.slice(0, 6)}…${token.mint.slice(-5)}`;
  // Publish the outgoing request immediately so a slow/hung request is still
  // visible in Logs before TokenCare sends its response.
  const logId = recordRequest({
    action, at, ok: true,
    request: { endpoint: TOKENCARE_ENDPOINT, method: 'POST', body: requestBody },
  });
  try {
    const response = await fetch(TOKENCARE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(requestBody),
    });
    const responseText = await response.text().catch(() => '');
    let payload: any = responseText;
    try { payload = responseText ? JSON.parse(responseText) : null; } catch { /* Keep non-JSON response text for diagnostics. */ }
    const durationMs = Math.round(performance.now() - started);
    const logoUrl = typeof payload?.data?.logo_url === 'string' ? payload.data.logo_url.trim() : '';
    const ok = response.ok && payload?.success === true && Boolean(logoUrl);
    const error = !response.ok
      ? String(payload?.message || payload?.error || `TokenCare HTTP ${response.status}`)
      : payload?.success !== true
        ? String(payload?.message || payload?.error || 'TokenCare response did not report success.')
        : !logoUrl ? 'TokenCare returned no logo URL.' : undefined;

    // Keep the request body and complete response visible in Logs. Never record
    // the API key or request headers in browser storage.
    updateRequest(logId, {
      durationMs, ok, status: response.status, error,
      response: payload,
    });

    if (!ok) {
      const retries = readRetryMap();
      retries[token.mint] = Date.now();
      writeRetryMap(retries);
      return { mint: token.mint, logoUrl: null, error };
    }
    const retries = readRetryMap();
    delete retries[token.mint];
    writeRetryMap(retries);
    return { mint: token.mint, logoUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TokenCare request failed.';
    updateRequest(logId, {
      durationMs: Math.round(performance.now() - started), ok: false,
      error: message, response: { network_error: message },
    });
    const retries = readRetryMap();
    retries[token.mint] = Date.now();
    writeRetryMap(retries);
    return { mint: token.mint, logoUrl: null, error: message };
  }
}

/** The published TokenCare schema is single-asset. Grouping happens in NodeX;
 * each grouped item is sent using the documented single-asset request shape. */
export async function recoverTokenLogoGroup(tokens: DiscoveredToken[], apiKey: string): Promise<TokenCareResult[]> {
  const candidates = tokens.filter((token) => token.mint && !token.logo_url && !isTokenCareRetryBlocked(token.mint));
  if (!candidates.length && tokens.length) {
    recordRequest({
      action: 'TokenCare group not sent · retry cooldown', at: new Date().toISOString(), ok: false,
      error: 'No HTTP request was sent: every queued token is still inside the 6-hour retry cooldown.',
      request: { queued_tokens: tokens.length, endpoint: TOKENCARE_ENDPOINT },
      response: { skipped: true, reason: 'retry_cooldown' },
    });
  }
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

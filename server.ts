import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '32kb' }));

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split('.').map(Number);
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb') ||
      normalized.startsWith('::ffff:');
  }
  return true;
}

async function marketDataOrigin(value: unknown): Promise<URL> {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Enter the Market Data REST API URL.');
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { throw new Error('Market Data REST URL is invalid.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Market Data REST URL must be an HTTPS server origin, without a path, query or credentials.');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') ||
      hostname === 'metadata.google.internal') {
    throw new Error('Private and local network destinations are not allowed.');
  }
  let addresses: Array<{ address: string; family: number }>;
  if (isIP(hostname)) addresses = [{ address: hostname, family: isIP(hostname) }];
  else {
    try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
    catch { throw new Error('Market Data server hostname could not be resolved.'); }
  }
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Market Data URL must resolve to a public server address.');
  }
  return parsed;
}

async function marketDataProxy(req: express.Request, res: express.Response, action: string) {
  try {
    const origin = await marketDataOrigin(req.body?.restUrl);
    const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    if (!apiKey) return res.status(400).json({ error: 'Enter the Market Data API key.' });

    const routes: Record<string, { path: string; method: 'GET' | 'POST' }> = {
      health: { path: '/health', method: 'GET' },
      providers: { path: '/providers/status', method: 'GET' },
      'ws-ticket': { path: '/api/v1/ws-ticket', method: 'POST' },
    };
    const target = routes[action];
    if (!target) return res.status(404).json({ error: 'Unknown Market Data action.' });

    const upstream = await fetch(new URL(target.path, origin.origin), {
      method: target.method,
      headers: { 'x-api-key': apiKey, ...(target.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(target.method === 'POST' ? { body: '{}' } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      return res.status(502).json({ error: 'Market Data server returned an unexpected redirect.' });
    }
    const raw = await upstream.text();
    let payload: unknown;
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { payload = { error: raw.slice(0, 500) || 'Market Data server returned an invalid response.' }; }
    return res.status(upstream.status).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Market Data connection request failed.';
    const status = /URL|https|private|public server|Enter the Market Data/i.test(message) ? 400 : 502;
    return res.status(status).json({ error: message });
  }
}

// Per-device Market Data credentials are forwarded only for the current request.
// The proxy never stores or logs the API key.
app.post('/api/market-data/:action', (req, res) => {
  void marketDataProxy(req, res, req.params.action);
});

// Health check endpoint for Render zero-downtime deploys
app.get('/healthz', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'NodeX Solana Terminal',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    mode: 'PAPER',
    network: 'mainnet-beta',
    engine: 'running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Serve compiled static assets from dist
const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

// SPA fallback for client-side routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NodeX Solana Terminal listening on port ${PORT}`);
});

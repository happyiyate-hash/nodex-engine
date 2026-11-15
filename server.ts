import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

import 'dotenv/config';
import express from 'express';
import ipamRouter from './routes/ipam.js';
import db from './db/index.js';
import { getCapabilities } from './services/ipamAnalytics.js';
import {
  createApiKeyAuth,
  createAdminActionGuard,
  createCorsMiddleware,
  createHelmetMiddleware,
  createRateLimiters,
  getSecurityConfig,
} from './middleware/security.js';

const config = getSecurityConfig();
const PORT = Number(process.env.PORT) || 3003;
const HOST = config.host;

const app = express();
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

app.use(createHelmetMiddleware());
app.use(createCorsMiddleware(config));
app.use(express.json({ limit: '2mb' }));

const rateLimiters = createRateLimiters(config);
const apiKeyAuth = createApiKeyAuth(config);
const adminActionGuard = createAdminActionGuard(config);

app.get('/api/ipam/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'prism-ipam',
    version: '1.3',
    authRequired: config.authRequired,
    adminRequired: config.adminRequired,
  });
});

app.get('/api/ipam/capabilities', (_req, res) => {
  res.json(getCapabilities());
});

app.use('/api/ipam/import', rateLimiters.upload);
app.use('/api/ipam/restore', rateLimiters.upload);

app.use('/api/ipam', rateLimiters.api, apiKeyAuth, adminActionGuard, ipamRouter);

app.use((_req, res) => {
  res.status(404).json({ detail: 'Not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[ipam] unhandled error:', err);
  res.status(500).json({ detail: 'Internal server error' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`PRISM Mini IPAM API on http://${HOST}:${PORT} (/api/ipam)`);
  if (config.authRequired) console.log('IPAM API key authentication enabled');
  if (config.adminRequired) console.log('IPAM admin key required for approve/override/decommission and admin routes');
});

function shutdown() {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

import crypto from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export function getSecurityConfig() {
  const apiKey = (process.env.API_KEY || process.env.IPAM_API_KEY || '').trim();
  const adminKey = (process.env.IPAM_ADMIN_KEY || process.env.ADMIN_API_KEY || '').trim();
  const corsOriginsRaw = (process.env.CORS_ORIGINS || '').trim();
  const corsOrigins = corsOriginsRaw
    ? corsOriginsRaw.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const host = (process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';
  const onVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL);
  const trustProxy =
    onVercel || process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

  return {
    apiKey,
    adminKey,
    // Cloud: platform AdminGate (Supabase) protects the UI; no separate IPAM API key in browser.
    authRequired: !onVercel && apiKey.length > 0,
    adminRequired: !onVercel && adminKey.length > 0,
    corsOrigins,
    host,
    trustProxy,
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW_MS,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 300,
    rateLimitUploadMax: Number(process.env.RATE_LIMIT_UPLOAD_MAX) || 20,
  };
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function extractApiKey(req) {
  const header = req.headers.authorization;
  if (header && typeof header === 'string') {
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  const xKey = req.headers['x-api-key'];
  if (xKey && typeof xKey === 'string') return xKey.trim();
  return '';
}

export function createCorsMiddleware(config) {
  if (config.corsOrigins.length > 0) {
    return cors({
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    });
  }

  if (config.authRequired) {
    return cors({ origin: false });
  }

  return cors({ origin: true, credentials: true });
}

export function createHelmetMiddleware() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
}

export function createApiKeyAuth(config) {
  return function apiKeyAuth(req, res, next) {
    if (!config.authRequired) return next();

    const provided = extractApiKey(req);
    if (provided && safeEqual(provided, config.apiKey)) {
      return next();
    }

    res.setHeader('WWW-Authenticate', 'Bearer realm="prism-ipam"');
    return res.status(401).json({ detail: 'Authentication required' });
  };
}

export function createAdminActionGuard(config) {
  return function adminActionGuard(req, res, next) {
    if (!config.adminRequired) return next();

    const action = req.body?.action;
    const adminActions = new Set(['approve', 'override', 'decommission']);
    if (!adminActions.has(action)) return next();

    const adminHeader = req.headers['x-ipam-admin-key'];
    const adminProvided = typeof adminHeader === 'string' ? adminHeader.trim() : '';

    if (adminProvided && safeEqual(adminProvided, config.adminKey)) {
      return next();
    }

    return res.status(403).json({
      detail: 'Admin API key required for approve, override, and decommission actions.',
    });
  };
}

export function createAdminRouteGuard(config) {
  return function adminRouteGuard(req, res, next) {
    if (!config.adminRequired) return next();

    const adminHeader = req.headers['x-ipam-admin-key'];
    const adminProvided = typeof adminHeader === 'string' ? adminHeader.trim() : '';

    if (adminProvided && safeEqual(adminProvided, config.adminKey)) {
      return next();
    }

    return res.status(403).json({ detail: 'Admin API key required for this operation.' });
  };
}

export function createRateLimiters(config) {
  const standardHeaders = true;
  const legacyHeaders = false;

  const api = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders,
    legacyHeaders,
    message: { detail: 'Too many requests, please try again later' },
    skip: (req) => {
      if (req.headers['x-ipam-integration-test'] !== '1') return false;
      const ip = req.ip ?? '';
      return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
    },
  });

  const upload = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitUploadMax,
    standardHeaders,
    legacyHeaders,
    message: { detail: 'Too many upload requests, please try again later' },
  });

  return { api, upload };
}

export function escapeCsvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

import crypto from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export function getSecurityConfig() {
  const apiKey = (process.env.API_KEY || '').trim();
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
    authRequired: apiKey.length > 0,
    corsOrigins,
    host,
    trustProxy,
    rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || DEFAULT_WINDOW_MS,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 300,
    rateLimitUploadMax: Number(process.env.RATE_LIMIT_UPLOAD_MAX) || 20,
    rateLimitChatMax: Number(process.env.RATE_LIMIT_CHAT_MAX) || 30,
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

  return cors();
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

    res.setHeader('WWW-Authenticate', 'Bearer realm="dc-inventory"');
    return res.status(401).json({ error: 'Authentication required' });
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
    message: { error: 'Too many requests, please try again later' },
  });

  const upload = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitUploadMax,
    standardHeaders,
    legacyHeaders,
    message: { error: 'Too many upload requests, please try again later' },
  });

  const chat = rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitChatMax,
    standardHeaders,
    legacyHeaders,
    message: { error: 'Too many chat requests, please try again later' },
  });

  return { api, upload, chat };
}

let cachedRateLimiters = null;

/** Shared rate limiters (one counter store per tier across all routes). */
export function getRateLimiters() {
  if (!cachedRateLimiters) {
    cachedRateLimiters = createRateLimiters(getSecurityConfig());
  }
  return cachedRateLimiters;
}

/** Prevent CSV formula injection when files are opened in Excel. */
export function escapeCsvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvUploadFileFilter(req, file, cb) {
  const name = (file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const okExt = name.endsWith('.csv');
  const okMime =
    mime === 'text/csv' ||
    mime === 'application/csv' ||
    mime === 'text/plain' ||
    mime === 'application/vnd.ms-excel';
  if (okExt || okMime) {
    cb(null, true);
    return;
  }
  cb(new Error('Only CSV files are allowed'));
}

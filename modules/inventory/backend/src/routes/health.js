import { Router } from 'express';
import db, { dbDialect } from '../db/index.js';
import { getSecurityConfig } from '../middleware/security.js';
import { formatPgError } from 'prism-db';

const router = Router();

router.get('/', (req, res) => {
  const config = getSecurityConfig();
  const payload = {
    ok: true,
    authRequired: config.authRequired,
    dialect: dbDialect,
  };

  if (dbDialect === 'postgres' && typeof db.ping === 'function') {
    try {
      db.ping();
      payload.db = 'ok';
    } catch (e) {
      payload.ok = false;
      payload.db = 'error';
      payload.error = formatPgError(e);
      return res.status(503).json(payload);
    }
  }

  res.json(payload);
});

export default router;

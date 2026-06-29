import { Router } from 'express';
import db, { dbDialect } from '../db/index.js';
import { getSecurityConfig } from '../middleware/security.js';
import { formatPgError } from 'prism-db';
import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

router.get('/', async (req, res) => {
  const config = getSecurityConfig();
  const payload = {
    ok: true,
    authRequired: config.authRequired,
    dialect: dbDialect,
  };

  if (dbDialect === 'postgres' && typeof db.ping === 'function') {
    try {
      await db.ping();
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

promisifyRouter(router);

export default router;

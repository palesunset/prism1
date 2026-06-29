import { Router } from 'express';
import { getSecurityConfig } from '../middleware/security.js';
import { fetchInventoryBootstrap } from '../services/sitesList.js';
import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

router.get('/', async (_req, res) => {
  const config = getSecurityConfig();
  const payload = await fetchInventoryBootstrap();
  res.json({ ...payload, authRequired: config.authRequired });
});

promisifyRouter(router);

export default router;

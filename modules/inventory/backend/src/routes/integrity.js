import { Router } from 'express';
import { findDuplicateIpGroups } from '../utils/ipAddress.js';
import { promisifyRouter } from 'prism-db/expressAsync.js';

const router = Router();

router.get('/integrity', async (_req, res) => {
  const duplicate_ips = await findDuplicateIpGroups();
  res.json({
    health_ok: duplicate_ips.length === 0,
    duplicate_ip_count: duplicate_ips.length,
    duplicate_ips,
  });
});

promisifyRouter(router);

export default router;

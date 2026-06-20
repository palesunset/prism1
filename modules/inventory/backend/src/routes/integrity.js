import { Router } from 'express';
import { findDuplicateIpGroups } from '../utils/ipAddress.js';

const router = Router();

router.get('/integrity', (_req, res) => {
  const duplicate_ips = findDuplicateIpGroups();
  res.json({
    health_ok: duplicate_ips.length === 0,
    duplicate_ip_count: duplicate_ips.length,
    duplicate_ips,
  });
});

export default router;

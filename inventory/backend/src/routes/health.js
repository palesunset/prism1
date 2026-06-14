import { Router } from 'express';
import { getSecurityConfig } from '../middleware/security.js';

const router = Router();

router.get('/', (req, res) => {
  const config = getSecurityConfig();
  res.json({
    ok: true,
    authRequired: config.authRequired,
  });
});

export default router;

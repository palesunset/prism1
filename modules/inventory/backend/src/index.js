import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import db from './db/index.js';
import { normalizeExistingIpAddresses } from './utils/ipAddress.js';
import sitesRouter from './routes/sites.js';
import equipmentRouter from './routes/equipment.js';
import slotsRouter from './routes/slots.js';
import portsRouter from './routes/ports.js';
import searchRouter from './routes/search.js';
import ozChatRouter from './routes/ozChat.js';
import statsRouter from './routes/stats.js';
import equipmentBaysRouter from './routes/equipmentBays.js';
import dashboardRouter from './routes/dashboard.js';
import healthRouter from './routes/health.js';
import integrityRouter from './routes/integrity.js';
import { ensureOzWarmup } from './services/ozAI.js';
import {
  getSecurityConfig,
  createCorsMiddleware,
  createHelmetMiddleware,
  createApiKeyAuth,
  getRateLimiters,
  escapeCsvCell,
} from './middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = getSecurityConfig();
const PORT = Number(process.env.PORT) || 3001;

const INVENTORY_API = '/api/inventory';

const app = express();
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

normalizeExistingIpAddresses();

app.use(createHelmetMiddleware());
app.use(createCorsMiddleware(config));
app.use(express.json({ limit: '1mb' }));

app.use(`${INVENTORY_API}/health`, healthRouter);

const rateLimiters = getRateLimiters();
const apiKeyAuth = createApiKeyAuth(config);

app.use(`${INVENTORY_API}/chat`, (req, res, next) => {
  // Lightweight readiness probe — do not count against chat POST rate limit.
  if (req.method === 'GET' && (req.path === '/status' || req.path.endsWith('/status'))) {
    return next();
  }
  return rateLimiters.chat(req, res, next);
});
app.use(INVENTORY_API, rateLimiters.api);
app.use(INVENTORY_API, apiKeyAuth);

app.use(`${INVENTORY_API}/sites`, sitesRouter);
app.use(`${INVENTORY_API}/equipment`, equipmentRouter);
app.use(`${INVENTORY_API}/slots`, slotsRouter);
app.use(`${INVENTORY_API}/ports`, portsRouter);
app.use(INVENTORY_API, equipmentBaysRouter);
app.use(`${INVENTORY_API}/chat`, ozChatRouter);
app.use(INVENTORY_API, statsRouter);
app.use(INVENTORY_API, searchRouter);
app.use(`${INVENTORY_API}/dashboard`, dashboardRouter);
app.use(INVENTORY_API, integrityRouter);

app.get(`${INVENTORY_API}/export/equipment`, (req, res) => {
  const rows = db
    .prepare(
      `
    SELECT
      s.name AS site_name,
      s.plaid AS site_plaid,
      s.area,
      s.region,
      e.vendor,
      e.model,
      COALESCE(NULLIF(TRIM(e.network_element), ''), e.model) AS network_element,
      e.serial_number,
      e.ip_address,
      e.software_version,
      e.descriptor_version,
      e.status,
      e.rack_position,
      e.end_of_life,
      COUNT(p.id) AS total_ports,
      COALESCE(SUM(CASE WHEN p.is_utilized = 1 THEN 1 ELSE 0 END), 0) AS utilized_ports
    FROM equipment e
    JOIN sites s ON s.id = e.site_id
    LEFT JOIN slots sl ON sl.equipment_id = e.id
    LEFT JOIN ports p ON p.slot_id = sl.id
    GROUP BY e.id
    ORDER BY s.name, e.vendor, e.model
  `
    )
    .all();

  const header = [
    'Site Name',
    'PLAID',
    'Area',
    'Region',
    'Vendor',
    'Network Element',
    'Model',
    'Serial Number',
    'IP Address',
    'Software Version',
    'Descriptor Version',
    'Status',
    'Rack Position',
    'End of Life',
    'Total Ports',
    'Utilized Ports',
    'Free Ports',
    'Utilization %',
  ];
  const lines = [header.join(',')];
  for (const e of rows) {
    const total = e.total_ports || 0;
    const used = e.utilized_ports || 0;
    const free = total - used;
    const pct = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0';
    lines.push(
      [
        escapeCsvCell(e.site_name),
        escapeCsvCell(e.site_plaid),
        escapeCsvCell(e.area),
        escapeCsvCell(e.region),
        escapeCsvCell(e.vendor),
        escapeCsvCell(e.network_element),
        escapeCsvCell(e.model),
        escapeCsvCell(e.serial_number),
        escapeCsvCell(e.ip_address),
        escapeCsvCell(e.software_version),
        escapeCsvCell(e.descriptor_version),
        escapeCsvCell(e.status),
        escapeCsvCell(e.rack_position),
        escapeCsvCell(e.end_of_life),
        total,
        used,
        free,
        pct,
      ].join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="all-equipment-export.csv"');
  res.send(lines.join('\n'));
});

app.use((err, req, res, next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (max 5 MB)' });
  }
  if (err?.message === 'Only CSV files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, config.host, () => {
  const bind = config.host === '0.0.0.0' ? 'all interfaces' : config.host;
  console.log(`Network Equipment Inventory API on http://${bind}:${PORT}`);
  if (config.authRequired) {
    console.log('API key authentication is enabled (API_KEY)');
  } else {
    console.log('WARNING: API_KEY is not set — API is open on the bound interface');
  }
  ensureOzWarmup();
});

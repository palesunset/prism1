import express from "express";
import { formatPgError } from "prism-db";
import { isPostgresMode } from "./db/index.js";
import { normalizeExistingIpAddresses } from "./utils/ipAddress.js";
import healthRouter from "./routes/health.js";
import bootstrapRouter from "./routes/bootstrap.js";
import { lazyMount } from "../../../../server/lazyExpress.js";
import { mountInventoryRoutes } from "./mountInventoryRoutes.js";
import {
  getSecurityConfig,
  createCorsMiddleware,
  createHelmetMiddleware,
  createApiKeyAuth,
  getRateLimiters,
} from "./middleware/security.js";

const INVENTORY_API = "/api/inventory";

let normalized = false;

export function createInventoryApp() {
  const config = getSecurityConfig();
  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);

  if (!normalized) {
    if (!isPostgresMode()) {
      void normalizeExistingIpAddresses().catch((e) => {
        console.warn("[inventory] IP normalize skipped:", e?.message || e);
      });
    }
    normalized = true;
  }

  app.use(createHelmetMiddleware());
  app.use(createCorsMiddleware(config));
  app.use(express.json({ limit: "1mb" }));

  app.use(`${INVENTORY_API}/health`, healthRouter);

  const rateLimiters = getRateLimiters();
  const apiKeyAuth = createApiKeyAuth(config);

  app.use(INVENTORY_API, rateLimiters.api);
  app.use(INVENTORY_API, apiKeyAuth);
  app.use(`${INVENTORY_API}/bootstrap`, bootstrapRouter);
  app.use(lazyMount(mountInventoryRoutes));

  app.use((err, req, res, next) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File too large (max 5 MB)" });
    }
    if (err?.message === "Only CSV files are allowed") {
      return res.status(400).json({ error: err.message });
    }
    if (err?.message === "Not allowed by CORS") {
      return res.status(403).json({ error: "Origin not allowed" });
    }
    console.error(err);
    const message = formatPgError(err);
    res.status(500).json({ error: message || "Internal server error" });
  });

  return app;
}

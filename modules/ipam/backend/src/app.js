import express from "express";
import ipamRouter from "./routes/ipam.js";
import db, { dbDialect } from "./db/index.js";
import { formatPgError } from "prism-db";
import { getCapabilities } from "./services/ipamAnalytics.js";
import {
  createApiKeyAuth,
  createAdminActionGuard,
  createCorsMiddleware,
  createHelmetMiddleware,
  createRateLimiters,
  getSecurityConfig,
} from "./middleware/security.js";

export function createIpamApp() {
  const config = getSecurityConfig();
  const app = express();
  if (config.trustProxy) app.set("trust proxy", 1);

  app.use(createHelmetMiddleware());
  app.use(createCorsMiddleware(config));
  app.use(express.json({ limit: "2mb" }));

  const rateLimiters = createRateLimiters(config);
  const apiKeyAuth = createApiKeyAuth(config);
  const adminActionGuard = createAdminActionGuard(config);

  app.get("/api/ipam/health", (_req, res) => {
    const payload = {
      status: "ok",
      service: "prism-ipam",
      version: "1.3",
      authRequired: config.authRequired,
      adminRequired: config.adminRequired,
      dialect: dbDialect,
    };
    if (dbDialect === "postgres" && typeof db.ping === "function") {
      try {
        db.ping();
        return res.json({ ...payload, db: "ok" });
      } catch (e) {
        return res.status(503).json({
          ...payload,
          status: "error",
          db: "error",
          error: formatPgError(e),
        });
      }
    }
    res.json({ ...payload, db: "ok" });
  });

  app.get("/api/ipam/capabilities", (_req, res) => {
    res.json(getCapabilities());
  });

  app.use("/api/ipam/import", rateLimiters.upload);
  app.use("/api/ipam/restore", rateLimiters.upload);
  app.use("/api/ipam", rateLimiters.api, apiKeyAuth, adminActionGuard, ipamRouter);

  app.use((_req, res) => {
    res.status(404).json({ detail: "Not found" });
  });

  app.use((err, _req, res, _next) => {
    console.error("[ipam] unhandled error:", err);
    const detail = formatPgError(err);
    res.status(500).json({ detail: detail || "Internal server error" });
  });

  return app;
}

export function closeIpamDb() {
  try {
    db.close?.();
  } catch {
    /* ignore */
  }
}

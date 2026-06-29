import { createNotesApp } from "../modules/notes/backend/src/app.js";
import { createIpamApp } from "../modules/ipam/backend/src/app.js";
import { createInventoryApp } from "../modules/inventory/backend/src/app.js";
import express from "express";

/** Unified Node API for Vercel (notes, IPAM, inventory). */
export function createPlatformApi() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(createNotesApp());
  app.use(createIpamApp());
  app.use(createInventoryApp());
  app.use("/api", (_req, res) => {
    res.status(404).json({ detail: "Not found" });
  });
  return app;
}

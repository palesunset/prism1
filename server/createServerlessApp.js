import express from "express";
import { createNotesApp } from "../modules/notes/backend/src/app.js";
import { createIpamApp } from "../modules/ipam/backend/src/app.js";
import { createInventoryApp } from "../modules/inventory/backend/src/app.js";

/** @typedef {"all" | "inventory" | "ipam" | "notes"} ServerlessScope */

/** Isolated serverless apps — avoids one slow module blocking all APIs (504 cascades). */
export function createServerlessApp(scope = "all") {
  const app = express();
  app.set("trust proxy", 1);

  if (scope === "all" || scope === "notes") app.use(createNotesApp());
  if (scope === "all" || scope === "ipam") app.use(createIpamApp());
  if (scope === "all" || scope === "inventory") app.use(createInventoryApp());

  app.use("/api", (_req, res) => {
    res.status(404).json({ detail: "Not found" });
  });

  return app;
}

import express from "express";

/** @typedef {"all" | "inventory" | "ipam" | "notes"} ServerlessScope */

/** Isolated serverless apps — only import the backend module that is needed. */
export async function createServerlessApp(scope = "all") {
  const app = express();
  app.set("trust proxy", 1);

  if (scope === "all" || scope === "notes") {
    const { createNotesApp } = await import("../modules/notes/backend/src/app.js");
    app.use(createNotesApp());
  }
  if (scope === "all" || scope === "ipam") {
    const { createIpamApp } = await import("../modules/ipam/backend/src/app.js");
    app.use(createIpamApp());
  }
  if (scope === "all" || scope === "inventory") {
    const { createInventoryApp } = await import("../modules/inventory/backend/src/app.js");
    app.use(createInventoryApp());
  }

  app.use("/api", (_req, res) => {
    res.status(404).json({ detail: "Not found" });
  });

  return app;
}

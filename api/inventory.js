import serverless from "serverless-http";
import { createServerlessApp } from "../server/createServerlessApp.js";

function bootApp(createApp) {
  try {
    const app = createApp();
    return serverless(app, {
      binary: ["multipart/form-data", "application/octet-stream"],
    });
  } catch (err) {
    console.error("[api/inventory] Failed to start:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return async (_req, res) => {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Inventory API failed to start", detail }));
    };
  }
}

export default bootApp(() => createServerlessApp("inventory"));

export const config = {
  maxDuration: 60,
  memory: 1024,
};

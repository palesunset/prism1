import serverless from "serverless-http";
import { createServerlessApp } from "../server/createServerlessApp.js";

function bootApp(createApp) {
  try {
    const app = createApp();
    return serverless(app);
  } catch (err) {
    console.error("[api/notes] Failed to start:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return async (_req, res) => {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Notes API failed to start", detail }));
    };
  }
}

export default bootApp(() => createServerlessApp("notes"));

export const config = {
  maxDuration: 60,
  memory: 512,
};

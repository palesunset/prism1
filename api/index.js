import serverless from "serverless-http";
import { createPlatformApi } from "../server/createPlatformApi.js";

let handler;

try {
  const app = createPlatformApi();
  handler = serverless(app, {
    binary: ["multipart/form-data", "application/octet-stream"],
  });
} catch (err) {
  console.error("[api] Failed to start platform API:", err);
  const detail = err instanceof Error ? err.message : String(err);
  handler = async (_req, res) => {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "API failed to start", detail }));
  };
}

export default handler;

export const config = {
  maxDuration: 60,
  memory: 1024,
};

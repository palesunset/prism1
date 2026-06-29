import serverless from "serverless-http";

/** Wrap an Express app factory for Vercel serverless with a safe boot fallback. */
export function bootServerless(createApp, label = "api") {
  try {
    const app = createApp();
    return serverless(app, {
      binary: ["multipart/form-data", "application/octet-stream"],
    });
  } catch (err) {
    console.error(`[${label}] Failed to start:`, err);
    const detail = err instanceof Error ? err.message : String(err);
    return async (_req, res) => {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `${label} failed to start`, detail }));
    };
  }
}

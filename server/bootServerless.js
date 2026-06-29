import serverless from "serverless-http";

const SERVERLESS_OPTS = {
  binary: ["multipart/form-data", "application/octet-stream"],
};

/** Wrap a sync Express app factory for Vercel serverless with a safe boot fallback. */
export function bootServerless(createApp, label = "api") {
  try {
    const app = createApp();
    return serverless(app, SERVERLESS_OPTS);
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

/** Async factory — defers heavy module graph until the first request (faster cold path). */
export function bootServerlessAsync(createAppAsync, label = "api") {
  let handlerPromise = null;

  return async (req, res) => {
    try {
      if (!handlerPromise) {
        handlerPromise = createAppAsync().then((app) => serverless(app, SERVERLESS_OPTS));
      }
      const handler = await handlerPromise;
      return handler(req, res);
    } catch (err) {
      console.error(`[${label}] Failed to start:`, err);
      const detail = err instanceof Error ? err.message : String(err);
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `${label} failed to start`, detail }));
    }
  };
}

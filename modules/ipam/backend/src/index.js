import "dotenv/config";
import { createIpamApp, closeIpamDb } from "./app.js";
import { getSecurityConfig } from "./middleware/security.js";

const config = getSecurityConfig();
const PORT = Number(process.env.PORT) || 3003;
const HOST = config.host;

const app = createIpamApp();
const server = app.listen(PORT, HOST, () => {
  console.log(`PRISM Mini IPAM API on http://${HOST}:${PORT} (/api/ipam)`);
  if (config.authRequired) console.log("IPAM API key authentication enabled");
  if (config.adminRequired) console.log("IPAM admin key required for approve/override/decommission and admin routes");
});

function shutdown() {
  closeIpamDb();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

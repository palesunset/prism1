import "dotenv/config";
import { createInventoryApp } from "./app.js";
import { getSecurityConfig } from "./middleware/security.js";

const config = getSecurityConfig();
const PORT = Number(process.env.PORT) || 3001;

const app = createInventoryApp();
app.listen(PORT, config.host, () => {
  const bind = config.host === "0.0.0.0" ? "all interfaces" : config.host;
  console.log(`Network Equipment Inventory API on http://${bind}:${PORT}`);
  if (config.authRequired) {
    console.log("API key authentication is enabled (API_KEY)");
  } else {
    console.log("WARNING: API_KEY is not set — API is open on the bound interface");
  }
});

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

const inventorySrc = path.resolve(__dirname, "../../inventory/frontend/src");
const inventoryFonts = path.resolve(__dirname, "../../inventory/frontend/public/fonts");
const lspSrc = path.resolve(__dirname, "../../frontend/src");

function inventoryFontsPlugin(): Plugin {
  return {
    name: "inventory-fonts",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/fonts/")) return next();
        const file = path.join(inventoryFonts, path.basename(req.url));
        if (!fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "font/woff2");
        fs.createReadStream(file).pipe(res);
      });
    },
    writeBundle() {
      const outFonts = path.resolve(__dirname, "dist/fonts");
      fs.mkdirSync(outFonts, { recursive: true });
      for (const name of fs.readdirSync(inventoryFonts)) {
        fs.copyFileSync(path.join(inventoryFonts, name), path.join(outFonts, name));
      }
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [react(), inventoryFontsPlugin()],
  resolve: {
    dedupe: ["react", "react-dom", "react-router-dom", "@tanstack/react-query", "zustand", "axios"],
    alias: [
      { find: /^@\/(.*)/, replacement: `${inventorySrc}/$1` },
      { find: "@lsp", replacement: lspSrc },
      { find: "@inventory", replacement: inventorySrc },
    ],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("leaflet") || id.includes("react-leaflet")) return "leaflet";
          if (id.includes("recharts")) return "recharts";
          if (id.includes("cytoscape")) return "cytoscape";
          if (id.includes("react")) return "react";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api/lsp": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/api/inventory": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const platformDir = path.dirname(fileURLToPath(import.meta.url));
const platformEntry = path.resolve(platformDir, "src/main.tsx");
const inventorySrc = path.resolve(platformDir, "../../inventory/frontend/src");
const inventoryFonts = path.resolve(platformDir, "../../inventory/frontend/public/fonts");
const lspSrc = path.resolve(platformDir, "../../frontend/src");

/** Bare imports from aliased workspace src must resolve via platform/node_modules on CI. */
function resolveWorkspaceDepsPlugin(workspaceRoots: string[]): Plugin {
  const normalizedRoots = workspaceRoots.map((root) => path.normalize(root).toLowerCase());
  return {
    name: "prism-resolve-workspace-deps",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer) return null;
      if (source.startsWith(".") || source.startsWith("/") || source.startsWith("\0")) return null;
      if (source.startsWith("@/")) return null;
      if (source === "@lsp" || source.startsWith("@lsp/")) return null;
      if (source.startsWith("@inventory")) return null;

      const normImporter = path.normalize(importer).toLowerCase();
      const fromWorkspace = normalizedRoots.some((root) => normImporter.startsWith(root));
      if (!fromWorkspace) return null;

      return this.resolve(source, platformEntry, { ...options, skipSelf: true });
    },
  };
}

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
      const outFonts = path.resolve(platformDir, "dist/fonts");
      fs.mkdirSync(outFonts, { recursive: true });
      for (const name of fs.readdirSync(inventoryFonts)) {
        fs.copyFileSync(path.join(inventoryFonts, name), path.join(outFonts, name));
      }
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [react(), resolveWorkspaceDepsPlugin([lspSrc, inventorySrc]), inventoryFontsPlugin()],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react-router-dom",
      "@tanstack/react-query",
      "zustand",
      "axios",
      "react-hot-toast",
      "cytoscape",
      "cytoscape-cose-bilkent",
      "lucide-react",
    ],
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
      "/api/notes": {
        target: "http://127.0.0.1:3002",
        changeOrigin: true,
      },
      "/api/ipam": {
        target: "http://127.0.0.1:3003",
        changeOrigin: true,
      },
    },
  },
});

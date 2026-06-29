import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const platformDir = path.dirname(fileURLToPath(import.meta.url));
const platformEntry = path.resolve(platformDir, "src/main.tsx");
const platformPublic = path.resolve(platformDir, "public");
const inventoryPublic = path.resolve(platformDir, "../../modules/inventory/frontend/public");
const inventorySrc = path.resolve(platformDir, "../../modules/inventory/frontend/src");
const lspSrc = path.resolve(platformDir, "../../modules/lsp/frontend/src");

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

function platformPublicAssetsPlugin(): Plugin {
  return {
    name: "platform-public-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/prism-favicon.svg") return next();
        const file = path.join(platformPublic, "prism-favicon.svg");
        if (!fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "image/svg+xml");
        fs.createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      const favicon = path.join(platformPublic, "prism-favicon.svg");
      if (!fs.existsSync(favicon)) return;
      this.emitFile({
        type: "asset",
        fileName: "prism-favicon.svg",
        source: fs.readFileSync(favicon),
      });
    },
  };
}

export default defineConfig({
  appType: "spa",
  publicDir: inventoryPublic,
  plugins: [react(), resolveWorkspaceDepsPlugin([lspSrc, inventorySrc]), platformPublicAssetsPlugin()],
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
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            { name: "cytoscape", test: /[\\/]node_modules[\\/]cytoscape/ },
            { name: "leaflet", test: /[\\/]node_modules[\\/](leaflet|react-leaflet)/ },
            { name: "recharts", test: /[\\/]node_modules[\\/](recharts|d3-|victory-vendor)/ },
            { name: "pdf", test: /[\\/]node_modules[\\/]jspdf/ },
            { name: "syntax", test: /[\\/]node_modules[\\/](react-syntax-highlighter|refractor)/ },
            { name: "motion", test: /[\\/]node_modules[\\/]framer-motion/ },
            { name: "react", test: /[\\/]node_modules[\\/]react(-dom)?[\\/]/ },
            { name: "vendor", test: /[\\/]node_modules[\\/]/ },
          ],
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

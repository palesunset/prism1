#!/usr/bin/env node
/**
 * Platform integration smoke tests — run both APIs first, then:
 *   node scripts/smoke-test.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "..", "modules", "lsp", "backend", "tests", "fixtures");
const LSP = "http://127.0.0.1:5000";
const INV = "http://127.0.0.1:3001";
const IPAM = "http://127.0.0.1:3003";

async function get(url) {
  const res = await fetch(url);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function postMultipart(url, files) {
  const fd = new FormData();
  for (const [name, file] of Object.entries(files)) {
    fd.append(name, file);
  }
  const res = await fetch(url, { method: "POST", body: fd });
  const body = await res.json();
  return { status: res.status, body };
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  return { status: res.status, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("PRISM platform smoke tests\n");

  const lspHealth = await get(`${LSP}/api/lsp/health`);
  assert(lspHealth.status === 200 && lspHealth.body.status === "ok", "LSP health failed");
  console.log("✓ LSP API health");

  const invHealth = await get(`${INV}/api/inventory/health`);
  assert(invHealth.status === 200 && invHealth.body.ok === true, "Inventory health failed");
  console.log("✓ Inventory API health");

  const ipamHealth = await get(`${IPAM}/api/ipam/health`);
  assert(ipamHealth.status === 200 && ipamHealth.body.service === "prism-ipam", "IPAM health failed");
  console.log("✓ IPAM API health");

  const nesBuf = fs.readFileSync(path.join(FIXTURES, "minimal_nes.csv"));
  const linksBuf = fs.readFileSync(path.join(FIXTURES, "minimal_links.csv"));
  const importRes = await postMultipart(`${LSP}/api/lsp/import`, {
    nes_file: new File([nesBuf], "minimal_nes.csv", { type: "text/csv" }),
    links_file: new File([linksBuf], "minimal_links.csv", { type: "text/csv" }),
  });
  assert(importRes.status === 200, `LSP import failed: ${JSON.stringify(importRes.body)}`);
  console.log("✓ LSP CSV import");

  const topo = await get(`${LSP}/api/lsp/topology`);
  assert(topo.status === 200 && Array.isArray(topo.body.nodes) && topo.body.nodes.length >= 3, "LSP topology failed");
  console.log("✓ LSP topology");

  const compute = await postJson(`${LSP}/api/lsp/compute`, {
    source_ne_id: "A",
    destination_ne_id: "C",
    required_bw_mbps: null,
    max_hops: 32,
    mode: "rsvp_te",
    failed_ne_ids: [],
    failed_link_keys: [],
  });
  assert(compute.status === 200 && compute.body.primary?.nodes?.length, "LSP compute failed");
  console.log("✓ LSP CSPF compute");

  const sites = await get(`${INV}/api/inventory/sites`);
  assert(sites.status === 200 && Array.isArray(sites.body), "Inventory sites list failed");
  console.log("✓ Inventory sites");

  const stats = await get(`${INV}/api/inventory/stats`);
  assert(stats.status === 200, "Inventory stats failed");
  console.log("✓ Inventory stats");

  console.log("\nAll smoke tests passed.");
}

main().catch((err) => {
  console.error("\nSmoke test failed:", err.message);
  console.error("Ensure APIs are running: npm run dev (LSP, inventory, IPAM)");
  process.exit(1);
});

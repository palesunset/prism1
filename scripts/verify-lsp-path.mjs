#!/usr/bin/env node
/**
 * Verify a manual NE path against imported LSP CSVs.
 *
 * Usage:
 *   node scripts/verify-lsp-path.mjs nes.csv links.csv SOURCE DEST "N1,N2,N3,..."
 */
import fs from "fs";

const [nesPath, linksPath, source, dest, pathArg] = process.argv.slice(2);
if (!nesPath || !linksPath || !source || !dest || !pathArg) {
  console.error(
    "Usage: node scripts/verify-lsp-path.mjs nes.csv links.csv SOURCE DEST \"N1,N2,N3,...\"",
  );
  process.exit(1);
}

const manualPath = pathArg.split(",").map((s) => s.trim()).filter(Boolean);

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line, idx) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    row.__row = idx + 2;
    return row;
  });
}

const nesRows = parseCsv(fs.readFileSync(nesPath, "utf8"));
const linkRows = parseCsv(fs.readFileSync(linksPath, "utf8"));
const neIds = new Set(nesRows.map((r) => r.ne_id || r.ne || r.name).filter(Boolean));

const adj = new Map();
function addEdge(a, b, row) {
  if (!adj.has(a)) adj.set(a, []);
  if (!adj.has(b)) adj.set(b, []);
  adj.get(a).push({ to: b, row });
  adj.get(b).push({ to: a, row });
}

let skippedLinks = 0;
for (const row of linkRows) {
  const a = row.source || row.src;
  const b = row.target || row.dst;
  if (!a || !b) continue;
  if (!neIds.has(a) || !neIds.has(b)) {
    skippedLinks += 1;
    console.warn(`SKIP link row ${row.__row}: unknown NE ${a} -> ${b}`);
    continue;
  }
  addEdge(a, b, row);
}

console.log(`NEs: ${neIds.size}, links loaded: ${linkRows.length - skippedLinks}, skipped: ${skippedLinks}`);
console.log(`Manual path: ${manualPath.join(" -> ")}`);

let ok = true;
for (const ne of manualPath) {
  if (!neIds.has(ne)) {
    console.error(`MISSING NE in nes.csv: ${ne}`);
    ok = false;
  }
}
if (manualPath[0] !== source) {
  console.warn(`Note: path starts at ${manualPath[0]}, source arg is ${source}`);
}
if (manualPath.at(-1) !== dest) {
  console.warn(`Note: path ends at ${manualPath.at(-1)}, dest arg is ${dest}`);
}

for (let i = 0; i < manualPath.length - 1; i += 1) {
  const a = manualPath[i];
  const b = manualPath[i + 1];
  const nbrs = adj.get(a) || [];
  if (!nbrs.some((e) => e.to === b)) {
    console.error(`NO LINK: ${a} -> ${b}`);
    ok = false;
  }
}

if (ok) {
  console.log("OK: every hop in the manual path exists in links.csv (undirected check).");
} else {
  console.error("FAIL: manual path cannot be fully traversed with current CSVs.");
  process.exit(1);
}

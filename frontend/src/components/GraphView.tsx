import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PathResult, TopologyPayload } from "../types";
import { baseStylesheet } from "../utils/layoutConfig";
import { useAppStore } from "../store/useAppStore";
import { loadLayoutPositions, saveLayoutPositions } from "../utils/layoutCache";

cytoscape.use(coseBilkent);

function normalizeEdgeParts(a: string, b: string, k: number): string {
  const x = a <= b ? a : b;
  const y = a <= b ? b : a;
  return `${x}|${y}|${k}`;
}

function edgeKeyTuple(e: [string, string, number]): string {
  return normalizeEdgeParts(e[0], e[1], e[2]);
}

function normalizeEdgeId(id: string): string {
  const parts = id.split("|");
  if (parts.length !== 3) return id;
  const k = Number(parts[2]);
  if (!Number.isFinite(k)) return id;
  return normalizeEdgeParts(parts[0], parts[1], k);
}

function buildElements(topology: TopologyPayload): ElementDefinition[] {
  const elements: ElementDefinition[] = [];
  const sites = new Set<string>();
  for (const n of topology.nodes) {
    sites.add(String(n.data.site ?? "default"));
  }
  for (const s of sites) {
    elements.push({ data: { id: `site:${s}`, label: s }, classes: "site" });
  }
  for (const n of topology.nodes) {
    const id = String(n.data.id);
    const site = String(n.data.site ?? "default");
    const role = String(n.data.role ?? "agg");
    elements.push({
      data: {
        id,
        parent: `site:${site}`,
        label: id,
        shortLabel: id,
        site,
        role,
        vendor: String(n.data.vendor ?? ""),
        loopback_ipv4: String(n.data.loopback_ipv4 ?? ""),
        node_sid: n.data.node_sid,
      },
      classes: "ne",
    });
  }
  for (const e of topology.edges) {
    const d = e.data;
    const id = String(d.id);
    const src = String(d.source);
    const tgt = String(d.target);
    const pidx = Number(d.parallel_index ?? 0) % 3;
    elements.push({
      data: {
        id,
        source: src,
        target: tgt,
        latency_ms: Number(d.latency_ms ?? 0),
        bandwidth_mbps: Number(d.bandwidth_mbps ?? 0),
        reservable_bw_mbps: Number(d.reservable_bw_mbps ?? 0),
        interface_src: String(d.interface_src ?? ""),
        interface_dst: String(d.interface_dst ?? ""),
        utilization: 0,
      },
      classes: `parallel${pidx}`,
    });
  }
  return elements;
}

export function GraphView(props: {
  topology: TopologyPayload | null;
  topologyRevision: number;
  primary: PathResult | null;
  backup: PathResult | null;
  focusPaths: boolean;
  busy?: boolean;
  onBrowseFiles?: () => void;
  onLoadSample?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "node" | "edge"; id: string } | null>(
    null,
  );
  const [tooltip, setTooltip] = useState<{ x: number; y: number; html: string } | null>(null);
  const failedNeIds = useAppStore((s) => s.failedNeIds);
  const failedLinkKeys = useAppStore((s) => s.failedLinkKeys);
  const heatmapEnabled = useAppStore((s) => s.heatmapEnabled);
  const reservations = useAppStore((s) => s.reservations);
  const failNe = useAppStore((s) => s.failNe);
  const failLink = useAppStore((s) => s.failLink);

  const applyZoomLabels = useCallback((cy: Core) => {
    const z = cy.zoom();
    const showFull = z > 1.5;
    cy.batch(() => {
      cy.nodes(".ne").forEach((n) => {
        n.data("shortLabel", showFull ? n.id() : "");
      });
      cy.nodes(".site").forEach((s) => {
        s.style("label", showFull ? s.data("label") : s.data("label"));
      });
    });
  }, []);

  useEffect(() => {
    if (!props.topology || !containerRef.current) {
      return;
    }
    const elements = buildElements(props.topology);
    const cached = loadLayoutPositions(props.topology);
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: baseStylesheet,
      minZoom: 0.05,
      maxZoom: 4,
      hideEdgesOnViewport: true,
      hideLabelsOnViewport: true,
      textureOnViewport: true,
    });
    const topoRef = props.topology;
    if (cached) {
      cy.batch(() => {
        cy.nodes().forEach((n) => {
          const p = cached[n.id()];
          if (p) {
            n.position(p);
          }
        });
      });
      cy.fit(undefined, 48);
    } else {
      cy.one("layoutstop", () => {
        const pos: Record<string, { x: number; y: number }> = {};
        cy.nodes().forEach((n) => {
          const p = n.position();
          pos[n.id()] = { x: p.x, y: p.y };
        });
        saveLayoutPositions(topoRef, pos);
      });
      cy.layout({
        name: "cose-bilkent",
        animate: false,
        randomize: false,
      } as cytoscape.LayoutOptions).run();
      cy.fit(undefined, 48);
    }
    cy.on("zoom", () => applyZoomLabels(cy));
    applyZoomLabels(cy);

    cy.on("mouseover", "node.ne, edge", (evt) => {
      const t = evt.target;
      const p = evt.originalEvent as MouseEvent;
      if (t.group() === "nodes" && t.hasClass("ne")) {
        const html = [
          `<div><strong>${t.id()}</strong></div>`,
          `<div>IPv4: ${t.data("loopback_ipv4")}</div>`,
          `<div>Vendor: ${t.data("vendor")}</div>`,
        ].join("");
        setTooltip({ x: p.clientX + 12, y: p.clientY + 12, html });
      } else if (t.group() === "edges") {
        const srlg = Array.isArray(t.data("srlg")) ? (t.data("srlg") as unknown[]).join(", ") : "";
        const html = [
          `<div><strong>Link</strong></div>`,
          `<div>Latency: ${t.data("latency_ms")} ms</div>`,
          `<div>Reservable: ${t.data("reservable_bw_mbps")} Mbps</div>`,
          `<div>${t.data("interface_src")} ⇄ ${t.data("interface_dst")}</div>`,
          srlg ? `<div>SRLG: ${srlg}</div>` : "",
        ].join("");
        setTooltip({ x: p.clientX + 12, y: p.clientY + 12, html });
      }
    });
    cy.on("mouseout", "node.ne, edge", () => setTooltip(null));

    cy.on("cxttap", "node.ne", (evt) => {
      evt.preventDefault();
      const n = evt.target;
      const p = evt.originalEvent as MouseEvent;
      setMenu({ x: p.clientX, y: p.clientY, kind: "node", id: n.id() });
    });
    cy.on("cxttap", "edge", (evt) => {
      evt.preventDefault();
      const e = evt.target;
      const p = evt.originalEvent as MouseEvent;
      setMenu({ x: p.clientX, y: p.clientY, kind: "edge", id: e.id() });
    });

    cyRef.current = cy;
    const onResize = () => {
      cy.resize();
      cy.fit(undefined, 48);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cy.destroy();
      cyRef.current = null;
    };
  }, [props.topology, props.topologyRevision, applyZoomLabels]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    cy.batch(() => {
      cy.edges().removeClass("primary backup ecmpAlt primaryF primaryR backupF backupR dim heatmap failed");
      cy.nodes(".ne").removeClass("path pathBackup dim failed");
      cy.nodes(".site").removeClass("dim");

      for (const id of failedNeIds) {
        const n = cy.getElementById(id);
        if (n.nonempty()) {
          n.addClass("failed");
        }
      }
      for (const key of failedLinkKeys) {
        const e = cy.getElementById(key);
        if (e.nonempty()) {
          e.addClass("failed");
        }
      }

      if (heatmapEnabled && reservations.length > 0) {
        const usage = new Map<string, number>();
        for (const r of reservations) {
          for (const edge of r.primary_edges) {
            const k = edgeKeyTuple(edge);
            usage.set(k, (usage.get(k) ?? 0) + r.required_bw_mbps);
          }
        }
        cy.edges().forEach((e) => {
          const used = usage.get(e.id()) ?? 0;
          const cap = Math.max(1, Number(e.data("bandwidth_mbps") ?? 1));
          const util = Math.min(1, used / cap);
          e.data("utilization", util);
          let color = "#22c55e";
          if (util > 0.8) {
            color = "#ef4444";
          } else if (util > 0.5) {
            color = "#f97316";
          } else if (util > 0.2) {
            color = "#eab308";
          }
          e.style("line-color", color);
          e.style("opacity", 0.95);
          e.addClass("heatmap");
        });
      } else {
        cy.edges().forEach((e) => {
          e.removeStyle("line-color");
          e.removeStyle("opacity");
        });
      }

      if (props.primary) {
        const primaryKeys = new Set(props.primary.edges.map(edgeKeyTuple));
        const backupKeys = new Set((props.backup?.edges ?? []).map(edgeKeyTuple));
        const pathNodes = new Set<string>([...props.primary.nodes, ...(props.backup?.nodes ?? [])]);
        const ecmp = useAppStore.getState().lastCompute?.ecmp_paths ?? [];
        const ecmpKeys = new Set(
          ecmp
            .slice(1)
            .flatMap((p) => p.edges)
            .map(edgeKeyTuple),
        );
        const traversal = new Map<string, Array<{ from: string; to: string }>>();
        for (const [from, to, k] of props.primary.edges) {
          const key = edgeKeyTuple([from, to, k]);
          const arr = traversal.get(key) ?? [];
          arr.push({ from, to });
          traversal.set(key, arr);
        }
        for (const [from, to, k] of props.backup?.edges ?? []) {
          const key = edgeKeyTuple([from, to, k]);
          const arr = traversal.get(key) ?? [];
          arr.push({ from, to });
          traversal.set(key, arr);
        }

        cy.edges().forEach((e) => {
          const key = normalizeEdgeId(e.id());
          const src = String(e.data("source"));
          const tgt = String(e.data("target"));
          const dirs = traversal.get(key) ?? [];
          if (primaryKeys.has(key)) {
            e.addClass("primary");
            const d = dirs.find((x) => x.from && x.to);
            if (d) {
              e.addClass(d.from === src && d.to === tgt ? "primaryF" : "primaryR");
            }
          } else if (backupKeys.has(key)) {
            e.addClass("backup");
            const d = dirs.find((x) => x.from && x.to);
            if (d) {
              e.addClass(d.from === src && d.to === tgt ? "backupF" : "backupR");
            }
          } else if (ecmpKeys.has(key)) {
            e.addClass("ecmpAlt");
          } else if (props.focusPaths) {
            e.addClass("dim");
          }
        });
        cy.nodes(".ne").forEach((n) => {
          const id = n.id();
          if (props.primary.nodes.includes(id)) {
            n.addClass("path");
          }
          if (props.backup?.nodes.includes(id)) {
            n.addClass("pathBackup");
          }
          if (props.focusPaths && !pathNodes.has(id)) {
            n.addClass("dim");
          }
        });
        if (props.focusPaths) {
          cy.nodes(".site").addClass("dim");
        }
      }
    });

    if (props.primary) {
      const ids = new Set([...props.primary.nodes, ...(props.backup?.nodes ?? [])]);
      const col = cy.nodes().filter((n) => ids.has(n.id()));
      if (col.nonempty()) {
        cy.fit(col, 64);
      }
    }
  }, [props.primary, props.backup, props.focusPaths, failedNeIds, failedLinkKeys, heatmapEnabled, reservations]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !props.primary) {
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) {
        start = ts;
      }
      const offset = -((ts - start) / 40) % 16;
      cy.edges(".primary").style("line-dash-offset", offset);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [props.primary]);

  return (
    <div className="relative h-full w-full">
      {!props.topology ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#0A0F1C] p-8 text-center">
          <div className="text-lg font-semibold text-slate-100">No topology loaded</div>
          <p className="max-w-md text-sm text-slate-400">
            Drag <span className="text-slate-200">nes.csv</span> and <span className="text-slate-200">links.csv</span>{" "}
            here, or use the file picker in Constraints to browse.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {props.onBrowseFiles ? (
              <button
                type="button"
                onClick={props.onBrowseFiles}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
              >
                Browse for CSV files…
              </button>
            ) : null}
            {props.onLoadSample ? (
              <button
                type="button"
                onClick={props.onLoadSample}
                className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
              >
                Load sample topology
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {props.busy ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#0A0F1C]/70 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <div className="text-sm text-slate-200">Working…</div>
        </div>
      ) : null}
      <div ref={containerRef} className="absolute inset-0" />
      {tooltip ? (
        <div
          className="cy-tooltip fixed"
          style={{ left: tooltip.x, top: tooltip.y }}
          dangerouslySetInnerHTML={{ __html: tooltip.html }}
        />
      ) : null}
      {menu ? (
        <div
          className="fixed z-50 rounded-md border border-slate-600 bg-slate-800 p-2 text-sm shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            className="block w-full rounded px-3 py-1 text-left hover:bg-slate-700"
            onClick={() => {
              if (menu.kind === "node") {
                failNe(menu.id);
              } else {
                failLink(menu.id);
              }
              setMenu(null);
            }}
          >
            Simulate Failure
          </button>
          <button
            type="button"
            className="mt-1 block w-full rounded px-3 py-1 text-left hover:bg-slate-700"
            onClick={() => setMenu(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

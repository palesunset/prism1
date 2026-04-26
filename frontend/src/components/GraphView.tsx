import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import coseBilkent from "cytoscape-cose-bilkent";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { FailedTrafficElement, PathResult, SimulationResult, TopologyPayload } from "../types";
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

function fmtMbpsDelta(mbps: number): string {
  if (!Number.isFinite(mbps)) return "";
  if (mbps >= 1000) return `+${(mbps / 1000).toFixed(2)} Gbps`;
  return `+${mbps.toFixed(0)} Mbps`;
}

function fmtPct(p: number): string {
  if (!Number.isFinite(p)) return "";
  return `${p.toFixed(0)}%`;
}

function tryParseEdgeId(id: string): { u: string; v: string; k: number } | null {
  const parts = id.split("|");
  if (parts.length !== 3) return null;
  const u = parts[0] ?? "";
  const v = parts[1] ?? "";
  const k = Number(parts[2]);
  if (!u || !v || !Number.isFinite(k)) return null;
  return { u, v, k };
}

function utilColor(pct: number): string {
  if (!Number.isFinite(pct)) return "#334155";
  if (pct >= 80) return "#ef4444";
  if (pct >= 50) return "#f97316";
  if (pct >= 20) return "#eab308";
  return "#22c55e";
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
    const role = String(n.data.role ?? "P_RTR");
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

export type GraphViewHandle = {
  fit: () => void;
};

export const GraphView = forwardRef<
  GraphViewHandle,
  {
    topology: TopologyPayload | null;
    topologyRevision: number;
    primary: PathResult | null;
    backup: PathResult | null;
    focusPaths: boolean;
    busy?: boolean;
    onBrowseFiles?: () => void;
  }
>(function GraphView(props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; kind: "node" | "edge"; id: string } | null>(
    null,
  );
  const [tooltip, setTooltip] = useState<{ x: number; y: number; html: string } | null>(null);
  const workspaceMode = useAppStore((s) => s.workspaceMode);
  const trafficActiveTab = useAppStore((s) => s.trafficActiveTab);
  const failedNeIds = useAppStore((s) => s.failedNeIds);
  const failedLinkKeys = useAppStore((s) => s.failedLinkKeys);
  const heatmapEnabled = useAppStore((s) => s.heatmapEnabled);
  const reservations = useAppStore((s) => s.reservations);
  const failNe = useAppStore((s) => s.failNe);
  const failLink = useAppStore((s) => s.failLink);
  const mapLabelsEnabled = useAppStore((s) => s.mapLabelsEnabled);

  const trafficSelectionMode = useAppStore((s) => s.trafficSelectionMode);
  const trafficFailed = useAppStore((s) => s.trafficFailedElements);
  const addTrafficFailure = useAppStore((s) => s.addTrafficFailure);
  const trafficFailureResult = useAppStore((s) => s.trafficFailureResult);
  const scenarioSelectionMode = useAppStore((s) => s.scenarioSelectionMode);
  const scenarioFailed = useAppStore((s) => s.scenarioFailedElements);
  const addScenarioFailure = useAppStore((s) => s.addScenarioFailure);
  const scenarioResult = useAppStore((s) => s.scenarioResult);
  const trafficHeatmapEnabled = useAppStore((s) => s.trafficHeatmapEnabled);
  const scenarioPathOptions = useAppStore((s) => s.scenarioPathOptions);
  const scenarioPathPreview = useAppStore((s) => s.scenarioPathPreview);

  const activeTrafficFailed = useMemo(
    () => (trafficActiveTab === "scenario" ? scenarioFailed : trafficFailed),
    [trafficActiveTab, scenarioFailed, trafficFailed],
  );
  const activeTrafficSelectionMode = trafficActiveTab === "scenario" ? scenarioSelectionMode : trafficSelectionMode;
  const activeTrafficResult: SimulationResult | null =
    trafficActiveTab === "scenario" ? scenarioResult : trafficFailureResult;

  const trafficFailedKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const f of activeTrafficFailed) {
      s.add(`${f.type}:${f.id}`);
    }
    return s;
  }, [activeTrafficFailed]);

  const applyZoomLabels = useCallback(
    (cy: Core) => {
      const z = cy.zoom();
      const showFull = z > 1.5;
      const hide = !mapLabelsEnabled;
      cy.batch(() => {
        cy.nodes(".ne").forEach((n) => {
          if (heatmapEnabled) {
            // Match colored links to endpoints at any zoom; ignore eye toggle while heatmap is on
            n.data("shortLabel", n.id());
          } else {
            n.data("shortLabel", hide ? "" : showFull ? n.id() : "");
          }
        });
        cy.nodes(".site").forEach((s) => {
          s.style("label", s.data("label"));
        });
      });
    },
    [mapLabelsEnabled, heatmapEnabled],
  );

  useImperativeHandle(ref, () => ({
    fit: () => {
      const cy = cyRef.current;
      if (cy) {
        cy.fit(undefined, 48);
      }
    },
  }));

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
      // Keep edges/labels visible while panning (heatmap + path modes need readable NEs and links)
      hideEdgesOnViewport: false,
      hideLabelsOnViewport: false,
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
        // Scenario Builder: show before/after utilization on hover when available
        if (useAppStore.getState().workspaceMode === "traffic") {
          const activeTab = useAppStore.getState().trafficActiveTab;
          const res =
            activeTab === "scenario" ? useAppStore.getState().scenarioResult : useAppStore.getState().trafficFailureResult;
          if (res) {
            const id = String(t.id());
            const b = res.link_utilization_before_pct?.[id];
            const a = res.link_utilization_after_pct?.[id];
            if (typeof b === "number" && typeof a === "number") {
              const bw = Number(t.data("bandwidth_mbps") ?? 0);
              const deltaMbps = bw > 0 ? ((a - b) / 100) * bw : 0;
              const html = [
                `<div><strong>Link impact</strong></div>`,
                `<div>Before: ${b.toFixed(1)}%</div>`,
                `<div>After: ${a.toFixed(1)}%</div>`,
                bw > 0 ? `<div>Δ traffic: ${fmtMbpsDelta(Math.max(0, deltaMbps)).replace("+", "")}</div>` : "",
              ].join("");
              setTooltip({ x: p.clientX + 12, y: p.clientY + 12, html });
              return;
            }
          }
        }
        if (t.hasClass("traffic-congested")) {
          const before = Number(t.data("trafficBeforePct") ?? 0);
          const after = Number(t.data("trafficAfterPct") ?? 0);
          const delta = Number(t.data("trafficDeltaMbps") ?? 0);
          const extra = Number(t.data("trafficExtraMbps") ?? 0);
          const html = [
            `<div><strong>Congested link</strong></div>`,
            `<div>Before: ${before.toFixed(1)}%</div>`,
            `<div>After: ${after.toFixed(1)}%</div>`,
            `<div>Added: ${fmtMbpsDelta(delta).replace("+", "")}</div>`,
            `<div>Suggested extra: ${fmtMbpsDelta(extra).replace("+", "")}</div>`,
          ].join("");
          setTooltip({ x: p.clientX + 12, y: p.clientY + 12, html });
          return;
        }
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
    applyZoomLabels(cy);
  }, [mapLabelsEnabled, heatmapEnabled, applyZoomLabels]);

  // Traffic selection mode: click to add failures.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (workspaceMode !== "traffic") return;
    if (activeTrafficSelectionMode !== "addFailure") return;
    const onTap = (evt: cytoscape.EventObject) => {
      const t = evt.target;
      if (t.group() === "nodes" && t.hasClass("ne")) {
        if (trafficActiveTab === "scenario") {
          addScenarioFailure({ type: "node", id: t.id() });
        } else {
          addTrafficFailure({ type: "node", id: t.id() });
        }
      } else if (t.group() === "edges") {
        if (trafficActiveTab === "scenario") {
          addScenarioFailure({ type: "link", id: t.id() });
        } else {
          addTrafficFailure({ type: "link", id: t.id() });
        }
      }
    };
    cy.on("tap", "node.ne, edge", onTap);
    return () => {
      cy.off("tap", "node.ne, edge", onTap);
    };
  }, [workspaceMode, activeTrafficSelectionMode, trafficActiveTab, addTrafficFailure, addScenarioFailure]);

  // Mode switch: clear inactive overlays without touching underlying data.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      if (workspaceMode === "traffic") {
        // Clear LSP path overlays.
        cy.edges().removeClass("primary backup ecmpAlt primaryF primaryR backupF backupR dim");
        cy.nodes(".ne").removeClass("path pathBackup dim");
        cy.nodes(".site").removeClass("dim");
      } else {
        // Clear traffic overlays.
        cy.remove("edge.traffic-flow");
        cy.remove("edge.traffic-flow-original");
        cy.remove("edge.traffic-flow-applied");
        cy.remove("edge.injected-flow");
        cy.edges().removeClass("traffic-failed traffic-congested");
        cy.nodes(".ne").removeClass("traffic-failed traffic-dim");
        cy.edges().removeClass("traffic-dim");
        cy.edges().forEach((e) => {
          // Drop any traffic heatmap styling we applied inline.
          e.removeStyle("line-color");
          e.removeStyle("opacity");
          e.removeStyle("width");
          e.removeData("trafficBeforePct");
          e.removeData("trafficAfterPct");
          e.removeData("trafficDeltaMbps");
          e.removeData("trafficExtraMbps");
          e.removeData("trafficAfterLabel");
          e.removeData("trafficFailedLabel");
        });
      }
    });
  }, [workspaceMode]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) {
      return;
    }
    if (workspaceMode !== "lsp") {
      return;
    }
    cy.batch(() => {
      cy.edges().removeClass("primary backup ecmpAlt primaryF primaryR backupF backupR dim heatmap failed");
      cy.nodes(".ne").removeClass("path pathBackup dim failed hmFocus");
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
          } else if (props.focusPaths && !heatmapEnabled) {
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
          if (props.focusPaths && !pathNodes.has(id) && !heatmapEnabled) {
            n.addClass("dim");
          }
        });
        if (props.focusPaths && !heatmapEnabled) {
          cy.nodes(".site").addClass("dim");
        }
      }
      if (heatmapEnabled) {
        cy.nodes(".ne").addClass("hmFocus");
      }
    });
  }, [workspaceMode, props.primary, props.backup, props.focusPaths, failedNeIds, failedLinkKeys, heatmapEnabled, reservations]);

  // Traffic overlays: failed elements, flow arrows, and post-failure utilization heatmap.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (workspaceMode !== "traffic") return;
    cy.batch(() => {
      // Clear previous overlays
      cy.remove("edge.traffic-flow");
      cy.remove("edge.traffic-flow-original");
      cy.remove("edge.traffic-flow-applied");
      cy.remove("edge.injected-flow");
      cy.remove("edge.scenario-path-preview");
      cy.edges().removeClass("traffic-failed traffic-congested");
      cy.nodes(".ne").removeClass("traffic-failed");
      cy.edges().removeClass("traffic-dim");
      cy.nodes(".ne").removeClass("traffic-dim");
      // Clear any previous traffic styles/labels (so toggles don't "lose" the map state)
      cy.edges().forEach((e) => {
        e.removeStyle("line-color");
        e.removeStyle("opacity");
        e.removeStyle("width");
        e.removeData("trafficBeforePct");
        e.removeData("trafficAfterPct");
        e.removeData("trafficDeltaMbps");
        e.removeData("trafficExtraMbps");
        e.removeData("trafficAfterLabel");
        e.removeData("trafficFailedLabel");
      });

      // Apply failed styling
      for (const f of activeTrafficFailed) {
        if (f.type === "node") {
          const n = cy.getElementById(f.id);
          if (n.nonempty()) n.addClass("traffic-failed");
        } else {
          const e = cy.getElementById(f.id);
          if (e.nonempty()) {
            e.addClass("traffic-failed");
            e.data("trafficFailedLabel", "!");
          }
        }
      }

      if (!activeTrafficResult) {
        return;
      }

      // Dim all not-affected elements so the user can focus on the reroute.
      const affectedNodes = new Set<string>();
      const affectedEdges = new Set<string>();
      for (const f of trafficFailed) {
        if (f.type === "node") {
          affectedNodes.add(f.id);
        } else {
          affectedEdges.add(f.id);
          const parsed = tryParseEdgeId(f.id);
          if (parsed) {
            affectedNodes.add(parsed.u);
            affectedNodes.add(parsed.v);
          }
        }
      }
      for (const flow of activeTrafficResult.flows ?? []) {
        for (const n of flow.path_nodes ?? []) affectedNodes.add(String(n));
        for (const e of flow.path_edges ?? []) affectedEdges.add(String(e));
        // Manual relief/apply: ensure the applied path also stays undimmed.
        for (const n of flow.manual_new_path_nodes ?? []) affectedNodes.add(String(n));
        for (const e of flow.manual_new_path_edges ?? []) affectedEdges.add(String(e));
      }
      for (const inj of activeTrafficResult.injected_flows ?? []) {
        if (inj.disconnected) continue;
        for (const n of inj.path_nodes ?? []) affectedNodes.add(String(n));
        for (const e of inj.path_edges ?? []) affectedEdges.add(String(e));
      }
      // When a Scenario Builder preview path is selected, treat it as "affected" (do not dim).
      if (scenarioPathPreview) {
        const paths = scenarioPathOptions[scenarioPathPreview.flowId] ?? [];
        const picked = paths[scenarioPathPreview.idx];
        for (const n of picked?.path_nodes ?? []) affectedNodes.add(String(n));
        for (const e of picked?.path_edges ?? []) affectedEdges.add(String(e));
      }
      for (const c of activeTrafficResult.congested_links ?? []) {
        affectedEdges.add(String(c.edge_id));
        const parsed = tryParseEdgeId(String(c.edge_id));
        if (parsed) {
          affectedNodes.add(parsed.u);
          affectedNodes.add(parsed.v);
        }
      }
      cy.nodes(".ne").forEach((n) => {
        // Heatmap ON: keep nodes readable (no dim), only dim links.
        if (trafficHeatmapEnabled) return;
        if (!affectedNodes.has(n.id())) n.addClass("traffic-dim");
      });
      cy.edges().forEach((e) => {
        if (!affectedEdges.has(e.id())) e.addClass("traffic-dim");
      });

      // Post-failure heatmap coloring (all links) — optional
      if (trafficHeatmapEnabled) {
        const after = activeTrafficResult.link_utilization_after_pct ?? {};
        for (const [edgeId, pct] of Object.entries(after)) {
          const e = cy.getElementById(edgeId);
          if (e.nonempty()) {
            const p = Number(pct);
            e.style("line-color", utilColor(p));
            e.style("opacity", 0.95);
            // Heatmap on: keep links thinner to reduce clutter.
            e.style("width", 2);
          }
        }
      }

      // Congested links: class + label + tooltip data fields
      for (const c of activeTrafficResult.congested_links ?? []) {
        const e = cy.getElementById(c.edge_id);
        if (e.nonempty()) {
          e.addClass("traffic-congested");
          e.data("trafficBeforePct", c.before_util_pct);
          e.data("trafficAfterPct", c.after_util_pct);
          e.data("trafficDeltaMbps", c.delta_mbps);
          e.data("trafficExtraMbps", c.extra_bandwidth_mbps);
          e.data("trafficAfterLabel", fmtPct(Number(c.after_util_pct)));
          if (trafficHeatmapEnabled) {
            e.style("width", 3);
          }
        }
      }

      // Label links on injected paths with their after-utilization (helps users see impact beyond congestion).
      const injectedEdges = new Set<string>();
      for (const inj of activeTrafficResult.injected_flows ?? []) {
        if (inj.disconnected) continue;
        for (const eid of inj.path_edges ?? []) injectedEdges.add(String(eid));
      }
      if (injectedEdges.size) {
        const after = activeTrafficResult.link_utilization_after_pct ?? {};
        for (const eid of injectedEdges) {
          const e = cy.getElementById(eid);
          if (e.nonempty()) {
            const pct = Number(after[eid]);
            if (Number.isFinite(pct)) {
              e.addClass("injected-impact");
              e.data("trafficAfterLabel", fmtPct(pct));
            }
          }
        }
      }

      // Flow arrows
      const flows = activeTrafficResult.flows ?? [];
      for (const f of flows) {
        const baseNodes = f.path_nodes ?? [];
        const flowId = String(f.flow_id ?? f.failed_link_id ?? "");
        const baseLabel = fmtMbpsDelta(Number(f.volume_mbps || 0));
        const manual = Boolean(f.manual_override && f.manual_new_path_nodes?.length);

        const addArrow = (nodes: string[], cls: string, label: string) => {
          for (let i = 0; i < nodes.length - 1; i++) {
            const src = String(nodes[i]);
            const tgt = String(nodes[i + 1]);
            const id = `${cls}:${flowId}:${i}:${src}->${tgt}`;
            cy.add({
              group: "edges",
              data: { id, source: src, target: tgt, label },
              classes: cls,
            });
          }
        };

        if (manual) {
          addArrow(baseNodes.map(String), "traffic-flow-original", baseLabel);
          addArrow((f.manual_new_path_nodes ?? []).map(String), "traffic-flow-applied", baseLabel);
        } else {
          addArrow(baseNodes.map(String), "traffic-flow", baseLabel);
        }
      }

      // Injected flows (scenario builder)
      const injected = activeTrafficResult.injected_flows ?? [];
      for (const inj of injected) {
        if (inj.disconnected) {
          continue;
        }
        const nodes = (inj.path_nodes ?? []).map(String);
        const label = fmtMbpsDelta(Number(inj.volume_mbps || 0)).replace("+", "");
        for (let i = 0; i < nodes.length - 1; i++) {
          const src = nodes[i]!;
          const tgt = nodes[i + 1]!;
          const id = `injected-flow:${inj.id}:${i}:${src}->${tgt}`;
          cy.add({
            group: "edges",
            data: { id, source: src, target: tgt, label },
            classes: "injected-flow",
          });
        }
      }

      // Scenario Builder path preview (k-shortest options)
      if (scenarioPathPreview) {
        const paths = scenarioPathOptions[scenarioPathPreview.flowId] ?? [];
        const picked = paths[scenarioPathPreview.idx];
        if (picked?.path_nodes?.length) {
          const nodes = picked.path_nodes.map(String);
          for (let i = 0; i < nodes.length - 1; i++) {
            const src = nodes[i]!;
            const tgt = nodes[i + 1]!;
            const id = `scenario-path-preview:${scenarioPathPreview.flowId}:${scenarioPathPreview.idx}:${i}:${src}->${tgt}`;
            cy.add({
              group: "edges",
              data: {
                id,
                source: src,
                target: tgt,
                label: `Path ${scenarioPathPreview.idx + 1}`,
              },
              classes: "scenario-path-preview",
            });
          }
        }
      }
    });
  }, [
    workspaceMode,
    trafficFailedKeySet,
    activeTrafficFailed,
    trafficHeatmapEnabled,
    activeTrafficResult,
    scenarioPathPreview,
    scenarioPathOptions,
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !props.primary) {
      return;
    }
    const ids = new Set([...props.primary.nodes, ...(props.backup?.nodes ?? [])]);
    const col = cy.nodes().filter((n) => ids.has(n.id()));
    if (col.nonempty()) {
      /* Generous padding so the path doesn’t fill the whole view (less “zoomed in”) */
      cy.fit(col, 200);
    }
  }, [props.primary, props.backup]);

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
    <div className="relative h-full w-full bg-[#080C14]">
      {!props.topology ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#0A0F1C] p-8 text-center">
          <div className="text-lg font-semibold text-slate-100">No topology loaded</div>
          <p className="max-w-md text-sm text-slate-400">
            Drag <span className="text-slate-200">nes.csv</span> and <span className="text-slate-200">links.csv</span> here, or
            use <span className="text-slate-200">Import Data</span> in the floating panel.
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
          </div>
        </div>
      ) : null}
      {props.busy ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#0A0F1C]/70 backdrop-blur-sm">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          <div className="text-sm text-slate-200">Working…</div>
        </div>
      ) : null}
      <div ref={containerRef} className="absolute inset-0 bg-[#080C14]" />
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
});

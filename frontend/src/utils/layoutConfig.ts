import type { Stylesheet } from "cytoscape";

export const baseStylesheet: Stylesheet[] = [
  {
    selector: "node.site",
    style: {
      "background-color": "#0f172a",
      "border-color": "#334155",
      "border-width": 1,
      label: "data(label)",
      color: "#cbd5e1",
      "text-valign": "top",
      "text-halign": "center",
      "font-size": 11,
      padding: "12px",
      shape: "roundrectangle",
    },
  },
  {
    selector: "node.ne",
    style: {
      "background-color": "#475569",
      width: 20,
      height: 20,
      label: "data(shortLabel)",
      color: "#e2e8f0",
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 10,
      "border-width": 1,
      "border-color": "#1e293b",
    },
  },
  {
    selector: "node.ne[role = 'core']",
    style: {
      "background-color": "#3b82f6",
      width: 28,
      height: 28,
    },
  },
  {
    selector: "node.ne[role = 'edge']",
    style: {
      "background-color": "#10b981",
      width: 24,
      height: 24,
    },
  },
  {
    selector: "node.ne[role = 'P_RTR']",
    style: {
      "background-color": "#64748b",
      width: 24,
      height: 24,
    },
  },
  {
    selector: "node.ne[role = 'DRRTR']",
    style: {
      "background-color": "#0ea5e9",
      width: 28,
      height: 28,
    },
  },
  {
    selector: "node.ne[role = 'PERTR']",
    style: {
      "background-color": "#22c55e",
      width: 24,
      height: 24,
    },
  },
  {
    selector: "node.ne[role = 'PECRT']",
    style: {
      "background-color": "#a3e635",
      width: 22,
      height: 22,
    },
  },
  {
    selector: "node.ne[vendor = 'nokia']",
    style: {
      "background-color": "#2563eb",
    },
  },
  {
    selector: "node.ne[vendor = 'huawei']",
    style: {
      "background-color": "#ef4444",
    },
  },
  {
    selector: "node.ne[vendor = 'cisco_xr']",
    style: {
      "background-color": "#f97316",
    },
  },
  {
    selector: "node.ne[vendor = 'juniper']",
    style: {
      "background-color": "#a855f7",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "curve-style": "unbundled-bezier",
      "line-color": "#334155",
      opacity: 0.4,
      "target-arrow-shape": "none",
    },
  },
  {
    selector: "edge.parallel0",
    style: {
      "control-point-distances": 40,
      "control-point-weights": 0.5,
    },
  },
  {
    selector: "edge.parallel1",
    style: {
      "control-point-distances": -40,
      "control-point-weights": 0.5,
    },
  },
  {
    selector: "edge.parallel2",
    style: {
      "control-point-distances": 60,
      "control-point-weights": 0.5,
    },
  },
  {
    selector: "edge.primary",
    style: {
      width: 5,
      "line-color": "#22d3ee",
      "target-arrow-shape": "none",
      "source-arrow-shape": "none",
      opacity: 1,
      "curve-style": "straight",
      "line-style": "solid",
      "line-dash-pattern": [10, 6],
      "line-dash-offset": 0,
      "z-index": 999,
    },
  },
  {
    selector: "edge.primaryF",
    style: {
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#22d3ee",
    },
  },
  {
    selector: "edge.primaryR",
    style: {
      "source-arrow-shape": "triangle",
      "source-arrow-color": "#22d3ee",
    },
  },
  {
    selector: "edge.backup",
    style: {
      width: 4,
      "line-color": "#fb923c",
      "target-arrow-shape": "none",
      "source-arrow-shape": "none",
      opacity: 1,
      "curve-style": "straight",
      "line-style": "dashed",
      "line-dash-pattern": [4, 6],
      "z-index": 998,
    },
  },
  {
    selector: "edge.backupF",
    style: {
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#fb923c",
    },
  },
  {
    selector: "edge.backupR",
    style: {
      "source-arrow-shape": "triangle",
      "source-arrow-color": "#fb923c",
    },
  },
  {
    selector: "edge.ecmpAlt",
    style: {
      width: 2,
      "line-color": "#a855f7",
      opacity: 0.9,
      "curve-style": "straight",
      "line-style": "dotted",
      "line-dash-pattern": [2, 6],
      "z-index": 997,
    },
  },
  {
    selector: "edge.heatmap",
    style: {
      opacity: 0.95,
      width: 3,
    },
  },
  {
    selector: "node.ne.dim",
    style: {
      opacity: 0.02,
      "text-opacity": 0.04,
    },
  },
  {
    selector: "node.site.dim",
    style: {
      "background-color": "#0b1222",
      "border-color": "#1f2a3a",
      color: "#475569",
    },
  },
  {
    selector: "edge.dim",
    style: {
      opacity: 0.05,
    },
  },
  {
    selector: "node.failed",
    style: {
      "background-color": "#64748b",
      opacity: 0.35,
    },
  },
  {
    selector: "edge.failed",
    style: {
      "line-color": "#94a3b8",
      opacity: 0.25,
      "line-style": "dotted",
    },
  },
  // ---- Traffic Simulation overlays (standalone mode) ----
  {
    selector: "edge.traffic-failed",
    style: {
      width: 3,
      "line-color": "#ef4444",
      opacity: 0.9,
      "line-style": "dashed",
      "line-dash-pattern": [6, 6],
      label: "data(trafficFailedLabel)",
      color: "#fecaca",
      "font-size": 10,
      "text-outline-width": 2,
      "text-outline-color": "#0b1222",
      "z-index": 1200,
    },
  },
  {
    selector: "node.traffic-failed",
    style: {
      "border-color": "#ef4444",
      "border-width": 3,
      opacity: 0.5,
    },
  },
  {
    selector: "edge.traffic-flow",
    style: {
      width: 2,
      "line-color": "#38bdf8",
      opacity: 0.9,
      "curve-style": "bezier",
      "line-style": "dashed",
      "line-dash-pattern": [4, 6],
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#38bdf8",
      label: "data(label)",
      color: "#bae6fd",
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": "#0b1222",
      "text-rotation": "autorotate",
      "z-index": 1100,
    },
  },
  {
    selector: "edge.traffic-flow-original",
    style: {
      width: 2,
      "line-color": "#94a3b8",
      opacity: 0.55,
      "curve-style": "bezier",
      "line-style": "dashed",
      "line-dash-pattern": [2, 8],
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#94a3b8",
      label: "data(label)",
      color: "#cbd5e1",
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": "#0b1222",
      "text-rotation": "autorotate",
      "z-index": 1080,
    },
  },
  {
    selector: "edge.traffic-flow-applied",
    style: {
      width: 2.5,
      "line-color": "#22c55e",
      opacity: 0.95,
      "curve-style": "bezier",
      "line-style": "solid",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#22c55e",
      label: "data(label)",
      color: "#bbf7d0",
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": "#0b1222",
      "text-rotation": "autorotate",
      "z-index": 1120,
    },
  },
  {
    selector: "edge.injected-flow",
    style: {
      width: 4,
      "line-color": "#22c55e",
      opacity: 0.95,
      "curve-style": "bezier",
      "line-style": "solid",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#22c55e",
      label: "data(label)",
      color: "#bbf7d0",
      "font-size": 10,
      "text-outline-width": 2,
      "text-outline-color": "#0b1222",
      "text-rotation": "autorotate",
      "z-index": 1130,
    },
  },
  {
    selector: "edge.scenario-path-preview",
    style: {
      width: 4,
      "line-color": "#22c55e",
      opacity: 0.95,
      "curve-style": "bezier",
      "line-style": "solid",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#22c55e",
      label: "data(label)",
      color: "#bbf7d0",
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": "#0b1222",
      "text-rotation": "autorotate",
      "z-index": 1140,
    },
  },
  {
    selector: "edge.traffic-congested",
    style: {
      width: 4,
      "line-color": "#ef4444",
      opacity: 1,
      label: "data(trafficAfterLabel)",
      color: "#fecaca",
      "font-size": 10,
      "text-outline-width": 2,
      "text-outline-color": "#0b1222",
      "z-index": 1150,
    },
  },
  {
    selector: "edge.injected-impact",
    style: {
      label: "data(trafficAfterLabel)",
      color: "#bbf7d0",
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": "#0b1222",
      "z-index": 1145,
    },
  },
  {
    selector: "node.traffic-dim",
    style: {
      opacity: 0.12,
      "text-opacity": 0.05,
      "background-opacity": 0.12,
      "border-opacity": 0.12,
    },
  },
  {
    selector: "edge.traffic-dim",
    style: {
      opacity: 0.08,
    },
  },
  {
    selector: "node.path",
    style: {
      "border-color": "#22d3ee",
      "border-width": 4,
      opacity: 1,
    },
  },
  {
    selector: "node.pathBackup",
    style: {
      "border-color": "#fb923c",
      "border-width": 4,
      opacity: 1,
    },
  },
  /* Heatmap on: larger NEs + readable labels (class toggled in GraphView) */
  {
    selector: "node.ne.hmFocus",
    style: {
      width: 32,
      height: 32,
      "font-size": 12,
      "text-outline-width": 2,
      "text-outline-color": "#020617",
    },
  },
];

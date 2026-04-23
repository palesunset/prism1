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
      "line-color": "#06b6d4",
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
      "target-arrow-color": "#06b6d4",
    },
  },
  {
    selector: "edge.primaryR",
    style: {
      "source-arrow-shape": "triangle",
      "source-arrow-color": "#06b6d4",
    },
  },
  {
    selector: "edge.backup",
    style: {
      width: 4,
      "line-color": "#f97316",
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
      "target-arrow-color": "#f97316",
    },
  },
  {
    selector: "edge.backupR",
    style: {
      "source-arrow-shape": "triangle",
      "source-arrow-color": "#f97316",
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
  {
    selector: "node.path",
    style: {
      "border-color": "#06b6d4",
      "border-width": 4,
      "shadow-color": "#06b6d4",
      "shadow-blur": 14,
      "shadow-opacity": 0.65,
      opacity: 1,
    },
  },
  {
    selector: "node.pathBackup",
    style: {
      "border-color": "#f97316",
      "border-width": 4,
      "shadow-color": "#f97316",
      "shadow-blur": 14,
      "shadow-opacity": 0.65,
      opacity: 1,
    },
  },
];

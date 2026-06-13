import type { Stylesheet } from "cytoscape";
import { graphColors, odysseusDark } from "../theme/odysseus";

export const baseStylesheet: Stylesheet[] = [
  {
    selector: "node.site",
    style: {
      "background-color": graphColors.siteBg,
      "border-color": graphColors.siteBorder,
      "border-width": 1,
      label: "data(label)",
      color: graphColors.siteLabel,
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
      "background-color": graphColors.neDefault,
      width: 20,
      height: 20,
      label: "data(shortLabel)",
      color: graphColors.neLabel,
      "text-valign": "center",
      "text-halign": "center",
      "font-size": 10,
      "border-width": 1,
      "border-color": odysseusDark.panel,
    },
  },
  {
    selector: "node.ne[role = 'core']",
    style: {
      "background-color": odysseusDark.hlFunction,
      width: 28,
      height: 28,
    },
  },
  {
    selector: "node.ne[role = 'edge']",
    style: {
      "background-color": odysseusDark.colorSuccess,
      width: 24,
      height: 24,
    },
  },
  {
    selector: "node.ne[role = 'P_RTR']",
    style: {
      "background-color": odysseusDark.colorSubheader,
      width: 24,
      height: 24,
    },
  },
  {
    selector: "node.ne[role = 'DRRTR']",
    style: {
      "background-color": "#56b6c2",
      width: 28,
      height: 28,
    },
  },
  {
    selector: "node.ne[role = 'PERTR']",
    style: {
      "background-color": odysseusDark.colorSuccess,
      width: 24,
      height: 24,
    },
  },
  {
    selector: "node.ne[role = 'PECRT']",
    style: {
      "background-color": "#56b6c2",
      width: 22,
      height: 22,
    },
  },
  {
    selector: "node.ne[vendor = 'nokia']",
    style: {
      "background-color": odysseusDark.hlFunction,
    },
  },
  {
    selector: "node.ne[vendor = 'huawei']",
    style: {
      "background-color": odysseusDark.accent,
    },
  },
  {
    selector: "node.ne[vendor = 'cisco_xr']",
    style: {
      "background-color": odysseusDark.accentWarm,
    },
  },
  {
    selector: "node.ne[vendor = 'juniper']",
    style: {
      "background-color": "#c678dd",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1,
      "curve-style": "unbundled-bezier",
      "line-color": graphColors.edgeIdle,
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
      "line-color": graphColors.primary,
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
      "target-arrow-color": graphColors.primary,
    },
  },
  {
    selector: "edge.primaryR",
    style: {
      "source-arrow-shape": "triangle",
      "source-arrow-color": graphColors.primary,
    },
  },
  {
    selector: "edge.backup",
    style: {
      width: 4,
      "line-color": graphColors.backup,
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
      "target-arrow-color": graphColors.backup,
    },
  },
  {
    selector: "edge.backupR",
    style: {
      "source-arrow-shape": "triangle",
      "source-arrow-color": graphColors.backup,
    },
  },
  {
    selector: "edge.ecmpAlt",
    style: {
      width: 2,
      "line-color": "#c678dd",
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
      "background-color": odysseusDark.panel,
      "border-color": odysseusDark.border,
      color: odysseusDark.colorMuted,
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
      "background-color": odysseusDark.colorSubheader,
      opacity: 0.35,
    },
  },
  {
    selector: "edge.failed",
    style: {
      "line-color": odysseusDark.colorSubheader,
      opacity: 0.25,
      "line-style": "dotted",
    },
  },
  // ---- Traffic Simulation overlays (standalone mode) ----
  {
    selector: "edge.traffic-failed",
    style: {
      width: 3,
      "line-color": odysseusDark.colorError,
      opacity: 0.9,
      "line-style": "dashed",
      "line-dash-pattern": [6, 6],
      label: "data(trafficFailedLabel)",
      color: odysseusDark.accent,
      "font-size": 10,
      "text-outline-width": 2,
      "text-outline-color": odysseusDark.panel,
      "z-index": 1200,
    },
  },
  {
    selector: "node.traffic-failed",
    style: {
      "border-color": odysseusDark.colorError,
      "border-width": 3,
      opacity: 0.5,
    },
  },
  {
    selector: "edge.traffic-flow",
    style: {
      width: 2,
      "line-color": odysseusDark.colorAccent,
      opacity: 0.9,
      "curve-style": "bezier",
      "line-style": "dashed",
      "line-dash-pattern": [4, 6],
      "target-arrow-shape": "triangle",
      "target-arrow-color": odysseusDark.colorAccent,
      label: "data(label)",
      color: odysseusDark.fg,
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": odysseusDark.panel,
      "text-rotation": "autorotate",
      "z-index": 1100,
    },
  },
  {
    selector: "edge.traffic-flow-original",
    style: {
      width: 2,
      "line-color": odysseusDark.colorSubheader,
      opacity: 0.55,
      "curve-style": "bezier",
      "line-style": "dashed",
      "line-dash-pattern": [2, 8],
      "target-arrow-shape": "triangle",
      "target-arrow-color": odysseusDark.colorSubheader,
      label: "data(label)",
      color: odysseusDark.fg,
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": odysseusDark.panel,
      "text-rotation": "autorotate",
      "z-index": 1080,
    },
  },
  {
    selector: "edge.traffic-flow-applied",
    style: {
      width: 2.5,
      "line-color": odysseusDark.colorSuccess,
      opacity: 0.95,
      "curve-style": "bezier",
      "line-style": "solid",
      "target-arrow-shape": "triangle",
      "target-arrow-color": odysseusDark.colorSuccess,
      label: "data(label)",
      color: odysseusDark.colorSuccess,
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": odysseusDark.panel,
      "text-rotation": "autorotate",
      "z-index": 1120,
    },
  },
  {
    selector: "edge.injected-flow",
    style: {
      width: 4,
      "line-color": odysseusDark.colorSuccess,
      opacity: 0.95,
      "curve-style": "bezier",
      "line-style": "solid",
      "target-arrow-shape": "triangle",
      "target-arrow-color": odysseusDark.colorSuccess,
      label: "data(label)",
      color: odysseusDark.colorSuccess,
      "font-size": 10,
      "text-outline-width": 2,
      "text-outline-color": odysseusDark.panel,
      "text-rotation": "autorotate",
      "z-index": 1130,
    },
  },
  {
    selector: "edge.scenario-path-preview",
    style: {
      width: 4,
      "line-color": odysseusDark.colorSuccess,
      opacity: 0.95,
      "curve-style": "bezier",
      "line-style": "solid",
      "target-arrow-shape": "triangle",
      "target-arrow-color": odysseusDark.colorSuccess,
      label: "data(label)",
      color: odysseusDark.colorSuccess,
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": odysseusDark.panel,
      "text-rotation": "autorotate",
      "z-index": 1140,
    },
  },
  {
    selector: "edge.traffic-congested",
    style: {
      width: 4,
      "line-color": odysseusDark.colorError,
      opacity: 1,
      label: "data(trafficAfterLabel)",
      color: odysseusDark.accent,
      "font-size": 10,
      "text-outline-width": 2,
      "text-outline-color": odysseusDark.panel,
      "z-index": 1150,
    },
  },
  {
    selector: "edge.injected-impact",
    style: {
      label: "data(trafficAfterLabel)",
      color: odysseusDark.colorSuccess,
      "font-size": 9,
      "text-outline-width": 2,
      "text-outline-color": odysseusDark.panel,
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
      "border-color": graphColors.primary,
      "border-width": 4,
      opacity: 1,
    },
  },
  {
    selector: "node.pathBackup",
    style: {
      "border-color": graphColors.backup,
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
      "text-outline-color": odysseusDark.panel,
    },
  },
];

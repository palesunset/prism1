/**
 * Odysseus "dark" theme tokens (from odysseus-main/static/style.css + theme.js).
 * Single source of truth for PRISM colors — keep Tailwind class names unchanged.
 */
export const odysseusDark = {
  bg: "#282c34",
  fg: "#9cdef2",
  panel: "#111111",
  border: "#355a66",
  accent: "#e06c75",
  hlBg: "#1e2228",
  hlFunction: "#61afef",
  colorAccent: "#00aaff",
  colorMuted: "#888888",
  colorSubheader: "#6b8a94",
  colorError: "#ff4444",
  colorSuccess: "#50fa7b",
  colorWarning: "#f0ad4e",
  accentWarm: "#d19a66",
  colorLinkHover: "#66c7ff",
} as const;

/** Tailwind palette overrides derived from Odysseus tokens. */
export const tailwindSlate = {
  50: "#eef8fc",
  100: odysseusDark.fg,
  200: "#b8e4f4",
  300: "#8fd4ec",
  400: odysseusDark.colorSubheader,
  500: odysseusDark.colorMuted,
  600: odysseusDark.border,
  700: "#2a4a54",
  800: odysseusDark.hlBg,
  900: odysseusDark.panel,
  950: "#0a0a0a",
} as const;

export const tailwindGray = {
  50: "#eef8fc",
  100: odysseusDark.fg,
  200: "#b8e4f4",
  300: "#8fd4ec",
  400: odysseusDark.colorSubheader,
  500: odysseusDark.colorMuted,
  600: odysseusDark.border,
  700: "#2a4a54",
  800: odysseusDark.hlBg,
  900: odysseusDark.panel,
  950: odysseusDark.panel,
} as const;

/** Primary / interactive accent — Odysseus uses fg + coral red for controls. */
export const tailwindCyan = {
  50: "#eef8fc",
  100: "#d4f0fa",
  200: "#b8e4f4",
  300: odysseusDark.fg,
  400: odysseusDark.colorLinkHover,
  500: odysseusDark.colorAccent,
  600: odysseusDark.accent,
  700: "#c45a63",
  800: "#3d1a22",
  900: "#2a1218",
  950: "#1a0a0e",
} as const;

/** Backup / warm accent */
export const tailwindOrange = {
  50: "#fdf6ef",
  100: "#f5e6d4",
  200: "#ebc9a8",
  300: odysseusDark.accentWarm,
  400: "#e8945a",
  500: odysseusDark.accent,
  600: "#c45a63",
  700: "#a84850",
  800: "#7a3538",
  900: "#4a2020",
  950: "#2a1010",
} as const;

export const tailwindBlue = {
  500: odysseusDark.hlFunction,
  600: odysseusDark.colorAccent,
} as const;

export const tailwindGreen = {
  500: odysseusDark.colorSuccess,
  600: "#3dd66a",
} as const;

export const tailwindRed = {
  400: odysseusDark.colorError,
  500: odysseusDark.colorError,
} as const;

export const tailwindYellow = {
  500: odysseusDark.colorWarning,
} as const;

/** Cytoscape + graph canvas */
export const graphColors = {
  canvas: odysseusDark.bg,
  overlay: odysseusDark.hlBg,
  siteBg: odysseusDark.panel,
  siteBorder: odysseusDark.border,
  siteLabel: odysseusDark.fg,
  neDefault: odysseusDark.colorSubheader,
  neLabel: odysseusDark.fg,
  edgeIdle: odysseusDark.border,
  primary: odysseusDark.fg,
  backup: odysseusDark.accentWarm,
  heatmapIdle: odysseusDark.border,
  heatmapLow: odysseusDark.colorSuccess,
  heatmapMid: odysseusDark.colorWarning,
  heatmapHigh: odysseusDark.accentWarm,
  heatmapCritical: odysseusDark.colorError,
} as const;

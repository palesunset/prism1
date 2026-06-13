import { describe, expect, it } from "vitest";
import { findRestoredLsp, isProjectFileV1 } from "./projectFile";

describe("isProjectFileV1", () => {
  it("accepts a minimal valid project", () => {
    expect(
      isProjectFileV1({
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        topology: { nodes: [], edges: [] },
        layoutPositions: null,
        ui: {
          source: "A",
          destination: "B",
          requiredBwMbps: 0,
          maxHops: 25,
          mode: "rsvp_te",
          nokiaCliStyle: "classic",
          lspName: "lsp-1",
        },
        lsps: [],
      }),
    ).toBe(true);
  });

  it("rejects missing ui", () => {
    expect(
      isProjectFileV1({
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        topology: { nodes: [], edges: [] },
      }),
    ).toBe(false);
  });

  it("rejects incomplete ui", () => {
    expect(
      isProjectFileV1({
        version: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
        topology: { nodes: [], edges: [] },
        ui: { source: "A" },
      }),
    ).toBe(false);
  });
});

describe("findRestoredLsp", () => {
  const lsps = [
    {
      name: "lsp-1",
      source: "A",
      destination: "B",
      mode: "rsvp_te" as const,
      requiredBwMbps: 0,
      maxHops: 25,
      primary: { nodes: ["A", "B"], edges: [], hops: [], total_latency_ms: 1, hop_count: 1 },
      backup: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      name: "lsp-2",
      source: "C",
      destination: "D",
      mode: "rsvp_te" as const,
      requiredBwMbps: 0,
      maxHops: 25,
      primary: { nodes: ["C", "D"], edges: [], hops: [], total_latency_ms: 2, hop_count: 1 },
      backup: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("prefers lsp name match", () => {
    expect(findRestoredLsp(lsps, "lsp-2", "A", "B")?.name).toBe("lsp-2");
  });

  it("falls back to source and destination match", () => {
    expect(findRestoredLsp(lsps, "missing", "C", "D")?.name).toBe("lsp-2");
  });

  it("returns null when no primary path exists", () => {
    expect(findRestoredLsp([], "lsp-1", "A", "B")).toBeNull();
  });
});

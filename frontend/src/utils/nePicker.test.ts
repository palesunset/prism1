import { describe, expect, it } from "vitest";
import { commitNeDraft, countNeMatches, filterNeIds, canComputeLsp } from "./nePicker";

const NE_IDS = ["NE-Alpha", "NE-Beta", "NE-Gamma"];

describe("canComputeLsp", () => {
  it("requires distinct non-empty endpoints", () => {
    expect(canComputeLsp("", "B")).toBe(false);
    expect(canComputeLsp("A", "")).toBe(false);
    expect(canComputeLsp("A", "A")).toBe(false);
    expect(canComputeLsp("A", "B")).toBe(true);
  });
});

describe("commitNeDraft", () => {
  it("clears on empty draft", () => {
    expect(commitNeDraft("", NE_IDS)).toEqual({ kind: "clear" });
    expect(commitNeDraft("   ", NE_IDS)).toEqual({ kind: "clear" });
  });

  it("picks exact id", () => {
    expect(commitNeDraft("NE-Beta", NE_IDS)).toEqual({ kind: "pick", value: "NE-Beta" });
  });

  it("picks case-insensitively and returns canonical id", () => {
    expect(commitNeDraft("ne-beta", NE_IDS)).toEqual({ kind: "pick", value: "NE-Beta" });
    expect(commitNeDraft(" NE-GAMMA ", NE_IDS)).toEqual({ kind: "pick", value: "NE-Gamma" });
  });

  it("reverts on unknown partial or invalid id", () => {
    expect(commitNeDraft("NE-Delta", NE_IDS)).toEqual({ kind: "revert" });
    expect(commitNeDraft("NE-Al", NE_IDS)).toEqual({ kind: "revert" });
  });
});

describe("filterNeIds", () => {
  it("returns all ids when draft is empty", () => {
    expect(filterNeIds("", NE_IDS, 2)).toEqual(["NE-Alpha", "NE-Beta"]);
  });

  it("filters case-insensitively", () => {
    expect(filterNeIds("beta", NE_IDS)).toEqual(["NE-Beta"]);
    expect(filterNeIds("ne-", NE_IDS)).toEqual(NE_IDS);
  });
});

describe("countNeMatches", () => {
  it("counts all ids when draft is empty", () => {
    expect(countNeMatches("", NE_IDS)).toBe(3);
  });

  it("counts filtered matches", () => {
    expect(countNeMatches("ne-a", NE_IDS)).toBe(1);
    expect(countNeMatches("ne-", NE_IDS)).toBe(3);
  });
});

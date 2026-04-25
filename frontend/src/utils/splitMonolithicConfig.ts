/** Split legacy monolithic export (config_generator.generate_monolithic_config) into 3 blocks. */
export type SplitConfig = {
  pathDetails: string;
  forward: string;
  reverse: string;
  /** false when not RSVP-TE style (single ingress blob, no === markers) */
  hasThreeWaySplit: boolean;
};

export function splitMonolithicConfig(text: string): SplitConfig {
  const t = text.trim();
  if (!t) {
    return { pathDetails: "—", forward: "—", reverse: "—", hasThreeWaySplit: false };
  }
  const forwardRe = /===\s*FORWARD PATH\s*===/i;
  const reverseRe = /===\s*REVERSE PATH\s*===/i;
  const fMatch = t.match(forwardRe);
  const rMatch = t.match(reverseRe);
  if (!fMatch || !rMatch || fMatch.index === undefined || rMatch.index === undefined) {
    return {
      pathDetails: t,
      forward:
        "Forward path block is only part of the RSVP-TE monolithic export. For SR-MPLS / SRv6, configuration is a single section — see the Path details tab.",
      reverse:
        "Reverse path block is only part of the RSVP-TE monolithic export. For SR-MPLS / SRv6, configuration is a single section — see the Path details tab.",
      hasThreeWaySplit: false,
    };
  }
  if (rMatch.index <= fMatch.index) {
    return {
      pathDetails: t,
      forward: "—",
      reverse: "—",
      hasThreeWaySplit: false,
    };
  }
  const pathDetails = t.slice(0, fMatch.index).trim();
  const forwardBody = t.slice(fMatch.index + fMatch[0].length, rMatch.index).replace(/^\s*\n+/, "").trim();
  const reverseBody = t.slice(rMatch.index + rMatch[0].length).replace(/^\s*\n+/, "").trim();
  return {
    pathDetails,
    forward: forwardBody || "—",
    reverse: reverseBody || "—",
    hasThreeWaySplit: true,
  };
}

/** Insert a freshly rendered block into the monolithic string (Forward or Reverse only; Path details unchanged). */
export function replaceMonolithicSection(
  monolithic: string,
  section: "forward" | "reverse",
  newBlock: string,
): string {
  const t = monolithic;
  const forwardRe = /===\s*FORWARD PATH\s*===/i;
  const reverseRe = /===\s*REVERSE PATH\s*===/i;
  const fMatch = t.match(forwardRe);
  const rMatch = t.match(reverseRe);
  if (!fMatch || fMatch.index === undefined || !rMatch || rMatch.index === undefined) {
    return monolithic;
  }
  if (rMatch.index <= fMatch.index) {
    return monolithic;
  }
  const fH = fMatch.index + fMatch[0].length;
  if (section === "forward") {
    const before = t.slice(0, fH);
    const fromReverse = t.slice(rMatch.index);
    return `${before}\n${newBlock.trim()}\n\n${fromReverse}`;
  }
  const rH = rMatch.index + rMatch[0].length;
  const before = t.slice(0, rH);
  return `${before}\n${newBlock.trim()}\n`;
}

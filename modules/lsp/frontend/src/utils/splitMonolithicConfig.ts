/** Split legacy monolithic export (config_generator.generate_monolithic_config) into blocks. */
export type SplitConfig = {
  pathDetails: string;
  forward: string;
  reverse: string;
  revertForward: string;
  revertReverse: string;
  /** false when not RSVP-TE style (single ingress blob, no === markers) */
  hasThreeWaySplit: boolean;
  /** false when export predates REVERT sections */
  hasRevertSplit: boolean;
};

const SR_MSG =
  "Forward path block is only part of the RSVP-TE monolithic export. For SR-MPLS / SRv6, configuration is a single section — see the Path details tab.";

const REVERT_LEGACY_MSG =
  "Revert scripts are included in newer RSVP-TE exports. Recompute and open Configuration Output again to refresh, or copy from a freshly exported monolithic config.";

export function splitMonolithicConfig(text: string): SplitConfig {
  const t = text.trim();
  if (!t) {
    return {
      pathDetails: "—",
      forward: "—",
      reverse: "—",
      revertForward: "—",
      revertReverse: "—",
      hasThreeWaySplit: false,
      hasRevertSplit: false,
    };
  }
  const forwardRe = /===\s*FORWARD PATH\s*===/i;
  const reverseRe = /===\s*REVERSE PATH\s*===/i;
  const revertFwdRe = /===\s*REVERT FORWARD\s*===/i;
  const revertRevRe = /===\s*REVERT REVERSE\s*===/i;
  const fMatch = t.match(forwardRe);
  const rMatch = t.match(reverseRe);
  if (!fMatch || !rMatch || fMatch.index === undefined || rMatch.index === undefined) {
    return {
      pathDetails: t,
      forward: SR_MSG,
      reverse: SR_MSG,
      revertForward: SR_MSG,
      revertReverse: SR_MSG,
      hasThreeWaySplit: false,
      hasRevertSplit: false,
    };
  }
  if (rMatch.index <= fMatch.index) {
    return {
      pathDetails: t,
      forward: "—",
      reverse: "—",
      revertForward: "—",
      revertReverse: "—",
      hasThreeWaySplit: false,
      hasRevertSplit: false,
    };
  }
  const rfMatch = t.match(revertFwdRe);
  const rrMatch = t.match(revertRevRe);
  const pathDetails = t.slice(0, fMatch.index).trim();
  const fH = fMatch.index + fMatch[0].length;
  const rH = rMatch.index + rMatch[0].length;

  const hasRevert =
    rfMatch &&
    rrMatch &&
    rfMatch.index !== undefined &&
    rrMatch.index !== undefined &&
    rfMatch.index > rMatch.index &&
    rrMatch.index > rfMatch.index;

  let forwardBody: string;
  let reverseBody: string;
  let revertForwardBody: string;
  let revertReverseBody: string;

  if (hasRevert) {
    forwardBody = t.slice(fH, rMatch.index).replace(/^\s*\n+/, "").trim();
    reverseBody = t.slice(rH, rfMatch.index).replace(/^\s*\n+/, "").trim();
    const rfH = rfMatch.index + rfMatch[0].length;
    revertForwardBody = t.slice(rfH, rrMatch.index).replace(/^\s*\n+/, "").trim();
    revertReverseBody = t.slice(rrMatch.index + rrMatch[0].length).replace(/^\s*\n+/, "").trim();
  } else {
    forwardBody = t.slice(fH, rMatch.index).replace(/^\s*\n+/, "").trim();
    reverseBody = t.slice(rH).replace(/^\s*\n+/, "").trim();
    revertForwardBody = REVERT_LEGACY_MSG;
    revertReverseBody = REVERT_LEGACY_MSG;
  }

  return {
    pathDetails,
    forward: forwardBody || "—",
    reverse: reverseBody || "—",
    revertForward: revertForwardBody || "—",
    revertReverse: revertReverseBody || "—",
    hasThreeWaySplit: true,
    hasRevertSplit: Boolean(hasRevert),
  };
}

/** Insert a freshly rendered block into the monolithic string (Path details unchanged). */
export function replaceMonolithicSection(
  monolithic: string,
  section: "forward" | "reverse" | "revert_forward" | "revert_reverse",
  newBlock: string,
): string {
  const t = monolithic;
  const forwardRe = /===\s*FORWARD PATH\s*===/i;
  const reverseRe = /===\s*REVERSE PATH\s*===/i;
  const revertFwdRe = /===\s*REVERT FORWARD\s*===/i;
  const revertRevRe = /===\s*REVERT REVERSE\s*===/i;
  const fMatch = t.match(forwardRe);
  const rMatch = t.match(reverseRe);
  const rfMatch = t.match(revertFwdRe);
  const rrMatch = t.match(revertRevRe);
  if (!fMatch || fMatch.index === undefined || !rMatch || rMatch.index === undefined) {
    return monolithic;
  }
  if (rMatch.index <= fMatch.index) {
    return monolithic;
  }
  const fH = fMatch.index + fMatch[0].length;
  const rH = rMatch.index + rMatch[0].length;

  if (section === "forward") {
    const before = t.slice(0, fH);
    const fromReverse = t.slice(rMatch.index);
    return `${before}\n${newBlock.trim()}\n\n${fromReverse}`;
  }

  if (section === "reverse") {
    const before = t.slice(0, rH);
    if (rfMatch && rfMatch.index !== undefined && rfMatch.index > rMatch.index) {
      const fromRevert = t.slice(rfMatch.index);
      return `${before}\n${newBlock.trim()}\n\n${fromRevert}`;
    }
    return `${before}\n${newBlock.trim()}\n`;
  }

  if (!rfMatch || rfMatch.index === undefined || !rrMatch || rrMatch.index === undefined) {
    return monolithic;
  }
  const rfH = rfMatch.index + rfMatch[0].length;
  const rrH = rrMatch.index + rrMatch[0].length;

  if (section === "revert_forward") {
    const before = t.slice(0, rfH);
    const fromRevertRev = t.slice(rrMatch.index);
    return `${before}\n${newBlock.trim()}\n\n${fromRevertRev}`;
  }

  const before = t.slice(0, rrH);
  return `${before}\n${newBlock.trim()}\n`;
}

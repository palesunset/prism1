/** True when both endpoints are set and differ (compute is meaningful). */
export function canComputeLsp(source: string, destination: string): boolean {
  return Boolean(source && destination && source !== destination);
}

export const NE_LIST_LIMIT = 80;

export type NeDraftCommitResult =
  | { kind: "clear" }
  | { kind: "pick"; value: string }
  | { kind: "revert" };

/** Resolve combobox draft text to a store update action. */
export function commitNeDraft(draft: string, neIds: string[]): NeDraftCommitResult {
  const trimmed = draft.trim();
  if (!trimmed) {
    return { kind: "clear" };
  }
  const match = neIds.find((id) => id.toLowerCase() === trimmed.toLowerCase());
  if (match) {
    return { kind: "pick", value: match };
  }
  return { kind: "revert" };
}

export function filterNeIds(draft: string, neIds: string[], limit = NE_LIST_LIMIT): string[] {
  const q = draft.trim().toLowerCase();
  const list = q ? neIds.filter((id) => id.toLowerCase().includes(q)) : neIds;
  return list.slice(0, limit);
}

export function countNeMatches(draft: string, neIds: string[]): number {
  const q = draft.trim().toLowerCase();
  if (!q) {
    return neIds.length;
  }
  return neIds.filter((id) => id.toLowerCase().includes(q)).length;
}

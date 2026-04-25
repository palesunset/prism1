/**
 * Detect whether a monolithic forward/reverse slice is Nokia SR OS (vs Huawei VRP).
 * Nokia uses admin display-config / show router mpls / MD-CLI paths; Huawei uses sys + explicit-path.
 */
export function isNokiaRsvpBlockText(text: string): boolean {
  const t = text.trim();
  if (!t) {
    return false;
  }
  const firstLine = (t.split("\n")[0] ?? "").trim();
  const looksHuawei = (firstLine === "sys" || firstLine.startsWith("sys ")) && t.includes("explicit-path");
  if (looksHuawei) {
    return false;
  }
  return (
    t.includes("admin display-config") ||
    t.includes("show router mpls") ||
    t.includes("/configure router mpls")
  );
}

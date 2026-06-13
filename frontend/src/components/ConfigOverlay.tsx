import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, FileCode, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  errorDetail,
  exportMonolithic,
  exportMonolithicSection,
  nokiaRsvpNamesForDirection,
} from "../services/apiClient";
import { useAppStore } from "../store/useAppStore";
import { isNokiaRsvpBlockText } from "../utils/isNokiaRsvpBlockText";
import { replaceMonolithicSection, splitMonolithicConfig } from "../utils/splitMonolithicConfig";

type ConfigTab = "pathDetails" | "forward" | "reverse" | "revertForward" | "revertReverse";

export function ConfigOverlay() {
  const monolithicConfig = useAppStore((s) => s.monolithicConfig);
  const mode = useAppStore((s) => s.mode);
  const open = useAppStore((s) => s.configOverlayOpen);
  const setConfigOverlayOpen = useAppStore((s) => s.setConfigOverlayOpen);
  const [activeTab, setActiveTab] = useState<ConfigTab>("pathDetails");
  const [updating, setUpdating] = useState(false);
  const [openLoading, setOpenLoading] = useState(false);

  const lastCompute = useAppStore((s) => s.lastCompute);
  const nxF = useAppStore((s) => s.nokiaRsvpLabelXForward);
  const nyF = useAppStore((s) => s.nokiaRsvpLabelYForward);
  const nzF = useAppStore((s) => s.nokiaRsvpLabelZForward);
  const nxR = useAppStore((s) => s.nokiaRsvpLabelXReverse);
  const nyR = useAppStore((s) => s.nokiaRsvpLabelYReverse);
  const nzR = useAppStore((s) => s.nokiaRsvpLabelZReverse);
  const setNxF = useAppStore((s) => s.setNokiaRsvpLabelXForward);
  const setNyF = useAppStore((s) => s.setNokiaRsvpLabelYForward);
  const setNzF = useAppStore((s) => s.setNokiaRsvpLabelZForward);
  const setNxR = useAppStore((s) => s.setNokiaRsvpLabelXReverse);
  const setNyR = useAppStore((s) => s.setNokiaRsvpLabelYReverse);
  const setNzR = useAppStore((s) => s.setNokiaRsvpLabelZReverse);
  const nokiaCliStyle = useAppStore((s) => s.nokiaCliStyle);

  const split = useMemo(
    () => (monolithicConfig != null ? splitMonolithicConfig(monolithicConfig) : null),
    [monolithicConfig],
  );

  const close = () => setConfigOverlayOpen(false);

  const activeBlockText = useMemo(() => {
    if (split == null) {
      return "";
    }
    if (activeTab === "pathDetails") {
      return split.pathDetails;
    }
    if (activeTab === "forward") {
      return split.forward;
    }
    if (activeTab === "reverse") {
      return split.reverse;
    }
    if (activeTab === "revertForward") {
      return split.revertForward;
    }
    return split.revertReverse;
  }, [split, activeTab]);

  /** X/Y/Z naming applies only to Nokia RSVP-TE forward/reverse blocks (not Huawei or SR-MPLS). */
  const isNokiaRsvpActiveTab = useMemo(() => {
    if (mode !== "rsvp_te" || !split?.hasThreeWaySplit) {
      return false;
    }
    if (activeTab === "forward") {
      return isNokiaRsvpBlockText(split.forward);
    }
    if (activeTab === "reverse") {
      return isNokiaRsvpBlockText(split.reverse);
    }
    return false;
  }, [mode, split, activeTab]);

  const showNokiaRsvpNameFields = lastCompute?.primary != null && isNokiaRsvpActiveTab;

  const userDefineScopeHint =
    activeTab === "forward"
      ? "Nokia configuration only. These values apply to Forward path and Forward Path (Revert). Updates change those sections."
      : activeTab === "reverse"
        ? "Nokia configuration only. These values apply to Reverse path and Reverse Path (Revert). Updates change those sections."
        : null;

  /** Use getState() for X/Y/Z. Full: whole monolithic. Forward/Reverse: only that block (Path details unchanged). */
  const applyMonolithicRefresh = useCallback(
    async (scope: "full" | "forward" | "reverse" | "revert_forward" | "revert_reverse") => {
      const s = useAppStore.getState();
      if (!s.lastCompute?.primary) {
        return;
      }
      const forwardNames = nokiaRsvpNamesForDirection(
        "forward",
        s.nokiaRsvpLabelXForward,
        s.nokiaRsvpLabelYForward,
        s.nokiaRsvpLabelZForward,
      );
      const reverseNames = nokiaRsvpNamesForDirection(
        "reverse",
        s.nokiaRsvpLabelXReverse,
        s.nokiaRsvpLabelYReverse,
        s.nokiaRsvpLabelZReverse,
      );
      const basePayload = {
        lsp_name: s.lspName,
        mode: s.mode,
        flex_algo_id: s.flexAlgoId,
        primary: s.lastCompute.primary,
        backup: s.lastCompute.backup,
        reservations: s.reservations,
        nokia_cli_style: s.nokiaCliStyle,
      };
      const allNokiaNames = {
        ...forwardNames,
        ...reverseNames,
      };
      const fullExport = async () => {
        const txt = await exportMonolithic({ ...basePayload, ...allNokiaNames });
        useAppStore.getState().setMonolithicConfig(txt);
      };
      if (scope === "full") {
        await fullExport();
        return;
      }
      const monolithic = s.monolithicConfig;
      if (monolithic == null) {
        await fullExport();
        return;
      }
      const parsed = splitMonolithicConfig(monolithic);
      if (!parsed.hasThreeWaySplit) {
        await fullExport();
        return;
      }
      if ((scope === "revert_forward" || scope === "revert_reverse") && !parsed.hasRevertSplit) {
        await fullExport();
        return;
      }
      const sectionNames =
        scope === "forward" || scope === "revert_forward" ? forwardNames : reverseNames;
      const mergedPayload = {
        ...basePayload,
        ...sectionNames,
      };
      const patch = async (
        section: "forward" | "reverse" | "revert_forward" | "revert_reverse",
        current: string,
      ) => {
        const block = await exportMonolithicSection(section, mergedPayload);
        return replaceMonolithicSection(current, section, block);
      };
      if (scope === "forward") {
        let next = await patch("forward", monolithic);
        if (parsed.hasRevertSplit) {
          next = await patch("revert_forward", next);
        }
        useAppStore.getState().setMonolithicConfig(next);
        return;
      }
      if (scope === "reverse") {
        let next = await patch("reverse", monolithic);
        if (parsed.hasRevertSplit) {
          next = await patch("revert_reverse", next);
        }
        useAppStore.getState().setMonolithicConfig(next);
        return;
      }
      const block = await exportMonolithicSection(scope, mergedPayload);
      useAppStore.getState().setMonolithicConfig(replaceMonolithicSection(monolithic, scope, block));
    },
    [],
  );

  useEffect(() => {
    if (open) {
      setActiveTab("pathDetails");
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfigOverlayOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setConfigOverlayOpen]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancel = false;
    setOpenLoading(true);
    void (async () => {
      try {
        await applyMonolithicRefresh("full");
        if (cancel) {
          return;
        }
      } catch (e) {
        if (!cancel) {
          toast.error(errorDetail(e) || "Could not refresh configuration from the server.");
        }
      } finally {
        if (!cancel) {
          setOpenLoading(false);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [open, applyMonolithicRefresh, lastCompute?.primary]);

  /** Labels that affect only the current tab’s section (avoid refreshing revert forward when only reverse X/Y/Z change). */
  const labelDepsForActiveTab = useMemo(() => {
    if (!showNokiaRsvpNameFields && (activeTab === "forward" || activeTab === "reverse")) {
      return "";
    }
    if (activeTab === "pathDetails") {
      return `${nxF}\0${nyF}\0${nzF}\0${nxR}\0${nyR}\0${nzR}`;
    }
    if (activeTab === "forward" || activeTab === "revertForward") {
      return `${nxF}\0${nyF}\0${nzF}`;
    }
    if (activeTab === "reverse" || activeTab === "revertReverse") {
      return `${nxR}\0${nyR}\0${nzR}`;
    }
    return "";
  }, [activeTab, nxF, nyF, nzF, nxR, nyR, nzR, showNokiaRsvpNameFields]);

  /** Debounced preview: Path details = full; other tabs = that section only (forward vs reverse naming scoped per tab). */
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (!useAppStore.getState().configOverlayOpen) {
        return;
      }
      if (!useAppStore.getState().lastCompute?.primary) {
        return;
      }
      const scope: "full" | "forward" | "reverse" | "revert_forward" | "revert_reverse" =
        activeTab === "pathDetails"
          ? "full"
          : activeTab === "forward"
            ? "forward"
            : activeTab === "reverse"
              ? "reverse"
              : activeTab === "revertForward"
                ? "revert_forward"
                : "revert_reverse";
      void (async () => {
        try {
          await applyMonolithicRefresh(scope);
        } catch (e) {
          toast.error(errorDetail(e) || "Could not update configuration from the server.");
        }
      })();
    }, 400);
    return () => {
      window.clearTimeout(t);
    };
  }, [labelDepsForActiveTab, nokiaCliStyle, activeTab, applyMonolithicRefresh]);

  /** Plain derivation (no useMemo): avoids hook-order edge cases; inputs only shown when showNokiaRsvpNameFields. */
  let xVal = "";
  let yVal = "";
  let zVal = "";
  let setX: (v: string) => void = () => {};
  let setY: (v: string) => void = () => {};
  let setZ: (v: string) => void = () => {};
  if (activeTab === "forward") {
    xVal = nxF;
    yVal = nyF;
    zVal = nzF;
    setX = setNxF;
    setY = setNyF;
    setZ = setNzF;
  } else if (activeTab === "reverse") {
    xVal = nxR;
    yVal = nyR;
    zVal = nzR;
    setX = setNxR;
    setY = setNyR;
    setZ = setNzR;
  }

  const copyTabLabel: Record<ConfigTab, string> = {
    pathDetails: "Path details",
    forward: "Forward path",
    reverse: "Reverse path",
    revertForward: "Forward Path (Revert)",
    revertReverse: "Reverse Path (Revert)",
  };
  const tabContent = activeBlockText;

  const bodyReady = split != null;
  const showEmptyState = !openLoading && !bodyReady;
  const emptyHint =
    lastCompute?.primary == null
      ? "No path from the last run. Use Compute LSP so a configuration can be generated, then open this again."
      : "Configuration could not be shown. Try again or recompute; if the problem continues, check that the app can reach the API.";

  const handleCopy = async () => {
    if (!tabContent) {
      toast.error("Nothing to copy on this tab.");
      return;
    }
    await navigator.clipboard.writeText(tabContent);
    toast.success(`${copyTabLabel[activeTab]} copied to clipboard`);
  };

  const handleUpdateNokiaConfig = async () => {
    const s = useAppStore.getState();
    if (s.mode !== "rsvp_te" || !s.lastCompute?.primary) {
      toast.error("Compute an RSVP-TE LSP first.");
      return;
    }
    if (!isNokiaRsvpActiveTab) {
      toast.error("X/Y/Z naming applies to Nokia RSVP-TE configuration only.");
      return;
    }
    const scope: "forward" | "reverse" | null =
      activeTab === "forward" ? "forward" : activeTab === "reverse" ? "reverse" : null;
    if (scope == null) {
      toast.error("Switch to Forward path or Reverse path to update naming.");
      return;
    }
    setUpdating(true);
    try {
      await applyMonolithicRefresh(scope);
      toast.success(
        scope === "forward"
          ? "Forward path and Forward Path (Revert) updated"
          : "Reverse path and Reverse Path (Revert) updated",
      );
    } catch (e) {
      toast.error(errorDetail(e));
    } finally {
      setUpdating(false);
    }
  };

  const tabBtn = (id: ConfigTab, label: string) => {
    const isActive = activeTab === id;
    return (
      <button
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => setActiveTab(id)}
        className={[
          "shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition",
          isActive
            ? "border-cyan-500 text-cyan-300"
            : "border-transparent text-slate-500 hover:text-slate-200",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return open ? (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="pointer-events-auto flex h-[85vh] w-full max-w-5xl flex-col rounded-2xl border border-white/10 bg-gray-950 shadow-2xl transition-all duration-300"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 px-4 py-2 sm:px-5 sm:py-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Configuration Output</h2>
              {openLoading ? (
                <p className="text-xs text-cyan-400/90">Syncing the latest from the server…</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-100 transition hover:bg-cyan-600"
                title={`Copy ${copyTabLabel[activeTab]}`}
                aria-label={`Copy ${copyTabLabel[activeTab]}`}
              >
                <Copy size={16} /> Copy
              </button>
              <button
                type="button"
                onClick={close}
                className="p-1 text-slate-400 transition hover:text-white"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <div
            className="flex shrink-0 border-b border-white/5 px-2"
            role="tablist"
            aria-label="Configuration sections"
          >
            {tabBtn("pathDetails", "Path details")}
            {tabBtn("forward", "Forward path")}
            {tabBtn("reverse", "Reverse path")}
            {tabBtn("revertForward", "Forward Path (Revert)")}
            {tabBtn("revertReverse", "Reverse Path (Revert)")}
          </div>
          {showNokiaRsvpNameFields ? (
            <div className="shrink-0 border-b border-cyan-900/30 bg-cyan-950/20 px-3 py-2.5 sm:px-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-cyan-200/90">
                Nokia User Define Configuration
              </div>
              {userDefineScopeHint ? (
                <p className="mt-1 text-[10px] leading-snug text-slate-500">{userDefineScopeHint}</p>
              ) : null}
              <div className="mt-2 flex w-full min-w-0 items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[10px] text-slate-500">X Values</span>
                  <input
                    type="text"
                    className="mt-0.5 min-w-0 w-full rounded border border-cyan-900/50 bg-black/40 px-1.5 py-1.5 font-mono text-xs text-slate-100 focus:border-cyan-500/70 focus:outline-none"
                    value={xVal}
                    onChange={(e) => setX(e.target.value)}
                    placeholder="X"
                    autoComplete="off"
                    aria-label="X values"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[10px] text-slate-500">Y Values</span>
                  <input
                    type="text"
                    className="mt-0.5 min-w-0 w-full rounded border border-cyan-900/50 bg-black/40 px-1.5 py-1.5 font-mono text-xs text-slate-100 focus:border-cyan-500/70 focus:outline-none"
                    value={yVal}
                    onChange={(e) => setY(e.target.value)}
                    placeholder="Y"
                    autoComplete="off"
                    aria-label="Y values"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[10px] text-slate-500">Z Values</span>
                  <input
                    type="text"
                    className="mt-0.5 min-w-0 w-full rounded border border-cyan-900/50 bg-black/40 px-1.5 py-1.5 font-mono text-xs text-slate-100 focus:border-cyan-500/70 focus:outline-none"
                    value={zVal}
                    onChange={(e) => setZ(e.target.value)}
                    placeholder="Z"
                    autoComplete="off"
                    aria-label="Z values"
                  />
                </label>
                <button
                  type="button"
                  disabled={updating || openLoading || split == null}
                  onClick={() => void handleUpdateNokiaConfig()}
                  className="shrink-0 whitespace-nowrap rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-cyan-500 disabled:opacity-50"
                  title={
                    split == null || openLoading
                      ? "Wait for configuration to finish loading"
                      : activeTab === "forward"
                        ? "Apply X/Y/Z to Forward path and Forward Path (Revert)"
                        : "Apply X/Y/Z to Reverse path and Reverse Path (Revert)"
                  }
                >
                  {updating ? "Updating…" : "Update configuration"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="config-output-scroll min-h-0 flex-1 overflow-auto p-4">
            {openLoading && !bodyReady ? (
              <div className="whitespace-pre-wrap rounded-lg bg-prism-hlBg p-4 font-mono text-sm text-slate-400">
                Loading the latest configuration from the server…
              </div>
            ) : showEmptyState ? (
              <div className="whitespace-pre-wrap rounded-lg bg-prism-hlBg p-4 text-sm text-slate-300">{emptyHint}</div>
            ) : (
              <pre
                className={[
                  "whitespace-pre-wrap rounded-lg bg-prism-hlBg p-4 font-mono text-sm",
                  split != null &&
                    ((!split.hasThreeWaySplit && activeTab !== "pathDetails") ||
                      (!split.hasRevertSplit &&
                        (activeTab === "revertForward" || activeTab === "revertReverse")))
                    ? "text-slate-400"
                    : "text-green-300",
                ].join(" ")}
                role="tabpanel"
              >
                {tabContent}
              </pre>
            )}
          </div>
        </div>
      </div>
    </>
  ) : null;
}

export function ConfigOverlayTrigger() {
  const monolithicConfig = useAppStore((s) => s.monolithicConfig);
  const lastCompute = useAppStore((s) => s.lastCompute);
  const setConfigOverlayOpen = useAppStore((s) => s.setConfigOverlayOpen);
  if (monolithicConfig == null && lastCompute?.primary == null) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => setConfigOverlayOpen(true)}
      className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full bg-cyan-600 px-5 py-2 text-white shadow-lg transition hover:bg-cyan-500"
    >
      <FileCode size={18} />
      <span>View Configuration</span>
    </button>
  );
}

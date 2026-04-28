import { useCallback } from "react";
import toast from "react-hot-toast";
import {
  computePaths,
  errorDetail,
  exportClipboard,
  exportMonolithic,
  nokiaRsvpNamesForDirection,
  nokiaRsvpNamesForRevertDirection,
} from "../services/apiClient";
import { useAppStore } from "../store/useAppStore";

/**
 * Central LSP compute + config fetch; reads latest state via getState to avoid stale closures.
 */
export function useLspCompute(context: { onGlobalLoading: (v: boolean) => void; onAfterCompute?: () => void }) {
  const { onGlobalLoading, onAfterCompute } = context;

  const runCompute = useCallback(async () => {
    const s = useAppStore.getState();
    const {
      source,
      destination,
      lspName,
      requiredBwMbps,
      maxHops,
      mode,
      flexAlgoId,
      nokiaCliStyle,
      timeHour,
      failedNeIds,
      failedLinkKeys,
      tradeoffMode,
      tradeoffValue,
      backupTradeoffEnabled,
      enforceSrlgDiversity,
      enforceRoles,
      reservations,
    } = s;

    if (!source || !destination) {
      toast.error("Select source and destination NEs");
      return;
    }

    onGlobalLoading(true);
    const tv = backupTradeoffEnabled ? tradeoffValue : 0;
    try {
      const res = await computePaths({
        source_ne_id: source,
        destination_ne_id: destination,
        flex_algo_id: flexAlgoId,
        required_bw_mbps: requiredBwMbps > 0 ? requiredBwMbps : null,
        max_hops: maxHops,
        mode,
        enforce_srlg_diversity: enforceSrlgDiversity,
        enforce_roles: enforceRoles,
        time_hour: timeHour,
        failed_ne_ids: failedNeIds,
        failed_link_keys: failedLinkKeys,
        tradeoff_mode: tradeoffMode,
        tradeoff_value: tv,
      });
      s.setLastCompute(res);
      s.clearNokiaRsvpUserLabels();
      if (failedNeIds.length === 0 && failedLinkKeys.length === 0) {
        s.setBaselinePrimary(res.primary);
        s.setImpact(null);
      } else {
        const b = s.baselinePrimary;
        if (b && res.primary) {
          s.setImpact({
            primaryLatencyDeltaMs: res.primary.total_latency_ms - b.total_latency_ms,
            primaryHopDelta: res.primary.hop_count - b.hop_count,
          });
        } else {
          s.setImpact(null);
        }
      }
      if (res.primary) {
        try {
          const s2 = useAppStore.getState();
          const forwardNames = nokiaRsvpNamesForDirection(
            "forward",
            s2.nokiaRsvpLabelXForward,
            s2.nokiaRsvpLabelYForward,
            s2.nokiaRsvpLabelZForward,
          );
          const reverseNames = nokiaRsvpNamesForDirection(
            "reverse",
            s2.nokiaRsvpLabelXReverse,
            s2.nokiaRsvpLabelYReverse,
            s2.nokiaRsvpLabelZReverse,
          );
          const forwardRevertNames = nokiaRsvpNamesForRevertDirection(
            "forward_revert",
            s2.nokiaRsvpLabelXForwardRevert,
            s2.nokiaRsvpLabelYForwardRevert,
            s2.nokiaRsvpLabelZForwardRevert,
          );
          const reverseRevertNames = nokiaRsvpNamesForRevertDirection(
            "reverse_revert",
            s2.nokiaRsvpLabelXReverseRevert,
            s2.nokiaRsvpLabelYReverseRevert,
            s2.nokiaRsvpLabelZReverseRevert,
          );
          const txt = await exportMonolithic({
            lsp_name: lspName,
            mode,
            flex_algo_id: flexAlgoId,
            primary: res.primary,
            backup: res.backup,
            reservations,
            nokia_cli_style: nokiaCliStyle,
            ...forwardNames,
            ...reverseNames,
            ...forwardRevertNames,
            ...reverseRevertNames,
          });
          s.setMonolithicConfig(txt);
        } catch (err) {
          s.setMonolithicConfig(null);
          s.setConfigOverlayOpen(false);
          toast.error(errorDetail(err) || "Configuration export failed (check that the API is running and reachable).");
        }
      } else {
        s.setMonolithicConfig(null);
        s.setConfigOverlayOpen(false);
      }
      if (res.primary) {
        const next = [
          ...reservations.filter((r) => r.name !== lspName),
          {
            name: lspName,
            primary_edges: res.primary.edges,
            required_bw_mbps: requiredBwMbps > 0 ? requiredBwMbps : 100,
          },
        ];
        s.setReservations(next);
      }
      s.upsertLsp({
        name: lspName,
        source,
        destination,
        mode,
        requiredBwMbps: requiredBwMbps,
        maxHops,
        primary: res.primary,
        backup: res.backup,
        createdAt: new Date().toISOString(),
      });
      onAfterCompute?.();
    } catch (err) {
      toast.error(errorDetail(err));
    } finally {
      onGlobalLoading(false);
    }
  }, [onGlobalLoading, onAfterCompute]);

  const copyIngress = useCallback(async () => {
    const s = useAppStore.getState();
    if (!s.lastCompute?.primary) {
      return;
    }
    try {
      const text = await exportClipboard({
        lsp_name: s.lspName,
        mode: s.mode,
        flex_algo_id: s.flexAlgoId,
        primary: s.lastCompute.primary,
        backup: s.lastCompute.backup,
        reservations: s.reservations,
        nokia_cli_style: s.nokiaCliStyle,
        ...nokiaRsvpNamesForDirection(
          "forward",
          s.nokiaRsvpLabelXForward,
          s.nokiaRsvpLabelYForward,
          s.nokiaRsvpLabelZForward,
        ),
      });
      await navigator.clipboard.writeText(text);
      toast.success("Ingress configuration copied");
    } catch (err) {
      toast.error(errorDetail(err));
    }
  }, []);

  return { runCompute, copyIngress };
}

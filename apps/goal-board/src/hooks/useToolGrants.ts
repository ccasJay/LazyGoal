import { useCallback, useEffect, useState } from "react";
import type {
  BrowserGoalSessionState,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import type { ControlIntents } from "./useControlIntents";
import { grantsOf } from "../control/results";
import { pendingIntentOfKind } from "../control/reducer";

export function useToolGrants({
  enabled,
  session,
  selectedGoalId,
  onRefreshSession,
  control,
}: {
  enabled: boolean;
  session: BrowserGoalSessionState | null;
  selectedGoalId: string | null;
  onRefreshSession: () => Promise<void>;
  control: ControlIntents;
}) {
  const [toolGrantsLoading, setToolGrantsLoading] = useState(false);
  const [toolGrantsError, setToolGrantsError] = useState<string | null>(null);
  const toolGrants = control.state.resources.grants ?? [];
  const revokingGrantId = pendingIntentOfKind(control.state, "grant_revoke")?.grantId ?? null;

  useEffect(() => {
    if (!enabled || session === null || selectedGoalId === null) return;
    let active = true;
    setToolGrantsLoading(true);
    setToolGrantsError(null);
    void browserApi
      .listToolGrants(session.goalId, session.currentRunId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) throw new Error(result.error);
        control.mergeResources({ grants: result.grants });
      })
      .catch(() => {
        if (active) setToolGrantsError("Could not load saved permissions. Reopen this panel to retry.");
      })
      .finally(() => {
        if (active) setToolGrantsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, session?.goalId, session?.currentRunId, selectedGoalId, control.mergeResources]);

  const revokeToolGrant = useCallback(
    async (grant: BrowserToolGrantSummary) => {
      if (session === null || revokingGrantId !== null) return;
      setToolGrantsError(null);
      const receipt = await control.submit({
        kind: "grant_revoke",
        intentId: crypto.randomUUID(),
        goalId: session.goalId,
        runId: session.currentRunId,
        grantId: grant.grantId,
        scope: grant.scope,
        ...(grant.kind === undefined ? {} : { grantKind: grant.kind }),
      });
      if (receipt.status === "accepted" || receipt.status === "existing") {
        const grants = grantsOf(receipt.result);
        if (grants !== undefined) control.mergeResources({ grants });
        await onRefreshSession();
        return;
      }
      if (receipt.status === "rejected") {
        setToolGrantsError(receipt.error === "stale_run"
          ? "The Run changed before this permission was revoked. Reload and try again."
          : "Could not revoke this permission.");
        if (receipt.refresh === true) await onRefreshSession();
        return;
      }
      const verification = await control.verify(receipt.intentId);
      if (verification === "applied") {
        await onRefreshSession();
        return;
      }
      setToolGrantsError(verification === "not_applied"
        ? "This permission was not revoked. You can try again."
        : "The revoke result could not be confirmed. Reload before trying again.");
    },
    [session, revokingGrantId, control.submit, control.verify, control.mergeResources, onRefreshSession],
  );

  return {
    toolGrants,
    toolGrantsLoading,
    toolGrantsError,
    revokingGrantId,
    revokeToolGrant,
  };
}

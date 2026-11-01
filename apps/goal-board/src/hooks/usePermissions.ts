import { useCallback, useEffect, useState } from "react";
import type {
  BrowserGoalSessionState,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import type { ControlIntents } from "./useControlIntents";
import { grantsOf, permissionOf } from "../control/results";
import { pendingIntentOfKind } from "../control/reducer";

export function usePermissions({
  session,
  control,
  onRefreshSession,
}: {
  session: BrowserGoalSessionState | null;
  control: ControlIntents;
  onRefreshSession: () => Promise<void>;
}) {
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [permissionModeError, setPermissionModeError] = useState<string | null>(null);
  const [permissionMenuGrantsLoading, setPermissionMenuGrantsLoading] = useState(false);
  const [permissionMenuGrantsError, setPermissionMenuGrantsError] = useState<string | null>(null);
  const permissionMode = control.state.resources.permission ?? null;
  const permissionModeBusy = control.state.intents.some(
    (entry) => entry.intent.kind === "permission_mode" && entry.phase === "pending",
  );
  const revokingGrantId = pendingIntentOfKind(control.state, "grant_revoke")?.grantId ?? null;

  const reloadPermissionMode = useCallback(async (): Promise<void> => {
    try {
      const result = await browserApi.getPermissionMode();
      if (result.ok) {
        control.mergeResources({ permission: result });
        setPermissionModeError(null);
      } else {
        setPermissionModeError("Project permissions are unavailable.");
      }
    } catch {
      setPermissionModeError("Could not load project permissions.");
    }
  }, [control.mergeResources]);

  useEffect(() => {
    void reloadPermissionMode();
  }, [reloadPermissionMode]);

  useEffect(() => {
    if (!permissionMenuOpen || session === null) return;
    let active = true;
    setPermissionMenuGrantsLoading(true);
    setPermissionMenuGrantsError(null);
    void browserApi
      .listToolGrants(session.goalId, session.currentRunId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) throw new Error(result.error);
        control.mergeResources({ grants: result.grants });
      })
      .catch(() => {
        if (active) {
          setPermissionMenuGrantsError(
            "Could not load saved permissions. Close and reopen the menu to retry."
          );
        }
      })
      .finally(() => {
        if (active) setPermissionMenuGrantsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [permissionMenuOpen, session?.goalId, session?.currentRunId, control.mergeResources]);

  const updatePermissionMode = useCallback(
    async (mode: "default" | "yolo") => {
      if (permissionMode === null || permissionModeBusy || mode === permissionMode.mode) return;
      setPermissionModeError(null);
      const receipt = await control.submit({
        kind: "permission_mode",
        intentId: crypto.randomUUID(),
        mode,
        expectedRevision: permissionMode.revision,
      });
      if (receipt.status === "accepted" || receipt.status === "existing") {
        const permission = permissionOf(receipt.result);
        if (permission !== undefined) control.mergeResources({ permission });
        setPermissionMenuOpen(false);
        return;
      }
      if (receipt.status === "rejected") {
        await reloadPermissionMode();
        setPermissionModeError(receipt.error === "conflict"
          ? "Project permissions changed elsewhere. The current mode was reloaded."
          : "Could not save the project permission mode.");
        return;
      }
      const verification = await control.verify(receipt.intentId);
      await reloadPermissionMode();
      setPermissionModeError(verification === "applied"
        ? null
        : verification === "not_applied"
          ? "The permission mode was not changed. You can try again."
          : "The permission mode result could not be confirmed. Reload before trying again.");
    },
    [permissionMode, permissionModeBusy, control.submit, control.verify, control.mergeResources, reloadPermissionMode]
  );

  const revokePermissionGrant = useCallback(
    async (grant: BrowserToolGrantSummary): Promise<void> => {
      if (session === null || revokingGrantId !== null) return;
      setPermissionModeError(null);
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
        setPermissionModeError("Could not revoke this permission. Reload the session and try again.");
        return;
      }
      const verification = await control.verify(receipt.intentId);
      if (verification === "applied") {
        await onRefreshSession();
        return;
      }
      setPermissionModeError(verification === "not_applied"
        ? "This permission was not revoked. You can try again."
        : "The revoke result could not be confirmed. Reload the session and try again.");
    },
    [session, revokingGrantId, control.submit, control.verify, control.mergeResources, onRefreshSession]
  );

  return {
    permissionMenuOpen,
    setPermissionMenuOpen,
    permissionMode,
    permissionModeError,
    permissionModeBusy,
    permissionMenuGrants: control.state.resources.grants ?? [],
    permissionMenuGrantsLoading,
    permissionMenuGrantsError,
    revokingGrantId,
    updatePermissionMode,
    revokePermissionGrant,
  };
}

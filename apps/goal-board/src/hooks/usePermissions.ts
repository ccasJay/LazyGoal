import { useCallback, useEffect, useState } from "react";
import type {
  BrowserGoalSession,
  BrowserPermissionModeResult,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";

export function usePermissions({
  session,
}: {
  session: BrowserGoalSession | null;
}) {
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState<Extract<BrowserPermissionModeResult, { ok: true }> | null>(null);
  const [permissionModeError, setPermissionModeError] = useState<string | null>(null);
  const [permissionModeBusy, setPermissionModeBusy] = useState(false);
  const [permissionMenuGrants, setPermissionMenuGrants] = useState<readonly BrowserToolGrantSummary[]>([]);
  const [permissionMenuGrantsLoading, setPermissionMenuGrantsLoading] = useState(false);
  const [permissionMenuGrantsError, setPermissionMenuGrantsError] = useState<string | null>(null);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void browserApi
      .getPermissionMode()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setPermissionMode(result);
          setPermissionModeError(null);
        } else {
          setPermissionModeError("Project permissions are unavailable.");
        }
      })
      .catch(() => {
        if (active) setPermissionModeError("Could not load project permissions.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!permissionMenuOpen || session === null) {
      setPermissionMenuGrants([]);
      return;
    }
    let active = true;
    setPermissionMenuGrantsLoading(true);
    setPermissionMenuGrantsError(null);
    void browserApi
      .listToolGrants(session.goalId, session.currentRunId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) throw new Error(result.error);
        setPermissionMenuGrants(result.grants);
      })
      .catch(() => {
        if (active)
          setPermissionMenuGrantsError(
            "Could not load saved permissions. Close and reopen the menu to retry."
          );
      })
      .finally(() => {
        if (active) setPermissionMenuGrantsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [permissionMenuOpen, session?.goalId, session?.currentRunId]);

  const updatePermissionMode = useCallback(
    async (mode: "default" | "yolo") => {
      if (permissionMode === null || permissionModeBusy || mode === permissionMode.mode) return;
      setPermissionModeBusy(true);
      setPermissionModeError(null);
      try {
        const result = await browserApi.setPermissionMode({
          mode,
          expectedRevision: permissionMode.revision,
        });
        if (!result.ok) {
          const current = await browserApi.getPermissionMode().catch(() => null);
          if (current?.ok) setPermissionMode(current);
          throw new Error(
            result.error === "conflict"
              ? "Project permissions changed elsewhere. The current mode was reloaded."
              : result.error
          );
        }
        setPermissionMode(result);
        setPermissionMenuOpen(false);
      } catch (error) {
        setPermissionModeError(
          error instanceof Error && error.message !== "permissions_unavailable"
            ? error.message
            : "Could not save the project permission mode."
        );
      } finally {
        setPermissionModeBusy(false);
      }
    },
    [permissionMode, permissionModeBusy]
  );

  const revokePermissionGrant = useCallback(
    async (
      grant: BrowserToolGrantSummary,
      onGrantsUpdated?: (grants: readonly BrowserToolGrantSummary[]) => void
    ) => {
      if (session === null || revokingGrantId !== null) return;
      setRevokingGrantId(grant.grantId);
      try {
        const result = await browserApi.revokeToolGrant(session.goalId, {
          runId: session.currentRunId,
          grantId: grant.grantId,
          scope: grant.scope,
          kind: grant.kind ?? "tool",
        });
        if (!result.ok) throw new Error(result.error);
        setPermissionMenuGrants(result.grants);
        onGrantsUpdated?.(result.grants);
      } catch {
        setPermissionModeError("Could not revoke this permission. Reload the session and try again.");
      } finally {
        setRevokingGrantId(null);
      }
    },
    [session, revokingGrantId]
  );

  return {
    permissionMenuOpen,
    setPermissionMenuOpen,
    permissionMode,
    permissionModeError,
    permissionModeBusy,
    permissionMenuGrants,
    permissionMenuGrantsLoading,
    permissionMenuGrantsError,
    revokingGrantId,
    setRevokingGrantId,
    updatePermissionMode,
    revokePermissionGrant,
  };
}


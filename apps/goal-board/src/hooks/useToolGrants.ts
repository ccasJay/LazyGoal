import { useCallback, useEffect, useState } from "react";
import type {
  BrowserGoalSession,
  BrowserToolGrantSummary,
} from "../../../../packages/web-contracts/src/index";
import { BrowserApiError, browserApi } from "../api";
import { errorMessage } from "../types";

export function useToolGrants({
  enabled,
  session,
  selectedGoalId,
  onRefreshSession,
}: {
  enabled: boolean;
  session: BrowserGoalSession | null;
  selectedGoalId: string | null;
  onRefreshSession: () => Promise<void>;
}) {
  const [toolGrants, setToolGrants] = useState<readonly BrowserToolGrantSummary[]>([]);
  const [toolGrantsLoading, setToolGrantsLoading] = useState(false);
  const [toolGrantsError, setToolGrantsError] = useState<string | null>(null);
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

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
        setToolGrants(result.grants);
      })
      .catch((error: unknown) => {
        if (active) setToolGrantsError(errorMessage(error));
      })
      .finally(() => {
        if (active) setToolGrantsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled, session?.goalId, session?.currentRunId, selectedGoalId]);

  const revokeToolGrant = useCallback(
    async (grant: BrowserToolGrantSummary) => {
      if (session === null || revokingGrantId !== null) return;
      setRevokingGrantId(grant.grantId);
      setToolGrantsError(null);
      try {
        const result = await browserApi.revokeToolGrant(session.goalId, {
          runId: session.currentRunId,
          grantId: grant.grantId,
          scope: grant.scope,
        });
        if (!result.ok) throw new Error(result.error);
        setToolGrants(result.grants);
        await onRefreshSession();
      } catch (error) {
        setToolGrantsError(errorMessage(error));
        if (error instanceof BrowserApiError && error.refresh) await onRefreshSession();
      } finally {
        setRevokingGrantId(null);
      }
    },
    [session, revokingGrantId, onRefreshSession]
  );

  return {
    toolGrants,
    setToolGrants,
    toolGrantsLoading,
    toolGrantsError,
    revokingGrantId,
    revokeToolGrant,
  };
}


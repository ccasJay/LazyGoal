import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type {
  BrowserGoalSessionState,
  BrowserPermissionExemptionSummary,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import type { ControlIntents } from "./useControlIntents";
import { exemptionsOf } from "../control/results";
import { pendingIntentOfKind } from "../control/reducer";

/**
 * Goal information 面板的边界豁免读取与撤销。
 *
 * @remarks
 * 只在面板打开时读取当前 Run 的豁免；撤销经 `exemption_revoke` 提交，成功或核验为
 * 已应用后刷新会话与列表。读取失败保留已展示内容并给出可重试说明。
 *
 * @param options - 面板是否打开、当前窄会话状态、选中的 Goal、会话刷新回调与控制入口。
 * @returns 豁免列表、加载与错误状态、撤销忙碌身份与撤销函数。
 * @example
 * ```ts
 * const exemptions = usePermissionExemptions({ enabled, session, selectedGoalId, onRefreshSession, control });
 * ```
 */
export function usePermissionExemptions({
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
  const [exemptionsLoading, setExemptionsLoading] = useState(false);
  const [exemptionsError, setExemptionsError] = useState<string | null>(null);
  const { view } = control.state;
  const { ownsView, currentState, mergeResources } = control;
  const runId = session?.currentRunId;
  const exemptions = control.state.resources.exemptions ?? [];
  const revokingExemptionId = pendingIntentOfKind(control.state, "exemption_revoke")?.exemptionId ?? null;

  const reloadExemptions = useCallback(async (): Promise<void> => {
    if (view === null || runId === undefined || !ownsView(view)) return;
    const isCurrent = () => ownsView(view) && currentState().snapshot?.goal.currentRunId === runId;
    setExemptionsLoading(true);
    setExemptionsError(null);
    try {
      const result = await browserApi.listPermissionExemptions(view.goalId, runId);
      if (!isCurrent()) return;
      if (!result.ok) throw new Error(result.error);
      mergeResources({ exemptions: result.exemptions });
    } catch {
      if (isCurrent()) setExemptionsError("Could not load permission exemptions. Reopen this panel to retry.");
    } finally {
      if (isCurrent()) setExemptionsLoading(false);
    }
  }, [view, runId, ownsView, currentState, mergeResources]);

  useLayoutEffect(() => {
    setExemptionsLoading(false);
    setExemptionsError(null);
  }, [view, runId]);

  useEffect(() => {
    if (!enabled || session === null || selectedGoalId === null) return;
    void reloadExemptions();
  }, [enabled, session?.goalId, session?.currentRunId, selectedGoalId, reloadExemptions]);

  const revokeExemption = useCallback(
    async (exemption: BrowserPermissionExemptionSummary) => {
      if (session === null || revokingExemptionId !== null) return;
      setExemptionsError(null);
      const receipt = await control.submit({
        kind: "exemption_revoke",
        intentId: crypto.randomUUID(),
        goalId: session.goalId,
        runId: session.currentRunId,
        exemptionId: exemption.id,
      });
      if (receipt.status === "accepted" || receipt.status === "existing") {
        const updated = exemptionsOf(receipt.result);
        if (updated !== undefined) control.mergeResources({ exemptions: updated });
        await onRefreshSession();
        return;
      }
      if (receipt.status === "rejected") {
        setExemptionsError(receipt.error === "stale_run"
          ? "The Run changed before this exemption was revoked. Reload and try again."
          : "Could not revoke this permission exemption.");
        if (receipt.refresh === true) await onRefreshSession();
        return;
      }
      const verification = await control.verify(receipt.intentId);
      if (verification === "applied") {
        await onRefreshSession();
        return;
      }
      setExemptionsError(verification === "not_applied"
        ? "This exemption was not revoked. You can try again."
        : "The revoke result could not be confirmed. Reload before trying again.");
    },
    [session, revokingExemptionId, control.submit, control.verify, control.mergeResources, onRefreshSession],
  );

  return {
    exemptions,
    exemptionsLoading,
    exemptionsError,
    revokingExemptionId,
    revokeExemption,
    reloadExemptions,
  };
}

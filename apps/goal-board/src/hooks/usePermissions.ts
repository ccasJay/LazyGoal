import { useCallback, useEffect, useState } from "react";
import type {
  BrowserGoalSessionState,
  BrowserPermissionExemptionSummary,
  BrowserPermissionProfile,
  BrowserPermissionProfileResult,
} from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";
import type { ControlIntents } from "./useControlIntents";
import { exemptionsOf, permissionProfileOf } from "../control/results";
import { pendingIntentOfKind } from "../control/reducer";
import {
  describePermissionProfileFailure,
  permissionProfilesEqual,
} from "../permission-profile";

type PermissionProfileRead = Extract<BrowserPermissionProfileResult, { readonly ok: true }>;

/**
 * 权限入口的数据与命令入口。
 *
 * @remarks
 * 档位与豁免都写入统一 `ControlState` 的资源投影：档位提交走 `permission_profile`，
 * 撤销豁免走 `exemption_revoke`。版本冲突时以服务端返回或重新读取的档位为准，
 * 不清空错误，也不把失败的提交当作已生效。
 *
 * @param options - 当前窄会话状态、控制入口与会话刷新回调。
 * @returns 弹层状态、服务端投影、错误文案与提交函数。
 * @example
 * ```ts
 * const permissions = usePermissions({ session, control, onRefreshSession });
 * ```
 */
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
  const [permissionProfileError, setPermissionProfileError] = useState<string | null>(null);
  const [exemptionsLoading, setExemptionsLoading] = useState(false);
  const [exemptionsError, setExemptionsError] = useState<string | null>(null);
  const permissionProfile = control.state.resources.permission ?? null;
  const goalId = session?.goalId ?? null;
  const runId = session?.currentRunId ?? null;
  const permissionProfileBusy = control.state.intents.some(
    (entry) => entry.intent.kind === "permission_profile" && entry.phase === "pending",
  );
  const revokingExemptionId = pendingIntentOfKind(control.state, "exemption_revoke")?.exemptionId ?? null;

  const readPermissionProfile = useCallback(async (): Promise<PermissionProfileRead | null> => {
    try {
      const result = await browserApi.getPermissionProfile();
      return result.ok ? result : null;
    } catch {
      return null;
    }
  }, []);

  const reloadPermissionProfile = useCallback(async (): Promise<void> => {
    try {
      const result = await browserApi.getPermissionProfile();
      if (result.ok) {
        control.mergeResources({ permission: result });
        setPermissionProfileError(null);
        return;
      }
      setPermissionProfileError(describePermissionProfileFailure(result.error, null));
    } catch {
      setPermissionProfileError("Could not load project permissions.");
    }
  }, [control.mergeResources]);

  useEffect(() => {
    void reloadPermissionProfile();
  }, [reloadPermissionProfile]);

  const reloadExemptions = useCallback(async (): Promise<void> => {
    if (goalId === null || runId === null) return;
    setExemptionsLoading(true);
    setExemptionsError(null);
    try {
      const result = await browserApi.listPermissionExemptions(goalId, runId);
      if (!result.ok) throw new Error(result.error);
      control.mergeResources({ exemptions: result.exemptions });
    } catch {
      setExemptionsError("Could not load permission exemptions. Close and reopen the menu to retry.");
    } finally {
      setExemptionsLoading(false);
    }
  }, [goalId, runId, control.mergeResources]);

  useEffect(() => {
    if (!permissionMenuOpen || session === null) return;
    void reloadExemptions();
  }, [permissionMenuOpen, goalId, runId, reloadExemptions]);

  const updatePermissionProfile = useCallback(
    async (profile: BrowserPermissionProfile) => {
      if (permissionProfile === null || permissionProfileBusy) return;
      if (permissionProfilesEqual(profile, permissionProfile.profile)) return;
      setPermissionProfileError(null);
      const receipt = await control.submit({
        kind: "permission_profile",
        intentId: crypto.randomUUID(),
        profile,
        expectedRevision: permissionProfile.revision,
      });
      if (receipt.status === "accepted" || receipt.status === "existing") {
        const permission = permissionProfileOf(receipt.result);
        if (permission !== undefined) control.mergeResources({ permission });
        setPermissionMenuOpen(false);
        return;
      }
      if (receipt.status === "rejected") {
        const current = await readPermissionProfile();
        if (current !== null) control.mergeResources({ permission: current });
        setPermissionProfileError(describePermissionProfileFailure(
          receipt.error,
          current === null ? null : { profile: current.profile, revision: current.revision },
        ));
        return;
      }
      const verification = await control.verify(receipt.intentId);
      const current = await readPermissionProfile();
      if (current !== null) control.mergeResources({ permission: current });
      setPermissionProfileError(verification === "applied"
        ? null
        : verification === "not_applied"
          ? "The permission level was not changed. You can try again."
          : "The permission result could not be confirmed. Reload before trying again.");
    },
    [permissionProfile, permissionProfileBusy, control.submit, control.verify, control.mergeResources, readPermissionProfile]
  );

  const revokePermissionExemption = useCallback(
    async (exemption: BrowserPermissionExemptionSummary): Promise<void> => {
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
        const exemptions = exemptionsOf(receipt.result);
        if (exemptions !== undefined) control.mergeResources({ exemptions });
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
        await reloadExemptions();
        await onRefreshSession();
        return;
      }
      setExemptionsError(verification === "not_applied"
        ? "This exemption was not revoked. You can try again."
        : "The revoke result could not be confirmed. Reload before trying again.");
    },
    [session, revokingExemptionId, control.submit, control.verify, control.mergeResources, onRefreshSession, reloadExemptions]
  );

  return {
    permissionMenuOpen,
    setPermissionMenuOpen,
    permissionProfile,
    permissionProfileError,
    permissionProfileBusy,
    exemptions: control.state.resources.exemptions ?? [],
    exemptionsLoading,
    exemptionsError,
    revokingExemptionId,
    updatePermissionProfile,
    revokePermissionExemption,
    reloadPermissionProfile,
    reloadExemptions,
  };
}

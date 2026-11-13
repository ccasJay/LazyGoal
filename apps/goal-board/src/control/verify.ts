import type { BrowserControlIntentCommand } from "../../../../packages/web-contracts/src/index";
import { permissionProfilesEqual } from "../permission-profile";
import { browserApi } from "../api";

/** 核验结论；只有 `not_applied` 允许以原身份重试。 */
export type ControlVerification = "applied" | "not_applied" | "unknown";

/**
 * 按原意图身份核验一次结果不明的命令。
 *
 * @remarks
 * 复用各资源现有身份与修订，不建立通用收据存储：SessionInput 查 `inputId`
 * 收据，权限档位查当前三轴值与 revision，边界豁免查列表中的 `id`，Goal 查存在与
 * 归档状态，模型选择查当前目录，审批预检查当前 `pendingAction`。读取失败一律返回
 * `unknown`，不推断“未执行”。
 *
 * @param intent - 原始冻结意图。
 * @returns 核验结论。
 * @example
 * ```ts
 * const verification = await verifyControlIntent(intent);
 * ```
 */
export async function verifyControlIntent(intent: BrowserControlIntentCommand): Promise<ControlVerification> {
  switch (intent.kind) {
    case "create_session":
      return verifyCreateSession(intent.goalId, intent.inputId);
    case "session_input":
      return verifySessionInput(intent.goalId, intent.input.inputId);
    case "plan_mode":
      return verifyRunStillWaiting(intent.goalId, intent.runId);
    case "model_selection":
      return verifyModelSelection(intent.modelId);
    case "permission_profile":
      return verifyPermissionProfile(intent.profile, intent.expectedRevision);
    case "exemption_revoke":
      return verifyExemptionRevoked(intent.goalId, intent.runId, intent.exemptionId);
    case "goal_archive":
      return verifyGoalArchive(intent.goalId, intent.archived);
    case "goal_delete":
      return verifyGoalDeleted(intent.goalId);
    case "action_review":
      return verifyActionStillWaiting(intent.goalId, intent.actionId);
  }
}

async function verifyCreateSession(goalId: string, inputId: string): Promise<ControlVerification> {
  try {
    const state = await browserApi.readGoalSessionState(goalId);
    if (state.goal.goalId !== goalId) return "unknown";
  } catch {
    return "not_applied";
  }
  try {
    const receipt = await browserApi.readInputReceipt(goalId, inputId);
    if (!receipt.ok) return "unknown";
    return receipt.found ? "applied" : "not_applied";
  } catch {
    return "unknown";
  }
}

async function verifySessionInput(goalId: string, inputId: string): Promise<ControlVerification> {
  try {
    const receipt = await browserApi.readInputReceipt(goalId, inputId);
    if (!receipt.ok) return "unknown";
    return receipt.found ? "applied" : "not_applied";
  } catch {
    return "unknown";
  }
}

async function verifyRunStillWaiting(goalId: string, runId: string): Promise<ControlVerification> {
  try {
    const state = await browserApi.readGoalSessionState(goalId);
    return state.goal.currentRunId === runId ? "not_applied" : "applied";
  } catch {
    return "unknown";
  }
}

async function verifyModelSelection(modelId: string): Promise<ControlVerification> {
  try {
    const catalog = await browserApi.listModels();
    return catalog.currentModelId === modelId ? "applied" : "not_applied";
  } catch {
    return "unknown";
  }
}

async function verifyPermissionProfile(
  profile: Extract<BrowserControlIntentCommand, { readonly kind: "permission_profile" }>["profile"],
  expectedRevision: number,
): Promise<ControlVerification> {
  try {
    const result = await browserApi.getPermissionProfile();
    if (!result.ok) return "unknown";
    if (permissionProfilesEqual(result.profile, profile)) return "applied";
    return result.revision === expectedRevision ? "not_applied" : "unknown";
  } catch {
    return "unknown";
  }
}

async function verifyExemptionRevoked(
  goalId: string,
  runId: string,
  exemptionId: string,
): Promise<ControlVerification> {
  try {
    const result = await browserApi.listPermissionExemptions(goalId, runId);
    if (!result.ok) return "unknown";
    return result.exemptions.some((exemption) => exemption.id === exemptionId && exemption.status !== "revoked")
      ? "not_applied"
      : "applied";
  } catch {
    return "unknown";
  }
}

async function verifyGoalArchive(goalId: string, archived: boolean): Promise<ControlVerification> {
  try {
    const list = await browserApi.listGoals();
    const goal = list.goals.find((item) => item.goalId === goalId);
    if (goal === undefined) return "unknown";
    return goal.archived === archived ? "applied" : "not_applied";
  } catch {
    return "unknown";
  }
}

async function verifyGoalDeleted(goalId: string): Promise<ControlVerification> {
  try {
    const list = await browserApi.listGoals();
    return list.goals.some((item) => item.goalId === goalId) ? "not_applied" : "applied";
  } catch {
    return "unknown";
  }
}

async function verifyActionStillWaiting(goalId: string, actionId: string): Promise<ControlVerification> {
  try {
    const state = await browserApi.readGoalSessionState(goalId);
    return state.goal.pendingAction?.actionId === actionId ? "not_applied" : "unknown";
  } catch {
    return "unknown";
  }
}

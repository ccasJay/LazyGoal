import type { BrowserControlIntentCommand } from "../../../../packages/web-contracts/src/index";
import { browserApi } from "../api";

/** 核验结论；只有 `not_applied` 允许以原身份重试。 */
export type ControlVerification = "applied" | "not_applied" | "unknown";

/**
 * 按原意图身份核验一次结果不明的命令。
 *
 * @remarks
 * 复用各资源现有身份与修订，不建立通用收据存储：SessionInput 查 `inputId`
 * 收据，权限查当前 revision，Grant 查摘要中 `grantId`，Goal 查存在与归档状态，
 * 模型选择查当前目录，审批预检查当前 `pendingAction`。读取失败一律返回
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
    case "permission_mode":
      return verifyPermissionMode(intent.mode, intent.expectedRevision);
    case "grant_revoke":
      return verifyGrantRevoked(intent.goalId, intent.runId, intent.grantId);
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

async function verifyPermissionMode(
  mode: "default" | "yolo",
  expectedRevision: number,
): Promise<ControlVerification> {
  try {
    const result = await browserApi.getPermissionMode();
    if (!result.ok) return "unknown";
    if (result.mode === mode) return "applied";
    return result.revision === expectedRevision ? "not_applied" : "unknown";
  } catch {
    return "unknown";
  }
}

async function verifyGrantRevoked(goalId: string, runId: string, grantId: string): Promise<ControlVerification> {
  try {
    const result = await browserApi.listToolGrants(goalId, runId);
    if (!result.ok) return "unknown";
    return result.grants.some((grant) => grant.grantId === grantId) ? "not_applied" : "applied";
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

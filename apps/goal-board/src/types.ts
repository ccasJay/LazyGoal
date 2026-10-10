import type {
  BrowserGoalListItem,
  BrowserGoalSession,
  BrowserSessionMessage,
  BrowserSessionStep,
  BrowserToolGrantSummary,
  BrowserModelCatalog,
  BrowserModelOption,
  BrowserPermissionModeResult,
  BrowserWorkspaceContext,
  SessionMetricsSnapshot,
} from "../../../packages/web-contracts/src/index";
import {
  createSlashCommandRegistry,
  modelCommandDefinition,
  planCommandDefinition,
  type ModelCommandEffect,
} from "../../../packages/slash-command/src/index";
import { BrowserApiError } from "./api";

export type GoalStatus = "Ready" | "Running" | "Needs input" | "Completed" | "Stopped";
export type SessionTab = "Board" | "Activity" | "Plan" | "Trajectory";
export type MetricsState = { readonly kind: "ready"; readonly value: SessionMetricsSnapshot } | { readonly kind: "error" };
export type QueuedInput = { readonly messageId: string; readonly content: string };

export const statuses: readonly GoalStatus[] = [
  "Ready",
  "Running",
  "Needs input",
  "Completed",
  "Stopped",
];

export const slashCommands = createSlashCommandRegistry<ModelCommandEffect>();
slashCommands.register(planCommandDefinition);
slashCommands.register(modelCommandDefinition);

export type ModelPickerTarget =
  | { readonly kind: "draft" }
  | { readonly kind: "goal"; readonly goalId: string; readonly runId: string };

export function statusFromRun(status: BrowserGoalListItem["runStatus"]): GoalStatus {
  switch (status) {
    case "created": return "Ready";
    case "running": return "Running";
    case "waiting": return "Needs input";
    case "completed": return "Completed";
    case "failed":
    case "cancelled": return "Stopped";
  }
}

export function statusClass(status: GoalStatus): string {
  return status.toLowerCase().replaceAll(" ", "-");
}

export function sessionStatus(session: BrowserGoalSession): string {
  if (session.pendingAction?.status === "outcome_unknown") return "Outcome needs review";
  if (session.pendingAction?.status === "awaiting_approval") return "Awaiting approval";
  if (session.pendingAction?.status === "approved") return "Action accepted";
  if (session.pendingInteraction?.kind === "task_approval") return "Awaiting task approval";
  if (session.pendingInteraction) return "Awaiting your response";
  return session.runStatus.charAt(0).toUpperCase() + session.runStatus.slice(1);
}

export function metricNumber(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function metricPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function metricSpeed(value: number | null): string {
  return value === null ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);
}

export function metricCoverage(metrics: Pick<SessionMetricsSnapshot, "coverage" | "missingCalls">): string | null {
  if (metrics.coverage === "unavailable") return "Usage unavailable";
  if (metrics.coverage === "partial") return metrics.missingCalls > 0
    ? `${metrics.missingCalls} call${metrics.missingCalls === 1 ? "" : "s"} unreported`
    : "Partial coverage";
  return null;
}

export function committedStepCount(value: BrowserGoalSession): number {
  return value.runs.reduce((total, run) => total + run.steps.length, 0);
}

export function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function errorMessage(error: unknown): string {
  if (error instanceof BrowserApiError) {
    switch (error.code) {
      case "unauthorized": return "This browser link has expired. Restart `lazygoal web` and open its new link.";
      case "goal_busy": return "Another Goal is still active. Wait for it to stop at a waiting point.";
      case "plan_mode_busy": return "Plan Mode can only be selected before this Run starts or after it completes or fails.";
      case "plan_mode_failed": return "The local service could not save the Plan Mode selection.";
      case "model_not_selectable": return "This model is unavailable. Choose another model from the current provider.";
      case "model_switch_not_allowed": return "This Run cannot change models at its current step.";
      case "model_catalog_authentication": return "Model catalog authentication failed. Check the provider credentials.";
      case "model_catalog_permission": return "The provider denied access to its model catalog.";
      case "model_catalog_protocol": return "The provider returned an invalid model catalog.";
      case "model_catalog_unavailable": return "The model catalog is unavailable. Retry after the provider connection recovers.";
      case "model_selection_failed": return "The local service could not save this model selection.";
      case "model_restore_failed": return "The saved model binding could not be restored. This Run was not advanced.";
      case "invalid_model_selection": return "Choose a valid model from this list.";
      case "goal_not_found": return "This Goal is no longer available in the current workspace.";
      case "stale_run":
      case "stale_request":
      case "action_not_waiting":
      case "goal_not_waiting": return "The session changed. The latest saved state is being loaded.";
      case "structured_interaction_required": return "Use the answer or approval form shown for this request.";
      case "request_too_large": return "This request is too long. Shorten it and try again.";
      case "goal_id_conflict": return "A Goal with this request identity already exists.";
      case "invalid_plan_mode_command": return "This session cannot change Plan Mode because its Run identity is invalid.";
      case "invalid_goal_input":
      case "invalid_message": return "Enter a non-empty Goal or message.";
      default: return `The local service could not complete this request (${error.code}).`;
    }
  }
  if (error instanceof Error && error.message === "browser_session_token_missing") {
    return "Open the local link printed by `lazygoal web` to connect this board.";
  }
  if (error instanceof Error && error.message === "Failed to fetch") {
    return "Could not reach the local service. Check that LazyGoal is still running, then retry.";
  }
  return "Could not load the latest saved state. Retry to reconnect.";
}

export type BrowserInputDispatch =
  | { readonly kind: "text"; readonly content: string }
  | { readonly kind: "plan" }
  | { readonly kind: "model" }
  | { readonly kind: "error"; readonly message: string };

export async function dispatchBrowserInput(input: string): Promise<BrowserInputDispatch> {
  const result = await slashCommands.dispatch(input);
  switch (result.kind) {
    case "text":
      return { kind: "text", content: input };
    case "escaped_text":
      return { kind: "text", content: result.content };
    case "rejected":
      return { kind: "error", message: result.message };
    case "executed":
      return result.effect.kind === "enter_plan_mode" ? { kind: "plan" } : { kind: "model" };
  }
}

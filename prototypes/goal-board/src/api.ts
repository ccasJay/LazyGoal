import type {
  BrowserCreateGoalCommand,
  BrowserGoalInteractionCommand,
  BrowserGoalListItem,
  BrowserGoalMessageCommand,
  BrowserGoalPlanModeCommand,
  BrowserGoalSession,
  BrowserActionDetailsResult,
  BrowserToolGrantResult,
  BrowserToolGrantRevokeCommand,
  BrowserModelCatalog,
  BrowserModelSelectionCommand,
} from "../../../packages/browser/src/index";
import type { BrowserGoalLiveEvent } from "../../../packages/browser/src/browser-goal-stream";

const token = window.location.hash.slice(1);

export class BrowserApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly refresh: boolean,
  ) {
    super(code);
    this.name = "BrowserApiError";
  }
}

export const browserApi = {
  get hasAccessToken(): boolean {
    return token.length > 0;
  },

  listGoals(signal?: AbortSignal): Promise<readonly BrowserGoalListItem[]> {
    return requestJson("/api/goals", isGoalList, signal).then((body) => body.goals);
  },

  readGoal(goalId: string, signal?: AbortSignal): Promise<BrowserGoalSession> {
    return requestJson(
      `/api/goals/${encodeURIComponent(goalId)}`,
      isGoalSessionEnvelope,
      signal,
    ).then((body) => body.goal);
  },

  createGoal(command: BrowserCreateGoalCommand): Promise<AcceptedCommand> {
    return postJson("/api/goals", command, isAcceptedCommand);
  },

  listModels(target?: { goalId: string; runId: string }, signal?: AbortSignal): Promise<BrowserModelCatalog> {
    const path = target === undefined ? "/api/models"
      : `/api/goals/${encodeURIComponent(target.goalId)}/models?runId=${encodeURIComponent(target.runId)}`;
    return requestJson(path, isModelCatalog, signal);
  },

  selectModel(goalId: string, command: BrowserModelSelectionCommand): Promise<{ readonly ok: true; readonly modelId: string }> {
    return postJson(`/api/goals/${encodeURIComponent(goalId)}/model-selection`, command, isModelSelectionAccepted);
  },

  interact(
    goalId: string,
    command: BrowserGoalInteractionCommand,
  ): Promise<AcceptedCommand> {
    return postJson(
      `/api/goals/${encodeURIComponent(goalId)}/interactions`,
      command,
      isAcceptedCommand,
    );
  },

  sendMessage(
    goalId: string,
    command: BrowserGoalMessageCommand,
  ): Promise<AcceptedCommand> {
    return postJson(
      `/api/goals/${encodeURIComponent(goalId)}/messages`,
      command,
      isAcceptedCommand,
    );
  },

  enterPlanMode(
    goalId: string,
    command: BrowserGoalPlanModeCommand,
  ): Promise<AcceptedCommand> {
    return postJson(
      `/api/goals/${encodeURIComponent(goalId)}/plan-mode`,
      command,
      isAcceptedCommand,
    );
  },

  readActionDetails(goalId: string, runId: string, actionId: string): Promise<BrowserActionDetailsResult> {
    return requestJson(
      `/api/goals/${encodeURIComponent(goalId)}/actions/${encodeURIComponent(actionId)}?runId=${encodeURIComponent(runId)}`,
      isActionDetailsResult,
    );
  },

  listToolGrants(goalId: string, runId: string): Promise<BrowserToolGrantResult> {
    return requestJson(
      `/api/goals/${encodeURIComponent(goalId)}/grants?runId=${encodeURIComponent(runId)}`,
      isToolGrantResult,
    );
  },

  revokeToolGrant(goalId: string, command: BrowserToolGrantRevokeCommand): Promise<BrowserToolGrantResult> {
    return requestJson(
      `/api/goals/${encodeURIComponent(goalId)}/grants/${encodeURIComponent(command.grantId)}`,
      isToolGrantResult,
      undefined,
      {
        method: "DELETE",
        headers: authorizedHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ runId: command.runId, scope: command.scope }),
      },
    );
  },

  async *events(
    goalId: string,
    runId: string,
    signal: AbortSignal,
  ): AsyncGenerator<BrowserGoalLiveEvent> {
    const response = await fetch(
      `/api/goals/${encodeURIComponent(goalId)}/events?runId=${encodeURIComponent(runId)}`,
      {
        headers: authorizedHeaders({ accept: "text/event-stream" }),
        signal,
      },
    );
    if (!response.ok) throw await responseError(response);
    if (response.body === null) throw new Error("event_stream_missing_body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const chunk = await reader.read();
        buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = block
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data.length > 0) {
            const value: unknown = JSON.parse(data);
            if (isLiveEvent(value)) yield value;
          }
          boundary = buffer.indexOf("\n\n");
        }
        if (chunk.done) break;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  },
};

interface AcceptedCommand {
  readonly goalId: string;
  readonly runId: string;
  readonly existing: boolean;
}

async function postJson<T>(path: string, body: unknown, guard: (value: unknown) => value is T): Promise<T> {
  return requestJson(path, guard, undefined, {
    method: "POST",
    headers: authorizedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
}

async function requestJson<T>(
  path: string,
  guard: (value: unknown) => value is T,
  signal?: AbortSignal,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: authorizedHeaders(init.headers),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw await responseError(response);
  const value: unknown = await response.json();
  if (!guard(value)) throw new Error("invalid_api_response");
  return value;
}

function authorizedHeaders(input?: HeadersInit): Headers {
  if (token.length === 0) throw new Error("browser_session_token_missing");
  const headers = new Headers(input);
  headers.set("authorization", `Bearer ${token}`);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  return headers;
}

async function responseError(response: Response): Promise<BrowserApiError> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    value = undefined;
  }
  const body = isRecord(value) ? value : {};
  return new BrowserApiError(
    typeof body.error === "string" ? body.error : "request_failed",
    response.status,
    body.refresh === true,
  );
}

function isGoalList(value: unknown): value is { readonly goals: readonly BrowserGoalListItem[] } {
  return isRecord(value) && Array.isArray(value.goals) && value.goals.every(isGoalListItem);
}

function isModelCatalog(value: unknown): value is BrowserModelCatalog {
  return isRecord(value)
    && isNonEmptyString(value.provider)
    && isNonEmptyString(value.currentModelId)
    && Array.isArray(value.models)
    && value.models.every((model) => isRecord(model)
      && isNonEmptyString(model.id)
      && isNonEmptyString(model.displayName)
      && ["live", "catalog", "configured"].includes(String(model.availabilitySource))
      && ["live", "catalog", "configured", "mixed"].includes(String(model.metadataSource))
      && typeof model.selectable === "boolean"
      && (model.contextWindowTokens === undefined || (Number.isSafeInteger(model.contextWindowTokens) && Number(model.contextWindowTokens) > 0))
      && (model.maxOutputTokens === undefined || (Number.isSafeInteger(model.maxOutputTokens) && Number(model.maxOutputTokens) > 0))
      && (model.reasoning === undefined || typeof model.reasoning === "boolean")
      && (model.vision === undefined || typeof model.vision === "boolean")
      && (model.unavailableReason === undefined || typeof model.unavailableReason === "string"));
}

function isModelSelectionAccepted(value: unknown): value is { readonly ok: true; readonly modelId: string } {
  return isRecord(value) && value.ok === true && isNonEmptyString(value.modelId);
}

function isGoalListItem(value: unknown): value is BrowserGoalListItem {
  return isRecord(value)
    && isNonEmptyString(value.goalId)
    && isNonEmptyString(value.runId)
    && typeof value.intent === "string"
    && typeof value.workflowPhase === "string"
    && isRunStatus(value.runStatus)
    && typeof value.updatedAt === "string";
}

function isGoalSessionEnvelope(value: unknown): value is { readonly goal: BrowserGoalSession } {
  return isRecord(value) && isBrowserGoalSession(value.goal);
}

function isBrowserGoalSession(value: unknown): value is BrowserGoalSession {
  if (!isRecord(value)
    || !isNonEmptyString(value.goalId)
    || typeof value.intent !== "string"
    || !isNonEmptyString(value.currentRunId)
    || !isRunStatus(value.runStatus)
    || (value.currentRunMode !== "normal" && value.currentRunMode !== "plan")
    || (value.nextRunMode !== undefined && value.nextRunMode !== "plan")
    || !Array.isArray(value.messages)
    || !value.messages.every((message) => isRecord(message)
      && (message.role === "user" || message.role === "assistant")
      && typeof message.content === "string")
    || !Array.isArray(value.runs)
    || !value.runs.every(isBrowserRun)
    || typeof value.historyTruncated !== "boolean") return false;

  if (value.goalPlan !== undefined && !isGoalPlan(value.goalPlan)) return false;
  if (value.pendingInteraction !== undefined && !isPendingInteraction(value.pendingInteraction)) return false;
  if (value.pendingAction !== undefined && !isPendingAction(value.pendingAction)) return false;
  return true;
}

function isBrowserRun(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.runId)
    && isRunStatus(value.status)
    && Number.isSafeInteger(value.stepCount)
    && Array.isArray(value.steps)
    && value.steps.every((step) => isRecord(step)
      && isNonEmptyString(step.executionUnitId)
      && Number.isSafeInteger(step.sequence)
      && Number.isSafeInteger(step.stepIndex)
      && ["recorded", "completed", "failed", "rejected"].includes(String(step.status))
      && (step.summary === undefined || typeof step.summary === "string")
      && (step.recoveryAttempts === undefined || Array.isArray(step.recoveryAttempts)
        && step.recoveryAttempts.every((attempt) => typeof attempt === "string")))
    && (value.terminalDetail === undefined || isRecord(value.terminalDetail)
      && typeof value.terminalDetail.message === "string"
      && (value.terminalDetail.code === undefined || typeof value.terminalDetail.code === "string"))
    && typeof value.current === "boolean";
}

function isGoalPlan(value: unknown): boolean {
  return isRecord(value)
    && Number.isSafeInteger(value.revision)
    && Array.isArray(value.items)
    && value.items.every((item) => isRecord(item)
      && isNonEmptyString(item.id)
      && typeof item.content === "string"
      && Number.isSafeInteger(item.position)
      && ["pending", "in_progress", "completed", "cancelled"].includes(String(item.status)));
}

function isPendingInteraction(value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.requestId)) return false;
  if (value.kind === "task_approval") {
    return typeof value.objective === "string"
      && typeof value.approvalRequest === "string"
      && Array.isArray(value.completionCriteria)
      && value.completionCriteria.every((item) => typeof item === "string");
  }
  return value.kind === "ask_user"
    && (value.mode === "plan" || value.mode === "execution")
    && Array.isArray(value.questions)
    && value.questions.every((question) => isRecord(question)
      && isNonEmptyString(question.id)
      && typeof question.header === "string"
      && typeof question.question === "string"
      && typeof question.multiSelect === "boolean"
      && Array.isArray(question.options)
      && question.options.every((option) => isRecord(option)
        && isNonEmptyString(option.id)
        && typeof option.label === "string"
        && (option.description === undefined || typeof option.description === "string")));
}

function isPendingAction(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value.actionId)
    && isNonEmptyString(value.toolId)
    && ["approved", "awaiting_approval", "outcome_unknown"].includes(String(value.status))
    && typeof value.inputPreview === "string"
    && typeof value.inputPreviewTruncated === "boolean"
    && (value.targetPath === undefined || typeof value.targetPath === "string");
}

function isActionDetailsResult(value: unknown): value is BrowserActionDetailsResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") return false;
  if (!value.ok) return typeof value.error === "string";
  return isNonEmptyString(value.goalId)
    && isNonEmptyString(value.runId)
    && isNonEmptyString(value.actionId)
    && isNonEmptyString(value.toolId)
    && isJsonValue(value.input);
}

function isToolGrantResult(value: unknown): value is BrowserToolGrantResult {
  return isRecord(value)
    && (value.ok === false
      ? typeof value.error === "string"
      : value.ok === true
        && isNonEmptyString(value.goalId)
        && isNonEmptyString(value.runId)
        && Array.isArray(value.grants)
        && value.grants.every((grant) => isRecord(grant)
          && isNonEmptyString(grant.grantId)
          && (grant.scope === "goal" || grant.scope === "workspace")
          && isNonEmptyString(grant.toolId)
          && ["pending", "active", "revoked"].includes(String(grant.status))
          && (grant.targetPath === undefined || typeof grant.targetPath === "string")));
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isAcceptedCommand(value: unknown): value is AcceptedCommand {
  return isRecord(value)
    && isNonEmptyString(value.goalId)
    && isNonEmptyString(value.runId)
    && typeof value.existing === "boolean";
}

function isLiveEvent(value: unknown): value is BrowserGoalLiveEvent {
  if (!isRecord(value) || !isNonEmptyString(value.goalId) || !isNonEmptyString(value.runId)) return false;
  if (value.type === "snapshot_changed" || value.type === "refresh_required") return true;
  if (value.type !== "activity" || !isRecord(value.activity)) return false;
  const activity = value.activity;
  if (activity.kind === "assistant_text_delta") {
    return typeof activity.text === "string" && typeof activity.truncated === "boolean";
  }
  return ["model_started", "model_completed", "step_started", "tool_started", "tool_finished"]
    .includes(String(activity.kind));
}

function isRunStatus(value: unknown): value is BrowserGoalSession["runStatus"] {
  return ["created", "running", "waiting", "completed", "failed", "cancelled"].includes(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

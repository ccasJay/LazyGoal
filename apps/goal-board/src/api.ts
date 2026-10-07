import {
  isAcceptedCommand,
  isBrowserGoalSteerResult,
  isBrowserGoalInterruptResult,
  isActionDetailsResult,
  isBrowserGoalSession,
  isGoalList,
  isGoalSessionEnvelope,
  isLiveEvent,
  isMetricsSnapshot,
  isModelCatalog,
  isModelInputDetail,
  isModelInputs,
  isModelPreferenceAccepted,
  isModelSelectionAccepted,
  isOkResponse,
  isPermissionModeResult,
  isRecord,
  isToolGrantResult,
  isTrajectoryDetail,
  isTrajectoryPage,
  isTrajectoryRuns,
  isWorkspaceContext,
  type AcceptedCommand,
  type BrowserActionDetailsResult,
  type BrowserCreateGoalCommand,
  type BrowserGoalInteractionCommand,
  type BrowserGoalSteerCommand,
  type BrowserGoalInterruptCommand,
  type BrowserGoalListItem,
  type BrowserGoalLiveEvent,
  type BrowserGoalMessageCommand,
  type BrowserGoalPlanModeCommand,
  type BrowserGoalSession,
  type BrowserResumeGoalCommand,
  type BrowserModelCatalog,
  type BrowserModelInputDetail,
  type BrowserModelInputSummary,
  type BrowserModelSelectionCommand,
  type BrowserPermissionModeCommand,
  type BrowserPermissionModeResult,
  type BrowserToolGrantResult,
  type BrowserToolGrantRevokeCommand,
  type BrowserTrajectoryDetail,
  type BrowserTrajectoryEntry,
  type BrowserTrajectoryPage,
  type BrowserTrajectoryRun,
  type BrowserWorkspaceContext,
  type SessionMetricsSnapshot,
} from "../../../packages/web-contracts/src/index";

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

  setGoalArchived(goalId: string, archived: boolean): Promise<{ readonly ok: true }> {
    return postJson(`/api/goals/${encodeURIComponent(goalId)}/archive`, { archived }, isOkResponse);
  },

  deleteGoal(goalId: string): Promise<{ readonly ok: true }> {
    return requestJson(`/api/goals/${encodeURIComponent(goalId)}`, isOkResponse, undefined, { method: "DELETE" });
  },

  readGoal(goalId: string, signal?: AbortSignal): Promise<BrowserGoalSession> {
    return requestJson(
      `/api/goals/${encodeURIComponent(goalId)}`,
      isGoalSessionEnvelope,
      signal,
    ).then((body) => body.goal);
  },

  modelInputs(goalId: string, runId: string, offset = 0, signal?: AbortSignal, query = ""): Promise<{ calls: BrowserModelInputSummary[]; total: number; nextOffset: number | null }> {
    return requestJson(`/api/goals/${encodeURIComponent(goalId)}/model-inputs?runId=${encodeURIComponent(runId)}&offset=${offset}&q=${encodeURIComponent(query)}`, isModelInputs, signal);
  },
  modelInput(goalId: string, runId: string, callId: string, signal?: AbortSignal): Promise<BrowserModelInputDetail> {
    return requestJson(`/api/goals/${encodeURIComponent(goalId)}/model-inputs?runId=${encodeURIComponent(runId)}&callId=${encodeURIComponent(callId)}`, isModelInputDetail, signal);
  },
  trajectoryRuns(goalId: string, offset = 0, signal?: AbortSignal): Promise<{ runs: BrowserTrajectoryRun[]; nextOffset: number | null }> {
    return requestJson(`/api/goals/${encodeURIComponent(goalId)}/trajectory/runs?offset=${offset}`, isTrajectoryRuns, signal);
  },

  trajectory(goalId: string, query: URLSearchParams, signal?: AbortSignal): Promise<BrowserTrajectoryPage> {
    return requestJson(`/api/goals/${encodeURIComponent(goalId)}/trajectory?${query}`, isTrajectoryPage, signal);
  },

  trajectoryDetail(goalId: string, runId: string, sequence: number, signal?: AbortSignal): Promise<BrowserTrajectoryDetail> {
    return requestJson(`/api/goals/${encodeURIComponent(goalId)}/trajectory/events/${sequence}?runId=${encodeURIComponent(runId)}`, isTrajectoryDetail, signal);
  },

  readMetrics(goalId: string, signal?: AbortSignal): Promise<SessionMetricsSnapshot> {
    return requestJson(`/goals/${encodeURIComponent(goalId)}/metrics`, isMetricsSnapshot, signal);
  },

  async *metrics(goalId: string, signal: AbortSignal): AsyncGenerator<SessionMetricsSnapshot> {
    const response = await fetch(`/goals/${encodeURIComponent(goalId)}/metrics/stream`, {
      headers: authorizedHeaders({ accept: "text/event-stream" }), signal,
    });
    if (!response.ok) throw await responseError(response);
    if (response.body === null) throw new Error("metrics_stream_missing_body");
    for await (const block of sseBlocks(response.body)) {
      const event = block.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
      if (event === "error") throw new Error("metrics_unavailable");
      if (event !== "snapshot") continue;
      const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      const value: unknown = JSON.parse(data);
      if (!isMetricsSnapshot(value)) throw new Error("invalid_metrics_response");
      yield value;
    }
  },

  createGoal(command: BrowserCreateGoalCommand): Promise<AcceptedCommand> {
    return postJson("/api/goals", command, isAcceptedCommand);
  },

  listModels(target?: { goalId: string; runId: string }, signal?: AbortSignal): Promise<BrowserModelCatalog> {
    const path = target === undefined ? "/api/models"
      : `/api/goals/${encodeURIComponent(target.goalId)}/models?runId=${encodeURIComponent(target.runId)}`;
    return requestJson(path, isModelCatalog, signal);
  },

  selectModel(goalId: string, command: BrowserModelSelectionCommand): Promise<{ readonly ok: true; readonly modelId: string; readonly defaultModelSaved: boolean }> {
    return postJson(`/api/goals/${encodeURIComponent(goalId)}/model-selection`, command, isModelSelectionAccepted);
  },

  setModelPreference(modelId: string): Promise<{ readonly ok: true; readonly modelId: string }> {
    return postJson("/api/project/model-preference", { modelId }, isModelPreferenceAccepted);
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

  steer(goalId: string, command: BrowserGoalSteerCommand) {
    return postJson(`/api/goals/${encodeURIComponent(goalId)}/steer`, command, isBrowserGoalSteerResult);
  },

  interrupt(goalId: string, command: BrowserGoalInterruptCommand) {
    return postJson(`/api/goals/${encodeURIComponent(goalId)}/interrupt`, command, isBrowserGoalInterruptResult);
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

  resumeGoal(
    goalId: string,
    command: BrowserResumeGoalCommand,
  ): Promise<AcceptedCommand> {
    return postJson(
      `/api/goals/${encodeURIComponent(goalId)}/resume`,
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

  getPermissionMode(): Promise<BrowserPermissionModeResult> {
    return requestJson("/api/project/permission-mode", isPermissionModeResult);
  },

  readWorkspace(signal?: AbortSignal): Promise<BrowserWorkspaceContext> {
    return requestJson("/api/project/workspace", isWorkspaceContext, signal);
  },

  setPermissionMode(command: BrowserPermissionModeCommand): Promise<BrowserPermissionModeResult> {
    return postJson("/api/project/permission-mode", command, isPermissionModeResult);
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

async function* sseBlocks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        yield buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
      if (chunk.done) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
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

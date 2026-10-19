import {
  isAcceptedCommand,
  isBrowserCreateSessionResult,
  isBrowserSessionInputResult,
  isBrowserSessionInputQueryResult,
  isBrowserSessionState,
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
  isProviderModels,
  type BrowserProviderModelQuery,
  type BrowserProviderModels,
  isProviderProfile,
  isProviderSettings,
  isProviderProfileWriteResult,
  isProviderProfileDeleteResult,
  isProviderProfileActivationResult,
  isProviderProfileTestResult,
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
  type BrowserCreateSessionCommand,
  type BrowserCreateSessionResult,
  type BrowserGoalListItem,
  type BrowserGoalLiveEvent,
  type BrowserGoalPlanModeCommand,
  type BrowserGoalSession,
  type BrowserSessionInputCommand,
  type BrowserSessionInputQueryResult,
  type BrowserSessionInputResult,
  type BrowserSessionState,
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
  type BrowserProviderProfileInput,
  type BrowserProviderProfileWriteResult,
  type BrowserProviderProfileDeleteResult,
  type BrowserProviderProfileActivationResult,
  type BrowserProviderProfileTestResult,
  type BrowserProviderSettings,
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
    return this.readGoalSession(goalId, signal).then((body) => body.goal);
  },

  /** 读取会话视图与 Runtime 安全会话投影（队列、暂停、提交修订、是否需要恢复）。 */
  async readGoalSession(goalId: string, signal?: AbortSignal): Promise<{ goal: BrowserGoalSession; session?: BrowserSessionState }> {
    const body = await requestJson(`/api/goals/${encodeURIComponent(goalId)}`, isGoalSessionEnvelope, signal);
    return {
      goal: body.goal,
      ...(body.session === undefined ? {} : { session: body.session }),
    };
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

  createGoal(command: BrowserCreateSessionCommand): Promise<BrowserCreateSessionResult> {
    return postJson("/api/goals", command, isBrowserCreateSessionResult);
  },

  /** 受理一条统一会话输入；新受理与既有收据都以收据核验。 */
  submitInput(goalId: string, input: BrowserSessionInputCommand): Promise<BrowserSessionInputResult> {
    return postJson(`/api/goals/${encodeURIComponent(goalId)}/inputs`, input, isBrowserSessionInputResult);
  },

  /** 按身份查询持久化收据；未找到与读取失败明确区分。 */
  readInputReceipt(goalId: string, inputId: string, signal?: AbortSignal): Promise<BrowserSessionInputQueryResult> {
    return requestJson(
      `/api/goals/${encodeURIComponent(goalId)}/inputs/${encodeURIComponent(inputId)}`,
      isBrowserSessionInputQueryResult,
      signal,
    );
  },

  listModels(target?: { goalId?: string; runId?: string; providerProfileId?: string }, signal?: AbortSignal): Promise<BrowserModelCatalog> {
    const params = new URLSearchParams();
    if (target?.runId !== undefined) params.set("runId", target.runId);
    if (target?.providerProfileId !== undefined) params.set("providerProfileId", target.providerProfileId);
    const query = params.size === 0 ? "" : `?${params.toString()}`;
    const path = target?.goalId === undefined
      ? `/api/models${query}`
      : `/api/goals/${encodeURIComponent(target.goalId)}/models${query}`;
    return requestJson(path, isModelCatalog, signal);
  },

  selectModel(goalId: string, command: BrowserModelSelectionCommand): Promise<{ readonly ok: true; readonly modelId: string; readonly defaultModelSaved: boolean }> {
    return postJson(`/api/goals/${encodeURIComponent(goalId)}/model-selection`, command, isModelSelectionAccepted);
  },

  setModelPreference(modelId: string, providerProfileId?: string): Promise<{ readonly ok: true; readonly modelId: string }> {
    return postJson("/api/project/model-preference", {
      modelId,
      ...(providerProfileId === undefined ? {} : { providerProfileId }),
    }, isModelPreferenceAccepted);
  },

  listProviders(signal?: AbortSignal): Promise<BrowserProviderSettings> {
    return requestJson("/api/providers", isProviderSettings, signal);
  },

  createProvider(input: BrowserProviderProfileInput): Promise<BrowserProviderProfileWriteResult> {
    return postJson("/api/providers", input, isProviderProfileWriteResult);
  },

  updateProvider(profileId: string, input: BrowserProviderProfileInput, signal?: AbortSignal): Promise<BrowserProviderProfileWriteResult> {
    return requestJson(`/api/providers/${encodeURIComponent(profileId)}`, isProviderProfileWriteResult, signal, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  deleteProvider(profileId: string, signal?: AbortSignal): Promise<BrowserProviderProfileDeleteResult> {
    return requestJson(`/api/providers/${encodeURIComponent(profileId)}`, isProviderProfileDeleteResult, signal, { method: "DELETE" });
  },

  activateProvider(profileId: string, signal?: AbortSignal): Promise<BrowserProviderProfileActivationResult> {
    return requestJson(`/api/providers/${encodeURIComponent(profileId)}/activate`, isProviderProfileActivationResult, signal, { method: "POST" });
  },

  fetchProviderModels(input: BrowserProviderModelQuery, signal?: AbortSignal): Promise<BrowserProviderModels> {
    return requestJson("/api/providers/models", isProviderModels, signal, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    });
  },

  testProvider(profileId: string, signal?: AbortSignal): Promise<BrowserProviderProfileTestResult> {
    return requestJson(`/api/providers/${encodeURIComponent(profileId)}/test`, isProviderProfileTestResult, signal, { method: "POST" });
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

  getPermissionMode(): Promise<BrowserPermissionModeResult> {
    return requestJson("/api/project/permission-mode", isPermissionModeResult);
  },

  readWorkspace(signal?: AbortSignal): Promise<BrowserWorkspaceContext> {
    return requestJson("/api/project/workspace", isWorkspaceContext, signal);
  },

  setPermissionMode(command: BrowserPermissionModeCommand): Promise<BrowserPermissionModeResult> {
    return postJson("/api/project/permission-mode", command, isPermissionModeResult);
  },

  /** 订阅覆盖整个 Goal 的安全事件流；Run 切换不关闭订阅。 */
  async *events(
    goalId: string,
    signal: AbortSignal,
  ): AsyncGenerator<BrowserGoalLiveEvent> {
    const response = await fetch(
      `/api/goals/${encodeURIComponent(goalId)}/events`,
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

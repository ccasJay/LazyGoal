import {
  acceptedCommandBinding,
  browserActionReviewResultBinding,
  browserActivityPageBinding,
  browserCreateSessionResultBinding,
  browserGoalListBinding,
  browserGoalLiveEventBinding,
  browserGoalSessionEnvelopeBinding,
  browserGoalSessionStateEnvelopeBinding,
  browserInteractionDetailResultBinding,
  browserModelCatalogBinding,
  browserModelInputDetailBinding,
  browserModelInputsBinding,
  browserModelPreferenceResultBinding,
  browserModelSelectionResultBinding,
  browserPermissionModeResultBinding,
  browserProviderModelsBinding,
  browserProviderProfileActivationResultBinding,
  browserProviderProfileDeleteResultBinding,
  browserProviderProfileTestResultBinding,
  browserProviderProfileWriteResultBinding,
  browserProviderSettingsBinding,
  browserSessionInputQueryResultBinding,
  browserSessionInputResultBinding,
  browserToolGrantResultBinding,
  browserTrajectoryDetailBinding,
  browserTrajectoryPageBinding,
  browserTrajectoryRunsBinding,
  browserWorkspaceContextBinding,
  isOkResponse,
  isNullableSafeInteger,
  isRecord,
  sessionMetricsSnapshotBinding,
  type AcceptedCommand,
  type BrowserActionReviewCommand,
  type BrowserActionReviewResult,
  type BrowserActivityPage,
  type BrowserActivityQuery,
  type BrowserCreateSessionCommand,
  type BrowserCreateSessionResult,
  type BrowserGoalList,
  type BrowserGoalListItem,
  type BrowserGoalLiveEvent,
  type BrowserGoalPlanModeCommand,
  type BrowserGoalSession,
  type BrowserGoalSessionState,
  type BrowserInteractionDetailResult,
  type BrowserModelCatalog,
  type BrowserModelInputDetail,
  type BrowserModelInputs,
  type BrowserModelSelectionCommand,
  type BrowserPermissionModeCommand,
  type BrowserPermissionModeResult,
  type BrowserProviderModelQuery,
  type BrowserProviderModels,
  type BrowserProviderProfileActivationResult,
  type BrowserProviderProfileDeleteResult,
  type BrowserProviderProfileInput,
  type BrowserProviderProfileTestResult,
  type BrowserProviderProfileWriteResult,
  type BrowserProviderSettings,
  type BrowserSessionInputCommand,
  type BrowserSessionInputQueryResult,
  type BrowserSessionInputResult,
  type BrowserSessionState,
  type BrowserToolGrantResult,
  type BrowserToolGrantRevokeCommand,
  type BrowserTrajectoryDetail,
  type BrowserTrajectoryEntry,
  type BrowserTrajectoryPage,
  type BrowserTrajectoryRuns,
  type BrowserWorkspaceContext,
  type ContractBinding,
  type ContractDiagnostic,
  type SessionMetricsSnapshot,
} from "../../../packages/web-contracts/src/index";
import { readSseMessages } from "./sse";

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

  listGoals(signal?: AbortSignal): Promise<BrowserGoalList> {
    return requestContract("/api/goals", browserGoalListBinding, signal);
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
    const body = await requestContract(`/api/goals/${encodeURIComponent(goalId)}`, browserGoalSessionEnvelopeBinding, signal);
    return {
      goal: body.goal,
      ...(body.session === undefined ? {} : { session: body.session }),
    };
  },

  /**
   * 读取不含历史正文、步骤或阶段的窄 Goal 状态及安全 Runtime 会话元数据。
   *
   * @param goalId - 要读取的稳定 Goal 标识。
   * @param signal - 可选取消信号；取消只中止本次浏览器读取。
   * @returns 窄 Goal 状态及可选的 Runtime 会话元数据，不包含完整历史。
   * @throws HTTP 请求失败或响应不符合当前 wire 契约时抛出 `BrowserApiError` 或协议错误。
   * @example
   * ```ts
   * const { goal } = await browserApi.readGoalSessionState(goalId, signal);
   * ```
   */
  async readGoalSessionState(goalId: string, signal?: AbortSignal): Promise<{ goal: BrowserGoalSessionState; session?: BrowserSessionState }> {
    const body = await requestContract(`/api/goals/${encodeURIComponent(goalId)}?view=state`, browserGoalSessionStateEnvelopeBinding, signal);
    return {
      goal: body.goal,
      ...(body.session === undefined ? {} : { session: body.session }),
    };
  },

  /**
   * 按服务端固定水位读取有界的正文与安全 Activity 来源。
   *
   * @param goalId - 要读取的稳定 Goal 标识。
   * @param query - 可选 Run 筛选、同一窗口的前／后 cursor 与页大小；服务端默认 50、最大 100。
   * @param signal - 可选取消信号；取消只中止本次浏览器读取。
   * @returns 一页安全 Activity DTO 及固定水位、范围和后续 cursor；不自动读取其它页。
   * @throws HTTP 请求失败、cursor 被服务端拒绝或响应不符合当前 wire 契约时抛出错误。
   * @example
   * ```ts
   * const page = await browserApi.readGoalActivity(goalId, { limit: 50 }, signal);
   * ```
   */
  readGoalActivity(goalId: string, query: BrowserActivityQuery = {}, signal?: AbortSignal): Promise<BrowserActivityPage> {
    const params = new URLSearchParams();
    if (query.runId !== undefined) params.set("runId", query.runId);
    if (query.before !== undefined) params.set("before", query.before);
    if (query.after !== undefined) params.set("after", query.after);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size === 0 ? "" : `?${params.toString()}`;
    return requestContract(`/api/goals/${encodeURIComponent(goalId)}/activity${suffix}`, browserActivityPageBinding, signal);
  },

  modelInputs(goalId: string, runId: string, offset = 0, signal?: AbortSignal, query = ""): Promise<BrowserModelInputs> {
    return requestContract(`/api/goals/${encodeURIComponent(goalId)}/model-inputs?runId=${encodeURIComponent(runId)}&offset=${offset}&q=${encodeURIComponent(query)}`, browserModelInputsBinding, signal, {}, undefined, data => isNullableSafeInteger(data.nextOffset));
  },
  modelInput(goalId: string, runId: string, callId: string, signal?: AbortSignal): Promise<BrowserModelInputDetail> {
    return requestContract(`/api/goals/${encodeURIComponent(goalId)}/model-inputs?runId=${encodeURIComponent(runId)}&callId=${encodeURIComponent(callId)}`, browserModelInputDetailBinding, signal);
  },
  trajectoryRuns(goalId: string, offset = 0, signal?: AbortSignal): Promise<BrowserTrajectoryRuns> {
    return requestContract(`/api/goals/${encodeURIComponent(goalId)}/trajectory/runs?offset=${offset}`, browserTrajectoryRunsBinding, signal, {}, undefined, data => isNullableSafeInteger(data.nextOffset));
  },

  trajectory(goalId: string, query: URLSearchParams, signal?: AbortSignal): Promise<BrowserTrajectoryPage> {
    return requestContract(`/api/goals/${encodeURIComponent(goalId)}/trajectory?${query}`, browserTrajectoryPageBinding, signal, {}, undefined,
      data => isNullableSafeInteger(data.previousCursor)
        && isNullableSafeInteger(data.nextCursor)
        && isNullableSafeInteger(data.locatedSequence));
  },

  trajectoryDetail(goalId: string, runId: string, sequence: number, signal?: AbortSignal): Promise<BrowserTrajectoryDetail> {
    return requestContract(`/api/goals/${encodeURIComponent(goalId)}/trajectory/events/${sequence}?runId=${encodeURIComponent(runId)}`, browserTrajectoryDetailBinding, signal);
  },

  readMetrics(goalId: string, signal?: AbortSignal): Promise<SessionMetricsSnapshot> {
    return requestContract(`/goals/${encodeURIComponent(goalId)}/metrics`, sessionMetricsSnapshotBinding, signal);
  },

  async *metrics(goalId: string, signal: AbortSignal): AsyncGenerator<SessionMetricsSnapshot> {
    const response = await fetch(`/goals/${encodeURIComponent(goalId)}/metrics/stream`, {
      headers: authorizedHeaders({ accept: "text/event-stream" }), signal,
    });
    if (!response.ok) throw await responseError(response);
    if (response.body === null) throw new Error("metrics_stream_missing_body");
    for await (const message of readSseMessages(response.body, signal)) {
      if (message.event === "error") throw new Error("metrics_unavailable");
      if (message.event !== "snapshot") continue;
      const value = parseSseJson(message.data, "invalid_metrics_response");
      const result = sessionMetricsSnapshotBinding.read(value, "strip");
      if (!result.ok) throw new Error("invalid_metrics_response");
      reportWireDiagnostic(result.diagnostic);
      yield result.data;
    }
  },

  createGoal(command: BrowserCreateSessionCommand): Promise<BrowserCreateSessionResult> {
    return postContract("/api/goals", command, browserCreateSessionResultBinding);
  },

  /** 受理一条统一会话输入；新受理与既有收据都以收据核验。 */
  submitInput(goalId: string, input: BrowserSessionInputCommand): Promise<BrowserSessionInputResult> {
    return postContract(`/api/goals/${encodeURIComponent(goalId)}/inputs`, input, browserSessionInputResultBinding);
  },

  /** 按身份查询持久化收据；未找到与读取失败明确区分。 */
  readInputReceipt(goalId: string, inputId: string, signal?: AbortSignal): Promise<BrowserSessionInputQueryResult> {
    return requestContract(
      `/api/goals/${encodeURIComponent(goalId)}/inputs/${encodeURIComponent(inputId)}`,
      browserSessionInputQueryResultBinding,
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
    return requestContract(path, browserModelCatalogBinding, signal);
  },

  async selectModel(goalId: string, command: BrowserModelSelectionCommand): Promise<{ readonly ok: true; readonly modelId: string; readonly defaultModelSaved: boolean }> {
    const result = await postContract(`/api/goals/${encodeURIComponent(goalId)}/model-selection`, command, browserModelSelectionResultBinding);
    if (!result.ok) throw new Error("invalid_api_response");
    return result;
  },

  async setModelPreference(modelId: string, providerProfileId?: string): Promise<{ readonly ok: true; readonly modelId: string }> {
    const result = await postContract("/api/project/model-preference", {
      modelId,
      ...(providerProfileId === undefined ? {} : { providerProfileId }),
    }, browserModelPreferenceResultBinding);
    if (!result.ok) throw new Error("invalid_api_response");
    return result;
  },

  listProviders(signal?: AbortSignal): Promise<BrowserProviderSettings> {
    return requestContract("/api/providers", browserProviderSettingsBinding, signal, {}, hasNoPlaintextProviderCredential);
  },

  createProvider(input: BrowserProviderProfileInput): Promise<BrowserProviderProfileWriteResult> {
    return postContract("/api/providers", input, browserProviderProfileWriteResultBinding, hasNoPlaintextProviderCredentialInResult);
  },

  updateProvider(profileId: string, input: BrowserProviderProfileInput, signal?: AbortSignal): Promise<BrowserProviderProfileWriteResult> {
    return requestContract(`/api/providers/${encodeURIComponent(profileId)}`, browserProviderProfileWriteResultBinding, signal, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }, hasNoPlaintextProviderCredentialInResult);
  },

  deleteProvider(profileId: string, signal?: AbortSignal): Promise<BrowserProviderProfileDeleteResult> {
    return requestContract(`/api/providers/${encodeURIComponent(profileId)}`, browserProviderProfileDeleteResultBinding, signal, { method: "DELETE" }, hasNoPlaintextProviderCredentialInResult);
  },

  activateProvider(profileId: string, signal?: AbortSignal): Promise<BrowserProviderProfileActivationResult> {
    return requestContract(`/api/providers/${encodeURIComponent(profileId)}/activate`, browserProviderProfileActivationResultBinding, signal, { method: "POST" });
  },

  fetchProviderModels(input: BrowserProviderModelQuery, signal?: AbortSignal): Promise<BrowserProviderModels> {
    return requestProviderModels(input, signal);
  },

  testProvider(profileId: string, signal?: AbortSignal): Promise<BrowserProviderProfileTestResult> {
    return requestContract(`/api/providers/${encodeURIComponent(profileId)}/test`, browserProviderProfileTestResultBinding, signal, { method: "POST" });
  },

  enterPlanMode(
    goalId: string,
    command: BrowserGoalPlanModeCommand,
  ): Promise<AcceptedCommand> {
    return postContract(
      `/api/goals/${encodeURIComponent(goalId)}/plan-mode`,
      command,
      acceptedCommandBinding,
    );
  },

  /**
   * 按稳定交互引用读取完整审阅内容；读取失败与过期引用不改变等待。
   *
   * @remarks 稳定拒绝（旧 Goal／Run／引用、详情不可用）作为读取结果返回，使界面能区分
   * 「请求已变化」与网络失败；只有违反 wire 契约的响应才抛错。
   */
  async readInteractionDetail(goalId: string, runId: string, interactionId: string): Promise<BrowserInteractionDetailResult> {
    const response = await fetch(
      `/api/goals/${encodeURIComponent(goalId)}/interaction-details?runId=${encodeURIComponent(runId)}&interactionId=${encodeURIComponent(interactionId)}`,
      { headers: authorizedHeaders() },
    );
    if (!response.ok) {
      const error = await responseError(response);
      switch (error.code) {
        case "goal_not_found":
        case "stale_run":
        case "interaction_not_waiting":
        case "interaction_mismatch":
          return { ok: false, error: error.code };
        default:
          return { ok: false, error: "interaction_details_unavailable" };
      }
    }
    const value: unknown = await response.json();
    const result = browserInteractionDetailResultBinding.read(value, "strip");
    if (!result.ok) throw new Error("invalid_api_response");
    reportWireDiagnostic(result.diagnostic);
    return result.data;
  },

  /**
   * 只读预检同一工具的最终参数与实际权限范围。
   *
   * @remarks 预检不保存批准、不解除等待；失败作为稳定拒绝返回，界面据此保留草稿。
   */
  async reviewActionApproval(
    goalId: string,
    command: BrowserActionReviewCommand,
  ): Promise<BrowserActionReviewResult> {
    const response = await fetch(
      `/api/goals/${encodeURIComponent(goalId)}/action-reviews`,
      {
        method: "POST",
        headers: authorizedHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(command),
      },
    );
    if (!response.ok) {
      const error = await responseError(response);
      switch (error.code) {
        case "goal_not_found":
        case "stale_run":
        case "action_not_waiting":
        case "action_id_mismatch":
        case "tool_not_found":
        case "invalid_tool_input":
        case "scope_unavailable":
        case "sandbox_scope_unavailable":
          return { ok: false, error: error.code };
        default:
          return { ok: false, error: "review_unavailable" };
      }
    }
    const value: unknown = await response.json();
    const result = browserActionReviewResultBinding.read(value, "strip");
    if (!result.ok) throw new Error("invalid_api_response");
    reportWireDiagnostic(result.diagnostic);
    return result.data;
  },

  listToolGrants(goalId: string, runId: string): Promise<BrowserToolGrantResult> {
    return requestContract(
      `/api/goals/${encodeURIComponent(goalId)}/grants?runId=${encodeURIComponent(runId)}`,
      browserToolGrantResultBinding,
    );
  },

  revokeToolGrant(goalId: string, command: BrowserToolGrantRevokeCommand): Promise<BrowserToolGrantResult> {
    return requestContract(
      `/api/goals/${encodeURIComponent(goalId)}/grants/${encodeURIComponent(command.grantId)}`,
      browserToolGrantResultBinding,
      undefined,
      {
        method: "DELETE",
        headers: authorizedHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ runId: command.runId, scope: command.scope }),
      },
    );
  },

  getPermissionMode(): Promise<BrowserPermissionModeResult> {
    return requestContract("/api/project/permission-mode", browserPermissionModeResultBinding);
  },

  readWorkspace(signal?: AbortSignal): Promise<BrowserWorkspaceContext> {
    return requestContract("/api/project/workspace", browserWorkspaceContextBinding, signal);
  },

  setPermissionMode(command: BrowserPermissionModeCommand): Promise<BrowserPermissionModeResult> {
    return postContract("/api/project/permission-mode", command, browserPermissionModeResultBinding);
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

    for await (const message of readSseMessages(response.body, signal)) {
      if (message.event !== undefined && message.event !== "update") continue;
      const value = parseSseJson(message.data, "invalid_event_response");
      const result = browserGoalLiveEventBinding.read(value, "strip");
      if (!result.ok) throw new Error("invalid_event_response");
      reportWireDiagnostic(result.diagnostic);
      yield result.data;
    }
  },
};

async function requestProviderModels(
  input: BrowserProviderModelQuery,
  signal?: AbortSignal,
): Promise<BrowserProviderModels> {
  return requestContract(
    "/api/providers/models",
    browserProviderModelsBinding,
    signal,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

function parseSseJson(data: string, errorCode: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    throw new Error(errorCode);
  }
}

async function postJson<T>(path: string, body: unknown, guard: (value: unknown) => value is T): Promise<T> {
  return requestJson(path, guard, undefined, {
    method: "POST",
    headers: authorizedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
}

async function postContract<T>(path: string, body: unknown, binding: ContractBinding<T>, precheck?: (value: unknown) => boolean): Promise<T> {
  return requestContract(path, binding, undefined, {
    method: "POST",
    headers: authorizedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  }, precheck);
}

async function requestContract<T>(
  path: string,
  binding: ContractBinding<T>,
  signal?: AbortSignal,
  init: RequestInit = {},
  precheck?: (value: unknown) => boolean,
  postRead?: (data: T) => boolean,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: authorizedHeaders(init.headers),
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok) throw await responseError(response);
  const value: unknown = await response.json();
  if (precheck !== undefined && !precheck(value)) throw new Error("invalid_api_response");
  const result = binding.read(value, "strip");
  if (!result.ok) throw new Error("invalid_api_response");
  if (postRead !== undefined && !postRead(result.data)) throw new Error("invalid_api_response");
  reportWireDiagnostic(result.diagnostic);
  return result.data;
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

function reportWireDiagnostic(diagnostic: ContractDiagnostic | undefined): void {
  if (diagnostic === undefined) return;
  try {
    console.debug("[goal-board] response has unknown fields", diagnostic);
  } catch {
    // 诊断输出失败不改变合法 API 响应的读取结果。
  }
}

function hasNoPlaintextProviderCredential(value: unknown): boolean {
  return isRecord(value)
    && Array.isArray(value.profiles)
    && value.profiles.every(profile => isRecord(profile) && !("apiKey" in profile));
}

function hasNoPlaintextProviderCredentialInResult(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.profile)) return true;
  return !("apiKey" in value.profile);
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

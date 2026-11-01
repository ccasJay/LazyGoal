import type { BrowserProviderModelQuery, BrowserProviderModels } from "../../web-contracts/src/index";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import type { BrowserGoalList, BrowserGoalSession } from "../../web-contracts/src/index";
import type {
    BrowserActivityQuery,
    BrowserActivityReadResult,
} from "../../web-contracts/src/index";
import type { BrowserGoalSessionState } from "../../web-contracts/src/index";
import type { BrowserModelCatalogReadResult } from "./browser-model-catalog";
import type {
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserActionDetailsResult,
    BrowserInteractionDetailResult,
    BrowserToolGrantResult,
    BrowserToolGrantRevokeCommand,
    BrowserPermissionModeCommand,
    BrowserPermissionModeResult,
} from "./browser-goal-command-service";
import type {
    BrowserGoalSessionPort,
} from "./browser-session-port";
import type {
    BrowserActionReviewCommand,
    BrowserActionReviewResult,
    BrowserControlIntentCommand,
    BrowserControlIntentResult,
    BrowserControlReceipt,
    BrowserCreateSessionCommand,
    BrowserSessionInputCommand,
    BrowserSessionInputErrorCode,
    BrowserSessionInteractionResponse,
} from "../../web-contracts/src/index";
import {
    browserActionReviewCommandBinding,
    browserControlIntentCommandBinding,
    browserCreateSessionCommandBinding,
    browserGoalArchiveCommandBinding,
    browserGoalPlanModeCommandBinding,
    browserModelPreferenceCommandBinding,
    browserModelSelectionCommandBinding,
    browserPermissionModeCommandBinding,
    browserProviderModelQueryBinding,
    browserProviderProfileInputBinding,
    browserSessionInputCommandBinding,
    browserToolGrantRevokeBodyBinding,
    isJsonValue,
    isRecord,
} from "../../web-contracts/src/index";
import { hasUtf16LengthAtMost } from "../../web-contracts/src/invariants/index";
import type {
    BrowserProviderProfileInput,
    BrowserProviderProfileTestError,
    BrowserProviderSettingsError,
} from "../../web-contracts/src/index";
import type {
    BrowserProviderProfileActivationResult,
    BrowserProviderProfileDeleteResult,
    BrowserProviderProfileTestResult,
    BrowserProviderProfileWriteResult,
    BrowserProviderSettingsReadResult,
} from "../../web-contracts/src/index";

const MAX_COMMAND_BODY_BYTES = 16 * 1024;
const MAX_SESSION_INPUT_BODY_BYTES = 512 * 1024;
const MAX_GOAL_ID_LENGTH = 128;
const MAX_COMMAND_TEXT_LENGTH = 4_000;
const MAX_PROVIDER_LABEL_LENGTH = 200;
const MAX_PROVIDER_KIND_LENGTH = 64;
const MAX_PROVIDER_API_KEY_LENGTH = 4_096;
const MAX_PROVIDER_BASE_URL_LENGTH = 2_048;

/**
 * 受管 Provider 档案管理端口。
 *
 * @remarks
 * 实现方负责凭据持久化、掩码投影与连接测试；路由只做 wire 校验与错误分类。
 * 任何响应都不得包含明文凭据。
 *
 * @example
 * ```ts
 * const port: BrowserProviderSettingsPort = {
 *     read: async () => ({ ok: true, settings: { profiles: [] } }),
 *     create: async () => ({ ok: false, error: "provider_profile_unavailable" }),
 *     update: async () => ({ ok: false, error: "provider_profile_not_found" }),
 *     remove: async () => ({ ok: false, error: "provider_profile_not_found" }),
 *     activate: async () => ({ ok: false, error: "provider_profile_not_found" }),
 *     fetchModels: async () => ({ ok: false, error: "model_catalog_unavailable" }),
 *     test: async () => ({ ok: false, error: "provider_profile_not_found" }),
 * };
 * ```
 */
export interface BrowserProviderSettingsPort {
    /** @returns 掩码后的档案列表、激活标识与只读回退来源。 */
    read(): Promise<BrowserProviderSettingsReadResult>;
    /**
     * 拉取未保存连接的在线模型；不写入档案、偏好或凭据，不返回敏感响应。
     * @param input - 经 wire 校验的表单连接参数。
     * @param signal - 请求取消信号。
     * @returns 在线列表或稳定失败分类。
     */
    fetchModels(input: BrowserProviderModelQuery, signal: AbortSignal): Promise<BrowserProviderModels | { readonly ok: false; readonly error: BrowserProviderProfileTestError | "provider_profile_invalid" }>;
    /** @param input - 已通过 wire 校验的档案输入。 */
    create(input: BrowserProviderProfileInput): Promise<BrowserProviderProfileWriteResult>;
    /** @param profileId - 目标档案；`input` 省略 `apiKey` 时保留原凭据。 */
    update(profileId: string, input: BrowserProviderProfileInput): Promise<BrowserProviderProfileWriteResult>;
    /** @returns 被删档案与"可能被 Goal 引用"提示；激活档案必须拒绝删除。 */
    remove(profileId: string): Promise<BrowserProviderProfileDeleteResult>;
    /** @returns 新的激活标识。 */
    activate(profileId: string): Promise<BrowserProviderProfileActivationResult>;
    /** @returns 在线模型数量；只做列表拉取，不发起生成请求。 */
    test(profileId: string): Promise<BrowserProviderProfileTestResult>;
}

/**
 * 浏览器 Goal API 使用的白名单数据边界。
 *
 * @remarks
 * 实现方负责从正式工作区 Catalog、Snapshot 与提交边界内 Trajectory 生成 DTO，
 * 并把已验证的创建命令交给既有 Runtime Launcher。路由不接收或序列化完整 Runtime
 * 对象；底层损坏或读取失败统一转换为稳定错误码。
 *
 * @example
 * ```ts
 * const source: BrowserGoalApiPort = {
 *     list: async () => ({ goals: [], unreadableCount: 0 }),
 *     read: async () => undefined,
 *     enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
 *     models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
 *     setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
 *     selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
 * };
 * ```
 */
export interface BrowserGoalApiPort {
    /**
     * 返回真实 Goal 列表。
     *
     * @returns 正式工作区的白名单摘要与无法读取的历史 Goal 数量，保持 Catalog 排序。
     * @throws Catalog 目录读取失败时拒绝。
     */
    list(): Promise<BrowserGoalList>;
    /**
     * 受管 Provider 档案管理；省略时不挂载设置路由。
     *
     * @remarks 挂载后由调用方保证路由位于本机会话访问控制之后。
     */
    readonly providerSettings?: BrowserProviderSettingsPort;
    /**
     * 设置终态 Goal 的归档状态；不改变 Snapshot 或 Run 历史。
     * @param goalId - 正式工作区 Goal 身份。
     * @param archived - true 移入归档视图，false 恢复默认看板。
     * @returns 成功，或缺失、非终态、服务关闭期间的稳定拒绝码。
     */
    setArchived?(goalId: string, archived: boolean): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: "goal_not_found" | "goal_not_terminal" | "goal_has_pending_inputs" | "service_shutting_down" }>;
    /**
     * 删除终态 Goal 的本地记录；清理失败时保留快照供重试。
     * @param goalId - 正式工作区 Goal 身份。
     * @returns 成功，或缺失、非终态、服务关闭期间的稳定拒绝码。
     */
    deleteGoal?(goalId: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: "goal_not_found" | "goal_not_terminal" | "goal_has_pending_inputs" | "service_shutting_down" }>;
    /**
     * 读取一个 Goal 的最新已提交会话。
     *
     * @param goalId - Goal 的稳定标识。
     * @returns 安全投影；Goal 不存在时返回 `undefined`。
     * @throws Snapshot 或 Trajectory 损坏、底层读取失败时拒绝。
     */
    read(goalId: string): Promise<BrowserGoalSession | undefined>;
    /**
     * 读取不含历史消息、步骤或阶段明细的当前状态；实现必须仅从 Snapshot 投影。
     *
     * @param goalId - Goal 的稳定标识。
     * @returns 窄状态；Goal 不存在时返回 `undefined`。
     * @throws Snapshot 损坏或底层读取失败时拒绝。
     */
    readState?(goalId: string): Promise<BrowserGoalSessionState | undefined>;
    /**
     * 读取固定消息与已提交轨迹上界内的有界 Activity 页。
     *
     * @param goalId - Goal 的稳定标识。
     * @param query - 已验证的 Run 过滤、方向 cursor 与页大小。
     * @returns 安全 Activity 页，或稳定的 Goal、Run、cursor 错误。
     * @throws Snapshot 或 Trajectory 读取失败时拒绝。
     */
    readActivity?(goalId: string, query: BrowserActivityQuery): Promise<BrowserActivityReadResult>;
    /**
     * Runtime 会话委派端口；创建、统一输入、收据查询、状态与 Goal 事件均走该入口。
     *
     * @remarks 省略时相关路由返回 503 `session_unavailable`，不提供替代执行路径。
     */
    readonly session?: BrowserGoalSessionPort;
    /**
     * 将带当前 Run 身份的 Plan Mode 选择交给 Runtime Coordinator。
     *
     * @param goalId - URL 路径中的 Goal 身份。
     * @param command - 当前 Run 身份。
     * @returns 模式提交后的受理结果或稳定拒绝码。
     * @throws Snapshot 读取或 Coordinator 持久化失败时拒绝。
     */
    enterPlanMode(goalId: string, command: BrowserGoalPlanModeCommand): Promise<BrowserGoalPlanModeResult>;
    /**
     * 读取草稿默认模型或指定 Goal 当前 Run 的模型目录。
     *
     * @param target - 省略时读取草稿目录；指定时必须匹配最新 Goal/Run。
     * @param signal - 浏览器断开时取消在线目录请求。
     * @returns 白名单目录或稳定失败分类，不返回凭据或 Provider 原始响应。
     */
    models(target?: { readonly goalId: string; readonly runId: string }, signal?: AbortSignal, providerProfileId?: string): Promise<BrowserModelCatalogReadResult>;
    /**
     * 验证并保存当前工作区新 Goal 的默认模型身份。
     *
     * @param modelId - 当前 Provider 中须可选择的模型 ID。
     * @returns 持久化成功或稳定失败；关闭期间拒绝写入，文件写入失败不得报告成功。
     */
    setModelPreference(modelId: string, providerProfileId?: string): Promise<
        { readonly ok: true; readonly modelId: string }
        | { readonly ok: false; readonly error: "model_not_selectable" | "model_catalog_unavailable" | "model_preference_unavailable" | "service_shutting_down" }
    >;
    /** 保存由服务端重新验证的当前 Run 模型选择。 */
    selectModel(goalId: string, command: BrowserModelSelectionCommand): Promise<BrowserModelSelectionResult>;
    /** 精确读取当前等待 Action 的完整输入；普通会话投影不携带此数据。 */
    readActionDetails?(goalId: string, runId: string, actionId: string): Promise<BrowserActionDetailsResult>;
    /**
     * 按稳定交互引用读取当前等待的完整审阅内容。
     *
     * @remarks 引用必须同时匹配当前 Run 与当前等待；读取不推进状态，也不返回
     * 其他 Action 的参数。省略时详情路由返回 500 `interaction_details_unavailable`。
     */
    readInteractionDetails?(goalId: string, runId: string, interactionId: string): Promise<BrowserInteractionDetailResult>;
    /**
     * 只读预检同一工具的最终参数与实际权限范围。
     *
     * @remarks 预检不保存批准、不暂存或激活授权、不解除等待，也不调用业务工具。
     * 省略时审批审阅路由返回 500 `review_unavailable`。
     */
    reviewActionApproval?(goalId: string, command: BrowserActionReviewCommand): Promise<BrowserActionReviewResult>;
    /** 列出当前 Goal 与 workspace 的授权摘要。 */
    listToolGrants?(goalId: string, runId: string): Promise<BrowserToolGrantResult>;
    /** 撤销当前 Goal 或 workspace 的指定授权。 */
    revokeToolGrant?(goalId: string, command: BrowserToolGrantRevokeCommand): Promise<BrowserToolGrantResult>;
    /**
     * 查询当前工作区的项目权限执行模式。
     *
     * @returns 包含模式与修订号的权限事实；不可用时返回稳定拒绝码。
     * @throws 底层存储读取失败时拒绝。
     */
    getPermissionMode?(): Promise<
        | { readonly ok: true; readonly mode: "default" | "yolo"; readonly revision: number; readonly workspaceId: string }
        | { readonly ok: false; readonly error: "permissions_unavailable" }
    >;
    /**
     * 切换当前工作区的项目权限执行模式。
     *
     * @param command - 目标模式与期望修订号。
     * @returns 成功切换后的权限事实；冲突、关闭或不可用时返回稳定错误。
     * @throws 底层存储写入失败时拒绝。
     */
    setPermissionMode?(command: BrowserPermissionModeCommand): Promise<BrowserPermissionModeResult>;
}

/**
 * 创建同源 Goal 列表、会话读取、命令和实时事件 API。
 *
 * @param source - 返回经过白名单投影的正式工作区数据并使用 Runtime Launcher 的端口。
 * @returns 提供列表/详情、模型目录、`POST /api/goals`、交互/消息/Plan Mode、
 *   会话事件流路由和 Hono 应用。
 * @remarks
 * 缺失 Goal 返回 404；Catalog、Snapshot 或 Trajectory 损坏统一返回 500 与稳定错误码，
 * 不回传存储错误文本，也不保留浏览器旧状态。外层 BrowserSessionAccess 中间件负责授权。
 * @example
 * ```ts
 * httpService.mount("/", createBrowserGoalRoutes(readPort));
 * ```
 */
export function createBrowserGoalRoutes(source: BrowserGoalApiPort): Hono {
    const routes = new Hono();

    routes.post("/api/control", async (context) => {
        let body: unknown;
        try {
            const read = await readJsonBody(context.req.raw, MAX_SESSION_INPUT_BODY_BYTES);
            if (!read.ok) {
                return context.json({ intentId: "", status: "rejected", error: read.error }, read.status);
            }
            body = read.value;
        } catch {
            return context.json({ intentId: "", status: "rejected", error: "invalid_control_command" }, 400);
        }
        const parsed = browserControlIntentCommandBinding.read(body, "reject");
        const intentId = isRecord(body) && typeof body.intentId === "string" ? body.intentId : "";
        if (!parsed.ok) {
            return context.json({ intentId, status: "rejected", error: "invalid_control_command" }, 400);
        }
        try {
            const outcome = await dispatchControlIntent(source, parsed.data);
            return context.json(outcome.receipt, outcome.status);
        } catch {
            return context.json({ intentId: parsed.data.intentId, status: "unknown" }, 503);
        }
    });

    routes.get("/api/models", async (context) => {
        const query = new URL(context.req.url).searchParams;
        const providerProfileIds = query.getAll("providerProfileId");
        const providerProfileId = providerProfileIds[0];
        if (
            query.size > 1
            || providerProfileIds.length > 1
            || (providerProfileId !== undefined && !isWireId(providerProfileId, MAX_GOAL_ID_LENGTH))
        ) {
            return context.json({ error: "invalid_model_catalog_request" }, 400);
        }
        try {
            const result = await source.models(undefined, context.req.raw.signal, providerProfileId);
            return result.ok
                ? context.json(result.catalog)
                : context.json({ error: result.error }, modelCatalogErrorStatus(result.error));
        } catch {
            return context.json({ error: "model_catalog_unavailable" }, 503);
        }
    });

    routes.get("/api/goals/:goalId/models", async (context) => {
        const goalId = context.req.param("goalId");
        const query = new URL(context.req.url).searchParams;
        const runIds = query.getAll("runId");
        const providerProfileIds = query.getAll("providerProfileId");
        const runId = runIds[0];
        const providerProfileId = providerProfileIds[0];
        if (
            !isWireId(goalId, MAX_GOAL_ID_LENGTH)
            || query.size > 2
            || runIds.length !== 1
            || providerProfileIds.length > 1
            || (providerProfileId !== undefined && !isWireId(providerProfileId, MAX_GOAL_ID_LENGTH))
            || runId === undefined
            || !isWireId(runId, 256)
        ) {
            return context.json({ error: "invalid_model_catalog_request" }, 400);
        }
        try {
            const result = await source.models({ goalId, runId }, context.req.raw.signal, providerProfileId);
            return result.ok
                ? context.json(result.catalog)
                : context.json({ error: result.error, refresh: result.error === "stale_run" }, modelCatalogErrorStatus(result.error));
        } catch {
            return context.json({ error: "model_catalog_unavailable" }, 503);
        }
    });

    routes.post("/api/project/model-preference", async (context) => {
        const body = await readJsonBody(context.req.raw);
        if (!body.ok) return context.json({ error: body.error }, body.status);
        const parsed = browserModelPreferenceCommandBinding.read(body.value, "strip");
        if (!parsed.ok
            || !hasUtf16LengthAtMost(parsed.data.modelId, 256)
            || (parsed.data.providerProfileId !== undefined
                && !isWireId(parsed.data.providerProfileId, MAX_GOAL_ID_LENGTH))) {
            return context.json({ error: "invalid_model_preference" }, 400);
        }
        reportWireDiagnostic(parsed.diagnostic);
        const { modelId, providerProfileId } = parsed.data;
        try {
            const result = await source.setModelPreference(modelId, providerProfileId);
            if (result.ok) return context.json(result);
            return context.json({ error: result.error }, result.error === "model_not_selectable" ? 409 : 503);
        } catch {
            return context.json({ error: "model_preference_unavailable" }, 503);
        }
    });

    routes.post("/api/goals/:goalId/model-selection", async (context) => {
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) return context.json({ error: "invalid_model_selection" }, 400);
        const body = await readJsonBody(context.req.raw);
        if (!body.ok) return context.json({ error: body.error }, body.status);
        const parsed = browserModelSelectionCommandBinding.read(body.value, "strip");
        if (!parsed.ok
            || !isWireId(parsed.data.runId, 256)
            || !hasUtf16LengthAtMost(parsed.data.modelId, 256)
            || (parsed.data.providerProfileId !== undefined
                && !isWireId(parsed.data.providerProfileId, MAX_GOAL_ID_LENGTH))) {
            return context.json({ error: "invalid_model_selection" }, 400);
        }
        reportWireDiagnostic(parsed.diagnostic);
        try {
            const result = await source.selectModel(goalId, parsed.data);
            if (result.ok) return context.json(result);
            const status = result.error === "goal_not_found" ? 404
                : result.error === "model_catalog_unavailable" || result.error === "model_selection_failed" || result.error === "service_shutting_down" ? 503
                : 409;
            return context.json({ error: result.error, refresh: result.error === "stale_run" }, status);
        } catch {
            return context.json({ error: "model_selection_failed" }, 503);
        }
    });

    routes.get("/api/goals", async (context) => {
        try {
            return context.json(await source.list());
        } catch {
            return context.json({ error: "goal_list_unavailable" }, 500);
        }
    });

    routes.post("/api/goals/:goalId/archive", async (context) => {
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) return context.json({ error: "invalid_goal_id" }, 400);
        if (source.setArchived === undefined) return context.json({ error: "goal_management_unavailable" }, 503);
        const body = await readJsonBody(context.req.raw);
        if (!body.ok) return context.json({ error: body.error }, body.status);
        const parsed = browserGoalArchiveCommandBinding.read(body.value, "strip");
        if (!parsed.ok) return context.json({ error: "invalid_archive_request" }, 400);
        reportWireDiagnostic(parsed.diagnostic);
        try {
            const result = await source.setArchived(goalId, parsed.data.archived);
            return result.ok ? context.json({ ok: true })
                : context.json({ error: result.error }, result.error === "goal_not_found" ? 404
                    : result.error === "service_shutting_down" ? 503
                    : 409);
        } catch {
            return context.json({ error: "goal_archive_failed" }, 500);
        }
    });

    routes.delete("/api/goals/:goalId", async (context) => {
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) return context.json({ error: "invalid_goal_id" }, 400);
        if (source.deleteGoal === undefined) return context.json({ error: "goal_management_unavailable" }, 503);
        try {
            const result = await source.deleteGoal(goalId);
            return result.ok ? context.json({ ok: true })
                : context.json({ error: result.error }, result.error === "goal_not_found" ? 404
                    : result.error === "service_shutting_down" ? 503
                    : 409);
        } catch {
            return context.json({ error: "goal_delete_failed" }, 500);
        }
    });

    routes.get("/api/goals/:goalId", async (context) => {
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) return context.json({ error: "invalid_goal_id" }, 400);
        const params = new URL(context.req.url).searchParams;
        if (params.size > 0) {
            if (params.size !== 1 || params.getAll("view").length !== 1 || params.get("view") !== "state") {
                return context.json({ error: "invalid_goal_view" }, 400);
            }
            if (source.readState === undefined) return context.json({ error: "session_state_unavailable" }, 503);
            try {
                const state = await source.readState(goalId);
                if (state === undefined) return context.json({ error: "goal_not_found" }, 404);
                const session = source.session === undefined ? undefined : await source.session.readState(goalId);
                return context.json({ goal: state, ...(session === undefined ? {} : { session }) });
            } catch {
                return context.json({ error: "goal_read_failed" }, 500);
            }
        }
        try {
            const goal = await source.read(goalId);
            if (goal === undefined) {
                return context.json({ error: "goal_not_found" }, 404);
            }
            const session = source.session === undefined ? undefined : await source.session.readState(goalId);
            return context.json({ goal, ...(session === undefined ? {} : { session }) });
        } catch {
            return context.json({ error: "goal_read_failed" }, 500);
        }
    });

    routes.get("/api/goals/:goalId/activity", async (context) => {
        if (source.readActivity === undefined) return context.json({ error: "activity_unavailable" }, 503);
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) return context.json({ error: "invalid_goal_id" }, 400);
        const params = new URL(context.req.url).searchParams;
        const allowed = new Set(["runId", "before", "after", "limit"]);
        if ([...params.keys()].some((key) => !allowed.has(key)) || params.size > allowed.size) {
            return context.json({ error: "invalid_activity_query" }, 400);
        }
        const runIds = params.getAll("runId");
        const beforeCursors = params.getAll("before");
        const afterCursors = params.getAll("after");
        const limits = params.getAll("limit");
        const runId = runIds[0];
        const before = beforeCursors[0];
        const after = afterCursors[0];
        const rawLimit = limits[0];
        if (runIds.length > 1 || beforeCursors.length > 1 || afterCursors.length > 1 || limits.length > 1
            || (runId !== undefined && !isWireId(runId, 256))
            || (before !== undefined && !isWireCursor(before))
            || (after !== undefined && !isWireCursor(after))
            || (before !== undefined && after !== undefined)) {
            return context.json({ error: "invalid_activity_query" }, 400);
        }
        let limit: number | undefined;
        if (rawLimit !== undefined) {
            const parsed = Number(rawLimit);
            if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
                return context.json({ error: "invalid_activity_query" }, 400);
            }
            limit = parsed;
        }
        const query: BrowserActivityQuery = {
            ...(runId === undefined ? {} : { runId }),
            ...(before === undefined ? {} : { before }),
            ...(after === undefined ? {} : { after }),
            ...(limit === undefined ? {} : { limit }),
        };
        try {
            const result = await source.readActivity(goalId, query);
            if (result.ok) return context.json(result.page);
            const status = result.error === "goal_not_found" || result.error === "run_not_found" ? 404 : 409;
            return context.json({ error: result.error }, status);
        } catch {
            return context.json({ error: "activity_read_failed" }, 500);
        }
    });

    routes.get("/api/goals/:goalId/actions/:actionId", async (context) => {
        if (source.readActionDetails === undefined) return context.json({ error: "action_details_unavailable" }, 500);
        const goalId = context.req.param("goalId");
        const actionId = context.req.param("actionId");
        const runId = context.req.query("runId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || !isWireActionIdentity(actionId, 256) || !isWireId(runId, 256)) {
            return context.json({ error: "invalid_action_details_request" }, 400);
        }
        try {
            const result = await source.readActionDetails(goalId, runId, actionId);
            if (result.ok) return context.json(result);
            const status = result.error === "goal_not_found" ? 404
                : result.error === "action_details_unavailable" ? 500
                    : 409;
            return context.json({ error: result.error }, status);
        } catch { return context.json({ error: "action_details_unavailable" }, 500); }
    });

    routes.get("/api/goals/:goalId/messages", async (context) => {
        const session = source.session;
        if (session === undefined) return context.json({ error: "session_unavailable" }, 503);
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) return context.json({ error: "invalid_goal_id" }, 400);
        const afterMessageId = context.req.query("afterMessageId");
        const throughMessageId = context.req.query("throughMessageId");
        const rawLimit = context.req.query("limit");
        if ((afterMessageId !== undefined && !isWireId(afterMessageId, 256))
            || (throughMessageId !== undefined && !isWireId(throughMessageId, 256))) {
            return context.json({ error: "invalid_message_query" }, 400);
        }
        let limit: number | undefined;
        if (rawLimit !== undefined) {
            const parsed = Number(rawLimit);
            if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
                return context.json({ error: "invalid_message_query" }, 400);
            }
            limit = parsed;
        }
        try {
            const result = await session.listMessages(goalId, {
                ...(afterMessageId === undefined ? {} : { afterMessageId }),
                ...(throughMessageId === undefined ? {} : { throughMessageId }),
                ...(limit === undefined ? {} : { limit }),
            });
            if (result.ok) return context.json(result);
            return context.json({ error: result.error }, result.error === "goal_not_found" ? 404 : 409);
        } catch {
            return context.json({ error: "message_read_failed" }, 500);
        }
    });

    routes.get("/api/goals/:goalId/messages/:messageId", async (context) => {
        const session = source.session;
        if (session === undefined) return context.json({ error: "session_unavailable" }, 503);
        const goalId = context.req.param("goalId");
        const messageId = context.req.param("messageId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || !isWireId(messageId, 256)) {
            return context.json({ error: "invalid_message_query" }, 400);
        }
        const rawOffset = context.req.query("offset");
        let offset: number | undefined;
        if (rawOffset !== undefined) {
            const parsed = Number(rawOffset);
            if (!Number.isSafeInteger(parsed) || parsed < 0) {
                return context.json({ error: "invalid_message_query" }, 400);
            }
            offset = parsed;
        }
        try {
            const result = await session.readMessage(goalId, messageId, offset);
            if (result.ok) return context.json(result);
            return context.json({ error: result.error }, result.error === "goal_not_found" ? 404 : 404);
        } catch {
            return context.json({ error: "message_read_failed" }, 500);
        }
    });

    routes.get("/api/goals/:goalId/interaction-details", async (context) => {        if (source.readInteractionDetails === undefined) {
            return context.json({ error: "interaction_details_unavailable" }, 500);
        }
        const goalId = context.req.param("goalId");
        const runId = context.req.query("runId");
        const interactionId = context.req.query("interactionId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || !isWireId(runId, 256) || !isWireInteractionId(interactionId, 512)) {
            return context.json({ error: "invalid_interaction_details_request" }, 400);
        }
        try {
            const result = await source.readInteractionDetails(goalId, runId, interactionId);
            if (result.ok) return context.json(result);
            const status = result.error === "goal_not_found" ? 404
                : result.error === "interaction_details_unavailable" ? 500
                    : 409;
            return context.json({ error: result.error }, status);
        } catch { return context.json({ error: "interaction_details_unavailable" }, 500); }
    });

    routes.post("/api/goals/:goalId/action-reviews", async (context) => {
        if (source.reviewActionApproval === undefined) {
            return context.json({ error: "review_unavailable" }, 500);
        }
        const goalId = context.req.param("goalId");
        const command = await parseActionReviewCommand(context.req.raw);
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || command === undefined) {
            return context.json({ error: "invalid_action_review_request" }, 400);
        }
        try {
            const result = await source.reviewActionApproval(goalId, command);
            if (result.ok) return context.json(result);
            const status = result.error === "goal_not_found" ? 404
                : result.error === "stale_run" ? 409
                    : result.error === "review_unavailable" ? 500
                        : 422;
            return context.json(result, status);
        } catch { return context.json({ error: "review_unavailable" }, 500); }
    });

    routes.get("/api/goals/:goalId/grants", async (context) => {
        if (source.listToolGrants === undefined) return context.json({ error: "permissions_unavailable" }, 500);
        const goalId = context.req.param("goalId");
        const runId = context.req.query("runId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || !isWireId(runId, 256)) {
            return context.json({ error: "invalid_grant_request" }, 400);
        }
        try {
            const result = await source.listToolGrants(goalId, runId);
            if (result.ok) return context.json(result);
            const status = result.error === "goal_not_found" ? 404
                : result.error === "service_shutting_down" ? 503
                : result.error === "permissions_unavailable" || result.error === "grant_failed" ? 500
                : 409;
            return context.json({ error: result.error }, status);
        } catch { return context.json({ error: "grant_failed" }, 500); }
    });

    routes.delete("/api/goals/:goalId/grants/:grantId", async (context) => {
        if (source.revokeToolGrant === undefined) return context.json({ error: "permissions_unavailable" }, 500);
        const goalId = context.req.param("goalId");
        const grantId = context.req.param("grantId");
        const parsed = await parseGrantRevokeCommand(context.req.raw);
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || !isWireId(grantId, 256) || !parsed.ok) {
            return context.json({ error: parsed.ok ? "invalid_grant_request" : parsed.error }, 400);
        }
        try {
            const result = await source.revokeToolGrant(goalId, { ...parsed.command, grantId });
            if (result.ok) return context.json(result);
            const status = result.error === "goal_not_found" ? 404
                : result.error === "service_shutting_down" ? 503
                : result.error === "permissions_unavailable" || result.error === "grant_failed" ? 500
                : 409;
            return context.json({ error: result.error }, status);
        } catch { return context.json({ error: "grant_failed" }, 500); }
    });

    routes.get("/api/project/permission-mode", async (context) => {
        if (source.getPermissionMode === undefined) return context.json({ error: "permissions_unavailable" }, 500);
        try {
            const result = await source.getPermissionMode();
            if (result.ok) return context.json(result);
            return context.json({ error: result.error }, 500);
        } catch {
            return context.json({ error: "permissions_unavailable" }, 500);
        }
    });

    routes.post("/api/project/permission-mode", async (context) => {
        if (source.setPermissionMode === undefined) return context.json({ error: "permissions_unavailable" }, 500);
        const parsed = await parsePermissionModeCommand(context.req.raw);
        if (!parsed.ok) {
            return context.json({ error: parsed.error }, parsed.status);
        }
        try {
            const result = await source.setPermissionMode(parsed.command);
            if (result.ok) return context.json(result);
            const status = result.error === "service_shutting_down" ? 503 : result.error === "conflict" ? 409 : 500;
            return context.json(result, status);
        } catch {
            return context.json({ error: "permissions_unavailable" }, 500);
        }
    });

    routes.post("/api/goals", async (context) => {
        const parsed = await parseCreateSessionCommand(context.req.raw);
        if (!parsed.ok) {
            return context.json({ error: parsed.error }, parsed.status);
        }
        const session = source.session;
        if (session === undefined) return context.json({ error: "session_unavailable" }, 503);
        try {
            const result = await session.create(parsed.command);
            if (result.ok) return context.json(result, result.existing ? 200 : 202);
            const status = result.error === "create_failed" || result.error === "goal_unreadable" ? 500
                : result.error === "model_catalog_unavailable" || result.error === "service_shutting_down" ? 503
                    : result.error === "goal_busy" || result.error === "goal_id_conflict" ? 409
                        : result.error === "profile_not_found" ? 500
                            : 400;
            return context.json({ error: result.error }, status);
        } catch {
            return context.json({ error: "create_failed" }, 500);
        }
    });

    routes.post("/api/goals/:goalId/inputs", async (context) => {
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) {
            return context.json({ error: "INVALID_INPUT" }, 400);
        }
        const parsed = await parseSessionInputCommand(context.req.raw);
        if (!parsed.ok) {
            return context.json({ error: parsed.error }, parsed.status);
        }
        const session = source.session;
        if (session === undefined) return context.json({ error: "session_unavailable" }, 503);
        try {
            const result = await session.submit(goalId, parsed.command);
            if (result.ok) return context.json(result, result.existing ? 200 : 202);
            return context.json(
                { error: result.error, refresh: sessionInputErrorStatus(result.error) === 409 },
                sessionInputErrorStatus(result.error),
            );
        } catch {
            // 保存可能已经发生：调用方必须使用原 inputId 查询或重试。
            return context.json({ error: "input_admission_failed" }, 503);
        }
    });

    routes.get("/api/goals/:goalId/inputs/:inputId", async (context) => {
        const goalId = context.req.param("goalId");
        const inputId = context.req.param("inputId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || !isWireId(inputId, 256)) {
            return context.json({ error: "INVALID_INPUT" }, 400);
        }
        const session = source.session;
        if (session === undefined) return context.json({ error: "session_unavailable" }, 503);
        let result;
        try {
            result = await session.readInput(goalId, inputId);
        } catch {
            return context.json({ error: "input_read_failed" }, 500);
        }
        if (result.ok) return context.json(result);
        if (result.error === "GOAL_NOT_FOUND") return context.json({ error: "GOAL_NOT_FOUND" }, 404);
        return context.json({ error: "input_read_failed" }, 500);
    });

    routes.post("/api/goals/:goalId/plan-mode", async (context) => {
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) {
            return context.json({ error: "invalid_plan_mode_command" }, 400);
        }
        const parsed = await parsePlanModeCommand(context.req.raw);
        if (!parsed.ok) {
            return context.json({ error: parsed.error }, parsed.status);
        }
        try {
            const result = await source.enterPlanMode(goalId, parsed.command);
            if (result.ok) {
                return context.json({
                    goalId: result.goalId,
                    runId: result.runId,
                    existing: result.existing,
                }, result.existing ? 200 : 202);
            }
            const status = result.error === "goal_not_found" ? 404
                : result.error === "plan_mode_failed" ? 500
                : result.error === "service_shutting_down" ? 503
                    : 409;
            return context.json({ error: result.error, refresh: true }, status);
        } catch {
            return context.json({ error: "plan_mode_failed" }, 500);
        }
    });

    routes.get("/api/goals/:goalId/events", async (context) => {
        const goalId = context.req.param("goalId");
        const query = new URL(context.req.url).searchParams;
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || query.size !== 0) {
            return context.json({ error: "invalid_stream_identity" }, 400);
        }
        const session = source.session;
        if (session === undefined) return context.json({ error: "session_unavailable" }, 503);
        let opened;
        try {
            opened = await session.openEvents(goalId, context.req.raw.signal);
        } catch {
            return context.json({ error: "stream_unavailable" }, 500);
        }
        if (!opened.ok) {
            return context.json({ error: opened.error }, opened.error === "goal_not_found" ? 404 : 409);
        }
        const feed = opened.feed;
        const response = streamSSE(context, async (stream) => {
            let released = false;
            const release = () => {
                if (released) return;
                released = true;
                feed.close();
            };
            stream.onAbort(release);
            try {
                for await (const event of feed.events) {
                    if (stream.aborted) break;
                    await stream.writeSSE({ event: "update", data: JSON.stringify(event) });
                }
            } catch {
                // feed 迭代失败按普通断线收尾：客户端经重连重新同步权威状态。
            } finally {
                release();
            }
        });
        // `streamSSE` 默认只声明 `no-cache`；保留既有禁用缓存与代理缓冲的传输语义。
        response.headers.set("cache-control", "no-cache, no-transform");
        response.headers.set("x-accel-buffering", "no");
        return response;
    });

    const providerSettings = source.providerSettings;
    if (providerSettings !== undefined) {
        routes.get("/api/providers", async (context) => {
            try {
                const result = await providerSettings.read();
                if (result.ok) return context.json(result.settings);
                return context.json({ error: result.error }, providerSettingsErrorStatus(result.error));
            } catch {
                return context.json({ error: "provider_profile_unavailable" }, 503);
            }
        });

        routes.post("/api/providers/models", async (context) => {
            const parsedBody = await readJsonBody(context.req.raw);
            if (!parsedBody.ok) return context.json({ error: parsedBody.error }, parsedBody.status);
            const parsed = browserProviderModelQueryBinding.read(parsedBody.value, "strip");
            if (!parsed.ok
                || !hasUtf16LengthAtMost(parsed.data.kind, MAX_PROVIDER_KIND_LENGTH)
                || (parsed.data.apiKey !== undefined
                    && !hasUtf16LengthAtMost(parsed.data.apiKey, MAX_PROVIDER_API_KEY_LENGTH))
                || (parsed.data.baseURL !== undefined
                    && !hasUtf16LengthAtMost(parsed.data.baseURL, MAX_PROVIDER_BASE_URL_LENGTH))
                || (parsed.data.profileId !== undefined
                    && !isWireId(parsed.data.profileId, MAX_GOAL_ID_LENGTH))) {
                return context.json({ error: "invalid_provider_profile" }, 400);
            }
            reportWireDiagnostic(parsed.diagnostic);
            try {
                const result = await providerSettings.fetchModels(parsed.data, context.req.raw.signal);
                if (result.ok) return context.json(result);
                return context.json({ error: result.error }, result.error === "provider_profile_invalid" ? 400 : providerProfileTestStatus(result.error));
            } catch {
                return context.json({ error: "model_catalog_unavailable" }, 503);
            }
        });

        routes.post("/api/providers", async (context) => {
            const parsed = await parseProviderProfileInput(context.req.raw);
            if (!parsed.ok) return context.json({ error: "invalid_provider_profile" }, 400);
            try {
                const result = await providerSettings.create(parsed.input);
                if (result.ok) return context.json(result, 201);
                return context.json(
                    { error: result.error, ...(result.fields === undefined ? {} : { fields: result.fields }) },
                    providerSettingsErrorStatus(result.error),
                );
            } catch {
                return context.json({ error: "provider_profile_unavailable" }, 503);
            }
        });

        routes.patch("/api/providers/:providerProfileId", async (context) => {
            const profileId = context.req.param("providerProfileId");
            if (!isWireId(profileId, MAX_GOAL_ID_LENGTH)) {
                return context.json({ error: "invalid_provider_profile" }, 400);
            }
            const parsed = await parseProviderProfileInput(context.req.raw);
            if (!parsed.ok) return context.json({ error: "invalid_provider_profile" }, 400);
            try {
                const result = await providerSettings.update(profileId, parsed.input);
                if (result.ok) return context.json(result);
                return context.json(
                    { error: result.error, ...(result.fields === undefined ? {} : { fields: result.fields }) },
                    providerSettingsErrorStatus(result.error),
                );
            } catch {
                return context.json({ error: "provider_profile_unavailable" }, 503);
            }
        });

        routes.delete("/api/providers/:providerProfileId", async (context) => {
            const profileId = context.req.param("providerProfileId");
            if (!isWireId(profileId, MAX_GOAL_ID_LENGTH)) {
                return context.json({ error: "invalid_provider_profile" }, 400);
            }
            try {
                const result = await providerSettings.remove(profileId);
                if (result.ok) return context.json(result);
                return context.json({ error: result.error }, providerSettingsErrorStatus(result.error));
            } catch {
                return context.json({ error: "provider_profile_unavailable" }, 503);
            }
        });

        routes.post("/api/providers/:providerProfileId/activate", async (context) => {
            const profileId = context.req.param("providerProfileId");
            if (!isWireId(profileId, MAX_GOAL_ID_LENGTH)) {
                return context.json({ error: "invalid_provider_profile" }, 400);
            }
            try {
                const result = await providerSettings.activate(profileId);
                if (result.ok) return context.json(result);
                return context.json({ error: result.error }, providerSettingsErrorStatus(result.error));
            } catch {
                return context.json({ error: "provider_profile_unavailable" }, 503);
            }
        });

        routes.post("/api/providers/:providerProfileId/test", async (context) => {
            const profileId = context.req.param("providerProfileId");
            if (!isWireId(profileId, MAX_GOAL_ID_LENGTH)) {
                return context.json({ error: "invalid_provider_profile" }, 400);
            }
            try {
                const result = await providerSettings.test(profileId);
                if (result.ok) return context.json(result);
                return context.json({ error: result.error }, providerProfileTestStatus(result.error));
            } catch {
                return context.json({ error: "model_catalog_unavailable" }, 503);
            }
        });
    }

    return routes;
}

/**
 * 记录已剥离的未知请求字段诊断。
 *
 * @remarks
 * 只输出契约身份、版本和有界路径；不记录字段值或原始请求正文。诊断输出失败不改变请求处理结果。
 */
function reportWireDiagnostic(diagnostic: {
    readonly contractId: string;
    readonly version: number;
    readonly paths: readonly string[];
    readonly truncated: boolean;
} | undefined): void {
    if (diagnostic === undefined) return;
    try {
        console.debug("[browser] request has unknown fields", diagnostic);
    } catch {
        // 诊断输出失败不影响合法请求。
    }
}

function providerSettingsErrorStatus(error: BrowserProviderSettingsError): 400 | 404 | 409 | 503 {    if (error === "provider_profile_not_found") return 404;
    if (error === "provider_profile_invalid") return 400;
    if (error === "provider_profile_conflict" || error === "provider_profile_active") return 409;
    return 503;
}

function providerProfileTestStatus(error: BrowserProviderProfileTestError): 404 | 502 | 503 {
    if (error === "provider_profile_not_found") return 404;
    if (error === "model_catalog_unavailable") return 503;
    return 502;
}

/**
 * 解析创建/更新档案的 wire 输入。
 *
 * @remarks
 * 只接受白名单字段；`label`、`kind`、`defaultModel` 必填。
 * 其余可选字段省略或为 `null` 时归一为缺省：`apiKey` 缺省表示保留原凭据，其余表示清空。
 */
type ControlHttpStatus = 200 | 202 | 400 | 404 | 409 | 500 | 503;

async function dispatchControlIntent(
    source: BrowserGoalApiPort,
    command: BrowserControlIntentCommand,
): Promise<{ readonly receipt: BrowserControlReceipt; readonly status: ControlHttpStatus }> {
    switch (command.kind) {
        case "create_session": {
            const session = source.session;
            if (session === undefined) return rejectedControl(command.intentId, "session_unavailable");
            const result = await session.create({
                goalId: command.goalId,
                inputId: command.inputId,
                intent: command.intent,
                ...(command.mode === undefined ? {} : { mode: command.mode }),
                ...(command.modelId === undefined ? {} : { modelId: command.modelId }),
            });
            if (result.ok) return acceptedControl(command.intentId, { kind: "create_session", result }, result.existing, result.existing ? 200 : 202);
            return rejectedControl(command.intentId, result.error);
        }
        case "session_input": {
            if (command.intentId !== command.input.inputId) {
                return rejectedControl(command.intentId, "intent_id_mismatch");
            }
            const session = source.session;
            if (session === undefined) return rejectedControl(command.intentId, "session_unavailable");
            const result = await session.submit(command.goalId, command.input);
            if (result.ok) return acceptedControl(command.intentId, { kind: "session_input", result }, result.existing, result.existing ? 200 : 202);
            return rejectedControl(command.intentId, result.error);
        }
        case "plan_mode": {
            const result = await source.enterPlanMode(command.goalId, { runId: command.runId });
            if (result.ok) return acceptedControl(command.intentId, { kind: "plan_mode", result }, result.existing, result.existing ? 200 : 202);
            return rejectedControl(command.intentId, result.error);
        }
        case "model_selection": {
            const result = await source.selectModel(command.goalId, {
                runId: command.runId,
                modelId: command.modelId,
                ...(command.providerProfileId === undefined ? {} : { providerProfileId: command.providerProfileId }),
                persistAsDefault: command.persistAsDefault,
            });
            if (result.ok) return acceptedControl(command.intentId, { kind: "model_selection", result });
            return rejectedControl(command.intentId, result.error);
        }
        case "permission_mode": {
            if (source.setPermissionMode === undefined) return rejectedControl(command.intentId, "permissions_unavailable");
            const result = await source.setPermissionMode({
                mode: command.mode,
                expectedRevision: command.expectedRevision,
            });
            if (result.ok) return acceptedControl(command.intentId, { kind: "permission_mode", result });
            return rejectedControl(command.intentId, result.error);
        }
        case "grant_revoke": {
            if (source.revokeToolGrant === undefined) return rejectedControl(command.intentId, "permissions_unavailable");
            const result = await source.revokeToolGrant(command.goalId, {
                runId: command.runId,
                grantId: command.grantId,
                scope: command.scope,
                ...(command.grantKind === undefined ? {} : { kind: command.grantKind }),
            });
            if (result.ok) return acceptedControl(command.intentId, { kind: "grant_revoke", result });
            return rejectedControl(command.intentId, result.error);
        }
        case "goal_archive": {
            if (source.setArchived === undefined) return rejectedControl(command.intentId, "goal_management_unavailable");
            const result = await source.setArchived(command.goalId, command.archived);
            if (result.ok) return acceptedControl(command.intentId, { kind: "goal_archive", result: { ok: true, archived: command.archived } });
            return rejectedControl(command.intentId, result.error);
        }
        case "goal_delete": {
            if (source.deleteGoal === undefined) return rejectedControl(command.intentId, "goal_management_unavailable");
            const result = await source.deleteGoal(command.goalId);
            if (result.ok) return acceptedControl(command.intentId, { kind: "goal_delete", result: { ok: true, deleted: true } });
            return rejectedControl(command.intentId, result.error);
        }
        case "action_review": {
            if (source.reviewActionApproval === undefined) return rejectedControl(command.intentId, "review_unavailable");
            const result = await source.reviewActionApproval(command.goalId, {
                runId: command.runId,
                actionId: command.actionId,
                ...(command.input === undefined ? {} : { input: command.input }),
                ...(command.scope === undefined ? {} : { scope: command.scope }),
            });
            if (result.ok) return acceptedControl(command.intentId, { kind: "action_review", result });
            return rejectedControl(command.intentId, result.error);
        }
    }
}

function acceptedControl(
    intentId: string,
    result: BrowserControlIntentResult,
    existing = false,
    status: ControlHttpStatus = 200,
): { readonly receipt: BrowserControlReceipt; readonly status: ControlHttpStatus } {
    return {
        receipt: { intentId, status: existing ? "existing" : "accepted", result },
        status,
    };
}

function rejectedControl(
    intentId: string,
    error: string,
): { readonly receipt: BrowserControlReceipt; readonly status: ControlHttpStatus } {
    return {
        receipt: { intentId, status: "rejected", error, ...(controlErrorRefresh(error) ? { refresh: true } : {}) },
        status: controlErrorStatus(error),
    };
}

function controlErrorStatus(error: string): ControlHttpStatus {
    if (error === "goal_not_found") return 404;
    if (error === "session_unavailable" || error === "service_shutting_down"
        || error === "permissions_unavailable" || error === "review_unavailable"
        || error === "goal_management_unavailable" || error === "model_catalog_unavailable") return 503;
    if (error === "invalid_control_command" || error === "intent_id_mismatch" || error === "invalid_tool_input") return 400;
    if (error === "stale_run" || error === "goal_busy" || error === "conflict"
        || error === "model_switch_not_allowed" || error === "plan_mode_busy"
        || error === "goal_id_conflict" || error === "goal_not_terminal"
        || error === "goal_has_pending_inputs" || error === "action_not_waiting"
        || error === "action_id_mismatch" || error === "scope_unavailable"
        || error === "sandbox_scope_unavailable" || error === "tool_not_found") return 409;
    return 500;
}

function controlErrorRefresh(error: string): boolean {
    return error === "stale_run" || error === "goal_busy" || error === "conflict"
        || error === "model_switch_not_allowed" || error === "plan_mode_busy"
        || error === "goal_not_terminal" || error === "goal_has_pending_inputs"
        || error === "action_not_waiting" || error === "action_id_mismatch";
}

async function parseProviderProfileInput(
    request: Request,
): Promise<{ readonly ok: true; readonly input: BrowserProviderProfileInput } | { readonly ok: false }> {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return { ok: false };
    const parsed = browserProviderProfileInputBinding.read(parsedBody.value, "strip");
    if (!parsed.ok) return { ok: false };
    reportWireDiagnostic(parsed.diagnostic);
    const input = parsed.data;
    if (!hasUtf16LengthAtMost(input.label, MAX_PROVIDER_LABEL_LENGTH)
        || !hasUtf16LengthAtMost(input.kind, MAX_PROVIDER_KIND_LENGTH)
        || !hasUtf16LengthAtMost(input.defaultModel, 256)
        || (input.apiKey !== undefined
            && !hasUtf16LengthAtMost(input.apiKey, MAX_PROVIDER_API_KEY_LENGTH))
        || (input.baseURL !== undefined && input.baseURL !== null
            && !hasUtf16LengthAtMost(input.baseURL, MAX_PROVIDER_BASE_URL_LENGTH))
        || (input.contextWindowTokens !== undefined && input.contextWindowTokens !== null
            && !Number.isSafeInteger(input.contextWindowTokens))
        || (input.maxOutputTokens !== undefined && input.maxOutputTokens !== null
            && !Number.isSafeInteger(input.maxOutputTokens))) {
        return { ok: false };
    }
    return { ok: true, input };
}

function modelCatalogErrorStatus(error: Exclude<BrowserModelCatalogReadResult, { readonly ok: true }>["error"]): 404 | 409 | 502 | 503 {
    if (error === "goal_not_found") return 404;
    if (error === "stale_run") return 409;
    if (error === "model_catalog_unavailable") return 503;
    return 502;
}

async function parseCreateSessionCommand(
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserCreateSessionCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return parsedBody;
    const parsed = browserCreateSessionCommandBinding.read(parsedBody.value, "strip");
    if (!parsed.ok) {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }
    reportWireDiagnostic(parsed.diagnostic);
    const command = parsed.data;
    if (!isWireId(command.goalId, MAX_GOAL_ID_LENGTH)
        || !isWireId(command.inputId, 256)
        || !hasUtf16LengthAtMost(command.intent, MAX_COMMAND_TEXT_LENGTH)
        || (command.modelId !== undefined && !hasUtf16LengthAtMost(command.modelId, 256))) {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }
    return { ok: true, command };
}


/**
 * 解析统一会话输入的严格 wire 联合。
 *
 * @remarks
 * 每个变体只接受白名单字段；正文只接受非空文本并有长度上限，数字字段必须是
 * 非负安全整数。字段错误与只读读取失败都在这里明确返回，不猜测输入种类。
 */
async function parseSessionInputCommand(
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserSessionInputCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    const parsedBody = await readJsonBody(request, MAX_SESSION_INPUT_BODY_BYTES);
    if (!parsedBody.ok) return parsedBody;
    const parsed = browserSessionInputCommandBinding.read(parsedBody.value, "strip");
    if (!parsed.ok || !isWireId(parsed.data.inputId, 256)) {
        return { ok: false, error: "INVALID_INPUT", status: 400 };
    }
    reportWireDiagnostic(parsed.diagnostic);
    const command = parsed.data;

    if (command.kind === "message") {
        return { ok: true, command };
    }

    if (command.kind === "steer") {
        if (!isWireId(command.runId, 256)
            || (command.queueBinding !== undefined
                && !isWireId(command.queueBinding.messageId, 256))) {
            return { ok: false, error: "INVALID_INPUT", status: 400 };
        }
        return { ok: true, command };
    }

    if (command.kind === "interrupt") {
        return isWireId(command.runId, 256)
            ? { ok: true, command }
            : { ok: false, error: "INVALID_INPUT", status: 400 };
    }

    if (command.kind === "respond") {
        if (!isWireId(command.runId, 256) || !isValidInteractionResponse(command.response)) {
            return { ok: false, error: "INVALID_INPUT", status: 400 };
        }
        const requestId = ACTION_RESPONSE_KINDS.has(command.response.kind)
            ? isWireActionIdentity(command.requestId, 256)
            : isWireId(command.requestId, 256);
        return requestId
            ? { ok: true, command }
            : { ok: false, error: "INVALID_INPUT", status: 400 };
    }

    if (command.kind === "resume") {
        return isWireId(command.runId, 256)
            ? { ok: true, command }
            : { ok: false, error: "INVALID_INPUT", status: 400 };
    }

    if (command.action === "remove") {
        return command.messageId !== undefined && isWireId(command.messageId, 256)
            ? { ok: true, command }
            : { ok: false, error: "INVALID_INPUT", status: 400 };
    }
    return command.messageId === undefined
        ? { ok: true, command }
        : { ok: false, error: "INVALID_INPUT", status: 400 };
}

/**
 * 检查交互回答的既有 wire 文本长度边界。
 *
 * @remarks 结构、枚举与 kind 专属字段已由命令合同校验；这里只保留既有上限语义，
 * 不修改用户文本。
 */
function isValidInteractionResponse(response: BrowserSessionInteractionResponse): boolean {
    if (response.kind === "answer_ask_user") {
        return response.answers.every((answer) =>
            hasUtf16LengthAtMost(answer.questionId, 256)
            && (answer.otherText === undefined
                || hasUtf16LengthAtMost(answer.otherText, MAX_COMMAND_TEXT_LENGTH))
            && answer.optionIds.every((id) => hasUtf16LengthAtMost(id, 256)));
    }
    if (response.kind === "reply_to_question") return true;
    if (response.kind === "feedback_task") {
        return hasUtf16LengthAtMost(response.feedback, MAX_COMMAND_TEXT_LENGTH);
    }
    if (response.kind === "approve_action") {
        return hasUtf16LengthAtMost(response.actionId, 256);
    }
    if (response.kind === "approve_action_revision") {
        return hasUtf16LengthAtMost(response.actionId, 256)
            && hasUtf16LengthAtMost(response.reviewRef, 256);
    }
    if (response.kind === "retry_unknown_action") {
        return hasUtf16LengthAtMost(response.actionId, 256)
            && hasUtf16LengthAtMost(response.recoveryRef, 256);
    }
    if (response.kind === "decline_unknown_action_retry") {
        return hasUtf16LengthAtMost(response.actionId, 256)
            && hasUtf16LengthAtMost(response.recoveryRef, 256)
            && hasUtf16LengthAtMost(response.reason, MAX_COMMAND_TEXT_LENGTH);
    }
    if (response.kind === "reject_action") {
        return hasUtf16LengthAtMost(response.actionId, 256)
            && hasUtf16LengthAtMost(response.reason, MAX_COMMAND_TEXT_LENGTH);
    }
    return response.kind === "skip_question" || response.kind === "approve_task";
}


/**
 * 以 Action 身份作为请求引用的交互决定种类。
 *
 * @remarks 这些决定不引用问答请求身份，只引用当前待决 Action 的真实身份。
 */
const ACTION_RESPONSE_KINDS: ReadonlySet<string> = new Set([
    "approve_action",
    "approve_action_revision",
    "reject_action",
    "retry_unknown_action",
    "decline_unknown_action_retry",
]);

async function parsePlanModeCommand(
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserGoalPlanModeCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return parsedBody;
    const parsed = browserGoalPlanModeCommandBinding.read(parsedBody.value, "strip");
    if (!parsed.ok || !isWireId(parsed.data.runId, 256)) {
        return { ok: false, error: "invalid_plan_mode_command", status: 400 };
    }
    reportWireDiagnostic(parsed.diagnostic);
    return { ok: true, command: parsed.data };
}


/**
 * 解析只读审批预检的严格 wire 命令。
 *
 * @remarks 只接受当前 Run、Action、可选拟修订参数与可选授权期限；参数必须是
 * JSON 值，期限必须是已知范围。解析失败返回 `undefined`，不猜测输入。
 */
async function parseActionReviewCommand(
    request: Request,
): Promise<BrowserActionReviewCommand | undefined> {
    const parsedBody = await readJsonBody(request, MAX_SESSION_INPUT_BODY_BYTES);
    if (!parsedBody.ok) return undefined;
    const parsed = browserActionReviewCommandBinding.read(parsedBody.value, "strip");
    if (!parsed.ok
        || !hasUtf16LengthAtMost(parsed.data.runId, 256)
        || !hasUtf16LengthAtMost(parsed.data.actionId, 256)) {
        return undefined;
    }
    reportWireDiagnostic(parsed.diagnostic);
    return parsed.data;
}


async function parseGrantRevokeCommand(request: Request): Promise<
    | { readonly ok: true; readonly command: Omit<BrowserToolGrantRevokeCommand, "grantId"> }
    | { readonly ok: false; readonly error: string }
> {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return { ok: false, error: parsedBody.error };
    const parsed = browserToolGrantRevokeBodyBinding.read(parsedBody.value, "strip");
    if (!parsed.ok || !isWireId(parsed.data.runId, 256)) {
        return { ok: false, error: "invalid_grant_request" };
    }
    reportWireDiagnostic(parsed.diagnostic);
    const { runId, scope, kind } = parsed.data;
    return { ok: true, command: { runId, scope, ...(kind === undefined ? {} : { kind }) } };
}

async function parsePermissionModeCommand(request: Request): Promise<
    | { readonly ok: true; readonly command: BrowserPermissionModeCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return parsedBody;
    const parsed = browserPermissionModeCommandBinding.read(parsedBody.value, "strip");
    if (!parsed.ok) {
        return { ok: false, error: "invalid_permission_mode_request", status: 400 };
    }
    reportWireDiagnostic(parsed.diagnostic);
    return { ok: true, command: parsed.data };
}

async function readJsonBody(
    request: Request,
    maximumBytes: number = MAX_COMMAND_BODY_BYTES,
): Promise<
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
        return { ok: false, error: "application_json_required", status: 415 };
    }
    const contentLength = request.headers.get("content-length");
    if (contentLength !== null) {
        if (!/^\d+$/.test(contentLength)) {
            return { ok: false, error: "invalid_goal_input", status: 400 };
        }
        if (Number(contentLength) > maximumBytes) {
            return { ok: false, error: "request_too_large", status: 413 };
        }
    }
    const reader = request.body?.getReader();
    if (reader === undefined) {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bodyText = "";
    let totalBytes = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            totalBytes += chunk.value.byteLength;
            if (totalBytes > maximumBytes) {
                await reader.cancel();
                return { ok: false, error: "request_too_large", status: 413 };
            }
            bodyText += decoder.decode(chunk.value, { stream: true });
        }
        bodyText += decoder.decode();
    } catch {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }
    try {
        return { ok: true, value: JSON.parse(bodyText) as unknown };
    } catch {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }
}

/**
 * 映射会话输入拒绝的 HTTP 状态。
 *
 * @remarks
 * 字段与文本超限是调用方错误（400／413），Goal／Run 与修订冲突是 409，
 * 关闭期间与不确定保存是 503；状态码不改变 wire 错误码的稳定性。
 */
function sessionInputErrorStatus(error: BrowserSessionInputErrorCode): 400 | 404 | 409 | 413 | 503 {
    if (error === "INVALID_INPUT") return 400;
    if (error === "TEXT_TOO_LARGE" || error === "QUEUE_TEXT_TOO_LARGE") return 413;
    if (error === "GOAL_NOT_FOUND") return 404;
    if (error === "input_admission_failed" || error === "session_unavailable") return 503;
    return 409;
}

function isWireId(value: unknown, maximumLength: number): value is string {
    return typeof value === "string"
        && value.length > 0
        && value.length <= maximumLength
        && /^[A-Za-z0-9_-]+$/.test(value);
}

function isWireCursor(value: unknown): value is string {
    return typeof value === "string"
        && value.length > 0
        && value.length <= 65_536
        && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Action 身份是普通 wire id，或 PTC 子操作身份 `父程序身份:调用序号`。
 *
 * @remarks
 * PTC 子调用以父程序身份加调用序号作为自身 Action 身份；wire 必须原样承载这一
 * 真实身份，不能把它截断成父程序身份，也不能因为包含分隔符而拒绝该引用。
 *
 * @param value - 待检测值。
 * @param maximumLength - 允许的最大长度。
 * @returns 是否为合法 Action 身份。
 *
 * @example
 * ```ts
 * if (isWireActionIdentity("program-1:0", 256)) console.log("valid");
 * ```
 */
function isWireActionIdentity(value: unknown, maximumLength: number): value is string {
    return typeof value === "string"
        && value.length > 0
        && value.length <= maximumLength
        && /^[A-Za-z0-9_:-]+$/.test(value);
}

/**
 * 交互引用是 `种类:等待身份` 的稳定键：种类与身份各自受限于 wire id 字符集。
 *
 * @remarks 等待身份可能是 PTC 子操作身份，因此按 Action 身份字符集校验。
 */
function isWireInteractionId(value: unknown, maximumLength: number): value is string {
    if (typeof value !== "string" || value.length === 0 || value.length > maximumLength) return false;
    const separator = value.indexOf(":");
    if (separator <= 0 || separator === value.length - 1) return false;
    return isWireId(value.slice(0, separator), 64) && isWireActionIdentity(value.slice(separator + 1), 256);
}

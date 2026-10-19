import type { BrowserProviderModelQuery, BrowserProviderModels } from "../../web-contracts/src/index";
import { Hono } from "hono";

import type { BrowserGoalListItem, BrowserGoalSession } from "./browser-projection";
import type { BrowserModelCatalogReadResult } from "./browser-model-catalog";
import type {
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserActionDetailsResult,
    BrowserToolGrantResult,
    BrowserToolGrantRevokeCommand,
    BrowserPermissionModeCommand,
    BrowserPermissionModeResult,
} from "./browser-goal-command-service";
import type {
    BrowserGoalLiveFeed,
    BrowserGoalSessionPort,
} from "./browser-session-port";
import type {
    BrowserCreateSessionCommand,
    BrowserSessionInputCommand,
    BrowserSessionInputErrorCode,
    BrowserSessionInteractionResponse,
} from "../../web-contracts/src/index";
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
const PROVIDER_PROFILE_FIELD_NAMES: ReadonlySet<string> = new Set([
    "label", "kind", "defaultModel", "apiKey", "baseURL",
    "contextWindowTokens", "maxOutputTokens", "structuredOutputMode",
]);

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
 *     list: async () => [],
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
     * @returns 正式工作区的白名单摘要，保持 Catalog 排序。
     * @throws Catalog 损坏或读取失败时拒绝。
     */
    list(): Promise<readonly BrowserGoalListItem[]>;
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
        const value = body.value;
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            return context.json({ error: "invalid_model_preference" }, 400);
        }
        const fields = value as Record<string, unknown>;
        const modelId = readWireText(fields.modelId, 256);
        const providerProfileId = fields.providerProfileId === undefined
            ? undefined
            : readWireText(fields.providerProfileId, MAX_GOAL_ID_LENGTH);
        if (
            Object.keys(fields).some((key) => key !== "modelId" && key !== "providerProfileId")
            || modelId === undefined
            || ("providerProfileId" in fields && providerProfileId === undefined)
        ) {
            return context.json({ error: "invalid_model_preference" }, 400);
        }
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
        const value = body.value;
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            return context.json({ error: "invalid_model_selection" }, 400);
        }
        const fields = value as Record<string, unknown>;
        const modelId = readWireText(fields.modelId, 256);
        const providerProfileId = fields.providerProfileId === undefined
            ? undefined
            : readWireText(fields.providerProfileId, MAX_GOAL_ID_LENGTH);
        if (
            Object.keys(fields).some((key) => key !== "runId" && key !== "modelId" && key !== "providerProfileId")
            || !isWireId(fields.runId, 256)
            || modelId === undefined
            || ("providerProfileId" in fields && providerProfileId === undefined)
        ) return context.json({ error: "invalid_model_selection" }, 400);
        try {
            const result = await source.selectModel(goalId, {
                runId: fields.runId,
                modelId,
                ...(providerProfileId === undefined ? {} : { providerProfileId }),
            });
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
            return context.json({ goals: await source.list() });
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
        if (typeof body.value !== "object" || body.value === null || Array.isArray(body.value)
            || Object.keys(body.value).length !== 1 || typeof (body.value as Record<string, unknown>).archived !== "boolean") {
            return context.json({ error: "invalid_archive_request" }, 400);
        }
        try {
            const result = await source.setArchived(goalId, (body.value as { archived: boolean }).archived);
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

    routes.get("/api/goals/:goalId/actions/:actionId", async (context) => {
        if (source.readActionDetails === undefined) return context.json({ error: "action_details_unavailable" }, 500);
        const goalId = context.req.param("goalId");
        const actionId = context.req.param("actionId");
        const runId = context.req.query("runId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH) || !isWireId(actionId, 256) || !isWireId(runId, 256)) {
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
        return createEventStreamResponse(opened.feed);
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
            const parsed = await readJsonBody(context.req.raw);
            if (!parsed.ok) return context.json({ error: parsed.error }, parsed.status);
            const value = parsed.value;
            if (typeof value !== "object" || value === null || Array.isArray(value)) return context.json({ error: "invalid_provider_profile" }, 400);
            const fields = value as Record<string, unknown>;
            const kind = readWireText(fields.kind, MAX_PROVIDER_KIND_LENGTH);
            const apiKey = fields.apiKey === undefined ? undefined : readWireText(fields.apiKey, MAX_PROVIDER_API_KEY_LENGTH);
            const baseURL = fields.baseURL === undefined ? undefined : readWireText(fields.baseURL, MAX_PROVIDER_BASE_URL_LENGTH);
            const profileId = fields.profileId === undefined ? undefined : readWireText(fields.profileId, MAX_GOAL_ID_LENGTH);
            if (!kind || Object.keys(fields).some(key => !["kind", "apiKey", "baseURL", "profileId"].includes(key))
                || (fields.apiKey !== undefined && apiKey === undefined)
                || (fields.baseURL !== undefined && baseURL === undefined)
                || (fields.profileId !== undefined && (profileId === undefined || !isWireId(profileId, MAX_GOAL_ID_LENGTH)))) {
                return context.json({ error: "invalid_provider_profile" }, 400);
            }
            try {
                const result = await providerSettings.fetchModels({ kind, ...(apiKey === undefined ? {} : { apiKey }), ...(baseURL === undefined ? {} : { baseURL }), ...(profileId === undefined ? {} : { profileId }) }, context.req.raw.signal);
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

function providerSettingsErrorStatus(error: BrowserProviderSettingsError): 400 | 404 | 409 | 503 {
    if (error === "provider_profile_not_found") return 404;
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
async function parseProviderProfileInput(
    request: Request,
): Promise<{ readonly ok: true; readonly input: BrowserProviderProfileInput } | { readonly ok: false }> {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return { ok: false };
    const value = parsedBody.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false };
    const fields = value as Record<string, unknown>;
    if (Object.keys(fields).some((key) => !PROVIDER_PROFILE_FIELD_NAMES.has(key))) return { ok: false };

    const label = readWireText(fields.label, MAX_PROVIDER_LABEL_LENGTH);
    const kind = readWireText(fields.kind, MAX_PROVIDER_KIND_LENGTH);
    const defaultModel = readWireText(fields.defaultModel, 256);
    if (label === undefined || kind === undefined || defaultModel === undefined) return { ok: false };

    const absent = (input: unknown): boolean => input === undefined || input === null;
    if (!absent(fields.apiKey) && readWireText(fields.apiKey, MAX_PROVIDER_API_KEY_LENGTH) === undefined) return { ok: false };
    if (!absent(fields.baseURL) && readWireText(fields.baseURL, MAX_PROVIDER_BASE_URL_LENGTH) === undefined) return { ok: false };
    const apiKey = absent(fields.apiKey) ? undefined : readWireText(fields.apiKey, MAX_PROVIDER_API_KEY_LENGTH);
    const baseURL = absent(fields.baseURL) ? undefined : readWireText(fields.baseURL, MAX_PROVIDER_BASE_URL_LENGTH);

    const mode = absent(fields.structuredOutputMode) ? undefined : readWireText(fields.structuredOutputMode, 32);
    if (mode !== undefined && mode !== "strict" && mode !== "prompt_only" && mode !== "two_stage") return { ok: false };

    const readPositive = (input: unknown): number | undefined => {
        if (absent(input)) return undefined;
        return typeof input === "number" && Number.isSafeInteger(input) && input > 0 ? input : undefined;
    };
    if (!absent(fields.contextWindowTokens) && readPositive(fields.contextWindowTokens) === undefined) return { ok: false };
    if (!absent(fields.maxOutputTokens) && readPositive(fields.maxOutputTokens) === undefined) return { ok: false };
    const contextWindowTokens = readPositive(fields.contextWindowTokens);
    const maxOutputTokens = readPositive(fields.maxOutputTokens);

    return {
        ok: true,
        input: {
            label,
            kind,
            defaultModel,
            ...(apiKey === undefined ? {} : { apiKey }),
            ...(baseURL === undefined ? {} : { baseURL }),
            ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
            ...(mode === undefined ? {} : { structuredOutputMode: mode }),
        },
    };
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
    const value = parsedBody.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }
    const body = value as Record<string, unknown>;
    if (
        Object.keys(body).some((key) => key !== "goalId" && key !== "inputId" && key !== "intent" && key !== "mode" && key !== "modelId")
        || !isWireId(body.goalId, MAX_GOAL_ID_LENGTH)
        || !isWireId(body.inputId, 256)
        || typeof body.intent !== "string"
        || body.intent.trim().length === 0
        || body.intent.length > MAX_COMMAND_TEXT_LENGTH
        || (body.mode !== undefined && body.mode !== "plan")
        || (body.modelId !== undefined && readWireText(body.modelId, 256) === undefined)
    ) {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }

    return {
        ok: true,
        command: {
            goalId: body.goalId,
            inputId: body.inputId,
            intent: body.intent,
            ...(body.mode === undefined ? {} : { mode: body.mode }),
            ...(body.modelId === undefined ? {} : { modelId: body.modelId as string }),
        },
    };
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
    const value = parsedBody.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "INVALID_INPUT", status: 400 };
    }
    const body = value as Record<string, unknown>;
    const kind = body.kind;
    if (!isWireId(body.inputId, 256) || typeof kind !== "string") {
        return { ok: false, error: "INVALID_INPUT", status: 400 };
    }

    if (kind === "message") {
        if (!hasExactKeys(body, ["kind", "inputId", "content"])) return { ok: false, error: "INVALID_INPUT", status: 400 };
        const content = readSessionText(body.content);
        return content === undefined
            ? { ok: false, error: "INVALID_INPUT", status: 400 }
            : { ok: true, command: { kind, inputId: body.inputId, content } };
    }

    if (kind === "steer") {
        if (!hasExactKeys(body, ["kind", "inputId", "runId", "content"])) return { ok: false, error: "INVALID_INPUT", status: 400 };
        const content = readSessionText(body.content);
        return !isWireId(body.runId, 256) || content === undefined
            ? { ok: false, error: "INVALID_INPUT", status: 400 }
            : { ok: true, command: { kind, inputId: body.inputId, runId: body.runId, content } };
    }

    if (kind === "interrupt") {
        if (!hasExactKeys(body, ["kind", "inputId", "runId"])) return { ok: false, error: "INVALID_INPUT", status: 400 };
        return !isWireId(body.runId, 256)
            ? { ok: false, error: "INVALID_INPUT", status: 400 }
            : { ok: true, command: { kind, inputId: body.inputId, runId: body.runId } };
    }

    if (kind === "respond") {
        if (!hasExactKeys(body, ["kind", "inputId", "runId", "requestId", "response"])) return { ok: false, error: "INVALID_INPUT", status: 400 };
        const response = parseInteractionResponse(body.response);
        return !isWireId(body.runId, 256) || !isWireId(body.requestId, 256) || response === undefined
            ? { ok: false, error: "INVALID_INPUT", status: 400 }
            : { ok: true, command: { kind, inputId: body.inputId, runId: body.runId, requestId: body.requestId, response } };
    }

    if (kind === "resume") {
        if (!hasExactKeys(body, ["kind", "inputId", "runId", "commitRevision"], ["content"])) return { ok: false, error: "INVALID_INPUT", status: 400 };
        const content = body.content === undefined ? undefined : readSessionText(body.content);
        if (
            !isWireId(body.runId, 256)
            || !isNonNegativeInteger(body.commitRevision)
            || ("content" in body && content === undefined)
        ) return { ok: false, error: "INVALID_INPUT", status: 400 };
        return {
            ok: true,
            command: {
                kind,
                inputId: body.inputId,
                runId: body.runId,
                commitRevision: body.commitRevision,
                ...(content === undefined ? {} : { content }),
            },
        };
    }

    if (kind === "queue_control") {
        if (!hasExactKeys(body, ["kind", "inputId", "action", "queueRevision"])) return { ok: false, error: "INVALID_INPUT", status: 400 };
        const action = body.action;
        if ((action !== "continue" && action !== "clear") || !isNonNegativeInteger(body.queueRevision)) {
            return { ok: false, error: "INVALID_INPUT", status: 400 };
        }
        return { ok: true, command: { kind, inputId: body.inputId, action, queueRevision: body.queueRevision } };
    }

    return { ok: false, error: "INVALID_INPUT", status: 400 };
}

function parseInteractionResponse(value: unknown): BrowserSessionInteractionResponse | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const body = value as Record<string, unknown>;
    const kind = body.kind;
    if (typeof kind !== "string") return undefined;
    if (kind === "cancel_ask_user") {
        return hasExactKeys(body, ["kind"]) ? { kind } : undefined;
    }
    if (kind === "answer_ask_user") {
        if (!hasExactKeys(body, ["kind", "answers"])) return undefined;
        const answers = parseAnswers(body.answers);
        return answers === undefined ? undefined : { kind, answers };
    }
    if (kind === "approve_task") {
        return hasExactKeys(body, ["kind"]) ? { kind } : undefined;
    }
    if (kind === "feedback_task") {
        if (!hasExactKeys(body, ["kind", "feedback"])) return undefined;
        const feedback = readWireText(body.feedback, MAX_COMMAND_TEXT_LENGTH);
        return feedback === undefined ? undefined : { kind, feedback };
    }
    if (kind === "approve_action") {
        if (!hasExactKeys(body, ["kind", "actionId"], ["scope"])) return undefined;
        const actionId = readWireText(body.actionId, 256);
        const scope = body.scope ?? "action";
        return actionId === undefined || (scope !== "action" && scope !== "goal" && scope !== "workspace")
            ? undefined
            : { kind, actionId, scope };
    }
    if (kind === "reject_action") {
        if (!hasExactKeys(body, ["kind", "actionId", "reason"])) return undefined;
        const actionId = readWireText(body.actionId, 256);
        const reason = readWireText(body.reason, MAX_COMMAND_TEXT_LENGTH);
        return actionId === undefined || reason === undefined || reason.trim().length === 0
            ? undefined
            : { kind, actionId, reason };
    }
    return undefined;
}

function isNonNegativeInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function readSessionText(value: unknown): string | undefined {
    // 只校验形状；正文额度由 Runtime 会话所有者判定并返回稳定拒绝码。
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

async function parsePlanModeCommand(
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserGoalPlanModeCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return parsedBody;
    const value = parsedBody.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "invalid_plan_mode_command", status: 400 };
    }
    const body = value as Record<string, unknown>;
    if (Object.keys(body).length !== 1 || typeof body.runId !== "string" || !isWireId(body.runId, 256)) {
        return { ok: false, error: "invalid_plan_mode_command", status: 400 };
    }
    return { ok: true, command: { runId: body.runId } };
}

async function parseGrantRevokeCommand(request: Request): Promise<
    | { readonly ok: true; readonly command: Omit<BrowserToolGrantRevokeCommand, "grantId"> }
    | { readonly ok: false; readonly error: string }
> {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const value = parsed.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "invalid_grant_request" };
    }
    const body = value as Record<string, unknown>;
    const allowedKeys = ["runId", "scope", "kind"];
    for (const key of Object.keys(body)) {
        if (!allowedKeys.includes(key)) return { ok: false, error: "invalid_grant_request" };
    }
    if (!("runId" in body) || !("scope" in body)) return { ok: false, error: "invalid_grant_request" };
    const runId = readWireText(body.runId, 256);
    const scope = body.scope;
    if (runId === undefined || (scope !== "goal" && scope !== "workspace")) {
        return { ok: false, error: "invalid_grant_request" };
    }
    const kind = body.kind;
    if (kind !== undefined && kind !== "tool" && kind !== "sandbox") {
        return { ok: false, error: "invalid_grant_request" };
    }
    return { ok: true, command: { runId, scope, ...(kind !== undefined ? { kind } : {}) } };
}

async function parsePermissionModeCommand(request: Request): Promise<
    | { readonly ok: true; readonly command: BrowserPermissionModeCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed;
    const value = parsed.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "invalid_permission_mode_request", status: 400 };
    }
    const body = value as Record<string, unknown>;
    if (!hasExactKeys(body, ["mode", "expectedRevision"])) {
        return { ok: false, error: "invalid_permission_mode_request", status: 400 };
    }
    const mode = body.mode;
    const expectedRevision = body.expectedRevision;
    if (
        (mode !== "default" && mode !== "yolo")
        || typeof expectedRevision !== "number"
        || !Number.isSafeInteger(expectedRevision)
        || expectedRevision < 0
    ) {
        return { ok: false, error: "invalid_permission_mode_request", status: 400 };
    }
    return { ok: true, command: { mode, expectedRevision } };
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

function parseAnswers(
    value: unknown,
): { readonly questionId: string; readonly optionIds: readonly string[]; readonly otherText?: string }[] | undefined {
    if (!Array.isArray(value) || value.length === 0 || value.length > 3) return undefined;
    type Answer = { readonly questionId: string; readonly optionIds: readonly string[]; readonly otherText?: string };
    const answers: Answer[] = [];
    for (const candidate of value) {
        if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return undefined;
        const answer = candidate as Record<string, unknown>;
        if (
            !hasExactKeys(answer, ["questionId", "optionIds"], ["otherText"])
            || typeof answer.optionIds !== "object"
            || !Array.isArray(answer.optionIds)
            || answer.optionIds.length > 3
        ) return undefined;
        const questionId = readWireText(answer.questionId, 256);
        const optionIds = answer.optionIds.map((id) => readWireText(id, 256));
        const otherText = answer.otherText === undefined
            ? undefined
            : readWireText(answer.otherText, MAX_COMMAND_TEXT_LENGTH);
        if (
            questionId === undefined
            || optionIds.some((id) => id === undefined)
            || (answer.otherText !== undefined && otherText === undefined)
        ) return undefined;
        answers.push({
            questionId,
            optionIds: optionIds as string[],
            ...(otherText === undefined ? {} : { otherText }),
        });
    }
    return answers;
}

function hasExactKeys(
    value: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[] = [],
): boolean {
    const keys = Object.keys(value);
    return required.every((key) => Object.hasOwn(value, key))
        && keys.every((key) => required.includes(key) || optional.includes(key));
}

function readWireText(value: unknown, maximumLength: number): string | undefined {
    return typeof value === "string"
        && value.trim().length > 0
        && value.length <= maximumLength
        ? value
        : undefined;
}

function isWireId(value: unknown, maximumLength: number): value is string {
    return typeof value === "string"
        && value.length > 0
        && value.length <= maximumLength
        && /^[A-Za-z0-9_-]+$/.test(value);
}

function createEventStreamResponse(
    feed: BrowserGoalLiveFeed,
): Response {
    const encoder = new TextEncoder();
    const iterator = feed.events[Symbol.asyncIterator]();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const next = await iterator.next();
                if (next.done) {
                    if (!cancelled) controller.close();
                    feed.close();
                    return;
                }
                controller.enqueue(encoder.encode(`event: update\ndata: ${JSON.stringify(next.value)}\n\n`));
            } catch {
                if (!cancelled) controller.error(new Error("browser event stream failed"));
                feed.close();
            }
        },
        cancel() {
            cancelled = true;
            feed.close();
        },
    });
    return new Response(body, {
        headers: {
            "cache-control": "no-cache, no-transform",
            "content-type": "text/event-stream; charset=utf-8",
            "x-accel-buffering": "no",
        },
    });
}

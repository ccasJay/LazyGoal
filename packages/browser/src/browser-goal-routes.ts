import { Hono } from "hono";

import type { BrowserGoalListItem, BrowserGoalSession } from "./browser-projection";
import type { BrowserModelCatalogReadResult } from "./browser-model-catalog";
import type {
    BrowserCreateGoalCommand,
    BrowserCreateGoalResult,
    BrowserGoalInteractionCommand,
    BrowserGoalInteractionResult,
    BrowserGoalMessageCommand,
    BrowserGoalMessageResult,
    BrowserGoalPlanModeCommand,
    BrowserGoalPlanModeResult,
    BrowserModelSelectionCommand,
    BrowserModelSelectionResult,
    BrowserActionDetailsResult,
    BrowserToolGrantResult,
    BrowserToolGrantRevokeCommand,
    BrowserPermissionModeCommand,
    BrowserPermissionModeResult,
    BrowserResumeGoalCommand,
    BrowserResumeGoalResult,
} from "./browser-goal-command-service";
import type {
    BrowserGoalLiveFeed,
    BrowserGoalStreamOpenResult,
} from "./browser-goal-stream";

const MAX_COMMAND_BODY_BYTES = 16 * 1024;
const MAX_GOAL_ID_LENGTH = 128;
const MAX_COMMAND_TEXT_LENGTH = 4_000;

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
 *     create: async () => ({ ok: false, error: "goal_create_failed" }),
 *     interact: async () => ({ ok: false, error: "interaction_failed" }),
 *     message: async () => ({ ok: false, error: "message_failed" }),
 *     enterPlanMode: async () => ({ ok: false, error: "plan_mode_failed" }),
 *     models: async () => ({ ok: false, error: "model_catalog_unavailable" }),
 *     setModelPreference: async () => ({ ok: false, error: "model_catalog_unavailable" }),
 *     selectModel: async () => ({ ok: false, error: "model_selection_failed" }),
 *     openStream: async () => ({ ok: false, error: "goal_not_found" }),
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
     * 设置终态 Goal 的归档状态；不改变 Snapshot 或 Run 历史。
     * @param goalId - 正式工作区 Goal 身份。
     * @param archived - true 移入归档视图，false 恢复默认看板。
     * @returns 成功或缺失、非终态拒绝码。
     */
    setArchived?(goalId: string, archived: boolean): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: "goal_not_found" | "goal_not_terminal" }>;
    /**
     * 删除终态 Goal 的本地记录；清理失败时保留快照供重试。
     * @param goalId - 正式工作区 Goal 身份。
     * @returns 成功或缺失、非终态拒绝码。
     */
    deleteGoal?(goalId: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: "goal_not_found" | "goal_not_terminal" }>;
    /**
     * 读取一个 Goal 的最新已提交会话。
     *
     * @param goalId - Goal 的稳定标识。
     * @returns 安全投影；Goal 不存在时返回 `undefined`。
     * @throws Snapshot 或 Trajectory 损坏、底层读取失败时拒绝。
     */
    read(goalId: string): Promise<BrowserGoalSession | undefined>;
    /**
     * 受理一个已通过 wire 校验的 Goal 创建。
     *
     * @param command - 稳定 Goal ID 与非空原始意图；Profile 和执行策略由本机决定。
     * @returns 已保存快照后的受理结果或稳定拒绝码。
     * @throws 正式工作区读取失败时拒绝。
     */
    create(command: BrowserCreateGoalCommand): Promise<BrowserCreateGoalResult>;
    /**
     * 受理一个与最新 Snapshot 等待点匹配的结构化操作。
     *
     * @param goalId - URL 路径中的 Goal 身份。
     * @param command - 带 Run、请求或动作身份的已验证操作。
     * @returns 操作更新成功保存后的受理结果或稳定拒绝码。
     * @throws Snapshot 读取失败时拒绝。
     */
    interact(goalId: string, command: BrowserGoalInteractionCommand): Promise<BrowserGoalInteractionResult>;
    /**
     * 按当前 Run 状态恢复普通等待或创建后续 Run。
     *
     * @param goalId - URL 路径中的 Goal 身份。
     * @param command - 当前 Run 身份与普通文本。
     * @returns 用户消息及对应 Run 变更保存后的受理结果。
     * @throws Snapshot 读取失败时拒绝。
     */
    message(goalId: string, command: BrowserGoalMessageCommand): Promise<BrowserGoalMessageResult>;
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
     * 显式推进中断的未终态 Run。
     *
     * @param goalId - URL 路径中的 Goal 身份。
     * @param command - 目标 Run 标识与页面读取的已提交序列号边界。
     * @returns 新快照保存确认后的受理结果或稳定拒绝码。
     * @throws Snapshot 读取失败时拒绝。
     */
    resume?(goalId: string, command: BrowserResumeGoalCommand): Promise<BrowserResumeGoalResult>;
    /**
     * 读取草稿默认模型或指定 Goal 当前 Run 的模型目录。
     *
     * @param target - 省略时读取草稿目录；指定时必须匹配最新 Goal/Run。
     * @param signal - 浏览器断开时取消在线目录请求。
     * @returns 白名单目录或稳定失败分类，不返回凭据或 Provider 原始响应。
     */
    models(target?: { readonly goalId: string; readonly runId: string }, signal?: AbortSignal): Promise<BrowserModelCatalogReadResult>;
    /**
     * 验证并保存当前工作区新 Goal 的默认模型身份。
     *
     * @param modelId - 当前 Provider 中须可选择的模型 ID。
     * @returns 持久化成功或稳定失败；文件写入失败不得报告成功。
     */
    setModelPreference(modelId: string): Promise<
        { readonly ok: true; readonly modelId: string }
        | { readonly ok: false; readonly error: "model_not_selectable" | "model_catalog_unavailable" | "model_preference_unavailable" }
    >;
    /** 保存由服务端重新验证的当前 Run 模型选择。 */
    selectModel(goalId: string, command: BrowserModelSelectionCommand): Promise<BrowserModelSelectionResult>;
    /**
     * 打开精确绑定到最新 Goal/Run 的实时进展流。
     *
     * @param goalId - URL 路径中的 Goal 身份。
     * @param runId - 查询中的当前 Run 身份。
     * @param signal - HTTP 请求断开时结束订阅的取消信号。
     * @returns 安全事件流或 Goal/Run 稳定拒绝码。
     * @throws 正式 Snapshot 读取失败时拒绝。
     */
    openStream(goalId: string, runId: string, signal?: AbortSignal): Promise<BrowserGoalStreamOpenResult>;
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
     * @returns 成功切换后的权限事实；冲突或不可用时返回稳定错误。
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
        if (new URL(context.req.url).searchParams.size !== 0) {
            return context.json({ error: "invalid_model_catalog_request" }, 400);
        }
        try {
            const result = await source.models(undefined, context.req.raw.signal);
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
        const runId = runIds[0];
        if (
            !isWireId(goalId, MAX_GOAL_ID_LENGTH)
            || query.size !== 1
            || runIds.length !== 1
            || runId === undefined
            || !isWireId(runId, 256)
        ) {
            return context.json({ error: "invalid_model_catalog_request" }, 400);
        }
        try {
            const result = await source.models({ goalId, runId }, context.req.raw.signal);
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
        if (Object.keys(fields).length !== 1 || modelId === undefined) {
            return context.json({ error: "invalid_model_preference" }, 400);
        }
        try {
            const result = await source.setModelPreference(modelId);
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
        if (
            Object.keys(fields).length !== 2
            || !isWireId(fields.runId, 256)
            || modelId === undefined
        ) return context.json({ error: "invalid_model_selection" }, 400);
        try {
            const result = await source.selectModel(goalId, {
                runId: fields.runId,
                modelId,
            });
            if (result.ok) return context.json(result);
            const status = result.error === "goal_not_found" ? 404
                : result.error === "model_catalog_unavailable" || result.error === "model_selection_failed" ? 503
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
                : context.json({ error: result.error }, result.error === "goal_not_found" ? 404 : 409);
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
                : context.json({ error: result.error }, result.error === "goal_not_found" ? 404 : 409);
        } catch {
            return context.json({ error: "goal_delete_failed" }, 500);
        }
    });

    routes.get("/api/goals/:goalId", async (context) => {
        try {
            const goal = await source.read(context.req.param("goalId"));
            if (goal === undefined) {
                return context.json({ error: "goal_not_found" }, 404);
            }
            return context.json({ goal });
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
            const status = result.error === "conflict" ? 409 : 500;
            return context.json(result, status);
        } catch {
            return context.json({ error: "permissions_unavailable" }, 500);
        }
    });

    routes.post("/api/goals", async (context) => {
        const parsed = await parseCreateCommand(context.req.raw);
        if (!parsed.ok) {
            return context.json({ error: parsed.error }, parsed.status);
        }
        try {
            const result = await source.create(parsed.command);
            if (result.ok) {
                return context.json({
                    goalId: result.goalId,
                    runId: result.runId,
                    existing: result.existing,
                }, result.existing ? 200 : 202);
            }
            const status = result.error === "goal_create_failed" ? 500
                : result.error === "model_catalog_unavailable" ? 503
                : result.error === "goal_busy" || result.error === "goal_id_conflict" ? 409
                    : 400;
            return context.json({ error: result.error }, status);
        } catch {
            return context.json({ error: "goal_create_failed" }, 500);
        }
    });

    routes.post("/api/goals/:goalId/interactions", async (context) => {
        const parsed = await parseInteractionCommand(
            context.req.param("goalId"),
            context.req.raw,
        );
        if (!parsed.ok) {
            return context.json({ error: parsed.error }, parsed.status);
        }
        try {
            const result = await source.interact(context.req.param("goalId"), parsed.command);
            if (result.ok) {
                return context.json({
                    goalId: result.goalId,
                    runId: result.runId,
                    existing: result.existing,
                }, result.existing ? 200 : 202);
            }
            return context.json({ error: result.error, refresh: true }, interactionErrorStatus(result.error));
        } catch {
            return context.json({ error: "interaction_failed" }, 500);
        }
    });

    routes.post("/api/goals/:goalId/messages", async (context) => {
        const parsed = await parseMessageCommand(
            context.req.param("goalId"),
            context.req.raw,
        );
        if (!parsed.ok) {
            return context.json({ error: parsed.error }, parsed.status);
        }
        try {
            const result = await source.message(context.req.param("goalId"), parsed.command);
            if (result.ok) {
                return context.json({
                    goalId: result.goalId,
                    runId: result.runId,
                    existing: result.existing,
                }, result.existing ? 200 : 202);
            }
            return context.json({ error: result.error, refresh: true }, messageErrorStatus(result.error));
        } catch {
            return context.json({ error: "message_failed" }, 500);
        }
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
                    : 409;
            return context.json({ error: result.error, refresh: true }, status);
        } catch {
            return context.json({ error: "plan_mode_failed" }, 500);
        }
    });

    routes.post("/api/goals/:goalId/resume", async (context) => {
        const goalId = context.req.param("goalId");
        if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) {
            return context.json({ error: "invalid_resume_command" }, 400);
        }
        const parsed = await parseResumeCommand(context.req.raw);
        if (!parsed.ok) {
            return context.json({ error: parsed.error }, parsed.status);
        }
        if (source.resume === undefined) {
            return context.json({ error: "resume_failed" }, 500);
        }
        try {
            const result = await source.resume(goalId, parsed.command);
            if (result.ok) {
                return context.json({
                    goalId: result.goalId,
                    runId: result.runId,
                    existing: result.existing,
                }, result.existing ? 200 : 202);
            }
            const status = resumeErrorStatus(result.error);
            return context.json({ error: result.error, refresh: true }, status);
        } catch {
            return context.json({ error: "resume_failed" }, 500);
        }
    });

    routes.get("/api/goals/:goalId/events", async (context) => {
        const goalId = context.req.param("goalId");
        const query = new URL(context.req.url).searchParams;
        const runIds = query.getAll("runId");
        const runId = runIds[0];
        if (
            !isWireId(goalId, MAX_GOAL_ID_LENGTH)
            || query.size !== 1
            || runIds.length !== 1
            || runId === undefined
            || !isWireId(runId, 256)
        ) {
            return context.json({ error: "invalid_stream_identity" }, 400);
        }
        let opened: BrowserGoalStreamOpenResult;
        try {
            opened = await source.openStream(goalId, runId, context.req.raw.signal);
        } catch {
            return context.json({ error: "stream_unavailable" }, 500);
        }
        if (!opened.ok) {
            const status = opened.error === "goal_not_found" ? 404 : 409;
            return context.json({ error: opened.error, refresh: true }, status);
        }
        return createEventStreamResponse(opened.feed);
    });

    return routes;
}

function modelCatalogErrorStatus(error: Exclude<BrowserModelCatalogReadResult, { readonly ok: true }>["error"]): 404 | 409 | 502 | 503 {
    if (error === "goal_not_found") return 404;
    if (error === "stale_run") return 409;
    if (error === "model_catalog_unavailable") return 503;
    return 502;
}

async function parseCreateCommand(
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserCreateGoalCommand }
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
        Object.keys(body).some((key) => key !== "goalId" && key !== "intent" && key !== "mode" && key !== "modelId")
        || typeof body.goalId !== "string"
        || body.goalId.length === 0
        || body.goalId.length > MAX_GOAL_ID_LENGTH
        || !/^[A-Za-z0-9_-]+$/.test(body.goalId)
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
            intent: body.intent,
            ...(body.mode === undefined ? {} : { mode: body.mode }),
            ...(body.modelId === undefined ? {} : { modelId: body.modelId as string }),
        },
    };
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

async function parseResumeCommand(
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserResumeGoalCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return parsedBody;
    const value = parsedBody.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "invalid_resume_command", status: 400 };
    }
    const body = value as Record<string, unknown>;
    if (
        Object.keys(body).length !== 2
        || typeof body.runId !== "string"
        || !isWireId(body.runId, 256)
        || typeof body.expectedCommittedThroughSequence !== "number"
        || !Number.isSafeInteger(body.expectedCommittedThroughSequence)
        || body.expectedCommittedThroughSequence < 0
    ) {
        return { ok: false, error: "invalid_resume_command", status: 400 };
    }
    return {
        ok: true,
        command: {
            runId: body.runId,
            expectedCommittedThroughSequence: body.expectedCommittedThroughSequence,
        },
    };
}

async function parseInteractionCommand(
    goalId: string,
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserGoalInteractionCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) {
        return { ok: false, error: "invalid_interaction", status: 400 };
    }
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return parsedBody;
    const value = parsedBody.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "invalid_interaction", status: 400 };
    }
    const body = value as Record<string, unknown>;
    const runId = readWireText(body.runId, 256);
    const kind = body.kind;
    if (runId === undefined || typeof kind !== "string") {
        return { ok: false, error: "invalid_interaction", status: 400 };
    }

    if (kind === "answer_ask_user") {
        if (!hasExactKeys(body, ["kind", "runId", "requestId", "answers"])) {
            return { ok: false, error: "invalid_interaction", status: 400 };
        }
        const requestId = readWireText(body.requestId, 256);
        const answers = parseAnswers(body.answers);
        if (requestId === undefined || answers === undefined) {
            return { ok: false, error: "invalid_interaction", status: 400 };
        }
        return { ok: true, command: { kind, runId, requestId, answers } };
    }

    if (kind === "approve_task") {
        if (!hasExactKeys(body, ["kind", "runId", "requestId"])) {
            return { ok: false, error: "invalid_interaction", status: 400 };
        }
        const requestId = readWireText(body.requestId, 256);
        return requestId === undefined
            ? { ok: false, error: "invalid_interaction", status: 400 }
            : { ok: true, command: { kind, runId, requestId } };
    }

    if (kind === "feedback_task") {
        if (!hasExactKeys(body, ["kind", "runId", "requestId", "feedback"])) {
            return { ok: false, error: "invalid_interaction", status: 400 };
        }
        const requestId = readWireText(body.requestId, 256);
        const feedback = readWireText(body.feedback, MAX_COMMAND_TEXT_LENGTH);
        return requestId === undefined || feedback === undefined || feedback.trim().length === 0
            ? { ok: false, error: "invalid_interaction", status: 400 }
            : { ok: true, command: { kind, runId, requestId, feedback } };
    }

    if (kind === "approve_action") {
        if (!hasExactKeys(body, ["kind", "runId", "actionId"], ["scope"])) {
            return { ok: false, error: "invalid_interaction", status: 400 };
        }
        const actionId = readWireText(body.actionId, 256);
        const scope = body.scope ?? "action";
        return actionId === undefined
            || (scope !== "action" && scope !== "goal" && scope !== "workspace")
            ? { ok: false, error: "invalid_interaction", status: 400 }
            : { ok: true, command: { kind, runId, actionId, scope } };
    }

    if (kind === "reject_action") {
        if (!hasExactKeys(body, ["kind", "runId", "actionId", "reason"])) {
            return { ok: false, error: "invalid_interaction", status: 400 };
        }
        const actionId = readWireText(body.actionId, 256);
        const reason = readWireText(body.reason, MAX_COMMAND_TEXT_LENGTH);
        return actionId === undefined || reason === undefined || reason.trim().length === 0
            ? { ok: false, error: "invalid_interaction", status: 400 }
            : { ok: true, command: { kind, runId, actionId, reason } };
    }

    return { ok: false, error: "invalid_interaction", status: 400 };
}

async function parseMessageCommand(
    goalId: string,
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserGoalMessageCommand }
    | { readonly ok: false; readonly error: string; readonly status: 400 | 413 | 415 }
> {
    if (!isWireId(goalId, MAX_GOAL_ID_LENGTH)) {
        return { ok: false, error: "invalid_message", status: 400 };
    }
    const parsedBody = await readJsonBody(request);
    if (!parsedBody.ok) return parsedBody;
    const value = parsedBody.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "invalid_message", status: 400 };
    }
    const body = value as Record<string, unknown>;
    if (!hasExactKeys(body, ["runId", "content"])) {
        return { ok: false, error: "invalid_message", status: 400 };
    }
    const runId = readWireText(body.runId, 256);
    const content = readWireText(body.content, MAX_COMMAND_TEXT_LENGTH);
    if (runId === undefined || content === undefined) {
        return { ok: false, error: "invalid_message", status: 400 };
    }
    return { ok: true, command: { runId, content } };
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
        if (Number(contentLength) > MAX_COMMAND_BODY_BYTES) {
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
            if (totalBytes > MAX_COMMAND_BODY_BYTES) {
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

function parseAnswers(
    value: unknown,
): Extract<BrowserGoalInteractionCommand, { readonly kind: "answer_ask_user" }>["answers"] | undefined {
    if (!Array.isArray(value) || value.length === 0 || value.length > 3) return undefined;
    type Answer = Extract<BrowserGoalInteractionCommand, { readonly kind: "answer_ask_user" }>["answers"][number];
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

function interactionErrorStatus(
    error: Extract<BrowserGoalInteractionResult, { readonly ok: false }>["error"],
): 400 | 404 | 409 | 500 | 503 {
    if (error === "goal_not_found") return 404;
    if (error === "goal_busy" || error === "stale_run" || error === "goal_not_waiting"
        || error === "stale_request" || error === "action_not_waiting") return 409;
    if (error === "interaction_failed") return 500;
    if (error === "model_restore_failed") return 503;
    return 400;
}

function messageErrorStatus(
    error: Extract<BrowserGoalMessageResult, { readonly ok: false }>["error"],
): 400 | 404 | 409 | 500 | 503 {
    if (error === "goal_not_found") return 404;
    if (error === "goal_busy" || error === "stale_run" || error === "goal_not_waiting"
        || error === "goal_not_completed" || error === "structured_interaction_required"
        || error === "message_conflict") return 409;
    if (error === "message_failed") return 500;
    if (error === "model_restore_failed") return 503;
    return 400;
}

function resumeErrorStatus(
    error: Extract<BrowserResumeGoalResult, { readonly ok: false }>["error"],
): 400 | 404 | 409 | 500 | 503 {
    if (error === "goal_not_found") return 404;
    if (error === "stale_run" || error === "stale_recovery" || error === "goal_busy" || error === "resume_not_allowed") return 409;
    if (error === "model_restore_failed" || error === "service_shutting_down") return 503;
    return 500;
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

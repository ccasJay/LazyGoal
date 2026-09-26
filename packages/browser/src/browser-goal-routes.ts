import { Hono } from "hono";

import type { BrowserGoalListItem, BrowserGoalSession } from "./browser-projection";
import type {
    BrowserCreateGoalCommand,
    BrowserCreateGoalResult,
} from "./browser-goal-command-service";

const MAX_CREATE_BODY_BYTES = 16 * 1024;
const MAX_GOAL_ID_LENGTH = 128;
const MAX_INTENT_LENGTH = 4_000;

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
}

/**
 * 创建同源只读 Goal 列表与会话详情 API。
 *
 * @param source - 返回经过白名单投影的正式工作区数据并使用 Runtime Launcher 的端口。
 * @returns 提供 `GET /api/goals`、`GET /api/goals/:goalId` 和 `POST /api/goals` 的 Hono 应用。
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

    routes.get("/api/goals", async (context) => {
        try {
            return context.json({ goals: await source.list() });
        } catch {
            return context.json({ error: "goal_list_unavailable" }, 500);
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
                : result.error === "goal_busy" || result.error === "goal_id_conflict" ? 409
                    : 400;
            return context.json({ error: result.error }, status);
        } catch {
            return context.json({ error: "goal_create_failed" }, 500);
        }
    });

    return routes;
}

async function parseCreateCommand(
    request: Request,
): Promise<
    | { readonly ok: true; readonly command: BrowserCreateGoalCommand }
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
        if (Number(contentLength) > MAX_CREATE_BODY_BYTES) {
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
            if (totalBytes > MAX_CREATE_BODY_BYTES) {
                await reader.cancel();
                return { ok: false, error: "request_too_large", status: 413 };
            }
            bodyText += decoder.decode(chunk.value, { stream: true });
        }
        bodyText += decoder.decode();
    } catch {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }

    let value: unknown;
    try {
        value = JSON.parse(bodyText);
    } catch {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }

    const body = value as Record<string, unknown>;
    if (
        Object.keys(body).some((key) => key !== "goalId" && key !== "intent")
        || typeof body.goalId !== "string"
        || body.goalId.length === 0
        || body.goalId.length > MAX_GOAL_ID_LENGTH
        || !/^[A-Za-z0-9_-]+$/.test(body.goalId)
        || typeof body.intent !== "string"
        || body.intent.trim().length === 0
        || body.intent.length > MAX_INTENT_LENGTH
    ) {
        return { ok: false, error: "invalid_goal_input", status: 400 };
    }

    return { ok: true, command: { goalId: body.goalId, intent: body.intent } };
}

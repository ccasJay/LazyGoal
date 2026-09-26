import { Hono } from "hono";

import type { BrowserGoalListItem, BrowserGoalSession } from "./browser-projection";

/**
 * 浏览器 Goal 读取路由使用的白名单数据边界。
 *
 * @remarks
 * 实现方负责从正式工作区 Catalog、Snapshot 与提交边界内 Trajectory 生成 DTO。
 * 路由不接收或序列化完整 Runtime 对象；底层损坏或读取失败统一转换为稳定错误码。
 *
 * @example
 * ```ts
 * const source: BrowserGoalReadPort = {
 *     list: async () => [],
 *     read: async () => undefined,
 * };
 * ```
 */
export interface BrowserGoalReadPort {
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
}

/**
 * 创建同源只读 Goal 列表与会话详情 API。
 *
 * @param source - 仅返回经过白名单投影的正式工作区数据端口。
 * @returns 提供 `GET /api/goals` 与 `GET /api/goals/:goalId` 的 Hono 应用。
 * @remarks
 * 缺失 Goal 返回 404；Catalog、Snapshot 或 Trajectory 损坏统一返回 500 与稳定错误码，
 * 不回传存储错误文本，也不保留浏览器旧状态。外层 BrowserSessionAccess 中间件负责授权。
 * @example
 * ```ts
 * httpService.mount("/", createBrowserGoalRoutes(readPort));
 * ```
 */
export function createBrowserGoalRoutes(source: BrowserGoalReadPort): Hono {
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

    return routes;
}

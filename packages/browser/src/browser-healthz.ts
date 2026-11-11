import { Hono } from "hono";

import type { HealthzResponse } from "../../web-contracts/src/index";

const HEALTHZ_RESPONSE: HealthzResponse = { status: "ok" };

/**
 * 创建 Goal Server 的轻量存活探针路由。
 *
 * @remarks
 * `GET /healthz` 只报告 HTTP 服务可响应，不暴露 Provider、凭据、workspace、Goal、存储或诊断信息。
 * 访问控制由宿主中间件执行；免 bearer token 的范围由浏览器访问策略限定为该精确 GET 路径。
 *
 * @returns 只包含 `GET /healthz` 的 Hono 子应用。
 * @example
 * ```ts
 * httpService.mount("/", createHealthzRoutes());
 * ```
 */
export function createHealthzRoutes(): Hono {
    return new Hono().get("/healthz", (context) => context.json(HEALTHZ_RESPONSE));
}

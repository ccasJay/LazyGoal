import { Hono } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";

import { SessionMetricsService, type SessionMetricsWatchEvent } from "./session-metrics-service";

const SLOW_CLIENT_WRITE_TIMEOUT_MS = 5_000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * 创建会话指标只读 JSON 与 SSE 路由。
 *
 * @remarks
 * 返回的 Hono 子应用可挂载到通用本机 HTTP 服务。路由只接受 GET、校验回环
 * Host 与同源 Origin，不添加 CORS 允许头；SSE 客户端断开或写入超过时限时
 * 取消订阅。
 *
 * @param service - 负责快照读取与更新订阅的会话指标服务。
 * @returns 可交给 `HttpService.mount()` 的 Hono 路由子应用。
 * @example
 * ```ts
 * const routes = createSessionMetricsRoutes(metricsService);
 * httpService.mount("/", routes);
 * ```
 */
export function createSessionMetricsRoutes(service: SessionMetricsService): Hono {
    const routes = new Hono();

    routes.use("/goals/*", async (context, next) => {
        const host = context.req.header("host");
        if (host === undefined || !isLoopbackHost(host)) {
            return context.json({ error: "invalid_host" }, 400);
        }

        const origin = context.req.header("origin");
        if (origin !== undefined && !isSameOrigin(origin, host)) {
            return context.json({ error: "cross_origin_denied" }, 403);
        }
        await next();
    });

    routes.on(["POST", "PUT", "PATCH", "DELETE"], "/goals/*", (context) =>
        context.json({ error: "method_not_allowed" }, 405, { allow: "GET" }),
    );

    routes.get("/goals/:goalId/metrics", async (context) => {
        try {
            const snapshot = await service.read(context.req.param("goalId"));
            if (snapshot === undefined) return context.json({ error: "goal_not_found" }, 404);
            return context.json(snapshot);
        } catch {
            return context.json({ error: "metrics_unavailable" }, 503);
        }
    });

    routes.get("/goals/:goalId/metrics/stream", async (context) => {
        const goalId = context.req.param("goalId");
        try {
            const snapshot = await service.read(goalId);
            if (snapshot === undefined) return context.json({ error: "goal_not_found" }, 404);
        } catch {
            return context.json({ error: "metrics_unavailable" }, 503);
        }

        return streamSSE(context, async (stream) => {
            const controller = new AbortController();
            const requestSignal = context.req.raw.signal;
            const abortSubscription = () => controller.abort();
            requestSignal.addEventListener("abort", abortSubscription, { once: true });
            stream.onAbort(abortSubscription);
            const updates = service.watch(goalId, controller.signal)[Symbol.asyncIterator]();

            try {
                while (!stream.aborted && !controller.signal.aborted) {
                    const next = await updates.next();
                    if (next.done) break;
                    if (!await writeEvent(stream, toSseEvent(next.value), controller)) break;
                    if (next.value.kind === "error") break;
                }
            } catch {
                controller.abort();
                await stream.close().catch(() => undefined);
            } finally {
                controller.abort();
                requestSignal.removeEventListener("abort", abortSubscription);
                await updates.return?.(undefined);
            }
        });
    });

    return routes;
}

function toSseEvent(event: SessionMetricsWatchEvent): { readonly event: string; readonly data: string } {
    return event.kind === "snapshot"
        ? { event: "snapshot", data: JSON.stringify(event.snapshot) }
        : { event: "error", data: JSON.stringify({ error: "metrics_unavailable" }) };
}

async function writeEvent(
    stream: SSEStreamingApi,
    event: { readonly event: string; readonly data: string },
    controller: AbortController,
): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let removeAbortListener: (() => void) | undefined;
    const write = stream.writeSSE(event).then(() => true);
    const deadline = new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), SLOW_CLIENT_WRITE_TIMEOUT_MS);
    });
    const aborted = new Promise<false>((resolve) => {
        const onAbort = () => resolve(false);
        removeAbortListener = () => controller.signal.removeEventListener("abort", onAbort);
        controller.signal.addEventListener("abort", onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
    });
    try {
        const written = await Promise.race([write, deadline, aborted]);
        if (!written) {
            controller.abort();
            await stream.close().catch(() => undefined);
        }
        return written;
    } finally {
        if (timeout !== undefined) clearTimeout(timeout);
        removeAbortListener?.();
    }
}

function isLoopbackHost(host: string): boolean {
    try {
        const parsed = new URL(`http://${host}`);
        return parsed.username.length === 0
            && parsed.password.length === 0
            && parsed.search.length === 0
            && parsed.pathname === "/"
            && LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
    } catch {
        return false;
    }
}

function isSameOrigin(origin: string, host: string): boolean {
    try {
        const parsed = new URL(origin);
        return parsed.protocol === "http:"
            && parsed.username.length === 0
            && parsed.password.length === 0
            && parsed.host.toLowerCase() === host.toLowerCase();
    } catch {
        return false;
    }
}

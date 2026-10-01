import { createHash } from "node:crypto";
import { Hono } from "hono";
import type { GoalStore, ModelInputRecord, ModelInputMessage } from "../../runtime/src/index";

/**
 * 调用前保存的输入摘要；消息只预览新增正文，不证明供应商已接收请求。
 * @remarks systemVersion 为内容哈希；首次记录或实际文本变化才产生 System 行。
 * @example
 * ```ts
 * console.log(call.callId, call.systemVersion, call.messages);
 * ```
 */
export interface BrowserModelInputSummary extends Omit<ModelInputRecord, "messages"> {
    readonly systemVersion: string;
    readonly systemChanged: boolean;
    readonly firstSystem: boolean;
    readonly previousCallId: string | null;
    readonly messages: readonly { role: ModelInputMessage["role"]; source: ModelInputMessage["source"]; index: number; preview: string; truncated: boolean }[];
    readonly omittedMessageCount: number;
}

/**
 * 一次调用的完整输入与同一 Run 前次调用的系统正文，用于只读对比。
 * @remarks 不截断正文；超过 2 MiB 的详情返回 413，不以预览代替完整输入。
 * @example
 * ```ts
 * const system = detail.call.messages.filter(message => message.role === "system");
 * ```
 */
export interface BrowserModelInputDetail {
    readonly call: ModelInputRecord;
    readonly previousSystem: string | null;
    readonly previousCallId: string | null;
    readonly systemVersion: string;
}

const system = (call: ModelInputRecord) => call.messages.filter(message => message.role === "system").map(message => message.content).join("\n");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const messageKey = (message: ModelInputMessage) => JSON.stringify([message.role, message.source, message.content]);
const validId = (value: string | null) => value !== null && /^[A-Za-z0-9_-]{1,256}$/.test(value);

/**
 * 挂载完整模型输入的只读查询；调用方必须复用 BrowserSessionAccess 外层保护。
 * @param store - 正式工作区 Goal Store，仅用于验证 Goal/Run 身份。
 * @param read - 正式工作区输入读取端口，不读取 Benchmark 聚合数据。
 * @returns 调用分页与详情路由；存储异常转换为稳定 500，不暴露路径。
 * @remarks 当前读取仍遍历整个 Run；列表每页最多 100 调用、每调用 10 条新增消息预览。
 * @example
 * ```ts
 * host.mount("/", createBrowserModelInputRoutes(store, read));
 * ```
 */
export function createBrowserModelInputRoutes(store: Pick<GoalStore, "restore">, read: (goalId: string, runId: string) => Promise<readonly ModelInputRecord[]>): Hono {
    const routes = new Hono();
    routes.get("/api/goals/:goalId/model-inputs", async context => {
        const params = new URL(context.req.url).searchParams;
        const goalId = context.req.param("goalId"), runId = params.get("runId"), callId = params.get("callId");
        const offset = Number(params.get("offset") ?? 0);
        const query = params.get("q") ?? "";
        if (!validId(goalId) || !validId(runId) || callId !== null && !validId(callId)
            || !Number.isSafeInteger(offset) || offset < 0 || params.has("offset") && !/^\d+$/.test(params.get("offset")!)
            || [...params.keys()].some(key => !["runId", "callId", "offset", "q"].includes(key) || params.getAll(key).length !== 1)
            || query.length > 500 || callId !== null && (params.has("offset") || params.has("q"))) return context.json({ error: "invalid_model_input_query" }, 400);
        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            if (goal.state.run.id !== runId && !goal.state.completedRuns?.some(run => run.runId === runId)) return context.json({ error: "run_not_found" }, 404);
            const calls = await read(goalId, runId!);
            if (callId !== null) {
                const index = calls.findIndex(call => call.callId === callId);
                const call = calls[index];
                if (!call) return context.json({ error: "model_input_not_recorded" }, 404);
                const previous = calls[index - 1];
                const detail: BrowserModelInputDetail = { call, previousCallId: previous?.callId ?? null, previousSystem: previous ? system(previous) : null, systemVersion: hash(system(call)) };
                if (Buffer.byteLength(JSON.stringify(detail)) > 2 * 1024 * 1024) return context.json({ error: "model_input_too_large" }, 413);
                return context.json(detail);
            }
            const indices = calls.map((call, index) => ({ call, index })).filter(({ call }) => !query || JSON.stringify(call).toLowerCase().includes(query.toLowerCase()));
            const summaries: BrowserModelInputSummary[] = indices.slice(offset, offset + 100).map(({ call, index }) => {
                const previous = calls[index - 1];
                const old = new Set(previous?.messages.map(messageKey) ?? []);
                const added = call.messages.map((message, index) => ({ ...message, index })).filter(message => message.role !== "system" && !old.has(messageKey(message)));
                const { messages: _, ...identity } = call;
                return { ...identity, systemVersion: hash(system(call)), firstSystem: previous === undefined, systemChanged: previous !== undefined && system(previous) !== system(call), previousCallId: previous?.callId ?? null,
                    messages: added.slice(0, 10).map(message => ({ role: message.role, source: message.source, index: message.index, preview: message.content.slice(0, 700), truncated: message.content.length > 700 })), omittedMessageCount: Math.max(0, added.length - 10) };
            });
            return context.json({ calls: summaries, total: indices.length, nextOffset: offset + 100 < indices.length ? offset + 100 : null });
        } catch { return context.json({ error: "model_input_read_failed" }, 500); }
    });
    return routes;
}

import { Hono } from "hono";
import { projectTrajectoryEvent } from "../../runtime/src/index";
import type { Goal, GoalStore, JsonValue, Observation, TrajectoryEvent, TrajectoryEventCategory, TrajectoryReadQuery, TrajectoryReadResult } from "../../runtime/src/index";

const PAGE_SIZE = 100;
const MAX_DETAIL_BYTES = 256 * 1024;
const categories = ["lifecycle", "decision", "memory", "action", "tool", "observation", "terminal", "commit"];

/**
 * 从 Snapshot 投影的 Run 身份与状态，不携带配置或消息。
 * @example
 * ```ts
 * const run: BrowserTrajectoryRun = { runId: "run-1", status: "running", current: true, committedThroughSequence: 3 };
 * ```
 */
export interface BrowserTrajectoryRun {
    readonly runId: string;
    readonly status: Goal["state"]["run"]["status"];
    readonly current: boolean;
    readonly committedThroughSequence: number;
}

/**
 * 有界事件列表摘要；身份与时间保持原值，正文仅用于预览。
 * @remarks 缺少执行单元或 Step 身份时调用方必须保留在 Run 层级。
 * @example
 * ```ts
 * const event: BrowserTrajectoryEntry = { eventId: "event-1", sequence: 1, occurredAt: "2026-09-30T00:00:00Z", eventType: "run_started", category: "lifecycle", title: "run_started", preview: "", previewTruncated: false };
 * ```
 */
export interface BrowserTrajectoryEntry {
    readonly eventId: string;
    readonly sequence: number;
    readonly occurredAt: string;
    readonly eventType: string;
    readonly category: TrajectoryEventCategory;
    readonly executionUnitId?: string;
    readonly stepIndex?: number;
    readonly actionId?: string;
    readonly title: string;
    readonly preview: string;
    readonly previewTruncated: boolean;
}

/**
 * 覆盖所选 Run 全部已提交事实的查询结果中的一页。
 * @remarks 概览仅覆盖 entries；游标在相同查询下有效，total 是完整查询匹配数。
 * @example
 * ```ts
 * console.log(page.entries.length, page.total, page.nextCursor);
 * ```
 */
export interface BrowserTrajectoryPage {
    readonly goalId: string;
    readonly run: BrowserTrajectoryRun;
    readonly entries: readonly BrowserTrajectoryEntry[];
    readonly total: number;
    readonly committedCount: number;
    readonly previousCursor: number | null;
    readonly nextCursor: number | null;
    readonly locatedSequence: number | null;
}

/**
 * 完整领域事件及同一 Run/Action 内已提交的关联事实。
 * @remarks Raw 不截断；超出读取上限返回 413。result 仅来源于 observation_recorded，
 * 工具结束记录通过 toolFinished 单独返回，不代表观察结果已确认。缺失或异常计时为 null。
 * @example
 * ```ts
 * const raw = JSON.stringify(detail.event, null, 2);
 * ```
 */
export interface BrowserTrajectoryDetail {
    readonly event: TrajectoryEvent;
    readonly input?: JsonValue;
    readonly result?: Observation;
    readonly toolFinished?: Extract<TrajectoryEvent, { eventType: "tool_finished" }>;
    readonly toolStartedAt?: string;
    readonly toolFinishedAt?: string;
    readonly toolDurationMs: number | null;
    readonly observationConfirmed: boolean;
}

/**
 * 挂载正式工作区的只读 Run、轨迹分页与事件详情路由。
 * @param store - 正式工作区 Snapshot 端口，禁止使用 Benchmark 聚合 Store。
 * @param read - 同工作区的 Snapshot 提交边界读取器；路由额外限制到本次读取的边界。
 * @returns 须由 BrowserSessionAccess 保护的 Hono 路由；不修改 Snapshot 或 Trajectory。
 * @remarks 全 Run 搜索仍使用当前 Storage 的整文件读取，响应分页不保证磁盘成本有界。
 * @throws 创建路由不执行 I/O；请求中的存储错误转换为稳定 500 错误。
 * @example
 * ```ts
 * host.mount("/", createBrowserTrajectoryRoutes(root.workspaceGoalStore, root.readWorkspaceTrajectory));
 * ```
 */
export function createBrowserTrajectoryRoutes(
    store: Pick<GoalStore, "restore">,
    read: (query: TrajectoryReadQuery) => Promise<Readonly<TrajectoryReadResult>>,
): Hono {
    const routes = new Hono();
    routes.get("/api/goals/:goalId/trajectory/runs", async (context) => {
        const params = new URL(context.req.url).searchParams;
        if (!validId(context.req.param("goalId")) || !validQuery(params, ["offset"]) || !validNumber(params.get("offset"), true)) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }
        try {
            const goal = await store.restore(context.req.param("goalId"));
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const runs = runList(goal);
            const offset = Number(params.get("offset") ?? 0);
            return context.json({ runs: runs.slice(offset, offset + PAGE_SIZE), nextOffset: offset + PAGE_SIZE < runs.length ? offset + PAGE_SIZE : null });
        } catch { return context.json({ error: "trajectory_read_failed" }, 500); }
    });
    routes.get("/api/goals/:goalId/trajectory", async (context) => {
        const goalId = context.req.param("goalId");
        const params = new URL(context.req.url).searchParams;
        const runId = params.get("runId");
        const query = params.get("q") ?? "";
        const category = params.get("category");
        const unit = params.get("executionUnitId");
        if (!validId(goalId) || !validId(runId) || !validQuery(params, ["runId", "after", "before", "q", "category", "executionUnitId", "fromSequence", "toSequence"])
            || !["after", "before", "fromSequence", "toSequence"].every(key => validNumber(params.get(key), true))
            || params.has("after") && params.has("before") || query.length > 500
            || category !== null && !categories.includes(category) || unit !== null && (!validId(unit) || ["q", "category", "after", "before", "fromSequence", "toSequence"].some(key => params.has(key)))
            || params.has("fromSequence") && params.has("toSequence") && Number(params.get("fromSequence")) > Number(params.get("toSequence"))) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }
        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const run = runList(goal).find(run => run.runId === runId);
            if (!run) return context.json({ error: "run_not_found" }, 404);
            const events = (await read({ goalId, runId })).committed.filter(event => event.sequence <= run.committedThroughSequence);
            if (context.req.raw.signal.aborted) return context.body(null, 408);
            const lower = query.toLowerCase();
            const matched = events.filter(event => (category === null || projectTrajectoryEvent(event).category === category)
                && (lower === "" || `${event.eventType} ${JSON.stringify(event.payload)}`.toLowerCase().includes(lower))
                && (!params.has("fromSequence") || event.sequence >= Number(params.get("fromSequence")))
                && (!params.has("toSequence") || event.sequence <= Number(params.get("toSequence"))));
            const target = unit === null ? undefined : events.find(event => event.executionUnitId === unit);
            if (unit !== null && !target) return context.json({ error: "step_trajectory_unavailable" }, 404);
            let start = 0;
            let pageEnd: number | undefined;
            if (target) start = Math.max(0, matched.findIndex(event => event.eventId === target.eventId));
            else if (params.has("after")) {
                const index = matched.findIndex(event => event.sequence > Number(params.get("after")));
                start = index < 0 ? matched.length : index;
            } else if (params.has("before")) {
                const index = matched.findIndex(event => event.sequence >= Number(params.get("before")));
                const end = index < 0 ? matched.length : index;
                start = Math.max(0, end - PAGE_SIZE);
                pageEnd = end;
            }
            const page = matched.slice(start, pageEnd ?? start + PAGE_SIZE);
            const response: BrowserTrajectoryPage = {
                goalId, run, entries: page.map(summary), total: matched.length, committedCount: events.length,
                previousCursor: start > 0 ? page[0]?.sequence ?? null : null,
                nextCursor: start + page.length < matched.length ? page.at(-1)?.sequence ?? null : null,
                locatedSequence: target?.sequence ?? null,
            };
            return context.json(response);
        } catch { return context.json({ error: "trajectory_read_failed" }, 500); }
    });
    routes.get("/api/goals/:goalId/trajectory/events/:sequence", async (context) => {
        const goalId = context.req.param("goalId");
        const params = new URL(context.req.url).searchParams;
        const runId = params.get("runId");
        const sequence = context.req.param("sequence");
        if (!validId(goalId) || !validId(runId) || !validQuery(params, ["runId"]) || !validNumber(sequence, false) || Number(sequence) < 1) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }
        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const run = runList(goal).find(run => run.runId === runId);
            if (!run) return context.json({ error: "run_not_found" }, 404);
            const events = (await read({ goalId, runId })).committed.filter(event => event.sequence <= run.committedThroughSequence);
            const event = events.find(event => event.sequence === Number(sequence));
            if (!event) return context.json({ error: "event_not_found" }, 404);
            const actionId = actionOf(event);
            const related = actionId === undefined ? [] : events.filter(candidate => actionOf(candidate) === actionId);
            const started = related.find(candidate => candidate.eventType === "tool_started");
            const finished = related.find((candidate): candidate is Extract<TrajectoryEvent, { eventType: "tool_finished" }> => candidate.eventType === "tool_finished");
            const observation = related.find(candidate => candidate.eventType === "observation_recorded");
            const staged = related.find(candidate => candidate.eventType === "action_staged");
            const decision = event.eventType === "decision_received" ? event : related.find(candidate => candidate.eventType === "decision_received");
            const input = started?.eventType === "tool_started" ? started.payload.input
                : staged?.eventType === "action_staged" ? staged.payload.action.input
                    : decision?.eventType === "decision_received" && decision.payload.decision.kind === "tool_call" ? decision.payload.decision.action.input : undefined;
            const duration = started && finished ? Date.parse(finished.occurredAt) - Date.parse(started.occurredAt) : NaN;
            const detail: BrowserTrajectoryDetail = {
                event, ...(input === undefined ? {} : { input }),
                ...(observation?.eventType === "observation_recorded" ? { result: observation.payload.observation } : {}),
                ...(finished === undefined ? {} : { toolFinished: finished, toolFinishedAt: finished.occurredAt }),
                ...(started === undefined ? {} : { toolStartedAt: started.occurredAt }),
                toolDurationMs: Number.isFinite(duration) && duration >= 0 ? duration : null,
                observationConfirmed: observation !== undefined,
            };
            if (Buffer.byteLength(JSON.stringify(detail), "utf8") > MAX_DETAIL_BYTES) return context.json({ error: "trajectory_detail_too_large", maximumBytes: MAX_DETAIL_BYTES }, 413);
            return context.json(detail);
        } catch { return context.json({ error: "trajectory_read_failed" }, 500); }
    });
    return routes;
}

function runList(goal: Goal): BrowserTrajectoryRun[] {
    return [{ runId: goal.state.run.id, status: goal.state.run.status, current: true, committedThroughSequence: goal.state.run.committedThroughSequence ?? 0 },
        ...(goal.state.completedRuns ?? []).slice().reverse().map(run => ({ runId: run.runId, status: run.status, current: false, committedThroughSequence: run.committedThroughSequence ?? 0 }))];
}
function actionOf(event: TrajectoryEvent): string | undefined {
    if (event.actionId !== undefined) return event.actionId;
    if (event.eventType === "action_staged") return event.payload.action.actionId;
    if (event.eventType === "decision_received" && event.payload.decision.kind === "tool_call") return event.payload.decision.action.actionId;
    if ("actionId" in event.payload) return event.payload.actionId;
    return undefined;
}
function summary(event: TrajectoryEvent): BrowserTrajectoryEntry {
    const preview = JSON.stringify(event.payload);
    const actionId = actionOf(event);
    const toolId = "toolId" in event.payload ? event.payload.toolId : event.eventType === "decision_received" && event.payload.decision.kind === "tool_call" ? event.payload.decision.action.toolId : undefined;
    return { eventId: event.eventId, sequence: event.sequence, occurredAt: event.occurredAt, eventType: event.eventType,
        category: projectTrajectoryEvent(event).category, title: toolId === undefined ? event.eventType : `${event.eventType}: ${toolId}`,
        preview: preview.slice(0, 800), previewTruncated: preview.length > 800,
        ...(event.executionUnitId === undefined ? {} : { executionUnitId: event.executionUnitId }),
        ...(event.stepIndex === undefined ? {} : { stepIndex: event.stepIndex }), ...(actionId === undefined ? {} : { actionId }) };
}
function validId(value: string | null): value is string { return value !== null && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value); }
function validNumber(value: string | null, optional: boolean): boolean { return value === null ? optional : /^\d+$/.test(value) && Number.isSafeInteger(Number(value)); }
function validQuery(params: URLSearchParams, allowed: readonly string[]): boolean { return [...params.keys()].every(key => allowed.includes(key) && params.getAll(key).length === 1); }

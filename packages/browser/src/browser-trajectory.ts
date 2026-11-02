import { Hono } from "hono";
import {
    TrajectoryProtocolError,
    trajectoryWatermark,
    type Goal,
    type GoalStore,
    type TrajectoryEventSummary,
    type TrajectoryQueryPort,
} from "../../runtime/src/index";
import type {
    BrowserExecutionUnitPage,
    BrowserTrajectoryDetail,
    BrowserTrajectoryEntry,
    BrowserTrajectoryEventPayloadWire,
    BrowserTrajectoryEventWire,
    BrowserTrajectoryObservationWire,
    BrowserTrajectoryPage,
    BrowserTrajectoryRun,
    BrowserTrajectoryTimeline,
} from "../../web-contracts/src/index";

export type {
    BrowserExecutionUnitPage,
    BrowserTrajectoryDetail,
    BrowserTrajectoryEntry,
    BrowserTrajectoryPage,
    BrowserTrajectoryRun,
    BrowserTrajectoryTimeline,
};

const PAGE_SIZE = 100;
const MAX_DETAIL_BYTES = 256 * 1024;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const categories = ["lifecycle", "decision", "memory", "action", "tool", "observation", "terminal", "commit"] as const;

/**
 * 挂载正式工作区的只读 Run、轨迹分页、执行单元、时间线与事件详情路由。
 *
 * @param store - 正式工作区 Snapshot 端口，禁止使用 Benchmark 聚合 Store。
 * @param query - 固定 Snapshot 水位的轨迹查询端口；所有结果只能来自该水位以内。
 * @returns 须由 BrowserSessionAccess 保护的 Hono 路由；不修改 Snapshot 或 Trajectory。
 * @remarks 列表查询不读取 payload；详情与 payload 只按索引位置读取目标事件及有限关联事件。
 * @throws 创建路由不执行 I/O；请求中的存储错误转换为稳定错误码。
 * @example
 * ```ts
 * host.mount("/", createBrowserTrajectoryRoutes(root.workspaceGoalStore, root.workspaceTrajectoryStore));
 * ```
 */
export function createBrowserTrajectoryRoutes(
    store: Pick<GoalStore, "restore">,
    query: TrajectoryQueryPort,
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
        const allowed = ["runId", "watermark", "cursor", "direction", "category", "executionUnitId", "actionId", "modelCallId", "fromSequence", "toSequence", "limit"];

        if (!validId(goalId) || !validId(runId) || !validQuery(params, allowed)
            || !validNumber(params.get("watermark"), true)
            || !validCursor(params.get("cursor"))
            || !validDirection(params.get("direction"))
            || !validLimit(params.get("limit"))
            || !validNumber(params.get("fromSequence"), true)
            || !validNumber(params.get("toSequence"), true)
            || (params.has("category") && !categories.includes(params.get("category") as typeof categories[number]))
            || (params.has("executionUnitId") && !validId(params.get("executionUnitId")))
            || (params.has("actionId") && !validId(params.get("actionId")))
            || (params.has("modelCallId") && !validId(params.get("modelCallId")))
            || (params.has("fromSequence") && params.has("toSequence")
                && Number(params.get("fromSequence")) > Number(params.get("toSequence")))
            || (params.has("cursor") && !params.has("watermark"))) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }

        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const run = findRun(goal, runId!);
            if (!run) return context.json({ error: "run_not_found" }, 404);
            const watermark = resolveWatermark(goal, runId!, params.get("watermark"));
            if (watermark === undefined) return context.json({ error: "invalid_trajectory_query" }, 400);
            const page = await query.queryPage(
                { goalId, runId: runId!, committedThroughSequence: watermark },
                {
                    ...(params.get("cursor") === null ? {} : { cursor: params.get("cursor")! }),
                    ...(params.get("direction") === null ? {} : { direction: params.get("direction") as "forward" | "backward" }),
                    limit: params.has("limit") ? Number(params.get("limit")) : PAGE_SIZE,
                    ...(params.get("category") === null ? {} : { category: params.get("category") as typeof categories[number] }),
                    ...(params.get("executionUnitId") === null ? {} : { executionUnitId: params.get("executionUnitId")! }),
                    ...(params.get("actionId") === null ? {} : { actionId: params.get("actionId")! }),
                    ...(params.get("modelCallId") === null ? {} : { modelCallId: params.get("modelCallId")! }),
                    ...(params.get("fromSequence") === null ? {} : { fromSequence: Number(params.get("fromSequence")) }),
                    ...(params.get("toSequence") === null ? {} : { toSequence: Number(params.get("toSequence")) }),
                },
            );
            const response: BrowserTrajectoryPage = {
                goalId,
                run,
                entries: page.entries.map(entry),
                total: page.total,
                committedCount: page.committedCount,
                committedThroughSequence: page.committedThroughSequence,
                previousCursor: page.previousCursor,
                nextCursor: page.nextCursor,
                locatedSequence: page.locatedSequence,
            };
            return context.json(response);
        } catch (error) {
            return failure(context, error);
        }
    });

    routes.get("/api/goals/:goalId/trajectory/units/:executionUnitId/locate", async (context) => {
        const goalId = context.req.param("goalId");
        const executionUnitId = context.req.param("executionUnitId");
        const params = new URL(context.req.url).searchParams;
        const runId = params.get("runId");

        if (!validId(goalId) || !validId(executionUnitId) || !validId(runId)
            || !validQuery(params, ["runId", "watermark"]) || !validNumber(params.get("watermark"), true)) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }

        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const run = findRun(goal, runId!);
            if (!run) return context.json({ error: "run_not_found" }, 404);
            const watermark = resolveWatermark(goal, runId!, params.get("watermark"));
            if (watermark === undefined) return context.json({ error: "invalid_trajectory_query" }, 400);
            const sequence = await query.locateExecutionUnit(
                { goalId, runId: runId!, committedThroughSequence: watermark },
                executionUnitId,
            );
            return context.json({ sequence: sequence ?? null });
        } catch (error) {
            return failure(context, error);
        }
    });

    routes.get("/api/goals/:goalId/trajectory/units/:executionUnitId", async (context) => {
        const goalId = context.req.param("goalId");
        const executionUnitId = context.req.param("executionUnitId");
        const params = new URL(context.req.url).searchParams;
        const runId = params.get("runId");

        if (!validId(goalId) || !validId(executionUnitId) || !validId(runId)
            || !validQuery(params, ["runId", "watermark", "cursor", "direction", "limit"])
            || !validNumber(params.get("watermark"), true)
            || !validCursor(params.get("cursor"))
            || !validDirection(params.get("direction"))
            || !validLimit(params.get("limit"))
            || (params.has("cursor") && !params.has("watermark"))) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }

        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const run = findRun(goal, runId!);
            if (!run) return context.json({ error: "run_not_found" }, 404);
            const watermark = resolveWatermark(goal, runId!, params.get("watermark"));
            if (watermark === undefined) return context.json({ error: "invalid_trajectory_query" }, 400);
            const page = await query.queryExecutionUnitPage(
                { goalId, runId: runId!, committedThroughSequence: watermark },
                executionUnitId,
                {
                    ...(params.get("cursor") === null ? {} : { cursor: params.get("cursor")! }),
                    ...(params.get("direction") === null ? {} : { direction: params.get("direction") as "forward" | "backward" }),
                    limit: params.has("limit") ? Number(params.get("limit")) : PAGE_SIZE,
                },
            );
            const response: BrowserExecutionUnitPage = {
                goalId,
                run,
                entries: page.entries.map(entry),
                total: page.total,
                committedThroughSequence: watermark,
                nextCursor: page.nextCursor,
                contextBefore: page.contextBefore.map(entry),
                contextAfter: page.contextAfter.map(entry),
            };
            return context.json(response);
        } catch (error) {
            return failure(context, error);
        }
    });

    routes.get("/api/goals/:goalId/trajectory/timeline", async (context) => {
        const goalId = context.req.param("goalId");
        const params = new URL(context.req.url).searchParams;
        const runId = params.get("runId");

        if (!validId(goalId) || !validId(runId) || !validQuery(params, ["runId", "watermark", "bucketSize"])
            || !validNumber(params.get("watermark"), true)
            || !validBucketSize(params.get("bucketSize"))) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }

        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const run = findRun(goal, runId!);
            if (!run) return context.json({ error: "run_not_found" }, 404);
            const watermark = resolveWatermark(goal, runId!, params.get("watermark"));
            if (watermark === undefined) return context.json({ error: "invalid_trajectory_query" }, 400);
            const timeline = await query.queryTimeline(
                { goalId, runId: runId!, committedThroughSequence: watermark },
                params.has("bucketSize") ? Number(params.get("bucketSize")) : 100,
            );
            const response: BrowserTrajectoryTimeline = {
                goalId,
                runId: runId!,
                committedThroughSequence: watermark,
                eventCount: timeline.eventCount,
                timeRange: timeline.timeRange,
                buckets: timeline.buckets.map((bucket) => ({
                    startSequence: bucket.startSequence,
                    endSequence: bucket.endSequence,
                    eventCount: bucket.eventCount,
                    eventTypes: Object.entries(bucket.eventTypes)
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([eventType, count]) => ({ eventType, count })),
                })),
            };
            return context.json(response);
        } catch (error) {
            return failure(context, error);
        }
    });

    routes.get("/api/goals/:goalId/trajectory/events/:sequence/payload", async (context) => {
        const goalId = context.req.param("goalId");
        const params = new URL(context.req.url).searchParams;
        const runId = params.get("runId");
        const sequence = context.req.param("sequence");

        if (!validId(goalId) || !validId(runId) || !validQuery(params, ["runId", "watermark"])
            || !validNumber(sequence, false) || Number(sequence) < 1
            || !validNumber(params.get("watermark"), true)) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }

        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const run = findRun(goal, runId!);
            if (!run) return context.json({ error: "run_not_found" }, 404);
            const watermark = resolveWatermark(goal, runId!, params.get("watermark"));
            if (watermark === undefined) return context.json({ error: "invalid_trajectory_query" }, 400);
            const payload = await query.readPayload(
                { goalId, runId: runId!, committedThroughSequence: watermark },
                Number(sequence),
            );
            if (payload === undefined) return context.json({ error: "event_not_found" }, 404);
            if (Buffer.byteLength(payload, "utf8") > MAX_PAYLOAD_BYTES) {
                return context.json({ error: "trajectory_payload_too_large", maximumBytes: MAX_PAYLOAD_BYTES }, 413);
            }
            return context.body(payload, 200, { "Content-Type": "application/json; charset=utf-8" });
        } catch (error) {
            return failure(context, error);
        }
    });

    routes.get("/api/goals/:goalId/trajectory/events/:sequence", async (context) => {
        const goalId = context.req.param("goalId");
        const params = new URL(context.req.url).searchParams;
        const runId = params.get("runId");
        const sequence = context.req.param("sequence");

        if (!validId(goalId) || !validId(runId) || !validQuery(params, ["runId", "watermark"])
            || !validNumber(sequence, false) || Number(sequence) < 1
            || !validNumber(params.get("watermark"), true)) {
            return context.json({ error: "invalid_trajectory_query" }, 400);
        }

        try {
            const goal = await store.restore(goalId);
            if (!goal) return context.json({ error: "goal_not_found" }, 404);
            const run = findRun(goal, runId!);
            if (!run) return context.json({ error: "run_not_found" }, 404);
            const watermark = resolveWatermark(goal, runId!, params.get("watermark"));
            if (watermark === undefined) return context.json({ error: "invalid_trajectory_query" }, 400);
            const detail = await query.readDetail(
                { goalId, runId: runId!, committedThroughSequence: watermark },
                Number(sequence),
            );
            if (detail === undefined) return context.json({ error: "event_not_found" }, 404);
            if (detail.payloadBytes > MAX_DETAIL_BYTES) {
                return context.json({ error: "trajectory_detail_too_large", maximumBytes: MAX_DETAIL_BYTES }, 413);
            }
            const event: BrowserTrajectoryEventWire = {
                eventId: detail.event.eventId,
                goalId: detail.event.goalId,
                runId: detail.event.runId,
                sequence: detail.event.sequence,
                occurredAt: detail.event.occurredAt,
                phase: detail.event.phase,
                eventType: detail.event.eventType,
                ...(detail.event.executionUnitId === undefined ? {} : { executionUnitId: detail.event.executionUnitId }),
                ...(detail.event.stepIndex === undefined ? {} : { stepIndex: detail.event.stepIndex }),
                ...(detail.event.actionId === undefined ? {} : { actionId: detail.event.actionId }),
                ...(detail.event.programId === undefined ? {} : { programId: detail.event.programId }),
                ...(detail.event.callIndex === undefined ? {} : { callIndex: detail.event.callIndex }),
                ...(detail.correlation.parentActionId === undefined ? {} : { parentActionId: detail.correlation.parentActionId }),
                payload: detail.event.payload as unknown as BrowserTrajectoryEventPayloadWire,
                eventSchemaVersion: detail.event.eventSchemaVersion,
            };
            const response: BrowserTrajectoryDetail = {
                event,
                ...(detail.input === undefined ? {} : { input: detail.input }),
                ...(detail.observation === undefined ? {} : { result: detail.observation as unknown as BrowserTrajectoryObservationWire }),
                ...(detail.toolStartedAt === undefined ? {} : { toolStartedAt: detail.toolStartedAt }),
                ...(detail.toolFinishedAt === undefined ? {} : { toolFinishedAt: detail.toolFinishedAt }),
                toolDurationMs: detail.toolDurationMs,
                observationConfirmed: detail.observationConfirmed,
                committedThroughSequence: watermark,
                correlation: detail.correlation,
                related: detail.related,
                payloadBytes: detail.payloadBytes,
                ...(detail.payloadRef === undefined ? {} : { payloadRef: detail.payloadRef }),
            };
            return context.json(response);
        } catch (error) {
            return failure(context, error);
        }
    });

    return routes;
}

function runList(goal: Goal): BrowserTrajectoryRun[] {
    return [
        {
            runId: goal.state.run.id,
            status: goal.state.run.status,
            current: true,
            committedThroughSequence: goal.state.run.committedThroughSequence ?? 0,
        },
        ...(goal.state.completedRuns ?? []).slice().reverse().map((run) => ({
            runId: run.runId,
            status: run.status,
            current: false,
            committedThroughSequence: run.committedThroughSequence ?? 0,
        })),
    ];
}

function findRun(goal: Goal, runId: string): BrowserTrajectoryRun | undefined {
    return runList(goal).find((run) => run.runId === runId);
}

function resolveWatermark(goal: Goal, runId: string, requested: string | null): number | undefined {
    const snapshot = trajectoryWatermark(goal, runId);
    if (requested === null) return snapshot;

    const value = Number(requested);
    if (!Number.isSafeInteger(value) || value < 0 || value > snapshot) return undefined;
    return value;
}

function entry(summary: TrajectoryEventSummary): BrowserTrajectoryEntry {
    return {
        eventId: summary.eventId,
        sequence: summary.sequence,
        occurredAt: summary.occurredAt,
        eventType: summary.eventType,
        category: summary.category,
        ...(summary.executionUnitId === undefined ? {} : { executionUnitId: summary.executionUnitId }),
        ...(summary.stepIndex === undefined ? {} : { stepIndex: summary.stepIndex }),
        ...(summary.actionId === undefined ? {} : { actionId: summary.actionId }),
        ...(summary.programId === undefined ? {} : { programId: summary.programId }),
        ...(summary.callIndex === undefined ? {} : { callIndex: summary.callIndex }),
        ...(summary.parentActionId === undefined ? {} : { parentActionId: summary.parentActionId }),
        title: summary.title,
        preview: summary.preview,
        previewTruncated: summary.previewTruncated,
        ...(summary.inputPreview === undefined ? {} : { inputPreview: summary.inputPreview }),
        ...(summary.resultPreview === undefined ? {} : { resultPreview: summary.resultPreview }),
        ...(summary.modelCallId === undefined ? {} : { modelCallId: summary.modelCallId }),
        ...(summary.modelStage === undefined ? {} : { modelStage: summary.modelStage }),
    };
}

function failure(context: { json: (body: unknown, status: 400 | 413 | 500) => Response }, error: unknown): Response {
    if (error instanceof TrajectoryProtocolError && /cursor/i.test(error.message)) {
        return context.json({ error: "invalid_trajectory_cursor" }, 400);
    }
    if (error instanceof TrajectoryProtocolError && /timeline bucket count/i.test(error.message)) {
        return context.json({ error: "trajectory_timeline_too_large" }, 413);
    }
    return context.json({ error: "trajectory_read_failed" }, 500);
}

function validId(value: string | null): value is string {
    return value !== null && value.length <= 256 && /^[A-Za-z0-9_-]+$/.test(value);
}

function validNumber(value: string | null, optional: boolean): boolean {
    return value === null ? optional : /^\d+$/.test(value) && Number.isSafeInteger(Number(value));
}

function validLimit(value: string | null): boolean {
    if (value === null) return true;
    return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 200;
}

function validBucketSize(value: string | null): boolean {
    if (value === null) return true;
    return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 10_000;
}

function validCursor(value: string | null): boolean {
    return value === null || /^[A-Za-z0-9_-]{1,2048}$/.test(value);
}

function validDirection(value: string | null): boolean {
    return value === null || value === "forward" || value === "backward";
}

function validQuery(params: URLSearchParams, allowed: readonly string[]): boolean {
    for (const key of params.keys()) {
        if (!allowed.includes(key) || params.getAll(key).length !== 1) return false;
    }
    return true;
}

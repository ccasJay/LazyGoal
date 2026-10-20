import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { allocateImmutableEvent, createGoal, readTrajectoryAtSnapshot, type Goal, type TrajectoryEvent } from "../../runtime/src/index";
import { testAssistantMessage } from "../../runtime/test/current-fixtures";
import { createHttpService } from "../../http/src/index";
import { JsonFileGoalStore, JsonFileTrajectoryStore } from "../../storage/src/index";
import {
    createBrowserGoalRoutes,
    createBrowserSessionAccess,
    readBrowserGoalActivity,
    readBrowserGoalSessionState,
    type BrowserGoalApiPort,
} from "../src/index";

test("Activity 路由校验双向游标并只返回受限页", async () => {
    const calls: Array<{ goalId: string; query: Record<string, unknown> }> = [];
    const api = {
        async list() { return []; },
        async read() { return undefined; },
        async readActivity(goalId: string, query: Record<string, unknown>) {
            calls.push({ goalId, query });
            return { ok: true as const, page: {
                goalId,
                limit: 2,
                items: [],
                runs: [],
                window: [],
                gaps: [{ direction: "older", itemCount: 3,
                    first: { runId: "run-2", runOrder: 0, sequence: 0, itemKind: "fact", order: 0 },
                    last: { runId: "run-2", runOrder: 0, sequence: 2, itemKind: "fact", order: 0 } }],
                range: { olderAvailable: true, newerAvailable: false },
                stages: [],
                actionGroups: [],
                beforeCursor: "older-window",
            } };
        },
        async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
        async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        async setModelPreference() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
    } as unknown as BrowserGoalApiPort;
    const routes = createBrowserGoalRoutes(api);

    const response = await routes.request("/api/goals/goal-1/activity?runId=run-2&limit=2&before=older-window");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        goalId: "goal-1",
        limit: 2,
        items: [],
        runs: [],
        window: [],
        gaps: [{ direction: "older", itemCount: 3,
            first: { runId: "run-2", runOrder: 0, sequence: 0, itemKind: "fact", order: 0 },
            last: { runId: "run-2", runOrder: 0, sequence: 2, itemKind: "fact", order: 0 } }],
        range: { olderAvailable: true, newerAvailable: false },
        stages: [],
        actionGroups: [],
        beforeCursor: "older-window",
    });
    assert.deepEqual(calls, [{ goalId: "goal-1", query: { runId: "run-2", limit: 2, before: "older-window" } }]);
    assert.equal((await routes.request("/api/goals/goal-1/activity?before=older&after=newer")).status, 400);
    assert.equal(calls.length, 1);

    const failingRoutes = createBrowserGoalRoutes({
        ...api,
        async readActivity() { throw new Error("private storage diagnostic"); },
    } as unknown as BrowserGoalApiPort);
    const failedRead = await failingRoutes.request("/api/goals/goal-1/activity");
    assert.equal(failedRead.status, 500);
    assert.deepEqual(await failedRead.json(), { error: "activity_read_failed" });
});

test("view=state 返回显式标注历史外置的窄状态，不读取完整会话投影", async () => {
    let fullReads = 0;
    let stateReads = 0;
    const state = {
        goalId: "goal-1",
        currentRunId: "run-1",
        runStatus: "running",
        currentRunMode: "normal",
        currentPlanRoute: { revision: 1, stages: [] },
        history: {
            messages: { included: false, source: "activity" },
            steps: { included: false, source: "activity" },
            stages: { included: false, source: "activity" },
        },
    };
    const api = {
        async list() { return []; },
        async read() { fullReads += 1; return { goalId: "goal-1", messages: [], runs: [], historyTruncated: false }; },
        async readState() { stateReads += 1; return state; },
        async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
        async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        async setModelPreference() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
    } as unknown as BrowserGoalApiPort;
    const routes = createBrowserGoalRoutes(api);

    const response = await routes.request("/api/goals/goal-1?view=state");

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { goal: state });
    assert.equal(stateReads, 1);
    assert.equal(fullReads, 0);
});

test("Activity 真实读取在多 Run 与长历史中固定水位、双向排页并过滤 tail 和敏感载荷", async () => {
    const initial = createTestGoal();
    const oldRuns = ["run-old-1", "run-old-2"].map((runId, index) => ({
        runId,
        status: "completed" as const,
        stepCount: 1,
        committedThroughSequence: 2,
        messageRange: { start: index, end: index + 1 },
    }));
    const messages = [
        testAssistantMessage("旧 Run A", { runId: "run-old-1", messageId: "msg-old-1", position: { afterSequence: 1, order: 0 } }),
        testAssistantMessage("旧 Run B", { runId: "run-old-2", messageId: "msg-old-2", position: { afterSequence: 1, order: 0 } }),
        ...Array.from({ length: 50 }, (_, index) => testAssistantMessage(
            index === 49 ? `${"x".repeat(3_999)}😀tail` : `message-${index}`,
            { runId: initial.state.run.id, messageId: `msg-${index}`, position: { afterSequence: index * 2, order: 0 } },
        )),
    ];
    const goal: Goal = {
        ...initial,
        state: {
            ...initial.state,
            messages,
            completedRuns: oldRuns,
            run: { ...initial.state.run, committedThroughSequence: 105 },
        },
    };
    let currentGoal = goal;
    const fact = (runId: string, sequence: number, eventType: "run_started" | "tool_started" = "run_started"): TrajectoryEvent =>
        allocateImmutableEvent(eventType === "tool_started"
            ? { goalId: goal.id, runId, phase: "executing", actionId: "action-secret", eventType,
                payload: { type: eventType, actionId: "action-secret", toolId: "bash", input: { command: "PRIVATE_ACTIVITY_INPUT" } } }
            : { goalId: goal.id, runId, phase: "executing", eventType, payload: { type: eventType } }, sequence);
    const committedByRun = new Map<string, readonly TrajectoryEvent[]>([
        ["run-old-1", [fact("run-old-1", 1), fact("run-old-1", 2)]],
        ["run-old-2", [fact("run-old-2", 1), fact("run-old-2", 2)]],
        [goal.state.run.id, [...Array.from({ length: 105 }, (_, index) => fact(goal.state.run.id, index + 1)), fact(goal.state.run.id, 106, "tool_started")]],
    ]);
    const store = { restore: async (id: string) => id === goal.id ? currentGoal : undefined };
    const readTrajectory = async ({ runId }: { readonly runId: string }) => ({
        committed: committedByRun.get(runId) ?? [],
        uncommittedTail: [fact(runId, 107)],
    });

    const first = await readBrowserGoalActivity(goal.id, {}, store, readTrajectory);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.page.items.length, 50);
    assert.equal(first.page.range.olderAvailable, true);
    assert.ok(first.page.beforeCursor);
    const initialGap = first.page.gaps.find((gap) => gap.direction === "older");
    assert.equal(initialGap?.itemCount, 111);
    assert.ok(initialGap?.first);
    assert.ok(initialGap?.last);
    assert.deepEqual(first.page.runs.map((run) => run.runId), ["run-old-1", "run-old-2", goal.state.run.id]);
    assert.equal(JSON.stringify(first.page).includes("PRIVATE_ACTIVITY_INPUT"), false);
    const lastMessage = first.page.items.find((item) => item.type === "message" && item.messageId === "msg-49");
    assert.equal(lastMessage?.type, "message");
    if (lastMessage?.type === "message") {
        assert.equal(lastMessage.content.length, 3_999);
        assert.equal(lastMessage.truncated, true);
    }

    const maxPage = await readBrowserGoalActivity(goal.id, { limit: 100 }, store, readTrajectory);
    assert.equal(maxPage.ok, true);
    if (!maxPage.ok) return;
    assert.equal(maxPage.page.items.length, 100);
    assert.equal(maxPage.page.gaps[0]?.direction, "older");
    assert.equal(maxPage.page.gaps[0]?.itemCount, 61);

    const previousRun = currentGoal.state.run;
    const nextGoal = createGoal({
        id: currentGoal.id,
        intent: currentGoal.definition.intent,
        promptBundleVersion: currentGoal.definition.promptBundleVersion,
        memoryProtocol: currentGoal.definition.memoryProtocol,
        modelContextProtocol: currentGoal.definition.modelContextProtocol,
        contextRetrievalProtocol: currentGoal.definition.contextRetrievalProtocol,
        profile: currentGoal.definition.profile,
        runId: "run-next",
    });
    const nextMessage = testAssistantMessage("later Run message", {
        runId: nextGoal.state.run.id,
        messageId: "msg-next-run",
        position: { afterSequence: 1, order: 0 },
    });
    currentGoal = {
        ...currentGoal,
        state: {
            ...currentGoal.state,
            messages: [...currentGoal.state.messages, nextMessage],
            completedRuns: [...(currentGoal.state.completedRuns ?? []), {
                runId: previousRun.id,
                status: "completed",
                stepCount: previousRun.stepCount,
                committedThroughSequence: 105,
                messageRange: { start: 2, end: currentGoal.state.messages.length },
            }],
            run: { ...nextGoal.state.run, committedThroughSequence: 1 },
        },
    };
    committedByRun.set(nextGoal.state.run.id, [fact(nextGoal.state.run.id, 1)]);

    const older = await readBrowserGoalActivity(goal.id, { before: first.page.beforeCursor, limit: 50 }, store, readTrajectory);
    assert.equal(older.ok, true);
    if (!older.ok) return;
    assert.equal(older.page.items.length, 50);
    assert.equal(older.page.range.newerAvailable, true);
    assert.equal(older.page.gaps.length, 2);
    assert.equal(older.page.gaps.find((gap) => gap.direction === "newer")?.itemCount, 50);
    assert.equal(older.page.items.some((item) => item.itemId === "message:msg-next-run"), false);
    assert.equal(older.page.items.some((item) => item.runId === nextGoal.state.run.id), false);
    const olderAfterCursor = older.page.afterCursor;
    assert.ok(olderAfterCursor);
    if (olderAfterCursor === undefined) return;
    const next = await readBrowserGoalActivity(goal.id, { after: olderAfterCursor, limit: 50 }, store, readTrajectory);
    assert.equal(next.ok, true);
    if (!next.ok) return;
    assert.deepEqual(next.page.items.map((item) => item.itemId), first.page.items.map((item) => item.itemId));

    assert.deepEqual(await readBrowserGoalActivity(goal.id, { runId: "run-missing" }, store, readTrajectory), { ok: false, error: "run_not_found" });
    assert.deepEqual(await readBrowserGoalActivity(goal.id, { runId: "run-old-1", after: first.page.beforeCursor }, store, readTrajectory), { ok: false, error: "activity_cursor_invalid" });
    assert.deepEqual(await readBrowserGoalActivity("missing-goal", {}, store, readTrajectory), { ok: false, error: "goal_not_found" });

    const runPage = await readBrowserGoalActivity(goal.id, { runId: "run-old-1", limit: 1 }, store, readTrajectory);
    assert.equal(runPage.ok, true);
    if (runPage.ok && runPage.page.beforeCursor !== undefined) {
        const cursorData = JSON.parse(Buffer.from(runPage.page.beforeCursor, "base64url").toString("utf8")) as Record<string, unknown>;
        const mismatchedRunCursor = Buffer.from(JSON.stringify({ ...cursorData, runFilter: "run-old-2" }), "utf8").toString("base64url");
        assert.deepEqual(await readBrowserGoalActivity(goal.id, { runId: "run-old-2", before: mismatchedRunCursor }, store, readTrajectory), {
            ok: false,
            error: "activity_cursor_invalid",
        });
    } else {
        assert.fail("过滤后的历史页应提供可用于读取较早内容的 cursor");
    }
});

test("Activity 事实携带最小已提交工具状态白名单，并按真实来源边界断组", async () => {
    const initial = createTestGoal();
    const goal: Goal = {
        ...initial,
        state: { ...initial.state, run: { ...initial.state.run, committedThroughSequence: 12 } },
    };
    const createCall = (firstSequence: number, unit: string, actionId: string): TrajectoryEvent[] => [
        allocateImmutableEvent({
            goalId: goal.id, runId: goal.state.run.id, phase: "executing", executionUnitId: unit, stepIndex: firstSequence,
            eventType: "decision_received",
            payload: { type: "decision_received", decision: { kind: "tool_call", action: { actionId, toolId: "read_file", input: { path: `${actionId}.ts` } } } },
        }, firstSequence),
        allocateImmutableEvent({
            goalId: goal.id, runId: goal.state.run.id, phase: "executing", executionUnitId: unit, stepIndex: firstSequence,
            eventType: "action_staged", actionId,
            payload: { type: "action_staged", action: { actionId, toolId: "read_file", input: { path: `${actionId}.ts` } }, approvalStatus: "approved" },
        }, firstSequence + 1),
        allocateImmutableEvent({
            goalId: goal.id, runId: goal.state.run.id, phase: "executing", executionUnitId: unit, stepIndex: firstSequence,
            eventType: "observation_recorded", actionId,
            payload: { type: "observation_recorded", actionId, observation: { kind: "success", output: "PRIVATE_RAW_TOOL_OUTPUT", summary: "Read file" } },
        }, firstSequence + 2),
    ];
    const answerBoundary = allocateImmutableEvent({
        goalId: goal.id, runId: goal.state.run.id, phase: "executing", executionUnitId: "assistant-unit",
        eventType: "decision_received",
        payload: { type: "decision_received", decision: { kind: "complete", summary: "A visible reply", completionEvidence: [] } },
    }, 7);
    const committed = [...createCall(1, "unit-1", "action-1"), answerBoundary, ...createCall(8, "unit-2", "action-2")];
    const store = { restore: async (id: string) => (id === goal.id ? goal : undefined) };
    const readTrajectory = async () => ({ committed, uncommittedTail: [] });

    const result = await readBrowserGoalActivity(goal.id, {}, store, readTrajectory);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const facts = result.page.items.filter((item) => item.type === "fact");
    const firstToolFacts = facts.filter((item) => item.type === "fact" && item.actionId === "action-1");
    assert.equal(firstToolFacts.length, 3);
    for (const fact of firstToolFacts) {
        assert.equal(fact.type, "fact");
        if (fact.type !== "fact") continue;
        assert.equal(fact.tool?.toolId, "read_file");
        assert.equal(fact.tool?.status, "completed");
        assert.equal(fact.tool?.actionStatus, "approved");
        assert.equal(fact.tool?.inputSummary, "action-1.ts");
        assert.equal(fact.tool?.summary, "Read file");
        assert.equal(fact.tool?.activityBoundaryBefore, undefined);
    }
    const secondToolFacts = facts.filter((item) => item.type === "fact" && item.actionId === "action-2");
    assert.equal(secondToolFacts.length, 3);
    assert.equal(secondToolFacts[0]?.type === "fact" ? secondToolFacts[0].tool?.activityBoundaryBefore : undefined, true);
    assert.equal(JSON.stringify(result.page).includes("PRIVATE_RAW_TOOL_OUTPUT"), false);
});

test("窄状态生产投影只恢复 Snapshot，不调用轨迹读取器", async () => {    const initial = createTestGoal();
    const state = await readBrowserGoalSessionState(initial.id, { restore: async () => initial });
    assert.equal(state?.currentRunStepCount, initial.state.run.stepCount);
    assert.deepEqual(state?.history, {
        messages: { included: false, source: "activity" },
        steps: { included: false, source: "activity" },
        stages: { included: false, source: "activity" },
    });
});

test("正式 HTTP 从重建的文件 Store 读取 Activity，并遵守 Snapshot 提交边界", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-goal-board-activity-"));
    const access = createBrowserSessionAccess();
    const service = createHttpService({ middleware: access.middleware });
    try {
        const goalStore = new JsonFileGoalStore(join(directory, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        const initial = createTestGoal();
        const message = testAssistantMessage("文件持久化的正文", {
            runId: initial.state.run.id,
            messageId: "activity-file-message",
            position: { afterSequence: 1, order: 0 },
        });
        const persisted: Goal = {
            ...initial,
            state: {
                ...initial.state,
                messages: [...initial.state.messages, message],
                run: { ...initial.state.run, committedThroughSequence: 3 },
            },
        };
        await goalStore.save(persisted);
        for (let sequence = 1; sequence <= 4; sequence += 1) {
            if (sequence === 4) {
                await trajectoryStore.append({
                    goalId: persisted.id, runId: persisted.state.run.id, phase: "executing",
                    eventType: "run_completed", payload: { type: "run_completed", summary: "UNCOMMITTED_TAIL_SECRET" },
                });
            } else {
                await trajectoryStore.append({
                    goalId: persisted.id, runId: persisted.state.run.id, phase: "executing",
                    eventType: "run_started", payload: { type: "run_started" },
                });
            }
        }
        const restoredGoals = new JsonFileGoalStore(join(directory, "goals"));
        const restoredTrajectory = new JsonFileTrajectoryStore(join(directory, "trajectory"));
        let reads = 0;
        const api = {
            async list() { return []; },
            async read() { return undefined; },
            readState: (goalId: string) => readBrowserGoalSessionState(goalId, restoredGoals),
            readActivity: async (goalId: string, query: Parameters<typeof readBrowserGoalActivity>[1]) => {
                reads += 1;
                return readBrowserGoalActivity(goalId, query, restoredGoals, (trajectoryQuery) =>
                    readTrajectoryAtSnapshot(restoredGoals, restoredTrajectory, trajectoryQuery));
            },
            async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
            async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
            async setModelPreference() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
            async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
        } as unknown as BrowserGoalApiPort;
        service.mount("/", createBrowserGoalRoutes(api));
        const address = await service.start(0);
        access.bindOrigin(address.origin);
        const token = new URL(access.createLaunchUrl(address.origin)).hash.slice(1);
        const response = await fetch(`${address.origin}/api/goals/${persisted.id}/activity?limit=20`, {
            headers: { authorization: `Bearer ${token}`, origin: address.origin },
        });
        assert.equal(response.status, 200);
        const page = await response.json() as { items: readonly { itemId: string; eventType?: string; title?: string }[]; window: readonly { committedThroughSequence: number }[] };
        assert.equal(page.items.some((item) => item.itemId === "message:activity-file-message"), true);
        assert.equal(page.items.some((item) => item.eventType === "run_completed"), false);
        assert.equal(JSON.stringify(page).includes("UNCOMMITTED_TAIL_SECRET"), false);
        assert.equal(page.window[0]?.committedThroughSequence, 3);
        assert.equal(reads, 1);
    } finally {
        await service.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test("Activity HTTP 访问控制在 Host、Origin 或 Bearer 拒绝时先于任何读取", async () => {
    const access = createBrowserSessionAccess();
    let reads = 0;
    const api = {
        async list() { return []; },
        async read() { return undefined; },
        async readState() { reads += 1; return undefined; },
        async readActivity() { reads += 1; return { ok: false as const, error: "goal_not_found" as const }; },
        async enterPlanMode() { return { ok: false as const, error: "plan_mode_failed" as const }; },
        async models() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        async setModelPreference() { return { ok: false as const, error: "model_catalog_unavailable" as const }; },
        async selectModel() { return { ok: false as const, error: "model_selection_failed" as const }; },
    } as unknown as BrowserGoalApiPort;
    const service = createHttpService({ middleware: access.middleware });
    service.mount("/", createBrowserGoalRoutes(api));
    const address = await service.start(0);
    access.bindOrigin(address.origin);
    const token = new URL(access.createLaunchUrl(address.origin)).hash.slice(1);
    const activityUrl = `${address.origin}/api/goals/goal-1/activity`;
    try {
        assert.equal((await fetch(activityUrl)).status, 401);
        assert.equal((await fetch(activityUrl, { headers: { authorization: `Bearer ${token}`, origin: "https://attacker.example" } })).status, 403);
        const wrongHost = await new Promise<number>((resolve, reject) => {
            const request = httpRequest(activityUrl, { headers: { authorization: `Bearer ${token}`, host: "localhost:1" } }, (response) => {
                response.resume();
                response.on("end", () => resolve(response.statusCode ?? 0));
            });
            request.on("error", reject);
            request.end();
        });
        assert.equal(wrongHost, 403);
        assert.equal(reads, 0);
        const authorized = await fetch(activityUrl, { headers: { authorization: `Bearer ${token}`, origin: address.origin } });
        assert.equal(authorized.status, 404);
        assert.equal(reads, 1);
    } finally {
        await service.close();
    }
});

function createTestGoal(): Goal {
    return createGoal({
        id: "activity-goal",
        intent: "读取有界历史",
        promptBundleVersion: 1,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        contextRetrievalProtocol: { kind: "bm25-lite", version: 1 },
        profile: { id: "profile", systemPrompt: "private", instructions: [], toolIds: [] },
        runId: "run-current",
    });
}

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    createStepExecutor,
    Runner,
    type ContextCompactionInput,
    type Goal,
} from "../src/index";
import { JsonFileGoalStore, JsonFileTrajectoryStore } from "../../storage/src/index";
import {
    currentProtocols,
    testAssistantMessage,
    testUserMessage,
} from "./current-fixtures";

const RUN_ID = "run-compaction";

function goalWithHistory(): Goal {
    const base = createGoal({
        ...currentProtocols,
        id: "goal-threshold",
        runId: RUN_ID,
        intent: "修复登录回归",
        promptBundleVersion: 1,
        profile: { id: "profile", systemPrompt: "system", instructions: [], toolIds: [] },
    });
    const messages = [
        testUserMessage("first request", { goal: base, position: { afterSequence: 0, order: 0 } }),
        testAssistantMessage("first answer", { goal: base, position: { afterSequence: 0, order: 1 } }),
        testUserMessage("second request", { goal: base, position: { afterSequence: 0, order: 2 } }),
        testAssistantMessage("second answer", { goal: base, position: { afterSequence: 0, order: 3 } }),
        testUserMessage("third request", { goal: base, position: { afterSequence: 0, order: 4 } }),
        testAssistantMessage("third answer", { goal: base, position: { afterSequence: 0, order: 5 } }),
        testUserMessage("fourth request", { goal: base, position: { afterSequence: 0, order: 6 } }),
        testAssistantMessage("fourth answer", { goal: base, position: { afterSequence: 0, order: 7 } }),
    ];
    return {
        ...base,
        state: {
            ...base.state,
            messages,
            run: { ...base.state.run, stepCount: 0 },
        },
    };
}

function completingExecutor() {
    return createStepExecutor(
        async () => ({
            kind: "wait" as const,
            reason: "等待外部输入",
        }),
        async () => ({ kind: "accept" as const }),
    );
}

async function runWithScheduler(
    compact: (input: ContextCompactionInput) => Promise<string | undefined>,
    occupancy: { occupiedTokens: number; capacityTokens: number; thresholdPercent: number } | null,
    savedGoals: Goal[] = [],
): Promise<{ readonly goal: Goal | undefined; readonly calls: ContextCompactionInput[]; readonly events: readonly string[] }> {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-threshold-compaction-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(directory, "goals"));
        await store.save(goalWithHistory());
        const calls: ContextCompactionInput[] = [];
        const runner = new Runner({
            store,
            trajectoryStore,
            executor: completingExecutor(),
            contextCompaction: {
                readOccupancy: async () => occupancy,
                compact: async (input) => {
                    calls.push(input);
                    return compact(input);
                },
            },
        });
        const result = await runner.run({ goalId: "goal-threshold", runId: RUN_ID });
        const goal = await store.restore("goal-threshold");
        if (result.ok) savedGoals.push(goal!);
        const events = (await trajectoryStore.read({ goalId: "goal-threshold", runId: RUN_ID }))
            .map((event) => event.eventType);
        return { goal, calls, events };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

test("结算后严格超过阈值时执行一轮提炼并提交新 Epoch", async () => {
    const outcome = await runWithScheduler(
        async () => "已验证：登录回归来自过期的 dialog 关闭逻辑。",
        { occupiedTokens: 90_000, capacityTokens: 100_000, thresholdPercent: 80 },
    );

    assert.equal(outcome.calls.length, 1, "只应执行一轮提炼");
    assert.match(outcome.calls[0]!.evictedTranscript, /first request/);
    assert.doesNotMatch(outcome.calls[0]!.evictedTranscript, /fourth request/);
    assert.match(outcome.calls[0]!.recentTranscript, /fourth request/);
    assert.equal(outcome.calls[0]!.objective, undefined);

    assert.equal(outcome.events.filter((event) => event === "context_epoch_advanced").length, 1);
    const goal = outcome.goal!;
    assert.equal(goal.state.run.contextEpoch.number, 1);
    assert.equal(goal.state.run.contextEpoch.compactionSourceRunId, RUN_ID);
    assert.equal(goal.state.run.contextEpoch.conversationStartIndex, 4);
});

test("占用未严格超过阈值时不执行提炼", async () => {
    const outcome = await runWithScheduler(
        async () => "should not run",
        { occupiedTokens: 80_000, capacityTokens: 100_000, thresholdPercent: 80 },
    );
    assert.equal(outcome.calls.length, 0);
    assert.equal(outcome.events.includes("context_epoch_advanced"), false);
    assert.equal(outcome.goal!.state.run.contextEpoch.number, 0);
});

test("容量或占用不可用时保持旧窗口", async () => {
    const outcome = await runWithScheduler(async () => "should not run", null);
    assert.equal(outcome.calls.length, 0);
    assert.equal(outcome.goal!.state.run.contextEpoch.number, 0);
});

test("提炼无效或未缩减时保持旧窗口并继续执行", async () => {
    for (const body of [undefined, "   ", "x".repeat(400)]) {
        const outcome = await runWithScheduler(async () => body, {
            occupiedTokens: 95_000,
            capacityTokens: 100_000,
            thresholdPercent: 80,
        });
        assert.equal(outcome.calls.length, 1, JSON.stringify(body));
        assert.equal(outcome.events.includes("context_epoch_advanced"), false, JSON.stringify(body));
        assert.equal(outcome.goal!.state.run.contextEpoch.number, 0);
        assert.notEqual(outcome.goal!.state.run.status, "failed");
    }
});

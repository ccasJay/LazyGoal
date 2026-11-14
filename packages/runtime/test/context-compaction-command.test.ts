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

const GOAL_ID = "goal-command-compaction";
const RUN_ID = "run-command-compaction";

function goalWithHistory(): Goal {
    const base = createGoal({
        ...currentProtocols,
        id: GOAL_ID,
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
            run: { ...base.state.run, status: "running" as const, stepCount: 0 },
        },
    };
}

test("命令整理忽略阈值，并在同一 Epoch 上重复触发时给出反馈", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-command-compaction-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(directory, "goals"));
        await store.save(goalWithHistory());
        const calls: ContextCompactionInput[] = [];
        let occupancyReads = 0;
        const runner = new Runner({
            store,
            trajectoryStore,
            executor: createStepExecutor(
                async () => ({ kind: "wait", reason: "等待外部输入" }),
                async () => ({ kind: "accept" as const }),
            ),
            contextCompaction: {
                readOccupancy: async () => {
                    occupancyReads += 1;
                    return { occupiedTokens: 1, capacityTokens: 100_000, thresholdPercent: 80 };
                },
                compact: async (input) => {
                    calls.push(input);
                    return "已验证：登录回归来自过期的 dialog 关闭逻辑。";
                },
            },
        });

        // 先让 Run 到达可切换边界并写入已提交轨迹，再执行用户命令。
        const ran = await runner.run({ goalId: GOAL_ID, runId: RUN_ID });
        assert.equal(ran.ok, true);
        const messageCountBefore = (await store.restore(GOAL_ID))!.state.messages.length;
        const first = await runner.compactContextNow({ goalId: GOAL_ID, runId: RUN_ID });
        assert.equal(first.kind, "compacted");
        assert.equal(occupancyReads, 1, "只有阈值调度读取占用，命令整理不读取");

        const afterFirst = await store.restore(GOAL_ID);
        const messageCount = afterFirst!.state.messages.length;
        assert.equal(afterFirst!.state.run.contextEpoch.number, 1);
        assert.equal(messageCount, messageCountBefore, "命令不得写入对话");

        const second = await runner.compactContextNow({ goalId: GOAL_ID, runId: RUN_ID });
        assert.equal(second.kind, "unavailable");
        assert.equal(second.kind === "unavailable" ? second.reason : undefined, "empty_window");
        assert.equal(calls.length, 1, "同一 Epoch 第二次触发不得重复提炼");

        const afterSecond = await store.restore(GOAL_ID);
        assert.equal(afterSecond!.state.run.contextEpoch.number, 1);
        assert.equal(afterSecond!.state.messages.length, messageCount);

        const events = await trajectoryStore.read({ goalId: GOAL_ID, runId: RUN_ID });
        assert.equal(events.filter((event) => event.eventType === "context_epoch_advanced").length, 1);
        const advanced = events.find((event) => event.eventType === "context_epoch_advanced");
        assert.equal(
            advanced?.eventType === "context_epoch_advanced" ? advanced.payload.reason : undefined,
            "command_compaction",
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("命令整理的 Run 身份必须与当前 Run 一致", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-command-compaction-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(directory, "goals"));
        await store.save(goalWithHistory());
        const runner = new Runner({
            store,
            trajectoryStore,
            executor: createStepExecutor(
                async () => ({ kind: "wait", reason: "等待外部输入" }),
                async () => ({ kind: "accept" as const }),
            ),
            contextCompaction: {
                readOccupancy: async () => null,
                compact: async () => "unused",
            },
        });

        const outcome = await runner.compactContextNow({ goalId: GOAL_ID, runId: "run-other" });
        assert.equal(outcome.kind, "unavailable");
        assert.equal(outcome.kind === "unavailable" ? outcome.reason : undefined, "run_mismatch");
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    createStepExecutor,
    Runner,
    type AgentDecision,
    type ContextCompactionInput,
    type Goal,
    type RunState,
} from "../src/index";
import { ContextWindowRejectedError, ModelRequestFailure } from "../../execution-control/src/index";
import { JsonFileGoalStore, JsonFileTrajectoryStore } from "../../storage/src/index";
import {
    currentProtocols,
    testAssistantMessage,
    testUserMessage,
} from "./current-fixtures";

const GOAL_ID = "goal-context-window";
const RUN_ID = "run-context-window";

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
            run: { ...base.state.run, stepCount: 0 },
        },
    };
}

interface Outcome {
    readonly state: RunState;
    readonly goal: Goal | undefined;
    readonly compactionCalls: readonly ContextCompactionInput[];
    readonly occupancyReads: number;
    readonly decideCalls: number;
    readonly events: readonly string[];
}

async function runScenario(options: {
    readonly failures: readonly unknown[];
    readonly compact?: (input: ContextCompactionInput) => Promise<string | undefined>;
    readonly withCompactionPort?: boolean;
}): Promise<Outcome> {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-context-window-"));
    try {
        const store = new JsonFileGoalStore(join(directory, "goals"));
        const trajectoryStore = new JsonFileTrajectoryStore(join(directory, "goals"));
        await store.save(goalWithHistory());
        const failures = [...options.failures];
        const compactionCalls: ContextCompactionInput[] = [];
        let occupancyReads = 0;
        let decideCalls = 0;
        const executor = createStepExecutor(
            async (): Promise<AgentDecision> => {
                decideCalls += 1;
                const failure = failures.shift();
                if (failure !== undefined) throw failure;
                return { kind: "wait", reason: "等待外部输入" };
            },
            async () => ({ kind: "accept" as const }),
        );
        const runner = new Runner({
            store,
            trajectoryStore,
            executor,
            ...(options.withCompactionPort === false
                ? {}
                : {
                    contextCompaction: {
                        readOccupancy: async () => {
                            occupancyReads += 1;
                            return { occupiedTokens: 10, capacityTokens: 100_000, thresholdPercent: 80 };
                        },
                        compact: async (input: ContextCompactionInput) => {
                            compactionCalls.push(input);
                            return options.compact === undefined
                                ? "已验证：登录回归来自过期的 dialog 关闭逻辑。"
                                : options.compact(input);
                        },
                    },
                }),
        });
        const result = await runner.run({ goalId: GOAL_ID, runId: RUN_ID });
        if (!result.ok) throw new Error(`Runner rejected the run: ${result.error.code}`);
        const goal = await store.restore(GOAL_ID);
        const events = (await trajectoryStore.read({ goalId: GOAL_ID, runId: RUN_ID }))
            .map((event) => event.eventType);
        return { state: result.state, goal, compactionCalls, occupancyReads, decideCalls, events };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

test("供应商超窗拒绝后整理一次并只重试同一请求一次", async () => {
    const outcome = await runScenario({
        failures: [new ContextWindowRejectedError({ status: 400, providerCode: "context_length_exceeded" })],
    });

    assert.equal(outcome.compactionCalls.length, 1, "超窗只应整理一次");
    assert.equal(outcome.decideCalls, 2, "拒绝后只应重试一次");
    assert.equal(outcome.occupancyReads, 1, "超窗恢复不得额外读取阈值占用");
    assert.match(outcome.compactionCalls[0]!.evictedTranscript, /first request/);
    assert.doesNotMatch(outcome.compactionCalls[0]!.evictedTranscript, /fourth request/);

    const goal = outcome.goal!;
    assert.equal(goal.state.run.contextEpoch.number, 1);
    assert.equal(goal.state.run.contextEpoch.compactionSourceRunId, RUN_ID);
    assert.equal(goal.state.run.contextEpoch.conversationStartIndex, 4);
    assert.equal(outcome.events.filter((event) => event === "context_epoch_advanced").length, 1);
    assert.equal(outcome.events.filter((event) => event === "model_repair_attempt_started").length, 1,
        "重试不得新建修复尝试身份");
    assert.equal(outcome.events.filter((event) => event === "tool_attempt_started").length, 0);
    assert.equal(outcome.events.includes("model_request_retry_recorded"), false);
});

test("提炼无法完成时结束 Run 并报告整理失败", async () => {
    const outcome = await runScenario({
        failures: [new ContextWindowRejectedError({ status: 400, providerCode: "context_length_exceeded" })],
        compact: async () => undefined,
    });

    assert.equal(outcome.state.status, "failed");
    assert.equal(
        outcome.state.stopReason?.kind === "execution_error"
            ? outcome.state.stopReason.code
            : undefined,
        "CONTEXT_WINDOW_RECOVERY_FAILED",
    );
    assert.equal(outcome.decideCalls, 1, "整理失败后不得发送重试");
    assert.equal(outcome.goal!.state.run.contextEpoch.number, 0);
});

test("缺少提炼端口时结束 Run 并报告整理失败", async () => {
    const outcome = await runScenario({
        failures: [new ContextWindowRejectedError({ status: 400, providerCode: "context_length_exceeded" })],
        withCompactionPort: false,
    });

    assert.equal(outcome.state.status, "failed");
    assert.equal(
        outcome.state.stopReason?.kind === "execution_error"
            ? outcome.state.stopReason.code
            : undefined,
        "CONTEXT_WINDOW_RECOVERY_FAILED",
    );
    assert.equal(outcome.decideCalls, 1);
});

test("重试仍被明确拒绝为超窗时只有一次重试与一次整理", async () => {
    const outcome = await runScenario({
        failures: [
            new ContextWindowRejectedError({ status: 400, providerCode: "context_length_exceeded" }),
            new ContextWindowRejectedError({ status: 400, providerCode: "context_length_exceeded" }),
        ],
    });

    assert.equal(outcome.state.status, "failed");
    assert.equal(
        outcome.state.stopReason?.kind === "execution_error"
            ? outcome.state.stopReason.code
            : undefined,
        "CONTEXT_WINDOW_EXCEEDED",
    );
    assert.equal(outcome.compactionCalls.length, 1);
    assert.equal(outcome.decideCalls, 2);
    assert.equal(outcome.goal!.state.run.contextEpoch.number, 1, "已提交的整理必须保留");
});

test("其他模型请求错误不触发整理和重试", async () => {
    const outcome = await runScenario({
        failures: [new ModelRequestFailure("Provider rejected the model request (HTTP 401)")],
    });

    assert.equal(outcome.state.status, "failed");
    assert.equal(
        outcome.state.stopReason?.kind === "execution_error"
            ? outcome.state.stopReason.code
            : undefined,
        "MODEL_REQUEST_FAILED",
    );
    assert.equal(outcome.compactionCalls.length, 0);
    assert.equal(outcome.decideCalls, 1);
});

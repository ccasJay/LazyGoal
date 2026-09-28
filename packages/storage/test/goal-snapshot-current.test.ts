import assert from "node:assert/strict";
import {
    mkdtemp,
    readFile,
    rm,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
    createGoal,
    transition,
    type AgentProfile,
    type Goal,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";
import {
    GoalSnapshotProtocolError,
    goalSnapshotCodec,
    JsonFileGoalStore,
} from "../src/index";

const profile: AgentProfile = {
    id: "profile-current",
    systemPrompt: "You are a focused coding agent.",
    instructions: ["检查输入"],
    toolIds: [],
};

function createCurrentGoal(): Goal {
    return createGoal({
        ...currentProtocols,
        id: "goal-current-version",
        intent: "验证当前快照协议",
        promptBundleVersion: 1,
        profile,
        runId: "run-current-version",
    });
}

function assertProtocolError(error: unknown): boolean {
    assert.ok(error instanceof GoalSnapshotProtocolError);
    return true;
}

function snapshotPath(directory: string, goalId: string): string {
    return join(directory, `${Buffer.from(goalId, "utf8").toString("base64url")}.json`);
}

test("historical Goal Snapshot versions are rejected without mutation", () => {
    const encoded = goalSnapshotCodec.encode(createCurrentGoal());

    for (const schemaVersion of [5, 6, 7, 8, 9, 10, 11]) {
        const historical = structuredClone({
            ...encoded,
            metadata: { schemaVersion },
        });
        const beforeDecode = structuredClone(historical);

        assert.throws(
            () => goalSnapshotCodec.decode(historical),
            assertProtocolError,
        );
        assert.deepEqual(historical, beforeDecode);
    }
});

test("JsonFileGoalStore rejects a historical Snapshot without migration or write-back", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-current-snapshot-"));

    try {
        const goal = createCurrentGoal();
        const store = new JsonFileGoalStore(directory);
        await store.save(goal);

        const path = snapshotPath(directory, goal.id);
        const current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        const historical = {
            ...current,
            metadata: { schemaVersion: 8 },
        };
        await writeFile(path, `${JSON.stringify(historical)}\n`, "utf8");
        const beforeRestore = await readFile(path, "utf8");

        await assert.rejects(store.restore(goal.id), assertProtocolError);
        assert.equal(await readFile(path, "utf8"), beforeRestore);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("GoalSnapshotCodec: 编码与解码严格保持 GoalModelSelection 描述，且序列化不含凭据", () => {
    const customSelection = {
        provider: "anthropic",
        modelId: "claude-sonnet-4-5",
        structuredOutputMode: "prompt_only" as const,
        contextWindowTokens: 200000,
        maxOutputTokens: 8192,
        inputEstimator: { kind: "token-encoding" as const, encoding: "cl100k_base" as const },
    };

    const goal = createGoal({
        ...currentProtocols,
        id: "goal-model-selection-test",
        intent: "验证模型选择编解码",
        promptBundleVersion: 1,
        profile,
        runId: "run-model-selection-test",
        modelSelection: customSelection,
    });

    const encoded = goalSnapshotCodec.encode(goal);
    assert.deepEqual(encoded.state.modelSelection, customSelection);

    // 验证 two_stage 模式的编解码一致性
    const twoStageSelection = {
        provider: "google",
        modelId: "gemini-3.6-flash-high",
        structuredOutputMode: "two_stage" as const,
        inputEstimator: { kind: "character-v1" as const },
    };
    const twoStageGoal = createGoal({
        ...currentProtocols,
        id: "goal-two-stage-test",
        intent: "验证 two_stage 模型选择编解码",
        promptBundleVersion: 1,
        profile,
        runId: "run-two-stage-test",
        modelSelection: twoStageSelection,
    });
    const encodedTwoStage = goalSnapshotCodec.encode(twoStageGoal);
    assert.deepEqual(encodedTwoStage.state.modelSelection, twoStageSelection);
    const decodedTwoStage = goalSnapshotCodec.decode(encodedTwoStage);
    assert.deepEqual(decodedTwoStage.state.modelSelection, twoStageSelection);

    // 检查序列化 JSON 中绝对不包含任何敏感字段
    const jsonString = JSON.stringify(encoded);
    assert.doesNotMatch(jsonString, /apiKey/i);
    assert.doesNotMatch(jsonString, /baseURL/i);
    assert.doesNotMatch(jsonString, /authorization/i);

    const decoded = goalSnapshotCodec.decode(encoded);
    assert.deepEqual(decoded.state.modelSelection, customSelection);
    assert.notEqual(decoded.state.modelSelection, encoded.state.modelSelection);

    // 需求 5.3: 省略 structuredOutputMode 的模型选择能够平滑编解码，实现对历史快照的无缝兼容
    const selectionWithoutMode = {
        provider: "openai",
        modelId: "gpt-4o",
        inputEstimator: { kind: "character-v1" as const },
    };
    const goalWithoutMode = createGoal({
        ...currentProtocols,
        id: "goal-no-mode-test",
        intent: "验证无 structuredOutputMode 的模型选择快照",
        promptBundleVersion: 1,
        profile,
        runId: "run-no-mode-test",
        modelSelection: selectionWithoutMode,
    });
    const encodedNoMode = goalSnapshotCodec.encode(goalWithoutMode);
    assert.equal(encodedNoMode.state.modelSelection.structuredOutputMode, undefined);
    const decodedNoMode = goalSnapshotCodec.decode(encodedNoMode);
    assert.equal(decodedNoMode.state.modelSelection.structuredOutputMode, undefined);
});

test("GoalSnapshotCodec: 缺失 modelSelection 的旧快照明确拒绝失败", () => {
    const encoded = goalSnapshotCodec.encode(createCurrentGoal());
    const legacySnapshot = structuredClone(encoded) as unknown as Record<string, unknown>;
    const state = legacySnapshot["state"] as Record<string, unknown>;
    delete state["modelSelection"];

    assert.throws(
        () => goalSnapshotCodec.decode(legacySnapshot),
        assertProtocolError,
    );
});

test("GoalSnapshotCodec: 包含额外敏感字段或非法容量的模型选择快照被严格拒绝", () => {
    const encoded = goalSnapshotCodec.encode(createCurrentGoal());

    // 1. 含有 extra 字段（如 apiKey）
    const snapshotWithApiKey = structuredClone(encoded) as unknown as Record<string, unknown>;
    const state1 = snapshotWithApiKey["state"] as Record<string, unknown>;
    state1["modelSelection"] = {
        ...(state1["modelSelection"] as object),
        apiKey: "canary-secret-key",
    };
    assert.throws(
        () => goalSnapshotCodec.decode(snapshotWithApiKey),
        assertProtocolError,
    );

    // 2. maxOutputTokens >= contextWindowTokens
    const snapshotInvalidCapacity = structuredClone(encoded) as unknown as Record<string, unknown>;
    const state2 = snapshotInvalidCapacity["state"] as Record<string, unknown>;
    state2["modelSelection"] = {
        ...(state2["modelSelection"] as object),
        contextWindowTokens: 1000,
        maxOutputTokens: 2000,
    };
    assert.throws(
        () => goalSnapshotCodec.decode(snapshotInvalidCapacity),
        assertProtocolError,
    );
});

test("无最终任务的普通只读 Step 可以通过当前 Snapshot 编解码", () => {
    const goal = createCurrentGoal();
    const running = transition(goal.state.run, { kind: "start" });
    assert.equal(running.ok, true);
    if (!running.ok) return;

    const staged = transition(running.state, {
        kind: "stage_action",
        action: {
            actionId: "read-action-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "approved",
    });
    assert.equal(staged.ok, true);
    if (!staged.ok) return;

    const observed = transition(staged.state, {
        kind: "observe_action",
        actionId: "read-action-1",
        observation: {
            kind: "success",
            output: "当前文件内容",
            summary: "读取成功",
        },
    });
    assert.equal(observed.ok, true);
    if (!observed.ok) return;

    const progressed: Goal = {
        ...goal,
        state: {
            ...goal.state,
            run: observed.state,
        },
    };
    const encoded = goalSnapshotCodec.encode(progressed);
    const decoded = goalSnapshotCodec.decode(encoded);

    assert.equal(decoded.state.run.approvedTask, undefined);
    assert.equal(decoded.state.run.stepCount, 1);
    assert.deepEqual(decoded.state.run.lastStep, observed.state.lastStep);
});

test("无最终任务的普通只读 Action 可以保存为可恢复 pendingAction", () => {
    const goal = createCurrentGoal();
    const running = transition(goal.state.run, { kind: "start" });
    assert.equal(running.ok, true);
    if (!running.ok) return;

    const waiting = transition(running.state, {
        kind: "stage_action",
        action: {
            actionId: "read-action-approval",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        status: "awaiting_approval",
    });
    assert.equal(waiting.ok, true);
    if (!waiting.ok) return;

    const encoded = goalSnapshotCodec.encode({
        ...goal,
        state: {
            ...goal.state,
            run: waiting.state,
        },
    });
    const decoded = goalSnapshotCodec.decode(encoded);

    assert.equal(decoded.state.run.approvedTask, undefined);
    assert.deepEqual(decoded.state.run.pendingAction, waiting.state.pendingAction);
    assert.equal(decoded.state.run.stepCount, 0);
});

test("当前 Snapshot 往返保存 safe Tool 的已开始尝试次数并拒绝越界", () => {
    const goal = createCurrentGoal();
    const started = transition(goal.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const staged = transition(started.state, {
        kind: "stage_action",
        action: { actionId: "retry-action", toolId: "read_file", input: { path: "README.md" } },
    });
    assert.equal(staged.ok, true);
    if (!staged.ok) return;
    const withAttempt = {
        ...goal,
        state: {
            ...goal.state,
            run: {
                ...staged.state,
                pendingAction: { ...staged.state.pendingAction!, attemptsStarted: 2 },
            },
        },
    };
    const encoded = goalSnapshotCodec.encode(withAttempt);
    assert.equal(goalSnapshotCodec.decode(encoded).state.run.pendingAction?.attemptsStarted, 2);

    const invalid = structuredClone(encoded) as unknown as Record<string, any>;
    invalid.state.run.pendingAction.attemptsStarted = 4;
    assert.throws(() => goalSnapshotCodec.decode(invalid), assertProtocolError);
});

test("当前 Snapshot 往返保存 pendingThink，且拒绝越界的 Step 指针", () => {
    const goal = createCurrentGoal();
    const started = transition(goal.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    if (!started.ok) return;

    const pendingThink = {
        goalId: goal.id,
        runId: goal.state.run.id,
        stepOrdinal: 1,
        executionUnitId: "execution-unit-think-1",
        inputBoundary: `sha256:${"a".repeat(64)}` as const,
        latestThinkEventId: "event-think-1",
    };
    const snapshot = goalSnapshotCodec.encode({
        ...goal,
        state: {
            ...goal.state,
            run: { ...started.state, pendingThink },
        },
    });
    const restored = goalSnapshotCodec.decode(snapshot);

    assert.deepEqual(restored.state.run.pendingThink, pendingThink);
    const invalid = JSON.parse(JSON.stringify(snapshot)) as any;
    invalid.state.run.pendingThink!.stepOrdinal = 2;
    assert.throws(
        () => goalSnapshotCodec.decode(invalid),
        assertProtocolError,
    );
    const foreignGoal = JSON.parse(JSON.stringify(snapshot)) as any;
    foreignGoal.state.run.pendingThink.goalId = "goal-foreign";
    assert.throws(
        () => goalSnapshotCodec.decode(foreignGoal),
        assertProtocolError,
    );
});

test("当前 Snapshot 往返保存 pendingModelRepair，并验证其 Step 与身份", () => {
    const goal = createCurrentGoal();
    const started = transition(goal.state.run, { kind: "start" });
    assert.equal(started.ok, true);
    if (!started.ok) return;

    const pendingModelRepair = {
        goalId: goal.id,
        runId: goal.state.run.id,
        stepOrdinal: 1,
        executionUnitId: "execution-unit-repair-1",
        stage: "decide" as const,
        inputBoundary: ("sha256:" + "b".repeat(64)) as any,
        attemptsStarted: 2,
        latestAttemptEventId: "event-repair-attempt-2",
        latestFeedbackEventId: "event-repair-feedback-1",
    };
    const snapshot = goalSnapshotCodec.encode({
        ...goal,
        state: {
            ...goal.state,
            run: { ...started.state, pendingModelRepair },
        },
    });
    assert.deepEqual(goalSnapshotCodec.decode(snapshot).state.run.pendingModelRepair, pendingModelRepair);

    const wrongStep = JSON.parse(JSON.stringify(snapshot)) as any;
    wrongStep.state.run.pendingModelRepair.stepOrdinal = 2;
    assert.throws(() => goalSnapshotCodec.decode(wrongStep), assertProtocolError);

    const foreignRun = JSON.parse(JSON.stringify(snapshot)) as any;
    foreignRun.state.run.pendingModelRepair.runId = "foreign-run";
    assert.throws(() => goalSnapshotCodec.decode(foreignRun), assertProtocolError);

    const excessiveAttempts = JSON.parse(JSON.stringify(snapshot)) as any;
    excessiveAttempts.state.run.pendingModelRepair.attemptsStarted = 4;
    assert.throws(() => goalSnapshotCodec.decode(excessiveAttempts), assertProtocolError);
});

test("Run mode、approvedTask、nextRunMode 与 GoalPlan 独立往返", () => {
    const snapshot = JSON.parse(JSON.stringify(goalSnapshotCodec.encode(createCurrentGoal()))) as any;
    snapshot.state.nextRunMode = "plan";
    snapshot.state.run.mode = "plan";
    snapshot.state.run.status = "running";
    snapshot.state.run.approvedTask = {
        objective: "当前 Run 任务",
        completionCriteria: [{ text: "当前 Run 完成条件" }],
    };
    snapshot.state.goalPlan = {
        revision: 1,
        items: [{ id: "todo-1", content: "后续计划项", position: 0, status: "pending" }],
    };

    const restored = goalSnapshotCodec.decode(snapshot);
    const encoded = goalSnapshotCodec.encode(restored);
    assert.equal(restored.state.run.mode, "plan");
    assert.equal(restored.state.run.approvedTask?.objective, "当前 Run 任务");
    assert.equal(restored.state.nextRunMode, "plan");
    assert.deepEqual(restored.state.goalPlan, snapshot.state.goalPlan);
    assert.deepEqual(encoded, snapshot);
    assert.equal("mode" in encoded.state, false);
    assert.equal("task" in encoded.state.workflow, false);
    assert.equal("todoId" in encoded.state.run, false);
    assert.ok(encoded.state.goalPlan);
    assert.equal("activeRunId" in encoded.state.goalPlan.items[0]!, false);
});

test("Snapshot 明确拒绝旧 Goal mode 与 Todo/Run 绑定字段", () => {
    const current = goalSnapshotCodec.encode(createCurrentGoal());
    const mutations: readonly ((snapshot: any) => void)[] = [
        (snapshot) => { snapshot.state.mode = "plan"; },
        (snapshot) => { snapshot.state.workflow.task = { objective: "旧任务", completionCriteria: [] }; },
        (snapshot) => { snapshot.state.run.todoId = "todo-1"; },
        (snapshot) => {
            snapshot.state.goalPlan = {
                revision: 1,
                items: [{ id: "todo-1", content: "旧计划", position: 0, status: "in_progress", activeRunId: "run-1" }],
            };
        },
        (snapshot) => { snapshot.state.completedRuns = [{ todoId: "todo-1" }]; },
    ];
    for (const mutate of mutations) {
        const legacy = JSON.parse(JSON.stringify(current));
        mutate(legacy);
        assert.throws(() => goalSnapshotCodec.decode(legacy), assertProtocolError);
    }
});

test("Snapshot rejects an approved task on a normal Run", () => {
    const invalid = JSON.parse(JSON.stringify(goalSnapshotCodec.encode(createCurrentGoal()))) as any;
    invalid.state.run.approvedTask = { objective: "不一致任务", completionCriteria: [] };
    assert.throws(() => goalSnapshotCodec.decode(invalid), assertProtocolError);
});

test("Plan Mode 的 GoalPlan 更新 Step 可以通过当前 Snapshot 编解码", () => {
    const created = createGoal({
        ...currentProtocols,
        id: "goal-plan-step-roundtrip",
        intent: "验证计划更新 Step",
        promptBundleVersion: 1,
        profile,
        runId: "run-plan-step-roundtrip",
        mode: "plan",
    });
    const running = transition(created.state.run, { kind: "start" });
    assert.equal(running.ok, true);
    if (!running.ok) return;
    const progressed = transition(running.state, {
        kind: "plan_update",
        decision: {
            kind: "goal_plan_update",
            baseRevision: 0,
            operations: [{
                type: "update",
                id: "todo-1",
                status: "completed",
                evidenceSequences: [9],
            }],
        },
    });
    assert.equal(progressed.ok, true);
    if (!progressed.ok) return;

    const encoded = goalSnapshotCodec.encode({
        ...created,
        state: { ...created.state, run: progressed.state },
    });
    const decoded = goalSnapshotCodec.decode(encoded);
    assert.equal(decoded.state.run.mode, "plan");
    assert.deepEqual(decoded.state.run.lastStep, progressed.state.lastStep);

    const invalid = structuredClone(encoded) as any;
    delete invalid.state.run.lastStep.result.operations[0].evidenceSequences;
    assert.throws(() => goalSnapshotCodec.decode(invalid), assertProtocolError);
});

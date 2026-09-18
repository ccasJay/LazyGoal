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

    assert.equal(decoded.state.workflow.task, undefined);
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

    assert.equal(decoded.state.workflow.task, undefined);
    assert.deepEqual(decoded.state.run.pendingAction, waiting.state.pendingAction);
    assert.equal(decoded.state.run.stepCount, 0);
});

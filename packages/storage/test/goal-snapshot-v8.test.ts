import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    resolveModelContextProtocol,
    type AgentProfile,
    type Goal,
} from "../../runtime/src/index";
import {
    GoalSnapshotProtocolError,
    GoalSnapshotV9Schema,
    goalSnapshotCodec,
} from "../src/index";

const profile: AgentProfile = {
    id: "snapshot-v8-profile",
    systemPrompt: "You are a test agent.",
    instructions: [],
    toolIds: [],
};

function createLayeredGoal(): Goal {
    return createGoal({
        id: "goal-layered",
        intent: "验证分层上下文",
        promptBundleVersion: 5,
        memoryProtocol: { kind: "structured", version: 1 },
        modelContextProtocol: { kind: "trajectory-layered", version: 1 },
        profile,
        runId: "run-layered",
    });
}

test("Snapshot v9 显式保存并恢复 trajectory-layered 协议", () => {
    const goal = createLayeredGoal();
    const snapshot = goalSnapshotCodec.encode(goal);

    assert.equal(snapshot.metadata.schemaVersion, 9);
    assert.deepEqual(snapshot.definition.modelContextProtocol, {
        kind: "trajectory-layered",
        version: 1,
    });
    assert.deepEqual(
        goalSnapshotCodec.decode(snapshot),
        goal,
    );
});

test("v5-v8 只读恢复默认 conversation@1 与 none@1，下一次保存升级到 v9", () => {
    const encoded = goalSnapshotCodec.encode(createLayeredGoal());
    const {
        modelContextProtocol: _modelContext,
        contextRetrievalProtocol: _retrieval,
        ...v7Definition
    } = encoded.definition;
    const legacy = {
        ...encoded,
        metadata: { schemaVersion: 7 as const },
        definition: v7Definition,
    };

    const source = JSON.stringify(legacy);
    const restored = goalSnapshotCodec.decode(legacy);

    assert.equal(JSON.stringify(legacy), source);
    assert.deepEqual(resolveModelContextProtocol(restored.definition), {
        kind: "conversation",
        version: 1,
    });
    assert.equal(goalSnapshotCodec.encode(restored).metadata.schemaVersion, 9);
});

test("Snapshot v9 拒绝未知模型上下文、检索协议与交叉组合", () => {
    const layered = goalSnapshotCodec.encode(createLayeredGoal());
    const invalid: unknown[] = [
        {
            ...layered,
            definition: {
                ...layered.definition,
                modelContextProtocol: { kind: "future", version: 1 },
            },
        },
        {
            ...layered,
            definition: {
                ...layered.definition,
                memoryProtocol: { kind: "checkpoint", version: 1 },
            },
        },
        {
            ...layered,
            definition: {
                ...layered.definition,
                contextRetrievalProtocol: { kind: "future", version: 1 },
            },
        },
    ];

    for (const candidate of invalid) {
        assert.equal(GoalSnapshotV9Schema.safeParse(candidate).success, false);
        assert.throws(
            () => goalSnapshotCodec.decode(candidate),
            (error: unknown) => error instanceof GoalSnapshotProtocolError,
        );
    }
});

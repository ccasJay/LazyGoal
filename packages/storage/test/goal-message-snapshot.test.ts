import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { goalSnapshotCodec, GoalSnapshotProtocolError, JsonFileGoalStore } from "../src/index";
import { goalSnapshotPath } from "../src/index";
import type { GoalSnapshotMessageV1 } from "../src/index";
import {
    appendGoalMessage,
    createGoal,
    type AgentProfile,
    type Goal,
    type GoalMessage,
} from "../../runtime/src/index";
import { currentProtocols } from "../../runtime/test/current-fixtures";

const profile: AgentProfile = {
    id: "goal-message-profile",
    systemPrompt: "Test",
    instructions: ["Test"],
    toolIds: [],
};

function createBaseGoal(id: string, runId: string): Goal {
    return createGoal({
        ...currentProtocols,
        id,
        runId,
        intent: `目标 ${id}`,
        promptBundleVersion: 1,
        profile,
        maxSteps: 5,
    });
}

/** 构造一条带确定身份与来源的助手消息。 */
function assistantMessage(
    content: string,
    options: {
        readonly messageId: string;
        readonly runId: string;
        readonly order: number;
        readonly purpose: "process" | "answer" | "notice";
        readonly source: GoalMessage["source"];
    },
): GoalMessage {
    return {
        role: "assistant",
        assistant: { profileId: profile.id },
        content,
        messageId: options.messageId,
        runId: options.runId,
        position: { afterSequence: 0, order: options.order },
        purpose: options.purpose,
        source: options.source,
    };
}

test("Snapshot 编解码保留消息身份、Run 归属、用途与来源", () => {
    const base = createBaseGoal("goal-codec", "run-codec");
    const goal: Goal = {
        ...base,
        state: {
            ...base.state,
            messages: [
                ...base.state.messages,
                assistantMessage("先检查配置", {
                    messageId: "msg-process-1",
                    runId: "run-codec",
                    order: 1,
                    purpose: "process",
                    source: { kind: "model_text", modelCallId: "call-1", blockIndex: 0 },
                }),
                assistantMessage("完成", {
                    messageId: "msg-answer-1",
                    runId: "run-codec",
                    order: 2,
                    purpose: "answer",
                    source: { kind: "completion_candidate", candidateId: "candidate-1" },
                }),
                assistantMessage("需要批准", {
                    messageId: "msg-notice-1",
                    runId: "run-codec",
                    order: 3,
                    purpose: "notice",
                    source: { kind: "runtime_notice", noticeId: "notice-1" },
                }),
            ],
        },
    };

    const snapshot = goalSnapshotCodec.encode(goal);
    const encodedMessages = snapshot.state.messages;
    assert.equal(encodedMessages.length, 4);

    const restored = goalSnapshotCodec.decode(snapshot);
    assert.deepEqual(restored.state.messages, goal.state.messages);
});

test("Snapshot 中的用户消息来源与身份原样保存", () => {
    const base = createBaseGoal("goal-user-source", "run-user-source");
    const appended = appendGoalMessage(base, {
        role: "user",
        content: "补充输入",
        runId: "run-user-source",
        source: { kind: "user_input", inputId: "input-9" },
        messageId: "msg-user-9",
    });

    const snapshot = goalSnapshotCodec.encode(appended.goal);
    const encoded = snapshot.state.messages.at(-1) as GoalSnapshotMessageV1;
    assert.equal(encoded.role, "user");
    assert.equal(encoded.messageId, "msg-user-9");
    assert.equal(encoded.runId, "run-user-source");
    assert.deepEqual(encoded.source, { kind: "user_input", inputId: "input-9" });

    const restored = goalSnapshotCodec.decode(snapshot);
    assert.deepEqual(restored.state.messages.at(-1), appended.message);
});

test("真实 JsonFileGoalStore 重建后保留身份、来源、修订与消息数量", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lazygoal-goal-message-snapshot-"));
    try {
        const store = new JsonFileGoalStore(directory);
        const base = createBaseGoal("goal-file", "run-file");
        const appended = appendGoalMessage(base, {
            role: "user",
            content: "补充输入",
            runId: "run-file",
            source: { kind: "user_input", inputId: "input-file" },
            messageId: "msg-file-1",
        });
        await store.save(appended.goal);

        const raw = JSON.parse(await readFile(
            goalSnapshotPath(directory, "goal-file"),
            "utf8",
        ));
        const rawMessage = raw.state.messages.at(-1);
        assert.equal(rawMessage.messageId, "msg-file-1");
        assert.equal(rawMessage.runId, "run-file");
        assert.deepEqual(rawMessage.source, { kind: "user_input", inputId: "input-file" });

        const rebuilt = new JsonFileGoalStore(directory);
        const restored = await rebuilt.restore("goal-file");
        assert.ok(restored);
        assert.equal(restored.state.messages.length, appended.goal.state.messages.length);
        assert.deepEqual(restored.state.messages, appended.goal.state.messages);
        assert.equal(restored.state.commitRevision, appended.goal.state.commitRevision);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("重复的消息身份或重复来源在快照边界被拒绝", () => {
    const base = createBaseGoal("goal-duplicate", "run-duplicate");
    const first = appendGoalMessage(base, {
        role: "user",
        content: "第一条",
        runId: "run-duplicate",
        source: { kind: "user_input", inputId: "input-1" },
        messageId: "msg-duplicate",
    });

    const duplicateIdentity: Goal = {
        ...first.goal,
        state: {
            ...first.goal.state,
            messages: [
                ...first.goal.state.messages,
                {
                    role: "user",
                    content: "另一条",
                    messageId: "msg-duplicate",
                    runId: "run-duplicate",
                    position: { afterSequence: 0, order: 2 },
                    source: { kind: "user_input", inputId: "input-2" },
                },
            ],
        },
    };
    assert.throws(
        () => goalSnapshotCodec.encode(duplicateIdentity),
        (error: unknown) => error instanceof GoalSnapshotProtocolError,
    );

    const duplicateSource: Goal = {
        ...first.goal,
        state: {
            ...first.goal.state,
            messages: [
                ...first.goal.state.messages,
                {
                    role: "user",
                    content: "另一条",
                    messageId: "msg-other",
                    runId: "run-duplicate",
                    position: { afterSequence: 0, order: 2 },
                    source: { kind: "user_input", inputId: "input-1" },
                },
            ],
        },
    };
    assert.throws(
        () => goalSnapshotCodec.encode(duplicateSource),
        (error: unknown) => error instanceof GoalSnapshotProtocolError,
    );
});

test("缺少身份或来源的旧结构消息在快照边界被拒绝", () => {
    const base = createBaseGoal("goal-legacy", "run-legacy");
    const snapshot = goalSnapshotCodec.encode(base);
    const messages = snapshot.state.messages.map((message) => {
        const { messageId: _messageId, runId: _runId, source: _source, ...rest } = message;
        return rest;
    });

    assert.throws(
        () => goalSnapshotCodec.decode({ ...snapshot, state: { ...snapshot.state, messages } }),
        (error: unknown) => error instanceof GoalSnapshotProtocolError,
    );
});

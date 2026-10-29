import assert from "node:assert/strict";
import { test } from "node:test";

import { createContextLookupId } from "../src/context-retrieval";
import { computeSessionInputDigest, type SessionInput } from "../src/session-input";

const messageInput: SessionInput = {
    kind: "message",
    inputId: "input-1",
    content: "继续执行",
};

const steerInput: SessionInput = {
    kind: "steer",
    inputId: "input-2",
    runId: "run-1",
    content: "优先修复测试",
    queueBinding: { messageId: "message-7", queueRevision: 3 },
};

const lookupRequest = {
    kind: "context_lookup" as const,
    need: "historical_execution" as const,
    question: "读取配置文件",
    filters: {
        eventTypes: ["observation_recorded"],
        toolIds: ["read_file"],
        stepIndexes: [3, 1],
        sequenceRange: { from: 1, to: 42 },
    },
};

test("computeSessionInputDigest 固定 message 与 steer 输入的规范化摘要", () => {
    assert.equal(
        computeSessionInputDigest(messageInput),
        "sha256:6e9df727b5b2782472573ad168f563255b9704d828f35c15f4a7c39ed5871fd1",
    );
    assert.equal(
        computeSessionInputDigest(steerInput),
        "sha256:7291bf7ab7da46220b7ffa00165176d016eddfd7d0eed2a5f9a07fb6188213cb",
    );
});

test("computeSessionInputDigest 忽略 inputId 但保留载荷字段", () => {
    assert.equal(
        computeSessionInputDigest({ ...messageInput, inputId: "input-9" }),
        computeSessionInputDigest(messageInput),
    );
    assert.notEqual(
        computeSessionInputDigest({ ...messageInput, content: "其他内容" }),
        computeSessionInputDigest(messageInput),
    );
});

test("createContextLookupId 固定 Goal/Run 与规范化请求的派生身份", () => {
    assert.equal(
        createContextLookupId("goal-1", "run-1", lookupRequest),
        "lookup-13f1dee8d9f70b8c631a37e971cf4980",
    );
    assert.notEqual(
        createContextLookupId("goal-1", "run-2", lookupRequest),
        createContextLookupId("goal-1", "run-1", lookupRequest),
    );
});

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    evaluateCompactionBody,
    renderCompactionTranscript,
    selectCompactionWindow,
} from "../src/index";
import {
    testAssistantMessage,
    testUserMessage,
} from "./current-fixtures";

function conversation(): ReturnType<typeof testUserMessage>[] {
    return [
        testUserMessage("first request"),
        testAssistantMessage("first answer"),
        testUserMessage("second request"),
        testAssistantMessage("second answer"),
        testUserMessage("third request"),
        testAssistantMessage("third answer"),
        testUserMessage("fourth request"),
        testAssistantMessage("fourth answer"),
    ] as ReturnType<typeof testUserMessage>[];
}

test("selectCompactionWindow 移出较早历史并保留最近两个完整交互", () => {
    const messages = conversation();
    const window = selectCompactionWindow(messages, 0);
    assert.ok(window !== undefined);
    assert.equal(window.retainedStartIndex, 4);
    assert.deepEqual(window.evicted.map((message) => message.content), [
        "first request",
        "first answer",
        "second request",
        "second answer",
    ]);
    assert.deepEqual(window.retained.map((message) => message.content), [
        "third request",
        "third answer",
        "fourth request",
        "fourth answer",
    ]);
});

test("selectCompactionWindow 从当前 Epoch 起点开始计算", () => {
    const messages = conversation();
    const window = selectCompactionWindow(messages, 4);
    assert.equal(window, undefined, "起点之后只有两个交互时不应移出历史");
});

test("selectCompactionWindow 在交互不足时拒绝移出", () => {
    const messages = [testUserMessage("only"), testAssistantMessage("answer")];
    assert.equal(selectCompactionWindow(messages, 0), undefined);
});

test("renderCompactionTranscript 逐行投影 role 与正文并跳过空白", () => {
    const transcript = renderCompactionTranscript([
        testUserMessage("  hello  "),
        testAssistantMessage("   "),
        testAssistantMessage("done"),
    ]);
    assert.equal(transcript, "user: hello\nassistant: done");
});

test("evaluateCompactionBody 只在正文有效且确实缩减时接受", () => {
    assert.deepEqual(evaluateCompactionBody("verified finding", 100), {
        kind: "compacted",
        body: "verified finding",
    });
    assert.deepEqual(evaluateCompactionBody("  padded  ", 100), {
        kind: "compacted",
        body: "padded",
    });
    assert.deepEqual(evaluateCompactionBody(undefined, 100), { kind: "unchanged", reason: "failed" });
    assert.deepEqual(evaluateCompactionBody("   ", 100), { kind: "unchanged", reason: "invalid" });
    assert.deepEqual(evaluateCompactionBody("body", 0), { kind: "unchanged", reason: "invalid" });
    assert.deepEqual(evaluateCompactionBody("x".repeat(100), 100), { kind: "unchanged", reason: "not_reduced" });
    assert.deepEqual(evaluateCompactionBody("x".repeat(120), 100), { kind: "unchanged", reason: "not_reduced" });
});

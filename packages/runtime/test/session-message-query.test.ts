import assert from "node:assert/strict";
import { test } from "node:test";

import {
    createGoal,
    createUserMessage,
    MAX_MESSAGE_BODY_LENGTH,
    MAX_MESSAGE_LIST_CONTENT_LENGTH,
    MAX_MESSAGE_PAGE_SIZE,
    queryGoalMessages,
    readGoalMessageBody,
    type Goal,
    type GoalMessage,
} from "../src/index";
import { InMemoryGoalStore } from "../../storage/src/index";
import { currentProtocols } from "./current-fixtures";

function goalFor(goalId: string): Goal {
    return createGoal({
        ...currentProtocols,
        id: goalId,
        runId: "run-1",
        intent: "读取消息",
        promptBundleVersion: 1,
        profile: { id: "message-query", systemPrompt: "Read.", instructions: [], toolIds: [] },
    });
}

function userMessage(goal: Goal, index: number, content = `消息 ${index}`): GoalMessage {
    return createUserMessage({
        content,
        runId: goal.state.run.id,
        source: { kind: "user_input", inputId: `input-${index}` },
        position: { afterSequence: 0, order: index },
    });
}

function messagesOf(count: number): GoalMessage[] {
    const goal = goalFor("goal-messages");
    return Array.from({ length: count }, (_value, index) => userMessage(goal, index));
}

test("列表按稳定身份分页，默认 50 条且最多 100 条", () => {
    const messages = messagesOf(120);
    const first = queryGoalMessages(messages, {});
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.messages.length, 50);
    assert.equal(first.total, 120);
    assert.equal(first.nextAfterMessageId, first.messages.at(-1)?.messageId);
    assert.equal(first.throughMessageId, messages.at(-1)?.messageId);

    const invalid = queryGoalMessages(messages, { limit: MAX_MESSAGE_PAGE_SIZE + 1 });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.ok === false ? invalid.code : "", "MESSAGE_RANGE_INVALID");

    const maximum = queryGoalMessages(messages, { limit: MAX_MESSAGE_PAGE_SIZE });
    assert.equal(maximum.ok, true);
    if (!maximum.ok) return;
    assert.equal(maximum.messages.length, 100);
});

test("首批确定的范围末尾在翻页期间保持稳定，新消息不混入既定范围", () => {
    const goal = goalFor("goal-range");
    const messages = [userMessage(goal, 0), userMessage(goal, 1)];
    const first = queryGoalMessages(messages, { limit: 1 });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.messages.length, 1);
    assert.equal(first.nextAfterMessageId, messages[0]!.messageId);

    // 翻页期间追加新消息：既定范围末尾不变，新消息不混入。
    const appended = [...messages, userMessage(goal, 2)];
    const second = queryGoalMessages(appended, {
        limit: 1,
        afterMessageId: first.nextAfterMessageId,
        throughMessageId: first.throughMessageId,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.messages.length, 1);
    assert.equal(second.messages[0]?.messageId, messages[1]!.messageId);
    assert.equal(second.total, 2);
});

test("反向范围与未知身份返回明确错误", () => {
    const messages = messagesOf(3);
    const reversed = queryGoalMessages(messages, {
        afterMessageId: messages[2]!.messageId,
        throughMessageId: messages[0]!.messageId,
    });
    assert.equal(reversed.ok, false);
    assert.equal(reversed.ok === false ? reversed.code : "", "MESSAGE_RANGE_INVALID");

    const unknownThrough = queryGoalMessages(messages, { throughMessageId: "msg-unknown" });
    assert.equal(unknownThrough.ok, false);
    const unknownAfter = queryGoalMessages(messages, { afterMessageId: "msg-unknown" });
    assert.equal(unknownAfter.ok, false);
});

test("空集合返回明确的空页，而不是读取失败", () => {
    const result = queryGoalMessages([], {});
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.messages, []);
    assert.equal(result.total, 0);
    assert.equal(result.nextAfterMessageId, undefined);
    assert.equal(result.throughMessageId, undefined);
});

test("正文读取按上限截断并给出后续位置，不拆断代理项", () => {
    const goal = goalFor("goal-body");
    const long = "x".repeat(MAX_MESSAGE_BODY_LENGTH + 10);
    const message = userMessage(goal, 0, long);
    const result = readGoalMessageBody([message], message.messageId);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.entry.content.length, MAX_MESSAGE_BODY_LENGTH);
    assert.equal(result.entry.truncated, true);
    assert.equal(result.nextOffset, MAX_MESSAGE_BODY_LENGTH);

    const surrogate = userMessage(goal, 1, "a".repeat(MAX_MESSAGE_BODY_LENGTH - 1) + "😀");
    const surrogateResult = readGoalMessageBody([surrogate], surrogate.messageId);
    assert.equal(surrogateResult.ok, true);
    if (!surrogateResult.ok) return;
    const lastCodeUnit = surrogateResult.entry.content.charCodeAt(surrogateResult.entry.content.length - 1);
    // 截断边界不落在代理项中间。
    assert.equal(lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff, false);
});

test("列表正文摘要有界并明确标记截断", () => {
    const goal = goalFor("goal-preview");
    const message = userMessage(goal, 0, "y".repeat(MAX_MESSAGE_LIST_CONTENT_LENGTH + 5));
    const result = queryGoalMessages([message], {});
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.messages[0]?.content.length, MAX_MESSAGE_LIST_CONTENT_LENGTH);
    assert.equal(result.messages[0]?.truncated, true);
    assert.equal(result.messages[0]?.contentLength, MAX_MESSAGE_LIST_CONTENT_LENGTH + 5);
});

test("未知消息身份明确不存在，不返回空正文", () => {
    const result = readGoalMessageBody(messagesOf(2), "msg-unknown");
    assert.equal(result.ok, false);
    assert.equal(result.ok === false ? result.code : "", "MESSAGE_NOT_FOUND");
});

test("Session 读取按稳定身份返回列表与正文，且不写回状态", async () => {
    const store = new InMemoryGoalStore();
    const goal = goalFor("goal-session-read");
    await store.save(goal);
    const { SessionManager } = await import("../src/index");
    const sessions = new SessionManager({
        store,
        committer: { async commit() { throw new Error("读取不得提交状态"); }, async append() { return undefined; }, async saveCheckpoint() { throw new Error("读取不得保存状态"); } },
        coordinator: {} as never,
        profiles: { get: () => undefined },
        runIdGenerator: () => "run-1",
    });
    const opened = await sessions.open("goal-session-read");
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    const page = await opened.session.messages({ limit: 10 });
    assert.equal(page.ok, true);
    if (!page.ok) return;
    assert.equal(page.messages.length, 1);
    assert.equal(page.messages[0]?.role, "user");
    const body = await opened.session.message(page.messages[0]!.messageId);
    assert.equal(body.ok, true);
    if (!body.ok) return;
    assert.equal(body.entry.content, "读取消息");
    const missing = await opened.session.message("msg-unknown");
    assert.equal(missing.ok, false);
});

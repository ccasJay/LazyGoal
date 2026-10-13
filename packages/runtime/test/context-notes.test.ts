import assert from "node:assert/strict";
import { test } from "node:test";
import {
    validateAndReduceContextNotes,
    type RuntimeContextNote,
} from "../src/context-notes";

test("2.1 & 2.2: validateAndReduceContextNotes assigns stable noteId and validates user verbatimSnippet", () => {
    const committedMessages = [
        { messageId: "msg-1", role: "user" as const, content: "请务必保持向后兼容，不要破坏现有接口。" },
    ];

    // 1. 合法用户强调信息
    const validProposal = {
        category: "user_emphasis" as const,
        content: "用户要求保持接口向后兼容",
        source: {
            kind: "user_message" as const,
            messageId: "msg-1",
            verbatimSnippet: "不要破坏现有接口",
            summary: "保持接口兼容",
        },
    };

    const result = validateAndReduceContextNotes([validProposal], {
        goalId: "goal-1",
        runId: "run-1",
        committedMessages,
        existingNotes: [],
    });

    assert.equal(result.acceptedEvents.length, 1);
    const event = result.acceptedEvents[0]!;
    assert.ok(event.noteId.startsWith("note-"));
    assert.equal(event.revision, 1);
    assert.equal(event.category, "user_emphasis");
    assert.equal(event.content, "用户要求保持接口向后兼容");
    assert.equal(event.source.kind, "user_message");
});

test("2.2: 拒绝用户原文片段不符、未应用消息与跨 Goal 引用", () => {
    const committedMessages = [
        { messageId: "msg-1", role: "user" as const, content: "只支持 Node 22 环境。" },
    ];

    // 1. 原文片段不在用户消息中
    const mismatchedSnippet = {
        category: "user_emphasis" as const,
        content: "环境要求",
        source: {
            kind: "user_message" as const,
            messageId: "msg-1",
            verbatimSnippet: "支持 Python 3.12 环境", // 不在 msg-1 中
            summary: "环境要求",
        },
    };
    assert.throws(() => {
        validateAndReduceContextNotes([mismatchedSnippet], {
            goalId: "goal-1",
            runId: "run-1",
            committedMessages,
            existingNotes: [],
        });
    }, /snippet not found/i);

    // 2. 引用未应用的消息 ID
    const uncommittedMessage = {
        category: "user_emphasis" as const,
        content: "环境要求",
        source: {
            kind: "user_message" as const,
            messageId: "msg-future", // 不在 committedMessages 中
            verbatimSnippet: "任何文本",
            summary: "环境要求",
        },
    };
    assert.throws(() => {
        validateAndReduceContextNotes([uncommittedMessage], {
            goalId: "goal-1",
            runId: "run-1",
            committedMessages,
            existingNotes: [],
        });
    }, /message not found/i);
});

test("2.3 & 2.4: 区分用户决定与 Agent 方案，禁止 Agent 方案替代用户明确要求，拒绝过期修订", () => {
    const existingNotes: RuntimeContextNote[] = [
        {
            noteId: "note-user-req",
            revision: 1,
            category: "user_emphasis",
            content: "使用 TypeScript",
            source: {
                kind: "user_message",
                messageId: "msg-1",
                verbatimSnippet: "必须用 TS",
                summary: "使用 TS",
            },
        },
        {
            noteId: "note-agent-plan",
            revision: 2,
            category: "decision",
            content: "采用方案 A",
            source: {
                kind: "agent_decision",
                actionId: "act-1",
            },
        },
    ];

    // 1. Agent 方案试图显式替代用户要求 (supersedesNoteId 指向 user_emphasis)，应当被拒绝
    const illegalOverride = {
        category: "decision" as const,
        content: "改用 JavaScript",
        source: {
            kind: "agent_decision" as const,
            actionId: "act-2",
        },
        supersedesNoteId: "note-user-req",
    };
    assert.throws(() => {
        validateAndReduceContextNotes([illegalOverride], {
            goalId: "goal-1",
            runId: "run-1",
            committedMessages: [],
            existingNotes,
        });
    }, /cannot supersede user requirement/i);

    // 2. 修订已有 note 但 baseRevision 过期（当前 revision 为 2，传入 baseRevision 为 1）
    const staleRevision = {
        noteId: "note-agent-plan",
        baseRevision: 1,
        category: "decision" as const,
        content: "采用方案 A 修订版",
        source: {
            kind: "agent_decision" as const,
            actionId: "act-2",
        },
    };
    assert.throws(() => {
        validateAndReduceContextNotes([staleRevision], {
            goalId: "goal-1",
            runId: "run-1",
            committedMessages: [],
            existingNotes,
        });
    }, /stale revision/i);

    // 3. 合法修订：baseRevision 为 2，正确推进到 revision 3
    const validRevision = {
        noteId: "note-agent-plan",
        baseRevision: 2,
        category: "decision" as const,
        content: "采用方案 A 修订版",
        source: {
            kind: "agent_decision" as const,
            actionId: "act-2",
        },
    };
    const res = validateAndReduceContextNotes([validRevision], {
        goalId: "goal-1",
        runId: "run-1",
        committedMessages: [],
        existingNotes,
    });
    assert.equal(res.acceptedEvents.length, 1);
    assert.equal(res.acceptedEvents[0]!.noteId, "note-agent-plan");
    assert.equal(res.acceptedEvents[0]!.revision, 3);
});

test("修订既有记录时不提供 baseRevision 必须抛错拒绝", () => {
    const existingNotes: RuntimeContextNote[] = [
        {
            noteId: "note-1",
            revision: 1,
            category: "decision",
            content: "现有方案",
            source: { kind: "agent_decision", summary: "现有" },
        },
    ];

    const missingBaseRevision = {
        noteId: "note-1",
        category: "decision" as const,
        content: "新方案",
        source: { kind: "agent_decision" as const, summary: "新" },
    };

    assert.throws(() => {
        validateAndReduceContextNotes([missingBaseRevision], {
            goalId: "goal-1",
            runId: "run-1",
            committedMessages: [],
            existingNotes,
        });
    }, /baseRevision is required/i);
});

test("禁止将 user_emphasis 记录修订或篡改为 Agent 方案/决策", () => {
    const existingNotes: RuntimeContextNote[] = [
        {
            noteId: "note-user-1",
            revision: 1,
            category: "user_emphasis",
            content: "必须向后兼容",
            source: { kind: "user_message", messageId: "msg-0", verbatimSnippet: "必须向后兼容", summary: "兼容" },
        },
    ];

    // 尝试将 user_emphasis 修订为 Agent decision
    const tamperProposal = {
        noteId: "note-user-1",
        baseRevision: 1,
        category: "decision" as const,
        content: "重构并不保留兼容",
        source: { kind: "agent_decision" as const, summary: "放弃兼容" },
    };

    assert.throws(() => {
        validateAndReduceContextNotes([tamperProposal], {
            goalId: "goal-1",
            runId: "run-1",
            committedMessages: [{ messageId: "msg-0", role: "user", content: "必须向后兼容" }],
            existingNotes,
        });
    }, /Cannot revise user_emphasis note into agent decision/i);
});

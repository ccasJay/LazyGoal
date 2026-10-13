import assert from "node:assert/strict";
import { test } from "node:test";
import { safeParse } from "../../contracts/src/index";
import {
    AgentDecisionContract,
    ContextNoteProposalContract,
    ContextNoteCategoryContract,
    type ContextNoteProposal,
} from "../src/index";

test("2.1: ContextNoteProposal contract decodes valid decision and user_emphasis notes", () => {
    // 1. 合法用户强调信息
    const validEmphasis: ContextNoteProposal = {
        category: "user_emphasis",
        content: "用户要求保留现有接口不发生破坏性改动",
        stageId: "stage-1",
        source: {
            kind: "user_message",
            messageId: "msg-1",
            verbatimSnippet: "不要破坏现有接口",
            summary: "保持接口兼容",
        },
    };
    const parsedEmphasis = safeParse(ContextNoteProposalContract, validEmphasis);
    assert.equal(parsedEmphasis.success, true);
    if (parsedEmphasis.success) {
        assert.equal(parsedEmphasis.data.category, "user_emphasis");
        assert.equal(parsedEmphasis.data.content, "用户要求保留现有接口不发生破坏性改动");
        assert.equal(parsedEmphasis.data.source.kind, "user_message");
        if (parsedEmphasis.data.source.kind === "user_message") {
            assert.equal(parsedEmphasis.data.source.verbatimSnippet, "不要破坏现有接口");
            assert.equal(parsedEmphasis.data.source.messageId, "msg-1");
        }
    }

    // 2. 合法决策记录（用户决定）
    const validUserDecision: ContextNoteProposal = {
        category: "decision",
        content: "采用方案 B 进行重构",
        reason: "用户明确指示选择方案 B",
        source: {
            kind: "user_decision",
            messageId: "msg-2",
        },
    };
    const parsedUserDecision = safeParse(ContextNoteProposalContract, validUserDecision);
    assert.equal(parsedUserDecision.success, true);
    if (parsedUserDecision.success) {
        assert.equal(parsedUserDecision.data.category, "decision");
        assert.equal(parsedUserDecision.data.source.kind, "user_decision");
    }

    // 3. 合法决策记录（Agent 方案）
    const validAgentDecision: ContextNoteProposal = {
        category: "decision",
        content: "使用增量更新算法减少开销",
        reason: "全量更新在大型项目中性能较慢",
        stageId: "stage-alpha",
        source: {
            kind: "agent_decision",
            actionId: "act-1",
        },
        supersedesNoteId: "note-old-1",
    };
    const parsedAgentDecision = safeParse(ContextNoteProposalContract, validAgentDecision);
    assert.equal(parsedAgentDecision.success, true);
    if (parsedAgentDecision.success) {
        assert.equal(parsedAgentDecision.data.source.kind, "agent_decision");
        assert.equal(parsedAgentDecision.data.supersedesNoteId, "note-old-1");
    }

    // 4. 作为决策的附加字段挂载在常规决策（如 tool_call）上
    const toolCallWithNotes = {
        kind: "tool_call",
        action: {
            actionId: "act-1",
            toolId: "read_file",
            input: { path: "README.md" },
        },
        contextNotes: [validEmphasis, validAgentDecision],
    };
    const parsedToolCall = safeParse(AgentDecisionContract, toolCallWithNotes);
    assert.equal(parsedToolCall.success, true);
});

test("2.2 & 2.3: ContextNoteProposal rejects invalid category, missing sources, or invalid revision", () => {
    // 1. 非法分类
    const invalidCategory = {
        category: "unknown_category",
        content: "内容",
        source: { kind: "user_decision" },
    };
    assert.equal(safeParse(ContextNoteProposalContract, invalidCategory).success, false);

    // 2. user_emphasis 缺少 verbatimSnippet 原文片段
    const missingSnippet = {
        category: "user_emphasis",
        content: "用户要求",
        source: {
            kind: "user_message",
            messageId: "msg-1",
            summary: "摘要",
        },
    };
    assert.equal(safeParse(ContextNoteProposalContract, missingSnippet).success, false);

    // 3. user_emphasis 缺少 messageId
    const missingMessageId = {
        category: "user_emphasis",
        content: "用户要求",
        source: {
            kind: "user_message",
            verbatimSnippet: "原文",
            summary: "摘要",
        },
    };
    assert.equal(safeParse(ContextNoteProposalContract, missingMessageId).success, false);

    // 4. baseRevision 非法（<= 0）
    const invalidBaseRevision = {
        category: "decision",
        content: "决定",
        noteId: "note-1",
        baseRevision: 0,
        source: { kind: "user_decision" },
    };
    assert.equal(safeParse(ContextNoteProposalContract, invalidBaseRevision).success, false);
});

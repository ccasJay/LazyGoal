import assert from "node:assert/strict";
import { test } from "node:test";
import {
    modelOutputBindings,
    type ContextNoteProposal,
} from "../src/index";

function readNotes(notes: readonly ContextNoteProposal[]) {
    return modelOutputBindings.executing.wait.read({
        kind: "wait",
        reason: "等待用户确认",
        contextNotes: notes,
    }, "reject");
}

test("生成决策绑定接受合法 decision 与 user_emphasis ContextNote", () => {
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

    const parsed = readNotes([validEmphasis, validUserDecision, validAgentDecision]);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.data.contextNotes?.[0]?.category, "user_emphasis");
    assert.equal(parsed.data.contextNotes?.[0]?.content, "用户要求保留现有接口不发生破坏性改动");
    assert.equal(parsed.data.contextNotes?.[0]?.source.kind, "user_message");
    assert.equal(parsed.data.contextNotes?.[1]?.category, "decision");
    assert.equal(parsed.data.contextNotes?.[2]?.supersedesNoteId, "note-old-1");
});

test("生成绑定拒绝非法分类、缺失来源或非法修订号", () => {
    // 1. 非法分类
    assert.equal(readNotes([{
        category: "unknown_category",
        content: "内容",
        source: { kind: "user_decision" },
    } as unknown as ContextNoteProposal]).ok, false);

    // 2. user_emphasis 缺少 verbatimSnippet 原文片段
    assert.equal(readNotes([{
        category: "user_emphasis",
        content: "用户要求",
        source: {
            kind: "user_message",
            messageId: "msg-1",
            summary: "摘要",
        },
    } as unknown as ContextNoteProposal]).ok, false);

    // 3. user_emphasis 缺少 messageId
    assert.equal(readNotes([{
        category: "user_emphasis",
        content: "用户要求",
        source: {
            kind: "user_message",
            verbatimSnippet: "原文",
            summary: "摘要",
        },
    } as unknown as ContextNoteProposal]).ok, false);

    // 4. baseRevision 非法（<= 0）
    assert.equal(readNotes([{
        category: "decision",
        content: "决定",
        noteId: "note-1",
        baseRevision: 0,
        source: { kind: "user_decision" },
    }]).ok, false);
});

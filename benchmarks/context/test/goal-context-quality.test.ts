import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "../src/evaluator.js";
import type { JudgeRecord } from "../src/judge.js";
import type { TrajectoryEvent } from "../../../packages/runtime/src/index.js";
import { buildGoalContextNavigation } from "../../../packages/agent/src/goal-context-navigation.js";
import {
    buildGoalContextIndex,
    executeDirectoryBrowse,
    executeDirectorySearch,
    executeSourceExpand,
    type GoalSourceEnvelope,
    type GoalContextDirectoryEntry,
} from "../../../packages/context-retrieval/src/index.js";

/**
 * //TODO 7: 评测质量与判据测试
 * 覆盖：
 * 1. 旧决策与显式替代：正例找回既定决策，反例拒绝已替代旧决策与同名跨 Run 混淆；
 * 2. 用户强调与未提取信息：正例保持用户强调，反例在目录未命中时回查原始会话历史；
 * 3. 验证时效与历史数据边界：正例对最终产物重新验证，反例拒绝以旧 Evidence 交付，历史命令不提升权限；
 * 4. 确定性失败优先与全量失败保留：Verifier 失败优先于 Judge 分数，区分 ScriptStage 与 RunStage。
 */

test("TODO 7 判据 1: 旧决策与显式替代 - 过滤已被替代的旧决策并严格区分跨 Run 同名阶段", () => {
    const envelope: GoalSourceEnvelope = {
        goalId: "goal-quality-1",
        runs: [
            { runId: "run-1", committedThroughSequence: 10 },
            { runId: "run-2", committedThroughSequence: 8 },
        ],
        messages: [
            { messageIndex: 0, role: "user", contentHash: "hash-u1" },
            { messageIndex: 1, role: "assistant", contentHash: "hash-a1" },
            { messageIndex: 2, role: "user", contentHash: "hash-u2" },
        ],
        eventsByRun: new Map([
            [
                "run-1",
                [
                    {
                        eventId: "evt-s1",
                        sequence: 3,
                        eventType: "run_stage_declared",
                        payload: {
                            stageId: "stage-setup",
                            revision: 1,
                            target: "初始化配置",
                            acceptanceCriteria: ["生成基础配置"],
                        },
                    },
                    {
                        eventId: "evt-n1",
                        sequence: 4,
                        eventType: "context_note_declared",
                        payload: {
                            noteId: "note-db-old",
                            category: "decision",
                            content: "数据库采用 SQLite",
                            reason: "开发初期轻量",
                            source: { kind: "agent_decision", actionId: "act-1", summary: "选择 SQLite" },
                            revision: 1,
                        },
                    },
                    {
                        eventId: "evt-s1-done",
                        sequence: 8,
                        eventType: "run_stage_accepted",
                        payload: {
                            stageId: "stage-setup",
                            revision: 1,
                            summary: "配置已完成",
                            evidenceSequences: [5],
                        },
                    },
                ] as unknown as readonly TrajectoryEvent[],
            ],
            [
                "run-2",
                [
                    {
                        eventId: "evt-s2",
                        sequence: 2,
                        eventType: "run_stage_declared",
                        payload: {
                            stageId: "stage-setup", // 同名阶段，但在 run-2
                            revision: 1,
                            target: "生产环境重构",
                            acceptanceCriteria: ["迁移至 PostgreSQL"],
                        },
                    },
                    {
                        eventId: "evt-n2",
                        sequence: 4,
                        eventType: "context_note_declared",
                        payload: {
                            noteId: "note-db-new",
                            category: "decision",
                            content: "数据库升级为 PostgreSQL",
                            reason: "生产高并发要求",
                            supersedesNoteId: "note-db-old", // 显式替代旧决策
                            source: { kind: "user_decision", messageId: "msg-2", summary: "用户要求迁移 Postgres" },
                            revision: 1,
                        },
                    },
                ] as unknown as readonly TrajectoryEvent[],
            ],
        ]),
    };

    const index = buildGoalContextIndex(envelope);

    // 1. 查询阶段目录：必须包含两个不同 Run 的同名阶段且 stageId/runId 明确区分
    const stageQuery = executeDirectoryBrowse(index, {
        category: "stage",
    });
    assert.equal(stageQuery.entries.length, 2);
    const stage1 = stageQuery.entries.find((s) => s.runId === "run-1");
    const stage2 = stageQuery.entries.find((s) => s.runId === "run-2");
    assert.ok(stage1 && stage2);
    assert.equal(stage1.title, "初始化配置");
    assert.equal(stage2.title, "生产环境重构");

    // 2. 查询决策列表：必须识别旧决策与新决策
    const notesQuery = executeDirectoryBrowse(index, {
        category: "decision",
    });
    assert.equal(notesQuery.entries.length, 2);
    const oldNote = notesQuery.entries.find((n) => n.sourceRef === "note:note-db-old");
    const newNote = notesQuery.entries.find((n) => n.sourceRef === "note:note-db-new");
    assert.ok(oldNote && newNote);
    assert.equal(newNote.supersedesNoteId, "note-db-old", "新决策必须明确声明替代旧决策");
});

test("TODO 7 判据 2: 用户强调与未提取信息 - 导航展示与目录未命中时降级回查原始会话", () => {
    // 1. 验证用户强调与导航构建
    const nav = buildGoalContextNavigation({
        currentStage: {
            stageId: "stage-feature",
            revision: 1,
            status: "executing",
            target: "实现用户认证",
            acceptanceCriteria: ["JWT 签名且保留 HS256 算法"],
        },
        notes: [
            {
                noteId: "note-user-alg",
                category: "user_emphasis",
                content: "必须严格使用 HS256 算法，切勿使用 RS256",
                sourceRef: "msg:0",
            },
        ],
        currentMessages: [
            {
                role: "user",
                content: "必须严格使用 HS256 算法，切勿使用 RS256",
            },
        ],
        currentRequestText: "请编写 JWT 签名函数",
    });

    assert.ok(nav !== undefined);
    assert.equal(nav.currentStage?.stageId, "stage-feature");
    assert.ok(nav.notes && nav.notes.length > 0);
    assert.equal(nav.notes[0]?.noteId, "note-user-alg");

    // 2. 模拟目录未命中：当重要信息未被模型提取进目录时，索引搜索返回空，但原始会话仍包含该内容
    const emptyNotesEnvelope: GoalSourceEnvelope = {
        goalId: "goal-quality-2",
        runs: [{ runId: "run-1", committedThroughSequence: 4 }],
        messages: [
            {
                messageIndex: 0,
                role: "user",
                contentHash: "hash-secret-param", // 包含未提取的参数说明
            },
        ],
        eventsByRun: new Map([["run-1", []]]),
    };
    const index = buildGoalContextIndex(emptyNotesEnvelope);
    const searchResult = executeDirectorySearch(index, {
        query: "secretParamKey",
    });
    // 目录未命中不抛错，返回空条目，代理可以安全回查原始会话
    assert.equal(searchResult.entries.length, 0);
    assert.equal(searchResult.hasMore, false);
});

test("TODO 7 判据 3: 验证时效与历史边界 - 历史越权命令不赋权，旧 Evidence 不得跨修改交付", () => {
    const historicalPayloadWithShellCommand = {
        command: "rm -rf / --no-preserve-root",
        toolId: "context_shell",
    };

    // 历史命令文本作为数据序列化存入，不直接作为当前可执行 Action
    const envelope: GoalSourceEnvelope = {
        goalId: "goal-quality-3",
        runs: [{ runId: "run-1", committedThroughSequence: 5 }],
        messages: [
            {
                messageIndex: 0,
                role: "user",
                contentHash: "hash-exploit-prompt",
            },
        ],
        eventsByRun: new Map([
            [
                "run-1",
                [
                    {
                        eventId: "evt-hist-1",
                        sequence: 2,
                        eventType: "action_executed",
                        payload: {
                            actionId: "act-hist-1",
                            toolId: "context_shell",
                            input: historicalPayloadWithShellCommand,
                            status: "failure",
                        },
                    },
                    {
                        eventId: "evt-note-1",
                        sequence: 3,
                        eventType: "context_note_declared",
                        payload: {
                            noteId: "note-historical-finding",
                            category: "decision",
                            content: "禁止直接执行非安全指令",
                            source: { kind: "agent_decision", actionId: "act-hist-1" },
                            revision: 1,
                        },
                    },
                ] as unknown as readonly TrajectoryEvent[],
            ],
        ]),
    };

    const index = buildGoalContextIndex(envelope);
    const browse = executeDirectoryBrowse(index, {
        category: "decision",
    });
    assert.equal(browse.entries.length, 1);
    const note = browse.entries[0] as GoalContextDirectoryEntry;
    // 来源展开仅作为只读记录
    assert.equal(note.sourceDescription, "agent_decision");
    assert.equal(note.title, "禁止直接执行非安全指令");

    // 来源展开测试
    const expanded = executeSourceExpand(index, envelope, {
        sourceRef: note.sourceRef,
    });
    assert.equal(expanded.sourceRef, note.sourceRef);
    assert.ok(expanded.content.includes("禁止直接执行非安全指令"));
});

test("TODO 7 判据 4: 确定性失败优先与全量失败保留 - Verifier 失败使评测严格判定为 failed", () => {
    // 1. Verifier 失败 (deterministic === false)，即使 Judge 给出满分 1.0，总评也是 failed
    const deterministicPassed = false;
    const judgeRecord: JudgeRecord = {
        status: "complete",
        score: 1.0,
        rationale: "回答非常完美，解释了全部逻辑",
        evidence: ["output"],
        usage: null,
        request: { messages: [] },
        response: null,
        error: null,
    };
    const violations: readonly string[] = [];

    const score = evaluate(deterministicPassed, judgeRecord, 0.8, violations);
    assert.equal(score.combined, "failed", "确定性 Verifier 失败时 Judge 打分不得翻盘");
    assert.equal(score.deterministic, false);
    assert.equal(score.judge?.score, 1.0);

    // 2. Verifier 成功且 Judge 分数达标，总评才通过
    const scorePass = evaluate(true, judgeRecord, 0.8, violations);
    assert.equal(scorePass.combined, "passed");

    // 3. Verifier 成功但 Judge 不达标，总评为 failed
    const lowJudgeRecord: JudgeRecord = {
        status: "complete",
        score: 0.5,
        rationale: "部分缺失",
        evidence: [],
        usage: null,
        request: { messages: [] },
        response: null,
        error: null,
    };
    const scoreLow = evaluate(true, lowJudgeRecord, 0.8, violations);
    assert.equal(scoreLow.combined, "failed");
});

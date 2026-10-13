import assert from "node:assert/strict";
import { test } from "node:test";
import {
    buildGoalContextIndex,
    type GoalSourceEnvelope,
    type GoalContextIndexSnapshot,
} from "../src/goal-context-index";
import type { TrajectoryEvent } from "../../runtime/src/index";

function createDummyEvent(
    goalId: string,
    runId: string,
    sequence: number,
    eventType: TrajectoryEvent["eventType"],
    payload: any,
): TrajectoryEvent {
    return {
        eventId: `evt-${runId}-${sequence}`,
        goalId,
        runId,
        phase: "executing",
        sequence,
        timestamp: "2026-10-13T10:00:00.000Z",
        eventType,
        payload,
    } as unknown as TrajectoryEvent;
}

test("TODO 3.1: 重名阶段与多 Run 隔离，同名 stageId 在不同 Run 中独立存在", () => {
    const goalId = "goal-stage-isolation-1";
    const run1Id = "run-1";
    const run2Id = "run-2";

    const run1Events: TrajectoryEvent[] = [
        createDummyEvent(goalId, run1Id, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, run1Id, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-1",
            revision: 1,
            target: "初始化设计",
            acceptanceCriteria: ["产出规范文档"],
        }),
        createDummyEvent(goalId, run1Id, 3, "run_stage_accepted", {
            type: "run_stage_accepted",
            stageId: "stage-1",
            revision: 1,
            summary: "规范文档已完成并审查通过",
            evidenceSequences: [2],
        }),
    ];

    const run2Events: TrajectoryEvent[] = [
        createDummyEvent(goalId, run2Id, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, run2Id, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-1",
            revision: 1,
            target: "二次迭代开发",
            acceptanceCriteria: ["完成代码重构"],
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [
            { runId: run1Id, committedThroughSequence: 3 },
            { runId: run2Id, committedThroughSequence: 2 },
        ],
        messages: [
            { messageIndex: 0, role: "user", contentHash: "hash-msg-0" },
        ],
        eventsByRun: new Map([
            [run1Id, run1Events],
            [run2Id, run2Events],
        ]),
    };

    const index = buildGoalContextIndex(envelope);

    assert.equal(index.goalId, goalId);
    assert.equal(index.stages.length, 2, "应包含来自两个 Run 的独立 stage-1 条目");

    const stageRun1 = index.stages.find((s) => s.runId === run1Id && s.stageId === "stage-1");
    assert.ok(stageRun1 !== undefined);
    assert.equal(stageRun1.target, "初始化设计");
    assert.equal(stageRun1.status, "accepted");
    assert.equal(stageRun1.summary, "规范文档已完成并审查通过");

    const stageRun2 = index.stages.find((s) => s.runId === run2Id && s.stageId === "stage-1");
    assert.ok(stageRun2 !== undefined);
    assert.equal(stageRun2.target, "二次迭代开发");
    assert.equal(stageRun2.status, "executing");
    assert.equal(stageRun2.summary, undefined);
});

test("TODO 3.2: 相同 sequence 跨 Run 独立区分，来源按 (runId, sequence) 隔离", () => {
    const goalId = "goal-seq-collision-1";
    const run1Id = "run-1";
    const run2Id = "run-2";

    const run1Events: TrajectoryEvent[] = [
        createDummyEvent(goalId, run1Id, 5, "context_note_declared", {
            type: "context_note_declared",
            noteId: "note-run1-5",
            revision: 1,
            category: "decision",
            content: "Run 1 的第 5 序列决策",
            source: {
                kind: "agent_decision",
                summary: "Run 1 方案选型",
            },
        }),
    ];

    const run2Events: TrajectoryEvent[] = [
        createDummyEvent(goalId, run2Id, 5, "context_note_declared", {
            type: "context_note_declared",
            noteId: "note-run2-5",
            revision: 1,
            category: "user_emphasis",
            content: "Run 2 的第 5 序列用户强调",
            source: {
                kind: "user_message",
                messageId: "msg-0",
                verbatimSnippet: "必须保持零延迟",
            },
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [
            { runId: run1Id, committedThroughSequence: 5 },
            { runId: run2Id, committedThroughSequence: 5 },
        ],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-msg-0" }],
        eventsByRun: new Map([
            [run1Id, run1Events],
            [run2Id, run2Events],
        ]),
    };

    const index = buildGoalContextIndex(envelope);

    assert.equal(index.notes.length, 2);
    const note1 = index.notes.find((n) => n.noteId === "note-run1-5");
    assert.ok(note1 !== undefined);
    assert.equal(note1.runId, run1Id);
    assert.equal(note1.content, "Run 1 的第 5 序列决策");

    const note2 = index.notes.find((n) => n.noteId === "note-run2-5");
    assert.ok(note2 !== undefined);
    assert.equal(note2.runId, run2Id);
    assert.equal(note2.category, "user_emphasis");
});

test("TODO 3.3: 阶段拒绝后 Run 失败，阶段状态准确保留 rejected 与反馈，不制造虚假成功", () => {
    const goalId = "goal-stage-reject-1";
    const runId = "run-1";

    const events: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, runId, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-1",
            revision: 1,
            target: "构建测试套件",
            acceptanceCriteria: ["测试全绿"],
        }),
        createDummyEvent(goalId, runId, 3, "run_stage_rejected", {
            type: "run_stage_rejected",
            stageId: "stage-1",
            revision: 1,
            feedback: "覆盖率不足 80%，存在核心逻辑遗漏",
        }),
        createDummyEvent(goalId, runId, 4, "run_failed", {
            type: "run_failed",
            code: "STAGE_REJECTED",
            message: "执行中断",
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 4 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-msg-0" }],
        eventsByRun: new Map([[runId, events]]),
    };

    const index = buildGoalContextIndex(envelope);

    assert.equal(index.stages.length, 1);
    const stage = index.stages[0]!;
    assert.equal(stage.stageId, "stage-1");
    assert.equal(stage.status, "rejected");
    assert.equal(stage.rejectionFeedback, "覆盖率不足 80%，存在核心逻辑遗漏");
    assert.equal(stage.summary, undefined, "拒绝的阶段不应有接受 summary");
});

test("TODO 3.4: 重要信息显式替代与修订跟踪，保留最新生效项与替代链", () => {
    const goalId = "goal-note-supersede-1";
    const runId = "run-1";

    const events: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "context_note_declared", {
            type: "context_note_declared",
            noteId: "note-arch-1",
            revision: 1,
            category: "decision",
            content: "采用单体架构部署",
            source: { kind: "agent_decision", summary: "架构初选" },
        }),
        createDummyEvent(goalId, runId, 2, "context_note_declared", {
            type: "context_note_declared",
            noteId: "note-arch-1",
            revision: 2,
            category: "decision",
            content: "调整为微内核插件架构",
            supersedesNoteId: "note-arch-1",
            reason: "满足扩展性需求",
            source: { kind: "agent_decision", summary: "架构升级" },
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 2 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-msg-0" }],
        eventsByRun: new Map([[runId, events]]),
    };

    const index = buildGoalContextIndex(envelope);

    assert.equal(index.notes.length, 1, "note-arch-1 应归约为最新生效 revision");
    const activeNote = index.notes[0]!;
    assert.equal(activeNote.noteId, "note-arch-1");
    assert.equal(activeNote.revision, 2);
    assert.equal(activeNote.content, "调整为微内核插件架构");
    assert.equal(activeNote.reason, "满足扩展性需求");
    assert.equal(activeNote.supersedesNoteId, "note-arch-1");
});

test("TODO 3.5: 未提交 tail 严格隔离，sequence > committedThroughSequence 的事实绝不入索引", () => {
    const goalId = "goal-uncommitted-tail-1";
    const runId = "run-1";

    const events: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, runId, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-1",
            revision: 1,
            target: "已提交阶段",
            acceptanceCriteria: ["完成"],
        }),
        // 以下为未提交的 tail（序列 3 > committedThroughSequence: 2）
        createDummyEvent(goalId, runId, 3, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-2",
            revision: 1,
            target: "未提交的虚构阶段",
            acceptanceCriteria: ["不应出现"],
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 2 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-msg-0" }],
        eventsByRun: new Map([[runId, events]]),
    };

    const index = buildGoalContextIndex(envelope);

    assert.equal(index.stages.length, 1);
    assert.equal(index.stages[0]!.stageId, "stage-1");
    assert.ok(index.stages.every((s) => s.stageId !== "stage-2"), "未提交 tail 绝对不能进入阶段索引");
});

test("TODO 3.6: 确定性 sourceDigest 计算，来源变化必引发摘要改变，相同来源摘要完全一致", () => {
    const goalId = "goal-digest-1";
    const envelope1: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId: "run-1", committedThroughSequence: 2 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-a" }],
        eventsByRun: new Map([
            ["run-1", [
                createDummyEvent(goalId, "run-1", 1, "run_started", { type: "run_started" }),
                createDummyEvent(goalId, "run-1", 2, "run_stage_declared", {
                    type: "run_stage_declared",
                    stageId: "stage-1",
                    revision: 1,
                    target: "目标 A",
                    acceptanceCriteria: ["条件 A"],
                }),
            ]],
        ]),
    };

    const index1 = buildGoalContextIndex(envelope1);
    const index2 = buildGoalContextIndex(envelope1);

    assert.equal(index1.sourceDigest, index2.sourceDigest, "相同来源的 digest 必须严格一致");
    assert.ok(index1.sourceDigest.length >= 32);

    // 变动来源消息哈希
    const envelopeModifiedMsg: GoalSourceEnvelope = {
        ...envelope1,
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-b" }],
    };
    const indexModifiedMsg = buildGoalContextIndex(envelopeModifiedMsg);
    assert.notEqual(index1.sourceDigest, indexModifiedMsg.sourceDigest, "消息摘要变动必引发 sourceDigest 改变");

    // 变动 Run 提交边界
    const envelopeModifiedBoundary: GoalSourceEnvelope = {
        ...envelope1,
        runs: [{ runId: "run-1", committedThroughSequence: 3 }],
    };
    const indexModifiedBoundary = buildGoalContextIndex(envelopeModifiedBoundary);
    assert.notEqual(index1.sourceDigest, indexModifiedBoundary.sourceDigest, "Run 边界变动必引发 sourceDigest 改变");
});

test("跨 Run 提交相同 noteId 时，Goal 目录索引合并后两者皆保留且互不覆盖", () => {
    const run1Event = createDummyEvent("goal-cross-run", "run-1", 1, "context_note_declared", {
        type: "context_note_declared",
        noteId: "note-1",
        revision: 1,
        category: "decision",
        content: "Run 1 选型 SQLite",
        source: { kind: "agent_decision", summary: "Run 1 决策" },
    });
    const run2Event = createDummyEvent("goal-cross-run", "run-2", 1, "context_note_declared", {
        type: "context_note_declared",
        noteId: "note-1",
        revision: 1,
        category: "decision",
        content: "Run 2 选型 PostgreSQL",
        source: { kind: "agent_decision", summary: "Run 2 决策" },
    });

    const envelope: GoalSourceEnvelope = {
        goalId: "goal-cross-run",
        runs: [
            { runId: "run-1", committedThroughSequence: 1 },
            { runId: "run-2", committedThroughSequence: 1 },
        ],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-cross" }],
        eventsByRun: new Map([
            ["run-1", [run1Event]],
            ["run-2", [run2Event]],
        ]),
    };

    const index = buildGoalContextIndex(envelope);
    assert.equal(index.notes.length, 2, "来自两个 Run 的 note-1 必须同时保留在索引中");
    const noteRun1 = index.notes.find((n) => n.runId === "run-1");
    const noteRun2 = index.notes.find((n) => n.runId === "run-2");
    assert.ok(noteRun1 !== undefined);
    assert.ok(noteRun2 !== undefined);
    assert.equal(noteRun1.content, "Run 1 选型 SQLite");
    assert.equal(noteRun2.content, "Run 2 选型 PostgreSQL");
});

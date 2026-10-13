import assert from "node:assert/strict";
import { test } from "node:test";
import {
    buildGoalContextIndex,
    type GoalSourceEnvelope,
} from "../src/goal-context-index";
import {
    executeDirectoryBrowse,
    executeDirectorySearch,
    executeSourceExpand,
    decodeGoalContextCursor,
    encodeGoalContextCursor,
} from "../src/goal-context-query";
import {
    normalizeContextLookupRequest,
    ContextLookupProtocolError,
} from "../src/context-protocol";
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

test("TODO 4.1: 目录稳定分页 - directory_browse 支持 limit 与游标顺序翻页", () => {
    const goalId = "goal-query-page";
    const runId = "run-1";
    const events: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, runId, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-1",
            revision: 1,
            target: "阶段 1: 需求分析",
            acceptanceCriteria: ["分析文档"],
        }),
        createDummyEvent(goalId, runId, 3, "run_stage_accepted", {
            type: "run_stage_accepted",
            stageId: "stage-1",
            revision: 1,
            summary: "需求分析已完成",
            evidenceSequences: [2],
        }),
        createDummyEvent(goalId, runId, 4, "context_note_declared", {
            type: "context_note_declared",
            noteId: "note-1",
            revision: 1,
            category: "decision",
            content: "采用 TypeScript 严格模式",
            reason: "保证类型安全",
            source: { kind: "agent_decision", summary: "技术选型" },
        }),
        createDummyEvent(goalId, runId, 5, "context_note_declared", {
            type: "context_note_declared",
            noteId: "note-2",
            revision: 1,
            category: "user_emphasis",
            content: "禁止静默失败",
            source: { kind: "user_message", messageIndex: 0, quote: "禁止静默失败" },
        }),
        createDummyEvent(goalId, runId, 6, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-2",
            revision: 1,
            target: "阶段 2: 架构实现",
            acceptanceCriteria: ["核心模块实现"],
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 6 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-user-0" }],
        eventsByRun: new Map([[runId, events]]),
    };

    const index = buildGoalContextIndex(envelope);

    // 第一页，limit = 2
    const page1 = executeDirectoryBrowse(index, { limit: 2 });
    assert.equal(page1.entries.length, 2);
    assert.equal(page1.hasMore, true);
    assert.ok(page1.nextCursor !== undefined);

    // 第二页，使用游标
    const page2 = executeDirectoryBrowse(index, { limit: 2, cursor: page1.nextCursor });
    assert.equal(page2.entries.length, 2);
    assert.equal(page2.hasMore, false);

    // 两个页面中的条目互不重复，且完整覆盖全部 4 个条目（2 阶段 + 2 notes）
    const allRefs = [...page1.entries.map((e) => e.sourceRef), ...page2.entries.map((e) => e.sourceRef)];
    const uniqueRefs = new Set(allRefs);
    assert.equal(uniqueRefs.size, 4);
});

test("TODO 4.2: 来源摘要变化使游标失效 - 来源变更后旧游标明确拒绝", () => {
    const goalId = "goal-cursor-invalidation";
    const runId = "run-1";
    const events1: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, runId, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-1",
            revision: 1,
            target: "初期阶段",
            acceptanceCriteria: ["完成原型"],
        }),
    ];

    const envelope1: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 2 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-0" }],
        eventsByRun: new Map([[runId, events1]]),
    };
    const index1 = buildGoalContextIndex(envelope1);

    // 生成绑定 index1 的游标
    const cursorForIndex1 = encodeGoalContextCursor(index1.sourceDigest, 1);

    // 模拟新事件追加，索引更新导致 sourceDigest 变化
    const events2 = [
        ...events1,
        createDummyEvent(goalId, runId, 3, "run_stage_accepted", {
            type: "run_stage_accepted",
            stageId: "stage-1",
            revision: 1,
            summary: "原型通过",
            evidenceSequences: [2],
        }),
    ];
    const envelope2: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 3 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-0" }],
        eventsByRun: new Map([[runId, events2]]),
    };
    const index2 = buildGoalContextIndex(envelope2);

    assert.notEqual(index1.sourceDigest, index2.sourceDigest);

    // 使用 index1 的游标查询 index2，必须抛出游标失效错误
    assert.throws(
        () => executeDirectoryBrowse(index2, { cursor: cursorForIndex1 }),
        (error: unknown) => {
            assert.ok(error instanceof ContextLookupProtocolError);
            assert.match(error.message, /cursor has expired or source digest mismatch/i);
            return true;
        },
    );
});

test("TODO 4.3: 直接展开无需关键词搜索 - source_expand 直接返回详情", () => {
    const goalId = "goal-direct-expand";
    const runId = "run-1";
    const events: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, runId, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-init",
            revision: 1,
            target: "初始化数据库",
            acceptanceCriteria: ["表结构建立"],
        }),
        createDummyEvent(goalId, runId, 3, "run_stage_accepted", {
            type: "run_stage_accepted",
            stageId: "stage-init",
            revision: 1,
            summary: "SQLite 数据库已初始化完成",
            evidenceSequences: [2],
        }),
        createDummyEvent(goalId, runId, 4, "context_note_declared", {
            type: "context_note_declared",
            noteId: "note-arch",
            revision: 1,
            category: "decision",
            content: "存储层采用 WAL 模式",
            reason: "提高并发读取性能",
            source: { kind: "agent_decision", summary: "WAL 模式配置" },
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 4 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-user-0" }],
        eventsByRun: new Map([[runId, events]]),
    };
    const index = buildGoalContextIndex(envelope);

    // 1. 展开阶段引用
    const stageDetails = executeSourceExpand(index, envelope, {
        sourceRef: `stage:${runId}:stage-init`,
    });
    assert.equal(stageDetails.kind, "stage");
    assert.equal(stageDetails.status, "accepted");
    assert.ok(stageDetails.content.includes("SQLite 数据库已初始化完成"));
    assert.equal(stageDetails.truncated, false);

    // 2. 展开重要信息引用
    const noteDetails = executeSourceExpand(index, envelope, {
        sourceRef: "note:note-arch",
    });
    assert.equal(noteDetails.kind, "note");
    assert.ok(noteDetails.content.includes("存储层采用 WAL 模式"));
    assert.ok(noteDetails.content.includes("提高并发读取性能"));
});

test("TODO 4.4: 非法引用与越界访问明确失败，不执行文件与越权操作", () => {
    const goalId = "goal-illegal-ref";
    const runId = "run-1";
    const events: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, runId, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-1",
            revision: 1,
            target: "阶段 1",
            acceptanceCriteria: ["测试"],
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 2 }],
        messages: [{ messageIndex: 0, role: "user", contentHash: "hash-0" }],
        eventsByRun: new Map([[runId, events]]),
    };
    const index = buildGoalContextIndex(envelope);

    // 尝试传入非法的外部文件引用，必须拒绝
    assert.throws(
        () => executeSourceExpand(index, envelope, { sourceRef: "file:///etc/passwd" }),
        (err: unknown) => {
            assert.ok(err instanceof ContextLookupProtocolError);
            assert.match(err.message, /invalid sourceRef format/i);
            return true;
        },
    );

    // 尝试越界 sequence（事件 50 超出 committedThroughSequence 2）
    assert.throws(
        () => executeSourceExpand(index, envelope, { sourceRef: `event:${runId}:50` }),
        (err: unknown) => {
            assert.ok(err instanceof ContextLookupProtocolError);
            assert.match(err.message, /sequence out of committed boundary/i);
            return true;
        },
    );

    // 跨 Goal 或未知 Run 拒绝
    assert.throws(
        () => executeSourceExpand(index, envelope, { sourceRef: "stage:unknown-run:stage-1" }),
        (err: unknown) => {
            assert.ok(err instanceof ContextLookupProtocolError);
            assert.match(err.message, /runId not in source boundaries/i);
            return true;
        },
    );
});

test("TODO 4.5: 大正文截断标记与按 offset 完整继续读取", () => {
    const goalId = "goal-large-content";
    const runId = "run-1";
    // 创建一个包含长文本的事件
    const longPayloadText = "A".repeat(5000) + "B".repeat(5000);
    const events: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, runId, 2, "observation_recorded", {
            type: "observation_recorded",
            actionId: "act-1",
            observation: longPayloadText,
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 2 }],
        messages: [],
        eventsByRun: new Map([[runId, events]]),
    };
    const index = buildGoalContextIndex(envelope);

    // 第一片读取，limit 为 4000
    const part1 = executeSourceExpand(index, envelope, {
        sourceRef: `event:${runId}:2`,
        offset: 0,
        limit: 4000,
    });

    assert.equal(part1.truncated, true);
    assert.equal(part1.content.length, 4000);
    assert.equal(part1.nextOffset, 4000);
    assert.equal(part1.totalLength, longPayloadText.length);

    // 第二片继续读取，从 offset 4000 开始
    const part2 = executeSourceExpand(index, envelope, {
        sourceRef: `event:${runId}:2`,
        offset: 4000,
        limit: 4000,
    });
    assert.equal(part2.truncated, true);
    assert.equal(part2.content.length, 4000);
    assert.equal(part2.nextOffset, 8000);

    // 第三片继续读取剩余内容
    const part3 = executeSourceExpand(index, envelope, {
        sourceRef: `event:${runId}:2`,
        offset: 8000,
        limit: 4000,
    });
    assert.equal(part3.truncated, false);
    assert.equal(part3.nextOffset, undefined);

    // 拼接三部分必须还原完整原文
    assert.equal(part1.content + part2.content + part3.content, longPayloadText);
});

test("TODO 4.6: 目录搜索 directory_search 支持按关键词定位阶段与重要信息", () => {
    const goalId = "goal-dir-search";
    const runId = "run-1";
    const events: TrajectoryEvent[] = [
        createDummyEvent(goalId, runId, 1, "run_started", { type: "run_started" }),
        createDummyEvent(goalId, runId, 2, "run_stage_declared", {
            type: "run_stage_declared",
            stageId: "stage-auth",
            revision: 1,
            target: "实现 JWT 鉴权流程",
            acceptanceCriteria: ["支持 Token 签发与校验"],
        }),
        createDummyEvent(goalId, runId, 3, "context_note_declared", {
            type: "context_note_declared",
            noteId: "note-jwt",
            revision: 1,
            category: "decision",
            content: "JWT 使用 RS256 非对称签名",
            reason: "方便各微服务公钥独立验签",
            source: { kind: "agent_decision", summary: "JWT 算法选型" },
        }),
    ];

    const envelope: GoalSourceEnvelope = {
        goalId,
        runs: [{ runId, committedThroughSequence: 3 }],
        messages: [],
        eventsByRun: new Map([[runId, events]]),
    };
    const index = buildGoalContextIndex(envelope);

    // 按关键词 "RS256" 搜索目录
    const searchResult = executeDirectorySearch(index, { query: "RS256" });
    assert.equal(searchResult.entries.length, 1);
    assert.equal(searchResult.entries[0]?.sourceRef, "note:note-jwt");
    assert.ok(searchResult.entries[0]?.title.includes("RS256"));
});

test("source_expand 展开真实消息正文并支持准确切片与原文核对", () => {
    const rawMessageContent = "用户特别强调：项目配置文件必须存放在 /etc/myapp/config.yaml，且严格禁止读取环境变量。";
    const envelope: GoalSourceEnvelope = {
        goalId: "goal-msg-expand",
        runs: [{ runId: "run-1", committedThroughSequence: 1 }],
        messages: [
            {
                messageIndex: 0,
                role: "user",
                contentHash: "hash-msg-0",
                content: rawMessageContent,
            },
        ],
        eventsByRun: new Map([["run-1", []]]),
    };
    const index = buildGoalContextIndex(envelope);

    const expanded = executeSourceExpand(index, envelope, {
        sourceRef: "message:0",
        offset: 0,
        limit: 30,
    });

    assert.equal(expanded.kind, "message");
    assert.equal(expanded.truncated, true);
    assert.equal(expanded.totalLength, rawMessageContent.length);
    assert.equal(expanded.content, rawMessageContent.slice(0, 30), "必须切片返回真实消息正文，而非伪哈希正文");
});

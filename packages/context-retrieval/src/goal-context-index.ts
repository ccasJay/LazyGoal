import { createHash, randomUUID } from "node:crypto";
import type { ContextNoteSource, ContextNoteCategory } from "../../model-contracts/src/index";
import type { ContextRetrievalTrajectoryEvent } from "./context-document.js";

/**
 * 阶段目录条目。
 *
 * @remarks
 * 记录特定 Run 内某个 Stage 的最终已提交状态、目标及审查摘要。
 *
 * @example
 * ```ts
 * const entry: GoalStageEntry = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     stageId: "stage-1",
 *     revision: 1,
 *     target: "系统分析",
 *     status: "accepted",
 *     acceptanceCriteria: ["产出分析报告"],
 *     summary: "分析报告已完成",
 *     source: { firstSequence: 2, lastSequence: 5, eventIds: ["evt-2", "evt-5"] },
 * };
 * ```
 */
export interface GoalStageEntry {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 该阶段所属的 Run 标识。 */
    readonly runId: string;
    /** 阶段标识。 */
    readonly stageId: string;
    /** 阶段修订号。 */
    readonly revision: number;
    /** 阶段目标。 */
    readonly target: string;
    /** 当前已提交状态。 */
    readonly status: "executing" | "accepted" | "rejected";
    /** 阶段验收标准列表。 */
    readonly acceptanceCriteria: readonly string[];
    /** 已接受阶段的完成摘要；未接受时为 undefined。 */
    readonly summary?: string;
    /** 阶段被拒绝时的反馈原因；未被拒绝时为 undefined。 */
    readonly rejectionFeedback?: string;
    /** 来源事实范围。 */
    readonly source: {
        readonly firstSequence: number;
        readonly lastSequence: number;
        readonly eventIds: readonly string[];
    };
    /** 修订原因。 */
    readonly reason?: string;
}

/**
 * 重要信息记录条目。
 *
 * @remarks
 * 跨 Run 索引的重要信息文档，包括决策和用户强调。
 *
 * @example
 * ```ts
 * const entry: GoalNoteEntry = {
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     noteId: "note-1",
 *     revision: 1,
 *     category: "decision",
 *     content: "选用 SQLite",
 *     source: { kind: "agent_decision", summary: "数据库选型" },
 * };
 * ```
 */
export interface GoalNoteEntry {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 记录被提交时的 Run 标识。 */
    readonly runId: string;
    /** 记录标识。 */
    readonly noteId: string;
    /** 当前生效修订号。 */
    readonly revision: number;
    /** 信息类别。 */
    readonly category: ContextNoteCategory;
    /** 信息正文。 */
    readonly content: string;
    /** 决策理由。 */
    readonly reason?: string;
    /** 所属阶段标识。 */
    readonly stageId?: string;
    /** 可靠来源引用。 */
    readonly source: ContextNoteSource;
    /** 所替代的前序记录标识。 */
    readonly supersedesNoteId?: string;
}

/**
 * 来源边界信封。
 *
 * @remarks
 * 由 Runtime 根据当前 Goal Snapshot 提供的已提交边界和消息摘要，用于纯派生构建索引。
 *
 * @example
 * ```ts
 * const envelope: GoalSourceEnvelope = {
 *     goalId: "goal-1",
 *     runs: [{ runId: "run-1", committedThroughSequence: 10 }],
 *     messages: [{ messageIndex: 0, role: "user", contentHash: "hash-0" }],
 *     eventsByRun: new Map([["run-1", events]]),
 * };
 * ```
 */
export interface GoalSourceEnvelope {
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 所有参与构建的 Run 及其权威提交边界。 */
    readonly runs: readonly {
        readonly runId: string;
        readonly committedThroughSequence: number;
    }[];
    /** 消息来源摘要与真实正文。 */
    readonly messages: readonly {
        readonly messageIndex: number;
        readonly role: "user" | "assistant";
        readonly contentHash: string;
        /** 真实消息正文（用于 source_expand 原文核对）。 */
        readonly content?: string;
    }[];
    /** 按 Run 分组的 Trajectory 事件。 */
    readonly eventsByRun: ReadonlyMap<string, readonly ContextRetrievalTrajectoryEvent[]>;
}

/**
 * Goal 级派生上下文索引快照。
 *
 * @remarks
 * 保存于 `context-sidecars/<encoded-goal-id>/goal-index.json` 的派生结构。
 *
 * @example
 * ```ts
 * const snapshot: GoalContextIndexSnapshot = {
 *     schemaVersion: 1,
 *     goalId: "goal-1",
 *     buildId: "uuid",
 *     sourceBoundaries: [{ runId: "run-1", committedThroughSequence: 10 }],
 *     sourceDigest: "sha256...",
 *     stages: [],
 *     notes: [],
 *     createdAt: Date.now(),
 * };
 * ```
 */
export interface GoalContextIndexSnapshot {
    /** 快照 Schema 版本，固定为 1。 */
    readonly schemaVersion: 1;
    /** Goal 稳定标识。 */
    readonly goalId: string;
    /** 单次构建唯一标识。 */
    readonly buildId: string;
    /** 来源 Run 提交边界列表。 */
    readonly sourceBoundaries: readonly {
        readonly runId: string;
        readonly committedThroughSequence: number;
    }[];
    /** 结合边界、消息及事实生成的确定性来源哈希。 */
    readonly sourceDigest: string;
    /** 阶段目录列表。 */
    readonly stages: readonly GoalStageEntry[];
    /** 重要信息记录列表。 */
    readonly notes: readonly GoalNoteEntry[];
    /** 创建时间戳（毫秒）。 */
    readonly createdAt: number;
}

/**
 * 根据来源信封纯派生构建 Goal 上下文索引。
 *
 * @param envelope - 包含权威边界与事实的输入信封。
 * @returns 确定性排序且深冻结的 GoalContextIndexSnapshot。
 *
 * @example
 * ```ts
 * const index = buildGoalContextIndex(envelope);
 * ```
 */
export function buildGoalContextIndex(envelope: GoalSourceEnvelope): GoalContextIndexSnapshot {
    const allStages: GoalStageEntry[] = [];
    const notesMap = new Map<string, GoalNoteEntry>();

    for (const run of envelope.runs) {
        const events = envelope.eventsByRun.get(run.runId) ?? [];
        // 严格遵守边界，过滤未提交 tail
        const committedEvents = events.filter((e) => e.sequence <= run.committedThroughSequence);

        const stageEntries = new Map<string, {
            target: string;
            status: "executing" | "accepted" | "rejected";
            acceptanceCriteria: readonly string[];
            revision: number;
            summary?: string;
            rejectionFeedback?: string;
            reason?: string;
            firstSequence: number;
            lastSequence: number;
            eventIds: string[];
        }>();

        for (const event of committedEvents) {
            if (event.eventType === "run_stage_declared") {
                const p = event.payload as {
                    readonly stageId: string;
                    readonly target: string;
                    readonly acceptanceCriteria: readonly string[];
                    readonly revision: number;
                    readonly reason?: string;
                };
                const existing = stageEntries.get(p.stageId);
                stageEntries.set(p.stageId, {
                    target: p.target,
                    status: "executing",
                    acceptanceCriteria: p.acceptanceCriteria,
                    revision: p.revision,
                    ...(p.reason !== undefined ? { reason: p.reason } : {}),
                    firstSequence: existing !== undefined ? existing.firstSequence : event.sequence,
                    lastSequence: event.sequence,
                    eventIds: existing !== undefined ? [...existing.eventIds, event.eventId] : [event.eventId],
                });
            } else if (event.eventType === "run_stage_accepted") {
                const p = event.payload as {
                    readonly stageId: string;
                    readonly revision: number;
                    readonly summary?: string;
                };
                const existing = stageEntries.get(p.stageId);
                if (existing !== undefined) {
                    existing.status = "accepted";
                    existing.revision = p.revision;
                    if (p.summary !== undefined) existing.summary = p.summary;
                    existing.lastSequence = event.sequence;
                    existing.eventIds.push(event.eventId);
                }
            } else if (event.eventType === "run_stage_rejected") {
                const p = event.payload as {
                    readonly stageId: string;
                    readonly revision: number;
                    readonly feedback: string;
                };
                const existing = stageEntries.get(p.stageId);
                if (existing !== undefined) {
                    existing.status = "rejected";
                    existing.revision = p.revision;
                    existing.rejectionFeedback = p.feedback;
                    existing.lastSequence = event.sequence;
                    existing.eventIds.push(event.eventId);
                }
            } else if (event.eventType === "context_note_declared") {
                const p = event.payload as {
                    readonly noteId: string;
                    readonly revision: number;
                    readonly category: ContextNoteCategory;
                    readonly content: string;
                    readonly reason?: string;
                    readonly stageId?: string;
                    readonly source: ContextNoteSource;
                    readonly supersedesNoteId?: string;
                };
                const noteKey = `${run.runId}:${p.noteId}`;
                notesMap.set(noteKey, {
                    goalId: envelope.goalId,
                    runId: run.runId,
                    noteId: p.noteId,
                    revision: p.revision,
                    category: p.category,
                    content: p.content,
                    ...(p.reason !== undefined ? { reason: p.reason } : {}),
                    ...(p.stageId !== undefined ? { stageId: p.stageId } : {}),
                    source: p.source as ContextNoteSource,
                    ...(p.supersedesNoteId !== undefined ? { supersedesNoteId: p.supersedesNoteId } : {}),
                });
            }
        }

        for (const [stageId, data] of stageEntries.entries()) {
            allStages.push({
                goalId: envelope.goalId,
                runId: run.runId,
                stageId,
                revision: data.revision,
                target: data.target,
                status: data.status,
                acceptanceCriteria: data.acceptanceCriteria,
                ...(data.summary !== undefined ? { summary: data.summary } : {}),
                ...(data.rejectionFeedback !== undefined ? { rejectionFeedback: data.rejectionFeedback } : {}),
                ...(data.reason !== undefined ? { reason: data.reason } : {}),
                source: {
                    firstSequence: data.firstSequence,
                    lastSequence: data.lastSequence,
                    eventIds: data.eventIds,
                },
            });
        }
    }

    // 确定性排序
    allStages.sort((a, b) => {
        const runCmp = a.runId.localeCompare(b.runId);
        if (runCmp !== 0) return runCmp;
        return a.stageId.localeCompare(b.stageId);
    });

    const notesList = [...notesMap.values()];
    notesList.sort((a, b) => {
        const idCmp = a.noteId.localeCompare(b.noteId);
        if (idCmp !== 0) return idCmp;
        return a.runId.localeCompare(b.runId);
    });

    // 计算确定性 sourceDigest
    const hash = createHash("sha256");
    hash.update(`goalId:${envelope.goalId}\n`);
    for (const r of envelope.runs) {
        hash.update(`run:${r.runId}:${r.committedThroughSequence}\n`);
    }
    for (const m of envelope.messages) {
        hash.update(`msg:${m.messageIndex}:${m.role}:${m.contentHash}\n`);
    }
    for (const s of allStages) {
        hash.update(`stage:${s.runId}:${s.stageId}:${s.revision}:${s.status}:${s.summary ?? ""}:${s.rejectionFeedback ?? ""}\n`);
    }
    for (const n of notesList) {
        hash.update(`note:${n.runId}:${n.noteId}:${n.revision}:${n.category}:${n.content}:${n.supersedesNoteId ?? ""}\n`);
    }
    const sourceDigest = hash.digest("hex");

    return Object.freeze({
        schemaVersion: 1 as const,
        goalId: envelope.goalId,
        buildId: randomUUID(),
        sourceBoundaries: envelope.runs.map((r) => ({
            runId: r.runId,
            committedThroughSequence: r.committedThroughSequence,
        })),
        sourceDigest,
        stages: Object.freeze(allStages),
        notes: Object.freeze(notesList),
        createdAt: Date.now(),
    });
}

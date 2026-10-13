import type {
    ContextNoteCategory,
    ContextNoteProposal,
    ContextNoteSource,
} from "../../model-contracts/src/index";

export type {
    ContextNoteCategory,
    ContextNoteProposal,
    ContextNoteSource,
};

/**
 * 已提交的重要信息记录。
 *
 * @remarks
 * Runtime 在 Trajectory 中提交的只读重要信息事实。
 *
 * @example
 * ```ts
 * const note: RuntimeContextNote = {
 *     noteId: "note-1",
 *     revision: 1,
 *     category: "user_emphasis",
 *     content: "保留向后兼容",
 *     source: {
 *         kind: "user_message",
 *         messageId: "msg-1",
 *         verbatimSnippet: "保留向后兼容",
 *         summary: "兼容性要求",
 *     },
 * };
 * ```
 */
export interface RuntimeContextNote {
    /** 稳定记录身份。 */
    readonly noteId: string;
    /** 当前修订版本号（正整数）。 */
    readonly revision: number;
    /** 类别：决策或用户强调。 */
    readonly category: ContextNoteCategory;
    /** 简明内容。 */
    readonly content: string;
    /** 简明理由（针对决策）。 */
    readonly reason?: string;
    /** 关联的稳定阶段身份。 */
    readonly stageId?: string;
    /** 发生来源。 */
    readonly source: ContextNoteSource;
    /** 显式替代的旧记录标识。 */
    readonly supersedesNoteId?: string;
}

/**
 * 校验上下文参数。
 */
export interface ContextNoteReductionContext {
    readonly goalId: string;
    readonly runId: string;
    readonly currentStageId?: string;
    readonly committedMessages: readonly { readonly messageId?: string; readonly role: string; readonly content: string }[];
    readonly existingNotes: readonly RuntimeContextNote[];
}

/**
 * 校验与归约结果。
 */
export interface ContextNoteReductionResult {
    readonly acceptedEvents: readonly RuntimeContextNote[];
}

/**
 * 纯验证并归约模型提出的重要信息记录。
 *
 * @remarks
 * 严格执行以下业务校验：
 * 1. user_emphasis 必须引用真实已应用的当前 Goal 用户消息，且原文片段必须在用户消息正文中存在；
 * 2. 禁止 Agent 方案替代用户明确要求（supersedesNoteId 指向 user_emphasis 记录被拒绝）；
 * 3. 修订既有记录时 baseRevision 必须显式提供且匹配当前最新版本，防止未指定版本或基于过期信息修改；
 * 4. 禁止将 user_emphasis 记录修订或篡改为 Agent 方案/决策；
 * 5. 自动分配稳定且连续唯一的 noteId 与单调递增 revision。
 *
 * @param proposals - 模型提议的重要信息列表。
 * @param context - 验证所需的权威上下文。
 * @returns 验证通过并分配了身份与版本的记录事件列表。
 * @throws 违反来源真实性、替代权限或版本一致性时抛出异常。
 *
 * @example
 * ```ts
 * const result = validateAndReduceContextNotes(proposals, context);
 * ```
 */
export function validateAndReduceContextNotes(
    proposals: readonly ContextNoteProposal[],
    context: ContextNoteReductionContext,
): ContextNoteReductionResult {
    const { committedMessages, existingNotes, currentStageId } = context;
    const acceptedEvents: RuntimeContextNote[] = [];

    // 构建现有 notes 索引与版本映射
    const notesMap = new Map<string, RuntimeContextNote>();
    for (const note of existingNotes) {
        notesMap.set(note.noteId, note);
    }

    let maxSequence = 0;
    for (const note of existingNotes) {
        const match = /^note-(\d+)$/.exec(note.noteId);
        if (match) {
            const val = parseInt(match[1]!, 10);
            if (val > maxSequence) {
                maxSequence = val;
            }
        }
    }
    let noteSequence = Math.max(existingNotes.length, maxSequence);

    for (const proposal of proposals) {
        // 1. 校验分类与来源匹配
        if (proposal.category === "user_emphasis") {
            if (proposal.source.kind !== "user_message") {
                throw new Error("user_emphasis notes must have source kind user_message");
            }
            const { messageId, verbatimSnippet } = proposal.source;
            const targetMessage = committedMessages.find(
                (m) => m.role === "user" && m.messageId === messageId,
            );
            if (!targetMessage) {
                throw new Error(`Message not found: ${messageId}`);
            }
            if (!targetMessage.content.includes(verbatimSnippet)) {
                throw new Error(`Verbatim snippet not found in message: ${verbatimSnippet}`);
            }
        }

        // 2. 校验显式替代关系
        if (proposal.supersedesNoteId !== undefined) {
            const targetOldNote = notesMap.get(proposal.supersedesNoteId);
            if (!targetOldNote) {
                throw new Error(`Superseded note not found: ${proposal.supersedesNoteId}`);
            }
            // Agent 方案不得替代用户要求
            if (proposal.source.kind === "agent_decision" && targetOldNote.category === "user_emphasis") {
                throw new Error("Agent decision cannot supersede user requirement");
            }
        }

        // 3. 校验修订或创建新记录
        let noteId: string;
        let revision: number;

        if (proposal.noteId !== undefined) {
            const existing = notesMap.get(proposal.noteId);
            if (!existing) {
                throw new Error(`Note not found for revision: ${proposal.noteId}`);
            }
            if (proposal.baseRevision === undefined) {
                throw new Error("baseRevision is required when revising a note");
            }
            if (proposal.baseRevision !== existing.revision) {
                throw new Error(`Stale revision: expected ${existing.revision}, got ${proposal.baseRevision}`);
            }
            if (existing.category === "user_emphasis" && (proposal.category !== "user_emphasis" || proposal.source.kind === "agent_decision")) {
                throw new Error("Cannot revise user_emphasis note into agent decision");
            }
            noteId = existing.noteId;
            revision = existing.revision + 1;
        } else {
            noteSequence += 1;
            noteId = `note-${noteSequence}`;
            revision = 1;
        }

        const resolvedStageId = proposal.stageId ?? currentStageId;
        const acceptedNote: RuntimeContextNote = {
            noteId,
            revision,
            category: proposal.category,
            content: proposal.content,
            ...(proposal.reason !== undefined ? { reason: proposal.reason } : {}),
            ...(resolvedStageId !== undefined ? { stageId: resolvedStageId } : {}),
            source: proposal.source,
            ...(proposal.supersedesNoteId !== undefined ? { supersedesNoteId: proposal.supersedesNoteId } : {}),
        };

        // 更新临时索引支持同一批次后续修订或替代
        notesMap.set(noteId, acceptedNote);
        acceptedEvents.push(acceptedNote);
    }

    return { acceptedEvents };
}

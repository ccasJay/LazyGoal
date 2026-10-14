import type { RunStageState } from "../../runtime/src/domain";
import type { RuntimeContextNote } from "../../runtime/src/context-notes";
import type {
    ModelConversationMessage,
    ModelGoalContextNavigationCurrentStage,
    ModelGoalContextNavigationNoteEntry,
    ModelGoalContextNavigationStageEntry,
    ModelGoalContextNavigationView,
    ModelRunStageView,
} from "./model-inference-view";
import { compareCodeUnits } from "./prompting/environment";

/**
 * 导航视图支持的历史阶段输入形态。
 *
 * @remarks
 * 结构兼容 `GoalStageEntry`、`ModelGoalContextNavigationStageEntry` 等多形态数据。
 *
 * @example
 * ```ts
 * const stageInput: GoalContextNavigationHistoricalStageInput = {
 *     stageId: "stg-1",
 *     target: "初始任务",
 *     status: "completed",
 * };
 * ```
 */
export interface GoalContextNavigationHistoricalStageInput {
    readonly stageId: string;
    readonly runId?: string | undefined;
    readonly revision?: number | undefined;
    readonly target: string;
    readonly status: string;
    readonly summary?: string | undefined;
    readonly sourceRef?: string | undefined;
    readonly source?: unknown;
}

/**
 * 导航视图支持的决策或用户强调输入形态。
 *
 * @remarks
 * 结构兼容 `GoalNoteEntry`、`RuntimeContextNote`、`ModelGoalContextNavigationNoteEntry` 等多形态数据。
 *
 * @example
 * ```ts
 * const noteInput: GoalContextNavigationNoteInput = {
 *     noteId: "note-1",
 *     category: "decision",
 *     content: "选择方案 A",
 * };
 * ```
 */
export interface GoalContextNavigationNoteInput {
    readonly noteId: string;
    readonly category: "decision" | "user_emphasis";
    readonly content: string;
    readonly sourceRef?: string | undefined;
    readonly supersedesNoteId?: string | undefined;
    readonly sourceMessageContent?: string | undefined;
    readonly source?: unknown;
}

/**
 * 构建目标工作导航视图的输入参数。
 *
 * @remarks
 * 包含当前阶段状态、已归档历史阶段、已提交重要决策与用户强调、当前会话消息以及预算配置。
 *
 * @example
 * ```ts
 * const options: GoalContextNavigationBuildOptions = {
 *     currentStage,
 *     currentRequestText: "配置迁移",
 *     budget: { maxHistoricalEntries: 5 },
 * };
 * ```
 */
export interface GoalContextNavigationBuildOptions {
    /** 当前活动阶段；未开启阶段时省略。 */
    readonly currentStage?: RunStageState | ModelRunStageView | ModelGoalContextNavigationCurrentStage | undefined;
    /** 当前活动 Run 的稳定标识（用于跨 Run 隔离同名 stageId，避免历史同名阶段被误判为当前阶段而隐藏）。 */
    readonly currentRunId?: string | undefined;
    /** 历史已提交阶段列表。 */
    readonly historicalStages?: readonly (ModelGoalContextNavigationStageEntry | GoalContextNavigationHistoricalStageInput)[] | undefined;
    /** 重要信息与决策记录列表。 */
    readonly notes?: readonly (RuntimeContextNote | ModelGoalContextNavigationNoteEntry | GoalContextNavigationNoteInput)[] | undefined;
    /** 当前真实会话消息（用于长正文去重引用）。 */
    readonly currentMessages?: readonly ModelConversationMessage[] | readonly { readonly role: string; readonly content: string }[] | undefined;
    /** 当前用户请求或阶段目标文本（用于相关性打分与排序）。 */
    readonly currentRequestText?: string | undefined;
    /** 预算限制选项。 */
    readonly budget?: {
        readonly maxHistoricalEntries?: number;
        readonly maxCharacters?: number;
    } | undefined;
}

function extractKeywords(text: string): readonly string[] {
    return text
        .toLowerCase()
        .split(/[\s,.;:!?_/\-\\\(\)\[\]{}'"]+/)
        .filter((word) => word.length > 1);
}

function scoreRelevance(targetText: string, keywords: readonly string[]): number {
    if (keywords.length === 0) return 0;
    const lower = targetText.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
        if (lower.includes(kw)) {
            score += 1;
        }
    }
    return score;
}

/**
 * 纯函数：从当前阶段与已提交历史中构建有界目标工作导航。
 *
 * @remarks
 * 严格落实如下契约：
 * 1. 优先保留当前阶段及审查拒绝缺口、上一结果与明确依赖入口；
 * 2. 没有阶段和重要信息时不制造历史占位事实（返回 `undefined`）；
 * 3. 历史条目按与当前请求/阶段目标的确定性相关性与稳定身份排序；
 * 4. 目录条目超出预算限制时裁剪历史项，并提供省略标记与继续查询入口；
 * 5. 去重保护：对已存在于当前对话中的用户消息来源，仅暴露引用身份与简明片段，不重复输出大正文。
 *
 * @param options - 导航构建参数。
 * @returns 目标工作导航视图；若无阶段事实则返回 `undefined`。
 *
 * @example
 * ```ts
 * const nav = buildGoalContextNavigation({
 *     currentStage,
 *     notes: [],
 * });
 * ```
 */
export function buildGoalContextNavigation(
    options: GoalContextNavigationBuildOptions,
): ModelGoalContextNavigationView | undefined {
    const rawStage = options.currentStage;
    const hasCurrentStage = rawStage !== undefined;
    const rawHistStages = options.historicalStages ?? [];
    const rawNotes = options.notes ?? [];

    if (!hasCurrentStage && rawHistStages.length === 0 && rawNotes.length === 0) {
        return undefined;
    }

    let currentStage: ModelGoalContextNavigationCurrentStage | undefined;
    if (rawStage !== undefined) {
        currentStage = {
            stageId: rawStage.stageId,
            revision: rawStage.revision,
            status: rawStage.status,
            target: rawStage.target,
            acceptanceCriteria: [...rawStage.acceptanceCriteria],
            ...(rawStage.previousStageResultRef !== undefined
                ? { previousStageResultRef: { ...rawStage.previousStageResultRef } }
                : {}),
            ...(rawStage.latestReviewRejection !== undefined
                ? { latestReviewRejection: { ...rawStage.latestReviewRejection } }
                : {}),
        };
    }

    const queryKeywords = options.currentRequestText !== undefined
        ? extractKeywords(options.currentRequestText)
        : (currentStage !== undefined ? extractKeywords(currentStage.target) : []);

    // 格式化与去重 notes
    const formattedNotes: ModelGoalContextNavigationNoteEntry[] = [];
    for (const note of rawNotes) {
        let content = note.content;
        let sourceRef = ("sourceRef" in note && typeof note.sourceRef === "string")
            ? note.sourceRef
            : ("source" in note && typeof note.source === "object" && note.source !== null && "kind" in note.source)
                ? (note.source.kind === "user_message"
                    ? `msg_user_${(note.source as { messageId?: string }).messageId ?? "ref"}`
                    : "committed_fact")
                : "ref";

        // 去重检查：若引用的来源在当前会话中存在，截短内容以避免重复大正文
        if (options.currentMessages !== undefined) {
            const isFromCurrentMessage = options.currentMessages.some((msg) =>
                msg.content.includes(content) || (msg.content.length > 50 && content.length > 50 && msg.content.startsWith(content.slice(0, 40))),
            );
            if (isFromCurrentMessage && content.length > 80) {
                content = `${content.slice(0, 60)}... (详见消息原文)`;
            }
        }

        formattedNotes.push({
            noteId: note.noteId,
            category: note.category,
            content,
            sourceRef,
            ...(note.supersedesNoteId !== undefined ? { supersedesNoteId: note.supersedesNoteId } : {}),
        });
    }

    // 格式化历史阶段
    const formattedHistStages: ModelGoalContextNavigationStageEntry[] = [];
    for (const stage of rawHistStages) {
        // 如果与当前阶段相同（同 runId + stageId 且处于 executing 状态），不作为历史阶段重复列出
        const stageRunId = ("runId" in stage && typeof stage.runId === "string") ? stage.runId : undefined;
        const isSameRun = options.currentRunId === undefined || stageRunId === undefined || stageRunId === options.currentRunId;
        if (currentStage !== undefined && stage.stageId === currentStage.stageId && isSameRun && stage.status === "executing") {
            continue;
        }
        const stageStatus = (stage.status === "accepted" || stage.status === "rejected" || stage.status === "executing")
            ? stage.status
            : "accepted";
        formattedHistStages.push({
            stageId: stage.stageId,
            runId: ("runId" in stage && typeof stage.runId === "string") ? stage.runId : "run-0",
            revision: stage.revision ?? 1,
            target: stage.target,
            status: stageStatus,
            ...(stage.summary !== undefined ? { summary: stage.summary } : {}),
            ...(("sourceRef" in stage && typeof stage.sourceRef === "string")
                ? { sourceRef: stage.sourceRef }
                : ("source" in stage && typeof stage.source === "object" && stage.source !== null)
                    ? { sourceRef: `seq_${(stage.source as { firstSequence?: number }).firstSequence ?? 0}` }
                    : {}),
        });
    }

    // 相关性与确定性排序
    const scoredStages = formattedHistStages.map((st) => ({
        entry: st,
        score: scoreRelevance(`${st.target} ${st.summary ?? ""}`, queryKeywords),
    }));
    scoredStages.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return compareCodeUnits(a.entry.stageId, b.entry.stageId);
    });

    const scoredNotes = formattedNotes.map((nt) => ({
        entry: nt,
        score: scoreRelevance(nt.content, queryKeywords),
    }));
    scoredNotes.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return compareCodeUnits(a.entry.noteId, b.entry.noteId);
    });

    // 预算控制
    const maxEntries = options.budget?.maxHistoricalEntries ?? 8;
    const stageLimit = Math.max(1, Math.floor(maxEntries / 2));
    const noteLimit = maxEntries - stageLimit;

    const keptStages = scoredStages.slice(0, stageLimit).map((s) => s.entry);
    const omittedStagesCount = scoredStages.length - keptStages.length;

    const keptNotes = scoredNotes.slice(0, noteLimit).map((n) => n.entry);
    const omittedNotesCount = scoredNotes.length - keptNotes.length;

    const omittedCount = omittedStagesCount + omittedNotesCount;
    const hasMore = omittedCount > 0;

    return Object.freeze({
        ...(currentStage !== undefined ? { currentStage: Object.freeze(currentStage) } : {}),
        ...(keptStages.length > 0 ? { historicalStages: Object.freeze(keptStages) } : {}),
        ...(keptNotes.length > 0 ? { notes: Object.freeze(keptNotes) } : {}),
        ...(omittedCount > 0 ? { omittedCount } : {}),
        ...(hasMore ? { hasMore: true } : {}),
    });
}

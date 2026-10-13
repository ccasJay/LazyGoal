import type { ContextDocumentSource } from "./context-document";
import type { ContextLookupOperation } from "../../model-contracts/src/index";

/** 检索结果中的稳定字段名称。 */
export type ContextLookupMatchedField =
    | "eventType"
    | "toolId"
    | "actionId"
    | "stepIndex"
    | "path"
    | "errorCode"
    | "objectId"
    | "body";

/**
 * 一个可作为历史读取来源的 Goal/Run 提交边界。
 *
 * @remarks
 * `committedThroughSequence` 只在该 `runId` 的局部 Trajectory 内有效；跨 Run
 * 查询必须同时携带两者，不能把相同的局部 sequence 当作同一条事实。
 *
 * @example
 * ```ts
 * const source: ContextLookupRunBoundary = {
 *     runId: "run-1",
 *     committedThroughSequence: 12,
 * };
 * ```
 */
export interface ContextLookupRunBoundary {
    /** 来源 Run 的稳定 ID。 */
    readonly runId: string;
    /** 该 Run 最新有效 Snapshot 的 committed sequence。 */
    readonly committedThroughSequence: number;
}

/**
 * 一条完整 Context Document 的有界历史命中。
 *
 * @remarks
 * 命中文档包含稳定的 documentId、所属 Goal/Run、覆盖 sequence 闭区间、BM25-lite 分数
 * 及字段信息。该命中永远代表历史事实，不代表当前工作区状态。
 *
 * @example
 * ```ts
 * const match: ContextLookupMatch = {
 *     documentId: "doc-1",
 *     goalId: "goal-1",
 *     runId: "run-1",
 *     firstSequence: 1,
 *     lastSequence: 5,
 *     matchedFields: ["toolId", "path"],
 *     score: 12.345678,
 *     preview: "read_file: src/index.ts",
 *     truncated: false,
 *     historical: true,
 *     sourceEventIds: ["evt-1", "evt-2"],
 * };
 * ```
 */
export interface ContextLookupMatch {
    /** Context Document 的稳定 ID。 */
    readonly documentId: string;
    /** 命中来源 Goal/Run。 */
    readonly goalId: string;
    readonly runId: string;
    /** 命中文档覆盖的 committed sequence 闭区间。 */
    readonly firstSequence: number;
    readonly lastSequence: number;
    /** 参与评分的字段集合，按稳定顺序排列。 */
    readonly matchedFields: readonly ContextLookupMatchedField[];
    /** 版本化 BM25-lite 分数，已舍入到 6 位小数。 */
    readonly score: number;
    /** 有界的历史文档预览。 */
    readonly preview: string;
    /** 预览或文档是否被有界输出替代。 */
    readonly truncated: boolean;
    /** 是否为排名之外、用于保持因果关系的相邻文档。 */
    readonly adjacent?: boolean;
    /** 该命中永远是历史来源，不代表当前 Workspace 状态。 */
    readonly historical: true;
    /** 原始 committed 事件引用。 */
    readonly sourceEventIds: readonly string[];
    /** 统一 fielded-bm25-lite-v1 索引的来源引用；Conversation 命中不要求 Trajectory event ID。 */
    readonly source?: ContextDocumentSource;
}

/**
 * Goal 目录检索或浏览返回的单项摘要条目。
 *
 * @remarks
 * 面向 Agent 的结构化目录条目，包含稳定引用 `sourceRef`、所属 Run 与阶段、
 * 目标/内容、状态、摘要及替代关系。
 *
 * @example
 * ```ts
 * const entry: GoalContextDirectoryEntry = {
 *     sourceRef: "stage:run-1:stage-1",
 *     category: "stage",
 *     runId: "run-1",
 *     stageId: "stage-1",
 *     title: "初始化架构",
 *     status: "accepted",
 *     summary: "已完成基础骨架构建",
 *     sourceDescription: "events: 2-5",
 * };
 * ```
 */
export interface GoalContextDirectoryEntry {
    /** 条目唯一引用标识，用于 source_expand。 */
    readonly sourceRef: string;
    /** 所属类别。 */
    readonly category: "stage" | "decision" | "user_emphasis";
    /** 所属 Run 标识。 */
    readonly runId: string;
    /** 所属阶段标识（若有）。 */
    readonly stageId?: string;
    /** 标识名称或简述（阶段目标或重要信息内容）。 */
    readonly title: string;
    /** 状态（executing / accepted / rejected / active / superseded）。 */
    readonly status: string;
    /** 结果摘要或决策理由。 */
    readonly summary?: string;
    /** 原始来源范围或类型。 */
    readonly sourceDescription: string;
    /** 是否被后续版本替代。 */
    readonly superseded?: boolean;
    /** 替代它的条目标识或 noteId。 */
    readonly supersedesNoteId?: string;
}

/**
 * 直接展开来源详情的结果。
 *
 * @remarks
 * 无需关键词搜索直接定位阶段、信息记录、原始消息或轨迹事件的详细正文，
 * 包含有界截断、总长度与继续读取偏移量。
 *
 * @example
 * ```ts
 * const expanded: GoalContextExpandedSource = {
 *     sourceRef: "stage:run-1:stage-1",
 *     kind: "stage",
 *     runId: "run-1",
 *     title: "阶段 1 详情",
 *     content: "完整阶段验收标准与摘要",
 *     status: "accepted",
 *     truncated: false,
 *     totalLength: 120,
 * };
 * ```
 */
export interface GoalContextExpandedSource {
    /** 被展开的引用标识。 */
    readonly sourceRef: string;
    /** 来源类别。 */
    readonly kind: "stage" | "note" | "message" | "event";
    /** 所属 Run 标识。 */
    readonly runId?: string;
    /** 来源标题或摘要。 */
    readonly title: string;
    /** 完整详情文本（或当前分页文本）。 */
    readonly content: string;
    /** 该来源是否被标记为替代或失效。 */
    readonly status: string;
    /** 该正文是否因为超过单次上限被截断。 */
    readonly truncated: boolean;
    /** 下一读取偏移量；若未截断或已读完则为 undefined。 */
    readonly nextOffset?: number;
    /** 总字符数。 */
    readonly totalLength: number;
    /** 原始元数据（如 sequence 范围、时间、角色等）。 */
    readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Context Lookup 的结构化结果；未命中与故障必须保持可区分。
 *
 * @remarks
 * 包含 `found`、`not_found`、`lookup_error` 三种判别联合状态。
 * 支持 history_search 的 matches，以及目录操作的 directoryEntries 与 expandedSource。
 *
 * @example
 * ```ts
 * const result: ContextLookupResult = {
 *     status: "not_found",
 *     lookupId: "lookup-1",
 *     reason: "no_context_match",
 * };
 * ```
 */
export type ContextLookupResult =
    | {
        readonly status: "found";
        readonly lookupId: string;
        readonly committedThroughSequence: number;
        /** 规范化 query/filters 的稳定摘要；缺失时由 Runtime 补齐。 */
        readonly queryHash?: string;
        /** 产生该结果的索引协议版本；缺失时由 Runtime 补齐。 */
        readonly indexVersion?: string;
        readonly matches: readonly ContextLookupMatch[];
        readonly truncated: boolean;
        /** found 命中涉及的全部 Run 边界；缺省表示仅当前 Run。 */
        readonly sourceRunBoundaries?: readonly ContextLookupRunBoundary[];
        /** 本次执行的操作类别。 */
        readonly operation?: ContextLookupOperation;
        /** 目录浏览或目录搜索的条目列表。 */
        readonly directoryEntries?: readonly GoalContextDirectoryEntry[];
        /** 来源直接展开的详情内容。 */
        readonly expandedSource?: GoalContextExpandedSource;
        /** 分页游标。 */
        readonly nextCursor?: string;
        /** 是否还有更多结果。 */
        readonly hasMore?: boolean;
    }
    | {
        readonly status: "not_found";
        readonly lookupId: string;
        readonly committedThroughSequence?: number;
        readonly reason?: string;
        readonly operation?: ContextLookupOperation;
    }
    | {
        readonly status: "lookup_error";
        readonly lookupId: string;
        readonly code: string;
        readonly message: string;
        readonly committedThroughSequence?: number;
        readonly operation?: ContextLookupOperation;
    };

/** Context Lookup 结果的固定协议版本。 */
export const CONTEXT_LOOKUP_RESULT_VERSION = "context-lookup-result-v1" as const;

/** BM25-lite 结果未显式携带版本时使用的索引版本。 */
export const CONTEXT_LOOKUP_DEFAULT_INDEX_VERSION = "fielded-bm25-lite-v1" as const;

/** 单次查询允许返回的完整文档命中上限（主命中与相邻扩展合计）。 */
export const CONTEXT_LOOKUP_MAX_MATCHES = 15;

/** 单个历史预览的 UTF-16 字符上限；原始文档仍保留在 Trajectory。 */
export const CONTEXT_LOOKUP_MAX_PREVIEW_LENGTH = 8_192;

/** lookup reason 的字符上限。 */
export const CONTEXT_LOOKUP_MAX_REASON_LENGTH = 512;

/** lookup error code 的字符上限。 */
export const CONTEXT_LOOKUP_MAX_ERROR_CODE_LENGTH = 128;

/** lookup error message 的字符上限。 */
export const CONTEXT_LOOKUP_MAX_ERROR_MESSAGE_LENGTH = 2_048;

/** Context Lookup 结果 DTO 的 UTF-8 JSON 字节上限。 */
export const CONTEXT_LOOKUP_MAX_RESULT_BYTES = 24 * 1024;

/** 稳定字段列表集合。 */
export const CONTEXT_LOOKUP_MATCHED_FIELDS = new Set<ContextLookupMatchedField>([
    "eventType",
    "toolId",
    "actionId",
    "stepIndex",
    "path",
    "errorCode",
    "objectId",
    "body",
]);

import type { ContextDocumentSource } from "./context-document";

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
 * Context Lookup 的结构化结果；未命中与故障必须保持可区分。
 *
 * @remarks
 * 包含 `found`、`not_found`、`lookup_error` 三种判别联合状态。
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
    }
    | {
        readonly status: "not_found";
        readonly lookupId: string;
        readonly committedThroughSequence?: number;
        readonly reason?: string;
    }
    | {
        readonly status: "lookup_error";
        readonly lookupId: string;
        readonly code: string;
        readonly message: string;
        readonly committedThroughSequence?: number;
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

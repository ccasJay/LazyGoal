import type {
    ContextLookupMatchedField,
    ContextLookupRequest,
    ContextLookupResult,
} from "./context-retrieval";
import {
    CONTEXT_LOOKUP_DEFAULT_INDEX_VERSION,
    CONTEXT_LOOKUP_MAX_MATCHES,
    CONTEXT_LOOKUP_MAX_PREVIEW_LENGTH,
    CONTEXT_LOOKUP_MAX_RESULT_BYTES,
    createContextLookupQueryHash,
    normalizeContextLookupRequest,
    normalizeContextLookupResult,
} from "./context-retrieval";
import type {
    ContextRankedMatch,
    ContextRankingResult,
} from "./context-ranking";
import type { ContextDocumentSource } from "./context-document";

/** Context Lookup Result 构建失败时使用的稳定错误代码。 */
export const CONTEXT_LOOKUP_RESULT_ERROR_CODE = "CONTEXT_LOOKUP_RESULT_ERROR" as const;

/** Result DTO 默认的单个 preview 字符上限。 */
export const CONTEXT_LOOKUP_DEFAULT_PREVIEW_LENGTH = 4_096;

/** 结果预算不足以容纳任何完整文档时的稳定错误码。 */
export const CONTEXT_LOOKUP_RESULT_BUDGET_CODE = "CONTEXT_LOOKUP_RESULT_BUDGET_EXCEEDED" as const;

/**
 * 将 Fielded BM25-lite 排名结果转换为 Runtime Context Lookup Result 的输入。
 *
 * @example
 * ```ts
 * const result = buildContextLookupResultFromRanking({
 *   goalId,
 *   runId,
 *   lookupId,
 *   request,
 *   committedThroughSequence,
 *   ranking,
 * });
 * ```
 */
export interface ContextLookupResultBuildInput {
    /** 当前 Goal 的稳定标识。 */
    readonly goalId: string;
    /** 当前 Run 的稳定标识。 */
    readonly runId: string;
    /** Runtime 计算出的稳定 lookup ID。 */
    readonly lookupId: string;
    /** 规范化前或已规范化的查询请求。 */
    readonly request: ContextLookupRequest;
    /** 生成索引时使用的 committed boundary。 */
    readonly committedThroughSequence: number;
    /** Fielded BM25-lite 的有界排名结果。 */
    readonly ranking: Readonly<ContextRankingResult>;
    /** 结果中单个正文 preview 的字符上限。默认 4096。 */
    readonly previewLimit?: number;
    /** 结果 DTO 的 UTF-8 JSON 字节预算。默认 24 KiB。 */
    readonly resultBudgetBytes?: number;
    /** 产生排名结果的索引版本；省略时使用 bm25-lite v1。 */
    readonly indexVersion?: string;
}

/**
 * 结果转换阶段的协议/来源错误。
 *
 * @remarks
 * 该错误表示排名结果与当前 Goal/Run 或 committed boundary 不一致，不能降级为
 * `not_found`。调用方应将其归一化为 `lookup_error`，避免把损坏来源伪装成无命中。
 *
 * @example
 * ```ts
 * try {
 *   buildContextLookupResultFromRanking(input);
 * } catch (error) {
 *   if (error instanceof ContextLookupResultError) console.error(error.code);
 * }
 * ```
 */
export class ContextLookupResultError extends Error {
    readonly code = CONTEXT_LOOKUP_RESULT_ERROR_CODE;

    /** @param message - 不包含事件正文的稳定诊断信息。 */
    constructor(message: string) {
        super(`${CONTEXT_LOOKUP_RESULT_ERROR_CODE}: ${message}`);
        this.name = "ContextLookupResultError";
    }
}

/**
 * 把排序结果变成有来源、有界的 found/not_found/lookup_error DTO。
 *
 * @remarks
 * `ranking.matches` 已按相关性与稳定 tie-break 排序；本函数只复制每个完整文档的
 * 来源元数据和有界 preview，不返回半个文档。低分或空候选保持 `not_found`，结果
 * 预算无法容纳任何命中时返回专用 `lookup_error`。所有结果均带 query hash 和索引
 * 版本，并再次通过 Runtime Result 校验器。
 *
 * @param input - 当前 Goal/Run、查询、边界与排名结果。
 * @returns 可写入 Trajectory 的不可变 Result DTO。
 * @throws ContextLookupResultError 当排名结果身份、范围或配置非法时。
 * @example
 * ```ts
 * const result = buildContextLookupResultFromRanking(input);
 * if (result.status === "found") console.log(result.matches[0]?.sourceEventIds);
 * ```
 */
export function buildContextLookupResultFromRanking(
    input: ContextLookupResultBuildInput,
): ContextLookupResult {
    const request = normalizeContextLookupRequest(input.request);
    assertNonEmpty(input.goalId, "goalId");
    assertNonEmpty(input.runId, "runId");
    assertNonEmpty(input.lookupId, "lookupId");
    assertBoundary(input.committedThroughSequence);
    const previewLimit = input.previewLimit ?? CONTEXT_LOOKUP_DEFAULT_PREVIEW_LENGTH;
    const resultBudgetBytes = input.resultBudgetBytes ?? CONTEXT_LOOKUP_MAX_RESULT_BYTES;
    if (!Number.isSafeInteger(previewLimit) || previewLimit <= 0 || previewLimit > CONTEXT_LOOKUP_MAX_PREVIEW_LENGTH) {
        throw new ContextLookupResultError("previewLimit is outside the supported range");
    }
    if (!Number.isSafeInteger(resultBudgetBytes) || resultBudgetBytes <= 0 || resultBudgetBytes > CONTEXT_LOOKUP_MAX_RESULT_BYTES) {
        throw new ContextLookupResultError("resultBudgetBytes is outside the supported range");
    }
    if (!isRecord(input.ranking) || !Array.isArray(input.ranking.matches)) {
        throw new ContextLookupResultError("ranking result is invalid");
    }
    if (input.ranking.matches.length === 0) {
        return Object.freeze({
            status: "not_found",
            lookupId: input.lookupId,
            committedThroughSequence: input.committedThroughSequence,
            reason: "no_context_match",
        });
    }

    const queryHash = createContextLookupQueryHash(request);
    const indexVersion = input.indexVersion ?? CONTEXT_LOOKUP_DEFAULT_INDEX_VERSION;
    assertNonEmpty(indexVersion, "indexVersion");
    const sourceDocuments = new Set<string>();
    const sourceEvents = new Set<string>();
    const matches: ContextLookupResultBuildMatch[] = [];
    let truncated = input.ranking.truncated
        || input.ranking.matches.length > CONTEXT_LOOKUP_MAX_MATCHES;

    for (const ranked of input.ranking.matches.slice(0, CONTEXT_LOOKUP_MAX_MATCHES)) {
        const candidate = buildMatch(
            ranked,
            input.goalId,
            input.runId,
            input.committedThroughSequence,
            previewLimit,
            sourceDocuments,
            sourceEvents,
        );
        const projected = {
            status: "found" as const,
            lookupId: input.lookupId,
            committedThroughSequence: input.committedThroughSequence,
            queryHash,
            indexVersion,
            matches: [...matches, candidate],
            truncated,
        };
        if (utf8Bytes(projected) > resultBudgetBytes) {
            truncated = true;
            continue;
        }
        if (candidate.truncated) truncated = true;
        matches.push(candidate);
    }

    if (matches.length === 0) {
        return Object.freeze({
            status: "lookup_error",
            lookupId: input.lookupId,
            committedThroughSequence: input.committedThroughSequence,
            code: CONTEXT_LOOKUP_RESULT_BUDGET_CODE,
            message: "No complete context document fits the result budget",
        });
    }

    let found: ContextLookupResult;
    try {
        found = normalizeContextLookupResult({
            status: "found",
            lookupId: input.lookupId,
            committedThroughSequence: input.committedThroughSequence,
            queryHash,
            indexVersion,
            matches,
            truncated,
        }, input.lookupId, input.committedThroughSequence, request);
    } catch (error) {
        throw new ContextLookupResultError(
            error instanceof Error ? error.message : "result normalization failed",
        );
    }
    if (found.status !== "found") {
        throw new ContextLookupResultError("result normalization changed found status");
    }
    if (utf8Bytes(found) > resultBudgetBytes) {
        throw new ContextLookupResultError("normalized result exceeds result budget");
    }
    return found;
}

/** `buildContextLookupResultFromRanking` 的语义别名。 */
export const createContextLookupResultFromRanking = buildContextLookupResultFromRanking;

/** `buildContextLookupResultFromRanking` 的简短别名。 */
export const contextLookupResultFromRanking = buildContextLookupResultFromRanking;

interface ContextLookupResultBuildMatch {
    readonly documentId: string;
    readonly goalId: string;
    readonly runId: string;
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly matchedFields: readonly ContextLookupMatchedField[];
    readonly score: number;
    readonly preview: string;
    readonly truncated: boolean;
    readonly adjacent?: boolean;
    readonly historical: true;
    readonly sourceEventIds: readonly string[];
    readonly source?: ContextDocumentSource;
}

function buildMatch(
    ranked: ContextRankedMatch,
    goalId: string,
    runId: string,
    boundary: number,
    previewLimit: number,
    sourceDocuments: Set<string>,
    sourceEvents: Set<string>,
): ContextLookupResultBuildMatch {
    const document = ranked.document;
    if (ranked.documentId !== document.documentId) {
        throw new ContextLookupResultError("ranked document ID does not match its document");
    }
    if (document.goalId !== goalId || document.runId !== runId) {
        throw new ContextLookupResultError("ranked document belongs to a different Goal/Run");
    }
    if (
        !Number.isSafeInteger(document.firstSequence)
        || !Number.isSafeInteger(document.lastSequence)
        || (document.source?.kind === "conversation" ? document.firstSequence < 0 : document.firstSequence <= 0)
        || document.lastSequence < document.firstSequence
        || (document.source?.kind !== "conversation" && document.lastSequence > boundary)
    ) {
        throw new ContextLookupResultError("ranked document is outside committed boundary");
    }
    if (sourceDocuments.has(document.documentId)) {
        throw new ContextLookupResultError("ranking contains duplicate documents");
    }
    sourceDocuments.add(document.documentId);
    if (document.sourceEventIds.length === 0 && document.source?.kind !== "conversation") {
        throw new ContextLookupResultError("ranked document has no source events");
    }
    const eventIds = [...document.sourceEventIds];
    for (const eventId of eventIds) {
        if (sourceEvents.has(eventId)) {
            throw new ContextLookupResultError("ranking contains duplicate source events");
        }
        sourceEvents.add(eventId);
    }
    const preview = createPreview(document.body, previewLimit);
    const matchedFields = [...ranked.matchedFields] as readonly ContextLookupMatchedField[];
    if (!ranked.adjacent && matchedFields.length === 0) {
        throw new ContextLookupResultError("primary ranking match has no matched field");
    }
    return Object.freeze({
        documentId: document.documentId,
        goalId,
        runId,
        firstSequence: document.firstSequence,
        lastSequence: document.lastSequence,
        matchedFields: Object.freeze(matchedFields),
        score: ranked.adjacent ? 0 : roundScore(ranked.score),
        preview: preview.text,
        truncated: preview.truncated,
        ...(ranked.adjacent ? { adjacent: true as const } : {}),
        historical: true as const,
        sourceEventIds: Object.freeze(eventIds),
        ...(document.source === undefined ? {} : { source: structuredClone(document.source) }),
    });
}

function createPreview(body: string, limit: number): { readonly text: string; readonly truncated: boolean } {
    if (body.length <= limit) return { text: body, truncated: false };
    const suffix = "…";
    const length = Math.max(0, limit - suffix.length);
    return { text: `${body.slice(0, length)}${suffix}`, truncated: true };
}

function roundScore(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
        throw new ContextLookupResultError("ranked score is invalid");
    }
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function utf8Bytes(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ContextLookupResultError(`${field} must be non-empty`);
    }
}

function assertBoundary(value: unknown): asserts value is number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new ContextLookupResultError("committedThroughSequence is invalid");
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

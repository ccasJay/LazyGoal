import type { ContextLookupFilters } from "./context-retrieval";
import type {
    ContextDocumentFieldName,
    ContextSearchDocument,
} from "./context-document";
import {
    CONTEXT_DOCUMENT_FIELD_NAMES,
    FieldTokenizer,
    type ContextIndexPosting,
    type ContextInvertedIndex,
} from "./context-tokenizer";

/** Fielded BM25-lite 排名算法的稳定版本。 */
export const CONTEXT_RANKING_VERSION = "fielded-bm25-lite-v1" as const;

/** BM25-lite 的固定 k1 参数。 */
export const CONTEXT_BM25_K1 = 1.2 as const;

/** BM25-lite 的固定 b 参数。 */
export const CONTEXT_BM25_B = 0.75 as const;

/** 默认排名 Top-K。 */
export const CONTEXT_RANKING_DEFAULT_TOP_K = 5 as const;

/** 默认最低相关分数。 */
export const CONTEXT_RANKING_DEFAULT_MINIMUM_SCORE = 1 as const;

/** 默认结果预算（UTF-8 JSON 字节的保守字符计量）。 */
export const CONTEXT_RANKING_DEFAULT_RESULT_BUDGET_BYTES = 24 * 1024;

/** Context Ranking 输入或索引损坏时使用的稳定错误代码。 */
export const CONTEXT_RANKING_ERROR_CODE = "CONTEXT_RANKING_ERROR" as const;

/**
 * 排名配置或倒排索引不符合协议时抛出的错误。
 *
 * @remarks
 * 排名器不会修改索引或文档；调用方应将此错误视为检索故障，而不是
 * `not_found`。错误消息不包含完整文档正文。
 *
 * @example
 * ```ts
 * try {
 *     rankContextDocuments(index, { question: "src/index.ts" });
 * } catch (error) {
 *     if (error instanceof ContextRankingError) console.error(error.code);
 * }
 * ```
 */
export class ContextRankingError extends Error {
    /** 稳定错误代码。 */
    readonly code = CONTEXT_RANKING_ERROR_CODE;

    /** @param message - 稳定诊断信息。 */
    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(`${CONTEXT_RANKING_ERROR_CODE}: ${message}`, options);
        this.name = "ContextRankingError";
    }
}

/** BM25-lite 的字段权重。 */
export const CONTEXT_FIELD_WEIGHTS: Readonly<Record<ContextDocumentFieldName, number>> = Object.freeze({
    body: 1,
    eventType: 2,
    stepIndex: 3,
    toolId: 4,
    actionId: 4,
    errorCode: 4,
    path: 5,
    objectId: 5,
});

/** 完整字段值匹配的确定性加分倍率。 */
export const CONTEXT_EXACT_MATCH_MULTIPLIERS: Readonly<Record<ContextDocumentFieldName, number>> = Object.freeze({
    body: 1,
    eventType: 1,
    stepIndex: 1,
    toolId: 2,
    actionId: 2,
    errorCode: 2,
    path: 3,
    objectId: 3,
});

/**
 * 一次 Fielded BM25-lite 查询。
 *
 * @example
 * ```ts
 * const query: ContextRankingQuery = {
 *     question: "为什么读取 src/index.ts？",
 *     filters: { paths: ["src/index.ts"] },
 * };
 * ```
 */
export interface ContextRankingQuery {
    /** 模型提出的自然语言或标识查询。 */
    readonly question: string;
    /** 先于评分应用的结构化过滤器。 */
    readonly filters?: ContextLookupFilters;
}

/**
 * 排名器可选配置。
 *
 * @example
 * ```ts
 * const options: ContextRankingOptions = {
 *     topK: 5,
 *     minimumScore: 1,
 *     resultBudgetBytes: 24 * 1024,
 *     adjacentCount: 1,
 * };
 * ```
 */
export interface ContextRankingOptions {
    /** 主命中最多返回的数量；相邻文档不占用该数量。默认 5。 */
    readonly topK?: number;
    /** 低于该分数的候选返回 `not_found`；默认 1。 */
    readonly minimumScore?: number;
    /** 所有完整命中的近似 JSON 字节预算；默认 24 KiB。 */
    readonly resultBudgetBytes?: number;
    /** 每个主命中最多扩展的前后相邻文档数；默认各 1。 */
    readonly adjacentCount?: number;
}

/** 单个主命中或相邻文档的排名结果。 */
export interface ContextRankedMatch {
    /** 来源文档稳定 ID。 */
    readonly documentId: string;
    /** 原始来源文档；后续 Result 层负责有界预览。 */
    readonly document: ContextSearchDocument;
    /** 六位小数舍入后的相关分数。相邻文档固定为 0。 */
    readonly score: number;
    /** 对该命中有贡献的字段。 */
    readonly matchedFields: readonly ContextDocumentFieldName[];
    /** 产生完整值命中的字段。 */
    readonly exactMatchedFields: readonly ContextDocumentFieldName[];
    /** 是否为补充的前后相邻文档。 */
    readonly adjacent: boolean;
}

/** 一次排名的有界输出。 */
export interface ContextRankingResult {
    /** 按主命中排序、再按相邻扩展顺序排列的结果。 */
    readonly matches: readonly ContextRankedMatch[];
    /** 是否因 Top-K、预算或相邻扩展上限丢弃了完整候选。 */
    readonly truncated: boolean;
    /** 通过结构化过滤器的候选文档数。 */
    readonly candidateCount: number;
}

interface NormalizedRankingOptions {
    readonly topK: number;
    readonly minimumScore: number;
    readonly resultBudgetBytes: number;
    readonly adjacentCount: number;
}

interface QueryTerm {
    readonly value: string;
    readonly exact: boolean;
}

interface CandidateScore {
    readonly document: ContextSearchDocument;
    readonly score: number;
    readonly matchedFields: readonly ContextDocumentFieldName[];
    readonly exactMatchedFields: readonly ContextDocumentFieldName[];
}

/**
 * 使用固定 Fielded BM25-lite 参数对 Context Documents 排名。
 *
 * @remarks
 * 字段过滤先于倒排候选收集；正文、路径、Tool/Action、错误码和对象标识分别
 * 使用版本化权重。精确 Token 只增加确定性 boost，不以 recency 替代相关性。
 * 所有主命中先按六位舍入分数降序，再按 `lastSequence`、`firstSequence` 降序
 * 和文档 ID 字典序稳定平局；相邻文档最多各取一个且必须完整落入预算。该类
 * 不缓存查询状态，也不修改 Index。
 *
 * @example
 * ```ts
 * const ranker = new FieldedBm25LiteRanker(index);
 * const result = ranker.rank({ question: "src/index.ts" });
 * ```
 */
export class FieldedBm25LiteRanker {
    private readonly index: ContextInvertedIndex;
    private readonly tokenizer: FieldTokenizer;
    private readonly options: NormalizedRankingOptions;

    /**
     * @param index - 同一 committed boundary 构建的倒排索引。
     * @param options - Top-K、最低分、预算和相邻扩展设置。
     * @param tokenizer - 与索引版本一致的 FieldTokenizer。
     * @throws ContextRankingError 当索引、Tokenizer 或配置非法时。
     */
    constructor(
        index: ContextInvertedIndex,
        options: ContextRankingOptions = {},
        tokenizer: FieldTokenizer = new FieldTokenizer(),
    ) {
        assertIndex(index);
        if (tokenizer.version !== index.tokenizerVersion) {
            throw new ContextRankingError("index and tokenizer versions do not match");
        }
        this.index = index;
        this.tokenizer = tokenizer;
        this.options = normalizeOptions(options);
    }

    /**
     * 对一个查询执行过滤、评分、稳定排序和相邻扩展。
     *
     * @param query - 规范化前的查询文本与可选过滤器。
     * @returns 深度冻结的有界排名结果。
     * @throws ContextRankingError 当查询或过滤器非法时。
     */
    rank(query: ContextRankingQuery): Readonly<ContextRankingResult> {
        const normalized = normalizeQuery(query);
        const filters = normalizeFilters(normalized.filters);
        const candidates = collectCandidates(this.index, normalized.question, this.tokenizer)
            .filter((document) => matchesFilters(document, filters));

        const scored = candidates
            .map((document) => scoreDocument(this.index, document, normalized.question, this.tokenizer))
            .filter((candidate): candidate is CandidateScore => candidate !== undefined)
            .filter((candidate) => candidate.score >= this.options.minimumScore)
            .sort(compareCandidates);

        let truncated = scored.length > this.options.topK;
        const primary = scored.slice(0, this.options.topK);
        const selected: ContextRankedMatch[] = [];
        let usedBytes = 0;
        for (const candidate of primary) {
            const match = toRankedMatch(candidate, false);
            const measured = estimateMatchBytes(match);
            if (measured > this.options.resultBudgetBytes - usedBytes) {
                truncated = true;
                continue;
            }
            usedBytes += measured;
            selected.push(match);
        }

        if (primary.length < scored.length) truncated = true;
        const selectedIds = new Set(selected.map((match) => match.documentId));
        const adjacent = collectAdjacentDocuments(
            this.index,
            selected,
            this.options.adjacentCount,
        );
        for (const document of adjacent) {
            if (selectedIds.has(document.documentId)) continue;
            const match = toRankedMatch({
                document,
                score: 0,
                matchedFields: [],
                exactMatchedFields: [],
            }, true);
            const measured = estimateMatchBytes(match);
            if (measured > this.options.resultBudgetBytes - usedBytes) {
                truncated = true;
                continue;
            }
            usedBytes += measured;
            selectedIds.add(match.documentId);
            selected.push(match);
        }

        return Object.freeze({
            matches: Object.freeze(selected),
            truncated,
            candidateCount: candidates.length,
        });
    }
}

/**
 * 使用默认配置执行一次 Fielded BM25-lite 查询。
 *
 * @param index - 同一 committed boundary 构建的倒排索引。
 * @param query - 查询文本与可选过滤器。
 * @param options - 可选排名配置。
 * @returns 深度冻结的有界排名结果。
 * @throws ContextRankingError 当输入或配置非法时。
 * @example
 * ```ts
 * const result = rankContextDocuments(index, { question: "read_file" });
 * ```
 */
export function rankContextDocuments(
    index: ContextInvertedIndex,
    query: ContextRankingQuery,
    options: ContextRankingOptions = {},
): Readonly<ContextRankingResult> {
    return new FieldedBm25LiteRanker(index, options).rank(query);
}

function collectCandidates(
    index: ContextInvertedIndex,
    question: string,
    tokenizer: FieldTokenizer,
): readonly ContextSearchDocument[] {
    const queryTerms = createQueryTerms(question, tokenizer);
    const ids = new Set<string>();
    for (const fieldName of CONTEXT_DOCUMENT_FIELD_NAMES) {
        for (const term of queryTerms[fieldName]) {
            for (const posting of index.getPostings(fieldName, term.value)) {
                ids.add(posting.documentId);
            }
        }
    }
    return [...ids]
        .map((documentId) => index.documents[documentId])
        .filter((document): document is ContextSearchDocument => document !== undefined);
}

function scoreDocument(
    index: ContextInvertedIndex,
    document: ContextSearchDocument,
    question: string,
    tokenizer: FieldTokenizer,
): CandidateScore | undefined {
    const queryTerms = createQueryTerms(question, tokenizer);
    let score = 0;
    const matchedFields: ContextDocumentFieldName[] = [];
    const exactMatchedFields: ContextDocumentFieldName[] = [];

    for (const fieldName of CONTEXT_DOCUMENT_FIELD_NAMES) {
        const fieldTerms = queryTerms[fieldName];
        if (fieldTerms.length === 0) continue;
        const postingByTerm = new Map<string, ContextIndexPosting>();
        for (const term of fieldTerms) {
            const posting = index.getPostings(fieldName, term.value)
                .find((candidate) => candidate.documentId === document.documentId);
            if (posting !== undefined) postingByTerm.set(term.value, posting);
        }
        if (postingByTerm.size === 0) continue;
        matchedFields.push(fieldName);

        const fieldLength = tokenizedLength(index, document.documentId, fieldName);
        const averageLength = index.fieldStats[fieldName].averageFieldLength;
        const normalization = averageLength === 0
            ? 1
            : 1 - CONTEXT_BM25_B + CONTEXT_BM25_B * fieldLength / averageLength;
        for (const term of fieldTerms) {
            const posting = postingByTerm.get(term.value);
            if (posting === undefined) continue;
            const documentFrequency = index.fieldStats[fieldName]
                .documentFrequency[term.value] ?? 0;
            const idf = inverseDocumentFrequency(index.documentIds.length, documentFrequency);
            const termFrequency = posting.termFrequency;
            const bm25 = idf * (termFrequency * (CONTEXT_BM25_K1 + 1))
                / (termFrequency + CONTEXT_BM25_K1 * normalization);
            score += CONTEXT_FIELD_WEIGHTS[fieldName] * bm25;
            if (term.exact && posting.exactFrequency > 0) {
                if (!exactMatchedFields.includes(fieldName)) exactMatchedFields.push(fieldName);
                score += idf * CONTEXT_EXACT_MATCH_MULTIPLIERS[fieldName];
            }
        }
    }

    if (matchedFields.length === 0) return undefined;
    return {
        document,
        score: roundScore(score),
        matchedFields: Object.freeze(matchedFields),
        exactMatchedFields: Object.freeze(exactMatchedFields),
    };
}

function createQueryTerms(
    question: string,
    tokenizer: FieldTokenizer,
): Readonly<Record<ContextDocumentFieldName, readonly QueryTerm[]>> {
    const result = {} as Record<ContextDocumentFieldName, readonly QueryTerm[]>;
    for (const fieldName of CONTEXT_DOCUMENT_FIELD_NAMES) {
        const tokens = tokenizer.tokenizeValue(fieldName, question);
        const seen = new Set<string>();
        const terms: QueryTerm[] = [];
        for (const token of tokens) {
            if (seen.has(token.value)) {
                const previous = terms.find((term) => term.value === token.value);
                if (previous !== undefined && token.kind === "exact" && !previous.exact) {
                    terms[terms.indexOf(previous)] = { ...previous, exact: true };
                }
                continue;
            }
            seen.add(token.value);
            terms.push({ value: token.value, exact: token.kind === "exact" });
        }
        result[fieldName] = Object.freeze(terms);
    }
    return Object.freeze(result);
}

function tokenizedLength(
    index: ContextInvertedIndex,
    documentId: string,
    fieldName: ContextDocumentFieldName,
): number {
    const document = index.tokenizedDocuments[documentId];
    if (document === undefined) {
        throw new ContextRankingError(`index is missing document: ${documentId}`);
    }
    return document.fieldLengths[fieldName];
}

function inverseDocumentFrequency(documentCount: number, documentFrequency: number): number {
    if (documentCount <= 0 || documentFrequency <= 0) return 0;
    return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

function compareCandidates(left: CandidateScore, right: CandidateScore): number {
    return right.score - left.score
        || right.document.lastSequence - left.document.lastSequence
        || right.document.firstSequence - left.document.firstSequence
        || compareLexical(left.document.documentId, right.document.documentId);
}

function toRankedMatch(candidate: CandidateScore, adjacent: boolean): ContextRankedMatch {
    return Object.freeze({
        documentId: candidate.document.documentId,
        document: candidate.document,
        score: adjacent ? 0 : candidate.score,
        matchedFields: Object.freeze([...candidate.matchedFields]),
        exactMatchedFields: Object.freeze([...candidate.exactMatchedFields]),
        adjacent,
    });
}

function collectAdjacentDocuments(
    index: ContextInvertedIndex,
    selected: readonly ContextRankedMatch[],
    adjacentCount: number,
): readonly ContextSearchDocument[] {
    if (adjacentCount === 0 || selected.length === 0) return [];
    const documents = index.documentIds
        .map((documentId) => index.documents[documentId])
        .filter((document): document is ContextSearchDocument => document !== undefined)
        .sort(compareDocumentsBySequence);
    const positionById = new Map(documents.map((document, index) => [document.documentId, index]));
    const primaryIds = new Set(selected.map((match) => match.documentId));
    const adjacent: ContextSearchDocument[] = [];
    for (const match of selected) {
        const position = positionById.get(match.documentId);
        if (position === undefined) continue;
        for (let distance = 1; distance <= adjacentCount; distance += 1) {
            const previous = documents[position - distance];
            const next = documents[position + distance];
            if (previous !== undefined && !primaryIds.has(previous.documentId)) {
                adjacent.push(previous);
            }
            if (next !== undefined && !primaryIds.has(next.documentId)) {
                adjacent.push(next);
            }
        }
    }
    const seen = new Set<string>();
    return adjacent.filter((document) => {
        if (seen.has(document.documentId)) return false;
        seen.add(document.documentId);
        return true;
    });
}

function compareDocumentsBySequence(left: ContextSearchDocument, right: ContextSearchDocument): number {
    return left.firstSequence - right.firstSequence
        || left.lastSequence - right.lastSequence
        || compareLexical(left.documentId, right.documentId);
}

function estimateMatchBytes(match: ContextRankedMatch): number {
    return Buffer.byteLength(JSON.stringify({
        documentId: match.documentId,
        score: match.score,
        matchedFields: match.matchedFields,
        exactMatchedFields: match.exactMatchedFields,
        adjacent: match.adjacent,
        document: match.document,
    }), "utf8");
}

function normalizeQuery(query: ContextRankingQuery): ContextRankingQuery {
    if (!isRecord(query)) throw new ContextRankingError("query must be an object");
    if (typeof query.question !== "string" || query.question.trim().length === 0) {
        throw new ContextRankingError("question must be a non-empty string");
    }
    if (query.question.length > 1024) {
        throw new ContextRankingError("question exceeds 1024 characters");
    }
    return {
        question: query.question.normalize("NFKC").trim(),
        ...(query.filters === undefined ? {} : { filters: query.filters }),
    };
}

function normalizeFilters(filters: ContextLookupFilters | undefined): ContextLookupFilters | undefined {
    if (filters === undefined) return undefined;
    if (!isRecord(filters)) throw new ContextRankingError("filters must be an object");
    const allowed = new Set([
        "eventTypes",
        "toolIds",
        "actionIds",
        "stepIndexes",
        "paths",
        "errorCodes",
        "objectIds",
        "sequenceRange",
    ]);
    for (const key of Object.keys(filters)) {
        if (!allowed.has(key)) throw new ContextRankingError(`unknown filter: ${key}`);
    }
    const normalizeStrings = (value: unknown, name: string): readonly string[] | undefined => {
        if (value === undefined) return undefined;
        if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
            throw new ContextRankingError(`${name} must contain 1..16 items`);
        }
        const result = value.map((item) => {
            if (typeof item !== "string" || item.trim().length === 0) {
                throw new ContextRankingError(`${name} must contain non-empty strings`);
            }
            return item.normalize("NFKC").trim();
        });
        return Object.freeze([...new Set(result)].sort(compareLexical));
    };
    const normalizeNumbers = (value: unknown, name: string): readonly number[] | undefined => {
        if (value === undefined) return undefined;
        if (!Array.isArray(value) || value.length === 0 || value.length > 16) {
            throw new ContextRankingError(`${name} must contain 1..16 items`);
        }
        const result = value.map((item) => {
            if (!Number.isSafeInteger(item) || (item as number) < 0) {
                throw new ContextRankingError(`${name} must contain non-negative integers`);
            }
            return item as number;
        });
        return Object.freeze([...new Set(result)].sort((left, right) => left - right));
    };
    let sequenceRange: { readonly from: number; readonly to: number } | undefined;
    if (filters.sequenceRange !== undefined) {
        if (!isRecord(filters.sequenceRange)
            || Object.keys(filters.sequenceRange).some((key) => key !== "from" && key !== "to")
            || !Number.isSafeInteger(filters.sequenceRange.from)
            || !Number.isSafeInteger(filters.sequenceRange.to)
            || (filters.sequenceRange.from as number) < 1
            || (filters.sequenceRange.to as number) < (filters.sequenceRange.from as number)) {
            throw new ContextRankingError("sequenceRange must be a valid increasing range");
        }
        sequenceRange = Object.freeze({
            from: filters.sequenceRange.from as number,
            to: filters.sequenceRange.to as number,
        });
    }
    const eventTypes = normalizeStrings(filters.eventTypes, "eventTypes");
    const toolIds = normalizeStrings(filters.toolIds, "toolIds");
    const actionIds = normalizeStrings(filters.actionIds, "actionIds");
    const stepIndexes = normalizeNumbers(filters.stepIndexes, "stepIndexes");
    const paths = normalizeStrings(filters.paths, "paths");
    const errorCodes = normalizeStrings(filters.errorCodes, "errorCodes");
    const objectIds = normalizeStrings(filters.objectIds, "objectIds");
    return Object.freeze({
        ...(eventTypes === undefined ? {} : { eventTypes }),
        ...(toolIds === undefined ? {} : { toolIds }),
        ...(actionIds === undefined ? {} : { actionIds }),
        ...(stepIndexes === undefined ? {} : { stepIndexes }),
        ...(paths === undefined ? {} : { paths }),
        ...(errorCodes === undefined ? {} : { errorCodes }),
        ...(objectIds === undefined ? {} : { objectIds }),
        ...(sequenceRange === undefined ? {} : { sequenceRange }),
    });
}

function matchesFilters(
    document: ContextSearchDocument,
    filters: ContextLookupFilters | undefined,
): boolean {
    if (filters === undefined) return true;
    if (!matchesStringFilter(document.eventTypes, filters.eventTypes)) return false;
    if (!matchesStringFilter(document.toolIds, filters.toolIds)) return false;
    if (!matchesStringFilter(document.actionIds, filters.actionIds)) return false;
    if (!matchesNumberFilter(document.stepIndexes, filters.stepIndexes)) return false;
    if (!matchesStringFilter(document.paths, filters.paths)) return false;
    if (!matchesStringFilter(document.errorCodes, filters.errorCodes)) return false;
    if (!matchesStringFilter(document.objectIds, filters.objectIds)) return false;
    if (
        filters.sequenceRange !== undefined
        && (document.lastSequence < filters.sequenceRange.from
            || document.firstSequence > filters.sequenceRange.to)
    ) return false;
    return true;
}

function matchesStringFilter(
    values: readonly string[],
    filter: readonly string[] | undefined,
): boolean {
    if (filter === undefined) return true;
    const normalizedValues = new Set(values.map((value) => normalizeToken(value)));
    return filter.some((value) => normalizedValues.has(normalizeToken(value)));
}

function matchesNumberFilter(
    values: readonly number[],
    filter: readonly number[] | undefined,
): boolean {
    if (filter === undefined) return true;
    const valueSet = new Set(values);
    return filter.some((value) => valueSet.has(value));
}

function normalizeToken(value: string): string {
    return value.normalize("NFKC").toLowerCase();
}

function normalizeOptions(options: ContextRankingOptions): NormalizedRankingOptions {
    if (!isRecord(options)) throw new ContextRankingError("ranking options must be an object");
    const topK = options.topK ?? CONTEXT_RANKING_DEFAULT_TOP_K;
    const minimumScore = options.minimumScore ?? CONTEXT_RANKING_DEFAULT_MINIMUM_SCORE;
    const resultBudgetBytes = options.resultBudgetBytes ?? CONTEXT_RANKING_DEFAULT_RESULT_BUDGET_BYTES;
    const adjacentCount = options.adjacentCount ?? 1;
    if (!Number.isSafeInteger(topK) || topK <= 0) {
        throw new ContextRankingError("topK must be a positive safe integer");
    }
    if (typeof minimumScore !== "number" || !Number.isFinite(minimumScore) || minimumScore < 0) {
        throw new ContextRankingError("minimumScore must be a finite non-negative number");
    }
    if (!Number.isSafeInteger(resultBudgetBytes) || resultBudgetBytes <= 0) {
        throw new ContextRankingError("resultBudgetBytes must be a positive safe integer");
    }
    if (!Number.isSafeInteger(adjacentCount) || adjacentCount < 0 || adjacentCount > 1) {
        throw new ContextRankingError("adjacentCount must be 0 or 1");
    }
    return { topK, minimumScore, resultBudgetBytes, adjacentCount };
}

function assertIndex(index: ContextInvertedIndex): void {
    if (!isRecord(index) || index.schemaVersion !== 1) {
        throw new ContextRankingError("index schemaVersion must be 1");
    }
    if (index.tokenizerVersion !== "field-tokenizer-v1") {
        throw new ContextRankingError("unsupported index tokenizer version");
    }
    if (
        !Array.isArray(index.documentIds)
        || !isRecord(index.documents)
        || !isRecord(index.tokenizedDocuments)
        || !isRecord(index.postings)
        || !isRecord(index.fieldStats)
    ) {
        throw new ContextRankingError("index documents are invalid");
    }
}

function roundScore(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
        throw new ContextRankingError("computed score is invalid");
    }
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function compareLexical(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

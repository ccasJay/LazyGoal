import type {
    ContextDocumentFieldName,
    ContextDocumentFields,
    ContextSearchDocument,
} from "./context-document";

/** Field Tokenizer 的稳定版本。 */
export const CONTEXT_TOKENIZER_VERSION = "field-tokenizer-v1" as const;

/** 倒排索引 DTO 的稳定 Schema 版本。 */
export const CONTEXT_INVERTED_INDEX_SCHEMA_VERSION = 1 as const;

/** Field Tokenizer 失败时使用的稳定错误代码。 */
export const CONTEXT_TOKENIZER_ERROR_CODE = "CONTEXT_TOKENIZER_ERROR" as const;

/**
 * Context Tokenizer 或索引输入非法时抛出的错误。
 *
 * @remarks
 * 该错误表示文档不是 Builder 生成的合法 DTO，调用方应丢弃本次索引结果并从
 * committed Trajectory 重建，不应把部分 Token 继续交给排名器。
 *
 * @example
 * ```ts
 * try {
 *     buildContextInvertedIndex(documents);
 * } catch (error) {
 *     if (error instanceof ContextTokenizerError) console.error(error.code);
 * }
 * ```
 */
export class ContextTokenizerError extends Error {
    /** 稳定错误代码。 */
    readonly code = CONTEXT_TOKENIZER_ERROR_CODE;

    /** @param message - 不包含完整文档正文的稳定诊断信息。 */
    constructor(message: string, options?: { readonly cause?: unknown }) {
        super(`${CONTEXT_TOKENIZER_ERROR_CODE}: ${message}`, options);
        this.name = "ContextTokenizerError";
    }
}

/**
 * Token 的来源类型。
 *
 * `exact` 是完整字段值的规范化表示；`split` 是路径、标识符或正文拆分出的
 * 词元。两者共享同一个 `value` 命名空间，排名器可以据此分别计算精确加分。
 */
export type ContextTokenKind = "exact" | "split";

/**
 * 一个字段 Token。
 *
 * @example
 * ```ts
 * const token: ContextToken = {
 *     value: "read_file",
 *     raw: "read_file",
 *     kind: "exact",
 * };
 * ```
 */
export interface ContextToken {
    /** NFKC + locale-independent lowercase 后用于索引的值。 */
    readonly value: string;
    /** 产生该 Token 的原始字段值或正文词。 */
    readonly raw: string;
    /** 完整精确 Token 或确定性拆分 Token。 */
    readonly kind: ContextTokenKind;
}

/** 一个字段的 Token 序列和长度统计。 */
export interface ContextTokenizedField {
    /** 按字段值与拆分顺序排列的 Token；重复词保留用于词频计算。 */
    readonly tokens: readonly ContextToken[];
    /** `tokens.length` 的稳定别名。 */
    readonly length: number;
}

/**
 * 单个 Context Document 的 Token 化结果。
 *
 * @example
 * ```ts
 * const tokenized = tokenizer.tokenize(document);
 * console.log(tokenized.fields.path.tokens);
 * ```
 */
export interface TokenizedContextDocument {
    /** Token 化结果 DTO 版本。 */
    readonly schemaVersion: 1;
    /** 产生该结果的 Tokenizer 版本。 */
    readonly tokenizerVersion: typeof CONTEXT_TOKENIZER_VERSION;
    /** 来源文档稳定 ID。 */
    readonly documentId: string;
    /** 各可检索字段的 Token 序列。 */
    readonly fields: Readonly<Record<ContextDocumentFieldName, ContextTokenizedField>>;
    /** 各字段 Token 数量。 */
    readonly fieldLengths: Readonly<Record<ContextDocumentFieldName, number>>;
}

/** 倒排表中一个文档的词频统计。 */
export interface ContextIndexPosting {
    /** 命中文档稳定 ID。 */
    readonly documentId: string;
    /** 该字段中该词的总出现次数。 */
    readonly termFrequency: number;
    /** 完整字段值 Token 出现次数。 */
    readonly exactFrequency: number;
    /** 拆分或正文 Token 出现次数。 */
    readonly splitFrequency: number;
}

/** 一个字段的倒排词频和长度统计。 */
export interface ContextFieldStatistics {
    /** 该字段所有文档的 Token 总数。 */
    readonly totalTokenCount: number;
    /** 该字段的平均 Token 长度。无文档时为 0。 */
    readonly averageFieldLength: number;
    /** 词到文档频率的确定性映射。 */
    readonly documentFrequency: Readonly<Record<string, number>>;
}

/**
 * 可供后续 BM25-lite 消费的确定性倒排索引。
 *
 * @remarks
 * 所有文档、字段、词和 Posting 均以稳定顺序保存；索引不包含原始 Trajectory，
 * 只能由同一 committed Context Documents 重建。`getPostings` 返回空数组表示
 * 没有命中，调用方不得把它解释为检索故障。
 *
 * @example
 * ```ts
 * const index = buildContextInvertedIndex(documents);
 * const postings = index.getPostings("path", "src/index.ts");
 * ```
 */
export interface ContextInvertedIndex {
    /** 索引 DTO 版本。 */
    readonly schemaVersion: typeof CONTEXT_INVERTED_INDEX_SCHEMA_VERSION;
    /** Tokenizer 版本。 */
    readonly tokenizerVersion: typeof CONTEXT_TOKENIZER_VERSION;
    /** 按稳定文档 ID 排列的文档 ID。 */
    readonly documentIds: readonly string[];
    /** Token 化文档的只读映射。 */
    readonly documents: Readonly<Record<string, TokenizedContextDocument>>;
    /** 按字段、Token 建立的倒排 Posting。 */
    readonly postings: Readonly<Record<
        ContextDocumentFieldName,
        Readonly<Record<string, readonly ContextIndexPosting[]>>
    >>;
    /** 每个字段的 df 和长度统计。 */
    readonly fieldStats: Readonly<Record<ContextDocumentFieldName, ContextFieldStatistics>>;
    /**
     * @param field - 要查询的字段。
     * @param term - 可为 raw 或已规范化的查询词；内部按同一规范化规则查询。
     * @returns 稳定排序的 Posting；没有命中时返回冻结空数组。
     */
    getPostings(
        field: ContextDocumentFieldName,
        term: string,
    ): readonly ContextIndexPosting[];
}

/** Context Document 的字段顺序，决定 Index/Sidecar 序列化顺序。 */
export const CONTEXT_DOCUMENT_FIELD_NAMES: readonly ContextDocumentFieldName[] = [
    "eventType",
    "toolId",
    "actionId",
    "stepIndex",
    "path",
    "errorCode",
    "objectId",
    "body",
];

const IDENTIFIER_FIELDS = new Set<ContextDocumentFieldName>([
    "eventType",
    "toolId",
    "actionId",
    "stepIndex",
    "path",
    "errorCode",
    "objectId",
]);

const MAX_SPLIT_TOKEN_LENGTH = 256;

/**
 * 对 ContextSearchDocument 执行版本化字段 Token 化。
 *
 * @remarks
 * 规范化使用 Unicode NFKC 与不依赖系统区域设置的 `toLowerCase()`。标识字段
 * 保留完整精确 Token，同时按路径分隔符、snake/camelCase 和字母/数字边界拆分；
 * 正文只产生词法 Token。超过拆分上限的长片段仍保留完整精确 Token，但不产生
 * 长拆分 Token，从而避免把单个异常字段扩散为无界倒排项。
 *
 * @example
 * ```ts
 * const tokenizer = new FieldTokenizer();
 * const tokenized = tokenizer.tokenize(document);
 * ```
 */
export class FieldTokenizer {
    /** Tokenizer 版本，供 Sidecar 校验。 */
    readonly version = CONTEXT_TOKENIZER_VERSION;

    /**
     * 将一个 Context Document 转为各字段 Token 序列。
     *
     * @param document - committed ContextDocumentBuilder 产出的文档。
     * @returns 深度冻结且不共享输入引用的 Token 化结果。
     * @throws ContextTokenizerError 当文档身份、字段或字段值非法时。
     */
    tokenize(document: ContextSearchDocument): TokenizedContextDocument {
        assertContextDocument(document);
        const fields = {} as Record<ContextDocumentFieldName, ContextTokenizedField>;
        const fieldLengths = {} as Record<ContextDocumentFieldName, number>;

        for (const fieldName of CONTEXT_DOCUMENT_FIELD_NAMES) {
            const tokens = fieldName === "body"
                ? tokenizeBody(document.fields.body)
                : tokenizeIdentifierValues(
                    fieldName,
                    valuesForField(
                        fieldName,
                        document.fields[fieldName] as ContextDocumentFields[typeof fieldName],
                    ),
                );
            const frozenTokens = Object.freeze(tokens.map((token) => Object.freeze(token)));
            fields[fieldName] = Object.freeze({
                tokens: frozenTokens,
                length: frozenTokens.length,
            });
            fieldLengths[fieldName] = frozenTokens.length;
        }

        return deepFreeze({
            schemaVersion: 1 as const,
            tokenizerVersion: CONTEXT_TOKENIZER_VERSION,
            documentId: document.documentId,
            fields,
            fieldLengths,
        });
    }

    /**
     * 将单个字段值转为 Token，供测试和自定义索引器复用。
     *
     * @param field - 字段名；`body` 使用正文词法规则。
     * @param value - 原始字符串或 Step 数字。
     * @returns 按稳定顺序排列的新 Token 列表。
     * @throws ContextTokenizerError 当值为空或字段类型不匹配时。
     */
    tokenizeValue(
        field: ContextDocumentFieldName,
        value: string | number,
    ): readonly ContextToken[] {
        if (typeof value !== "string" && typeof value !== "number") {
            throw new ContextTokenizerError("field value must be a string or number");
        }
        if (field === "body") return Object.freeze(tokenizeBody(String(value)));
        return Object.freeze(tokenizeIdentifierValues(field, [String(value)]));
    }
}

/** 默认 FieldTokenizer 实例的无状态入口。 */
export function tokenizeContextDocument(
    document: ContextSearchDocument,
): TokenizedContextDocument {
    return new FieldTokenizer().tokenize(document);
}

/**
 * 从 Token 化文档建立确定性的倒排索引与 df/长度统计。
 *
 * @param documents - committed Context Documents；输入顺序不影响结果。
 * @param tokenizer - 可选同版本 Tokenizer；默认使用 `field-tokenizer-v1`。
 * @returns 深度冻结的倒排索引。
 * @throws ContextTokenizerError 当文档重复、字段损坏或 Tokenizer 版本不受支持。
 * @example
 * ```ts
 * const index = buildContextInvertedIndex(documents);
 * console.log(index.fieldStats.body.averageFieldLength);
 * ```
 */
export function buildContextInvertedIndex(
    documents: readonly ContextSearchDocument[],
    tokenizer: FieldTokenizer = new FieldTokenizer(),
): ContextInvertedIndex {
    if (!Array.isArray(documents)) {
        throw new ContextTokenizerError("documents must be an array");
    }
    if (tokenizer.version !== CONTEXT_TOKENIZER_VERSION) {
        throw new ContextTokenizerError("unsupported tokenizer version");
    }

    const tokenized = documents.map((document) => tokenizer.tokenize(document));
    tokenized.sort((left, right) => compareLexical(left.documentId, right.documentId));
    const seenDocumentIds = new Set<string>();
    for (const document of tokenized) {
        if (seenDocumentIds.has(document.documentId)) {
            throw new ContextTokenizerError(`duplicate documentId: ${document.documentId}`);
        }
        seenDocumentIds.add(document.documentId);
    }

    const documentMap = {} as Record<string, TokenizedContextDocument>;
    const postings = {} as Record<
        ContextDocumentFieldName,
        Record<string, ContextIndexPosting[]>
    >;
    const fieldStats = {} as Record<ContextDocumentFieldName, ContextFieldStatistics>;

    for (const fieldName of CONTEXT_DOCUMENT_FIELD_NAMES) {
        postings[fieldName] = {};
        const documentFrequency: Record<string, number> = {};
        let totalTokenCount = 0;

        for (const document of tokenized) {
            documentMap[document.documentId] = document;
            const field = document.fields[fieldName];
            totalTokenCount += field.length;
            const counts = new Map<string, { termFrequency: number; exactFrequency: number; splitFrequency: number }>();
            for (const token of field.tokens) {
                const current = counts.get(token.value) ?? {
                    termFrequency: 0,
                    exactFrequency: 0,
                    splitFrequency: 0,
                };
                current.termFrequency += 1;
                if (token.kind === "exact") current.exactFrequency += 1;
                else current.splitFrequency += 1;
                counts.set(token.value, current);
            }
            for (const [term, count] of counts) {
                (postings[fieldName][term] ??= []).push({
                    documentId: document.documentId,
                    ...count,
                });
                documentFrequency[term] = (documentFrequency[term] ?? 0) + 1;
            }
        }

        const sortedTerms = Object.keys(postings[fieldName]).sort(compareLexical);
        const sortedPostingMap: Record<string, readonly ContextIndexPosting[]> = {};
        const sortedDocumentFrequency: Record<string, number> = {};
        for (const term of sortedTerms) {
            const sortedPostings = postings[fieldName][term]!
                .sort((left, right) => compareLexical(left.documentId, right.documentId))
                .map((posting) => Object.freeze(posting));
            sortedPostingMap[term] = Object.freeze(sortedPostings);
            sortedDocumentFrequency[term] = documentFrequency[term]!;
        }
        const averageFieldLength = tokenized.length === 0
            ? 0
            : totalTokenCount / tokenized.length;
        fieldStats[fieldName] = Object.freeze({
            totalTokenCount,
            averageFieldLength,
            documentFrequency: Object.freeze(sortedDocumentFrequency),
        });
        postings[fieldName] = sortedPostingMap as Record<string, ContextIndexPosting[]>;
    }

    const documentIds = Object.freeze(tokenized.map((document) => document.documentId));
    const frozenDocuments = Object.freeze(documentMap);
    const frozenPostings = {} as Record<
        ContextDocumentFieldName,
        Readonly<Record<string, readonly ContextIndexPosting[]>>
    >;
    for (const fieldName of CONTEXT_DOCUMENT_FIELD_NAMES) {
        frozenPostings[fieldName] = Object.freeze(postings[fieldName]!);
    }

    const index: ContextInvertedIndex = {
        schemaVersion: CONTEXT_INVERTED_INDEX_SCHEMA_VERSION,
        tokenizerVersion: CONTEXT_TOKENIZER_VERSION,
        documentIds,
        documents: frozenDocuments,
        postings: Object.freeze(frozenPostings),
        fieldStats: Object.freeze(fieldStats),
        getPostings(field, term) {
            const normalized = normalizeToken(term);
            if (normalized.length === 0) return EMPTY_POSTINGS;
            return frozenPostings[field]?.[normalized] ?? EMPTY_POSTINGS;
        },
    };
    return deepFreeze(index);
}

/** 函数式索引入口别名。 */
export const buildContextIndex = buildContextInvertedIndex;

function assertContextDocument(document: ContextSearchDocument): void {
    if (!isRecord(document)) throw new ContextTokenizerError("document must be an object");
    if (document.schemaVersion !== 1) {
        throw new ContextTokenizerError("document schemaVersion must be 1");
    }
    assertNonEmptyString(document.documentId, "documentId");
    if (!isRecord(document.fields)) {
        throw new ContextTokenizerError("document fields must be an object");
    }
    for (const fieldName of CONTEXT_DOCUMENT_FIELD_NAMES) {
        const value = document.fields[fieldName];
        if (fieldName === "body") {
            if (typeof value !== "string") {
                throw new ContextTokenizerError("document body field must be a string");
            }
        } else if (!Array.isArray(value)) {
            throw new ContextTokenizerError(`document field must be an array: ${fieldName}`);
        }
    }
    const fields = document.fields as ContextDocumentFields;
    if (typeof fields.body !== "string") {
        throw new ContextTokenizerError("document body field must be a string");
    }
    for (const fieldName of CONTEXT_DOCUMENT_FIELD_NAMES) {
        if (fieldName === "body") continue;
        const values = valuesForField(fieldName, fields[fieldName]);
        if (!Array.isArray(values)) {
            throw new ContextTokenizerError(`document field must be an array: ${fieldName}`);
        }
        for (const value of values) {
            if (typeof value !== "string" && typeof value !== "number") {
                throw new ContextTokenizerError(`document field value is invalid: ${fieldName}`);
            }
        }
    }
}

function valuesForField(
    field: Exclude<ContextDocumentFieldName, "body">,
    fields: ContextDocumentFields[typeof field],
): readonly (string | number)[] {
    if (field === "stepIndex") {
        if (!Array.isArray(fields) || fields.some((value) => typeof value !== "number")) {
            throw new ContextTokenizerError("stepIndex field must contain numbers");
        }
        return fields;
    }
    if (!Array.isArray(fields) || fields.some((value) => typeof value !== "string")) {
        throw new ContextTokenizerError(`field must contain strings: ${field}`);
    }
    return fields;
}

function tokenizeIdentifierValues(
    field: Exclude<ContextDocumentFieldName, "body">,
    values: readonly (string | number)[],
): ContextToken[] {
    const tokens: ContextToken[] = [];
    for (const rawValue of values) {
        const raw = String(rawValue);
        const normalized = normalizeToken(raw);
        if (normalized.length === 0) continue;
        tokens.push({ value: normalized, raw, kind: "exact" });
        if (!IDENTIFIER_FIELDS.has(field)) continue;
        for (const part of splitIdentifier(raw)) {
            const split = normalizeToken(part);
            if (split.length === 0 || split === normalized || split.length > MAX_SPLIT_TOKEN_LENGTH) {
                continue;
            }
            tokens.push({ value: split, raw: part, kind: "split" });
        }
    }
    return tokens;
}

function tokenizeBody(body: string): ContextToken[] {
    const normalized = body.normalize("NFKC");
    const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
    return words.flatMap((word) => splitIdentifier(word))
        .map((word) => normalizeToken(word))
        .filter((word) => word.length > 0)
        .map((word) => ({ value: word, raw: word, kind: "split" as const }));
}

function splitIdentifier(value: string): readonly string[] {
    const normalized = value.normalize("NFKC")
        .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
        .replace(/([a-z\d])([A-Z])/gu, "$1 $2");
    return normalized
        .split(/[\\/._:,\-\s]+/gu)
        .flatMap((part) => part.split(/(?<=[\p{L}])(?=[\p{N}])|(?<=[\p{N}])(?=[\p{L}])/gu))
        .filter((part) => part.length > 0);
}

function normalizeToken(value: string): string {
    return value.normalize("NFKC").toLowerCase();
}

function compareLexical(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
    if (typeof value !== "object" || value === null || seen.has(value as object)) return value;
    seen.add(value as object);
    for (const child of Object.values(value as Record<string, unknown>)) {
        deepFreeze(child, seen);
    }
    return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new ContextTokenizerError(`${field} must be a non-empty string`);
    }
}

const EMPTY_POSTINGS: readonly ContextIndexPosting[] = Object.freeze([]);

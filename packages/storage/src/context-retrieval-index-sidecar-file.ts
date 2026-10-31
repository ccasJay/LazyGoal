/** Retrieval Index Sidecar 顶层文件的持久化 DTO。 */
export interface ContextRetrievalIndexSidecarFile {
    readonly schemaVersion: 1;
    /** @minLength 1 */
    readonly goalId: string;
    /** @minLength 1 */
    readonly runId: string;
    /**
     * @asType integer
     * @minimum 0
     */
    readonly derivedThroughSequence: number;
    /** @pattern ^sha256:[0-9a-f]{64}$ */
    readonly sourceDigest: string;
    readonly tokenizerVersion: "field-tokenizer-v1";
    /** @minLength 1 */
    readonly rankingVersion: string;
    /** @minLength 1 */
    readonly indexVersion: string;
    /**
     * Context Documents；元素结构与来源由 `context-retrieval` 的索引重建校验。
     */
    readonly documents: readonly unknown[];
    /**
     * 倒排索引快照；与 `documents` 的等价性由 `restoreContextInvertedIndex` 校验。
     */
    readonly index: unknown;
    /**
     * 查询缓存；容量和结果由 `ContextRetrievalQueryCache` 校验。
     */
    readonly queryCache: readonly unknown[];
    /**
     * @asType integer
     * @minimum 0
     */
    readonly conversationEndIndexExclusive: number;
    /** @pattern ^sha256:[0-9a-f]{64}$ */
    readonly conversationPrefixDigest: string;
}

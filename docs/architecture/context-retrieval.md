# Context Retrieval 模块

## 职责

`@lazygoal/context-retrieval` 是历史上下文检索的独立算法与索引核心。它仅依赖 `@lazygoal/contracts`（用于请求定义与过滤类型），不反向依赖 `packages/runtime` 或 `packages/storage`，不执行文件 I/O、不感知 Goal/Run 状态机，亦不直接访问持久化存储。

## 核心组件与两层接口

1. **分词器（FieldTokenizer）**：基于 `Intl.Segmenter` 和精确正则切分 path、camelCase、snake_case、数字与自然语言，保留原词与小写形态，提供确定性分词输出。
2. **倒排索引（ContextInvertedIndex）**：为文档集构建 term 倒排表、文档长度统计与平均字段长度（`schemaVersion: 1`）。
3. **BM25-lite 排序器（FieldedBm25LiteRanker）**：对字段加权（`body: 1.0`, `path: 2.0`, `errorCode: 2.0` 等）计算 BM25-lite 分数（`k1 = 1.2`, `b = 0.75`），执行过滤前置、精确标识加分与 6 位有效小数舍入。
4. **查询缓存与会话（ContextRetrievalIndexSession / ContextRetrievalQueryCache）**：以 64 项 LRU 维护规范化查询缓存，支持落后 Sidecar 的增量补齐与损坏重建。
5. **检索器抽象（ContextRetriever）**：定义无领域绑定的标准检索接口 `ContextRetriever.retrieve(input: ContextRetrieverInput)`。`IndexedContextRetriever` 为默认 BM25-lite 实现。
6. **Runtime 适配层**：Runtime 通过 `RuntimeContextLookupAdapter` 将 Goal/Trajectory 投影后委托给 `ContextRetriever`，并在 `IndexedContextLookupService` 中默认组装。所有检索结果在被接纳前均通过 Runtime Evidence Gate 边界校验。

## 固定语料评测

评测套件位于 `test/evaluation-corpus.ts` 与 `test/retrieval-evaluation.test.ts`，支持通过 `npm run benchmark:context-retrieval` 独立执行：

- **无 Runtime 启动**：评测直接基于纯数据（`ContextRetrievalTrajectoryEvent[]` 与 `ContextRetrievalMessage[]`）运行，无需实例化 Goal、Coordinator 或 Runner。
- **基线指标**：确定性断言 Recall@5、MRR 与负查询判定率不低于迁移前基线（均为 100%）。
- **性能统计**：独立记录分词与查询耗时，不施加机器相关的脆弱硬阈值断言。

## 相关入口

- [检索接口与实现](../../packages/context-retrieval/src/context-retriever.ts)：`ContextRetriever`、`IndexedContextRetriever`。
- [文档构建](../../packages/context-retrieval/src/context-document.ts)：执行单元事实与对话文档构建器。
- [倒排索引与分词](../../packages/context-retrieval/src/context-tokenizer.ts)：字段分词器与倒排索引构建。
- [BM25-lite 排序](../../packages/context-retrieval/src/context-ranking.ts)：字段加权排序器。
- [评测与基准脚本](../../scripts/benchmark-context-retrieval.ts)：独立固定语料评测入口。

# Context Retrieval 独立包设计

## 审批摘要

### 方案

新增 `@lazygoal/context-retrieval`，承载当前 BM25-lite 的文档建模、分词、索引会话、查询缓存、排序和检索服务。现有 Agent 模型继续选择 `system_context_lookup`，无需配置专门的检索模型；Runtime 通过薄适配器提供经校验的已提交历史，继续掌握结果接纳和事实提交，Storage 保留 Sidecar 文件读写。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 单向包依赖 | 检索包只依赖 `contracts`，Runtime 和 Storage 分别使用其接口与缓存 DTO；避免检索实现反向依赖 Goal 状态机。 | 独立包可直接测试和评测，现有调用方需迁移入口。 |
| 完整来源信封 | Runtime 从 Snapshot 和 Trajectory 投影检索输入，但向包传递经校验的完整事件信封及消息位置；摘要继续覆盖原事件全部字段。 | 保持 Sidecar 摘要、文档来源和跨 Run 边界，避免无谓缓存失效。 |
| 双层检索接口 | 包提供 `ContextRetriever`；Runtime 保留 `ContextLookupPort`，用适配器连接两者，默认注入 BM25-lite。 | 未来可替换算法，模型入口及 Runtime 授权、Step 和恢复流程不变。 |
| Sidecar 与结果边界 | 检索包拥有派生 Sidecar DTO、缓存与纯结构校验；Storage 仍拥有严格编解码和文件 I/O，Runtime 在提交前复验结果身份、来源与预算。 | 不改文件格式或协议版本；缓存损坏重建，权威来源错误维持 `lookup_error`。 |
| 固定基线评测 | 迁移前记录当前实现的固定语料结果，迁移后从独立包运行质量与耗时评测。 | Recall@5、MRR 和负查询质量可回归；耗时只报告，不设机器相关门槛。 |

### 风险与待确认

- 风险等级：medium；理由：包依赖、公共类型归属和 Sidecar 恢复接线跨越 Runtime、Storage 与组合根。
- 关键操作：无。
- 风险：事件投影少字段会改变 `sourceDigest`，结果类型重复会产生协议漂移，Sidecar 重建与跨 Run 来源必须做等价验证。
- 待确认：无。

## Overview

现有 `ContextLookupPort` 已是 Runtime 的替换边界，`system_context_lookup` 已是模型的专用系统函数。本设计只移动端口背后的检索实现，不创建普通业务 Tool，也不修改 `context_lookup`、Snapshot、Trajectory 或 Sidecar 协议。[Req 2、3、5]

## Architecture

```text
Agent LLM (Decide)
        | calls system_context_lookup
        v
Runtime: invokeContextLookup -> ContextLookupPort
                                  |
                    RuntimeContextLookupAdapter
                      |                    |
       Goal/Snapshot + TrajectoryStore     | trusted corpus input
                                           v
                           @lazygoal/context-retrieval
                           ContextRetriever (BM25-lite default)
                             |                  |
                             | derived cache    | found/not_found/lookup_error
                             v                  v
                    Storage: Sidecar Port     Runtime result gate
                                                |
                                      Trajectory + Snapshot commit
```

Runtime 读取每个已知 Run 的 `readWithBoundary`，并从当前 Snapshot 取得消息范围与提交边界。检索包只接收这次调用的只读来源快照；它不能自行读取 Goal、TrajectoryStore、Workspace 或 Tool Registry。Storage 的 Sidecar Port 是可选缓存依赖，不授予检索包领域写入权。[Req 1、2、3、5]

## Key Design Decisions

### 单向包依赖

新包依赖 `@lazygoal/contracts` 的查询请求类型，不依赖 Runtime 或 Storage。Runtime 依赖新包；Storage 为 Sidecar DTO 和 Port 依赖新包；TUI 组合根同时装配三者。同步更新 package manifest、TypeScript 入口与 `check:dependencies` 的允许边，明确禁止新包反向引用 Runtime/Storage。[Req 1.1–1.3]

将现有 `context-document.ts`、`conversation-context-document.ts`、`context-tokenizer.ts`、`context-ranking.ts` 和 `context-retrieval-index.ts` 的检索逻辑迁入新包。`indexed-context-lookup-service.ts` 拆为包内 `IndexedContextRetriever` 与 Runtime 内的来源适配器；结果构建和纯结构校验与缓存 DTO 一起迁入新包。Runtime 保留请求校验、`ContextLookupPort`、`invokeContextLookup`、来源所有权检查、Step 转换、Evidence Gate 和事实提交。算法入口从 Runtime 公共导出移除，当前消费者改用新包；Runtime 可以继续导出其领域协议类型。[Req 1.3、5.1]

### 完整来源信封

`RuntimeContextLookupAdapter` 从 Goal 取得当前及已完成 Run 的身份、局部提交边界、消息区间和当前 Epoch 起点。它用现有 Trajectory 读取与事件校验路径获得各 Run 的 committed 事件，再将事件完整、按原字段和值投影为检索包拥有的只读来源信封；只投影字段列表会改变现有 canonical `sourceDigest`，因此不得删除 `occurredAt`、事件元数据或未知但已持久化的字段。Conversation 输入保留原始消息位置、role 与 content。[Req 2.2、2.4]

包内 Builder 继续校验同一 Goal/Run、严格递增 sequence、连续且闭合的 execution unit；跳过 lookup 事实、内部程序事实和未提交 tail。单 Run 查询维持当前 Epoch 前的 Cold Conversation 与当前 Run Trajectory 的联合索引；跨 Run 查询仍按每个 Run 的局部边界建临时联合索引，不把不同 Run 的同号 sequence 混为同一来源，也不把跨 Run 结果写入单 Run Sidecar。[Req 2.1–2.3]

### 双层检索接口

包内 `ContextRetriever.retrieve(input)` 接收规范化的 `ContextLookupRequest`、Runtime 生成的 `lookupId`、当前 Run 身份、每个来源 Run 的提交边界与完整来源信封，返回现有 `ContextLookupResult` 结构；`IndexedContextRetriever` 是默认实现，可注入包定义的 Sidecar Port。接口不接收 Goal 或 Runtime `ExecutionControl`；Runtime 继续在调用前后检查取消，不允许检索实现提交领域事实。[Req 1.1、3.1–3.3]

Runtime 适配器实现既有 `ContextLookupPort`，准备来源后委派给所选 `ContextRetriever`。组合根默认创建 `IndexedContextRetriever`，可注入其他实现；Runner/Coordinator 继续只认识 `ContextLookupPort`。替换实现必须返回当前结果协议，`invokeContextLookup` 始终按现有规则规范化结果并校验结构、Goal/Run 来源与提交边界，再由共享提交器保存事实，不能信任实现自检。[Req 3、5.1]

### Sidecar 与结果边界

将 `ContextRetrievalIndexSidecar`、倒排快照、查询 LRU、版本常量及 Port 类型归属新包；Storage 的 `JsonFileContextRetrievalIndexStore` 继续维护原路径、权限、严格 Zod Schema 与原子写入。包内纯结果 DTO/结构校验供缓存恢复和 Runtime 最终结果门禁共用，Runtime 保留对真实 Goal/Run 的语义所有权校验，避免双份结果规则。[Req 2.3–2.4、5.1–5.3]

`sourceDigest` 仍对原 committed 事件信封做相同 canonical JSON 哈希；Conversation prefix digest、索引版本、缓存键、容量 64、字段统计和 Sidecar JSON 字段保持不变。Sidecar 缺失、损坏、领先或版本/摘要不匹配时重建，落后且来源前缀匹配时增量更新；相同边界的增量与全量重建产生相同文档和排序。保存缓存失败不影响查询，权威来源读取或结构损坏由 Runtime 归一化为 `lookup_error`，不可伪装为 `not_found`。中止继续按现有取消路径传播，不提交 lookup 事实。[Req 2.1–2.4、5.2–5.3]

### 固定基线评测

在迁移前从当前实现生成并审阅固定语料基线：精确标识、自然语言、负查询、同分排序以及 Conversation/Trajectory 混合来源。包内独立评测入口直接构造来源信封并调用默认检索器，不创建 Goal/Runner；记录每次查询的预期相关文档集合、Top-K 顺序与 `not_found` 结果。[Req 4.1–4.3]

Recall@5 按每题前五名相关命中数除以该题预期相关数再取平均；MRR 按每题首个相关命中的倒数名次取平均；负查询判定为预期无结果且实际 `not_found` 的比例。分词和查询耗时在固定预热及重复次数后报告，不设平台相关阈值。确定性结果和质量基线进入自动回归，指标报告可单独运行。[Req 4.2–4.3]

## Testing Strategy

- 包级测试：固定输入的文档 ID、Token、倒排统计、BM25 分数、同分顺序、相邻单元与预算结果同迁移前基线一致；新包测试只导入 `@lazygoal/context-retrieval` 与必要的 `contracts`。[Req 1、2.1、4]
- 来源与恢复：覆盖未提交 tail、内部程序与 lookup 事实过滤，坏 sequence/执行单元、Conversation 边界、跨 Run 同号 sequence，验证结果包含原始来源且旧 Run 不成为当前完成证据。[Req 2.2–2.3、3.2]
- Sidecar 集成：用迁移前的真实 Sidecar JSON 验证 Codec 和 `sourceDigest` 等价；覆盖缺失、损坏、落后、超前、保存失败，以及增量/重建结果等价。[Req 2.4、5.2–5.3]
- Runtime/Agent/TUI 接线：默认与注入的检索器都经过 `system_context_lookup`、`ContextLookupPort`、结果门禁、Step 和恢复流程；非法替换结果在提交前拒绝。运行受影响测试、`npm test`、`npx tsc --noEmit`、`npm run check:dependencies` 与 `git diff --check`。[Req 3、5]
- 独立评测：固定语料断言 Recall@5、MRR、负查询与排序不低于迁移前基线；耗时仅记录并在相同环境下用于诊断。[Req 4]

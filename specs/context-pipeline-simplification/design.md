# Context Pipeline Simplification 设计

## Overview

本设计删除上下文链路中没有生产消费者的语义 Compact、Warm Sidecar 和后台维护生命周期，并移除与现有严格协议重复的来源 Router。当前有效链路保持为两个独立过程：Conversation 由 `DropOldestContextCompactor` 按完整交互单元裁剪；Trajectory 上下文由 Snapshot committed boundary 限定，经严格执行单元投影后生成 Hot Window 与确定性 Warm 条目。

变更直接收窄开发期公共 API，不提供兼容层，不改变 Snapshot、Trajectory、Prompt Bundle 或 Context 协议版本。旧 Warm Sidecar 文件不再被发现或读取，也不会被主动删除。（需求 1、2、4、6）

## Research Findings

- `ContextCompactAdapter` 仅由公共导出和专用测试引用，Composition Root 没有创建或调用它；当前主模型调用不会产生独立 Compact LLM 请求。
- `JsonFileWarmContextSidecarStore` 的生产链路只有 `restore`，没有 `save` 或 `remove` 调用；`ContextMaintenanceWorker` 装配的是空任务。
- `GoalCoordinator` 在 Router 前已调用 `normalizeContextLookupRequest`；Runner 的 `validateAgentDecision` 对 `context_lookup` 使用同一个规范化函数。Agent Schema 和 Runtime 类型均只允许三类历史需求。
- `TrajectoryContextUnitAdapter` 只有 barrel export 和专用测试消费者；正式模型上下文使用 `TrajectoryExecutionUnitAdapter`。
- Retrieval Index Sidecar 同时存在恢复和保存消费者，因此继续作为历史检索的性能缓存。

## Architecture

简化后的模型输入数据流为：

```text
Goal Conversation
    |
    v
ConversationContextUnitAdapter
    |
    v
DropOldestContextCompactor
    |
    +----------------------------------+
                                       |
Snapshot committedThroughSequence      |
    |                                  |
    v                                  |
TrajectoryStore.readWithBoundary       |
    | committed                        |
    v                                  |
TrajectoryExecutionUnitAdapter         |
    |                                  |
    +--> HotWindowSelector             |
    |                                  |
    +--> deterministic Warm extraction |
                                       v
                              ModelInferenceView
```

历史检索链路为：

```text
Agent response
    |
    v
normalizeContextLookupRequest / validateAgentDecision
    |
    v
invokeContextLookup
    |
    v
ContextLookupPort
    |
    +--> Retrieval Index Sidecar
```

`ContextSourceRouter` 不再位于调用链中。当前 Workspace、Environment、任务契约、用户约束和完成证明仍由既有 Tool Observation、Goal State 与 Evidence Gate 负责，Context Lookup 的删除不改变这些权威来源。（需求 3、5）

## Components and Interfaces

### Agent 上下文组装

`TrajectoryModelContextAssemblerOptions` 删除 `sidecarStore` 和 `compactorVersion`。Assembler 每次调用均从 `TrajectoryStore.readWithBoundary` 读取 committed 事件，不缓存 Goal、Trajectory 或 Warm 结果。

`TrajectoryWarmEntryExtractionInput` 删除仅表达 Sidecar 覆盖范围的 `derivedThroughSequence`。可选 `warmEntryExtractor` 保留为纯函数扩展点；默认继续使用 `deterministicWarmEntryExtractor`，返回值仍由 `WarmReducer` 和 Warm 预算校验。提取失败只产生空 Warm，不影响 Hot 或主模型调用。

删除 `ContextCompactAdapter` 及其请求、响应、失败类型和 Schema，同时从 `LlmTraceKind` 删除 `context_compact_request`、`context_compact_response`、`context_compact_error` 以及专用记录函数。普通模型请求、响应、错误和预算诊断保持不变。（需求 1.2、1.3、2.4）

### Runtime 提交与检索

`TrajectoryCheckpointCommitterDependencies` 删除 `maintenancePort`。提交顺序固定保持：

```text
append facts
    -> validate preparation provenance tail
    -> save Snapshot(committedThroughSequence=N)
    -> append state_committed(N)
```

删除 Snapshot 保存后的旁路通知，不改变任何失败传播、Snapshot 权威性或 marker 失败诊断。（需求 2.2、6.2、6.3）

`GoalCoordinator` 在 `normalizeContextLookupRequest` 成功后直接把规范化请求交给 `invokeContextLookup`。Runner 使用 `validateAgentDecision` 返回的规范化 `context_lookup` 决策直接调用同一函数。两处删除 `contextSourceRouter` 依赖、实例字段和 Router 专用异常分支。（需求 3.1–3.4）

### Composition Root 与 Storage

Composition Root 不再创建或暴露 `JsonFileWarmContextSidecarStore`、`ContextMaintenanceWorker`，也不再把它们注入 Assembler 或 Committer。`ManagedResourceRegistry` 不再注册空维护 Worker。

`.lazygoal/context-sidecars` 目录继续由 `JsonFileContextRetrievalIndexStore` 使用，因此目录配置和 Retrieval Index Store 保留。删除 Warm Store 不执行磁盘清理，旧 `warm-v1.json` 文件成为无人读取的孤立缓存。（需求 2.1、2.3、5.1）

### 公共导出

删除以下实现和 barrel exports：

- `ContextCompactAdapter` 及其附属契约；
- `WarmContextSidecar*`、`JsonFileWarmContextSidecarStore` 与 Warm Codec；
- `ContextMaintenance*`；
- `ContextSourceRouter*`；
- `TrajectoryContextUnitAdapter`；
- 重复别名 `createContextLookupResultFromRanking`、`contextLookupResultFromRanking`、`ContextFieldTokenizer`、`buildContextIndex`、`rankFieldedBm25Lite`、`computeRetrievalIndexSourceDigest`、`retrievalIndexSidecarCodec`。

对应规范接口保持为 `buildContextLookupResultFromRanking`、`FieldTokenizer`、`buildContextInvertedIndex`、`rankContextDocuments`、`computeContextRetrievalSourceDigest` 和 `contextRetrievalIndexSidecarCodec`。（需求 4）

## Error Handling

- Context Lookup 结构错误继续由 `normalizeContextLookupRequest` 或 Agent 严格 Schema 拒绝；Coordinator 保持 `INVALID_CONTEXT_LOOKUP` 结果，Runner 保持现有 Agent Decision/lookup 错误分类。
- `ContextLookupPort` 缺失、检索失败、链式查询超过三次等现有分支不变。
- Trajectory 读取失败继续产生 `ModelContextSourceError`；固定输入超预算继续产生 `ModelContextHardOverflowError`。
- 自定义 Warm 提取或归约失败时回退为空 Warm；不得降级读取未提交 tail，也不得调用 LLM 生成摘要。
- 删除 Warm Sidecar 后不存在缓存协议错误；Retrieval Index Sidecar 的损坏、失配和重建语义保持不变。（需求 1.4、3.3、5.1、5.3）

## Key Design Decisions

1. **区分 Conversation Compactor 与语义 Compact Adapter。** 前者是当前模型调用的预算边界，必须保留；后者没有生产消费者，连同专用 Trace 一并删除。
2. **Warm 只做即时确定性投影。** 没有生产写入方的 Sidecar 不提供实际缓存收益，却引入协议、存储和生命周期，因此以 committed Trajectory 重建作为唯一行为。
3. **协议规范化是 Context Lookup 的唯一入口校验。** 删除 Router 不删除来源限制，只移除同一请求在 Runtime 中的重复分类。
4. **直接删除开发期废弃 API。** 不增加 deprecated alias、兼容 wrapper、迁移或版本分支，避免把待删维护面换成兼容维护面。
5. **保留有生产读写方的相邻能力。** Retrieval Index Sidecar、`DropOldestContextCompactor`、Context Epoch、严格执行单元 Adapter 和 Gemini Adapter 均不属于删除范围。

架构文档随实现同步更新。现有 `execution-trajectory` Project Memory Capsule 的旧通用 Adapter 描述属于维护候选，但其修订必须在实现完成后按 Project Memory 的独立预览和批准流程处理，不作为本 Spec 的隐式写入。

## Testing Strategy

- Agent：保留 Conversation Compactor 全部测试；改写 Assembler 测试以验证无 Sidecar 时的确定性 Warm、Hot 连续性、tail 排除、预算溢出和输入不可变性。
- Runtime：覆盖 Coordinator 与 Runner 的三类合法 lookup、非法请求 fail-closed、三次链路上限，以及删除维护通知后 Snapshot/marker 顺序不变。
- Storage/TUI：删除 Warm Sidecar 专用测试；验证 Composition Root 仍创建 Retrieval Index Store、Trajectory Assembler 和共享 Conversation Compactor，但不创建 Warm Store 或 Worker。
- API：TypeScript 编译与依赖检查确认被删符号无悬空消费者，规范名称仍可导入。
- Provider：运行不产生真实费用的现有 LLM/Gemini 单元或 smoke fixture；不执行会访问真实供应商的 `llm:agent-smoke`。
- 回归：运行 TypeScript 编译、全部 package 测试、benchmark 测试、Memory 工具测试、依赖边界检查、`memory:check` 与 `git diff --check`。（需求 1–6）

# 模型视图

本包定义发送给模型推理的只读表示：固定 Prompt 上下文、动态运行状态、真实 Conversation、Working Context、Working Memory、Context Epoch、Lookup 投影，以及历史执行单元、事件、输出预览、原生交换与 Warm 条目表示。公开入口是 [src/index.ts](../src/index.ts)。

## 表示边界

所有类型都由 Runtime State 单向投影得到，不导入 Runtime 领域类型、Projector、Reducer、模板或执行实现；从 Runtime State 到本表示的转换由 [模型上下文](../../model-context/README.md) 完成。View 与历史结果不承载 Goal/Run 控制权：模型不能提交 Goal、Snapshot、Step、Epoch、Todo ID、Action ID 或内部计数。

`ModelInferenceView` 由四部分组成：冻结版本与 Profile 的 [`PromptContext`](../src/model-inference-view.ts)、只由动态 section 消费的 `ModelDynamicContext`、保留 `sourceMessageIndex` 的真实 `conversation`，以及 `workingContext`、`workingMemory`、可选 `trajectoryContext`、可选 `contextLookupResult` 与 `contextEpoch`。`trajectoryContext.hot` 只包含连续完整的执行单元投影，`warm` 是可丢弃的有损条目；预算报告 `budget` 引用 [上下文预算](../../context-budget/README.md) 的契约。

历史结果表示在 [model-history-view.ts](../src/model-history-view.ts)：`ModelExecutionUnitProjection`、`ModelTrajectoryEvent`、`ModelOutputProjection`、`NativeModelExchange` 与 `WarmCompactEntry`/`WarmEntryKind`/`WarmEntryStatus`。事件类型名称是本表示自身的值域，不复制 Runtime 事件载荷协议；投影器赋值时 Runtime 新增事件类型会在编译期失败，强制显式更新。

Context Lookup 投影中的检索过滤引用 [模型协议契约](../../model-contracts/README.md) 的现有定义，匹配字段引用 [上下文检索](../../context-retrieval/README.md) 的表示契约；本包不复制这些协议。

## 限制

本包不做裁剪、不做投影计算、不读取历史、不执行 I/O。哪些字段进入请求、Section 身份与渲染顺序由 [上下文组装](../../model-context/README.md) 与 [Agent 模型请求](../../agent/README.md) 决定；预算数值由 [上下文预算](../../context-budget/README.md) 计算。

# 模型视图语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| ModelInferenceView | 一次模型推理的完整只读输入投影。 | [模型视图](../README.md) | [视图契约](../src/model-inference-view.ts) |
| PromptContext | 固定 system Prompt 渲染所需的冻结上下文。 | [模型视图](../README.md) | [视图契约](../src/model-inference-view.ts) |
| ModelDynamicContext | 只由动态 section 消费的当前运行状态。 | [模型视图](../README.md) | [视图契约](../src/model-inference-view.ts) |
| ModelConversationMessage | 保留 Goal 原始索引的真实会话消息投影。 | [模型视图](../README.md) | [视图契约](../src/model-inference-view.ts) |
| ModelTrajectoryContext | 一轮 Hot/Warm 与预算报告的模型视图。 | [模型视图](../README.md) | [视图契约](../src/model-inference-view.ts) |
| ModelExecutionUnitProjection | 可进入历史预算的完整执行单元表示。 | [模型视图](../README.md) | [历史结果表示](../src/model-history-view.ts) |
| ModelTrajectoryEvent | 模型可见的单个 Trajectory 事件 DTO。 | [模型视图](../README.md) | [历史结果表示](../src/model-history-view.ts) |
| NativeModelExchange | 不可拆分的原生调用与结果交换。 | [模型视图](../README.md) | [历史结果表示](../src/model-history-view.ts) |
| WarmCompactEntry | 可进入 Warm 层的有损语义条目。 | [模型视图](../README.md) | [历史结果表示](../src/model-history-view.ts) |
| ModelContextLookupResult | 历史 Lookup 的只读模型投影。 | [模型视图](../README.md) | [视图契约](../src/model-inference-view.ts) |

# 上下文预算语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| ModelInputEstimator | 最终模型输入的 Token 或字符计量抽象。 | [上下文预算](../README.md) | [模块说明](./overview.md) |
| ModelContextBudgetPolicy | 固定输入扣除后的 Warm/Hot 历史配额规划。 | [上下文预算](../README.md) | [模块说明](./overview.md) |
| TokenBudgetPlanner | 基于模型能力的硬输入上限与检查点压力计量。 | [上下文预算](../README.md) | [模块说明](./overview.md) |
| ContextUnit | 不可拆分的完整上下文单元表示。 | [上下文预算](../README.md) | [单元契约](../src/context-unit.ts) |
| DropOldestContextCompactor | 保留连续最新后缀的默认软预算裁剪策略。 | [上下文预算](../README.md) | [裁剪策略](../src/context-compactor.ts) |
| ContextSelector | 权威优先、按 Warm/旧 Conversation/Hot 顺序回退的统一选择器。 | [上下文预算](../README.md) | [选择器](../src/context-selector.ts) |
| stableJson | 键序稳定、数组保序的确定性 JSON 序列化。 | [上下文预算](../README.md) | [序列化](../src/stable-json.ts) |
| 思考链截断 | 超长思考链的确定性尾部截断与包装。 | [上下文预算](../README.md) | [截断契约](../src/thought-budget.ts) |

# Agent 模型请求语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LLMStepExecutor | 单步模型请求与决策执行器。 | [Agent 模型请求](../README.md) | [模块说明](./overview.md) |
| Prompt Bundle | 模型请求的版本化提示组合。 | [Agent 模型请求](../README.md) | [模块说明](./overview.md) |
| 历史来源范围 | 所有 lookup 结果说明 Goal 历史语料不包含仓库文件搜索。 | [Agent 模型请求](../README.md) | [结果投影](../src/context-lookup-projection.ts) |
| 模型诊断关联 | 用 callId 关联有界请求契约、原始响应与校验问题，不参与恢复。 | [Agent 模型请求](../README.md) | [诊断记录](../src/llm-diagnostic-trace.ts) |
| 调用形状反馈 | 有界字段摘要指导重生成，不携带参数值或改变接受条件。 | [Agent 模型请求](../README.md) | [反馈转换](../src/stage-feedback.ts) |
| ModelRunStageView | 模型可见的当前活动 Run 阶段只读投影。 | [Agent 模型请求](../README.md) | [视图定义](../src/model-inference-view.ts) |
| 完成审查上下文 | 用户原文与回复语境、当前阶段和原始证据；来源位置保留，不默认重放完整会话。 | [Agent 模型请求](../README.md) | [审查输入](../src/completion-review.ts) |

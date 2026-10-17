# Agent 模型请求语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LLMStepExecutor | 单步模型请求与决策执行器。 | [模型执行协调](../../model-execution/README.md) | [执行器](../../model-execution/src/llm-step-executor.ts) |
| Prompt Bundle | 模型请求的版本化提示组合。 | [Prompt Bundle](../../prompt-bundle/README.md) | [默认装配](../../prompt-bundle/src/default-bundles.ts) |
| 历史来源范围 | 所有 lookup 结果说明 Goal 历史语料不包含仓库文件搜索。 | [模型上下文组装](../../model-context/README.md) | [Lookup 投影](../../model-context/src/context-lookup-projection.ts) |
| 模型诊断关联 | 用 callId 关联有界请求契约、原始响应与校验问题，不参与恢复。 | [模型调用](../../model-call/README.md) | [诊断记录](../../model-call/src/llm-diagnostic-trace.ts) |
| 调用形状反馈 | 有界字段摘要指导重生成，不携带参数值或改变接受条件。 | [模型执行协调](../../model-execution/README.md) | [反馈转换](../../model-execution/src/stage-feedback.ts) |
| ModelRunStageView | 模型可见的当前活动 Run 阶段只读投影。 | [模型视图](../../model-view/README.md) | [视图定义](../../model-view/src/model-inference-view.ts) |
| Plan 提案前工具可见性 | 未获批 Plan Run 的请求只携带 Runtime 筛选出的显式只读工具。 | [Agent 模型请求](../README.md) | [Run 模式 Prompt](../../prompt-bundle/src/prompting/run-mode@1.njk) |
| Plan 路线规划 | 仅 Plan Run 按交付结构提出完整路线；普通 Run 沿用直接执行决策。 | [Agent 模型请求](../README.md) | [Run 模式 Prompt](../../prompt-bundle/src/prompting/run-mode@1.njk) |
| Plan 路线执行 | 获批 Plan Run 只读投影路线并按序推进；路线修订决策仅在获批 Plan Run 可见。 | [Agent 模型请求](../README.md) | [Run 模式 Prompt](../../prompt-bundle/src/prompting/run-mode@1.njk) |
| 完成审查上下文 | 用户原文与回复语境、当前阶段和原始证据；来源位置保留，不默认重放完整会话。 | [模型请求准备](../../model-request/README.md) | [审查输入](../../model-request/src/completion-review.ts) |
| 工具决策协议 | required 请求只解码唯一声明调用；正文 JSON 不替代工具结果，缺失与多调用进入纠错。 | [Agent 模型请求](../README.md) | [模块说明](./overview.md) |
| Decide 响应形状分级 | 单调用、多调用批次、零调用正文、无可用结果四类及其解码与错误语义。 | [模型响应解码](../../model-response/README.md) | [阶段响应检查](../../model-response/src/stage-response.ts) |

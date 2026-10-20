# 模型执行协调语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LLMStepExecutor | Decide/Think/完成审查的阶段执行器。 | [模型执行协调](../README.md) | [执行器](../src/llm-step-executor.ts) |
| ModelExecutionBinding | 单代固定 Adapter、预算与组装器的原子绑定。 | [模型执行协调](../README.md) | [绑定契约](../src/model-execution-binding.ts) |
| MutableModelBinding | 提供当前绑定的可替换 provider。 | [模型执行协调](../README.md) | [绑定契约](../src/model-execution-binding.ts) |
| 动作身份分配 | 原生/供应商/契约 actionId 的既有优先级。 | [模型执行协调](../README.md) | [执行器](../src/llm-step-executor.ts) |
| 阶段 frame | 关联 modelCallId 与原生响应的阶段结果元数据。 | [模型执行协调](../README.md) | [执行器](../src/llm-step-executor.ts) |
| 公开正文块结果 | 混合响应中被接受后应保存为过程正文的公开正文块与块下标。 | [模型执行协调](../README.md) | [执行器](../src/llm-step-executor.ts) |
| 阶段反馈转换 | 协议错误到有界 RuntimeFeedback 的转换。 | [模型执行协调](../README.md) | [反馈转换](../src/stage-feedback.ts) |
| 完成候选预览 | 只在请求实际声明完成候选工具时，读取其顶层 `summary` 字段值形成的未确认预览；参数对象其它字段不公开。 | [模型执行协调](../README.md) | [候选预览提取](../src/summary-preview.ts) |
| 候选预览解析 | 跨片段按 JSON 字符串状态解码字段值，处理转义、Unicode 与代理项；同名嵌套字段不参与，重复顶层键视为歧义。 | [模型执行协调](../README.md) | [候选预览提取](../src/summary-preview.ts) |

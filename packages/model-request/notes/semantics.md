# 模型请求准备语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| buildStepRequest | 组装与本次请求绑定的 LLM 请求、契约与 frame。 | [模型请求准备](../README.md) | [请求构造](../src/prompt.ts) |
| 阶段临时消息 | Think 历史、目标、发现结果与纠错反馈的来源标记消息。 | [模型请求准备](../README.md) | [请求构造](../src/prompt.ts) |
| 请求预算回退 | Warm → 旧 Conversation → Hot 的整体单元回退与检查点切换。 | [模型请求准备](../README.md) | [请求构造](../src/prompt.ts) |
| Section 更新计划 | 基于已筛选 frame 的完整注入、替换与失效。 | [模型请求准备](../README.md) | [差异算法](../src/dynamic-section-diff.ts) |
| 完成审查请求 | 只声明审查工具的不可裁剪证据请求。 | [模型请求准备](../README.md) | [审查构造](../src/completion-review.ts) |
| 请求检查 | 只读判断最终控制消息是否要求检查点。 | [模型请求准备](../README.md) | [请求检查](../src/request-inspection.ts) |
| Working Context | 本轮控制消息的最小动态负载。 | [模型请求准备](../README.md) | [消息渲染](../src/render.ts) |

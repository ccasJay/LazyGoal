# 模型执行协调

本包把 [模型请求准备](../../model-request/README.md)、[模型调用](../../model-call/README.md) 与 [模型响应解码](../../model-response/README.md) 组合为 Runtime 可消费的阶段执行器，并拥有单代模型绑定与阶段反馈转换。它不推进 Goal、不提交状态、不执行工具，也不拥有 Adapter、Store 或流资源。公开入口是 [src/index.ts](../src/index.ts)。

## 阶段协调

[`LLMStepExecutor`](../src/llm-step-executor.ts) 实现 `StepExecutor`：`decide`、`think`、`reviewCompletion` 与兼容的 `execute`。每个阶段开始时从 [`ModelExecutionBindingProvider`](../src/model-execution-binding.ts) 读取一次当前绑定，并在整个异步调用中固定使用该 generation 的 Adapter、预算策略与组装器；进行中发布的新 generation 不影响本阶段。

阶段流程为：构造请求（`buildStepRequest`）→ 单次调用与记录（`callModel`，成功响应必须来自唯一完成且已通过块序列核验）→ 使用同一请求契约解码（`classifyDecideResponse`/`decodeThinkResponse`/`decodeCompletionReviewResponse`，读视图由完整块派生）→ 组装阶段结果与 frame。解码失败复用同一 `callId` 记录最小诊断；请求与响应契约始终来自同一次调用，不在解码端重建 Schema。

Tool 调用解码后按原规则分配业务动作身份：原生会话使用新生成的 `action-` 前缀身份，否则优先使用供应商 `callId`，再回退契约分配的 `actionId`。阶段结果包含 `modelContextFrame`（关联 `modelCallId` 与原生响应消息），Runtime Runner 负责提交。

## 完成候选预览

[`SummaryPreviewExtractor`](../src/summary-preview.ts) 在请求实际声明完成候选工具、且响应中存在身份完全一致的工具调用时，只读取其参数 JSON 顶层的 `summary` 字符串。解析器按 JSON 字符串状态跨片段解码，处理 `\"`、`\\`、`\n` 与 `\uXXXX`，代理项不会被拆断；同名嵌套字段不参与匹配，顶层键重复出现视为歧义并放弃预览。公开正文上限为 64,000 个 UTF-16 code unit：超限只停止增加公开正文并标记截断，模型继续生成，保存仍使用真实完整内容。

预览由执行器在完成审查之前作为旁路事件发布，因此始终未确认：它不授权工具、不代替审批、不作为完成证据，也不进入 Goal Snapshot 或模型上下文。参数对象的其它字段（Evidence、Memory Patch 等）不进入公开正文。

## 绑定与反馈

[`ModelExecutionBinding`](../src/model-execution-binding.ts) 将同一 provider/model 的 Think/Decide Adapter、模型能力、预算策略与组装器作为一个 generation 原子发布；`MutableModelBinding` 提供当前绑定读取。构造期校验 provider 与输入估算器、能力与预算配置。

[`toModelStageFeedback`](../src/stage-feedback.ts) 把协议错误转换为带稳定来源、路径、有界字段形状与安全提示的 `ModelStageFeedbackError`；Contract 固定类型诊断保留期望的 JSON 类型；字面量提示使用请求 Schema 提供的有界期望值，未知诊断仍使用通用提示。阶段工具中的非法 Memory Patch 字段按实际工具参数路径报告删除，不伪装成合法记忆更新。它不携带参数值或任意错误正文，不改变 strict 或 prompt_only 接受条件，由 Runtime 提交为 `runtime_feedback`。

## 限制

执行器不实现阶段循环、重试预算、检查点提交或恢复决策；不关闭 Adapter、Store 或执行流。完成审查通过模型调用层只发布无正文的调用生命周期，不公开模型文本、推理或函数参数；指标与诊断失败被隔离。

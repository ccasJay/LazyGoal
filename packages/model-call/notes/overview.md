# 模型调用

本包拥有一次模型调用的完整生命周期：应用输出上限、保存最终输入、记录调用开始/结束、调用 `generate` 或消费 `stream`、发布既有可见性事件，并返回最终响应与调用身份；它不选择模型、不持有可变 Binding、不重试、不解码业务结果，也不关闭借用资源。公开入口是 [src/index.ts](../src/index.ts)。

## 调用生命周期

[`callModel`](../src/model-call.ts) 接收 [`ModelCallContext`](../src/model-call.ts)（Goal/Run 身份、Step 序号、模型标识、真实 Conversation、执行单元、Section 正文与阶段输出）与已准备请求。顺序固定为：取消检查 → 输入记录（失败阻止 Adapter 调用）→ 请求诊断 → `call_started` 指标 → Adapter 调用或流消费 → 取消检查 → `call_finished` 指标与响应诊断。

`model_started` 公开调用阶段（decide、think、completion_review）与调用身份，供观察者区分下一步选择、显式分析和完成审查；阶段不是工作流 Stage。

`generate` 路径发布一次性 `model_started`、文本/推理增量与 `model_completed` 事件；`stream` 路径逐事件映射到同一可见性分类，必须收到唯一 `completed` 响应，缺失或重复都抛 `LLMResponseProtocolError`。指标失败与诊断失败被隔离，不改变调用结果；取消在 Adapter 调用前、调用期间与流消费中均生效，并抛出 `ExecutionAbortedError`。

## 记录与来源

输入记录的 `messages.source` 沿用原规则：`native_history`、`system`、`request`（反馈与阶段消息）、`working_context`（末尾控制消息）、`conversation`（真实会话）与 `section`（动态 Section 正文）。调用身份 `callId` 同时用于指标、输入记录与诊断关联；阶段输出与 frame 的 `modelCallId` 由调用方使用返回的 `callId` 填充。

[`llm-diagnostic-trace`](../src/llm-diagnostic-trace.ts) 提供有界脱敏的请求、响应、工具 schema 与错误诊断：Trace 为 best effort、超限标记截断，不保证供应商 HTTP wire 原文，也不参与恢复。

## 限制

调用依赖均为借用：本包不注册进程信号、不创建 Goal、不提交状态、不实现模型选择或会话切换。完成审查阶段只发布 model_started/model_completed 生命周期，整块与增量内容均不进入执行流；模型文本、推理和函数参数保持私有。

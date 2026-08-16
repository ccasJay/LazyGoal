# Agent 模块

## 摘要

Agent 是 Runtime 与 LLM 之间的集成层。它读取完整 Goal，构造一次模型请求，并按阶段把模型原始文本严格解析为 PreparationResult 或 StepResult。

## 负责 / 不负责

- 负责：Prompt 组装、PreparationResult/StepResult 输出约束、JSON/Zod 校验、稳定协议错误。
- 不负责：Run 状态转换、循环、GoalStore、重试、具体供应商 SDK。

主要入口是 [LLMPreparationExecutor](../../packages/agent/src/llm-preparation-executor.ts) 与 [LLMStepExecutor](../../packages/agent/src/llm-step-executor.ts)，请求构造位于 [prompt.ts](../../packages/agent/src/prompt.ts)，响应边界位于 [response-schema.ts](../../packages/agent/src/response-schema.ts)。

## 单轮数据流

1. 若 Profile 含 `toolIds`，在模型调用前抛出 `TOOLS_NOT_SUPPORTED`。
2. active `gathering_context` 只接受 `question/context_ready`；active `planning` 只接受 `task_proposal`。
3. 执行阶段响应只接受 `continue`、`wait`、`complete` 或 `fail`。
4. Adapter 每轮只调用一次并返回原始文本；phase/result 不匹配按协议错误拒绝，不修复、不重试。
5. Preparation Executor 只返回决策；未来 Coordinator 负责阶段推进和消息持久化。Step Executor 仍把消息交给 Runner 保存。

## 错误与不变量

- 非法 JSON、Schema 或 Preparation phase 不匹配：抛出 `INVALID_LLM_RESPONSE`，不修复、不重试。
- Adapter 异常保持原对象向上传播；Runner 将其记录为失败 Step。
- Executor 不修改传入 Goal，也不直接写 Store。
- system prompt 来自冻结 Profile，不重复写入 Goal 消息历史；持久化 assistant 消息使用 `profileId` 标记来源。

## 当前限制与背景

当前没有 Tool Calling、流式响应、自动重试和协议自修复。Preparation 请求目前只带最小阶段控制上下文，完整三阶段 Working Context 尚未接入。早期设计背景见 [LLM Step Executor Spec](../../specs/llm-step-executor/design.md)，现状以源码为准。

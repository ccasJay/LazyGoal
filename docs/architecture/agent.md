# Agent 模块

## 摘要

Agent 是 Runtime 与 LLM 之间的集成层。它读取完整 Goal，构造一次模型请求，把模型原始文本严格解析为 StepResult，并把本轮消息交还 Runner 持久化。

## 负责 / 不负责

- 负责：Prompt 组装、StepResult 输出约束、JSON/Zod 校验、稳定协议错误。
- 不负责：Run 状态转换、循环、GoalStore、重试、具体供应商 SDK。

主要入口是 [LLMStepExecutor](../../packages/agent/src/llm-step-executor.ts)，请求构造位于 [prompt.ts](../../packages/agent/src/prompt.ts)，响应边界位于 [response-schema.ts](../../packages/agent/src/response-schema.ts)。

## 单步数据流

1. 若 Profile 含 `toolIds`，在模型调用前抛出 `TOOLS_NOT_SUPPORTED`。
2. 消息顺序固定为：system → Goal 历史 messages → 本轮 user。
3. Adapter 只调用一次，返回模型原始文本。
4. 响应必须是严格的 `continue`、`wait`、`complete` 或 `fail` JSON。
5. 成功时返回 StepResult 与本轮 user/assistant 消息；Runner 负责追加和保存。

## 错误与不变量

- 非法 JSON 或 Schema 不匹配：抛出 `INVALID_LLM_RESPONSE`，不修复、不重试。
- Adapter 异常保持原对象向上传播；Runner 将其记录为失败 Step。
- Executor 不修改传入 Goal，也不直接写 Store。
- system prompt 来自冻结 Profile，不重复写入 Goal 消息历史。

## 当前限制与背景

当前没有 Tool Calling、流式响应、自动重试和协议自修复。早期设计背景见 [LLM Step Executor Spec](../../specs/llm-step-executor/design.md)，现状以源码为准。


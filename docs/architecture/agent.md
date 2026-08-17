# Agent 模块

## 摘要

Agent 是 Runtime 与 LLM 之间的集成层。它读取完整 Goal，构造一次模型请求，并按阶段把模型原始文本严格解析为 PreparationResult 或 AgentDecision。

## 负责 / 不负责

- 负责：三阶段 Working Context 派生、Prompt 组装、调用方传入的授权 ToolDefinition 展示、PreparationResult/AgentDecision 输出约束、JSON/Zod 校验、稳定协议错误。
- 不负责：Run 状态转换、Profile/Registry/Policy 授权、Tool 执行、循环、GoalStore、重试、具体供应商 SDK。

主要入口是 [LLMPreparationExecutor](../../packages/agent/src/llm-preparation-executor.ts) 与 [LLMStepExecutor](../../packages/agent/src/llm-step-executor.ts)，请求构造位于 [prompt.ts](../../packages/agent/src/prompt.ts)，响应边界位于 [response-schema.ts](../../packages/agent/src/response-schema.ts)。

## 单轮数据流

1. Preparation 不因 Profile 含 `toolIds` 而提前失败；Runtime Runner 只把 Profile 中已注册的 ToolDefinition 传给 executing 请求。
2. 每轮从 Goal 派生 `gathering_context`、`planning` 或 `executing` Working Context；请求顺序固定为 system → 真实历史 → 当前控制消息。
3. active `gathering_context` 只接受 `question/context_ready`；active `planning` 只接受 `task_proposal`；执行阶段只接受四分支 AgentDecision。
4. Adapter 每轮只调用一次并返回原始文本；phase/result 不匹配按协议错误拒绝，不修复、不重试。Executor 接收 Runtime 传入的 `ExecutionControl`，在 Adapter 返回后检查中止，不解析中止为 Agent 失败。
5. Working Context 与模型协议 JSON 都不写入真实消息。执行请求通过 `checkpoint`、`previousStep` 和 `pendingAction` 获得有界累计状态。

## 错误与不变量

- 非法 JSON、Schema 或 Preparation phase 不匹配：Agent 抛出 `INVALID_LLM_RESPONSE`，不修复、不重试；Runner 在 executing 边界将 AgentDecision 协议错误归类为 `INVALID_AGENT_DECISION`。
- Adapter 异常保持原对象向上传播；Runner 将其记录为失败 Step。
- `ExecutionAbortedError` 原样传播，不进入失败 Step 或协议错误分支。
- Executor 不修改传入 Goal，也不直接写 Store。
- system prompt 来自冻结 Profile，不重复写入 Goal 消息历史；恢复后的 user/assistant 内容和顺序原样参与后续请求，assistant 来源仍保存在 Goal 的 `profileId` 中。

## 当前限制与背景

Agent 不直接持久化 pendingAction、执行 Tool 或处理审批；这些由 Runtime Runner/Coordinator 负责。当前 Agent 仍不提供流式响应、自动重试和协议自修复。LLM Step Executor 已返回 AgentDecision，Coordinator 负责 Preparation 消息，模型原始 JSON 不会持久化。早期设计背景见 [LLM Step Executor Spec](../../specs/llm-step-executor/design.md)，现状以源码为准。

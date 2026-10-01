---
feature: llm-step-executor
status: active
summary: "单次模型决策、严格 AgentDecision 协议与 ToolDefinition 输入边界"
source_spec: specs/llm-step-executor/
distilled_at: 2026-08-16
reviewed_at: 2026-08-18
tags: [agent, llm, agent-decision, tool-definition]
authorities: [docs/architecture/agent.md, packages/agent/src/llm-step-executor.ts]
---

# LLM Step Executor

## Purpose

- `LLMStepExecutor` 是 Executing 阶段的一次模型决策边界：构造请求、调用一次 Adapter，并把响应解析为严格的 `AgentDecision`。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — 每次 `LLMStepExecutor` 调用只执行一次 Adapter 请求；协议错误不会在该调用内触发修复、重试或降级。按错误恢复 Spec，Runtime 仅在提交明确的 `RuntimeFeedback` 后重新调用原阶段，并受三次总调用上限约束。 [S1, S2, S3, S5, S8]
- D2 — 调用方提供的授权 `ToolDefinition` 是模型决策的输入边界；Executor 描述可用 Tool，但不负责授权判断或 Tool 执行。 [S3, S5, S6, S7]
- D3 — Executor 不修改 Goal，不推进状态，不保存快照，也不拥有运行循环。 [S1, S2, S3, S5]

## Guardrails

- 响应必须按当前严格 Schema 解析为合法 `AgentDecision`；未知分支、额外字段和空白必填文本必须产生可识别的协议错误。 [S4, S5, S6]
- 每次 Executor 调用仍只发送一次请求；校验失败终止当前调用。符合 `runtime-feedback-tool-approval` 的可纠正错误可由 Runtime 先持久化身份匹配的反馈、再开始新的有界阶段调用。 [S1, S3, S5, S8]
- Adapter 原始错误应保持原对象传播且不重试；取消信号必须传入 Adapter，并在取消后阻止继续解析响应。 [S3, S5]
- 不得在 Executor 内根据 Profile 是否声明 Tool 提前拒绝整个模型调用；实际可见 Tool 由调用方传入的授权定义决定。 [S3, S5, S7]

## Revisit When

- `AgentDecision` 分支、响应 Schema 或 ToolDefinition 契约变化时。
- `runtime-feedback-tool-approval` 中可纠正错误的范围、阶段反馈或尝试上限变化时。
- Tool 授权所有权迁移到 Agent package 时。

## Sources

- S1: `specs/llm-step-executor/requirements.md`
- S2: `specs/llm-step-executor/design.md`
- S3: `packages/agent/src/llm-step-executor.ts`
- S4: `packages/agent/src/model-output.ts`
- S5: `packages/agent/test/llm-step-executor.test.ts`
- S6: `packages/agent/test/model-output.test.ts`
- S7: `packages/agent/test/prompt.test.ts`
- S8: `packages/agent/src/stage-feedback.ts`

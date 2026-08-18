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

- D1 — 每次执行只允许一次 Adapter 调用；协议错误不得触发隐式修复、重试或第二次模型请求。 [S1, S2, S3, S5]
- D2 — 调用方提供的授权 `ToolDefinition` 是模型决策的输入边界；Executor 描述可用 Tool，但不负责授权判断或 Tool 执行。 [S3, S5, S6, S7]
- D3 — Executor 不修改 Goal，不推进状态，不保存快照，也不拥有运行循环。 [S1, S2, S3, S5]

## Guardrails

- 响应必须按当前严格 Schema 解析为合法 `AgentDecision`；未知分支、额外字段和空白必填文本必须产生可识别的协议错误。 [S4, S5, S6]
- Adapter 原始错误应保持原对象传播且不重试；取消信号必须传入 Adapter，并在取消后阻止继续解析响应。 [S3, S5]
- 不得在 Executor 内根据 Profile 是否声明 Tool 提前拒绝整个模型调用；实际可见 Tool 由调用方传入的授权定义决定。 [S3, S5, S7]

## Revisit When

- `AgentDecision` 分支、响应 Schema 或 ToolDefinition 契约变化时。
- 产品引入明确的模型重试、修复或多调用策略时。
- Tool 授权所有权迁移到 Agent package 时。

## Sources

- S1: `specs/llm-step-executor/requirements.md`
- S2: `specs/llm-step-executor/design.md`
- S3: `packages/agent/src/llm-step-executor.ts`
- S4: `packages/agent/src/response-schema.ts`
- S5: `packages/agent/test/llm-step-executor.test.ts`
- S6: `packages/agent/test/response-schema.test.ts`
- S7: `packages/agent/test/prompt.test.ts`

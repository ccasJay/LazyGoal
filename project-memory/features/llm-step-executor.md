---
feature: llm-step-executor
status: active
source_spec: specs/llm-step-executor/
distilled_at: 2026-08-16
tags: [agent, llm-step-executor, prompt-builder, zod-schema, step-result]
supersedes: []
superseded_by: []
status_reason: ""
---

# LLM Step Executor

## Capability

- LLMStepExecutor 作为 Runtime 与 LLMAdapter 之间的单步适配器，负责根据当前 Goal、Profile 与执行上下文构造模型请求，发起单次模型生成，并通过严格的 Zod Schema 将 JSON 响应收敛为一个合法的 StepResult。 [S1, S2, S3]

## Durable Decisions

- 独立的 Agent 集成层架构：依赖方向为 `agent -> runtime contracts` 和 `agent -> llm contracts`；Runtime 与 LLM 保持解耦，不反向依赖 Agent 实现。 [S1, S2, S3]
- 严格单步无隐式循环：执行器内部不持久化状态、不调用 transition 状态机、不启动下一步，执行控制权完整保留在 Runner 循环中。 [S1, S2, S3]
- Zod 4 Discriminated Union 协议校验：严格按 kind 分支限制载荷字段（continue/complete 用 summary、wait 用 reason、fail 用 error），拒绝多余字段或空白字符，校验失败抛出稳定的 INVALID_LLM_RESPONSE 协议错误且不隐式重试。 [S1, S2, S4]

## Contracts and Invariants

- Tool 前置拦截契约：Profile 声明了非空 toolIds 时，在调用 Adapter 之前抛出 TOOLS_NOT_SUPPORTED 异常，绝不静默忽略能力声明。 [S1, S2, S3]
- 请求上下文只读不变量：构造 Prompt 仅投影只读上下文，绝不修改传入的 Goal 快照或内部字段。 [S1, S2, S3]

## Lessons

- 使用 Zod 将不可信的模型文本输出强制转换为严格结构化 DTO，并在接入 Runner 时通过统一的异常处理转为 failed 终态，既保障了 LLM 交互的健壮性，又不会污染底层状态机的纯净度。 [S2, S4, S5]

## Reuse Triggers

- 实现基于 LLM 的任务执行器、构建结构化 Agent 输出 Schema、设计模型提示词组装管道或接入新模型适配器。

## Sources

- S1: `specs/llm-step-executor/requirements.md`
- S2: `specs/llm-step-executor/design.md`
- S3: `packages/agent/src/llm-step-executor.ts`
- S4: `packages/agent/src/response-schema.ts`
- S5: `packages/agent/test/llm-step-executor.test.ts`

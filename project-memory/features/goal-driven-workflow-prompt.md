---
feature: goal-driven-workflow-prompt
status: active
summary: "按阶段约束规划、证据账本与完成判定的工作流 Prompt"
source_spec: specs/goal-driven-workflow-prompt/
distilled_at: 2026-08-25
reviewed_at: 2026-08-25
tags: [prompt, workflow, evidence, planning, completion]
authorities: [docs/architecture/agent.md, packages/agent/src/step-prompt/agent-decision@2.njk, packages/agent/src/preparation-prompt/planning@2.njk]
---

# Goal-Driven Workflow Prompt

## Purpose

- v2 工作流 Prompt 将 gathering、planning 和 executing 的阶段边界、可用能力与完成判定显式化，使 Goal 能根据当前 Runtime 证据持续推进。 [S1, S2, S3]

## Durable Decisions

- D1 — planning 只能使用当前 Runtime 提供的已授权、已注册 ToolDefinition；completion criteria 必须可由 Conversation、Working Context 或 Authorized Tool Observation 验证，无法取得的外部证据必须显式保留为依赖。 [S1, S2, S3, S5]
- D2 — executing 只接受已记录的 Observation 作为 Tool 事实，每轮最多请求一个 Authorized Tool Action，并在 Action 前后保持严格 AgentDecision 协议。 [S1, S2, S4, S5]
- D3 — checkpoint 是累计证据账本，必须逐条覆盖 completion criteria 的当前证据状态、已确认进展、关键证据和剩余工作；只有所有条件具备充分证据且不存在可执行下一步时才能 complete。 [S1, S2, S4, S5]

## Guardrails

- 每个 Phase 只能返回该 Phase 允许的协议分支；Prompt 不得跨阶段执行 Tool、伪造 Observation 或隐式回退到其他 Bundle 版本。 [S2, S3, S4, S6]
- 规划和执行都必须保留用户明确提出但 Runtime 无法验证的外部依赖，不得为了闭合循环而臆造完成证据。 [S1, S2, S5]

## Revisit When

- completion criteria、evidence ledger 或 Phase 间允许的协议分支发生变化时。
- Runtime 提供新的可验证能力或新的外部依赖表达方式时。

## Sources

- S1: `specs/goal-driven-workflow-prompt/requirements.md`
- S2: `specs/goal-driven-workflow-prompt/design.md`
- S3: `packages/agent/src/preparation-prompt/planning@2.njk`
- S4: `packages/agent/src/step-prompt/agent-decision@2.njk`
- S5: `packages/agent/test/prompting-default-bundles.test.ts`
- S6: `packages/agent/test/llm-preparation-executor.test.ts`

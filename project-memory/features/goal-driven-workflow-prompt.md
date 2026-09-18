---
feature: goal-driven-workflow-prompt
status: active
summary: "按任务批准门控约束工具、证据账本与完成判定的统一工作流 Prompt"
source_spec: specs/goal-driven-workflow-prompt/
distilled_at: 2026-08-25
reviewed_at: 2026-09-18
tags: [prompt, workflow, evidence, planning, completion]
authorities: [docs/architecture/agent.md, packages/agent/src/step-prompt/agent-decision@1.njk, packages/agent/src/prompt.ts, packages/contracts/src/model-output/factory.ts]
---

# Goal-Driven Workflow Prompt

## Purpose

- 统一 executing Prompt 根据 task 是否已批准暴露能力和完成判定，使模型在同一 Runtime 协议内持续推进 Goal。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — task 缺省时只允许 ask_user、task_proposal、历史 context_lookup 和显式只读 Tool；task 批准后才允许普通 Tool、complete、wait、fail 与执行期 ask_user。 [S1, S2, S3, S4, S5]
- D2 — executing 仍只接受已提交 Observation 作为 Tool 事实，每轮最多请求一个当前授权 Tool 或 System Tool；模型不得生成 Runtime ID、Step、Epoch 或 Action 元数据。 [S1, S2, S3, S4, S6]
- D3 — completion criteria 只能由已提交 Tool/Observation Evidence 覆盖；Evidence Ledger 必须显式保留缺口和不可验证的外部依赖，不能由用户回答、任务提案或历史 Lookup 闭合。 [S1, S2, S3, S5, S7]

## Guardrails

- Prompt 不再通过 gathering/planning/executing 多套 Bundle 表达生命周期；当前唯一 executing Bundle 仍必须按 task gate 限制分支，不得暴露批准前的副作用 Tool 或批准后的 task proposal。 [S1, S2, S3, S4, S6]
- 规划和执行都必须保留 Runtime 无法验证的外部依赖，不得为了闭合循环而臆造完成证据。 [S1, S2, S3, S5, S7]

## Revisit When

- task approval gate、completion criteria、Evidence Ledger 或统一 AgentDecision 分支发生变化时。
- Runtime 提供新的可验证能力、外部依赖表达方式或新的 Prompt Bundle 版本时。

## Sources

- S1: `specs/preparation-phase-removal/requirements.md`
- S2: `specs/preparation-phase-removal/design.md`
- S3: `docs/architecture/agent.md`
- S4: `packages/agent/src/step-prompt/agent-decision@1.njk`
- S5: `packages/contracts/src/model-output/factory.ts`
- S6: `packages/agent/test/prompting-default-bundles.test.ts`
- S7: `packages/tui/test/prompt-bundle-integration.test.ts`

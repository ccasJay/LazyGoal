---
feature: goal-driven-workflow-prompt
status: active
summary: "按 Run 模式引导任务提案、获授权工具与证据闭环的统一工作流 Prompt"
source_spec: specs/goal-driven-workflow-prompt/
distilled_at: 2026-08-25
reviewed_at: 2026-09-23
tags: [prompt, workflow, evidence, planning, completion]
authorities: [docs/architecture/agent.md, packages/agent/src/step-prompt/agent-decision@1.njk, packages/agent/src/prompt.ts, packages/contracts/src/model-output/factory.ts]
---

# Goal-Driven Workflow Prompt

## Purpose

- 根据当前 Run 模式引导普通执行或提案审批，并让 Agent 用已提交 Observation 支撑可验证完成声明。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — 决策契约由 Run.mode、当前 approvedTask 与获授权的 GoalPlan 写能力共同决定：普通 Run 以用户请求为目标，可请求已授权 Tool、提问、完成、等待或失败，不提出任务审批；未批准 Plan Run 的 Prompt 要求先给出目标与可验证条件提案；已批准 Plan Run 才按获批 Task 完成。 [S1, S2, S4, S5, S6, S7]
- D2 — Prompt 保留单一 executing 工作流与统一 AgentDecision 协议；每轮事实依据来自已提交 Observation，不重复生成 Runtime ID、Step、Epoch 或 Action 元数据。 [S3, S4, S5, S7]
- D3 — 对获批 Task 的 completion criteria 只能由有效 Observation Evidence 覆盖；Evidence Ledger 保留缺口与不可验证外部依赖，用户回答、任务提案和历史 Lookup 不能闭合证据缺口。 [S3, S8, S9, S10, S11]

## Guardrails

- Plan Prompt 的提案优先顺序是 Agent 行为指导，不是以 approvedTask 或 isReadOnly 为条件的新增 Runtime Tool 门控；实际 Tool 授权和 Action 审批由 Runtime 执行。 [S1, S2, S4, S6, S7]
- Prompt 不替代 Runtime 对当前 Run、Observation 提交状态和完成条件的校验。 [S3, S8, S10, S11]

## Revisit When

- Run 模式、任务提案能力、completion criteria、Evidence Ledger 或 AgentDecision 分支发生变化时。
- Runtime 提供新的可验证能力、外部依赖表达方式或新的 Prompt Bundle 版本时。

## Sources

- S1: `specs/mode-driven-task-proposal/requirements.md`
- S2: `specs/mode-driven-task-proposal/design.md`
- S3: `specs/goal-driven-workflow-prompt/requirements.md`
- S4: `docs/architecture/agent.md`
- S5: `packages/agent/src/step-prompt/agent-decision@1.njk`
- S6: `packages/contracts/src/model-output/factory.ts`
- S7: `packages/agent/test/prompting-default-bundles.test.ts`
- S8: `specs/verifiable-completion-evidence/requirements.md`
- S9: `packages/runtime/src/evidence-gate.ts`
- S10: `packages/runtime/test/runner.test.ts`
- S11: `packages/tui/test/prompt-bundle-integration.test.ts`

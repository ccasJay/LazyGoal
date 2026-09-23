---
feature: unified-agent-step-flow
status: active
summary: "统一 Agent 单步执行流与按 Run 模式切换的任务提案 Prompt"
source_spec: specs/unified-agent-step-flow/
distilled_at: 2026-09-21
reviewed_at: 2026-09-23
tags: [agent, runtime, step-flow, action-observation, read-only, unified-prompt, task-gate]
authorities: [docs/architecture/runtime.md, docs/architecture/agent.md, packages/runtime/src/domain.ts, packages/runtime/src/runner.ts, packages/agent/src/step-prompt/agent-decision@1.njk, packages/runtime/src/run-mode-capabilities.ts]
supersedes: [project-memory/features/preparation-read-only-tools.md]
---

# Unified Agent Step Flow

## Purpose

- 将任务提案前的只读环境读取纳入普通 Action/Observation 执行流，使读取拥有与其他 Tool 相同的持久化、Step 计数、上下文反馈和恢复语义。 [S3, S4, S5, S7, S9]
- 使用单一 executing Prompt 按 Run.mode 引导普通直执行、Plan 提案审批和获批任务执行；Prompt 顺序不代替 Runtime 的授权边界。 [S1, S2, S7, S8, S10]

## Durable Decisions

- D1 — 只读环境读取使用普通 Step：未获批 Plan 或普通 Run 中请求只读 Tool 时，经普通 stage_action、Tool 执行和 observe_action 提交；每次读取更新 stepCount 和 lastStep，不保留隐藏探查结果。 [S3, S4, S5, S9, S12]
- D2 — 任务提案不构成业务 Tool 授权状态：普通 Run 直接执行用户请求；Plan Prompt 要求未审批先提交提案，但 Runtime 不仅因缺少 approvedTask 或 isReadOnly 拒绝已获授权 Tool。Profile、Registry、Tool Policy 与 Action 审批继续决定是否执行。 [S1, S2, S6, S7, S8, S12]
- D3 — 单一默认工作模式 Prompt：executing 模板按 Run.mode 和 approvedTask 动态说明可请求的决策；普通 Run 不提出任务审批，未批准 Plan Run 引导先提案，已批准 Plan Run 围绕获批条件执行。 [S1, S2, S7, S8, S11]
- D4 — 删除专用 Probe 协议面：observe_probe、PlanProbeProgressEvent、probeCount 和专用探查进度流不属于当前协议；旧开发数据不迁移。 [S3, S4, S5, S6, S9]
- D5 — 读取计入统一执行预算：复用 executionPolicy.maxSteps 限制所有 Step，读取 Step 同样消耗预算。 [S3, S4, S5, S9]

## Guardrails

- 只读 Tool 调用仍必须先持久化 action_staged 后才能执行；业务 Tool 是否可执行由既有授权和 Action 审批决定。 [S1, S2, S7, S12]
- 模型自述和读取结果不得直接作为任务完成证据，必须使用适用的当前 Run 已提交 Observation。 [S1, S2, S6, S7, S9, S12]
- Plan Prompt 先提案的指引不保证提案前没有通过既有权限的 Tool 副作用。 [S1, S2, S8]

## Revisit When

- 需要支持只读 Tool 不计 Step 的专用外部观察，或增加无需任务审批的轻量交互探查协议时。
- Prompt 模板、Run 模式能力或 Agent 决策分支发生变化时。

## Sources

- S1: `specs/mode-driven-task-proposal/requirements.md`
- S2: `specs/mode-driven-task-proposal/design.md`
- S3: `specs/unified-agent-step-flow/requirements.md`
- S4: `specs/unified-agent-step-flow/design.md`
- S5: `specs/unified-agent-step-flow/tasks.md`
- S6: `docs/architecture/runtime.md`
- S7: `packages/runtime/src/runner.ts`
- S8: `packages/contracts/src/model-output/factory.ts`
- S9: `packages/runtime/test/runner-pretask-read.test.ts`
- S10: `packages/agent/src/step-prompt/agent-decision@1.njk`
- S11: `packages/agent/test/prompting-default-bundles.test.ts`
- S12: `packages/runtime/src/run-mode-capabilities.ts`

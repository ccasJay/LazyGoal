---
feature: unified-agent-step-flow
status: active
summary: "统一 Agent 单步执行流与默认工作模式，任务未批准时的只读环境读取纳入普通 Action/Observation Step 并计入统一预算"
source_spec: specs/unified-agent-step-flow/
distilled_at: 2026-09-21
reviewed_at: 2026-09-21
tags: [agent, runtime, step-flow, action-observation, read-only, unified-prompt, task-gate]
authorities: [docs/architecture/runtime.md, docs/architecture/agent.md, packages/runtime/src/domain.ts, packages/runtime/src/runner.ts, packages/agent/src/step-prompt/agent-decision@1.njk]
supersedes: [project-memory/features/preparation-read-only-tools.md]
---

# Unified Agent Step Flow

## Purpose

- 将任务批准前的只读环境读取纳入统一的普通 Action/Observation 执行流，使其拥有相同的持久化、Step 计数、上下文反馈和恢复语义，彻底移除专用 `planProbe` 协议面。 [S1, S2, S3, S4, S6, S7]
- 通过单一统一的 System Prompt 引导模型在未批准任务时自主调查、提问与提出方案，在已批准任务时围绕完成条件执行与验证。 [S1, S2, S5, S8]

## Durable Decisions

- D1 — 只读环境读取使用普通 Step：任务未批准时允许只读 Tool，通过普通 `stage_action`、Tool 执行和 `observe_action` 提交，每次读取增加 `stepCount` 并更新 `lastStep`，不再维护隐藏的非 Step 探查结果。 [S1, S2, S6, S7, S9]
- D2 — 任务门控优先于 Tool Policy：Runner 在调用 Policy 前先执行任务门控，未批准任务时请求非只读 Tool 直接返回 `INVALID_AGENT_DECISION` 拒绝，防止副作用 Tool 绕过任务审批。 [S1, S2, S6, S7, S9]
- D3 — 单一默认工作模式 Prompt：使用单一 `executing` Prompt 模板，根据任务批准状态动态说明可用能力，引导模型先减少关键不确定性、每轮只请求最小下一步并在获得 Observation 后更新判断。 [S1, S2, S5, S8]
- D4 — 彻底删除专用 Probe 协议面：删除 `observe_probe`、`PlanProbeProgressEvent`、`probeCount` 与专用探查进度流，历史旧 Probe 数据 fail-closed 不迁移。 [S1, S2, S6, S7]
- D5 — 读取计入统一执行预算：复用 `executionPolicy.maxSteps` 限制所有 Step，读取 Step 同样消耗预算，防止无休止环境读取。 [S1, S2, S6, S7, S9]

## Guardrails

- 任务批准前严禁执行任何非只读 Tool，且只读 Tool 也必须先持久化 `action_staged` 后方可调用。 [S1, S2, S6, S7]
- 模型自述和读取结果不得直接作为任务完成证据，必须由已批准任务的已提交 Observation 提供证明。 [S1, S2, S4, S7]

## Revisit When

- 引入只读 Tool 不计步的外部观察需求，或需要支持无需任务审批的轻量交互式探查模式时。
- Prompt 模板架构重构或模型决策分支分类调整时。

## Sources

- S1: `specs/unified-agent-step-flow/requirements.md`
- S2: `specs/unified-agent-step-flow/design.md`
- S3: `specs/unified-agent-step-flow/tasks.md`
- S4: `docs/architecture/runtime.md`
- S5: `docs/architecture/agent.md`
- S6: `packages/runtime/src/domain.ts`
- S7: `packages/runtime/src/runner.ts`
- S8: `packages/agent/src/step-prompt/agent-decision@1.njk`
- S9: `packages/runtime/test/runner-pretask-read.test.ts`

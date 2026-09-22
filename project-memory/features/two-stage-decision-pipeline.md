---
feature: two-stage-decision-pipeline
status: superseded
status_reason: "已由原生双通道工具调用架构 (native-tool-calling-architecture) 统一为单步 1 RTT 原生 Function Calling 取代"
summary: "同模型双阶段决策流水线，单步内串行 Think 与 Decide 解决思维链与严格 Schema 冲突（已由 native-tool-calling-architecture 取代）"
source_spec: specs/two-stage-decision-pipeline/
distilled_at: 2026-09-21
reviewed_at: 2026-09-21
tags: [agent, decision-pipeline, two-stage, thinking, cot, superseded]
authorities: [docs/architecture/agent.md, docs/architecture/README.md, packages/runtime/src/trajectory.ts]
superseded_by: [project-memory/features/native-tool-calling-architecture.md]
---

# Two-Stage Decision Pipeline

## Purpose

- 在顶层单一 JSON 封包时期，通过单步内同模型串行 2 RTT 调用（Think 自由推演 + Decide 严格提取），兼顾长思考链与 100% 格式合规率。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — 同模型双阶段串联：单步内连续发起无约束 Think 与 strict Decide 两次调用，第一阶段思考作为第二阶段输入。（已被 1 RTT 原生双通道取代） [S1, S2, S4]
- D2 — 思考链独立入轨：将思维链文本记录为 Trajectory 审计事实属性，不修改底层核心状态机。（该设计理念由后续双通道架构全量继承） [S1, S2, S6]
- D3 — 思考文本预算防护：将第一阶段思考链纳入 `TokenBudgetPlanner` 计算，超长时执行尾部截断防溢出。 [S1, S2, S4]

## Guardrails

- 思考链仅作为辅助推演上下文，不得作为绕过严格 Schema 校验的后门。 [S1, S2, S4]

## Revisit When

- 重新评估异构小模型辅助思考流水线时。

## Sources

- S1: `specs/two-stage-decision-pipeline/requirements.md`
- S2: `specs/two-stage-decision-pipeline/design.md`
- S3: `specs/two-stage-decision-pipeline/tasks.md`
- S4: `docs/architecture/agent.md`
- S5: `docs/architecture/README.md`
- S6: `packages/runtime/src/trajectory.ts`

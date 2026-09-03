---
feature: preparation-runtime-flow
status: active
summary: "规范 Preparation 结构化增量、用户输入溯源与 Working Memory 阶段提交边界"
source_spec: specs/preparation-runtime-flow/
distilled_at: 2026-09-03
reviewed_at: 2026-09-03
tags: [preparation, runtime, working-memory, provenance, evidence-gate]
authorities: [docs/architecture/runtime.md, docs/architecture/agent.md, packages/runtime/src/evidence-gate.ts, packages/runtime/src/working-memory-core.ts, packages/runtime/src/trajectory-checkpoint-committer.ts]
---

# Preparation Runtime Flow

## Purpose

- 规范 Preparation、Runtime 与 Executing 之间的结构化数据边界：Preparation 仅产生受阶段约束的结构化结果，Runtime 负责准入、规范化与提交，Executing 仅消费已提交 Trajectory 重建的 Working Memory。 [S1, S2]

## Durable Decisions

- D1 — Preparation 模型响应是一次性结构化输入，不得将原始模型响应作为领域状态持久化；`task_proposal` 必须经显式批准后方可复制为最终 `GoalTask`。 [S1, S2, S4]
- D2 — 阶段准入由 `validateMemoryPatchPhase` 集中裁决：`gathering_context` 严禁创建或更新 PlanItem；`planning` 允许创建与更新；`executing` 仅能更新已有 PlanItem 严禁新建；非法 Patch 原子拒绝。 [S1, S2, S4]
- D3 — 用户输入溯源采用 `preparation_input_recorded` 纯哈希 payload（`messageIndex` 与 `contentHash`），不重复存储用户原文，检索文档构建时作为透明元数据跳过。 [S1, S2, S5]
- D4 — `EvidenceGate` 区分 `preparation` 与 `execution` 范围：用户约束 Fact 在 preparation 范围可引用已验证的 `preparation_input_recorded`；Plan completion 强制使用 execution 范围，仅接受 committed Tool/Observation；`retire_fact` 严禁使用用户输入 provenance。 [S1, S2, S3, S7]
- D5 — `TrajectoryCheckpointCommitter` 使用单一 `TrajectoryStore` 在保存 Snapshot 前核验未提交 tail 中的 provenance 元数据与候选 Goal 一致性，失配则立即抛出 `TrajectoryAppendError` 并 fail-closed。 [S1, S2, S5, S8]
- D6 — 模型会话消息保留原始 `sourceMessageIndex`，并在最终渲染边界由 helper 一次性派生 `visibleConversationMessageMap`，隔离当前不可见消息的 provenance。 [S1, S2, S6]

## Guardrails

- 会话原文（Conversation）本身不是通用的 Fact evidence，模型不得绕过 provenance 直接引用会话。 [S1, S2, S3]
- 严禁在 Executing 阶段或 Plan completion 判定中使用用户输入 provenance 替代 Tool Observation。 [S1, S2, S3, S7]
- Snapshot 保存前必须完成 provenance tail 一致性核验，禁止将未验证的 tail 纳入已提交状态。 [S2, S5, S8]

## Revisit When

- Preparation 阶段需要支持多任务提案或多步骤交互流程时。
- 引入新的用户输入通道或环境证据类型时。

## Sources

- S1: `specs/preparation-runtime-flow/requirements.md`
- S2: `specs/preparation-runtime-flow/design.md`
- S3: `packages/runtime/src/evidence-gate.ts`
- S4: `packages/runtime/src/working-memory-core.ts`
- S5: `packages/runtime/src/trajectory-checkpoint-committer.ts`
- S6: `packages/agent/src/render.ts`
- S7: `packages/runtime/test/evidence-gate.test.ts`
- S8: `packages/runtime/test/trajectory-checkpoint-committer.test.ts`

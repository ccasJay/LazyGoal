---
feature: structured-working-memory-core
status: active
summary: "提供跨阶段可恢复、基于 Patch 提议与 Snapshot 提交边界的结构化工作记忆核心"
source_spec: specs/structured-working-memory-core/
distilled_at: 2026-09-03
reviewed_at: 2026-10-11
tags: [working-memory, memory-patch, state-separation, restoration, runtime]
authorities: [packages/runtime/notes/overview.md, packages/working-memory/src/core.ts, packages/runtime/src/working-memory-session.ts, packages/runtime/src/domain.ts]
---

# Structured Working Memory Core

## Purpose

- 为统一 executing 生命周期提供可恢复、可从已提交 Trajectory 确定性重建的结构化 Working Memory；模型提出的增量必须经业务校验与 Snapshot 边界提交后才生效。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — Working Memory 与 Runtime 执行状态严格分离：Memory 仅保存推导出的认知事实（Fact、Hypothesis、Blocker），拒绝保存或篡改 Run 状态、Step 计数或 Pending Action；Goal Plan 由 Runtime 独立持有。 [S1, S2, S3, S4, S7]
- D2 — 模型响应中的 `memoryPatch` 是待验证提议，包含未知操作、非法字段、重复 stable ID 或无效转换时整个 Patch 原子拒绝。 [S1, S2, S3, S5]
- D3 — 提议的变更只有在通过业务校验并记录 `memory_patch_accepted` 后，由成功的 Goal Snapshot 提交将其纳入 committed boundary，进程内 Working Memory 才能应用该 Patch；新增条目来源身份在提交时按实际 accepted Patch 序号确定。 [S1, S2, S3, S4, S6, S8, S9]
- D4 — 记忆恢复是严格可审计的确定性归约：Session 仅从 committed revision 链重建 Working Memory，未提交 tail 坚决排除在有效记忆之外。 [S1, S2, S4, S6]

## Guardrails

- 严禁从未提交 tail 或模型原始响应中恢复 Working Memory。 [S1, S2, S4, S6]
- 严禁将 Goal Plan、nextAction 或未验证的 Memory 条目等同于外部现实或已完成事实。 [S2, S3, S7]

## Revisit When

- 需要支持结构化条目的层级树状组织或图关联时。
- 引入多 Agent 共享协作的工作记忆总线时。

## Sources

- S1: `specs/structured-working-memory-core/requirements.md`
- S2: `specs/structured-working-memory-core/design.md`
- S3: `packages/working-memory/src/core.ts`
- S4: `packages/runtime/src/working-memory-session.ts`
- S5: `packages/working-memory/test/working-memory-core.test.ts`
- S6: `packages/runtime/test/working-memory-session.test.ts`
- S7: `packages/runtime/src/goal-plan.ts`
- S8: `packages/runtime/src/trajectory-checkpoint-committer.ts`
- S9: `packages/runtime/test/trajectory-checkpoint-committer.test.ts`

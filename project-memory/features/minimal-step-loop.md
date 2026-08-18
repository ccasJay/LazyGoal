---
feature: minimal-step-loop
status: active
summary: "Launcher 的 Profile 冻结、首次保存与 Coordinator 委派边界"
source_spec: specs/minimal-step-loop/
distilled_at: 2026-08-16
reviewed_at: 2026-08-18
tags: [launcher, profile, initial-snapshot, coordinator]
authorities: [docs/architecture/runtime.md, packages/runtime/src/launcher.ts]
---

# Minimal Step Loop

## Purpose

- Launcher 建立一个使用冻结 Profile、可持久化且可恢复的 Goal 启动边界，并把后续推进委派给 Coordinator。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — Launcher 必须在生成 Goal 身份和首次保存前解析并冻结显式选择的 Profile；启动后的 Registry 变化不得改变该 Goal。 [S1, S2, S3, S4]
- D2 — 初始完整快照必须先于任何下游推进保存；保存成功后，Launcher 才将 Goal 交给 Coordinator。 [S1, S2, S3, S4]
- D3 — Launcher 负责创建和启动边界，不直接提交 Scheduler、执行 Step 或调用 Tool；Preparation 与 Executing 的推进由 Coordinator 协调。 [S3, S4, S5, S6]

## Guardrails

- Profile 缺失或输入无效时，不得生成 Goal 身份、保存快照或调用 Coordinator。 [S1, S3, S4]
- 首次保存失败时必须传播 Store 错误，并阻止任何下游执行。 [S1, S2, S3, S4]
- 已冻结的 Profile 定义属于 Goal 快照，不得在恢复时由当前 Registry 静默替换。 [S2, S3, S4]

## Revisit When

- Profile 选择从显式单项选择变为动态组合时。
- Goal 创建、首次持久化或 Coordinator 所有权发生变化时。
- Launcher 开始支持批量 Goal 或不同启动事务边界时。

## Sources

- S1: `specs/minimal-step-loop/requirements.md`
- S2: `specs/minimal-step-loop/design.md`
- S3: `packages/runtime/src/launcher.ts`
- S4: `packages/runtime/test/launcher.test.ts`
- S5: `packages/runtime/src/goal-coordinator.ts`
- S6: `packages/runtime/test/goal-coordinator.test.ts`

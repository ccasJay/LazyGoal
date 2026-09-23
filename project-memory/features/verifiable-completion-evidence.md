---
feature: verifiable-completion-evidence
status: active
summary: "通过当前 Run 的已提交证据校验任务完成，并区分 Benchmark 运行时上下文与环境评分"
source_spec: specs/verifiable-completion-evidence/
distilled_at: 2026-09-07
reviewed_at: 2026-09-23
tags: [runtime, runner, contracts, evidence-gate, completion-criterion, verifiable-completion, benchmarks]
authorities: [docs/architecture/runtime.md, docs/architecture/benchmarks.md, packages/contracts/src/model-output/canonical.ts, packages/runtime/src/evidence-gate.ts, packages/runtime/src/runner.ts, packages/storage/src/goal-snapshot-codec.ts, benchmarks/src/headless-composition-root.ts]
---

# Verifiable Completion Evidence

## Purpose

- Run 完成必须由适用的当前 Run 已提交 Observation 支持；对于 Plan Run 的获批 Task，结构化验收声明还要求引用证据符合目标工具与 outcome。Benchmark 最终是否成功仍由环境评分决定。 [S1, S2, S6, S7]

## Durable Decisions

- D1 — Task 的 completionCriteria 使用 CompletionCriterion { text, acceptance? { expectToolId, expectOutcome } }；Snapshot 按当前结构严格 roundtrip，旧版 string[] 不做开发数据迁移。 [S1, S2, S3, S4, S11]
- D2 — resolveEvidenceObservation(sequence, index) 从已提交事实解析 toolId/outcome；非完成事件、未配对事件及 rejected Observation 不产生可用证据。 [S1, S2, S5]
- D3 — 对 Plan Run 获批 Task 的每个声明条件，Runner 在引用合法性检查后验证证据中至少有一条匹配 (expectToolId, expectOutcome)；缺口拒绝 complete 并允许模型自纠。 [S1, S2, S6, S10]
- D4 — 未带 acceptance 的获批 Task 条件保持原有引用合法性校验；用户回答、任务提案和模型自述不充当 Tool Observation。Benchmark descriptor criteria 不成为 Runtime 完成门槛，环境实际结果独立决定评测成功。 [S1, S2, S6, S7, S8, S13, S14]
- D5 — BenchmarkTaskDescriptor 将字符串条件规范化为结构化 text，并严格校验可选 acceptance 字段；expectToolId 仍须属于冻结 Profile 的 toolIds。该校验保证 descriptor 引用当前 Profile 内的 Tool；criteria 只作为 Agent 上下文或外部评分输入，不据此生成 approvedTask 或 Runtime 完成门槛。 [S7, S8, S12, S13, S14]

## Guardrails

- 不为旧开发快照增加 string[] criteria 容错或多版本迁移路径。 [S1, S2, S4]
- Prompt 只呈现获批 Task 条件文本，不向模型暴露其 acceptance 结构；Runner 通过完成拒绝诊断反馈证据缺口。 [S1, S2, S6, S9]
- 模型 complete 决策不能覆盖 Benchmark 环境失败事实。 [S2, S7, S8, S13, S14]
- descriptor acceptance 的 Profile allowlist 校验不授予 Tool 权限，也不改变 Benchmark 外部评分所有权。 [S7, S8, S12, S13, S14]

## Revisit When

- 引入命令级/断言级更细粒度的验收验证工具，或单条件多工具组合时。
- completionCriteria 生命周期、Snapshot schema 或 Benchmark 评分所有权发生变化时。
- 引入多 Agent 协作或外部人工审批作为完成证据来源时。

## Sources

- S1: `specs/verifiable-completion-evidence/requirements.md`
- S2: `specs/verifiable-completion-evidence/design.md`
- S3: `packages/contracts/src/model-output/canonical.ts`
- S4: `packages/storage/src/goal-snapshot-codec.ts`
- S5: `packages/runtime/src/evidence-gate.ts`
- S6: `packages/runtime/src/runner.ts`
- S7: `benchmarks/src/headless-composition-root.ts`
- S8: `docs/architecture/benchmarks.md`
- S9: `packages/agent/src/model-inference-view.ts`
- S10: `packages/runtime/test/runner.test.ts`
- S11: `packages/storage/test/goal-store.test.ts`
- S12: `benchmarks/test/headless-composition-root.test.ts`
- S13: `specs/mode-driven-task-proposal/requirements.md`
- S14: `specs/mode-driven-task-proposal/design.md`

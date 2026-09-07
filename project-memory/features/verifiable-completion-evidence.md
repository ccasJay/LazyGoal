---
feature: verifiable-completion-evidence
status: active
summary: "为 Goal Task 引入结构化完成条件与验收声明，通过 Evidence Gate 观察解析和 Runner 声明匹配校验防止虚假完成"
source_spec: specs/verifiable-completion-evidence/
distilled_at: 2026-09-07
reviewed_at: 2026-09-07
tags: [runtime, runner, contracts, evidence-gate, completion-criterion, verifiable-completion, benchmarks]
authorities: [docs/architecture/runtime.md, docs/architecture/benchmarks.md, packages/contracts/src/model-output/canonical.ts, packages/runtime/src/evidence-gate.ts, packages/runtime/src/runner.ts, packages/storage/src/goal-snapshot-codec.ts, benchmarks/src/headless-composition-root.ts]
---

# Verifiable Completion Evidence

## Purpose

- 为 Goal Task 的完成判定引入客观可验证的验收声明（`CompletionCriterion { text, acceptance? { expectToolId, expectOutcome } }`），使模型 `complete` 决策引用的事实证据必须与条件声明的预期工具及成功/失败形态相符，无法以无关证据或自述声明覆盖失败事实。 [S1, S2]

## Durable Decisions

- D1 — 完成条件结构化演进与快照就地更新：`completionCriteria` 从 `string[]` 演进为 `readonly CompletionCriterion[]`，快照编解码器就地更新序列化结构，严格 roundtrip 保留 `acceptance`，旧版 `string[]` criteria 快照结构校验失败并直接抛出 unsupported 错误 fail-fast，不保留兼容分支。 [S1, S2, S3, S4, S11]
- D2 — Evidence Gate 纯函数观察解析：通过 `resolveEvidenceObservation(sequence, index)` 纯函数将已提交证据序列解析为 `{ toolId, outcome }`。`tool_finished` 直接提取 payload 的 toolId 与 observation.kind；`observation_recorded` 按 actionId 在索引内查找同生命周期的 `tool_started`/`tool_finished` 配对提取 toolId；其他事件或 rejected 观察返回 `undefined`。 [S1, S2, S5]
- D3 — Runner 声明匹配校验与缺口拒绝：Runner 在现有的证据覆盖与引用合法性校验后追加验收声明匹配分支。对携带 `acceptance` 的条件，引用证据中必须有至少一条解析出匹配的 `(expectToolId, expectOutcome)`；预期失败（`failure`）任务引用成功观察或预期成功引用失败观察均被拒绝；校验失败抛出 `INVALID_AGENT_DECISION` 并指明条件序号与缺口诊断，当前 Run 保持执行中，允许模型自纠。 [S1, S2, S6, S10]
- D4 — 无声明条件零行为变化与评测成功语义隔离：未携带声明的完成条件完全保持原有的引用合法性校验；ALFWorld 等外部评测环境报告层成功事实仍以环境真实事实（如 `won=true`）为准，模型完成决策与声明匹配不覆盖环境失败。 [S1, S2, S6, S7, S8]
- D5 — Benchmark Descriptor 规范化与工具白名单拦截：`BenchmarkTaskDescriptor.completionCriteria` 演进为 `readonly (string | CompletionCriterion)[]`，字符串自动归一为 `{ text }`；解析时严格校验 acceptance 形态，并要求 `expectToolId` 必须属于当前 AgentProfile 的 `toolIds` 白名单，未授权工具在创建 Episode 前抛出 `TypeError` 立即失败。 [S1, S2, S7, S12]

## Guardrails

- 严禁为了兼容旧版开发数据而在快照编解码中增加 `string[]` 条件的回退容错或多版本迁移路径。 [S1, S2, S4]
- 严禁在 Prompt 中向模型泄露或渲染 `acceptance` 结构化元数据；Prompt 始终只渲染条件文本 `.text`，模型仅通过 Runner 拒绝诊断感知证据缺口。 [S1, S2, S9]
- 严禁以模型 `complete` 决策放行覆盖外部评测环境的失败事实。 [S1, S2, S8]
- 严禁允许 BenchmarkTaskDescriptor 声明 Profile 未授权工具，防止构造永远无法完成的任务。 [S1, S2, S7]

## Revisit When

- 引入命令级/断言级更细粒度的验收验证工具（而非工具级 success/failure 结果形态）时。
- 引入单条件多验收工具组合或条件间复杂依赖逻辑时。
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

---
feature: on-demand-tool-schemas
status: active
summary: "通过 Run 级工具发现按需投影完整 Schema，并在恢复和 PTC 中保持一致的可见边界"
source_spec: specs/on-demand-tool-schemas/
distilled_at: 2026-10-04
reviewed_at: 2026-10-04
tags: [agent, tool-discovery, schema, runtime, snapshot, ptc, token-budget]
authorities: [docs/architecture/agent.md, docs/architecture/contracts.md, docs/architecture/runtime.md, docs/architecture/storage.md, packages/contracts/src/model-output/system-tools.ts, packages/runtime/src/tool-discovery.ts, packages/runtime/src/runner.ts, packages/agent/src/model-inference-projector.ts, packages/storage/src/goal-snapshot.ts]
---

# On-Demand Tool Schemas

## Purpose

- 先按需发现当前 Goal 可用的工具，再只向模型暴露当前 Run 已发现工具的完整 Schema，以降低请求上下文负担，同时保持可恢复的 Run 可见状态。 [S1, S2, S4, S6]

## Durable Decisions

- D1 — system_find_tools 是 Decide 专用的 Runtime 系统决策，只在当前 Profile 与 Registry 的交集中按确定性关键词规则匹配，最多返回 5 项并稳定排序；发现决策计入现有 Step 配额。 [S1, S2, S3, S8, S9, S14, S15]
- D2 — exposedToolIds 属于 Run 状态：同一 Run 的发现结果累积并写入当前 Snapshot，新 Run 从空集合开始；恢复或每次请求前都按当前 Profile/Registry 重新筛选，过期 ID 不重新暴露。 [S1, S2, S10, S11, S13, S18]
- D3 — Agent 使用单一 Run 可见集合生成 Prompt 描述、Wire Contract、原生函数 Schema 和 execute_program 子工具集合；Runner 在副作用前拒绝未暴露的直接及 PTC 调用，已暴露工具仍逐次经过原有授权链。 [S1, S2, S4, S5, S6, S11, S12, S16, S17]

## Guardrails

- 发现只改变模型可见性，不授予 Profile、Policy、审批或沙箱权限；PTC 不得扩大该 Run 的可见集合。 [S1, S2, S6, S11, S17]
- Snapshot 中的 exposedToolIds 是恢复可见集合的唯一持久化来源；缺字段或协议损坏应严格失败，不从轨迹或当前注册表猜测补齐。 [S1, S2, S7, S13, S18]
- Think 阶段不接收发现控制或 Decide 的可见 Schema；工具发现的 token 收益只适用于实际被省略的 Schema，不构成固定比例承诺。 [S1, S2, S4, S5, S12, S16]

## Revisit When

- 变更目录匹配算法、工具发现上限、Run/Snapshot 可见集合生命周期或 PTC 的子调用边界时。
- 支持动态 Tool Registry、多套并行可见集合或新的模型请求协议时。

## Sources

- S1: `specs/on-demand-tool-schemas/requirements.md`
- S2: `specs/on-demand-tool-schemas/design.md`
- S3: `specs/on-demand-tool-schemas/tasks.md`
- S4: `docs/architecture/agent.md`
- S5: `docs/architecture/contracts.md`
- S6: `docs/architecture/runtime.md`
- S7: `docs/architecture/storage.md`
- S8: `packages/contracts/src/model-output/system-tools.ts`
- S9: `packages/runtime/src/tool-discovery.ts`
- S10: `packages/runtime/src/transition.ts`
- S11: `packages/runtime/src/runner.ts`
- S12: `packages/agent/src/model-inference-projector.ts`
- S13: `packages/storage/src/goal-snapshot.ts`
- S14: `packages/runtime/test/tool-discovery.test.ts`
- S15: `packages/contracts/test/model-output-canonical.test.ts`
- S16: `packages/agent/test/prompt.test.ts`
- S17: `packages/runtime/test/program-execution.test.ts`
- S18: `packages/storage/test/goal-snapshot-current.test.ts`

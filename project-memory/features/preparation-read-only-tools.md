---
feature: preparation-read-only-tools
status: superseded
status_reason: "声明式只读工具元数据已由 unified-agent-step-flow 继承，专有 probe_action 探查循环与准备阶段已被 unified-agent-step-flow 与 preparation-phase-removal 统一为普通 Step 流与单一 executing 生命周期"
summary: "准备阶段声明式只读工具筛选与受控探查循环（已由 unified-agent-step-flow 与 preparation-phase-removal 取代）"
source_spec: specs/preparation-read-only-tools/
distilled_at: 2026-09-21
reviewed_at: 2026-09-21
tags: [preparation, read-only, tools, probe-action, superseded]
authorities: [docs/architecture/runtime.md, docs/architecture/README.md, packages/runtime/src/domain.ts, packages/tools/src/index.ts]
superseded_by: [project-memory/features/unified-agent-step-flow.md]
---

# Preparation Read-Only Tools

## Purpose

- 在早期准备阶段中引入声明式 `isReadOnly` 工具筛选，并支持多轮受控探查循环与 TUI 瀑布流展示，避免面对代码库时盲问用户。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — 声明式只读元数据机制：在 `ToolDefinition` 中声明 `isReadOnly: boolean`，通过元数据动态过滤而非硬编码工具名。（该决策由后续统一执行流全量继承） [S1, S2, S6, S7]
- D2 — 准备探查循环与步数熔断：通过专用 `probe_action` 分支和 5 步硬上限防止死循环。（已被普通 Step 统一预算取代） [S1, S2, S6]
- D3 — 严格写操作拦截：准备阶段严禁调用非只读工具，工作区零副作用。 [S1, S2, S4, S6]

## Guardrails

- 未批准任务前严禁执行任何写入或修改环境的工具动作。 [S1, S2, S4, S6]

## Revisit When

- 重新设计工具只读/幂等性权限系统时。

## Sources

- S1: `specs/preparation-read-only-tools/requirements.md`
- S2: `specs/preparation-read-only-tools/design.md`
- S3: `specs/preparation-read-only-tools/tasks.md`
- S4: `docs/architecture/runtime.md`
- S5: `docs/architecture/README.md`
- S6: `packages/runtime/src/domain.ts`
- S7: `packages/tools/src/index.ts`

---
feature: tui-simplification
status: obsolete
status_reason: "LazyGoal 退出终端 TUI 产品形态，TUI 内部状态与提交闸门已随 packages/tui 整体移除。"
summary: "TUI 状态面收窄、流程去重与统一提交闸门（已退役为负面护栏）"
source_spec: specs/tui-simplification/
distilled_at: 2026-08-25
reviewed_at: 2026-10-10
tags: [tui, simplification, submit-gate, controller, lifecycle, obsolete]
authorities: [apps/goal-server/notes/overview.md]
---

# TUI Simplification

> [!CAUTION]
> 负面护栏：`packages/tui` 中的会话控制器与提交闸门设计已被淘汰。服务端并发控制与状态提交已统一由 `@lazygoal/goal-server` 的 Composition Root 及 HTTP 路由管理，不得在终端层重新实现客户端提交闸门。

## Purpose

- 早期 TUI 简化在 `packages/tui` 内收窄不可达状态、合并重复流程并统一提交闸门。 [S1, S2]

## Durable Decisions

- D1 — 早期 `fatal` 屏幕和 `openGoalSelect` 命令退出生产状态空间；Catalog 读取与 SIGINT 清理收敛为单一实现。 [S1, S2]
- D2 — 早期 Session ViewModel 对 Goal 只做一次隔离克隆。 [S1, S2]
- D3 — 早期各交互屏幕使用包内私有 `useSubmitGate` 集中处理防重提交。 [S1, S2]

## Guardrails

- 简化不得改变领域快照与恢复语义。 [S1, S2]
- 终端 TUI 代码已移除，交互由 Web 客户端及 goal-server API 负责。 [S1, S3, S4]

## Revisit When

- 设计其他客户端的通用防重提交闸门时。

## Sources

- S1: `specs/tui-simplification/requirements.md`
- S2: `specs/tui-simplification/design.md`
- S3: `specs/web-backend-separation/requirements.md`
- S4: `apps/goal-server/notes/overview.md`

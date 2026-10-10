---
feature: react-ink-tui
status: obsolete
status_reason: "LazyGoal 退出终端 TUI 产品形态，整体迁移至独立的 goal-server HTTP 守护进程与 goal-board Web 前端架构；Ink 终端交互代码已完全移除。"
summary: "单 Goal React Ink 会话、Controller 编排与安全关闭（已退役为负面护栏）"
source_spec: specs/react-ink-tui/
distilled_at: 2026-08-25
reviewed_at: 2026-10-10
tags: [tui, ink, controller, shutdown, recovery, obsolete]
authorities: [apps/goal-server/notes/overview.md, packages/runtime/notes/overview.md, packages/runtime/src/shutdown.ts]
---

# React Ink TUI

> [!CAUTION]
> 负面护栏：LazyGoal 已完全移除 React Ink 终端交互架构（`packages/tui`），全面采用独立的后台守护进程（`@lazygoal/goal-server`）与基于浏览器的交互看板（`@lazygoal/goal-board`）。严禁在当前项目中重新引入终端 UI 运行时或单进程直接绑定 TUI 的耦合设计。

## Purpose

- `lazygoal` 早期使用单进程 React Ink 会话，由 Composition Root 组合 Runtime、Store、LLM、Tool 和 TUI，并只推进一个活跃 Goal。 [S1, S2]

## Durable Decisions

- D1 — 早期 Composition Root 共享同一个 Store、Adapter、ToolRegistry、Root AbortSignal 和 Checkpoint Gate；React 组件只渲染 ViewModel 并发出语义化命令。 [S1, S2]
- D2 — SessionController 负责命令串行化、busy 防重、Catalog 恢复和 ViewModel 派生；屏幕不复制领域状态机，也不直接操作 Goal。 [S1, S2]
- D3 — Ctrl+C 关闭流程先冻结新快照、abort 外部执行、清理受管资源；最近成功快照和 pendingAction 保持可恢复。 [S1, S2, S3]

## Guardrails

- `GoalCatalog` 只展示可恢复的非终态 Goal，并按成功快照更新时间排序；损坏快照必须暴露错误，不得静默创建替代 Goal。 [S1, S2]
- shutdown abort 不能转换为 `failed`、`cancelled` 或新的领域快照；关闭期间不得接受新的推进命令。 [S1, S3]
- 终端 TUI 方案已废弃，不得复活终端渲染循环作为主客户端。 [S1, S4]

## Revisit When

- 项目再次评估轻量级纯文本 CLI 调试诊断工具时。

## Sources

- S1: `specs/react-ink-tui/requirements.md`
- S2: `specs/react-ink-tui/design.md`
- S3: `packages/runtime/src/shutdown.ts`
- S4: `specs/web-backend-separation/requirements.md`

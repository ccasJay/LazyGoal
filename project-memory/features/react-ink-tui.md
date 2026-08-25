---
feature: react-ink-tui
status: active
summary: "单 Goal React Ink 会话、Controller 编排与安全关闭"
source_spec: specs/react-ink-tui/
distilled_at: 2026-08-25
reviewed_at: 2026-08-25
tags: [tui, ink, controller, shutdown, recovery]
authorities: [docs/architecture/tui.md, docs/architecture/runtime.md, packages/tui/src/cli.tsx]
---

# React Ink TUI

## Purpose

- `lazygoal` 使用单进程 React Ink 会话，由 Composition Root 组合 Runtime、Store、LLM、Tool 和 TUI，并只推进一个活跃 Goal。 [S1, S2, S3]

## Durable Decisions

- D1 — Composition Root 共享同一个 Store、Adapter、ToolRegistry、Root AbortSignal 和 Checkpoint Gate；React 组件只渲染 ViewModel 并发出语义化命令。 [S1, S2, S4]
- D2 — SessionController 负责命令串行化、busy 防重、Catalog 恢复和 ViewModel 派生；屏幕不复制领域状态机，也不直接操作 Goal。 [S1, S2, S4, S7]
- D3 — Ctrl+C 关闭流程先冻结新快照、abort 外部执行、卸载 Ink、清理受管资源，最后以退出码 130 结束；最近成功快照和 pendingAction 保持可恢复。 [S1, S2, S3, S5, S6]

## Guardrails

- `GoalCatalog` 只展示可恢复的非终态 Goal，并按成功快照更新时间排序；损坏快照必须暴露错误，不得静默创建替代 Goal。 [S2, S4, S7]
- shutdown abort 不能转换为 `failed`、`cancelled` 或新的领域快照；关闭期间不得接受新的推进命令。 [S1, S3, S5, S6]

## Revisit When

- TUI 从单 Goal 会话变为多 Goal 并发或后台 Worker 模式时。
- 关闭流程、快照闸门或跨进程资源所有权发生变化时。

## Sources

- S1: `specs/react-ink-tui/requirements.md`
- S2: `specs/react-ink-tui/design.md`
- S3: `packages/tui/src/cli.tsx`
- S4: `packages/tui/src/session-controller.ts`
- S5: `packages/runtime/src/shutdown.ts`
- S6: `packages/tui/test/cli.integration.test.ts`
- S7: `docs/architecture/tui.md`

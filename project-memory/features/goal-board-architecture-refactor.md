---
feature: goal-board-architecture-refactor
status: active
summary: "Goal 看板前端模块化架构重构：上帝文件拆解、局部双 Context 隔离与领域自治 Hooks"
source_spec: specs/goal-board-architecture-refactor/
distilled_at: 2026-10-11
reviewed_at: 2026-10-11
tags: [browser, goal-board, architecture, refactoring, context-isolation, custom-hooks, react19]
authorities: [apps/goal-board/notes/overview.md, apps/goal-board/notes/semantics.md, apps/goal-board/src/main.tsx, apps/goal-board/src/context/GoalSessionContext.tsx, apps/goal-board/src/context/RunControlContext.tsx, apps/goal-board/src/hooks/useRunStream.ts, apps/goal-board/src/hooks/useQueue.ts]
---

# Goal Board Architecture Refactor

## Purpose

- 将 `@lazygoal/goal-board` 的单体上帝文件（`apps/goal-board/src/main.tsx`，原约 2000 行）重构为职责分明的高内聚模块化前端架构，彻底消除全树无谓重渲染隐患。 [S1, S2, S3]
- 在零新增外部状态库的前提下，依托 React 19 原生机制解耦视图展示、异步网络流与命令排队状态机，同时保持 100% 行为等价与 DOM 几何排版保真。 [S1, S3, S4, S5]

## Durable Decisions

- D1 — 纯净装配入口与展示子组件物理剥离：顶层入口 `main.tsx` 严格收敛至 180 行以内（实际 103 行），仅保留全局 Providers 组装与顶级分栏排版；所有展示子组件（`GoalCard`、`ModelPicker`、`MessageComposer`、`PermissionControl`、`WorkspaceContext` 等）和核心业务视图（`GoalBoard`、`GoalSession`）全部物理下沉至 `components/` 目录，无任何内联定义残留。 [S1, S3, S4]
- D2 — 局部双 Context 读写隔离架构：状态流划分为低频块状更新的快照上下文（`GoalSessionContext`）与高频交互调度的指令上下文（`RunControlContext`）；打字机字符追加、草稿输入与单飞锁轮转被严格限定在单会话主交互树局部，杜绝非活跃 Goal 列表与周边卡片的全量重复渲染。 [S1, S3, S5, S6]
- D3 — 领域自治 Hooks 与 SSE 稳定订阅生命周期：将网络流与状态流正交抽取至 `hooks/`（`useRunStream`、`useGoalSession`、`useQueue`、`useRunCommands`）；SSE 长连接通过 `useRef` 解耦打字机增量回调闭包，杜绝因外部函数引用变动触发的意外断线重连（`reconnecting` 闪烁）。 [S1, S3, S7, S10]
- D4 — 单飞排队锁与 DOM 结构严格保真：客户端命令排队（`useQueue`）维持原子互斥单飞锁（In-flight Lock），防止指令竞态与重复提交；子组件剥离时严格采用原生标签或 `<Fragment>`，不引入额外 `<div>` 包裹层，确保 CSS 选择器与 E2E 几何间距完全等价。 [S1, S3, S4, S8, S9]

## Guardrails

- 严禁在 `@lazygoal/goal-board` 引入 Redux、Zustand 等第三方状态管理库；状态共享必须严格限制在原生 Hooks 与局部 Context 边界内。 [S1, S3]
- 严禁在重构中改动后端 HTTP 路由、SSE 事件信封格式或持久化快照契约；协议与服务端行为必须保持 100% 不变。 [S1, S3]
- 剥离子组件时严禁引入额外包装 DOM 节点，任何打破现有 CSS 层级与 E2E 测试选择器的改动均为非法。 [S1, S4, S9]
- `main.tsx` 必须保持纯净装配职责，行数上限为 180 行，严禁重新将业务逻辑与子组件写回入口。 [S1, S3, S4]

## Revisit When

- 前端支持多会话并行流式执行与多视口协同渲染时。
- 引入更复杂的工作流画布或基于 WebAssembly 的富交互渲染引擎时。
- React 官方推出更底层的细粒度信号（Signals）或新的状态元原语时。

## Sources

- S1: `specs/goal-board-architecture-refactor/spec.md`
- S2: `specs/goal-board-architecture-refactor/plan.md`
- S3: `apps/goal-board/notes/overview.md`
- S4: `apps/goal-board/src/main.tsx`
- S5: `apps/goal-board/src/context/GoalSessionContext.tsx`
- S6: `apps/goal-board/src/context/RunControlContext.tsx`
- S7: `apps/goal-board/src/hooks/useRunStream.ts`
- S8: `apps/goal-board/src/hooks/useQueue.ts`
- S9: `apps/goal-board/e2e/board.test.mjs`
- S10: `apps/goal-board/e2e/runtime.test.mjs`


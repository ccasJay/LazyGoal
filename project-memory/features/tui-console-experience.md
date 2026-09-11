---
feature: tui-console-experience
status: active
summary: "TUI 首页控制台、流式审批交互、全屏轨迹复盘与 Benchmark 自动发现"
source_spec: specs/tui-console-experience/
distilled_at: 2026-09-11
reviewed_at: 2026-09-11
tags: [tui, console, home, inspector, approval, yolo, benchmark-discovery]
authorities: [packages/tui/src/cli.tsx, packages/tui/src/session-controller.ts, packages/tui/src/home-screen.tsx, packages/tui/src/inspector-screen.tsx, packages/tui/src/benchmark-discovery.ts]
---

# TUI Console Experience

## Purpose

- 统一 LazyGoal 的 TUI 交互体验：启动默认展示 ASCII Banner 与主菜单控制台；会话执行提供流式一体化审批与 YOLO/Confirm 快捷键热切换；提供全屏独立缓冲区的历史轨迹复盘检查器并支持 Benchmark 评测轨迹自动聚合发现。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — `lazygoal` 默认进入 `home` 页面并渲染居中的 ASCII Art Banner，提供 New Goal、View History、Settings 与 Exit 四项菜单；通过 `@inkjs/ui` Select 导航。 [S1, S2, S3, S5]
- D2 — Action 审批采用单一流式 TextInput：待批准时直接按 Enter 空回车放行，输入非空文本按 Enter 拒绝并作为自然语言理由；使用 `Shift + Tab` 热切换 Confirm/YOLO 模式。 [S1, S2, S6]
- D3 — 轨迹复盘（`lazygoal inspect [goalId]` 与 View History）使用 Alternate Screen 全屏缓冲区；支持 `h`/`l`/`0`/`$` 步进翻页、`j`/`k` 垂直滚动、`r` 折叠思维链、`e` 外部编辑器与 `q` 退出。 [S1, S2, S7]
- D4 — 引入 `benchmark-discovery.ts` 与 `AggregatedGoalStore`，自动扫描 `.lazygoal/benchmarks/` 评测产物并在历史列表中打上方括号标签（如 `[GAIA]`、`[SWE-bench]`），选中时透明定向到 Benchmark 运行时目录还原快照。 [S1, S2, S8]

## Guardrails

- 全屏 Inspector 必须在挂载时进入 Alternate Screen（`\x1b[?1049h`）并在退出时干净还原（`\x1b[?1049l`），严禁破坏宿主终端屏幕缓冲区。 [S2, S7]
- Benchmark 自动发现必须保持单向依赖，TUI 包严禁直接静态引用 `benchmarks/` 内部模块。 [S1, S2, S8]
- 严格遵循 `exactOptionalPropertyTypes: true`，所有可选配置严禁传 `undefined`。 [S1, S2, S3]

## Revisit When

- Inspector 升级为基于 Runtime 真实 Trajectory 事件流（executionUnitId）的结构化投影时。
- 引入多任务并行会话或图形 Web 前端时。

## Sources

- S1: `specs/tui-console-experience/requirements.md`
- S2: `specs/tui-console-experience/design.md`
- S3: `packages/tui/src/cli.tsx`
- S4: `packages/tui/src/session-controller.ts`
- S5: `packages/tui/src/home-screen.tsx`
- S6: `packages/tui/src/session-screen.tsx`
- S7: `packages/tui/src/inspector-screen.tsx`
- S8: `packages/tui/src/benchmark-discovery.ts`

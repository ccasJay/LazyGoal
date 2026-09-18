---
feature: tui-console-experience
status: active
summary: "TUI 首页控制台、流式审批、结构化轨迹复盘与 Benchmark 发现"
source_spec: specs/tui-console-experience/
distilled_at: 2026-09-11
reviewed_at: 2026-09-18
tags: [tui, console, home, inspector, trajectory, execution-unit, approval, yolo, benchmark-discovery]
authorities: [docs/architecture/tui.md, packages/tui/src/cli.tsx, packages/tui/src/session-controller.ts, packages/tui/src/trajectory-projector.ts, packages/tui/src/inspector-screen.tsx, packages/tui/src/benchmark-discovery.ts]
---

# TUI Console Experience

## Purpose

- 统一 LazyGoal 的 TUI 控制台：主页提供导航，执行会话提供流式审批与 Confirm/YOLO 热切换，历史入口提供基于事实轨迹的结构化复盘，并自动聚合 Benchmark 评测产物。 [S1, S2, S3, S4, S5, S6, S7, S8, S9, S10]

## Durable Decisions

- D1 — `lazygoal` 默认进入 `home` 页面并渲染 ASCII Art Banner，提供 New Goal、View History、Settings 与 Exit 四项菜单；导航和历史选择使用 `@inkjs/ui` 的 `Select`。 [S1, S2, S4, S6]
- D2 — Action 审批采用单一流式 `TextInput`：待批准时空回车放行，非空文本按 Enter 拒绝并作为自然语言理由；`Shift + Tab` 在 Confirm 与 YOLO 间热切换。 [S1, S2, S5, S7, S12]
- D3 — `TuiMountHost` 不改变执行期终端缓冲区；仅 Inspector 通过 `TerminalScreen` 使用 alternate screen，执行 Session 保留主缓冲区 scrollback，退出时恢复终端。 [S3, S4, S7, S8, S13]
- D4 — Benchmark 目录由 TUI 层自动发现并与主 Goal 目录聚合；恢复时按发现条目的物理目录读取快照和轨迹，展示标准化 Benchmark 标签，且不让 TUI 静态依赖 `benchmarks/` 内部模块。 [S1, S2, S3, S4, S10, S12]
- D5 — Inspector 通过只读 `readTrajectory` 读取 Snapshot 提交边界内的事实事件，按当前 executing/event projection 聚合 Decision、Action、Observation 与 Result 区块；未提交尾部显示警告，原始 JSON 保留为外部查看入口。 [S1, S2, S3, S5, S8, S9, S11, S13]

## Guardrails

- SessionController 负责命令串行化、轨迹读取和投影；屏幕只消费不可变 ViewModel，不修改 Goal、Snapshot 或 Trajectory。执行期继续通过 `<Static>` 追加消息，不能旁路 Runtime 执行。 [S1, S3, S4, S5, S7]
- Inspector 的投影必须以当前 Snapshot 的 committed 边界为准，明确标出 uncommitted tail；raw JSON 和观察结果只做展示层截断或折叠，不改变持久化事实。 [S3, S8, S9, S11]
- Benchmark 聚合保持单向依赖，`exactOptionalPropertyTypes` 下的可选字段不得传入显式 `undefined`。 [S2, S3, S4, S10]

## Revisit When

- requirements 2.8 与挂载层的备用屏幕生命周期完成统一后，将 `needs-review` 重新核验为 `active` 或记录新的明确契约。
- Runtime Trajectory 协议、`executionUnitId` 语义、Snapshot committed 边界或 Inspector 数据模型发生变化时。
- Benchmark 评测产物目录或跨目录恢复契约发生变化时。
- TUI 引入多任务并行会话或图形前端时。

## Sources

- S1: `specs/tui-console-experience/requirements.md`
- S2: `specs/tui-console-experience/design.md`
- S3: `docs/architecture/tui.md`
- S4: `packages/tui/src/cli.tsx`
- S5: `packages/tui/src/session-controller.ts`
- S6: `packages/tui/src/home-screen.tsx`
- S7: `packages/tui/src/session-screen.tsx`
- S8: `packages/tui/src/inspector-screen.tsx`
- S9: `packages/tui/src/trajectory-projector.ts`
- S10: `packages/tui/src/benchmark-discovery.ts`
- S11: `packages/tui/test/trajectory-projector.test.ts`
- S12: `packages/tui/test/cli.integration.test.ts`
- S13: `packages/tui/test/inspector-screen.test.tsx`

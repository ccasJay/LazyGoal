---
feature: tui-console-experience
status: obsolete
status_reason: "LazyGoal 退出终端 TUI 产品形态，控制台首页、流式审批与轨迹复盘已全面迁移至 goal-server 与 Web goal-board 前端。"
summary: "TUI 首页控制台、流式审批、结构化轨迹复盘与 Benchmark 发现（已退役为负面护栏）"
source_spec: specs/tui-console-experience/
distilled_at: 2026-09-11
reviewed_at: 2026-10-10
tags: [tui, console, home, inspector, trajectory, execution-unit, approval, yolo, benchmark-discovery, obsolete]
authorities: [apps/goal-server/notes/overview.md, apps/goal-board/notes/overview.md]
---

# TUI Console Experience

> [!CAUTION]
> 负面护栏：终端控制台（包含 Ink 首页、备用屏幕 Inspector 复盘与流式单行审批输入框）已被废弃并移除。所有用户交互、执行监控与轨迹复盘由 `@lazygoal/goal-board` Web 界面承担，后端由 `@lazygoal/goal-server` 提供 SSE 与 HTTP 接口。严禁在主流程中恢复基于 Ink 的控制台交互架构。

## Purpose

- 早期统一 LazyGoal 的 TUI 控制台：主页提供导航，执行会话提供流式审批与 Confirm/YOLO 热切换，历史入口提供基于事实轨迹的结构化复盘，并自动聚合 Benchmark 评测产物。 [S1, S2]

## Durable Decisions

- D1 — 早期 `lazygoal` 默认进入 `home` 页面并渲染 ASCII Art Banner，提供 New Goal、View History、Settings 与 Exit 四项菜单。 [S1, S2]
- D2 — 早期 Action 审批采用单一流式 `TextInput`：待批准时空回车放行，非空文本按 Enter 拒绝并作为自然语言理由；`Shift + Tab` 在 Confirm 与 YOLO 间热切换。 [S1, S2]
- D3 — 早期终端执行保留主缓冲区 scrollback，仅 Inspector 通过 alternate screen 查看。 [S1, S2]
- D4 — 早期 Benchmark 目录由 TUI 层自动发现并与主 Goal 目录聚合；恢复时按发现条目的物理目录读取快照和轨迹。 [S1, S2]
- D5 — 早期 Inspector 通过只读 `readTrajectory` 读取 Snapshot 提交边界内的事实事件，按事件投影聚合决策与动作。 [S1, S2]

## Guardrails

- 终端 TUI 控制台已彻底退役，不应在主代码库中恢复基于终端字符画与终端全屏界面的主交互方式。 [S1, S3, S4]
- 轨迹读取必须以 committed 边界为准，展示层不改变持久化事实。 [S1, S2]

## Revisit When

- 需要为无浏览器环境提供最精简的只读 headless CLI 状态展示时。

## Sources

- S1: `specs/tui-console-experience/requirements.md`
- S2: `specs/tui-console-experience/design.md`
- S3: `specs/web-backend-separation/requirements.md`
- S4: `apps/goal-server/notes/overview.md`

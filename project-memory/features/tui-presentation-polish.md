---
feature: tui-presentation-polish
status: obsolete
status_reason: "LazyGoal 退出终端 TUI 产品形态，终端渲染打磨与 ANSI 样式代码已完全废弃，展示逻辑迁移至 Web goal-board。"
summary: "TUI 进度、错误、输入和响应式终端展示的一致性约定（已退役为负面护栏）"
source_spec: specs/tui-presentation-polish/
distilled_at: 2026-08-25
reviewed_at: 2026-10-10
tags: [tui, presentation, spinner, error, input, rendering, terminal-width, obsolete]
authorities: [apps/goal-board/notes/overview.md, apps/goal-server/notes/overview.md]
---

# TUI Presentation Polish

> [!CAUTION]
> 负面护栏：针对终端字符渲染、ANSI 槽线对齐与 Ink 终端组件的适配方案已被淘汰。现代 LazyGoal 交互由浏览器端 React CSS 布局处理，不得在核心包中维护终端特定的字符宽度或渲染折叠逻辑。

## Purpose

- 早期 TUI 表现层使用共享进度和错误原语、统一输入反馈，并按终端显示列宽和可用高度组织主页、历史列表与 Inspector。 [S1, S2]

## Durable Decisions

- D1 — 早期 `StatusSpinner` 与 `ErrorLine` 作为终端展示原语。 [S1, S2]
- D2 — 早期输入控件在合法提交成功后清空，busy 时停用。 [S1, S2]
- D3 — 早期 Action JSON 超过展示阈值时只在 TUI 层折叠并显示省略字符数。 [S1, S2]
- D4 — 早期 ANSI 分隔条和槽线使用 `string-width` 与 `wrap-ansi` 按终端显示列宽换行。 [S1, S2]
- D5 — 早期历史列表分开展示标题与状态，Inspector 提供最小视口退化。 [S1, S2]

## Guardrails

- 表现层截断、折行和折叠只影响渲染，不得修改 Action 输入、Observation、Snapshot 或传给 Runtime 的原始数据。 [S1, S2]
- 终端展示层代码已废弃，不得在核心运行时中重新引入终端 ANSI 布局依赖。 [S1, S3, S4]

## Revisit When

- 评估轻量级终端日志高亮格式化工具时。

## Sources

- S1: `specs/tui-presentation-polish/requirements.md`
- S2: `specs/tui-presentation-polish/design.md`
- S3: `specs/web-backend-separation/requirements.md`
- S4: `apps/goal-board/notes/overview.md`

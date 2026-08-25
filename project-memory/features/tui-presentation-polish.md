---
feature: tui-presentation-polish
status: active
summary: "TUI 进度、错误、输入和 Action 展示的一致性约定"
source_spec: specs/tui-presentation-polish/
distilled_at: 2026-08-25
reviewed_at: 2026-08-25
tags: [tui, presentation, spinner, error, input, rendering]
authorities: [docs/architecture/tui.md, packages/tui/src/status-spinner.tsx, packages/tui/src/error-line.tsx]
---

# TUI Presentation Polish

## Purpose

- TUI 表现层使用共享进度和错误原语，并以统一的键位、截断和输入反馈减少同屏噪声；不改变 Runtime、Agent 或 Storage 状态机。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — `StatusSpinner` 是 TUI 唯一的 Spinner 渲染原语，`ErrorLine` 是统一错误展示原语；不同屏幕只提供上下文相关的 label 和错误数据。 [S1, S2, S3, S4, S7]
- D2 — question、blocked 和反馈输入在合法提交成功后清空，busy 时推进控件停用；当前实现以 `defaultValue + key` 实现该可观察行为，不把受控 `value` 作为当前实现契约。 [S1, S2, S5, S6, S7]
- D3 — Action JSON 超过展示阈值时只在 TUI 层折叠并显示省略字符数；Goal ID 只显示可辨认前缀，批准面板统一使用 Y/N，终态和异常路由保持现有语义。 [S1, S2, S5, S7]

## Guardrails

- 表现层截断只影响渲染，不得修改 Action 输入、Observation、Snapshot 或传给 Runtime 的原始数据。 [S1, S2, S5, S6]
- Spinner、错误优先级、busy 禁用和 dispatch 异常处理必须保持可识别且一致；未知业务异常不得被静默吞掉。 [S1, S2, S3, S4, S7]

## Revisit When

- `@inkjs/ui` 提供稳定受控输入 API，或输入清空需要改为真正的 `value + onChange` 时。
- TUI 引入新的共享展示原语、不同终端渲染协议或结构化 Action 展示时。

## Sources

- S1: `specs/tui-presentation-polish/requirements.md`
- S2: `specs/tui-presentation-polish/design.md`
- S3: `packages/tui/src/status-spinner.tsx`
- S4: `packages/tui/src/error-line.tsx`
- S5: `packages/tui/src/session-screen.tsx`
- S6: `packages/tui/src/preparation-screen.tsx`
- S7: `packages/tui/test/screens.test.tsx`

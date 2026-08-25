---
feature: tui-simplification
status: active
summary: "TUI 状态面收窄、流程去重与统一提交闸门"
source_spec: specs/tui-simplification/
distilled_at: 2026-08-25
reviewed_at: 2026-08-25
tags: [tui, simplification, submit-gate, controller, lifecycle]
authorities: [docs/architecture/tui.md, packages/tui/src/session-controller.ts, packages/tui/src/use-submit-gate.ts]
---

# TUI Simplification

## Purpose

- TUI 简化只在 `packages/tui` 内收窄不可达状态、合并重复流程并统一提交闸门，不改变 Runtime、Storage 或 Agent 协议。 [S1, S2, S4]

## Durable Decisions

- D1 — `fatal` 屏幕和 `openGoalSelect` 命令不属于当前生产状态空间；Catalog 读取与 SIGINT 清理分别收敛为单一实现。 [S1, S2, S3, S4, S6]
- D2 — Session ViewModel 对 Goal 只做一次隔离克隆，派生字段直接使用该克隆；该规则保持快照隔离而不引入重复深克隆。 [S1, S2, S4, S7]
- D3 — intent、goal-select、preparation、blocked 和 action 五处交互统一使用包内私有 `useSubmitGate`，集中处理 busy、锁、防重复提交和本地空值校验。 [S1, S2, S5, S7]

## Guardrails

- 简化不得改变 `resume`、`continueLatest`、SIGINT 130 退出、Catalog 错误投影或 ViewModel 不可变性语义。 [S1, S2, S3, S4, S6]
- `useSubmitGate` 不接管各屏幕的业务文案和反馈模式；只有成功且允许推进的提交才执行 Action，busy 或空白输入不得调用 Runtime。 [S1, S2, S5, S7]

## Revisit When

- TUI 引入新的顶层屏幕、恢复命令或第二套提交生命周期时。
- ViewModel 不再需要不可变快照，或提交闸门需要跨包复用时。

## Sources

- S1: `specs/tui-simplification/requirements.md`
- S2: `specs/tui-simplification/design.md`
- S3: `packages/tui/src/types.ts`
- S4: `packages/tui/src/session-controller.ts`
- S5: `packages/tui/src/use-submit-gate.ts`
- S6: `packages/tui/src/cli.tsx`
- S7: `packages/tui/test/screens.test.tsx`

# TUI 表现层优化 设计

## Overview

本设计落实已批准的 requirements（`specs/tui-presentation-polish/requirements.md`），在 `packages/tui` 内抽取两个共享原语（`StatusSpinner`、`ErrorLine`）并就地统一各屏幕的 Spinner、错误展示、批准键位、输入清空、UUID 截断与死代码清理。变更不跨出 TUI 边界：不修改 Runtime/Agent/Storage；`SessionController` 仅在 `app.tsx` 的 `dispatch` 包装处收窄异常处理；`structuredClone` 维持单次（`tui-simplification` 已决策）。`beginShutdown` 的 goal 克隆属 `session-controller.test.ts` 断言的快照契约，不在本设计范围。

## Key Design Decisions

### D1：共享原语 StatusSpinner 与 ErrorLine（req-1-3、req-3-3）

新增 `packages/tui/src/status-spinner.tsx` 与 `error-line.tsx`，经 `index.ts` barrel 导出。`StatusSpinner` 是全仓唯一渲染 `@inkjs/ui` `Spinner` 的位置；`ErrorLine` 是全仓唯一渲染错误 `Text` 的位置。各屏幕不再直接使用 `Spinner` 或手写错误 `Text`。不抽取 `TruncatedJson`/`ActionPreview`（单消费者，避免过度抽象）。

### D2：Spinner 去重——每屏单一实例（req-1-1）

`SessionScreen` 的 Spinner 只在 `SessionStatus` 渲染一次（`isActiveRun(session)` 时），删除 `ActionPanel` 内的 `Spinner`；`ActionPanel` busy 时由 `SessionStatus` 的 `StatusSpinner` 表达处理中状态。其余屏幕（`IntentScreen`、`PreparationScreen`、`GoalSelectScreen`）各保留一个 `StatusSpinner`，保证同屏至多一个实例。

### D3：Spinner 文案按上下文映射（req-1-2）

`StatusSpinner` 接收 `label: string`，文案由各屏幕依 ViewModel 派生（非集中 enum，保持最小）：

| 屏幕/位置 | 条件 | label |
|---|---|---|
| IntentScreen | busy | `Creating goal...` |
| GoalSelectScreen | busy | `Resuming goal...` |
| PreparationScreen | phase=gathering_context | `Gathering context...` |
| PreparationScreen | phase=planning | `Planning...` |
| SessionStatus | runStatus=running | `Executing step...` |
| SessionStatus | busy 且 waitingFor=action_approval/action_recovery | `Advancing...` |
| SessionStatus | busy 且 waitingFor=blocked | `Resuming...` |
| SessionStatus | 其他 active | `Processing...` |

### D4：批准面板键位与 busy 策略统一（req-2、req-4-3）

两个批准面板（`ActionPanel`、`ProposalPanel`）的 `ConfirmInput` 统一 `submitOnEnter={false}`、`isDisabled={busy}`，即 busy 时**保持挂载并 disable**，不卸载。理由：与既有 `TextInput isDisabled={busy}` 模式一致，避免布局抖动，处理中状态由唯一 `StatusSpinner` 表达。`ActionPanel` 原 `actionId === undefined || busy ? null : …` 改为 `actionId === undefined ? <错误提示> : <ConfirmInput isDisabled={busy} …/>`（仅无 Action 时不渲染控件）。

### D5：受控 TextInput，提交成功后清空（req-4-1、req-4-2）

`QuestionPanel`、`BlockedPanel`、两处 feedback `TextInput` 改为受控（`value` + `onChange`），在 `useSubmitGate.attempt` 的 `action()` 回调内 `setValue("")`。因 `action()` 仅在校验通过、非 busy、非锁定时执行，故只在成功提交时清空；空输入被 gate 拦截时保留内容供修改。`BlockedPanel` 的 `resetKey` 维持常量，依赖 busy 复位解锁，同一 blocked 等待点再次出现时输入框已空。

### D6：ActionDetails JSON 截断（req-5）

`ActionDetails` 就地保留（不抽组件）。新增模块常量 `MAX_ACTION_JSON_CHARS = 500`。序列化 `JSON.stringify(input, null, 2)`；若长度 > 500，展示 `slice(0, 500)` 并追加 dimColor `… (N chars truncated)`；否则完整展示。500 字符约合 6–10 行折叠 JSON，足以检视小输入而不铺满终端。

### D7：UUID 截断（req-6）

新增 helper `truncateId(id, prefixLength = 8)`：`id.length <= 8 ? id : id.slice(0,8) + "…"`。`SessionStatus` 显示 `Goal ${truncateId(session.goal.id)}`；`GoalSelectScreen.formatGoalEntry` 同样截断 `goalId`。8 字符前缀足以在少量可恢复 Goal 列表中辨认。

### D8：终态派生简化与 switch 兜底（req-7）

`terminalFor` 简化为 `return session.terminal;`，删除 runStatus 终态 fallback（Controller `deriveTerminalSummary` 已对所有终态设 `terminal`，该分支不可达）。`app.tsx` 的 `switch (snapshot.screen)` 增加 `default: return null;`。终态展示与路由行为不变。

### D9：dispatch catch 收窄与选择面板死分支清理（req-8）

`app.tsx` 的 `dispatch` 包装改为显式区分：`UiDispatchRejectedError` 静默（预期 busy/关闭拒绝），其余异常 `console.warn` 不再静默吞掉。需 `import { UiDispatchRejectedError }`。`GoalSelectScreen.handleSelect` 删除 `{ value, emptyMessage }` 死校验，改为 `selectGate.attempt(() => { void onSelect(goalId); })`；空 id 守卫仍由 `SessionController.selectGoal`（`INVALID_GOAL_ID`）承担。

## Components and Interfaces

```ts
// packages/tui/src/status-spinner.tsx
export interface StatusSpinnerProps {
    readonly label: string;
}
export function StatusSpinner({ label }: StatusSpinnerProps): React.JSX.Element;
```

```ts
// packages/tui/src/error-line.tsx
export interface ErrorLineProps {
    readonly error: { readonly code?: string; readonly message: string };
}
export function ErrorLine({ error }: ErrorLineProps): React.JSX.Element;
```

`ErrorLine` 渲染 `<Text color="red">Error${code ? ` [${code}]` : ""}: ${message}</Text>`。`UiError`（`code` 必填）满足该 prop；本地校验错误包装为 `{ message }`（无 code）。code 展示规则：有则附、无则省，全屏一致。

## Testing Strategy

- `session-screen.test.tsx`：更新断言——执行中仅一个 Spinner 实例且文案为 `Executing step`/`Advancing` 等（不再出现 `Working`）；Action 批准后 `ConfirmInput` 保持挂载且 disable（不再消失）；blocked 提交后输入框清空、同一 blocked 再现时为空。保留 Y/N 批准、reject 校验、终态禁输入断言。
- `preparation-screen` / `goal-select-screen` / `intent-screen` 测试：错误展示经 `ErrorLine` 统一格式；`ConfirmInput` 的 Enter 不触发批准；UUID 截断显示。
- `session-controller.test.ts`：不改动；`beginShutdown` 的 `shutting_down` 快照含 `goal` 契约保持。
- 新增 `status-spinner.test.tsx`、`error-line.test.tsx` 小型渲染断言，锁定原语契约（label 透传、code 可选格式）。
- 验证命令：`npx tsx --test packages/tui/test/*.test.tsx` 与 `npx tsc --noEmit`。

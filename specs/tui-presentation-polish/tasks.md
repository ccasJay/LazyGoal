# Implementation Plan

- [x] //TODO 1. 新增 StatusSpinner 原语与测试

  - 创建 packages/tui/src/status-spinner.tsx：`<StatusSpinner label/>` 渲染 `@inkjs/ui` 的 `Spinner`；经 index.ts barrel 导出
  - 新增 packages/tui/test/status-spinner.test.tsx，断言 label 透传渲染
  - _Requirements: [1.3](./requirements.md#req-1-3)_

- [x] //TODO 2. 新增 ErrorLine 原语与测试

  - 创建 packages/tui/src/error-line.tsx：`<ErrorLine error={{code?,message}}/>` 渲染 `Error[ code]: message`，code 有则附无则省；经 index.ts 导出
  - 新增 packages/tui/test/error-line.test.tsx，断言有 code 与无 code 两种格式
  - _Requirements: [3.3](./requirements.md#req-3-3)_

- [x] //TODO 3. IntentScreen 接入两原语

  - intent-screen.tsx：`<Spinner>` 换为 `<StatusSpinner label="Creating goal..."/>`，错误 `Text` 换为 `<ErrorLine>`；本地校验错误包装为 `{message}`、业务错误透传 `UiError`，按 validationError ?? error 统一优先级
  - 更新对应 intent 测试断言新文案与错误格式
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2)_

- [x] //TODO 4. GoalSelectScreen 接入两原语

  - goal-select-screen.tsx：`<Spinner>` 换为 `<StatusSpinner label="Resuming goal..."/>`，错误 `Text` 换为 `<ErrorLine>`，校验与业务错误统一优先级
  - 更新对应 goal-select 测试断言
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2)_

- [x] //TODO 5. GoalSelectScreen UUID 截断与死校验清理

  - 新增 helper `truncateId(id, 8)`；formatGoalEntry 截断 goalId；handleSelect 删除 `{value, emptyMessage}` 死校验，改 `selectGate.attempt(() => { void onSelect(goalId); })`
  - 更新 goal-select 测试断言截断 id 与选择行为不回归
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [8.2](./requirements.md#req-8-2)_

- [x] //TODO 6. PreparationScreen 接入两原语

  - preparation-screen.tsx：`<Spinner>` 换为 `<StatusSpinner label={phase 映射}/>`（gathering_context→`Gathering context...`、planning→`Planning...`），错误换为 `<ErrorLine>`，校验与业务错误统一优先级
  - 更新 preparation 测试断言新文案与错误格式
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2)_

- [x] //TODO 7. PreparationScreen ProposalPanel ConfirmInput 统一

  - proposal ConfirmInput 加 `submitOnEnter={false}`、`isDisabled={busy}`（保持挂载 disable），dimColor 提示语与 Y/N 行为相符
  - 更新 preparation 测试：Enter 不触发批准
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 8. SessionStatus 接入 StatusSpinner、label 映射与 UUID 截断

  - session-screen.tsx SessionStatus：`<Spinner>` 换为 `<StatusSpinner label={spinnerLabel(session)}>`（running→`Executing step...`、action_approval|action_recovery→`Advancing...`、blocked→`Resuming...`、其他 active→`Processing...`）；`Goal ${truncateId(session.goal.id)}`
  - 更新 session-screen 测试：`/Working/` 断言改为新文案
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [x] //TODO 9. SessionScreen ActionPanel 统一 ConfirmInput 并删冗余 Spinner

  - ActionPanel：ConfirmInput 保持挂载并 `isDisabled={busy}`（不再 busy 时卸载），`actionId === undefined` 时不渲染控件；删除 ActionPanel 内的 `<Spinner>`
  - 更新 session-screen 测试：Action 批准后控件保持挂载、同屏单 Spinner
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 10. SessionScreen ActionDetails JSON 截断

  - session-screen.tsx ActionDetails：模块常量 `MAX_ACTION_JSON_CHARS = 500`；formatJson 超 500 则 `slice(0, 500)` + dimColor `…(N chars truncated)`，否则完整
  - 新增/更新断言：超长折叠、短输入完整
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [x] //TODO 11. TextInput 受控并提交后清空

  - QuestionPanel、BlockedPanel、两处 feedback 的 `TextInput` 改受控（`value` + `onChange`），在 `useSubmitGate.attempt` 的 `action()` 回调内 `setValue("")`
  - 更新 session-screen 测试：blocked 提交后输入框清空、同一 blocked 再现时为空
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_

- [x] //TODO 12. terminalFor 简化与 app.tsx switch 兜底

  - session-screen.tsx `terminalFor` 简化为 `return session.terminal`（删 runStatus 终态 fallback）；app.tsx `switch (snapshot.screen)` 补 `default: return null`
  - 更新/保留终态测试，确认终态展示与路由不回归
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 13. app.tsx dispatch catch 收窄

  - app.tsx dispatch 包装按 `UiDispatchRejectedError` 收窄（该类静默，其余 `console.warn`），`import { UiDispatchRejectedError }`
  - 更新/保留 cli 测试，确认 busy/关闭拒绝与正常路径不回归
  - _Requirements: [8.1](./requirements.md#req-8-1), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 14. 全量验证

  - 跑 `npx tsx --test packages/tui/test/*.test.tsx` 与 `npx tsc --noEmit` 全绿；补齐前述任务遗留的断言
  - _Requirements: [7.3](./requirements.md#req-7-3), [8.3](./requirements.md#req-8-3)_

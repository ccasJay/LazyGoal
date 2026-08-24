# TUI 简化 设计

## Overview

按已批准的需求（req-1 至 req-5）在 `packages/tui` 内做行为保持型重构：删除无消费者的 `fatal` 屏幕与 `openGoalSelect` 命令、ViewModel 派生单次克隆、合并 `continueLatest`/`openGoalSelect` 重复流程、清理 SIGINT 双重移除、将 5 处屏幕提交闸门收敛为一个共享 hook。分两批落地：第一批纯删除合并（决策 1/2/5/6），第二批 hook 抽取（决策 3/4），各自独立验证。唯一的新增抽象是包内私有 hook `useSubmitGate`。

## Key Design Decisions

### 决策 1：`fatal` 与 `openGoalSelect` 的删除范围（req-1）

- `types.ts`：删除 `UiScreen` 的 `"fatal"` 成员、`UiFatalViewModel` 接口、`UiViewModel` 联合成员、`UiCommand` 的 `openGoalSelect` 成员。
- `app.tsx`：删除 `case "fatal"` 渲染分支；`switch` 保持穷尽。
- `session-controller.ts`：`execute` 的 `openGoalSelect` case 只保留 `"resume"`；`setBusy`/`setError` 删除 `fatal` 分支，且 `session` 与 `shutting_down` 分支合并为 fall-through（两者逻辑本就相同）。
- `index.ts`：删除 `UiFatalViewModel` 导出。
- 无生产消费者，无持久化格式影响；现有测试均未构造 `fatal` 快照，预期零测试修改。

### 决策 2：ViewModel 派生单次克隆（req-2）

- `toSessionView`：保留 L431 对 Goal 的唯一 `structuredClone`；`messages`、`pendingAction` 直接引用克隆后字段，`deriveProposal` 移除内部克隆（其数据源 `workflow.preparation.proposal` 属于同一个已克隆 Goal）。
- `setGoalSelectError`：移除 `structuredClone(goals)`。所有调用方传入的数组要么刚由 `map` 创建，要么来自即将被替换的不可变旧快照，共享只读引用不削弱不可变性。

### 决策 3：`useSubmitGate` hook 形状（req-4）

新增包内私有文件 `packages/tui/src/use-submit-gate.ts`，不加入 `index.ts` 导出：

```ts
function useSubmitGate(busy: boolean, resetKey: unknown): {
    readonly validationError: string | undefined;
    readonly clearError: () => void;
    readonly attempt: (
        action: () => void,
        options?: { readonly value?: string; readonly emptyMessage?: string },
    ) => void;
};
```

- `attempt`：busy 或已锁定时直接返回；`value` 提供且 trim 为空时写入 `emptyMessage` 并返回；否则锁定、清空错误、执行 `action`。
- 锁在 `busy` 变为 `false` 或 `resetKey` 变化时重置；`resetKey` 取代各屏现有的 identity 重置 effect（GoalSelect 传 `goals`，Preparation 传 `[goal.id, waitingFor, proposal?.objective]`，ActionPanel 传 `[actionId, recovery]`，其余传稳定值）。
- 中文契约级 TSDoc 按 AGENTS.md 补齐；各屏保留自己的文案与 `feedbackMode` 状态，hook 不接管。

### 决策 4：双锁面板合并为单闸门（req-4）

ActionPanel 的 `approveLock`/`rejectLock` 与 PreparationScreen 的 `submitLock`/`approveLock` 各改为一个 `useSubmitGate` 实例：approve 与 reject 是互斥的推进路径，任一路径触发后 Controller 立即置 busy，单锁与原双锁在 exactly-once 语义上等价。

### 决策 5：Catalog 读取流程合并（req-3）

提取私有方法 `listResumableIntoGoalSelect(): Promise<GoalCatalogEntry[] | undefined>`，封装 session 检查、`listResumable`、错误投影、`goal_select` busy 快照与空列表错误；`openGoalSelect` 调用后即返回，`continueLatest` 在其后取首项调用 `restoreAndAdvance`。

### 决策 6：SIGINT 单机制清理（req-3）

`runCli` 的 `finally` 只保留 `unregisterSigint?.()`（其 `close` 即 `process.off`，且由 `ManagedResourceRegistry` 幂等管理），删除独立的 `process.off("SIGINT", onSigint)` 调用。

### 决策 7：架构文档同步（req-5）

`tui.md`：删除/修正 `UiScreen` 面与命令面描述，职责表中 Ctrl+C 回调归属改为 `TuiApp`；[cli.tsx](../../packages/tui/src/cli.tsx) 的 `runCli` TSDoc 删除「由后续 Shutdown TODO 接管」的过期表述。

## Components and Interfaces

| 成员 | 位置 | 变更 |
| --- | --- | --- |
| `useSubmitGate` | `src/use-submit-gate.ts`（新增，包内私有） | 决策 3 契约 |
| 5 处交互面板 | `intent-screen.tsx` / `goal-select-screen.tsx` / `preparation-screen.tsx` / `session-screen.tsx` | 删除本地 lock ref、重置 effect 与校验 state，改用 hook |
| `SessionController` | `session-controller.ts` | 决策 1/2/5 的私有方法变更，公共 API（`dispatch`/`subscribe`/`getSnapshot`/`beginShutdown`）不变 |
| `types.ts` / `index.ts` / `app.tsx` / `cli.tsx` | 现有文件 | 决策 1/6/7 的删除与文档修正 |

## Testing Strategy

- 行为保持验证：`npx tsc --noEmit` + `npx tsx --test packages/tui/test/*.test.ts*` 全量运行，现有约 52 个用例预期零修改通过（req-5）。
- 删除残留验证：`rg "fatal|openGoalSelect" packages/` 仅命中本 Spec 文档（req-1-3）。
- hook 覆盖：5 个屏幕现有交互测试（重复提交、busy 禁用、空白校验）间接覆盖 `useSubmitGate`；若有分支未被覆盖，在 `screens.test.tsx` 补充对应用例。
- 分两批验证：第一批（决策 1/2/5/6）与第二批（决策 3/4）各自完整运行上述检查后再合入。

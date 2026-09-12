# TUI 瀑布式步骤流渲染 设计

## 审批摘要

### 方案

在 `packages/tui` 内部打通 `NotifyingGoalStore` 到 `SessionController` 的实时事件管道；Controller 维持单调递增去重的步骤历史，在 `UiSessionViewModel` 中暴露结构化的已提交步骤列表 `committedSteps`；重构 `SessionScreen` 视觉布局，将已完成步骤交由 Ink `<Static>` 沉淀为终端 scrollback 瀑布流，底部仅保留动态活动抽屉承载当前进行态与等待交互。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| CLI 组合根通知注入 | 使用已有的 `NotifyingGoalStore` 包装基础存储，并显式传入 `SessionController` 的 `notifyingStore` 依赖。复用现有验证过的通知结构，零引入新抽象。 | 消除 CLI 在连续执行多步时中间 step 无法通知 UI 的装配缺陷。 |
| ViewModel 步骤流结构设计 | 在 `UiSessionViewModel` 中增加不可变 `committedSteps: readonly UiStepSummary[]`，包含步骤号、Tool 标识、输入摘要、执行状态与输出摘要。 | 视图组件与底层领域模型完全解耦，以纯声明式数据直接驱动时间线渲染。 |
| Ink Static 瀑布流布局 | 拆分 `<Static>` 滚动区与底部 `<ActiveDrawer>` 动态区：已完成步骤进入 `<Static>` 固化，当前运行中与审批操作留存底部。 | 获得现代 CLI 级别的向下瀑布流视觉体验，支持终端原生滚轮向上回溯历史。 |
| 步骤单行紧凑与安全截断 | 单个已提交步骤条目默认渲染为紧凑单行格式，输入/输出摘要超出预设字符数（如 80 字符）时自动截断并显示省略标记。 | 彻底防止只读文件或长命令的大篇幅输出刷爆终端，保持瀑布流紧凑美观。 |

### 风险与待确认

- 风险等级：medium；理由：修改了 TUI 数据流装配与核心页面渲染树，但不涉及领域状态机与跨进程协议。
- 关键操作：无
- 风险：`<Static>` 输出后不可变，若截断阈值过大可能造成滚动行过多；需严格控制紧凑单行格式。
- 待确认：无

## Overview

本项目旨在彻底解决 TUI 在 `executing` 运行阶段“仅展示单个 step 并在原地擦除覆盖”的视觉缺陷。通过数据层装配修复、ViewModel 时间线沉淀、以及 Ink `<Static>` 布局分层，使每一个完成的 Action 与 Observation 作为确定的历史事件留存在终端上，呈现自然的垂直生长瀑布流，底部维持轻量活跃抽屉。

```text
  ┌─────────────────────────────────────────────────────────────┐
  │                       Runner (Loop)                         │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ saveCheckpoint(goal)
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                 NotifyingGoalStore (Wrapper)                │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ onSave(goal) 事件通知
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                      SessionController                      │
  │  - Monotonic stepCount 去重与单调递增校验                   │
  │  - 将新 Step 归纳为 UiStepSummary 并追加到 committedSteps   │
  │  - 发射最新不可变 UiSessionViewModel                         │
  └──────────────────────────────┬──────────────────────────────┘
                                 │ useSyncExternalStore
                                 ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                        SessionScreen                        │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ <Static items={[...messages, ...committedSteps]}>     │  │  --> 终端 scrollback
  │  │   - 顶层用户意图与对话消息                            │  │      (瀑布流时间线)
  │  │   - ✔ Step 1: [read_file] src/auth.ts                 │  │
  │  │   - ✔ Step 2: [write_file] src/auth.ts (ok)           │  │
  │  └───────────────────────────────────────────────────────┘  │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ <ActiveDrawer>                                        │  │  --> 底部动态重绘区
  │  │   - ⠋ StatusSpinner: Executing step...                │  │      (就地覆盖刷新)
  │  │   - Action approval panel (待确认时)                  │  │
  │  │   - TerminalPanel (终态时)                            │  │
  │  └───────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### CLI 组合根通知注入
在 `packages/tui/src/cli.tsx` 中，`CheckpointGateGoalStore` 下游的基础存储由 `NotifyingGoalStore` 包装。实例化 `SessionController` 时，显式将 `notifyingStore` 传入 dependencies。每当 Runner 内部提交一次 checkpoint 时，`notifyingStore` 的 `onSave` 钩子被同步触发，直接唤醒 Controller 的 `onGoalCommitted`。

### ViewModel 步骤流结构设计
`UiSessionViewModel` 扩充以下字段：
```ts
export interface UiStepSummary {
    readonly stepNumber: number;
    readonly toolId: string;
    readonly actionId: string;
    readonly status: "success" | "failure" | "running";
    readonly inputSummary?: string;
    readonly outputSummary?: string;
}

export interface UiSessionViewModel {
    // ... 原有字段保持不变
    readonly committedSteps: readonly UiStepSummary[];
}
```
Controller 内部在处理 `onGoalCommitted` 时，从 `savedGoal.state.run.lastStep` 提取最新 Step。当 `stepCount > lastCommittedStepCount` 时，将该 Step 转换为 `UiStepSummary` 并追加到私有 `committedSteps` 数组中，然后生成新的不可变快照。

### Ink Static 瀑布流布局
`SessionScreen` 使用 Ink `<Static>` 渲染已提交的历史条目：
1. 初始渲染时，包含系统对话消息与历史步骤；
2. 当新的 Step 提交到 `committedSteps` 时，Ink 的 `<Static>` 只负责将新增项追加输出并固化，终端自动向下滚动；
3. 原有的 `SessionStatus` 区域收敛为 `<ActiveDrawer>`，移除了原地擦除刷新的 `Last Action` / `Last Observation` 冗余行，只保留整体 Goal 头部与当前活跃状态。

### 步骤单行紧凑与安全截断
设计专用的 `StepWaterfallItem` 视图组件：
- 状态指示：成功时显示绿色的 `✔`，失败时显示红色的 `✖`；
- 工具与参数：`Step <N>: [<toolId>] <compactInputSummary>`，单行限制最大 80 字符，超出使用 `…` 截断；
- 输出摘要：右侧或次行附带精简结果说明（如 `(14 tests passed)` 或 `(file saved, 120 lines)`）。

## Components and Interfaces

### `StepWaterfallItem`
用于 `<Static>` 内部渲染单个已完成步骤的无状态展示组件：
```tsx
interface StepWaterfallItemProps {
    readonly step: UiStepSummary;
}
```

### `ActiveDrawer`
收敛动态展示的底部活动抽屉组件：
```tsx
interface ActiveDrawerProps {
    readonly session: UiSessionViewModel;
    readonly onSubmitMessage: (content: string) => void | Promise<void>;
    readonly onApproveAction: (actionId: string) => void | Promise<void>;
    readonly onRejectAction: (actionId: string, reason: string) => void | Promise<void>;
}
```

## Testing Strategy

1. **CLI 装配集成测试**：
   在 `test/cli.test.ts` 中验证 Controller 正确接收到 `notifyingStore`，且保存触发时能激活 Controller 监听。
2. **Controller 步骤流单调性与快照隔离单元测试**：
   在 `test/session-controller.test.ts` 中模拟乱序提交、重复提交及相同 stepCount 的边界情况，断言 `committedSteps` 严格递增且去重。
3. **Ink 视觉与瀑布帧渲染测试**：
   在 `test/session-screen.test.tsx` 中使用 `ink-testing-library`，模拟 Step 1、Step 2 连续提交，断言新 Step 被正确追加，且先前的 Step 条目在输出文本中完全保留，不被擦除。

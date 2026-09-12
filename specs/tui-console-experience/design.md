# TUI 交互控制台体验设计

## 审批摘要

### 方案

在 `packages/tui` 中基于现有 React 19 + Ink 6 + @inkjs/ui 技术栈扩展页面状态机与 CLI 调度：新增带 ASCII Art 的 `HomeScreen` 首页导航，将执行期待确认等待点重构为流式一体化输入行并通过 `Shift + Tab` 快捷键实现 YOLO/Confirm 模式热切换，同时利用全屏终端缓冲区（`alternateScreen: true`）实现事后只读 `InspectorScreen` 轨迹复盘，全部组件严格直接复用官方生态。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 页面状态机扩展 | 在 `UiViewModel` 中新增 `home`、`settings` 与 `inspector` 屏幕类型，由 `SessionController` 集中维护与派发。 | 保持单进程 UI 状态严格受控与不可变性，不侵入 Runtime 领域模型。 |
| 执行期一体化输入 | 将 `ActionPanel` 中的确认与拒绝收敛为单一 `TextInput`，直接回车派发批准，非空文本派发拒绝。 | 大幅削减用户在人机协同执行时的交互摩擦，输入框保持纯文本语义。 |
| 按键模式热切换 | 使用 `Shift + Tab` 快捷键在 `Confirm` 与 `YOLO` 模式间循环切换，放弃斜杠命令（Slash Commands）。 | 用户无需清空输入框或学习指令语法，随时一键切换自动/确认状态。 |
| 审查期全屏生命周期隔离 | `InspectorScreen` 单独使用全屏模式（`alternateScreen: true`），执行期坚决维持终端标准流。 | 保证事后复盘拥有干净完整的分页视野，且不影响执行期原生文本复制体验。 |
| 官方组件绝对复用 | 菜单、列表全部直接使用 `@inkjs/ui` 的 `Select`，输入框使用 `TextInput`，ASCII 标头使用 `<Text>`。 | 严禁重复自研基础 UI 组件，最大限度降低代码量与长期维护成本。 |

### 风险与待确认

- 风险等级：medium；理由：扩展了 TUI 视图层状态与键盘事件监听，但不破坏任何持久化或领域核心契约。
- 关键操作：无
- 风险：无
- 待确认：无

## Overview

本项目旨在为 LazyGoal 构建现代化的交互控制台体系，核心架构由三个相互协作的视图层模块构成：
1. **导航主页（Home Screen）**：作为无参数启动 `lazygoal` 时的门面，渲染艺术字 ASCII 标头并通过 `@inkjs/ui` 的 `Select` 提供任务新建、历史复盘、设置与退出。
2. **执行期流式一体化输入与热切换（Runtime Stream Console）**：重构执行期等待点，将多步操作收敛为单一输入条，支持回车直接批准、输入文本自动转拒绝理由；监听 `Shift + Tab` 快捷键在 `[CONFIRM]` 与 `[YOLO]` 模式间无缝切换。
3. **事后全屏轨迹检查器（Inspector Screen）**：支持从主页或 `lazygoal inspect` 独立进入，在全屏终端中对历史事件流进行按步切片分页翻看、思考链（CoT）折叠与外部工具查看。

## Architecture

```text
+---------------------------------------------------------------+
|                         CLI Dispatcher                        |
|        lazygoal [empty] | -c | resume | inspect [goalId]      |
+-------------------------------+-------------------------------+
                                |
                                v
+---------------------------------------------------------------+
|                       SessionController                       |
|  - Manages UiViewModel snapshot (home/session/settings/etc.)  |
|  - Serializes commands with useSubmitGate                     |
|  - Tracks executionMode: "confirm" | "yolo"                   |
+-------------------------------+-------------------------------+
                                |
        +-----------------------+-----------------------+
        |                       |                       |
        v                       v                       v
+---------------+      +-----------------+     +-----------------+
|  HomeScreen   |      |  SessionScreen  |     | InspectorScreen |
| - ASCII Art   |      | - <Static> log  |     | - Fullscreen TUI|
| - @inkjs/ui   |      | - Unified Input |     | - Step paging   |
|     Select    |      | - Shift+Tab Mode|     | - CoT toggle (r)|
+---------------+      +-----------------+     +-----------------+
```

## Key Design Decisions

### 页面状态机扩展

在 [packages/tui/src/types.ts](file:///Users/sawyerlau/Project/LazyGoal/packages/tui/src/types.ts) 中对 `UiViewModel` 和 `UiCommand` 进行类型安全的扩展：
- `UiScreen`: 增加 `"home"`、`"settings"`、`"inspector"`；
- `UiViewModel`:
  - `home`: 包含只读环境摘要信息与菜单状态；
  - `settings`: 包含当前模型配置、Profile 信息、工作区路径等；
  - `session`: 在现有 `UiSessionViewModel` 基础上扩展 `executionMode: "confirm" | "yolo"`；
  - `inspector`: 包含当前浏览的 `goalId`、`steps: TrajectoryStep[]`、`currentStepIndex`、`showReasoning: boolean`。
- `UiCommand`: 增加导航与模式命令：`openHome`、`openSettings`、`openInspector`、`toggleExecutionMode`、`inspectStep`、`toggleReasoning`。

### 执行期一体化输入与按键模式切换

在 [packages/tui/src/session-screen.tsx](file:///Users/sawyerlau/Project/LazyGoal/packages/tui/src/session-screen.tsx) 中重构待批准交互面板（`ActionPanel`）：
- 废弃分立的 `ConfirmInput` + 额外说明输入组件，改为使用 `@inkjs/ui` 的单个 `TextInput`，提示文案展示 `[Enter] 放行 | [Shift+Tab] 切换模式 | 输入意见拒绝`。
- **键盘监听**：利用 Ink 的 `useInput` 监听键盘事件：
  ```tsx
  useInput((input, key) => {
      if (key.shift && key.tab) {
          onToggleExecutionMode(); // 切换 confirm <-> yolo
      }
  });
  ```
- **用户提交逻辑**：通过包内 `useSubmitGate` 防重：
  - 若输入为空字符串（用户直接敲击 Enter）：视为同意，直接触发 `onApproveAction(pendingAction.actionId)`；
  - 若输入为普通非空字符串：视为拒绝理由，触发 `onRejectAction(pendingAction.actionId, input.trim())`，将用户意见作为自然语言观察直接传给 Agent 促其重排。
- 在 `YOLO` 模式下，当 Controller 收到待批准状态时，无需用户干预直接自动派发批准，直至任务遇到 blocked 阻塞等待或终态。

### 审查期全屏生命周期隔离

- 审查界面 `InspectorScreen` 不参与执行期的流式追加，而是利用 Ink 的全屏备用缓冲区渲染：
  - 启动方式：通过挂载时指定 `{ alternateScreen: true }`，保证退出后原终端屏幕完全还原。
  - 数据源：直接使用已有的 `readTrajectoryAtSnapshot` 或从 `JsonFileTrajectoryStore` 加载事实事件流，按 assistant 回复或 tool call 进行步进分组（`steps`）。
  - 键盘事件：使用 Ink 原生 `useInput` 监听快捷键：
    - `l` / `RightArrow`：`currentStepIndex + 1`；
    - `h` / `LeftArrow`：`currentStepIndex - 1`；
    - `0` / `$`: 跳至第一步或最后一步；
    - `j` / `k` / `DownArrow` / `UpArrow`: 垂直滚动；
    - `r`: 翻转 `showReasoning` 布尔值；
    - `e`: 暂停当前 TUI（恢复正常 stdio），通过 `child_process.spawnSync` 调用外部工具（优先环境变量 `$EDITOR` 或 `jless`），退出后继续刷新；
    - `q`: 调用 `useApp().exit()` 干净退出。

### 官方组件绝对复用

- 首页与轨迹选择列表：直接引用 `@inkjs/ui` 的 `Select` 组件：
  ```tsx
  import { Select } from "@inkjs/ui";
  <Select options={menuOptions} onChange={handleSelect} />
  ```
- 文本输入：直接使用 `@inkjs/ui` 的 `TextInput`。
- ASCII Art 标头：以预先格式化好的标准字符常量嵌入，使用 Ink 原生 `<Text color="cyan" bold>{ASCII_BANNER}</Text>` 渲染，严禁引入未经审计的动态 ASCII 生成库。

## Testing Strategy

1. **单元测试 (`packages/tui/test/`)**：
   - `home-screen.test.tsx`：测试四个主菜单选项在选择时的命令派发；
   - `unified-action-input.test.tsx`：测试空回车放行、非空文本拒绝理由回传、`Shift+Tab` 模式切换触发逻辑；
   - `inspector-screen.test.tsx`：测试按步切片逻辑（步进翻页、快捷键边界限制、CoT 显示隐藏切换）。
2. **集成测试 (`packages/tui/test/cli.integration.test.ts`)**：
   - 测试无参数启动进入 `home` 视图；
   - 测试 `lazygoal inspect` 无参数进入轨迹列表选择；
   - 测试 `lazygoal inspect <goalId>` 直接拉起轨迹复盘。

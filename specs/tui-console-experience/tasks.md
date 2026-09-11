# Implementation Plan

- [x] //TODO 1. 扩展 TUI 视图状态机与 ViewModel 定义

  - 实现目标：在 `packages/tui/src/types.ts` 和 `session-controller.ts` 中引入 `home`、`settings` 与 `inspector` 屏幕类型，并在 Session 快照中扩展 `executionMode: "confirm" | "yolo"` 及 `toggleExecutionMode` 命令。
  - 成功判据：Controller 能够派发 `openHome`、`openSettings`、`toggleExecutionMode` 等命令并派生对应不可变 ViewModel；单元测试验证状态转换与 busy 互斥正确。
  - 验证方式：`packages/tui/test/session-controller.test.ts` 新增状态机与模式切换测试。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [1.5](./requirements.md#req-1-5), [2.7](./requirements.md#req-2-7), [4.1](./requirements.md#req-4-1)_

- [x] //TODO 2. 实现 HomeScreen 与 SettingsScreen 组件并接入主流程

  - 实现目标：编写 `src/home-screen.tsx` 和 `src/settings-screen.tsx`，渲染纯字符 ASCII Art `LazyGoal` 标头，直接使用 `@inkjs/ui` 的 `Select` 组件渲染四项主菜单；无参数启动默认挂载主页。
  - 成功判据：用户执行 `lazygoal` 默认看到 ASCII Art 与菜单，选中各菜单项正确触发意图输入、历史复盘、设置查看或干净退出。
  - 验证方式：`packages/tui/test/home-screen.test.tsx` 组件交互测试与 CLI 入口测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [1.5](./requirements.md#req-1-5), [1.6](./requirements.md#req-1-6), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_

- [x] //TODO 3. 重构执行期待批准交互为流式一体化输入条并支持 Shift+Tab 模式热切换

  - 实现目标：在 `session-screen.tsx` 中使用 `@inkjs/ui` 的单个 `TextInput` 重构 `ActionPanel`；接入 `useSubmitGate` 实现空回车批准、非空文本拒绝与自然语言反馈；使用 `useInput` 监听 `Shift + Tab` 快捷键循环切换 Confirm 与 YOLO 模式；状态栏显示模式标识。
  - 成功判据：待批准 Action 时直接按 Enter 立即放行；输入文本按 Enter 立即转为带理由的拒绝；按 `Shift + Tab` 切换为 YOLO 后后续 Action 自动放行；终端继续保持 `<Static>` 流式沉淀。
  - 验证方式：`packages/tui/test/session-screen.test.tsx` 交互测试与快捷键切换测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5), [2.6](./requirements.md#req-2-6), [2.7](./requirements.md#req-2-7), [2.8](./requirements.md#req-2-8), [4.2](./requirements.md#req-4-2)_

- [x] //TODO 4. 实现事后全屏只读轨迹检查器 InspectorScreen 与步骤切片服务

  - 实现目标：编写 `src/inspector-screen.tsx` 与步骤切片辅助函数，在全屏终端模式（`alternateScreen: true`）下按步骤展示消息与 Action；通过 `useInput` 支持 `h`/`l`/`0`/`$` 翻页、`j`/`k` 滚动、`r` 折叠 CoT、`e` 外部查看与 `q` 退出。
  - 成功判据：能正确将原始 Trajectory 事件分组为 Step 并支持全屏快捷键无缝浏览，折叠/展开思维链顺畅，退出时干净还原终端。
  - 验证方式：`packages/tui/test/inspector-screen.test.tsx` 步进分页与按键处理测试。
  - _Requirements: [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5), [3.6](./requirements.md#req-3-6), [3.7](./requirements.md#req-3-7), [3.8](./requirements.md#req-3-8), [4.2](./requirements.md#req-4-2)_

- [ ] //TODO 5. 实现轨迹选择列表与 CLI inspect 命令分流及端到端集成验证

  - 实现目标：在 CLI 中增加 `lazygoal inspect [goalId]` 分流；未传 ID 或主菜单选择 View History 时，直接复用 `@inkjs/ui` 的 `Select` 渲染会话选择列表，选中后进入全屏 Inspector；完成全套集成验证。
  - 成功判据：CLI 支持 `inspect` 子命令；列表选择与直接带 ID 启动均可稳定拉起复盘；全量已有测试与新增测试 100% 通过。
  - 验证方式：`packages/tui/test/cli.integration.test.ts` 新增子命令分流与集成测试；执行 `npm test` 全量回归。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2) | 执行 `lazygoal` 默认渲染 ASCII Art 标头与四个主菜单选项 | CLI 启动测试与 HomeScreen 渲染测试 |
| [1.3](./requirements.md#req-1-3), [1.6](./requirements.md#req-1-6) | 菜单选择 New Goal 进入意图输入；选择 Exit 正常退出 | 菜单交互测试 |
| [1.5](./requirements.md#req-1-5) | 菜单选择 Settings 显示环境与只读配置，按键可返回主页 | SettingsScreen 视图测试 |
| [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2) | 待批准 Action 下直接按 Enter 键触发 approveAction 自动放行 | SessionScreen 统一输入条单元测试 |
| [2.3](./requirements.md#req-2-3) | 待批准 Action 下输入文字按 Enter 触发 rejectAction 并将文字作为自然语言理由 | 自然语言干预理由提交测试 |
| [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5), [2.7](./requirements.md#req-2-7) | 按下 `Shift + Tab` 快捷键在 YOLO 与 Confirm 模式间即时切换；状态栏模式标识同步更新 | 快捷键模式热切换集成测试 |
| [2.6](./requirements.md#req-2-6), [2.8](./requirements.md#req-2-8) | 输入框文案明确提示快捷键；消息流通过 `<Static>` 保持终端原生滚动，不破坏文本复制 | 流式输出与提示文案测试 |
| [3.1](./requirements.md#req-3-1), [4.1](./requirements.md#req-4-1) | `lazygoal inspect` 无参启动渲染基于 `@inkjs/ui` 的 `Select` 轨迹列表 | 轨迹选择列表交互测试 |
| [3.2](./requirements.md#req-3-2), [3.8](./requirements.md#req-3-8) | 选中或带 ID 进入全屏 Inspector，按 `q` 退出完全还原终端屏幕 | 全屏生命周期挂载与恢复测试 |
| [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5) | Inspector 中按 `h`/`l`/`0`/`$` 正确切步，按 `j`/`k` 正确垂直滚动 | 步骤切片与键盘导航测试 |
| [3.6](./requirements.md#req-3-6), [3.7](./requirements.md#req-3-7) | 按 `r` 切换 CoT 折叠状态；按 `e` 临时挂起并调用外部工具 | 思考折叠与外部工具挂起测试 |
| [4.2](./requirements.md#req-4-2) | 全仓库代码、注释与文档中不得出现外部第三方项目名称 | 代码与文本合规检查 |

### Latest Result

未执行。待任务计划批准后在执行阶段记录逐项验证证据。

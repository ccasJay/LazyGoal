# TUI 模块

## 职责

TUI 负责输入、渲染和会话导航，不复制 Runtime 状态机，也不直接写 Snapshot。[`SessionController`](../../packages/tui/src/session-controller.ts) 是单 Goal 命令串行化入口；[`SessionScreen`](../../packages/tui/src/session-screen.tsx) 始终承载当前 Goal 会话，所有执行期内容进入同一时间线。Goal 是会话容器，Run 是当前执行边界，Step 是时间线中的执行推进。

## 页面与命令

Launcher 仍负责 Home、Intent、Goal Select、Settings 和 Inspector 页面。创建或恢复 Goal 后直接进入 Session；创建期间首次成功保存的快照会立即把 Controller 从 Intent 切换到 Session，Launcher 后续等待 Coordinator 推进时，Store 的每次成功提交都继续更新该会话。Controller 将 `answerAskUser`、`approveTask`、`feedbackTask`、`approveAction`、`rejectAction` 和普通消息映射到 Coordinator；请求 ID、Action ID 和当前 Goal/Run 由 Controller 与 Runtime 共同校验。waiting 状态的普通消息调用 `resume`，completed 状态的普通消息调用 `continue`，不通过自然语言判断是否复用 Run。`/plan` 只触发后端 `enterPlanMode`，不会进入 Goal messages。

Session 的 `ActiveDrawer` 按等待点选择交互：

- `AskUserPanel` 支持计划期/执行期模式、单选、多选和 `Other` 文本；
- `TaskProposalPanel` 展示 objective、完成条件和批准提示，支持批准或反馈；
- Action 审批抽屉展示 Tool 输入并支持批准/拒绝；
- blocked、终态、错误和清理状态使用同一 Session 页面投影。
- Plan Mode 由 Goal Snapshot 的 `goalPlan` 投影到只读 [`PlanPanel`](../../packages/tui/src/plan-panel.tsx)；普通模式不显示计划。completed Run 保留“Start the next Run”输入，失败和取消终态不接受新的 Run 输入。

## 统一时间线与流式输出

Controller 唯一持有单调不可变 `timeline`，元素包括已提交 User/System 消息、稳定 Assistant Markdown Block 和已提交执行步骤。`SessionScreen` 使用 Ink `Static` 渲染历史时间线，不维护 Screen-owned 历史副本。

新的 Assistant 消息由 `StreamingTranscriptController` 接收 `started`、`delta`、`completed` 事件。稳定 Block 按节流 Tick 进入时间线；未提交部分保留为 `streamingTail`。新用户消息、步骤提交、等待点和恢复都会触发 flush barrier，保证内容顺序；恢复时直接 hydrate 已提交消息，不重复播放旧流。

普通只读 Tool 和副作用 Tool 都通过 Goal Snapshot 的已提交 `lastStep` 投影为步骤摘要，使用 `(goalId, runId, stepNumber)` 身份去重；相同局部 step 序号在不同 Run 中不会合并。TUI 通过 `@lazygoal/execution-stream` 的通用订阅适配器接收 Step、模型和 Tool 活动，显示动态尾部及有限 Tool 输出；未提交的活动只属于实时 ViewModel，成功提交的每个 Step 仍由 Snapshot/Trajectory 提交通知进入 Session 时间线。

## 恢复、模型切换与关闭

Session 初始化从完整 Goal Snapshot hydrate 时间线、消息和已提交步骤，并保留 `completedRuns` 的消息历史。收到同一 Goal 的后继 Run 通知时，Controller 只有在消息区间和历史记录证明其确实继承当前 Run 时才切换；旧 Run 的迟到保存和流不会覆盖新 Run。等待 `ask_user`、任务批准、blocked 或 Action 审批时可切换模型；Controller 通过 `GoalModelSelectionCoordinator` 先保存选择，再发布新的内存 Binding。模型请求、Tool 调用和 UI 命令共享 AbortSignal。

首次 Ctrl+C/SIGINT 进入统一关闭流程：停止新命令、冻结 Checkpoint Gate、abort 根信号、等待已进入的保存与受管资源清理，最后退出 130。Controller 本身只替换 UI 快照，不伪造 cancelled Goal。

## 当前限制

TUI 只保证单进程内命令串行化；跨进程租约、历史 Snapshot 查询和终端外部滚动由 Runtime/Ink 当前能力决定。Inspector 读取已提交 Trajectory，不从 UI 时间线反推 Working Memory。

## LazyGoal Home 持久化

TUI 从 `LAZYGOAL_HOME` 解析全局配置、LLM Profile 和 Agent Profile；缺失时使用
`~/.lazygoal`。当前 workspace 的真实路径经 SHA-256 归一化为 workspace ID，Goal、Trajectory、
Trace、Context Sidecar、benchmark 历史和 GEPA Run 写入
`~/.lazygoal/workspaces/<workspace-id>/`。普通 Goal 与 benchmark 历史只从当前 workspace
发现；显式数据目录仍可由测试、导出或容器调用方覆盖。组装成功后写入
`workspace.json` 身份清单，身份不一致会快速失败。

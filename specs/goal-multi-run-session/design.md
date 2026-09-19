# Goal 计划模式与多 Run 会话设计

## 审批摘要

### 方案

Goal 继续作为唯一的可恢复会话聚合，Runtime 在其上增加持久化的 `Plan Mode`。只有接受 `/plan` 后才 materialize GoalPlan；GoalPlan 保存 Cursor 风格的稳定 Todo，Run 通过 `todoId` 承接一个 Todo，Step 仍是 Run 内的执行推进。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| Runtime 持有 Plan Mode | `/plan` 只产生控制 Effect，最终由 Coordinator/Launcher 写入 Goal Snapshot；模型和 UI 不能自行切换模式 | 普通执行不会意外创建 GoalPlan；模式可在重启后恢复 |
| GoalPlan 与 Working Memory 分离 | GoalPlan 是 Goal 级计划真相；Working Memory 的 `plan` 仍是当前 Run 的派生上下文 | 复用现有 Memory/Runner 逻辑，但新增独立的 Todo 协议与校验 |
| 一个 Todo 对应一个 Run | Plan Mode 下由 Runtime 绑定 `todoId`，完成时由证据门控同时提交 Run 与 Todo；普通模式继续不 materialize GoalPlan | Plan Mode 不自动串行执行 pending Todo；新 Run 由用户输入触发，普通模式保留无计划多 Run |
| Slash Command 只负责进入模式 | `/plan` 无参数且在安全边界时执行；命令文本不进入 Goal.messages | Slash Command、TUI 与后端职责清晰，拒绝路径无持久化副作用 |
| 先提交会话边界再调度 | continue 先归档旧 Run、保存消息和新 Run，再调用现有 `advance`/Scheduler | 保存失败不调用模型；调度失败可从已提交新 Run 恢复 |
| Trajectory 序号按 Run 独立 | 延续当前 TrajectoryStore 的 `(goalId, runId, sequence)` 约束，新 Run 从本地 sequence 0 开始 | 历史查询必须携带 Run 身份，不把不同 Run 的相同序号混为一谈 |
| GoalPlan 不授予工具权限 | Plan 操作只改变结构化计划；Tool Registry、Profile、Action approval 和 Evidence Gate 保持现有边界 | 计划模式不会绕过现有安全策略，Runner 执行核心保持不变 |

### 风险与待确认

- 风险等级：high；需要同时改变持久化状态、模型输出契约、Slash Command 接线、完成证据和终态 UI，且模式边界影响模型可见工具。
- 关键操作：无；本设计不删除数据、不执行真实外部副作用，也不引入跨进程锁。
- 风险：计划操作可能引用未知 Todo 或旧 revision；迟到的多 Run 保存通知可能倒退 TUI；错误的 completed 声明可能把未验证工作标记为完成。Runtime 通过 revision、Run 身份、当前 Run Evidence 和原子 Snapshot 校验 fail closed。
- 待确认：无。退出 Plan Mode 的命令不在本 Spec；当前 mode 只定义 `normal` 和 `plan`，新 Goal 默认 `normal`。

## Overview

当前 [GoalState](../../packages/runtime/src/domain.ts) 只保存最新 Run，[GoalCoordinator](../../packages/runtime/src/goal-coordinator.ts) 在终态返回后不提供新 Run 入口，[SessionScreen](../../packages/tui/src/session-screen.tsx) 也会在 terminal 面板停止输入。本设计在这些边界增加会话历史、Plan Mode 和显式继续入口，不把 `transition` 改造成跨 Run 状态机。

```text
用户输入
   |
   +--> Slash Registry -- /plan --> Controller -- enterPlanMode --> Coordinator
   |                                                               |
   +--> 普通文本 ------------------> resume / continue -------------+
                                                                   |
                     Goal Snapshot (mode, GoalPlan, messages, run, completedRuns)
                                      |
             plan mode ------------->|<------------- normal mode
                 |                    |
        system_update_goal_plan       +--> continue: 创建一个新 Run
                 |                         +--> 绑定一个 pending Todo（plan mode）
                 v                         +--> 调用现有 Scheduler/Runner
          GoalPlan reducer
                 |
                 +--> TUI PlanPanel 与 Agent Prompt 的同一份投影
```

需求覆盖：模式边界见需求 1；GoalPlan、稳定 ID 与恢复见需求 2、3、6；Run 绑定和状态分流见需求 4、5；TUI 与权限回归见需求 7、8。

## Key Design Decisions

### Runtime 持有 Plan Mode

`GoalState` 增加 `mode: "normal" | "plan"`。`normal` 下不创建 `goalPlan` 字段，也不向模型工具包、TUI ViewModel 或 Snapshot 派生出 GoalPlan。`plan` 下必须存在 GoalPlan；当前版本不提供退出命令，因此模式一旦进入只会随 Goal 持续恢复。

`/plan` 在 [slash-command](../../packages/slash-command/src) 中只负责校验无参数并返回 `{ kind: "enter_plan_mode" }`。在已有 Goal 中，Controller 将 Effect 转成 `GoalCoordinator.enterPlanMode(ref)`；Coordinator 拒绝 `running` 或存在实际模型/Tool 调用的 Run，在 `created`、`waiting` 或终态安全边界保存模式和空计划。尚无 Goal 时，Controller 只保存一次性的 `pendingLaunchMode`，下一次创建 Goal 时由 Launcher 在首个 Snapshot 中写入 `mode: "plan"`，不会把 `/plan` 当作 intent。

Plan Mode 的状态归 Runtime 所有。Agent 输出、TUI 本地状态或普通消息都不能直接改变 `mode`；重复 `/plan` 是幂等操作，不增加 plan revision。该决策覆盖需求 1.1–1.4、7.1。

### GoalPlan 与 Working Memory 分离

GoalPlan 是 Goal Snapshot 的持久化字段，结构保持最小化：

```ts
type GoalPlanStatus = "pending" | "in_progress" | "completed" | "cancelled";

interface GoalPlanItem {
  readonly id: string;       // Runtime 分配，在 Goal 内唯一
  readonly content: string;
  readonly position: number;
  readonly status: GoalPlanStatus;
  readonly activeRunId?: string;
}

interface GoalPlan {
  readonly revision: number;
  readonly items: readonly GoalPlanItem[];
}
```

模型使用独立的 `GoalPlanPatch` 提议 `add`、`update`、`reorder`、`cancel` 操作，并带 `baseRevision`。Runtime 在一次 reducer 调用中校验所有 ID、状态转换、容量和最多一个 `in_progress`；任何一项失败都拒绝整批更新，不产生 Snapshot 或 revision 变化。新增项的 ID、位置规范化和 `activeRunId` 由 Runtime 写入。

现有 `WorkingMemory.plan` 继续由当前 Run 的 Trajectory 派生，不进入 Goal Snapshot，也不作为 GoalPlan 的 UI 或恢复来源。执行期的 Memory Patch 仍按原协议处理；GoalPlan 更新不能通过 Memory Patch 或聊天文本绕过 Plan Mode。该决策覆盖需求 2、3、6.1、8.2。

### 一个 Todo 对应一个 Run

`RunState` 增加可选 `todoId`。计划运行分为两类：

- 规划 Run 可以没有 `todoId`，只负责接受 `/plan` 后的计划操作并等待用户继续；它不能凭空完成任何 Todo。
- 执行 Run 由 `continue` 创建，按 `GoalPlan.items` 的 `position` 选择第一个 `pending` 项，或接受未来 UI 传入的显式 Todo ID；创建 Snapshot 时同时写入 `run.todoId`、Todo 的 `in_progress` 和 `activeRunId`。

当前 Run 完成时，Runner 的终态提交器先通过现有 Evidence Gate 校验当前 Run 的证据，再在同一 Checkpoint 把 Run 置为 `completed`、Todo 置为 `completed` 并清除 `activeRunId`。失败、取消或未通过证据时不会产生 completed Todo。未完成的 pending 项不会被 Scheduler 自动串行启动；只有下一次用户输入触发 `continue`。

普通模式允许沿用现有无 Todo 的 Run 生命周期，不 materialize GoalPlan；Plan Mode 才执行上述 Todo 绑定。这保持普通 Goal 的执行兼容，同时满足需求 1 的模式边界。该决策覆盖需求 4、5、6.2、8.1、8.3。

### Slash Command 只负责进入模式

`SlashCommandDefinition` 新增 `planCommandDefinition`，与 `/model` 一样在输入层完成名称和参数校验。`ModelCommandEffect` 提升为包含 `open_model_selector` 与 `enter_plan_mode` 的通用 Slash Effect；`CommandAwareTextInput` 的 `onSubmit` 仍不会收到命令文本。

App 把 `enter_plan_mode` 交给 Controller，而不是直接改 Goal。Controller 在 session 页面调用 Coordinator；在 intent 页面设置一次性启动模式。命令在 busy 或模型/Tool 正在执行时按稳定错误拒绝，Controller 保留未提交输入草稿。该决策覆盖需求 1.1、1.2、7.3。

### 先提交会话边界再调度

新增 `GoalCoordinator.continue(ref, newInput, control?)`。Coordinator 先 restore 最新 Goal，确认当前 Run 为 `completed`、输入非空，并在 Plan Mode 选择可承接 Todo；随后按以下顺序构造新状态：

1. 把当前 completed Run 转成不可变 `CompletedRunRecord` 并追加到 `completedRuns`。
2. 追加一条真实 user message，记录 `requestMessageIndex`。
3. 创建新的 `RunState`，设置新的 Run ID、局部 context epoch 和可选 `todoId`。
4. 追加 `run_created` 与必要的 `goal_plan_updated` 事实，提交完整 Snapshot。
5. 只有 Snapshot 成功后才调用现有 `advance`；调度异常由恢复流程读取已提交的新 Run。

Coordinator 实例内按 `goalId` 建立短时串行闸门，防止两个 completed 输入同时成功；不提供跨进程事务隔离。`resume` 仍只接受 `waiting` Run，不复用 `continue` 的 completed 入口。该决策覆盖需求 5.1–5.4、6.3、8.4。

### Trajectory 序号按 Run 独立

保持 [trajectory.ts](../../packages/runtime/src/trajectory.ts) 的既有不变量：每个 `(goalId, runId)` 独立分配 `sequence`，新 Run 从 0 开始；`committedThroughSequence` 继续表示当前 Run 的 Snapshot 边界。跨 Run 查询和 TUI 去重使用 `(goalId, runId, sequence, eventId)`，不得只使用局部 sequence。

新增的 `run_created`、`plan_mode_entered`、`goal_plan_updated` 事件只记录已发生事实；Goal Snapshot 仍是当前计划和 Run 状态的权威来源。历史读取先依据 `completedRuns` 与当前 Run 的边界筛选，再交给现有 projector，不能扫描任意轨迹文件。该决策覆盖需求 2.2、6.3、7.3。

### GoalPlan 不授予工具权限

`createModelOutputContractBundle`、系统工具声明和 Agent Prompt 接收只读的 `planMode`/`goalPlanRevision` 上下文。Plan Mode 额外暴露 `system_update_goal_plan`，解码为 `goal_plan_update`；普通模式不生成该契约分支。Runner 收到该决策时先检查 Goal 模式，再调用 GoalPlan reducer 和 Checkpoint；它不调用业务 Tool，不改变 Profile 或 Action Policy。

现有 `GoalTask` 仍是当前 Run 的执行授权与完成条件；GoalPlan item 只描述用户可见的工作规划，不替代 Tool 权限、任务批准或 Evidence Gate。该决策覆盖需求 3、6.2、8.2–8.4。

## Architecture

### 状态与事件所有权

```text
Slash Registry
  └─ PlanCommandEffect ─> TUI App ─> SessionController
                                      ├─ enterPlanMode ─> GoalCoordinator ─> GoalStore
                                      ├─ resume(waiting) ─> existing Run
                                      └─ continue(completed) ─> new Run + GoalPlan reducer

Goal Snapshot (authoritative)
  ├─ mode / GoalPlan / messages / completedRuns
  └─ current Run (todoId, status, committed boundary)

Runner + Agent Contract
  ├─ planMode=true: system_update_goal_plan is available
  └─ planMode=false: no GoalPlan operation is decoded

TrajectoryStore
  └─ facts keyed by (goalId, runId, sequence); Snapshot commit defines visibility
```

Coordinator 拥有跨 Run 的会话边界和模式切换；Runner 只拥有单 Run 的执行循环与终态证据；Storage Codec 拥有 Snapshot 的结构校验；TUI 只消费 Snapshot/通知，不维护计划副本。该分工避免把等待、继续或计划状态塞进 `transition` 的单 Run 纯函数。

## Components and Interfaces

| 组件 | 变更 | 关键契约 |
|---|---|---|
| `packages/slash-command` | 新增 `/plan` 定义和 Effect 类型 | 无参数进入；参数错误不执行；命令不进入 Goal 消息 |
| `packages/runtime` | GoalPlan reducer、模式入口、continue、Run 绑定 | `enterPlanMode`、`continue` 先保存后调度；计划操作原子化 |
| `packages/contracts` / `packages/agent` | 计划更新契约、工具声明、Prompt 投影 | 仅 `planMode=true` 暴露 `system_update_goal_plan` |
| `packages/storage` | Snapshot Schema/Codec 与当前协议校验 | `mode`、GoalPlan、completedRuns、`todoId` 缺失或非法时 fail closed |
| `packages/tui` | 命令接线、终态继续输入、PlanPanel、Run 身份去重 | waiting 走 resume；completed 走 continue；计划只读 Snapshot |

建议的 Coordinator 公开接口为：

```ts
enterPlanMode(ref: RunRef, control?: ExecutionControl): Promise<GoalProgressResult>;
continue(ref: RunRef, newInput: string, control?: ExecutionControl): Promise<GoalProgressResult>;
```

`SessionCoordinator` 同步扩展这两个方法；`GoalProgressResult` 保持 waiting/terminal/业务错误三种结果。新增公共 TypeScript 接口和方法必须按仓库规则补充中文 TSDoc 与最小示例。

## Data Models

`GoalState` 追加 `mode`、可选 `goalPlan` 和 `completedRuns`；`RunState` 追加 `todoId`；`CompletedRunRecord` 保存 `runId`、终态摘要、`todoId`、步骤数、当前 Run 的 committed boundary 与消息半开区间。`GoalPlan.revision` 从 0 开始，每次成功 patch 加 1；进入 Plan Mode 初始化空计划不视为一次 Todo patch。

Snapshot 校验规则：`mode: "plan"` 必须有 GoalPlan，`mode: "normal"` 必须没有 GoalPlan；Todo ID 唯一、position 连续且状态合法；最多一个 `in_progress`；`activeRunId` 必须指向当前 Run，当前 Run 的 `todoId` 必须存在且匹配；completedRuns 只允许 `completed`，历史消息区间连续且不重叠；每个 Run 的序号边界只能属于自己的轨迹文件。当前协议原位更新，不为开发期旧 Snapshot 增加迁移分支，缺字段直接由 Codec 拒绝。

## Error Handling

- Slash 层返回 `INVALID_ARGS`、`UNKNOWN` 或 `PLAN_MODE_BUSY`；任何拒绝都不写 Goal。
- Coordinator 对不存在/非当前 Run 返回 `RUN_NOT_FOUND`，对等待状态错误使用 `GOAL_NOT_WAITING`，对终态继续缺少输入或 Todo 使用 `INVALID_GOAL_INPUT`。
- GoalPlan reducer 对非 Plan Mode、未知 ID、旧 `baseRevision`、非法状态转换、容量超限或重复 `in_progress` 返回稳定的计划错误；Reducer 不部分应用操作。
- Runner 对普通模式的 `goal_plan_update` 视为无效 Agent 决策；Plan Mode 的更新先追加事实再保存 Snapshot，任一持久化失败都不继续下一步。
- TUI 收到不同 Goal、不同 Run 或较旧 plan revision 的通知时丢弃；恢复无法确认提交状态时保留草稿且禁止自动重发。
- Storage/Trajectory 缺失、损坏、跨 Goal 或越过 Snapshot boundary 时 fail closed，不从未提交 tail 推断 Todo 或 Evidence 已完成。

## Testing Strategy

- Slash 与后端模式：覆盖 `/plan` 无参数成功、参数/未知命令/运行中拒绝、普通模式计划操作拒绝、重启恢复模式；验证命令文本不进入 messages。
- Plan reducer 与 Snapshot：覆盖 Runtime ID、增量 patch、revision 冲突、批量原子拒绝、唯一 `in_progress`、Snapshot round-trip 和非法结构拒绝。
- Run 生命周期：覆盖规划 Run、Todo 绑定、waiting resume、completed continue、并发 continue 闸门、失败/取消不勾选、当前 Run Evidence 完成门控，以及旧 Run 来源不能成为新 Run Evidence。
- Agent/Runner：捕获 Plan Mode 与普通模式生成的工具契约和 Prompt；验证 `system_update_goal_plan` 仅在 Plan Mode 存在，Runner 主循环、Tool Policy 和现有 task approval 回归不变。
- TUI：覆盖终态输入框、PlanPanel 投影、waiting/completed 路由、首个新 Run Step、迟到通知丢弃和恢复草稿；Headless 验证 pending Todo 不会自动启动下一个 Run。
- 执行完整 `npm test`、依赖边界检查与 `git diff --check`；所有新增测试在执行阶段标记为待实现，证据写入 `tasks.md` 的 Feature Verification。

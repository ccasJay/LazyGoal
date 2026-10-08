# Run 输入与主动终止设计

## Overview

在已获批的 [职责拆分设计](../run-execution-persistence-separation/design.md) 上扩展 Runtime 的运行中命令受理与执行控制，覆盖[需求 1–8](./requirements.md)。Steer 和 Interrupt 的持久化信息仍属于 Goal Snapshot；Queue 只属于当前 Web 页面。Interrupt 中断原执行后，同一 Run 复用现有模型、工具和错误反馈路径进行有限收尾，再结算取消。

## Key Design Decisions

1. **保持一个可恢复状态和一个活动执行所有者。** 沿用基础 Spec 的 `Runner` 门面、`RunRecoveryReader` 与 `RunExecutor`。新增的消息受理记录和终止意图保存在 `RunState`；进程内控制器和活动执行句柄不进入快照。活动句柄引用执行器唯一的最新已提交 Goal，不保存第二份领域状态。对应需求 1、2、7。
2. **命令与检查点共享短暂的提交边界。** 受理 Steer、受理 Interrupt、冻结下一次调用输入和提交模型决策必须按同一 Goal 串行；模型、工具和审批等待不占用该边界。所有状态更新从执行所有者的最新提交副本构造，防止旧模型输入对应的快照覆盖新命令。维持既有事实、Patch、Snapshot、marker 顺序，不改变 Store 或提交端口的方法签名。对应需求 1、2、5、7。
3. **先持久化受理，再在模型边界应用 Steer。** 输入保留稳定消息身份，应用时一次性追加真实用户消息并更新受理记录。正在进行的模型和工具不被 Steer 中断；未产生工具效果的旧模型决策在应用新输入后重新求值，完成决策不得越过已受理输入。对应需求 1、2。
4. **Queue 保持页面内所有权。** 此项沿用用户确认：不写后端队列、浏览器持久化存储或 Goal。每条消息使用稳定提交身份，出队必须等待后续 Run 创建的持久化受理；失败或 Interrupt 暂停自动出队。后端只为已有跨 Run 输入增加持久化去重，不增加后台自动续跑。对应需求 3、4。
5. **分开控制原执行、收尾与服务关闭。** 根信号仍表示宿主关闭。Interrupt 意图提交后只中止目标 Run 的原执行控制器，随后使用受根信号控制的新调用信号进行收尾；停止期间的提交不使用已中止的原执行信号。重复请求不重新中止正在收尾的调用，也不重置预算。对应需求 5、7。
6. **复用工具错误结果和既有模型循环收尾。** 此项沿用用户在设计阶段确认的调整：未知结果记为工具中断错误，交给同一 Run 的模型核查和修复；不新增通用纠错引擎。`Observation.failure` 承载执行错误，`RuntimeFeedback` 继续只修正无效模型输出。收尾最多启动三次 `StepExecutor` 模型调用，Decide、Think、完成审查和阶段重试均计入；调用开始前保存次数，重启不重置。耗尽时保留未解决结果并取消。对应需求 5–7。
7. **只改变当前收尾目标，不改写原任务。** 原 Goal definition、Run mode 和获批任务保持原义。模型输入显式投影被中断 Action、未知效果及有限收尾目标；原任务的提案、计划更新与正常完成在收尾阶段不可提交。必要工具仍经原有发现、授权、审批和沙箱路径；收尾完成声明只结算 `cancelled`，不表示原任务完成。对应需求 5、6。
8. **按输入状态复用按钮位置。** 此项沿用用户确认：空输入时为旋转的工作/终止按钮；有输入时发起发送，在原位置展开 Steer、Queue。停止状态展示 `Stopping…`，重复终止操作不可用；不提供独立终止按钮，也不将 Enter 默认解释为 Steer。对应需求 8。

## 风险与待确认

- 风险等级：high；原因与已批准需求一致。活动执行与命令并发提交、原生工具结果配对和自动修复均涉及恢复及外部效果边界。
- 关键操作：无；不迁移旧数据、删除 Goal 或扩大权限。
- 风险：终止不是外部效果回滚；收尾工具仍可能产生新效果。次数上限可能在完成核查前耗尽，未知事实必须保留。工具仅响应自身已有的取消与资源生命周期，不能假定任意 JavaScript Promise 可被强制终止。串行边界仅保证单进程一致性，不增加跨进程租约。
- 待确认：无。现有权限需要人工审批时，收尾仍可进入审批等待；这不重新引入“用户确认未知结果后才允许取消”的步骤。

## Architecture

```text
Goal Board --steer/interrupt--> Browser command service --> GoalCoordinator
                                                           |
                                                           v
                                                   Runner control facade
                                                           |
                           +-------------------------------+
                           v                               v
                 RunRecoveryReader                Active RunExecutor
                 (read-only restore)               (one committed Goal)
                                                           |
                                             short mutation/call gate
                                                           |
                                        TrajectoryCheckpointCommitter
                                                           |
                                              GoalStore / TrajectoryStore

Goal Board local Queue --one continuation message--> existing messages route
```

活动注册表仅提供按 `goalId/runId` 查找执行器句柄的进程内入口。未持有活动句柄时，控制命令在相同串行边界内通过恢复读取组件加载最新 Goal；纯读取不调度。Steer 可以保存给尚待显式恢复的 running Run；Interrupt 是显式写命令，必要时通过现有 Scheduler 启动收尾。Web 服务仍保持现有单活动 Goal 的预约规则。

## Data Models

| 所有者 | 最小新增记录 | 恢复或去重用途 |
| --- | --- | --- |
| `RunState.steerInputs` | 按受理顺序保存消息 ID；pending 记录正文，applied 记录对应 `Goal.messages` 位置 | 同一身份不得重复追加用户消息；已应用正文由真实消息提供，避免维护第二份正文 |
| `RunState.interruption` | 请求 ID、阶段 `requested/settling/repairing/finished`、中断 Action 来源、已启动收尾模型调用数 | 区分普通关闭与用户终止，恢复原请求及预算 |
| `CompletedRunRecord.continuation` | 创建后继 Run 的消息 ID 与后继 Run ID | 原 Run 已归档后仍可对重复创建请求返回同一后继身份 |
| Web 页面 Queue | `goalId`、消息 ID、正文、顺序、queued/sending 状态和暂停标记 | 页面生命周期内串行提交；刷新后不恢复 |

记录中的 Goal、Run、Action 和消息身份在 wire、Snapshot 与 Trajectory 边界校验。同一身份携带不同正文须报冲突。`CompletedRunRecord.status` 扩展为包含 `cancelled`，`continue` 允许从该终态创建新 Run；新 Run 不继承终止意图、收尾预算或旧 Run 的完成证据。

按当前开发期策略原位更新 Snapshot/Trajectory Schema，不新增版本或旧数据兼容分支。新增公开 TypeScript 契约在源文件中补齐中文 TSDoc 和最小示例，不在本设计重复完整定义。

## Components and Interfaces

### 命令与投影

| 入口 | 输入与受理结果 |
| --- | --- |
| `POST /api/goals/:goalId/steer` | `{runId, messageId, content}`；返回同一 Run 与受理身份，重试标明 existing |
| `POST /api/goals/:goalId/interrupt` | `{runId, requestId}`；返回已保存的请求身份，不把受理等同于已停止 |
| 现有 `POST /api/goals/:goalId/messages` | 增加稳定 `messageId`；创建后继 Run 时按 continuation 记录去重 |
| 现有 Goal session 与 SSE | 投影 pending Steer、停止阶段、收尾进度与取消终态；Queue 不从后端投影 |

`GoalCoordinator` 增加控制命令入口并委派 `Runner` 门面的控制端口，`RunExecutor` 拥有活动执行的实际受理及状态提交。Browser command service 不直接修改 Goal；匹配当前活动 Run 的控制请求不被普通 `goal_busy` 门禁阻止。旧 Run、非 running 的新 Steer、已开始停止后的新 Steer 均拒绝；重复的已受理身份先返回既有结果。Queue 的页面提交不经过 Steer 路由。

### 受理、调用与提交的线性化

依决策 2，执行器通过一个短暂的 mutation/call gate 提交从最新 Goal 构造的转换。该边界同时保护原有模式选择、run_started、跨 Run continue 与新增控制提交，替换已有局部闸门的覆盖范围，不叠加第二套状态更新队列。

模型请求在该边界内冻结输入及记录调用开始，工具在其中核验 Action 与终止阶段、提交执行前事实；外部调用本身在边界外等待。输入被冻结后受理的 Steer 属于下一次请求。阶段响应仍按冻结时的 Conversation 位置和执行单元身份提交 frame；受理阶段不提前修改 `Goal.messages`，避免已有 frame 失配。

进展转换必须保留最新的输入受理与终止字段，不能保存旧 `StepExecutionInput.goal` 的完整副本。每个事实组及其 Snapshot 提交占用同一边界，控制请求不能插入部分事实组中间。提交失败后停止该活动执行，后续从恢复读取组件取得权威快照。

### Steer 应用

每次调用 Decide、Think、阶段修复或完成审查前都检查 pending 输入。应用时提交 `steer_applied` 事实、真实用户消息和 applied 消息位置，成功后重建模型输入；清除已失效的 Think/阶段修复指针，以新执行单元开始 Decide，不计为模型纠错失败或额外业务 Step。

正在调用的模型自然返回后，先按旧输入位置保存其已返回响应；若尚未执行的决策已被新 Steer 取代，保留审计事实但不执行其 Action、创建旧提案或提交终态，重新 Decide。已启动工具则先提交真实结果，再应用输入。终态提交在同一 gate 内检查 pending：Steer 先受理则完成提交被阻止；完成先提交则 Steer 被明确拒绝。未被采纳的响应不得成为原生工具结果或新 Action 的来源。

### Interrupt 与自动收尾

1. 在 gate 内保存 `run_interrupt_requested` 与 interruption 记录；成功后中止原执行信号，停止原任务的下一次调用准入。根关闭信号仍能停止受理、提交及收尾。
2. 等待原模型、Tool 或 PTC worker 的现有取消和资源清理路径结束。已取得的真实结果正常保存；未启动 Action 不产生成功或未知效果记录。已启动且结果不明的操作追加现有 `tool_attempt_failed`，原因标识中断与结果未知。
3. 复用 `Observation.failure` 记录 `TOOL_INTERRUPTED_OUTCOME_UNKNOWN`，正文明确其为执行中断、外部效果未知，`retryable: false`。它结算的是 Runtime 中断控制结果，不是假定 Tool 已返回确定失败；没有真实返回时不伪造 `tool_finished`。`observation_recorded`、执行单元投影和原生 history 配对需支持这种明确的中断结算。
4. 对 PTC，保留 program/callIndex 与已提交子调用来源，先停止 worker，再记录未结算子调用及父程序中断；父程序不重新运行。收尾模型通过恢复投影读取中断来源，随后用现有直接或程序工具路径处理必要修复，不沿旧程序续跑。
5. 有未知结果时进入 repairing；否则直接取消。收尾继续使用既有 Decide/Think、授权、Action/Observation 和模型输出修复。模型输入只把被中断操作作为当前目标，必要背景仍有来源；Runtime 禁止任务提案、GoalPlan 修改与原任务完成结算。错误结果提示先核查，不能仅凭 unknown 直接重复原操作。
6. 每次启动 `StepExecutor.decide/think/reviewCompletion` 或相应重试前保存收尾调用计数；预算上限为三次，Think 请求和完成审查同样消耗预算。适配器内部已有有界请求协议保持不变。收尾 complete 由既有完成审查核验核查/修复陈述，不以原任务完成条件验收，也不允许把未知效果作为确定结果证据。
7. 收尾 complete/fail、模型调用预算耗尽或不可继续的执行错误统一转入取消结算，保存实际收尾结果、`run_cancelled` 和 Context Epoch 关闭事实。只有成功提交后清除执行中的 pending 指针并发布终态；未知效果保留在错误记录中。工具权限审批仍走原有等待路径，批准后仅恢复收尾；拒绝则记录并结算取消。

重启后，requested/settling 先处理已提交的 Action 恢复事实，不重放结果未知的原操作；repairing 使用新调用信号和剩余预算继续。原任务的未完成 Think/修复指针必须在进入收尾前明确失效，收尾阶段自身的恢复指针仍按基础 Spec 校验。相同 Interrupt 请求只返回受理记录；不同重复请求也不重复中断或追加收尾工作。

### Queue 与 Web 交互

页面按 Goal 保存队列与暂停状态，切换会话不丢失同一页面内的队列。只有当前 Run 的 completed 投影且预约已释放才提交队首；waiting 不提交，failed 或 interruption 出现时暂停。收到后继 Run 受理身份才移除队首；响应丢失则使用相同消息 ID 和原 Run 身份重试。暂停后提供显式继续操作，下一条仍通过现有 messages/continue 路径创建新 Run。

运行中输入为空时工作按钮可点击终止；输入非空时点击发送或按 Enter，在原位置展开 Steer、Queue 两个选项，选定前不提交。Shift+Enter 换行，Tab 保留焦点导航，Escape 收起选项并保留草稿。停止阶段拒绝新 Steer，失败输入不清空；尚未生效输入、页面队列和 Stopping 状态分别呈现。旋转动画沿用减少动态效果设置，按钮保留可辨识名称、键盘焦点和 pending 请求反馈。

## Error Handling

身份失配、终态、停止阶段以及相同身份不同正文使用稳定冲突错误，客户端保留输入并刷新已提交状态。已保存快照但 marker 失败仍沿基础 Spec 停止推进；重试命令从快照核对受理记录，不重试整个提交或再次执行 Tool。诊断和 SSE 缺失不改变受理结果。

已中止的原执行控制不得传给收尾提交器。根关闭会停止整个调用链，保留最新已提交 interruption 阶段；存储或协议损坏直接报告并停止，不以模型纠错绕过提交失败。收尾模型异常采用现有有限反馈/重试机制并计入总预算；再次出现未知工具结果时保留新错误来源，预算耗尽后取消，不建立人工结果确认入口。

## Testing Strategy

- 需求 1、2：使用可控制返回时机的模型、Tool 和提交器测试受理顺序、重复身份、旧响应失效、Think/修复边界、完成竞争，以及保存后重启恢复。断言真实消息只追加一次、原 Run 身份保持不变且没有 InstantInterrupt。
- 需求 3、4：用 Web E2E 验证页面队列、逐条后继 Run、响应丢失重试、等待/失败/终止暂停和显式继续；刷新后队列丢失，后端没有自动续跑。
- 需求 5–7：对模型取消、直接工具、PTC 子调用和宿主关闭注入中断；验证错误 Observation 和原生工具配对不伪造效果，同一 Run 收尾复用现有执行器、权限与审批，剩余预算跨重启保持，最终 cancelled 可创建新 Run。
- 需求 8：覆盖按钮原位切换、选择前无提交、空输入终止、草稿保留、顺序展示、Stopping 反馈、键盘与减少动态效果设置。
- 风险检查：故障注入覆盖命令受理及收尾各提交阶段，核对单一最新快照、依赖方向、普通/Plan Run 回归、Schema/公开契约与架构文档同步。具体命令和逐项验收证据留给 Tasks。

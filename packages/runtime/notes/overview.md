# Goal Runtime

Goal、Run、Step 状态转换及持久化、调度、恢复和工具授权。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 摘要

Runtime 是控制平面：拥有 Goal/Run/Step 状态、Run 模式与 GoalPlan、统一推进循环、Trajectory、结构化 Working Memory 和持久化 Port。它不构造 Prompt、不解析供应商格式或直接读写项目文件；文件授权身份解析只读取路径元数据，不读取文件内容。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../src/domain.ts) | Goal definition/state、Run 模式与获批 Task、Action/Observation 和交互等待契约 | I/O 和模型调用 |
| [Launcher](../src/launcher.ts) | 校验输入与协议、冻结 Profile、创建并保存 Goal、启动 Coordinator | 恢复已有 Goal |
| [GoalCoordinator](../src/goal-coordinator.ts) | 统一推进、Run 模式选择、waiting resume、Tool Grant 审批/撤销、completed continue、提交等待点并委派 Scheduler | 直接执行 Tool |
| [Runner](../src/runner.ts) | 保持 RunScheduler 调度入口并委派执行器 | Goal 状态推进和恢复读取实现 |
| [RunExecutor](../src/runner.ts) | 持有单次活动执行的最新已提交 Goal，负责模型决策、Tool 授权、Action/Observation、PTC、Evidence 和 Run 转换；恢复历史经只读 reader 获取，检查点经共享提交器写入 | 供应商协议和 UI |
| [RunRecoveryReader](../src/run-recovery-reader.ts) | 按 Goal/Run 身份恢复最新快照，按 Snapshot 提交边界读取 Trajectory | 推进 Run 或写入持久化 |
| [WorkingMemorySession](../src/working-memory-session.ts) | 按 Snapshot 边界重建临时 Working Memory，校验 Patch/Evidence | 保存 Memory 内容到 Snapshot |
| [TrajectoryCheckpointCommitter](../src/trajectory-checkpoint-committer.ts) | 统一事实、Patch、Snapshot 和提交 marker 的顺序；gate 内只读取一次最新 Snapshot 并通过 `prepare(latest)` 复用给前置检查或状态构造；在保存前按原提交事实确定新消息位置；维护 Goal 提交修订并在未声明会话权威时保留最新会话状态 | 业务分支和模型调用 |
| [SessionInputAdmission](../src/session-admission.ts) | 在共享短提交边界内持久化受理会话输入、按 `inputId` 与载荷摘要去重、维护输入账本与待处理消息队列、返回稳定收据 | 推进 Run、调用模型或工具、调度后继 Run |
| [SessionManager](../src/session-manager.ts) | 创建/只读连接长期 Session、单活动 Goal 执行名额、被追踪的后台执行与安全状态投影 | 复制执行循环、直接执行 Tool、跨进程租约 |
| [Session](../src/session.ts) | Goal 句柄：读取安全状态、受理输入、查询收据、解除连接 | 拥有实例关闭权、改写 Goal 快照 |
| [Goal mutation gate](../src/goal-mutation-gate.ts) | 按 Goal 串行化读取与 Snapshot 提交的进程内短边界，允许同一异步调用链安全重入 | 承载模型、工具或人工等待 |
| [GoalStore](../src/goal-store.ts) | 保存/恢复最新 Goal Snapshot | 历史查询和文件格式 |
| [GoalCatalog](../src/goal-store.ts) | 扫描正式快照目录返回 Goal 摘要；历史扫描跳过无法解码的快照并计数上报，恢复用途的可恢复扫描保持失败关闭 | 快照写入与文件格式 |
| [RuntimeLifecycle](../src/lifecycle/runtime-lifecycle.ts) | 实例关闭：冻结 Checkpoint Gate、中止实例控制器，并按期限结算已受理操作与自有资源 | Agent/Storage 实现、HTTP、进程信号与宿主退出 |
| [ManagedResourceRegistry](../src/lifecycle/managed-resources.ts) | 实例自有资源的注册、正常/强制关闭与失败原因保留 | 具体资源的内部句柄和退出算法 |
| [Model Call Metrics](../src/model-call-metrics.ts) | 模型调用开始/结束事实、请求/解码计时、用量覆盖标记及追加/读取 Port | Goal 恢复状态、指标汇总与诊断 Trace |
| [RunStage](../src/run-stage.ts) | Run 内部阶段声明、修订与流转纯规则、前序接受约束与审查拒绝记录 | 执行调度与模型调用 |
| [RunPlan](../src/run-plan.ts) | Plan Run 完整路线的 Runtime 身份分配、顺序游标及阶段状态流转 | 模型复杂度判断与 I/O |
| [Trajectory](../src/trajectory.ts) | 追加事实事件、提交 marker 和只读恢复查询；`read` 全量校验，`readAfter` 仅向已持有已校验前缀的调用方提供后缀增量读取 | 改写 Runtime State |
| [Trajectory query](../src/trajectory-query.ts) | 浏览器查询的水位上下文、事件关联、有界摘要，以及分页／详情／执行单元／时间线查询 Port | 写入事实、索引实现与 HTTP 投影 |
| [Tool Core](../../tool-core/src/index.ts) | 通用 Tool 接口、输入 Contract 准备、Registry 与暂时故障分类 | Goal/Run 状态与授权策略 |
| [Tool contracts](../src/tool.ts) | Tool Policy 边界、授权过滤与运行时上下文绑定 | 具体 Tool 业务逻辑与通用输入准备 |
| [Tool Grant](../src/tool-grant.ts) | 将已验证的 Tool 输入映射为按操作匹配的持续授权身份，并定义授权 Store Port | 执行 Tool 或绕过 Profile、输入、Policy 校验 |
| [Context Retrieval](../src/context-retrieval.ts) | 历史查询校验、边界门禁及向 `@lazygoal/context-retrieval` 委托的适配层 | 读取当前 Workspace/Environment |

阶段工具的编号和版本来自模型请求的 Run 快照。Runner 在接受阶段结果和提交检查点时核对阶段身份、revision、status 与路线 revision、游标；请求期间状态变化则丢弃旧结果、清除旧纠错链并从权威快照重新决策，不将旧命令绑定到新阶段。恢复输入边界包含同一阶段状态指纹；阶段持久化事实、审查和审批规则保持由既有提交路径负责。

## 状态与推进

正式消息保存稳定身份、来源、所属 Run 和 Run 内位置。位置锚定消息原始提交边界中最后一条已提交事实；首条事实前为 0，同一锚点按 Snapshot 顺序编号。恢复与会话摘要复用已保存位置，不从到达时间、Step 或未提交 Trajectory tail 推断。Goal 创建时只存在首个 Run，因此创建路径把初始消息集统一归属该 Run，并按初始次序分配 `afterSequence: 0` 的连续 `order`；调用方不能在创建时指定消息的 Run 归属或位置。恢复输入按最近一次恢复事实锚定，不会回退到更早的恢复事实。

Goal workflow 只有 `phase: "executing"`。Goal 是可持续恢复的会话聚合，保存完整 messages、独立 GoalPlan、可选的一次性 `nextRunMode` 和 `completedRuns`；Run 是一次执行边界，保存自己的 `mode`、可选 `approvedTask`、Plan Run 可选的 `planRoute`、`status`、`stepCount`、最新 Step、等待点、Context Epoch、Trajectory 提交边界和 Working Memory revision。`planRoute` 只在获批 Plan Run 上保存完整有序阶段、状态和恢复游标；普通 Run 与待审批 Run 不包含该状态。GoalPlan Todo 不绑定 Run；同一 Run 可依次更新多个 Todo，结束时未完成项保留原状态。

每条正式消息都带稳定 `messageId`、所属 `runId` 与判别式 `source`；助手消息另有 `purpose` 区分 `process`（模型公开过程正文）、`answer`（被审查接受的最终答复）与 `notice`（等待、失败等 Runtime 通知）。[GoalMessage](../src/goal-message.ts) 拥有身份分配、来源比较键与同源幂等追加：同一来源重试返回已提交的原消息身份，同一来源正文不一致时明确失败且不覆盖已提交正文；正文相同但来源不同的消息保持为两条独立记录。来源同时是后续按模型调用与内容块判定原生历史去重的依据；没有模型调用身份的执行方只使用真实执行来源，不虚构模型调用或 Provider 块身份。

模型在同一次响应中同时给出公开正文与工具调用时，`model-execution` 按块顺序携带公开正文块，Runner 在响应通过现有阶段检查并被接受后把每段正文保存为独立的过程消息，并与随后的决策事实一起提交。响应失败、工具参数无效或完成候选被审查拒绝时这些正文不落盘；工具进入审批等待或随后失败时，已提交的过程说明保留且不构成成功证据。推理内容、结构化协议 JSON 与工具参数都不保存为正文。

无参数 `/plan` 通过 Coordinator 为尚未提交 `run_started` 的当前 Run 选择 Plan 模式；当前 Run 已完成或失败时，它将 Plan 作为下一 Run 的一次性选择持久化。新 Run 缺省使用普通模式并消费待用选择。模式只属于 Run，GoalPlan 可在任意模式下存在并继续读取。

waiting 输入调用 `resume` 并保留当前 Run；浏览器可从 AskUser 表单取消当前询问。Runtime 清除该待处理交互，记录询问取消事件，并将“跳过此询问、继续当前任务”的控制消息交给同一 Run；Run 不会因此进入取消终态。completed、failed 或 cancelled 输入调用 `continue`，在追加用户消息前归档上一 Run 的终态、保存新 Run，再交给现有 Scheduler。失败 Run 不会原地恢复；只有用户提交新输入才会创建后续 Run。未完成 Todo 不会自动推进。

运行中的 Run 可通过 `Runner.steer` 按稳定消息身份持久化接收补充输入；受理只表示 Snapshot 已保存，不会中断当前模型或 Tool。Runtime 按当前 Run 内的受理顺序，在下一模型边界将消息追加到 Goal Conversation 并记录应用位置。Steer 受理与 Run 检查点共用按 Goal 的短暂提交边界：若受理先于旧模型决策提交，旧决策会被丢弃并以新输入重新采样；已开始的 Tool 先提交真实 Observation，再应用 Steer。`RunState.steerInputs` 区分 pending 正文和已应用消息位置，重启后 pending 项仍属于同一 Run，且应用记录防止重复注入。

会话受理路径把 Steer 同时写入统一输入账本：`SessionManager` 先按 `inputId` 与规范化载荷摘要判定重复与身份冲突，再委派执行所有者；提供账本条目时，受理事实、`RunState.steerInputs` 与账本记录在同一 Snapshot 提交中写入，应用时在同一提交中标记为 `applied` 并记录消息位置。提供 `queueBinding` 时，Runtime 在同一提交中核对队列修订与来源正文、移除该排队消息并标记原消息已清除，再写入 Steer；修订过期或原消息不匹配时明确拒绝。目标 Run 非 running、已进入 Interrupt、旧 Run 或身份冲突时明确拒绝，不写入收据，也不降级为普通队列消息。

会话输入受理由 [SessionInputAdmission](../src/session-admission.ts) 拥有：它在 [Goal mutation gate](../src/goal-mutation-gate.ts) 内读取最新快照并提交单次变更，先按 `inputId` 与规范化载荷摘要判定重复受理或身份冲突，再校验文本额度，然后追加 `GoalState.inputLedger` 记录与 `messageQueue` 队列项。`queue_control remove` 按队列修订删除单条待处理消息并将其账本状态标记为 `cleared`；Steer 来源绑定在 Run 执行所有者内与队列变更一同提交。受理成功只表示输入已保存，不表示消息已应用、工具已停止或 Run 已完成；受理本身不调用模型或工具。保存失败或结果不明时抛出 `SessionInputAdmissionError`，调用方必须使用原 `inputId` 查询或重试。普通消息与 Steer 共享单条 64,000、128 项与合计 1,048,576 个 UTF-16 code unit 的额度；中断、回答、恢复与队列清空不受文本额度阻塞。

会话模块把交互回答与显式恢复接入同一输入边界：`respond` 先核验 Goal、Run、请求及必要 Action 身份，再委派既有 Coordinator 等待恢复规则；匹配回答只推进对应等待，旧请求、错身份或载荷冲突不解除等待也不写收据。`resume` 必须匹配最新 Run 与当前 Goal 提交修订：等待交互时报告所需交互，失败导致的队列暂停时拒绝并要求显式继续队列，只有可恢复的当前 Run 或已受理队首才唤醒执行所有者。已受理的 Interrupt 若因进程中断而尚未完成取消结算，`resume` 只重新唤醒该 Run 完成取消结算，仍保持队列暂停；它不代答等待，也不解除队列暂停。新 Run 启动前后台执行在推进与创建后继 Run 前按最新快照的 `modelSelection` 重新对齐模型 Binding，避免继承另一个 Goal 的进程绑定。

`GoalModelSelection` 为登记的 OpenCode Go 动态模型保存 `executionApi`、上下文容量与输出上限，供进程恢复时重建同一执行协议。浏览器只提交模型 ID 和可选 Provider Profile ID；执行 API 与容量由服务端目录解析。该领域状态不保存 Base URL 或凭据，Adapter 的连接配置由宿主按 Profile 身份重建。

[Session](../src/session.ts) 句柄提供 `read`、`send`、`consume`、`events`、`getInput` 与 `detach`：所有操作委派同一 Runtime 状态所有者，句柄自身不改写快照、不拥有实例关闭权。`consume` 逐条等待持久化受理结果后才读取下一项，不等待业务执行结束；业务拒绝作为输入结果继续消费，保存或受理基础设施失败时停止该来源、不预取后续项并报告原始错误。停止消费或解除句柄后，迟到的 `next()` 结果不再受理，来源资源归宿主；不合作的 `next()`／`return()` 不会阻塞停止或关闭。`sessions.query` 是同一执行链上的单消息封装：等待指定 Run 到达等待或终态后返回真实结果与可恢复身份，等待交互时立即返回，只释放自己的资源，不关闭借用实例。`SessionManager.close` 先停止订阅、输入消费与核对任务，再按可选期限结算后台执行；期限届满时抛出 `SessionManagerCloseError` 并保留未结算的 Goal 身份，不报告安全关闭、不伪造 Run 取消。

会话输出由 [GoalSessionStream](../src/session-stream.ts) 提供：`session.events()` 调用时先向事件 Core 注册 Goal 范围缓冲，再在同一提交协调边界读取一致快照，首项输出 `state_sync` 与 Goal 提交修订，随后按来源顺序交接缓冲。已由同步状态覆盖的旧提交通知去重，旧执行单元的暂时增量被丢弃，当前调用的增量按来源顺序保留；模型或工具分片不会被当作已提交结果。输入受理与拒绝以 `session_input_result` 控制事件发布并按 `inputId` 关联；Run 结束与切换不关闭订阅。

输出语义由 [会话输出分类器](../src/session-output.ts) 拥有：[`SessionOutputEvent`](../src/session-output.ts) 是可辨识联合，成员为 `state_sync`、`input_result`、`generation_event`、`message_committed`、`tool_activity`、`interaction_required`、`interaction_settled`、`run_status`、`run_result`、`stream_fault`、`commit_boundary` 与 `closed`。分类器只依据来源事件自身的事实：公开生成、工具活动与分组边界在 Runtime 内判定，Browser 与 wire 只做受授权的序列化，不再按任意 `kind: string` 猜测业务；reasoning、结构化协议 JSON、工具原始参数与私有阶段输出不进入公开信封。模型开始事件只保留白名单调用阶段、调用身份与执行单元，来源未提供的元数据不推断；工具输入摘要可包含有界 Bash 命令，不包含环境或其它任意参数。`state_sync` 同时携带当前等待的规范交互引用与已提交消息的有界范围（总数、末尾身份与最近摘要）；同步时新出现的消息按稳定身份发出 `message_committed`，新建立的等待发出 `interaction_required`，重复同步不追加第二条通知。`commit_boundary` 携带本批次 `eventTypes` 以及来源可用的 `actionId`／`executionUnitId`，消费者据此声明实际变化范围；工具活动事件在来源提供时携带执行单元，使同一 Action 的尝试与结果保持稳定身份。

存在订阅时，[GoalRevisionMonitor](../src/session-stream.ts) 按不超过一秒的间隔（默认 1000ms，可注入定时器与间隔）合并核对被观察 Goal 的最新提交修订，弥补末次提交通知丢失；没有观察者时停止核对，核对只读、不调度执行。读取失败作为同步故障报告，不伪装业务结果。订阅队列沿用 Core 的有界背压：控制事件无法保留时订阅以 `backpressure` 结束，执行不受影响；退出迭代或解除句柄只释放该订阅自己的队列与监听。

完成候选由模型执行层在完成审查之前作为旁路预览发布，因此始终未确认：预览不授权工具、不代替审批、不作为完成证据，也不进入 Snapshot 或模型上下文。审查拒绝、Steer 到达使旧决策被弃用、Interrupt 被受理或出现新候选时，Runtime 明确发布作废通知（`candidate_invalidated`）；候选作废不等同于 Run 失败，也不改变既有重试与纠错预算。只有完成审查接受、且对应答复消息随决策提交保存成功后，正式消息才以 `answer` 用途出现，并通过 `message_committed` 通知关联回被替换的预览来源。

[会话消息查询](../src/session-message-query.ts) 提供按稳定身份的有界只读能力：`queryGoalMessages` 按 `throughMessageId` 固定区间、按 `afterMessageId` 追加翻页，页大小默认 50、最多 100 条；`readGoalMessageBody` 每次最多返回 64,000 个 UTF-16 code unit 的正文，并给出截断标记与后续位置。截断边界不落在 Unicode 代理项中间。未知或跨 Goal 的身份明确不存在，读取失败不与空页混淆；所有读取都不调用模型或工具、不写任何状态。

`GoalState.commitRevision` 是 Goal 级单调提交修订，跨 Run 递增，由 Launcher 的首次保存与 `TrajectoryCheckpointCommitter` 的每次成功提交维护。基于旧快照的执行提交在提交边界重新读取最新修订：未声明会话权威时沿用最新快照的输入账本与消息队列，避免旧快照覆盖并发受理。

[SessionManager](../src/session-manager.ts) 拥有长期会话的创建、只读连接与实例级执行名额。`sessions.create` 先持久化 Goal、首条用户消息、Run 与首条收据（`createGoalCheckpoint` 复用既有 Launcher 校验、Profile 冻结与首次提交），再返回句柄并以被追踪的后台任务推进首个 Run；返回不等待 Run 完成，首次保存失败不会调用模型或工具。相同 `goalId` 与首条输入身份／载荷的重试只连接原 Goal：不推进 Run，也不把创建重试当作恢复指令。`sessions.open` 只读取快照并投影安全状态，不推进、不消费队列；缺失 Goal 返回 `GOAL_NOT_FOUND`，损坏快照返回 `GOAL_UNREADABLE`。

一个实例同时只运行一个 Goal：其他 Goal 的新执行、交互推进与输入受理返回 `BUSY`，不会进入全局调度队列；活动 Goal 的输入受理、读取与控制不等待其长调用。模型或工具等待期间不持有 Goal 短提交边界。后台执行异常被观察并保留真实恢复状态（Run 保持 `created`／`running`，状态投影报告 `needsRecovery`）；重建实例后的只读连接与新的普通消息都不会自动恢复执行。

同一执行所有者在 Run 结束后继续消费持久化队列：Run `completed` 且队列未暂停时，按 FIFO 为队首消息创建后继 Run——归档旧 Run、追加真实用户消息、创建新 Run 与应用队首输入在同一 Snapshot 提交中完成（`GoalCoordinator.continue` 的队列绑定），因此崩溃或响应丢失不会重复创建 Run。Run `waiting` 时队列不出队、不启动后继；Run `failed` 或用户 Interrupt 结算为 `cancelled` 时持久化队列暂停（`run_failed`／`user_interrupt`）并保留尚未应用的消息，已有积压消息时，新消息只追加到队尾，须显式 `queue_control continue` 解除暂停并从原队首启动；Run 已结束且队列为空时，受理新消息会在同一 Snapshot 提交中解除暂停，随后由执行所有者创建后继 Run。`queue_control clear` 只清除尚未应用的普通消息：保留收据、真实对话和当前 Run。

用户 Interrupt 通过稳定请求身份持久化到 `RunState.interruption`，并同时暂停该 Goal 的消息队列（`user_interrupt`）与写入统一输入账本收据，再中止目标 Run 的进程内信号；受理不等待停止完成，宿主关闭仍使用独立调用信号。已开始但结果未知的直接 Tool 或 PTC 操作会写入不可重试的失败 Observation 和原 Action 来源，原操作不重放。RunExecutor 不再调用模型或执行核查/修复工具，直接在同一提交中保存未知结果事实与 `run_cancelled` 并结算 `cancelled`。该终态可通过 `continue` 在同一 Goal 创建新 Run。普通服务关闭不会创建 Interrupt 记录。

Runner 将调度契约委派给 RunExecutor；RunExecutor 按当前 Run 模式和获批任务推进：

- 普通 Run 直接以当前用户请求为目标，不等待任务提案；完成声明按当前 Run 已提交的 Tool/Observation Evidence 校验。
- Plan Run 未批准时，Runtime 只向模型暴露 `isReadOnly === true` 的业务工具，并在 Action 准备入口拒绝其他工具；提案等待前可继续只读调查。该 Run 在获批前不能完成。
- 提案进入持久化的 `task_approval` 等待点后停止模型和 Tool 调用；反馈使旧提案失效并重新请求，批准后将任务保存在当前 Run 的 `approvedTask`。
- 获批 Plan Run 可调用已授权业务 Tool，并按获批任务的完成条件校验证据。GoalPlan 写入由 Run 模式能力授权；计划状态本身不授予业务 Tool 权限。
- 各模式中的 Tool 调用统一沿用 Tool Registry、Action ID、Policy、Trajectory 和 Observation 提交路径。
- 每个 Run 从空 `exposedToolIds` 开始。Decide 的 `system_find_tools` 只搜索 Profile/Registry 授权交集：明确提及 Tool ID 或发现别名的结果优先，其余按关键词命中数和 Profile 顺序稳定排序，最多返回 5 项；Runtime 将命中 ID 累积到 Run 并计入一次 Step。别名不进入返回值或模型 Schema。Schema 暴露不授予执行权：直接 Action 和 PTC 子调用仍须命中该 Run 的暴露集合，再经过现有 Profile、Registry、输入、Policy、审批和沙箱检查。
- 默认本机 Profile 授权 `execute_program` 时，模型可显式选择程序调用；Runner 将程序作为一个父 Step，在独立 Seatbelt worker 内运行 JavaScript。每个内部业务 Tool 调用重新经过冻结 Profile、输入 Contract、Policy、Grant 和原有审批路径；程序入口的许可不授予内部操作。子调用按顺序提交，模型只收到父程序的显式返回或失败。
- Policy 要求人工审批的 Action 可获准一次、当前 Goal 或当前 workspace。Goal/workspace Grant 支持 Tool Grant 与通用 Sandbox Grant：Sandbox Grant 泛化为 `{ toolId, inputDigest, scope, version: 1 }`，绑定规范化输入摘要与沙箱能力范围，不再硬编码仅限 bash。持续授权始终在 Profile、输入与 Policy 校验之后查询；YOLO 自动批准不生成持续 Grant。
- Runner 调度 Tool 时注入可信的 `ToolExecutionContext: { goalId, runId }`；Tool 可选实现 `resolveSandboxAccess`，在准备完成、授权之前派生真实资源范围。显式 Profile 与冻结 Profile 保持工具集合不变，默认 Profile 使用统一的默认工具集同源入口。
- `ask_user` 进入带 request ID、模式和问题列表的等待点；完整逐题答案、非空整体回复与显式跳过是互斥响应，都在同一提交内写入真实用户消息、响应事实与输入收据后恢复 Runner。整体回复与跳过不被解释为结构化批准，带路线扩展的问卷仍只认既有批准选项。等待点同时暴露只读的类型化交互视图：由种类与既有请求身份派生稳定 `interactionId`，公开可用决定与字段级截断标记；完整问题、任务范围与 Action 输入经按引用核验的详情读取返回，读取不推进等待。
- 会话边界提供 `attachInteractionHandlers`：同一 Goal 只允许一个自动所有者，按请求引用去重并在提交 Gate 外调用宿主函数；连接只做一致同步，历史等待须宿主显式 `resume` 解锁才投递。处理函数故障、业务拒绝、提交不明（先按冻结 `inputId` 核验收据）、迟到结果、解除连接与有界关闭都不会默认批准或拒绝，也不撤销已经受理的决定。
- 阶段化 Executor 在单个 Step 内由 Runner 管理 Decide/Think 循环。每次 `request_think` 先和 Decide frame 提交；Think 输出和 Think frame 另存为已提交事实后，Runner 才再次 Decide。Think 不增加 `stepCount`，不执行 Tool；只有最终有效 `AgentDecision` 进入既有转换、授权和证据校验。

中间阶段完成候选与 Run 最终完成候选均须先经过协议、语义、阶段状态和 Evidence 引用校验，再调用必需的 `StepExecutor.reviewCompletion`。输入包含当前阶段说明、修订及同一 Run 前序已接受阶段的历史原始证据，消除成对 Observation 重复正文；最终完成审查在同一次调用中兼顾局部阶段与用户整体交付。审查接受后才提交对应阶段结果或最终完成；无效候选在调用审查前被确定性门禁拦截。该审查不替代工具授权、任务批准或 Benchmark 环境评分。

每次下游模型或 Tool 调用前，Runtime 先保存所需事实和 Snapshot。完成声明必须引用已提交的 Tool/Observation Evidence；用户回答本身不能成为完成证据。运行时错误、协议错误、身份不匹配和旧 Snapshot 均 fail-closed。

Runner 和 GoalCoordinator 可通过 [`@lazygoal/execution-stream`](../../execution-stream/notes/overview.md) 发布旁路事件。`step_started` 在 Executor 调用前发出，阶段事实与上下文 frame 在进入下一模型阶段前先提交，Tool 生命周期由 Runner 发出；事实提交成功后发出 Trajectory 事件和 `step_committed`。发布异常被隔离，不改变 Runtime 状态或提交顺序。实时事件不是恢复来源，恢复仍读取 Snapshot/Trajectory。

模型调用指标使用独立 `MetricsStore` 与覆盖标记 Port：开始/结束事实不进入 Goal、Trajectory 或恢复状态。Agent 在实际适配器请求边界用单调时钟记录端到端请求耗时，并可另行记录流式首文本后的解码耗时；查询投影由 `session-metrics` 根据最新 Goal Snapshot 与指标事实归约。指标写入失败不得改变 Goal 执行结果。

## 工具审批修订与未知结果重执行

[审批修订规则](../src/action-approval.ts) 拥有首次审批与结果未知恢复的两类决定边界。首次审批只接受尚未开始执行的等待：审批者可为同一工具提交最终参数版本，原请求引用与最终 canonical 参数作为同一逻辑 Action 的执行版本一并冻结，获批后不可再编辑；原模型响应、程序请求与 `action_staged` 事实不被覆盖。执行、授权激活、沙箱计划与恢复都从该执行版本取实际参数。

`GoalCoordinator.reviewActionApproval` 是只读预检：它重新准备参数、规划执行准入、权限与沙箱范围并返回原参数、最终参数、实际目标与能力变化以及审阅指纹，不保存批准、不暂存或激活 Grant、不解除等待，也不调用业务工具。确认修订时在同一提交边界重算并比对，内容不一致时明确拒绝并要求重新审阅。

首次批准、修订批准与结果未知的重执行是三条互不消费对方等待的决定分支：首次批准只作用于首次审批等待；重执行绑定本次未知结果等待的恢复身份，只允许按获批版本再次执行，不携带新参数或持续授权期限；拒绝再次执行保留此前效果未知的事实，不把原操作记作未执行、已回滚或成功。同一 Action 再次产生未知结果时恢复身份改变，旧决定不能授权新一轮。

持续授权按最终已验证参数与能力范围生成匹配器，并以来自会话输入的稳定批准身份作为事务来源；同一决定同内容重试复用同一条暂存记录，不同决定的未提交 pending 可以并存，但只有被已提交批准引用的一条会被激活。

## 实例生命周期与资源所有权

[RuntimeLifecycle](../src/lifecycle/runtime-lifecycle.ts) 的状态为 `open`、`closing` 与 `closed`。首次 `close()` 同步进入 `closing`：拒绝新的 `beginOperation` 受理、冻结 Checkpoint Gate、中止明确交付的实例控制器，然后依次执行正常和强制清理，请求 [ManagedResourceRegistry](../src/lifecycle/managed-resources.ts) 结算资源，并等待已受理操作与已进入保存边界的写入。两个阶段各以 `gracePeriodMs` 为上限，默认各 2 秒。

只有已受理操作、写入与自有资源全部确认结算时 `close()` 才报告成功并进入 `closed`；超时、资源拒绝或未确认结算抛出 `RuntimeLifecycleIncompleteError`，按 `operations`、`writes`、`resources` 类别携带原因，状态保持 `closing` 且重复 `close()` 返回同一失败结果。关闭不创建用户 Interrupt、失败或取消终态，不改写 Goal 快照，也不代表未结算副作用已回滚。

`ManagedResource.close()` 成功返回表示该实现拥有的资源与必要写入已结算，拒绝表示清理失败且原因保留在注册表，未完成表示尚未确认活动停止。正常阶段失败或未完成的资源在强制阶段升级处理；强制成功可替代正常阶段的失败记录并移除资源，强制拒绝或未完成则保留身份与原因，状态不可重新受理。资源注销同样丢弃其失败记录，因此空注册表一定表示全部确认结算。

Gate、控制器与注册表由资源所有者创建并交付实例；宿主借出的 Adapter、Policy、Store 与宿主信号不在交付范围内。`ExitPort`、`ProcessExitPort`、进程信号与退出码属于 `goal-server` 宿主适配层，Runtime 不导入它们。`scripts/check-dependencies.mjs` 强制 `src/lifecycle/` 不依赖应用、模型或具体存储实现，也不直接请求进程退出或注册进程信号；目录之外的源码只能通过 `lifecycle/index.ts` 入口访问。

## 恢复与持久化

Runner 的恢复读取委派给无写入能力的 RunRecoveryReader。它不缓存第二份 Goal，也不触发调度；RunExecutor 消费经过身份校验的最新快照和 Snapshot 边界内轨迹事实，仍是唯一推进活动状态的一方。Trajectory 是恢复事实源，Snapshot 的 `committedThroughSequence` 是当前 Run 的可见边界，`memoryRevision` 是 accepted Memory Patch 链头。模型成功响应后可随共享提交器保存 `model_context_frame`，记录请求阶段、Epoch、Conversation 插入位置，以及实际发送的 Section 文本和对应结构化投影；该 frame 不写入 Goal Conversation，也不替代其他 Trajectory 事实。恢复查询只接受 Snapshot 边界内、Goal/Run/阶段/Epoch/Conversation 起点匹配且 Section 身份仍与当前注册表一致的 frame；未知或身份不匹配的 Section 不能成为比较基线。每个 `(goalId, runId)` 有独立的 Trajectory 序号；跨 Run 历史查询必须携带完整 Run 身份。`completedRuns` 记录已归档 completed、failed 或 cancelled Run 的终态、消息区间和提交边界；浏览器消息创建后继 Run 时，还会把稳定 message ID、正文和 next Run ID 一并保存为重试收据。该收据不改变当前 Run 的 Evidence 所有权。`WorkingMemorySession` 只沿可达 revision 链重放已提交 Patch，并拒绝跨 Goal/Run、断链、循环、越界或不匹配的事实。

`pendingInteraction` 保存问卷或任务提案的完整请求、模式和关联 ID；Plan Run 的任务提案还保存待审完整路线候选。获批任务和权威路线保存在当前 Run，恢复时必须验证 Goal、Run、request ID 与等待状态一致，审批前候选不会被误读为已执行路线。`pendingAction` 按 Tool 的 replay policy 分为安全重放或 `outcome_unknown` 人工确认，并在 Action 获批后记录授权期限与可选 Grant ID。暂存时记录的 `executionUnitId` 在批准恢复后继续用于 Tool 生命周期事件，使 Decision、审批、执行与 Observation 保持在同一执行单元。`safe` Tool 只有显式抛出 `TransientToolExecutionFailure` 才会在同一 Action 内自动重试；每次调用前先提交 `attemptsStarted` 和 Trajectory 事实，最多三次且不增加 Step。普通异常按稳定错误失败，`retryable` Observation 仍作为已知业务结果提交，不单独触发重放。`manual` Tool 异常将该 Action 保存为 `outcome_unknown` 并进入等待，后续只能由用户对原 Action 作出单次恢复选择。Goal/workspace Grant 先以来源 `(goalId, runId, actionId)` 写为 pending，再提交批准事实和 Snapshot，之后才激活并调度；若激活中断，`advance` 必须核验快照身份、授权范围和重新派生的操作匹配器后再恢复激活。pending Grant 从不放行新 Action；撤销立即影响后续查询。`pendingThink` 保存当前未完成 Step 的 Think 输出恢复指针；`pendingModelRepair` 保存 Decide/Think 阶段输入边界、已开始尝试次数及最新尝试和反馈事件身份。模型阶段纠错先追加 Trajectory 事实再提交 Snapshot，恢复只读取已提交反馈，并校验 Goal、Run、执行单元、Step、阶段和输入摘要；Think 恢复还校验原请求目标。每条阶段纠错链最多尝试三次（含首次），Decide 完成候选的协议失败和审查拒绝共用此计数，崩溃中的已记次数不会重复使用。未提交输出不进入恢复历史，身份或输入失配会 fail-closed。有效决策提交时清除相应阶段恢复指针。审查拒绝复用已提交反馈恢复，未完成审查不保存候选接受状态，恢复后需再次审查。当前开发期协议不迁移旧字段；Storage 对旧阶段和旧事件显式拒绝。

`pendingProgram` 保存父 Action、代码和 worker 身份、固定计算输入、已提交子调用位置与结果字节数。子调用事实以 `programId/callIndex` 标记并留在 Trajectory 审计账本；原生模型历史、Hot/Warm 与检索索引跳过这些内部事实。每秒活动预算在 worker 运行前追加并同步持久化 `program_time_reserved`，恢复时连未提交 tail 中的预留也计入 120 秒总额；审批和关闭期间不继续预留。审批或宿主关闭后重新运行同一代码，只重放 Snapshot 边界内匹配的结果；未提交的写入结果不得视为完成，已经开始而结果未知的非只读调用必须人工确认，即使该 Tool 声明 safe。取消或资源失败遇到未结算写入时先保存 `pendingStop`，处理未知结果后再结算原停止原因。恢复时若程序身份或 Trajectory 不满足回放契约，Runner 将仍在执行的 Run 明确结算为 `failed`；真实宿主关闭或中断仍保留可恢复状态。程序本身不提供外部副作用的 exactly-once 保证。

获批 Plan Run 通过路线游标控制逐阶段执行：模型只能声明下一个待执行阶段，阶段接受先同步更新路线状态再继续 Run；非最终阶段接受不结束 Run。路线修订保留仍然有效的已接受结果；同范围修订在检查点提交，扩大范围时先持久化等待用户决定的候选，批准后再修订和继续原 Run。恢复从 Snapshot 中已提交的路线及阶段事实继续，不再次批准任务或重放已接受阶段的副作用。

## 关键错误边界

- Agent 解析/输出契约与 Runner 的决策、Tool 选择/输入、Evidence 校验会生成类型化 `RuntimeFeedback`，只包含有界路径和安全提示，不包含原始模型输出；错误在 Action 副作用前被发现。Runner 提交反馈后在原阶段重试，单条纠错链最多三次阶段尝试（含首次）；失败耗尽后以稳定错误结束 Run。
- Tool 未授权、未注册、输入不合法或 Policy 拒绝时，不调用 Tool，并追加相应稳定结果。
- Snapshot、Trajectory 或协议校验失败时，不继续模型/Tool 调用；保存失败保留最近已成功快照。
- 模型调用的限流、暂时性服务、连接与超时故障由 Runner 在同一阶段内最多调用三次（含首次调用）；每次类型化暂时失败先以 `model_request_retry_recorded` 提交到 Trajectory，再退避或结束。退避响应中止信号。鉴权、配置、协议、存储和未知错误不重试；耗尽时稳定原因写入 Run 终态。适配边界确认的 `ModelRequestFailure` 直接以 `MODEL_REQUEST_FAILED` 结束，不进入协议纠错或暂时故障重试。
- Tool 只有显式的类型化暂时故障、`safe` 重放声明及仍有效的同一 Action 批准同时成立时才重试；尝试次数先写入 Snapshot，最多三次。`manual` 的不确定结果进入人工等待，`retryable` Observation 不触发系统重放。
- Context Lookup 只允许历史 Conversation、执行事实或决策理由；结果保留来源 Run 边界，旧 Run 的命中不能成为当前 Run 的完成 Evidence；当前环境必须重新调用 Tool。恢复时按当前 `lastStep` 的 lookupId，从 Snapshot 提交边界内查找对应结果，不受其后的阶段尝试事实影响。

## 当前限制

Runtime 当前只保存每个 Goal 的最新完整 Snapshot，不提供历史快照查询、跨进程租约或 Outbox 双写。Coordinator 实例内的 continue 闸门只保证单进程同一 Goal 串行；Web Server 与 Benchmark Composition Root 分别注入 Store、Trajectory、Tool、Agent 和 LLM 适配器。Headless Root 仍以单次 Run 返回，后续 Run 必须由持久化 Goal 的显式 continue 触发。

原生模型响应由共享 checkpoint 提交器与接受的阶段结果保存为 `model_response_received`，包含调用身份、Conversation 位置、独立正文与公开 reasoning 摘要以及供应商必要续接字段；响应不进入 Goal Conversation。只有 Snapshot 边界内且具有对应领域结算的响应可回放，审批、Tool replay policy 和 pending Action 仍由现有 Runtime 流程控制。响应已提交而领域决策尚未提交时，恢复后的实际决策只关联其前最近一次 Decide 响应；旧响应不能绑定新 Action。Section frame 的原生身份标记用于结束模型切换前的续接段。

## 跨模块不变量

- Goal workflow 只有 `executing`；Run 持有 `mode` 和可选 `approvedTask`，GoalPlan 独立于当前模式。
- 普通 Run 不产生任务审批等待，也不套用 Plan 只读门；Plan Run 获批前的业务 Tool 仅限明确声明只读的工具，Action 仍经过 Profile、Tool Policy、审批和沙箱检查。
- Runtime 独占状态转换、持久化、Tool 授权和 Evidence 校验；Agent 不保存 Goal，也不决定 Runtime ID、Step、Epoch 或审批状态。
- `goalId` 定位 Session，`runId` 标识执行实例；恢复时二者必须同时匹配。
- 模型调用指标是独立的投影事实；查询时从 Goal 快照、JSONL 调用记录和覆盖标记重新计算，不成为 Runtime 恢复输入。
- 通用 HTTP 宿主只负责 Hono 子路由挂载和回环监听生命周期；Goal Server 显式装配并启动浏览器和指标路由，关闭后拒绝新的 Web 写请求。
- `/plan` 选择当前或下一 Run 的模式且只消费一次；后续 Run 只由用户新输入创建。
- GoalPlan Todo 不绑定 Run；同一 Run 可以顺序推进多个 Todo，旧 Run 或未提交 Observation 不能完成 Todo。
- 跨 Run 历史必须携带完整 `(goalId, runId)` 来源；旧 Run 的 Lookup 结果不能成为当前 Run 的完成 Evidence。
- `pendingInteraction` 与 `pendingAction` 的等待点可持久化恢复；请求 ID、Goal/Run 身份和提交边界必须匹配。
- `pendingThink` 只指向当前 Step 最近已提交的 Think 输出；恢复校验模型输入与事件父链，不复用未提交或身份失配的输出。
- `pendingModelRepair` 指向当前 Step 的 Decide/Think 纠错尝试与反馈；每次调用和反馈先提交 Trajectory 与 Snapshot，恢复只消费已提交反馈且每条链最多三次调用。
- `pendingAction.attemptsStarted` 在每次 safe Tool 调用前持久化；只有类型化暂时故障可在同一已批准 Action 下重放，manual 结果未知则进入人工等待。
- 工具输入剥离未知字段产生的 `inputDiagnostic` 由 Runner（执行准备）与 Coordinator（审批参数预审）以 `tool_input_diagnostic` 写入诊断 Trace；记录契约身份、版本、脱敏路径与截断标记，写入失败不影响执行或审批。
- Working Memory 只从已提交 Trajectory 重建；原始事实账本不被 Compact 覆盖。
- Prompt Bundle 与三个当前协议由 Composition Root 一起冻结；未知版本、旧 Snapshot 和交叉协议组合 fail-closed。
- `contracts` 保持零出站依赖；依赖方向由 `npm run check:dependencies` 校验。
- 实例关闭只结算交付给 Runtime 的 Gate、控制器与注册资源；宿主进程退出、信号与借出对象由应用负责，关闭不产生 Goal 终态。

Memory proposal 在模型候选边界以 `memory_patch` 来源提供字段级反馈；证据诊断区分重复、缺失、越界与事件类别，持久化仍使用既有阶段反馈事件。诊断不携带模型事实值或文件正文。

所有携带模型 `memoryPatch` 的 Decide 候选在动作、等待、Epoch 转换和完成审查之前先做原子校验与无 I/O 试归约。试归约身份被丢弃，最终条目按阶段检查点之后的实际提交序号生成；提交器只调用 Runner 提供的纯归约回调，不裁决领域规则。语义阶段审查拒绝（`run_stage_rejected`）作为正常 Step 结算并跨正常 Step 推进，不占用 Decide 参数格式纠错预算；非法参数、证据门禁与格式异常仍在原 Decide 三次预算内纠错。中间阶段接受保持 Run running，最终 complete 接受原子提交阶段与 Run 完成；恢复、配置、存储与生命周期失败不转换为模型修复。

阶段业务工具执行前必须存在 executing 阶段。最终交付审查拒绝可以重新打开已接受阶段：保持阶段身份和历史接受事实，清除当前接受指针并提交拒绝缺口，在同一 Run 的新 Step 修正。此时 Snapshot 允许保存带拒绝缺口的 complete 候选作为最近 Step，但不将 Run 标记完成。

## 批次顺序执行与失败预算

Decide 返回值可以是 `decision`、`request_think`、`assistant_message` 或 `batch`。Runner 对 `batch` 的处理：队首走既有单决策校验与暂存路径，其余按模型返回顺序写入 `Run.pendingActionBatch.remaining`（仅业务 Action）。队首结果提交后，Runner 直接把队列中下一条作为本次 Decide 结果继续，不重新请求模型，因此多个 Action 在一次模型往返内按顺序执行。

**恢复点** = `pendingAction`（队首）+ `pendingActionBatch.remaining`（其余）。指针与该 Action 在同一次提交写入，避免"Action 已暂存但队列未推进"导致恢复后重放。已产生 `action_staged` 的 `actionId` 再次出现时按不可重放拒绝并要求模型改用新 Action。

失败预算分两类、各自含首次最多三次、互不占用：`attemptsStarted` 覆盖契约、Tool 选择、Tool 输入与证据类失败；`continuationsStarted` 覆盖零调用正文与无可用结果。`latestFailureClass` 决定下一次调用计入哪个预算，有效 `request_think` 结束当前链时两者一并归零。零调用正文在提交为 Goal 消息后按不推进类预算继续；预算用尽时保留每次原因与该次正文并明确失败。

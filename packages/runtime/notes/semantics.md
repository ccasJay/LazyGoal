# Goal Runtime语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Goal | 可恢复的会话聚合。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| Run | Goal 内的一次执行边界。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| 会话输入受理 | 在短提交边界内保存一条带稳定身份的输入并返回收据；受理不等于应用。 | [Goal Runtime](../README.md) | [输入受理边界](../src/session-admission.ts) |
| 长期 Session | 稳定 Goal 句柄与只读状态投影；创建、连接与输入受理复用同一 Runtime 执行规则。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 单活动执行名额 | 一个实例同时只运行一个 Goal；其他 Goal 的执行、交互推进与输入受理返回 busy，不进入隐式调度队列。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 后台执行任务 | 受理返回后由被追踪的后台 Promise 推进 Run；异常被观察并保留真实恢复状态。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 输入账本 | Goal 内按受理序号保存的输入身份、种类、载荷摘要与 pending／applied／cleared 状态。 | [Goal Runtime](../README.md) | [输入契约](../src/session-input.ts) |
| 消息队列 | 尚未应用的普通消息 FIFO、队列修订与暂停原因；变更推进修订。 | [Goal Runtime](../README.md) | [输入契约](../src/session-input.ts) |
| 队列暂停 | Run 失败或用户 Interrupt 后阻止后继 Run 启动；只有显式继续队列才解除，新消息只追加队尾。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 会话 Steer 受理 | 目标 running Run 的补充输入与 Run 内待应用记录、账本收据在同一提交生效；拒绝不写收据也不降级为队列消息。 | [Goal Runtime](../README.md) | [输入受理边界](../src/session-admission.ts) |
| 交互回答受理 | 匹配当前等待身份的回答通过既有 Coordinator 规则推进对应等待并写入收据；旧请求与错身份不解除等待。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 交互视图 | 由当前已提交等待派生的类型化请求：种类、Goal／Run 与请求身份、可用决定；不复制可变请求正文。 | [Goal Runtime](../README.md) | [交互视图](../src/interaction-view.ts) |
| 交互详情读取 | 按稳定引用返回当前等待的完整问题、任务范围或 Action 输入；引用过期时拒绝且不推进等待。 | [Goal Runtime](../README.md) | [交互视图](../src/interaction-view.ts) |
| 交互处理器 | 会话边界按种类分派的宿主处理函数入口：单一自动所有者、按引用去重、Gate 外调用；故障、迟到结果、解除与关闭都不默认决定。 | [Goal Runtime](../README.md) | [交互处理器](../src/interaction-handlers.ts) |
| 问答响应分支 | 逐题答案、整体回复与跳过三种互斥分支；整体回复保留用户原文，跳过提交未回答并要求继续的控制语义，都不伪造选项。 | [Goal Runtime](../README.md) | [输入契约](../src/session-input.ts) |
| 显式恢复 | 匹配最新 Run 与提交修订的恢复命令唤醒执行所有者或已受理队首；不代答等待，也不解除队列暂停。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 异步输入消费 | `consume` 逐条等待持久化受理；业务拒绝继续，基础设施失败停止来源，迟到项不受理。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 单消息封装 | 等待指定 Run 的等待或终态结果并返回可恢复身份；只释放自己的资源。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 有界关闭 | 停止接受与订阅后按期限结算；未结算时保留类型化错误，不伪造取消。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 会话输出订阅 | Goal 范围实时输出：先 `state_sync`，再输入结果与公开执行活动；不随 Run 结束关闭。 | [Goal Runtime](../README.md) | [会话流](../src/session-stream.ts) |
| 提交核对 | 有观察者时按不超过一秒的间隔只读核对最新提交修订，弥补末次通知丢失。 | [Goal Runtime](../README.md) | [会话流](../src/session-stream.ts) |
| 流背压 | 控制事件无法保留时以 `backpressure` 结束该订阅，不静默丢弃也不阻塞执行。 | [Goal Runtime](../README.md) | [事件 Core](../../execution-stream/src/publisher.ts) |
| 模型 Binding 对齐 | 新 Run 启动前按最新 Goal 的 `modelSelection` 重新对齐实例绑定。 | [Goal Runtime](../README.md) | [会话所有者](../src/session-manager.ts) |
| 会话 Interrupt 受理 | 中断意图、账本收据与队列暂停在同一提交生效；受理使旧交互引用失效，受理后观察停止、有限收尾、必要审批与最终 cancelled。 | [Goal Runtime](../README.md) | [Runner](../src/runner.ts) |
| 停止与交互竞争 | 停止先受理时旧等待的回答／批准不再被接受；回答先提交时按最新 Run 状态处理停止，不回滚已提交事实。 | [Goal Runtime](../README.md) | [GoalCoordinator](../src/goal-coordinator.ts) |
| 收尾中的新请求 | 未知效果收尾阶段提出的新审批请求仍然有效并按批准真实执行；旧引用保持失效，收尾预算与未知效果记录不被重置。 | [Goal Runtime](../README.md) | [Runner](../src/runner.ts) |
| 后继 Run 绑定 | 队首消息、输入应用关联、队列修订与新 Run 创建在同一 Snapshot 提交中完成。 | [Goal Runtime](../README.md) | [GoalCoordinator](../src/goal-coordinator.ts) |
| Goal 提交修订 | Goal 级单调提交修订，跨 Run 递增，用于恢复命令、状态同步与竞态判定。 | [Goal Runtime](../README.md) | [提交边界](../src/trajectory-checkpoint-committer.ts) |
| 短 mutation Gate | 按 Store 与 Goal 串行化读取与 Snapshot 提交；同一异步调用链可安全重入。 | [Goal Runtime](../README.md) | [提交边界](../src/goal-mutation-gate.ts) |
| 模型调用指标事实 | Provider 调用的用量及端到端请求耗时观测，不作为 Goal 恢复输入。 | [Goal Runtime](../README.md) | [模型调用指标 Port](../src/model-call-metrics.ts) |
| 实例生命周期 | 与进程退出无关的 `open`/`closing`/`closed` 状态、受理边界与有界关闭。 | [Goal Runtime](../README.md) | [生命周期核心](../src/lifecycle/runtime-lifecycle.ts) |
| 受管资源结算 | 实例自有资源按 `ManagedResource` 契约报告成功、拒绝或未完成，失败原因保留至结算或注销。 | [Goal Runtime](../README.md) | [资源注册表](../src/lifecycle/managed-resources.ts) |
| Step | 一次已提交的决策或动作周期。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| 工具发现 | 在授权目录中排序并累积当前 Run 可见工具。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| Memory proposal 纠错 | 模型记忆提议在副作用前校验，拒绝进入同一 Decide 预算。 | [Goal Runtime](../README.md) | [阶段反馈](../src/runtime-feedback.ts) |
| Run 阶段 | Run 内模型自主组织的阶段说明与完成条件；业务执行需活动阶段，最终审查拒绝后可重新打开已接受阶段。 | [Goal Runtime](../README.md) | [阶段规则](../src/run-stage.ts) |
| Plan Run 路线 | 仅已批准 Plan Run 持有的完整有序阶段、状态、修订理由和 Runtime 恢复游标；范围内修订保留已接受结果。 | [Goal Runtime](../README.md) | [路线规则](../src/run-plan.ts) |
| 批次顺序执行 | 一次 Decide 返回的多个业务 Action 按模型返回顺序逐个暂存与执行。 | [Runtime](../README.md) | [Runner](../src/runner.ts) |
| 批次恢复点 | `pendingAction` 与 `pendingActionBatch` 共同构成"从第一个未产生结果的 Action 继续"的指针。 | [Runtime](../README.md) | [Goal 领域模型](../src/domain.ts) |
| 不推进类预算 | 零调用正文与无可用结果的独立有界计数，与协议类纠错预算互不占用。 | [Runtime](../README.md) | [Runner](../src/runner.ts) |
| 审批参数修订 | 审批者可为同一工具提交最终参数版本；原请求引用与最终 canonical 参数一并冻结，获批后不可再编辑。 | [Goal Runtime](../README.md) | [审批修订规则](../src/action-approval.ts) |
| 审批只读预检 | 重新准备参数、规划执行准入、权限与沙箱范围并返回可审阅结果；不保存批准、不暂存授权、不解除等待。 | [Goal Runtime](../README.md) | [审批修订规则](../src/action-approval.ts) |
| 未知结果重执行决定 | 明确允许或拒绝结果未知的操作按获批版本再次执行；绑定本次恢复身份，旧决定不能授权新一轮。 | [Goal Runtime](../README.md) | [审批修订规则](../src/action-approval.ts) |
| 批准决定身份 | 批准决定的稳定身份；持续授权按该身份暂存与激活，同一决定重试复用同一条记录。 | [Goal Runtime](../README.md) | [GoalCoordinator](../src/goal-coordinator.ts) |

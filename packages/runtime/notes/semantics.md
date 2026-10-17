# Goal Runtime语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Goal | 可恢复的会话聚合。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
| Run | Goal 内的一次执行边界。 | [Goal Runtime](../README.md) | [模块说明](./overview.md) |
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

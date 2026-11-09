---
feature: trigger-worker-goal-ownership
status: proposed
risk: high
created_at: 2026-11-09
delivered_at: null
supersedes: [worker-process-trigger]
superseded_by: null
---

# Worker 构造 Goal 的 Trigger 协议

## 目标与范围

外部参与者、Supervisor 与 Worker 通过单一、严格类型化的不可变 Trigger 通信；Worker Runtime 根据 work material 和内部配置构造 Goal，并通过具因果关联的 Trigger 报告状态与结果。
本 Spec 只重定向 Trigger 契约、Goal 创建职责及持久路由所需接线；保留不冲突的 Worker 调度、权限执行、工作区安全与恢复语义，不新增外部适配器、Web UI、协作 payload、历史数据迁移或其它 Runtime 行为。

## 用户故事

- **S1** 作为 Trigger 生产者，我希望用带认证来源与目标的类型化事件提交工作或控制指令，以便 Supervisor 安全路由。
- **S2** 作为 Worker Runtime，我希望从原始 work material 和自身配置构造 Goal，以便 Trigger 不承担 GoalDefinition 或执行配置。
- **S3** 作为 Trigger 发起方，我希望通过关联回复追踪 Goal 创建、进度与结果，以便在不读取过程状态的情况下获得终态答复。
- **S4** 作为权限或交互决策者，我希望决定只绑定对应的请求、Goal 与 Run，以便过期决定不能改变其它等待或执行。
- **S5** 作为 Supervisor，我希望持久保存并恢复尚未路由的 Trigger，同时继续使用既有的 Worker 调度和授权边界。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | Trigger 穿越持久化、进程或传输边界 | 使用包含 `id`、`name`、`type`、`source`、`target`、`payload`、`sentAt` 及可选 `replyTo`、`goalId` 的严格消息契约；`type` 与 `payload.action` 由程序决定，payload 按类型封闭校验且不得使用任意 JSON。`goalId` 只引用已有 Goal；创建响应可引用刚创建的 Goal。所有响应、`permission.decided`、`interaction.answered` 和 `instruction.resume` 必须带指向其直接请求/退出事件的 `replyTo`；多个响应可指向同一请求。`interaction.requested` 不存在。`collaboration.requested/result` 仅保留动作标签，本 Spec 不定义其 payload 或处理行为，Runtime 不得以任意 JSON 接受它们。 | 运行生成绑定检查和各 `type/action` 的正反向边界测试，覆盖缺失、额外及错误分支字段。 |
| R1.2 | S1 | 事件 | 已认证连接提交 Trigger 并指定目标 | 将连接身份映射为可信 Actor；Worker 来源携带 `workerId` 与 `generation`，外部来源使用认证得到的 `externalId`，Supervisor 使用其自身 Actor；`target` 只指向 Supervisor 或逻辑 Worker 角色。Supervisor 路由所有 Worker 目标消息，Worker 间消息也经 Supervisor；不建立全局 `type/action` 与 `source/target` 方向矩阵，但仍执行连接身份、目标授权和 payload 校验。 | 运行认证与路由测试，覆盖伪造来源、过期 Worker generation、Supervisor 中转及无矩阵约束的合法消息。 |
| R1.3 | S1 | 异常 | 已记录的 Trigger `id` 再次提交 | 以身份冲突拒绝，不返回旧结果，也不重新执行；使用新 `id` 的重发是新事件，可能重复工作。本协议不承诺来源重试幂等或 exactly-once；调用方不得在是否已受理不确定时盲目重发。 | 运行同 ID 冲突、不同 ID 重复语义及无旧结果回放测试。 |
| R1.4 | S5 | 状态 | Trigger 已持久接收但尚未路由，Supervisor 随后重启 | 持久队列直接保存不可变 Trigger 本身，并在重启后继续处理未路由项；不得引入 `deliveryId`、Delivery 包装对象、Delivery 结算结果或 Delivery 状态字段。已接受事件的队列恢复不得依赖来源重新提交。 | 运行真实 Supervisor 重启测试，覆盖未路由 Trigger 恢复及处理前后崩溃边界。 |
| R2.1 | S2 | 事件 | 收到不带 `goalId` 的 `work.submitted`，其 material 为 text | Worker Runtime 以原始文本为工作来源，使用 Worker 内部配置形成并提交 Goal；Profile、Prompt Bundle 版本、Memory/Model Context/检索协议、执行策略和权限上限不从 Trigger payload 注入。Supervisor 保留 Goal Snapshot 的持久写入与调度所有权。创建成功后发出新的 `response.goal_created`，其 `goalId` 位于顶层并以 `replyTo` 指向 work Trigger。 | 运行跨进程 Goal 创建测试，核对 Trigger 仅含文本 material、Goal 内部配置来自 Worker、Goal 持久化后才发布创建响应。 |
| R2.2 | S1 | 事件 | 发送含语义正文的 Trigger 或仅含控制事实的 Trigger | 语义事件在发布前生成简短 LLM 摘要作为 `name`；控制事件使用确定性名称。每个 Trigger 仅有创建时的 `sentAt`，不得添加接收或完成时间。`work.submitted` 的初始 material 为 `{ kind: "text", text }`，其它 material 变体仅在出现具体来源需求后增加。 | 运行名称、控制命名、时间字段及 work material 结构测试。 |
| R2.3 | S1 | 异常 | 语义事件的 `name` 生成失败 | 不发布该 Trigger；来源入口保留原始来源事件并重试命名，不以空名称、临时名称或未命名 Trigger 继续处理。 | 注入命名失败，验证没有 Trigger 入队且来源事件仍可重试。 |
| R3.1 | S3 | 状态 | Goal Run 状态变为运行中或等待 | 发送新的 `response.progress`：payload 包含 `runId` 与 `status` 为 `running` 或 `waiting`；仅 waiting 状态包含 `waitingFor`，取 Runtime 当前等待类型。不得复制完整交互视图、步骤计数或 Worker 身份。 | 运行 Run 状态转换测试，核对 running/waiting payload 及 waiting 专属字段。 |
| R3.2 | S3 | 事件 | Goal Run 成功完成 | 发送新的 `response.completed`，payload 包含 `runId` 与最终 `answer` 文本；`answer` 必须来自 Runtime 已持久化、用途为 `answer` 的最终助手消息，而非过程消息或原始模型响应。 | 运行完成响应测试，逐字核对 `answer` 与持久化最终答复一致，且 `replyTo` 指向触发该响应的请求。 |
| R3.3 | S3 | 异常 | Goal Run 失败或被取消 | 分别发送新的 `response.failed` 或 `response.cancelled`，payload 只含 `runId`；取消不得被表示为失败，失败原因、Runtime 错误码与诊断正文不得复制到 Trigger payload。 | 运行失败与取消分支测试，验证动作区分、字段封闭及 `replyTo` 关联。 |
| R4.1 | S4 | 事件 | Worker 请求 Action 权限或参与者回答 Runtime 等待 | `permission.requested` payload 保留 `runId`、`actionId`、`interactionId`、`commitRevision`；请求 ID 使用 Trigger 顶层 `id`。`permission.decided` 仅携带 decision、scope、reason，并通过 `goalId` 与 `replyTo` 绑定请求；批准只允许 `action` scope，拒绝必须有非空理由。`interaction.answered` 仅携带类型化 `GoalUserAction` answer，以及顶层 `goalId` 和 `replyTo`，不得重复 Run、交互、修订或 Worker 身份，也不得复制 Runtime 交互视图。 | 运行权限与交互往返测试，覆盖批准范围、拒绝理由、旧请求及跨 Goal/Run 回复。 |
| R4.2 | S4、S5 | 事件 | 参与者取消 Run、决定恢复退出 Worker 的 checkpoint，或 Supervisor 观察进程生命周期 | `instruction.cancel` 必须带顶层 `goalId` 与目标 `runId`，过期 Run 被拒绝。`instruction.resume` 只表示 checkpoint 恢复，带 `runId` 与显式 `acknowledgeUnknownEffects` 布尔值，并以 `replyTo` 指向 `lifecycle.exited`；Supervisor 用该关联和内部 checkpoint 校验当前恢复资格，不暴露 `workerId`、`generation` 或 `commitRevision`。Supervisor 产生的 `lifecycle.started` 不带进程字段；`lifecycle.exited` 只带 `normal` 或 `unexpected`，PID、退出码、signal 与 Worker 身份留在内部诊断。 | 运行取消竞态、旧 Run 拒绝、checkpoint 关联/未知副作用确认及生命周期 payload 测试。 |

组合：在隔离工作区从 `work.submitted` 经 Worker Goal 创建、持久排队、`goal_created`、运行/等待、交互或权限回复推进至完成答复；在未路由时重启 Supervisor 并恢复队列。最终运行 `npm test`、`npm run contracts:generate -- --check`、`npm run check:dependencies` 与 `npm run check:docs`，并执行覆盖完整组合的多进程集成测试。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| Trigger 是含自身来源、目标与关联身份的不可变事件；响应通过 `replyTo` 新建，不修改原 Trigger。 | 消息本身表达谁发给谁以及回复哪项请求，不需要额外传递身份层。 | Trigger 外包一层 Delivery 或在原事件上更新完成状态。 |
| Worker Runtime 负责从 work material 和内部配置构造 Goal；Supervisor 继续拥有 Snapshot 持久写入与调度。 | 外部来源不应决定恢复协议、Profile 或 Worker 执行策略，同时保留既有的单写入所有权。 | 由外部 Trigger 携带完整 `GoalDefinition`，或由 Supervisor 预组装 Goal 再交给 Worker。 |
| 持久队列直接保存 Trigger；`id` 冲突即拒绝，新的 ID 是新的事件；不提供来源重试的旧结果回放或 exactly-once 保证。 | 移除 Delivery 概念，同时保留未路由消息的 Supervisor 重启恢复。 | `deliveryId`、Delivery 状态/结算表，或将相同 ID 重试伪装成旧结果查询。 |
| Goal 状态回复只携带下游实际需要的身份和结果；完成响应携带最终答案，失败与取消不复制诊断字段。 | 保持 Trigger 与 Runtime 内部失败结构解耦，并让外部接收方直接获得完成结果。 | 复制 GoalInteractionView、Worker 身份、步骤计数或 Runtime 错误对象。 |
| Trigger payload 复用 Catalog 生成与边界绑定机制；连接身份认证独立于 payload 校验，不设全局方向矩阵。协作动作仅预留名称，payload/处理语义待后续明确。 | 跨进程与持久化输入需要严格结构校验；协作内容尚无具体来源需求。 | 任意 JSON payload、手写第二套生成 Schema 或未定义的方向兼容表。 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| high | 外部 Trigger、Worker generation 与 Action 权限跨进程流转；错误归属或路由可能触发越权副作用。 | 实施验证仅使用受控 Actor、临时存储和隔离工作区；真实外部服务、凭据或宿主权限外操作须另行授权。 |
| high | 去除 Delivery 结果回放后，来源重试具有重复工作风险；Worker 侧创建 Goal 改变跨进程提交边界。 | 不删除或迁移既有用户数据；仅在可丢弃测试数据上验证崩溃恢复与重复提交。 |
| high | 变更涉及工作区、工具权限与恢复路径，自动化故障可能造成仓库或外部副作用。 | 不在用户真实仓库执行合并、覆盖或清理；任何真实外部副作用操作均须对具体操作单独授权。 |

## 任务

- [x] //TODO 1. 建立严格类型化的 Trigger 消息与 payload 边界，并接入生成绑定 → R1.1；检查：运行契约生成漂移检查与 Trigger payload 定向测试。
- [x] //TODO 2. 接入 Actor 身份认证、Supervisor 路由和 Worker 间中转 → R1.2；检查：运行认证与路由定向测试。
- [x] //TODO 3. 让持久队列直接保存 Trigger，并实现唯一 ID 冲突拒绝和重启续路由 → R1.3、R1.4；检查：运行存储、重复 ID 与 Supervisor 重启测试。
- [ ] //TODO 4. 将 work Trigger 的 Goal 构造放入 Worker Runtime，并在持久提交后回复 `goal_created` → R2.1；检查：运行跨进程 Goal 创建测试。
- [ ] //TODO 5. 实现语义名称、控制名称、`sentAt` 与命名失败保留 → R2.2、R2.3；检查：运行命名失败注入和消息字段测试。
- [ ] //TODO 6. 实现 `replyTo` 约束、Run 进度及终态响应 → R3.1、R3.2、R3.3；检查：运行进度、完成答复、失败/取消定向测试。
- [ ] //TODO 7. 实现权限、交互、取消、恢复与 Worker 生命周期 Trigger → R4.1、R4.2；检查：运行跨进程等待/回复及故障恢复测试。
- [ ] //TODO 8. 对齐受影响的模块说明与语义表，并验证端到端组合和回归 → R1.1–R4.2；检查：运行组合多进程测试及 `npm test`、`npm run contracts:generate -- --check`、`npm run check:dependencies`、`npm run check:docs`。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：等待 Spec 审批；未执行实现

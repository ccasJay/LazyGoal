# Web 传输契约

正式消息 DTO 保留 Snapshot 中的稳定消息身份、所属 Run 和 Run 内事实位置，供历史窗口和实时提交通知使用。

`BrowserGoalSessionState` 明确把消息、步骤和阶段历史标记为 Activity 外置，同时保留当前 Run、Plan 路线、等待、队列、中断和既有当前状态。`currentRunTerminalDetail` 只携带当前失败 Run 已保存的有界错误摘要，不包含供应商原始响应。`BrowserActivityPage` 只包含白名单事实摘要和有界正文，默认页大小为 50、上限为 100；Run 内事实序号与 Snapshot 保存的消息位置决定稳定顺序。cursor 绑定 Goal、筛选与每个相关 Run 的首次消息/轨迹水位，双向读取不吸收窗口之后追加的内容；`gaps` 给出页首尾尚未加载范围的准确项数和首尾位置。事实白名单包含模型纠错、请求失败和历史检索状态；可选 `detail` 最多 500 字符，只含固定状态文案、尝试次数及安全 HTTP 状态，不携带原始反馈或检索内容。DTO 不把原始事件 payload 或完整工具／Observation 载荷暴露给浏览器。

四种检索事实必须携带有界 `lookupId`，仅请求事实可携带枚举生成的 `lookupRequest`，仅失败事实可携带已知 `lookupErrorCode`。wire guard 拒绝非检索事件上的这些字段、未知错误码以及原始查询或错误正文。

统一输入命令中的 `queue_control.remove` 必须携带观察到的队列修订与目标消息身份；排队消息转为当前 Run 的 Steer 时，`steer.queueBinding` 携带同一来源绑定。wire parser 校验这两个边界字段，Runtime 再按持久化状态拒绝过期修订或不匹配的消息。

`BrowserSessionInputCommand.resume.acknowledgeUnknownEffects` 用于用户确认已知 Worker 退出后恢复运行中检查点时，最后一个动作可能已经产生外部效果；恢复运行中的 Goal 必须带 `true` 才会重新排队。默认 Goal Server Browser Session Port 只接受结构化回答、取消与显式恢复，不支持普通消息、Steer 或队列控制；wire 类型保留的其他输入形状不表示该入口当前提供这些操作。

Activity 助手消息必须携带 `process`、`answer` 或 `notice` 用途；用户消息不带助手用途。正式完成候选答复可带稳定 `previewId`，仅用于关联先前公开预览，不包含候选正文；wire guard 只接受非空且有界的助手答复关联。只有 `run_stage_declared` 事实可以携带最多 1,000 字符的 `stageTarget`，值只来自已提交声明。wire guard 拒绝缺失或无效的助手用途，以及放在其他事件类型上的阶段目标。

## 共享合同与校验分层

所有 Web HTTP、SSE 与浏览器 DTO 只在 [`wire.ts`](../src/wire.ts) 声明原生 TypeScript 类型与 JSDoc 约束；[`contracts/catalog.json`](../../../contracts/catalog.json) 登记 60 个 Web 生成绑定根，构建生成固定版本的 JSON Schema、Ajv standalone 校验器、Manifest 和类型化绑定。[`validation.ts`](../src/validation.ts) 的公开 guard 与 Goal Board API 在 JSON 边界调用生成读取能力：未知字段从隔离副本剥离并产生有界路径诊断，未声明键名统一替换为 `*`；已知字段类型、必填、枚举、数值与模式错误整体失败，不转换、不补值、不返回部分数据。同进程已类型化的生产者不重复校验。

跨字段与集合规则位于 [`invariants/`](../src/invariants)：Plan Route、Activity gap/range、交互决定、Provider 禁用凭据键、Trajectory 事件身份与指标数值范围都由纯函数执行。生成器已表达交互回答题数/选项数、`decisions` 最少项、Activity `gaps` 最大项和 Plan 阶段/验收条件最少项；仅生成器无法表达的可空整数等规则由 Web 不变量补充。`@asType integer` 与 `@maximum 9007199254740991` 保留安全整数语义。开放 JSON 字段由 `@lazygoal/contracts` 的 `isJsonValue` 判定（显式栈、环安全），本包只转发公开名称；wire 文本的 UTF-16 上限只由 `hasUtf16LengthAtMost` 承担，不新增 AST 节点或跨字段长度表。

本包定义 Browser HTTP 命令、Session 投影和 SSE 事件的传输形状。[Session DTO](../src/session.ts) 与 [命令 DTO](../src/command.ts) 面向 Web 边界；包含内部阶段分组（`BrowserRunStageGroup`）、Plan Run 路线和步骤归属身份。待审批任务候选 `BrowserPlanRouteStage` 只含目标与验收条件；获批 Run 的 `BrowserPlanRoute` 另含 Runtime 阶段身份、修订、状态及游标，普通 Run 省略此字段。Browser 包提供路由和投影，Goal Board 只渲染接收到的视图。

轨迹查询 DTO 把可见边界显式放到 wire 上：`BrowserTrajectoryPage` 携带服务端确定的 `committedThroughSequence` 与不透明游标，`BrowserExecutionUnitPage` 只包含显式归属该执行单元的事件，`BrowserTrajectoryTimeline` 提供固定水位的事件计数、时间范围与分桶类型分布。游标是字符串，不由前端解析或拼接；列表、详情、单元与时间线必须在同一水位下读取。详情额外携带 `BrowserTrajectoryCorrelation`、关联序号组与 `BrowserTrajectoryPayloadReference`，大型载荷按引用单独读取。全文搜索不在 wire 上提供。

会话指标 DTO 的 `tokensPerSecond` 表示应用观察到的端到端 Provider 请求输出速率；其分子使用 Provider 确认的输出 token，时间语义和测量覆盖由 [指标投影模块](../../session-metrics/notes/overview.md)定义。

`BrowserSessionStep.sourceEventId` 指向已提交 Trajectory 事件，并可携带 Action 身份和已验证的相邻边界；`BrowserGoalActivityEvent.sourceEventId/sourceCursor` 属于独立的 ExecutionStream 来源。不同来源即使字符串相同也不得互相去重；`actionId` 是前端将同一调用的实时状态和历史步骤协调起来的稳定身份。实时 DTO 只含有界、白名单的输入/结果摘要和公开边界类型，不含隐藏推理、任意工具载荷或输出正文。该身份形状服务于可重建 UI，不作为持久化 ActivityGroup Schema。

`model_started` 可带真实来源时间、模型调用身份、执行单元与已知协议阶段；阶段仅允许 decide、think、completion_review，不代表工作流 Stage。wire guard 校验元数据长度与时间有效性；未提供的字段不由浏览器推断。

会话 wire DTO 与 guard 只接受 `requested`／`finished` 中断状态，不再传输模型收尾预算。执行语义见 [Runtime](../../runtime/notes/overview.md)。

## 控制协议

Goal Board 的全部 Goal／Workspace 变更命令使用同一 [`BrowserControlIntentCommand`](../src/wire.ts)：`intentId` 是客户端控制身份，`session_input` 与 `create_session` 复用既有 `inputId`，其余命令按 Goal、Run、revision 或资源身份寻址。命令入口返回 [`BrowserControlReceipt`](../src/wire.ts)，明确区分 `accepted`、`existing`、`rejected` 与 `unknown`；同步提交类命令在受理即完成，`create_session`、`session_input` 停在受理态等待应用事实，只读 `action_review` 只报告预检结果。[`BrowserControlIntentResult`](../src/wire.ts) 以与命令一致的 `kind` 标记成功结果，消费方按命令类型读取唯一的 `result`，不从字段形状猜测命令种类。

[`BrowserControlScope`](../src/wire.ts) 是投影失效的唯一分类：`session`、`activity`、`trajectory`、`metrics`、`goals`、`grants`、`permission` 与 `model`。`state_committed.changed` 与 `stream_fault.resync` 只声明实际变化范围；`BrowserControlSnapshot` 由 Browser 在同一提交边界组装，包含 Goal 控制投影与 Runtime 窄状态，仅由 `state_sync` 携带。`BrowserGoalEvent` 是 [`BrowserControlEvent`](../src/wire.ts) 与 [`BrowserContentEvent`](../src/wire.ts) 的并集；控制事实与生成正文互斥，`intent_applied`／`intent_rejected` 不属于 wire 事实。

本包不持久化意图、收据或审批会话；它们由命令入口、Runtime 事实与页面 reducer 派生。

## 所有权

传输 DTO 不是 Goal Snapshot 的持久化 Schema。运行状态、阶段记录及授权事实由 Runtime 提交，Browser 从已提交状态建立当前视图；前端的瞬时活动不会变成恢复输入。请求入站验证由对应的 Web 边界使用本包生成的命令绑定执行。

`BrowserGoalList` 是 Goal 列表的响应信封：除可读取摘要外还携带 `unreadableCount`，说明有多少历史 Goal 因本地快照与当前协议不兼容而无法读取；该计数只描述列表完整性，不暴露快照内容或文件路径。

Activity 正文摘要最多 4,000 UTF-16 code unit，截断不得拆分代理项；原文按 messageId 从现有详情路由分段读取。文件 Trajectory 存储仍可能整文件扫描，wire 页大小不代表磁盘随机访问有界。`isBrowserActivityPage` 与 `isBrowserGoalSessionState` 通过生成绑定和共享不变量校验页上限、历史外置标记、白名单事实与 UTF-16 上限；未知字段在读取时剥离，原始 payload 扩展不进入返回数据。

Provider 表单在线查询使用 [`BrowserProviderModelQuery` 与 `BrowserProviderModels`](../src/wire.ts)：请求与响应均由 `wire.ts` 单源定义；输入通过生成绑定剥离未知字段后进入 `fetchModels`，响应通过生成的绑定剥离未知字段并返回不含值的有界路径诊断；密钥仅存在于请求，不回显或持久化。其他 Provider 设置 DTO 同样由 `wire.ts` 与生成绑定覆盖。

`BrowserSessionStep.think` 携带显式 Think 目标及可选的已提交分析；无输出表示尚无完成事实，`truncated` 表示有界正文被省略。多个 Think 成员可以共享同一个 Runtime Step 序号，成员数量不等于 `stepCount`。Think 正文通过受保护的会话 HTTP 响应提供，实时通知仍只触发检查点重读；供应商隐藏推理不进入该 DTO。

`BrowserActivityRunContext.terminalDetail` 是可选的安全终态摘要：消息最多 500 字符、代码最多 80 字符，只允许这两个字段。来源缺失时省略；消费者不得借用其它 Run 的错误。它属于展示 DTO，不改变 Runtime 终态或持久化格式。

Activity 页的 `stages` 按 Run 与阶段身份提供已提交声明的有界 `target`（最多 1,000 个 UTF-16 代码单元）；声明缺失时省略。阶段与 Action 上下文的 `completeWithinPage` 描述当前页来源完整性，与执行是否成功或完成独立。前端消费和分页合并见 [Goal Board](../../../apps/goal-board/notes/overview.md)。

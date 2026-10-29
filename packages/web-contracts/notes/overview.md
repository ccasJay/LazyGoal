# Web 传输契约

正式消息 DTO 保留 Snapshot 中的稳定消息身份、所属 Run 和 Run 内事实位置，供历史窗口和实时提交通知使用。

`BrowserGoalSessionState` 明确把消息、步骤和阶段历史标记为 Activity 外置，同时保留当前 Run、Plan 路线、等待、队列、中断和既有当前状态。`currentRunTerminalDetail` 只携带当前失败 Run 已保存的有界错误摘要，不包含供应商原始响应。`BrowserActivityPage` 只包含白名单事实摘要和有界正文，默认页大小为 50、上限为 100；Run 内事实序号与 Snapshot 保存的消息位置决定稳定顺序。cursor 绑定 Goal、筛选与每个相关 Run 的首次消息/轨迹水位，双向读取不吸收窗口之后追加的内容；`gaps` 给出页首尾尚未加载范围的准确项数和首尾位置。事实白名单包含模型纠错、请求失败和历史检索状态；可选 `detail` 最多 500 字符，只含固定状态文案、尝试次数及安全 HTTP 状态，不携带原始反馈或检索内容。DTO 不把原始事件 payload 或完整工具／Observation 载荷暴露给浏览器。

四种检索事实必须携带有界 `lookupId`，仅请求事实可携带枚举生成的 `lookupRequest`，仅失败事实可携带已知 `lookupErrorCode`。wire guard 拒绝非检索事件上的这些字段、未知错误码以及原始查询或错误正文。

统一输入命令中的 `queue_control.remove` 必须携带观察到的队列修订与目标消息身份；排队消息转为当前 Run 的 Steer 时，`steer.queueBinding` 携带同一来源绑定。wire parser 校验这两个边界字段，Runtime 再按持久化状态拒绝过期修订或不匹配的消息。

Activity 助手消息必须携带 `process`、`answer` 或 `notice` 用途；用户消息不带助手用途。正式完成候选答复可带稳定 `previewId`，仅用于关联先前公开预览，不包含候选正文；wire guard 只接受非空且有界的助手答复关联。只有 `run_stage_declared` 事实可以携带最多 1,000 字符的 `stageTarget`，值只来自已提交声明。wire guard 拒绝缺失或无效的助手用途，以及放在其他事件类型上的阶段目标。

## 共享合同与校验分层

本包的每个 wire DTO 只在 [`contracts/`](../src/contracts) 声明一份 Contract AST，公开 TypeScript 类型由 `InferContract` 派生；[`validation.ts`](../src/validation.ts) 的公开 guard 只执行 `safeParse` 结果判断与命名不变量，不再维护第二套字段表。入站命令合同使用严格对象；出站合同按原 guard 的未知字段行为选择开放对象或严格对象，开放层保留额外 JSON，白名单层继续拒绝未声明字段。

跨字段规则位于 [`invariants/`](../src/invariants)：Plan Route、Activity gap/range、交互决定、Provider 禁用凭据键、Trajectory 事件身份与指标数值范围都由纯函数执行。开放 JSON 字段统一使用 `contract.unknown()`，并由显式栈实现的 `isJsonValue` 判定；其载荷深度不受合同结构 `MAX_DEPTH` 限制。wire 文本的 UTF-16 上限只由 `hasUtf16LengthAtMost` 承担，不新增 AST 节点或跨字段长度表。

本包定义 Browser HTTP 命令、Session 投影和 SSE 事件的传输形状。[Session DTO](../src/session.ts) 与 [命令 DTO](../src/command.ts) 面向 Web 边界；包含内部阶段分组（`BrowserRunStageGroup`）、Plan Run 路线和步骤归属身份。待审批任务候选 `BrowserPlanRouteStage` 只含目标与验收条件；获批 Run 的 `BrowserPlanRoute` 另含 Runtime 阶段身份、修订、状态及游标，普通 Run 省略此字段。Browser 包提供路由和投影，Goal Board 只渲染接收到的视图。

会话指标 DTO 的 `tokensPerSecond` 表示应用观察到的端到端 Provider 请求输出速率；其分子使用 Provider 确认的输出 token，时间语义和测量覆盖由 [指标投影模块](../../session-metrics/notes/overview.md)定义。

`BrowserSessionStep.sourceEventId` 指向已提交 Trajectory 事件，并可携带 Action 身份和已验证的相邻边界；`BrowserGoalActivityEvent.sourceEventId/sourceCursor` 属于独立的 ExecutionStream 来源。不同来源即使字符串相同也不得互相去重；`actionId` 是前端将同一调用的实时状态和历史步骤协调起来的稳定身份。实时 DTO 只含有界、白名单的输入/结果摘要和公开边界类型，不含隐藏推理、任意工具载荷或输出正文。该身份形状服务于可重建 UI，不作为持久化 ActivityGroup Schema。

`model_started` 可带真实来源时间、模型调用身份、执行单元与已知协议阶段；阶段仅允许 decide、think、completion_review，不代表工作流 Stage。wire guard 校验元数据长度与时间有效性；未提供的字段不由浏览器推断。

会话 wire DTO 与 guard 只接受 `requested`／`finished` 中断状态，不再传输模型收尾预算。执行语义见 [Runtime](../../runtime/notes/overview.md)。

## 所有权

传输 DTO 不是 Goal Snapshot 的持久化 Schema。运行状态、阶段记录及授权事实由 Runtime 提交，Browser 从已提交状态建立当前视图；前端的瞬时活动不会变成恢复输入。请求入站验证由对应的 Web 边界使用本包的严格命令合同执行。

`BrowserGoalList` 是 Goal 列表的响应信封：除可读取摘要外还携带 `unreadableCount`，说明有多少历史 Goal 因本地快照与当前协议不兼容而无法读取；该计数只描述列表完整性，不暴露快照内容或文件路径。

Activity 正文摘要最多 4,000 UTF-16 code unit，截断不得拆分代理项；原文按 messageId 从现有详情路由分段读取。文件 Trajectory 存储仍可能整文件扫描，wire 页大小不代表磁盘随机访问有界。`isBrowserActivityPage` 与 `isBrowserGoalSessionState` 通过共享合同校验页上限、历史外置标记和字段白名单，拒绝任意原始 payload 扩展字段。

Provider 表单在线查询使用 `BrowserProviderModelQuery` 与 `BrowserProviderModels`：请求不需要默认模型，响应只返回模型 ID 和名称；`isProviderModels` 验证响应边界。密钥仅存在于请求，不回显或持久化。

`BrowserSessionStep.think` 携带显式 Think 目标及可选的已提交分析；无输出表示尚无完成事实，`truncated` 表示有界正文被省略。多个 Think 成员可以共享同一个 Runtime Step 序号，成员数量不等于 `stepCount`。Think 正文通过受保护的会话 HTTP 响应提供，实时通知仍只触发检查点重读；供应商隐藏推理不进入该 DTO。

`BrowserActivityRunContext.terminalDetail` 是可选的安全终态摘要：消息最多 500 字符、代码最多 80 字符，只允许这两个字段。来源缺失时省略；消费者不得借用其它 Run 的错误。它属于展示 DTO，不改变 Runtime 终态或持久化格式。

Activity 页的 `stages` 按 Run 与阶段身份提供已提交声明的有界 `target`（最多 1,000 个 UTF-16 代码单元）；声明缺失时省略。阶段与 Action 上下文的 `completeWithinPage` 描述当前页来源完整性，与执行是否成功或完成独立。前端消费和分页合并见 [Goal Board](../../../apps/goal-board/notes/overview.md)。

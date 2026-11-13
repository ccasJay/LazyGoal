# Goal Board语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| shadcn UI | 官方 Radix 组件源码、Tailwind 样式与 LazyGoal 品牌语义变量；通用交互不重复自制。 | [Goal Board](../README.md) | [组件配置](../components.json)、[品牌主题](../src/ui.css) |
| 界面配色 | Radix Colors 标准色阶经语义变量映射到业务样式与 shadcn；品牌、交互、状态及聚焦分开定义，图片与用户内容不改色。 | [Goal Board](../README.md) | [配色说明](./overview.md#界面配色)、[主题映射](../src/ui.css)、[语义变量](../src/style.css) |
| 底部指标行 | 输入框下方独立展示 Goal 聚合指标；窄屏横向滚动，Popover 展示当前 Run 状态与完整计量说明。 | [Goal Board](../README.md) | [SessionMetricsBar](../src/components/SessionMetricsBar.tsx)、[模块说明](./overview.md) |
| 历史执行折叠 | Run 默认全部展开；折叠后只保留 Run 标题行，不再保留部分来源。折叠状态按 Run 身份记录，追加内容与结算不覆盖用户选择。 | [Goal Board](../README.md) | [SessionTimeline](../src/components/SessionTimeline.tsx) |
| 阅读与跟随 | Activity 窗口持有自动滚动状态；暂停滚动仍接收末尾窗口的新回答与终态并保留锚点，有更新方向缺口的历史页只累计提示。未读按新增来源水位计数，显式跳转回到最新。 | [Goal Board](../README.md) | [Activity 窗口](../src/activity-page-window.ts)、[会话视图](../src/components/GoalSession.tsx) |
| 模型无响应提示 | 模型六十秒无新公开响应时提示；显示来源时长与最近观察时间，不自动取消或重试。 | [Goal Board](../README.md) | [执行进度](../src/execution-progress.ts) |
| Workspace shell | 当前工作区的紧凑导航、详情、Goal 搜索与可收起最近列表；侧栏可隐藏及拖动调宽，宽度仅保存在页面内。 | [Goal Board](../README.md) | [WorkspaceShell](../src/components/WorkspaceShell.tsx)、[ResizableSidebar](../src/components/ResizableSidebar.tsx) |
| Goal 列表不可读提示 | 服务端报告存在无法读取的历史 Goal 时，看板显示说明条并保留可读 Goal，不以整页错误替代列表。 | [Goal Board](../README.md) | [GoalBoard](../src/components/GoalBoard.tsx)、[模块说明](./overview.md) |
| Settings page | 侧栏底部进入 Provider 管理和外观设置，切换时保留当前会话。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx)、[模块说明](./overview.md) |
| Activity 宽度 | Standard 按可用空间收窄并限制最大宽度，Wide 填满可用空间；同一偏好作用于活动区和输入区，保存在浏览器 Cookie 中。 | [Goal Board](../README.md) | [WorkspaceShell](../src/components/WorkspaceShell.tsx)、[模块说明](./overview.md#页面交互) |
| Wire DTO 消费 | 页面消费 web-contracts 的 DTO 与边界读取器；在线模型列表由生成绑定校验并剥离未知字段，其它响应继续使用 guard。 | [Goal Board](../README.md) | [模块说明](./overview.md)、[Web 传输契约](../../../packages/web-contracts/README.md)、[Provider 模型 API](../src/api.ts) |
| Session view | 首屏并行读取不含历史的 Goal 状态与固定水位 Activity 页；完整会话按需用于 Plan、Trajectory 和 Goal details。 | [Goal Board](../README.md) | [useGoalSession](../src/hooks/useGoalSession.ts)、[模块说明](./overview.md) |
| SessionTimeline | 按服务端 Run 内位置合并稳定来源身份，单列呈现消息、候选预览、活动事实、Run 边界与终态；候选按 `previewId` 在原展示身份转为正式消息。 | [Goal Board](../README.md) | [投影](../src/session-timeline.ts)、[视图](../src/components/SessionTimeline.tsx) |
| 固定 Activity 页 | 有界正文／安全活动读取带固定水位和 cursor；打开后自动预取更早页（300 项预算），超出预算后滚动到顶部继续读取。 | [浏览器服务边界](../../../packages/browser/README.md) | [Activity API](../../../packages/browser/src/browser-goal-routes.ts)、[页面说明](./overview.md) |
| 输出速率展示 | 显示已结束模型调用的端到端输出速率；在调用完成事实更新后刷新。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 交互区域 | 按已提交等待种类分派的统一决定区：问答导航与审阅、任务范围审阅、工具能力与期限、未知结果恢复；替换旧三套表单。 | [Goal Board](../README.md) | [InteractionRegion](../src/interaction-panel.tsx) |
| 交互提交状态 | 从控制意图派生的展示阶段（编辑、提交中、待核验、已受理、失效）；冻结身份只用于核验与原身份重试，不再维护第二份状态机。 | [Goal Board](../README.md) | [interaction-state.ts](../src/interaction-state.ts)、[控制 reducer](../src/control/reducer.ts) |
| 控制 reducer | 页面唯一的 `ControlState`：权威快照、意图生命周期、工具活动、独立资源与失效作用域。 | [Goal Board](../README.md) | [reducer.ts](../src/control/reducer.ts)、[模块说明](./overview.md#控制-reducer) |
| 控制意图生命周期 | `pending → accepted → applied` 或 `rejected`／`unknown`；同一 `intentId` 保留冻结载荷，重复登记不改写。 | [Goal Board](../README.md) | [reducer.ts](../src/control/reducer.ts)、[控制命令 DTO](../../../packages/web-contracts/src/control.ts) |
| 统一核验 | 结果不明时按 `inputId` 收据、权限 revision、`grantId`、Goal 状态、模型选择与 `pendingAction` 重新核对；只有 `not_applied` 允许原身份重试。 | [Goal Board](../README.md) | [verify.ts](../src/control/verify.ts) |
| 权威控制快照 | `state_sync.snapshot` 与窄 HTTP 共用控制快照，按视图代次、连接与同 Goal 修订接纳。 | [Goal Board](../README.md) | [useGoalSession](../src/hooks/useGoalSession.ts)、[useRunStream](../src/hooks/useRunStream.ts) |
| 定向失效与读取 | `state_committed.changed` 与 `stream_fault.resync` 只触发声明范围的读取；需要确认等待或终态时只读窄状态。 | [Goal Board](../README.md) | [事件路由](../src/control/event-routing.ts)、[useRunStream](../src/hooks/useRunStream.ts) |
| 审批会话 | 由 `pendingAction`、同一视图与等待的预检及 `respond` 提交派生的 `unreviewed`／`reviewing`／`reviewed`／`submitting`／`accepted`／`settled`／`invalidated`／`unknown`。 | [Goal Board](../README.md) | [审批会话 selector](../src/control/approval-session.ts) |
| 工具活动生命周期 | 以 `actionId` + `executionUnitId` 聚合尝试；工具返回停在 `result_pending`，Observation 提交后进入 `observed_committed`。 | [Goal Board](../README.md) | [工具活动 selector](../src/control/tool-activity.ts) |
| 模型选择原子化 | 一次 `model_selection` 完成模型切换与可选默认偏好；部分失败以子结果报告，重试复用同一意图身份。 | [Goal Board](../README.md) | [模型选择结果](../src/control/model-selection.ts)、[useModelSelection](../src/hooks/useModelSelection.ts) |
| 交互决定摘要 | 当前页面暂存已受理的非权限决定摘要；工具／沙箱授权及修订授权不保留在输入区，刷新后清空。 | [Goal Board](../README.md) | [GoalSession](../src/components/GoalSession.tsx)、[交互提交](../src/interaction-panel.tsx) |
| 交互详情读取 | 按当前 Goal／Run／交互引用读取完整问题、任务范围或 Action 输入；失败保留等待并禁用依赖完整范围的决定。 | [浏览器服务边界](../../../packages/browser/README.md) | [交互详情路由](../../../packages/browser/src/browser-goal-routes.ts) |
| 提案阶段路线 | 批准前显示 Plan Run 的完整候选阶段及各自验收条件。 | [Goal Board](../README.md) | [任务审批视图](../src/interaction-panel.tsx) |
| 获批 Run 路线 | Activity 时间线上独立呈现 Plan Run 当前完整阶段顺序、状态与验收条件。 | [Goal Board](../README.md) | [PlanRouteList](../src/components/PlanRouteList.tsx) |
| ActivityGroup | 从固定 Activity 页的已提交事实与安全实时事件派生的纯展示分组。同一 Action 的决策、审批、执行、重试与结果先按 Action 身份归入同一成员，再压缩同阶段内连续同工具调用，不代表 Runtime 阶段；断组由完整交错来源决定，正文、交互、未知事实与阶段边界都会断开相邻成员，隐藏正文不改变该判定。 | [Goal Board](../README.md) | [ActivityProjector](../src/activity-projector.ts) |
| 历史检索活动 | 同 Run 的请求与结果仅按 `lookupId` 归并为一条时间线活动；未命中与失败独立显示，展开详情只使用安全请求类别、固定状态说明与白名单错误码。分页缺少一侧时保留稳定身份。 | [Goal Board](../README.md) | [时间线投影](../src/session-timeline.ts)、[SessionTimeline](../src/components/SessionTimeline.tsx) |
| 活动成员状态 | 区分执行中、重试、审批等待、结果待保存、已提交失败／成功与已拒绝；展开详情按来源顺序显示该成员的授权、执行、重试与结果记录，已提交 Observation 才决定终态。组的运行状态与异常计数独立显示，结算后区分全部失败与部分失败；实时返回不标为已保存成功。 | [Goal Board](../README.md) | [ActivityProjector](../src/activity-projector.ts) |
| 活动组展开状态 | 标题单行显示动作描述与真实调用次数，混合失败组保留成功和失败计数；完整命令、结果计数与授权／执行／重试／结果生命周期只在展开详情中显示，单成员组不在详情内重复组标题与状态。连续步骤使用 shadcn Trace，消息断开步骤组；成功默认折叠，运行、失败、拒绝与审批等待默认展开，等待授权不能被筛选或手动折叠隐藏其 `Awaiting approval` 状态。手动开合在追加、结算与筛选时保留，异常摘要不随折叠或筛选隐藏。 | [Goal Board](../README.md) | [SessionTimeline](../src/components/SessionTimeline.tsx)、[ActivityProjector](../src/activity-projector.ts) |
| 真实阶段展示 | 只按已提交声明或当前路线的真实阶段标题、身份与修订收拢连续活动；已接受阶段默认折叠，工作中与需处理的阶段展开，正文与交互仍在原来源位置。 | [Goal Board](../README.md) | [SessionTimeline](../src/components/SessionTimeline.tsx)、[时间线投影](../src/session-timeline.ts) |
| Live Activity | 当前 Goal SSE 的公开生成与连接状态；控制事实先进入控制 reducer，内容事实维持候选与临时正文路径。 | [Goal Board](../README.md) | [useRunStream](../src/hooks/useRunStream.ts) |
| 重连与权威恢复 | 两条流结束后由既有 800ms 循环重新订阅；不发送 `Last-Event-ID`、不请求补发，以新连接的 `state_sync` 快照或最新指标快照替换旧值与旧临时正文。 | [Goal Board](../README.md) | [useRunStream](../src/hooks/useRunStream.ts)、[useGoals](../src/hooks/useGoals.ts) |
| 临时正文来源索引 | 流式正文按来源身份分块并有界：每块在首次产生时确定时间线顺序，工具调用或新的模型阶段关闭当前块，恢复输出创建新块；后续增量只更新内容，不回填或重排已显示节点。进度与工具节点使用同一观察顺序。只有当前活跃块显示流式光标，已关闭块标记为 `Earlier response`。 | [Goal Board](../README.md) | [流式渲染状态](../src/streaming-render.ts)、[实时顺序](../src/live-timeline.ts)、[useRunStream](../src/hooks/useRunStream.ts) |
| Run 终态展示 | `completed` 只由 Run 标题表达，不重复独立终态行；`failed` 与 `cancelled` 保留终态行及其安全详情。 | [Goal Board](../README.md) | [时间线投影](../src/session-timeline.ts)、[SessionTimeline](../src/components/SessionTimeline.tsx) |
| 安全 Markdown | 正文与 Think 输出共用同一安全 GFM 渲染：原始 HTML 与脚本不进入 DOM，模型图片与嵌入降级为链接，代码与表格只在自身区域横向滚动。 | [Goal Board](../README.md) | [AssistantMarkdown](../src/components/AssistantMarkdown.tsx) |
| 观察同步与过期 | 订阅按 Goal 建立并先消费权威同步；断开或读取失败保留最后确认内容并标记可能过期，依赖最新状态的决定在重连并同步前不可用。 | [Goal Board](../README.md) | [观察恢复语义](../src/session-stream-recovery.ts) |
| 统一 SSE 分帧 | metrics 与 Goal 事件共用一个 `eventsource-parser` 入口，只产出事件名与 `data`；未知命名事件忽略，已接受事件的无效 JSON 或无效 DTO 结束本次生成器。 | [Goal Board](../README.md) | [SSE 分帧](../src/sse.ts)、[API 映射](../src/api.ts) |
| 重连与权威恢复 | 两条流结束后由既有 800ms 循环重新订阅；不发送 `Last-Event-ID`、不请求补发，以新连接的 `state_sync` 或最新指标快照替换旧值与旧临时正文。 | [Goal Board](../README.md) | [useRunStream](../src/hooks/useRunStream.ts)、[useGoals](../src/hooks/useGoals.ts) |
| 观察释放 | 卸载视图或切换 Goal 只回收浏览器本地的订阅、请求与合并帧；不发送 Interrupt，不撤销已受理输入，也不关闭宿主 Runtime。 | [Goal Board](../README.md) | [观察恢复语义](../src/session-stream-recovery.ts) |
| GoalSessionContext | 局部持有 Goal 窄状态、固定 Activity 页、按需完整会话及视图状态。 | [Goal Board](../README.md) | [上下文契约](../src/context/GoalSessionContext.tsx) |
| RunControlContext | 隔离支持的命令分发、控制意图状态与原子单飞防重锁；不持有普通消息队列。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| New Goal 草稿 | 仅保存在页面状态的未提交首个意图；提交结果不明时保留原身份，受理成功后由服务端 Goal 与 Trigger 收据接管。 | [Goal Board](../README.md) | [MessageComposer](../src/components/MessageComposer.tsx) |
| 新 Goal 输入 | 输入框只创建 Goal 并提交首个意图；已有 Goal 不提供普通续聊、Steer 或队列操作。 | [Goal Board](../README.md) | [输入区](../src/components/MessageComposer.tsx)、[会话视图](../src/components/GoalSession.tsx) |
| Worker 状态与恢复 | 已运行 Goal 显示所属 Worker；只有 Supervisor 明确记录的待恢复 Worker 退出可继续，恢复运行中检查点要求承认未知外部效果。 | [Goal Board](../README.md) | [会话视图](../src/components/GoalSession.tsx)、[Trigger 浏览器端口](../../goal-server/src/browser-session-port.ts) |
| 会话渐进加载 | 固定水位 Activity 页支持更早与更新方向翻页；打开时自动预取更早页至 300 项预算，超出后滚动到顶部续取；最多缓存 3 页，阅读锚点按可见项稳定身份及项内偏移恢复。 | [Goal Board](../README.md) | [Activity 窗口](../src/activity-page-window.ts)、[SessionTimeline](../src/components/SessionTimeline.tsx) |
| 会话输出消费 | 页面消费同一条 Goal SSE：保存不明的候选保持待核验；正式 Activity 以同一展示 key 替换候选；确定作废后立即移除临时正文并保留有限身份标记以忽略迟到片段。 | [Goal Board](../README.md) | [会话输出归约](../src/session-output-consumer.ts) |
| UI 验收工具 | 基于 Playwright 与独立 Fixture 模拟服务的确定性页面启动、截图、诊断、视觉回归与声明式交互流程。Fixture 支持有状态命令副作用、流式正文与工具事件推送；流程按步骤断言，连续观察模式按间隔录制画面与页面事实。 | [Goal Board](../README.md) | [ui-harness.md](./ui-harness.md) |
| 不确定提交核验 | 受理结果不明时保留原 `inputId` 与冻结载荷，由统一核验按收据或资源身份结算；只有未应用允许原身份重试。 | [Goal Board](../README.md) | [控制核验](../src/control/verify.ts)、[运行命令](../src/hooks/useRunCommands.ts) |
| 渲染错误边界 | 会话与轨迹视图的渲染异常被边界捕获，显示错误卡与重载入口，不整页白屏。 | [Goal Board](../README.md) | [SessionBoundary](../src/components/error-boundary.tsx) |
| liveText 帧合并 | 打字机增量按帧合并后提交渲染，跟随滚动以帧节流，流结束不丢字。 | [Goal Board](../README.md) | [live-text-batch](../src/live-text-batch.ts) |
| Provider 设置页 | 受管 Provider 紧凑列表与按需展开表单；区分凭据已保存、激活与目录检查状态，不回显已保存密钥。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx) |
| 来源两级选择 | 模型选择器先选 Provider 来源再选模型，结果写入对应偏好或 Goal 选择。 | [Goal Board](../README.md) | [ModelPicker](../src/components/ModelPicker.tsx) |
| Fetch models | 用当前表单查询在线模型；绑定剥离未声明字段并记录不含值的诊断，不保存档案。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx)、[Provider 模型绑定](../../../packages/web-contracts/src/generated/provider-models-binding.ts) |
| 轨迹概览轨道 | 50px 三轨 Sequence／Time 投影；始终填满可视宽度，Sequence 滚轮缩放不低于 Fit，右键平移、拖拽选择范围，Compact 只收窄事件标记。 | [Goal Board](../README.md) | [TrajectoryTimeline](../src/trajectory-timeline.tsx)、[投影](../src/trajectory-timeline-model.ts) |
| 轨迹查询水位与游标 | 首屏固定 `committedThroughSequence`，后续段与详情复用同一水位；游标由服务端签发并绑定 Run、水位与过滤，客户端不改写可见边界。 | [Goal Board](../README.md) | [Trajectory](../src/trajectory.tsx)、[轨迹 API](../src/api.ts) |
| Run 目录分页 | Run 选择器首屏读取 100 条，`More runs` 按 offset 追加；不一次性拉取全部历史 Run。 | [Goal Board](../README.md) | [Trajectory](../src/trajectory.tsx) |
| 轨迹时间线聚合 | 头部已提交事件总数与类型分布取自服务端 timeline 聚合，不受当前事件页限制；概览轨道仍只覆盖当前事件页。 | [Goal Board](../README.md) | [Trajectory](../src/trajectory.tsx)、[轨迹 API](../src/api.ts) |
| Prompt 记录 | 模型输入按调用折叠为一条记录，消息正文只在模型输入检查器中展开，不进入主事件流。 | [Goal Board](../README.md) | [TrajectoryRecords](../src/trajectory-records.tsx) |
| 轨迹详情覆盖层 | 窄屏下详情覆盖记录列表，列表保持全宽；Trajectory 页不渲染输入区。 | [Goal Board](../README.md) | [Trajectory](../src/trajectory.tsx)、[样式](../src/trajectory.css) |
| Think activity | 同一 Step 内独立展示的显式思考目标、进行状态及已提交分析；可定位原轨迹。 | [Goal Board](../README.md) | [活动投影](../src/activity-projector.ts)、[轨迹详情](../src/trajectory-event-summary.tsx) |
| 审批参数编辑与审阅 | 同一工具的 JSON 参数编辑、只读预检与原／最终参数差异确认；再次编辑使旧审阅失效。 | [Goal Board](../README.md) | [交互面板](../src/interaction-panel.tsx) |
| 步骤内进度 | 当前 Run 的公开进度按真实执行单元或 Action 放入对应节点折叠内容；未保存单元显示临时步骤，无身份不猜测归属，等待或终态隐藏临时进度。最多缓存二十条，不显示独立面板或推理正文。 | [Goal Board](../README.md) | [进度投影](../src/execution-progress.ts)、[时间线](../src/components/SessionTimeline.tsx) |
| 执行过程回看 | 终态保留本次连接日志；刷新从 Activity 恢复已提交的诊断、工具生命周期和审批记录。 | [Goal Board](../README.md) | [时间线](../src/components/SessionTimeline.tsx) |
| 跨页活动上下文 | 按 Run 及阶段恢复标题，阶段／Action 来源未全部加载时保留完整性提示；相邻页合并后更新。 | [Goal Board](../README.md) | [时间线投影](../src/session-timeline.ts)、[Activity 窗口](../src/activity-page-window.ts) |
| Bash 活动标题 | 简单命令按确定性规则显示 Git 或测试操作；复杂／未知调用显示通用 Shell 标题。归组组合不同操作，命令摘要与结果留在展开详情。 | [Goal Board](../README.md) | [ActivityProjector](../src/activity-projector.ts)、[SessionTimeline](../src/components/SessionTimeline.tsx) |
| Activity 技术详情筛选 | 工具／检索摘要及重要状态始终保留；Think 和独立授权／执行等技术事实受开关控制，不因带有详情而例外。活动详情可独立展开。 | [Goal Board](../README.md) | [SessionTimeline](../src/components/SessionTimeline.tsx) |

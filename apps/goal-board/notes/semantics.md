# Goal Board语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Workspace shell | 当前工作区的紧凑导航、详情、Goal 搜索与可收起最近列表；侧栏可隐藏及拖动调宽，宽度仅保存在页面内。 | [Goal Board](../README.md) | [WorkspaceShell](../src/components/WorkspaceShell.tsx)、[ResizableSidebar](../src/components/ResizableSidebar.tsx) |
| Settings page | 侧栏底部进入 Provider 管理页，切换时保留当前会话。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx)、[模块说明](./overview.md) |
| Session view | 首屏并行读取不含历史的 Goal 状态与固定水位 Activity 页；完整会话按需用于 Plan、Trajectory 和 Goal details。 | [Goal Board](../README.md) | [useGoalSession](../src/hooks/useGoalSession.ts)、[模块说明](./overview.md) |
| SessionTimeline | 按服务端 Run 内位置合并稳定来源身份，单列呈现消息、候选预览、活动事实、Run 边界与终态；候选按 `previewId` 在原展示身份转为正式消息。 | [Goal Board](../README.md) | [投影](../src/session-timeline.ts)、[视图](../src/components/SessionTimeline.tsx) |
| 固定 Activity 页 | 有界正文／安全活动读取带固定水位和 cursor；当前页面提示更早来源存在，但不自动翻页。 | [浏览器服务边界](../../../packages/browser/README.md) | [Activity API](../../../packages/browser/src/browser-goal-routes.ts)、[页面说明](./overview.md) |
| 输出速率展示 | 显示已结束模型调用的端到端输出速率；在调用完成事实更新后刷新。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 交互区域 | 按已提交等待种类分派的统一决定区：问答导航与审阅、任务范围审阅、工具能力与期限、未知结果恢复；替换旧三套表单。 | [Goal Board](../README.md) | [InteractionRegion](../src/interaction-panel.tsx) |
| 交互提交状态 | 编辑、提交中、待核验、已受理与失效的页面状态机；结果不明时冻结原身份与载荷，只允许核验或原身份重试。 | [Goal Board](../README.md) | [interaction-state.ts](../src/interaction-state.ts) |
| 交互详情读取 | 按当前 Goal／Run／交互引用读取完整问题、任务范围或 Action 输入；失败保留等待并禁用依赖完整范围的决定。 | [浏览器服务边界](../../../packages/browser/README.md) | [交互详情路由](../../../packages/browser/src/browser-goal-routes.ts) |
| 提案阶段路线 | 批准前显示 Plan Run 的完整候选阶段及各自验收条件。 | [Goal Board](../README.md) | [任务审批视图](../src/interaction-panel.tsx) |
| 获批 Run 路线 | Activity 时间线上独立呈现 Plan Run 当前完整阶段顺序、状态与验收条件。 | [Goal Board](../README.md) | [PlanRouteList](../src/components/PlanRouteList.tsx) |
| ActivityGroup | 从固定 Activity 页的已提交事实与安全实时事件派生的纯分组投影；断组由完整交错来源决定，正文、交互、未知事实与阶段边界都会断开相邻成员，隐藏正文不改变该判定。 | [Goal Board](../README.md) | [ActivityProjector](../src/activity-projector.ts) |
| 活动成员状态 | 区分执行中、重试、结果待保存、已提交失败／成功与已拒绝；实时返回不标为已保存成功，已提交 Observation 才决定终态。 | [Goal Board](../README.md) | [ActivityProjector](../src/activity-projector.ts) |
| Live Activity | 当前 Goal SSE 的公开生成与连接状态；候选正文不持久化，保存通知后仍待固定 Activity 页核验。 | [Goal Board](../README.md) | [useRunStream](../src/hooks/useRunStream.ts) |
| GoalSessionContext | 局部持有 Goal 窄状态、固定 Activity 页、按需完整会话及视图状态。 | [Goal Board](../README.md) | [上下文契约](../src/context/GoalSessionContext.tsx) |
| RunControlContext | 隔离指令分发、客户端排队有限状态机与原子单飞防重锁的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 已受理队列投影 | Runtime Snapshot 中的待处理普通消息、队列修订与暂停原因；页面只读取该投影，不再镜像本地任务或由前端 effect 启动后继 Run。 | [Goal Board](../README.md) | [Session Projection](../../../packages/browser/src/browser-projection.ts) |
| 本地草稿 | 仅保存在输入框的未提交文本；提交中、拒绝与结果不明时保留，受理成功后由服务端收据接管。 | [Goal Board](../README.md) | [MessageComposer](../src/components/MessageComposer.tsx) |
| 会话渐进加载 | 当前只呈现固定 Activity 页并提示页外历史；游标导航和阅读锚点恢复尚未接入页面。 | [Goal Board](../README.md) | [SessionTimeline](../src/components/SessionTimeline.tsx) |
| 会话输出消费 | 页面消费同一条 Goal SSE：保存不明的候选保持待核验；正式 Activity 以同一展示 key 替换候选；确定作废后保留最多八份可释放旧稿，换 Goal 或重连清除临时正文。 | [Goal Board](../README.md) | [会话输出归约](../src/session-output-consumer.ts) |
| 普通发送与显式 Steer | Enter 直接走普通消息受理并排队；Shift+Enter 换行，输入法组合期间不提交。Steer 是独立次操作，说明它修改当前任务而不是排队；拒绝保留草稿且不降级为排队。 | [Goal Board](../README.md) | [输入控制语义](../src/session-controls.ts)、[输入区](../src/components/MessageComposer.tsx) |
| 独立 Stop run | 中断入口不依赖输入框是否有草稿；停止中、收尾、审批与最终取消各按真实状态呈现，Stopping 不等于已取消。 | [Goal Board](../README.md) | [输入区](../src/components/MessageComposer.tsx) |
| 不确定提交核验 | 受理结果不明时保留原 `inputId` 与冻结载荷，只提供按原身份核验收据或重试；明确拒绝保留可编辑草稿。 | [Goal Board](../README.md) | [输入控制语义](../src/session-controls.ts)、[运行命令](../src/hooks/useRunCommands.ts) |
| 渲染错误边界 | 会话与轨迹视图的渲染异常被边界捕获，显示错误卡与重载入口，不整页白屏。 | [Goal Board](../README.md) | [SessionBoundary](../src/components/error-boundary.tsx) |
| liveText 帧合并 | 打字机增量按帧合并后提交渲染，跟随滚动以帧节流，流结束不丢字。 | [Goal Board](../README.md) | [live-text-batch](../src/live-text-batch.ts) |
| Provider 设置页 | 受管 Provider 紧凑列表与按需展开表单；区分凭据已保存、激活与目录检查状态，不回显已保存密钥。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx) |
| 来源两级选择 | 模型选择器先选 Provider 来源再选模型，结果写入对应偏好或 Goal 选择。 | [Goal Board](../README.md) | [ModelPicker](../src/components/ModelPicker.tsx) |
| Fetch models | 用当前表单查询在线模型并填入默认模型，不保存档案。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx) |
| Think activity | 同一 Step 内独立展示的显式思考目标、进行状态及已提交分析；可定位原轨迹。 | [Goal Board](../README.md) | [活动投影](../src/activity-projector.ts)、[轨迹详情](../src/trajectory-event-summary.tsx) |
| 审批参数编辑与审阅 | 同一工具的 JSON 参数编辑、只读预检与原／最终参数差异确认；再次编辑使旧审阅失效。 | [Goal Board](../README.md) | [交互面板](../src/interaction-panel.tsx) |

# Goal Board语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Workspace shell | 当前工作区的紧凑导航、详情、Goal 搜索与可收起最近列表；侧栏可隐藏及拖动调宽，宽度仅保存在页面内。 | [Goal Board](../README.md) | [WorkspaceShell](../src/components/WorkspaceShell.tsx)、[ResizableSidebar](../src/components/ResizableSidebar.tsx) |
| Settings page | 侧栏底部进入 Provider 管理页，切换时保留当前会话。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx)、[模块说明](./overview.md) |
| Session view | 从服务读取的会话视图；刷新失败保留已保存内容与草稿，并暂停提交。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 输出速率展示 | 显示已结束模型调用的端到端输出速率；在调用完成事实更新后刷新。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 交互区域 | 按已提交等待种类分派的统一决定区：问答导航与审阅、任务范围审阅、工具能力与期限、未知结果恢复；替换旧三套表单。 | [Goal Board](../README.md) | [InteractionRegion](../src/interaction-panel.tsx) |
| 交互提交状态 | 编辑、提交中、待核验、已受理与失效的页面状态机；结果不明时冻结原身份与载荷，只允许核验或原身份重试。 | [Goal Board](../README.md) | [interaction-state.ts](../src/interaction-state.ts) |
| 交互详情读取 | 按当前 Goal／Run／交互引用读取完整问题、任务范围或 Action 输入；失败保留等待并禁用依赖完整范围的决定。 | [浏览器服务边界](../../../packages/browser/README.md) | [交互详情路由](../../../packages/browser/src/browser-goal-routes.ts) |
| 提案阶段路线 | 批准前显示 Plan Run 的完整候选阶段及各自验收条件。 | [Goal Board](../README.md) | [任务审批视图](../src/interaction-panel.tsx) |
| 获批 Run 路线 | Activity 时间线上独立呈现 Plan Run 当前完整阶段顺序、状态与验收条件。 | [Goal Board](../README.md) | [PlanRouteList](../src/components/PlanRouteList.tsx) |
| ActivityGroup | 从相邻且相关的真实调用派生的可展开展示组；不持久化且不影响 Runtime。 | [Goal Board](../README.md) | [ActivityProjector](../src/activity-projector.ts) |
| Live Activity | 当前 Run 的短期公开活动；按来源身份去重并通过 Action ID 对齐已提交步骤。 | [Goal Board](../README.md) | [useRunStream](../src/hooks/useRunStream.ts) |
| GoalSessionContext | 隔离当前活动 Goal 会话快照、时间轴、指标与视图状态的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| RunControlContext | 隔离指令分发、客户端排队有限状态机与原子单飞防重锁的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 已受理队列投影 | Runtime Snapshot 中的待处理普通消息、队列修订与暂停原因；页面只读取该投影，不再镜像本地任务或由前端 effect 启动后继 Run。 | [Goal Board](../README.md) | [Session Projection](../../../packages/browser/src/browser-projection.ts) |
| 本地草稿 | 仅保存在输入框的未提交文本；提交中、拒绝与结果不明时保留，受理成功后由服务端收据接管。 | [Goal Board](../README.md) | [MessageComposer](../src/components/MessageComposer.tsx) |
| 会话渐进加载 | 超过阈值的长会话按完整 Run 边界从最近窗口渲染，顶部按钮按 Run 向上扩页并保持视口。 | [Goal Board](../README.md) | [session-window](../src/session-window.ts) |
| 会话输出消费 | 页面消费同一条 Goal SSE：未确认候选只进入临时区域，正式消息替换候选而不追加第二份正文，候选作废后临时正文清空。 | [Goal Board](../README.md) | [会话输出归约](../src/session-output-consumer.ts) |
| 渲染错误边界 | 会话与轨迹视图的渲染异常被边界捕获，显示错误卡与重载入口，不整页白屏。 | [Goal Board](../README.md) | [SessionBoundary](../src/components/error-boundary.tsx) |
| liveText 帧合并 | 打字机增量按帧合并后提交渲染，跟随滚动以帧节流，流结束不丢字。 | [Goal Board](../README.md) | [live-text-batch](../src/live-text-batch.ts) |
| Provider 设置页 | 受管 Provider 紧凑列表与按需展开表单；区分凭据已保存、激活与目录检查状态，不回显已保存密钥。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx) |
| 来源两级选择 | 模型选择器先选 Provider 来源再选模型，结果写入对应偏好或 Goal 选择。 | [Goal Board](../README.md) | [ModelPicker](../src/components/ModelPicker.tsx) |
| Fetch models | 用当前表单查询在线模型并填入默认模型，不保存档案。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx) |
| Think activity | 同一 Step 内独立展示的显式思考目标、进行状态及已提交分析；可定位原轨迹。 | [Goal Board](../README.md) | [活动投影](../src/activity-projector.ts)、[轨迹详情](../src/trajectory-event-summary.tsx) |

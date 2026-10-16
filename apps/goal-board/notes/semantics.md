# Goal Board语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Workspace shell | 当前工作区的紧凑导航、详情、Goal 搜索与可收起最近列表；侧栏可隐藏及拖动调宽，宽度仅保存在页面内。 | [Goal Board](../README.md) | [WorkspaceShell](../src/components/WorkspaceShell.tsx)、[ResizableSidebar](../src/components/ResizableSidebar.tsx) |
| Settings page | 侧栏底部进入的设置页框架；仅展示空状态，不读写配置。 | [Goal Board](../README.md) | [SettingsPage](../src/components/SettingsPage.tsx)、[模块说明](./overview.md) |
| Session view | 从服务读取的会话视图；刷新失败保留已保存内容与草稿，并暂停提交。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 输出速率展示 | 显示已结束模型调用的端到端输出速率；在调用完成事实更新后刷新。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| Pending interaction | 等待用户处理的当前请求。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 提案阶段路线 | 批准前显示 Plan Run 的完整候选阶段及各自验收条件。 | [Goal Board](../README.md) | [审批卡片](../src/panels.tsx) |
| 获批 Run 路线 | Activity 时间线上独立呈现 Plan Run 当前完整阶段顺序、状态与验收条件。 | [Goal Board](../README.md) | [PlanRouteList](../src/components/PlanRouteList.tsx) |
| ActivityGroup | 从相邻且相关的真实调用派生的可展开展示组；不持久化且不影响 Runtime。 | [Goal Board](../README.md) | [ActivityProjector](../src/activity-projector.ts) |
| Live Activity | 当前 Run 的短期公开活动；按来源身份去重并通过 Action ID 对齐已提交步骤。 | [Goal Board](../README.md) | [useRunStream](../src/hooks/useRunStream.ts) |
| GoalSessionContext | 隔离当前活动 Goal 会话快照、时间轴、指标与视图状态的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| RunControlContext | 隔离指令分发、客户端排队有限状态机与原子单飞防重锁的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| Queue 持久化 | 内存队列按 Goal 以独立 key 镜像到浏览器 `localStorage`，刷新后打开同一 Goal 自动恢复；损坏数据清空恢复，存储失败降级内存。 | [Goal Board](../README.md) | [queue-persistence](../src/queue-persistence.ts) |
| 会话渐进加载 | 超过阈值的长会话按完整 Run 边界从最近窗口渲染，顶部按钮按 Run 向上扩页并保持视口。 | [Goal Board](../README.md) | [session-window](../src/session-window.ts) |
| 渲染错误边界 | 会话与轨迹视图的渲染异常被边界捕获，显示错误卡与重载入口，不整页白屏。 | [Goal Board](../README.md) | [SessionBoundary](../src/components/error-boundary.tsx) |
| liveText 帧合并 | 打字机增量按帧合并后提交渲染，跟随滚动以帧节流，流结束不丢字。 | [Goal Board](../README.md) | [live-text-batch](../src/live-text-batch.ts) |

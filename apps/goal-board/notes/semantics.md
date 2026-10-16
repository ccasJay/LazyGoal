# Goal Board语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Session view | 从服务读取的会话视图；刷新失败保留已保存内容与草稿，并暂停提交。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 输出速率展示 | 显示已结束模型调用的端到端输出速率；在调用完成事实更新后刷新。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| Pending interaction | 等待用户处理的当前请求。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| 提案阶段路线 | 批准前显示 Plan Run 的完整候选阶段及各自验收条件。 | [Goal Board](../README.md) | [审批卡片](../src/panels.tsx) |
| 获批 Run 路线 | Activity 时间线上独立呈现 Plan Run 当前完整阶段顺序、状态与验收条件。 | [Goal Board](../README.md) | [PlanRouteList](../src/components/PlanRouteList.tsx) |
| ActivityGroup | 从相邻且相关的真实调用派生的可展开展示组；不持久化且不影响 Runtime。 | [Goal Board](../README.md) | [ActivityProjector](../src/activity-projector.ts) |
| Live Activity | 当前 Run 的短期公开活动；按来源身份去重并通过 Action ID 对齐已提交步骤。 | [Goal Board](../README.md) | [useRunStream](../src/hooks/useRunStream.ts) |
| GoalSessionContext | 隔离当前活动 Goal 会话快照、时间轴、指标与视图状态的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| RunControlContext | 隔离指令分发、客户端排队有限状态机与原子单飞防重锁的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |

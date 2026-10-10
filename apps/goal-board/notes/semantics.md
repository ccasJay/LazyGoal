# Goal Board语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Session view | 从服务读取的会话视图。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| Pending interaction | 等待用户处理的当前请求。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| GoalSessionContext | 隔离当前活动 Goal 会话快照、时间轴、指标与视图状态的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |
| RunControlContext | 隔离指令分发、客户端排队有限状态机与原子单飞防重锁的局部上下文。 | [Goal Board](../README.md) | [模块说明](./overview.md) |

# 持久化实现

Snapshot、Trajectory JSONL 与可重建查询索引、Profile 和调用事实的文件 Schema 与 Store，并提供 Supervisor 所有权锁及 SQLite TriggerStore。Worker 自有进程日志持久化离线 outbox 和检查点；Supervisor Store 直接保存不可变 Trigger、路由状态、Goal 派发队列与恢复状态。主要文件 DTO 的结构 Schema 由 Catalog 从 TS 类型生成并供真实读取路径消费。Goal Snapshot 保存动态模型的非敏感执行协议、容量与模型能力，Plan Run 完整路线也随快照恢复。

阅读 [模块说明](./notes/overview.md)、[语义表](./notes/semantics.md)。

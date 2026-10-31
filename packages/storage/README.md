# 持久化实现

Snapshot、Trajectory、Profile 和调用事实的文件 Schema 与 Store；主要文件 DTO 的结构 Schema 由 Catalog 从 TS 类型生成并供真实读取路径消费。Goal Snapshot 保存动态模型的非敏感执行协议与容量，Plan Run 完整路线也随快照恢复。

阅读 [模块说明](./notes/overview.md)、[语义表](./notes/semantics.md)。

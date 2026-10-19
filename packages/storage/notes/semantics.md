# 持久化实现语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Snapshot | Goal 最新完整持久化状态。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| 输入账本快照 | 每条已受理输入的稳定身份、载荷摘要、受理序号与状态；不复制正文。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 消息队列快照 | 尚未应用的普通消息 FIFO、队列修订与暂停原因。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 消息身份快照 | 每条正式消息持久化的 `messageId`、所属 `runId`、判别式来源与助手用途；同一 Goal 内身份与来源各自唯一。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 提交修订快照 | Goal 级单调提交修订，随每次成功提交递增。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| Trajectory | 已提交执行事实记录。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| 模型调用指标 JSONL | 保存用量、可选请求耗时及覆盖缺口；不参与 Goal 恢复。 | [持久化实现](../README.md) | [指标 Store](../src/json-file-metrics-store.ts) |
| 阶段快照 | Goal Snapshot 中 Run 内部活动阶段或最新已接受阶段的可恢复状态。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| Plan Run 路线快照 | 获批 Plan Run 的完整有序阶段、修订理由与游标；按 Snapshot 提交边界恢复。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 批次进度指针 | 多调用批次中尚未暂存的业务 Action 及其顺序，与队首共同决定恢复位置。 | [Storage](../README.md) | [Goal Snapshot 协议](../src/goal-snapshot.ts) |

# 持久化实现语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| Snapshot | Goal 最新完整持久化状态。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| 动态模型执行快照 | Goal 选择保存 API 协议与容量，不保存端点或凭据。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 输入账本快照 | 每条已受理输入的稳定身份、载荷摘要、受理序号与状态；不复制正文。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 消息队列快照 | 尚未应用的普通消息 FIFO、队列修订与暂停原因。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 消息身份快照 | 每条正式消息持久化 `messageId`、所属 `runId`、Run 内 `position`、判别式来源与助手用途；位置受 Run 边界和 Snapshot 顺序约束。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 提交修订快照 | Goal 级单调提交修订，随每次成功提交递增。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| Trajectory | 已提交执行事实记录。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| Goal 目录扫描 | 正式快照目录的摘要扫描：可恢复扫描遇损坏快照失败关闭；历史扫描跳过无法解码的快照并计数上报。 | [持久化实现](../README.md) | [Goal Store](../src/goal-store.ts) |
| 模型调用指标 JSONL | 保存用量、可选请求耗时及覆盖缺口；不参与 Goal 恢复。 | [持久化实现](../README.md) | [指标 Store](../src/json-file-metrics-store.ts) |
| 阶段快照 | Goal Snapshot 中 Run 内部活动阶段或最新已接受阶段的可恢复状态。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| Plan Run 路线快照 | 获批 Plan Run 的完整有序阶段、修订理由与游标；按 Snapshot 提交边界恢复。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 批次进度指针 | 多调用批次中尚未暂存的业务 Action 及其顺序，与队首共同决定恢复位置。 | [Storage](../README.md) | [Goal Snapshot 协议](../src/goal-snapshot.ts) |
| 最终执行版本快照 | 已获批 Action 的原请求引用与最终 canonical 参数；获批后不可再编辑，恢复沿用同一版本。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 恢复身份快照 | 结果未知等待的稳定恢复身份；跨重启保留，同一 Action 再次未知时改变。 | [持久化实现](../README.md) | [Snapshot Schema](../src/goal-snapshot.ts) |
| 用户中断状态 | 已受理到取消结算的两阶段记录及未知工具效果，不含模型收尾。 | [Goal Runtime](../../runtime/README.md) | [Runtime 中断语义](../../runtime/notes/overview.md) |
| 生成文件绑定 | Catalog 从 Storage 文件 DTO 生成的结构 Schema 与 `contract-binding` 读取器；真实读取路径以 `reject` 策略消费，不维护第二份字段表。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| 文件语义校验 | 生成结构绑定无法表达的字段级约束、摘要格式、身份一致性、版本与跨字段不变量；留在对应 Store 或 Codec。 | [持久化实现](../README.md) | [文件契约清单](./file-contracts.md) |
| 写入原语 | `atomicWriteJson`、`appendJsonl` 与 `appendFileChunk` 的统一实现：临时文件、创建权限、可选 `fsync`、核对后重试与失败清理。 | [持久化实现](../README.md) | [写入原语](../src/json-file-write.ts) |
| 创建权限策略 | storage 新建文件为 `0600`、新建目录为 `0700`；只作用于创建，不追溯已有路径。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| 按键串行队列 | 同一 key 的进程内 FIFO 执行、失败隔离、簿记释放与 `drain` 读己之写。 | [持久化实现](../README.md) | [串行队列](../src/keyed-serial-queue.ts) |
| 缺失目录阶段语义 | 原子替换默认逐阶段抛出 `ENOENT`；只有调用点显式声明时才缩小静默范围。 | [持久化实现](../README.md) | [模块说明](./overview.md) |
| 轨迹查询索引 | 单 Run 的 SQLite 元数据索引：事件顺序、JSONL 字节位置与 Action/ModelCall/Program 关联；可删除并从 JSONL 重建。 | [持久化实现](../README.md) | [轨迹索引](../src/trajectory-index.ts) |

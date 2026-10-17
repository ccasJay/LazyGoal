# 进程会话运行时语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| ProcessManager | 宿主拥有的后台进程会话管理入口。 | [进程会话运行时](../README.md) | [模块说明](./overview.md) |
| 并发额度 | 每 Goal 4、宿主 16 个活跃进程与每 Goal 32 项历史记录上限，只覆盖单个管理器。 | [进程会话运行时](../README.md) | [管理器实现](../src/process-manager.ts) |
| 结算失败 | 已知生命周期失败的阶段分类、会话身份与原始原因保留。 | [进程会话运行时](../README.md) | [错误契约](../src/errors.ts) |
| 输出结算 | 按通道串行追加、退出后等待已接收写入，等待仅负责唤醒。 | [进程会话运行时](../README.md) | [管理器实现](../src/process-manager.ts) |
| ProcessSessionStore | 进程记录与轮转日志的持久化 Port。 | [Goal Runtime](../../runtime/README.md) | [进程会话 Port](../../runtime/src/process-session-store.ts) |
| 轮转日志与中断投影 | 磁盘 Schema、分片轮转、绝对字节游标与旧宿主 `interrupted` 投影。 | [持久化实现](../../storage/README.md) | [JSON 进程 Store](../../storage/src/json-file-process-session-store.ts) |
| 受限 spawn 与进程组终止 | 独立进程组启动及两阶段信号发送机制。 | [沙箱执行](../../sandbox/README.md) | [受限进程](../../sandbox/src/restricted-process.ts) |
| 进程工具 | `process_start`/`process_read`/`process_stop` 的契约、授权与结果映射。 | [内置工具](../../tools/README.md) | [进程工具实现](../../tools/src/process-tools.ts) |

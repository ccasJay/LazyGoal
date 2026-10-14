# 共享评测框架语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| HeadlessCompositionRoot | 单任务装配及显式多阶段 Goal 会话。 | [共享评测框架](../README.md) | [模块说明](./overview.md) |
| Attempt | 一次评测尝试的独立事实。 | [共享评测框架](../README.md) | [模块说明](./overview.md) |

| Benchmark task source | 工程任务来源、环境和独立评分端口。 | [共享评测层](../README.md) | [来源契约](../src/task-source.ts) |
| Filesystem archive | 停止 Agent 后的完整可导入容器镜像工件。 | [共享评测层](../README.md) | [归档契约](../src/filesystem-archive.ts) |
| Scripted Worker | 领域工具注入的共享真实 Runtime 会话 Worker。 | [共享评测层](../README.md) | [Worker 契约](../src/scripted-worker.ts) |

# 执行控制语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| ExecutionControl | 执行取消信号契约。 | [执行控制](../README.md) | [模块说明](./overview.md) |
| ModelRequestFailure | 不进入协议纠错、也不授予重试资格的模型请求失败。 | [执行控制](../README.md) | [请求故障契约](../src/model-request-failure.ts) |
| ContextWindowRejectedError | 供应商明确以超出上下文窗口拒绝；Runtime 据此整理一次并只重试一次。 | [执行控制](../README.md) | [请求故障契约](../src/model-request-failure.ts) |
| TransientModelRequestFailure | 可重试模型请求故障。 | [执行控制](../README.md) | [模块说明](./overview.md) |

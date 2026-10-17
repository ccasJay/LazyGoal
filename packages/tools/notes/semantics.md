# 内置工具语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| BashTool | 受控 Shell 工具。 | [内置工具](../README.md) | [模块说明](./overview.md) |
| ReadFileTool | 文件读取工具。 | [内置工具](../README.md) | [模块说明](./overview.md) |
| 进程工具 | `process_start`/`process_read`/`process_stop` 的输入契约、可信身份与结果映射。 | [内置工具](../README.md) | [进程工具实现](../src/process-tools.ts) |
| 受管进程管理器 | 会话归属、额度、停止与自有句柄结算。 | [进程会话运行时](../../process-runtime/README.md) | [管理器实现](../../process-runtime/src/process-manager.ts) |

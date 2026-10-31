# 工具核心语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| ToolDefinition | 模型可见的 Tool 身份、说明、可选发现别名与只读分类。 | [工具核心](../README.md) | [模块说明](./overview.md) |
| BoundToolDefinition | 在 ToolDefinition 上增加权威 `inputBinding` 的可注册定义。 | [工具核心](../README.md) | [类型契约](../src/types.ts) |
| `isReadOnly` 分类 | 标识工具副作用属性；仅用于 Plan Run 获批前的 Runtime 只读门。 | [工具核心](../README.md) | [ToolDefinition](../src/types.ts) |
| 输入绑定读取 | 隔离复制、已知字段拒绝、未知字段剥离和有界诊断；成功数据进入语义校验。 | [工具核心](../README.md) | [注册实现](../src/registration.ts) |
| ToolRegistration | 已绑定输入读取与语义校验的工具。 | [工具核心](../README.md) | [模块说明](./overview.md) |
| ToolRegistry | 按标识查找工具的内存注册表。 | [工具核心](../README.md) | [模块说明](./overview.md) |

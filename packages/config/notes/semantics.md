# 配置解析语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LazyGoal Home | 运行时数据及配置根目录。 | [配置解析](../README.md) | [模块说明](./overview.md) |
| Profile | 运行配置的命名覆盖层。 | [配置解析](../README.md) | [模块说明](./overview.md) |
| Provider 档案 | 用户维护的多份 Provider 连接配置（含凭据）与其激活标识；Home 级持久化，凭据不进入 Goal、Trajectory 或 Trace。 | [配置解析](../README.md) | [Provider Profile Store](../src/provider-profile-store.ts) |
| Provider 规则 | 供应商白名单、strict 门禁、`baseURL` 允许集合与容量判定的单一来源。 | [配置解析](../README.md) | [Provider Rules](../src/provider-rules.ts) |

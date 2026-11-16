# 配置解析语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| LazyGoal Home | 运行时数据及配置根目录。 | [配置解析](../README.md) | [模块说明](./overview.md) |
| Profile | 运行配置的命名覆盖层；`[llm]` 只引用供应商与模型。 | [配置解析](../README.md) | [TOML 契约](../src/toml-config.ts) |
| providers 小节 | `[providers.<family>.<name>]` 声明连接、`models[]` 元数据与可选能力位；家族集合由组合根注入。 | [配置解析](../README.md) | [TOML 契约](../src/toml-config.ts) |
| 供应商声明投影 | 不含凭据的供应商与模型事实，供组合根生成目录来源。 | [配置解析](../README.md) | [加载器](../src/config-loader.ts) |
| Provider 档案 | 用户维护的多份 Provider 连接配置（含凭据）与其激活标识；Home 级持久化，凭据不进入 Goal、Trajectory 或 Trace。 | [配置解析](../README.md) | [Provider Profile Store](../src/provider-profile-store.ts) |
| Provider 规则 | 供应商白名单、strict 门禁、`baseURL` 允许集合与容量判定的单一来源。 | [配置解析](../README.md) | [Provider Rules](../src/provider-rules.ts) |
| LLMConfig 与配置错误 | 共享模型连接契约与唯一配置错误构造器；本包只负责读取、合并与校验。 | [LLM 核心契约](../../llm-core/README.md) | [配置契约](../../llm-core/notes/overview.md) |

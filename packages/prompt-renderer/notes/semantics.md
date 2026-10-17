# Prompt 渲染语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| PromptBundleRenderer | 按版本与阶段渲染固定 system 与动态 section。 | [Prompt 渲染](../README.md) | [模块说明](./overview.md) |
| PromptBundleManifest | 显式声明组成、阶段映射与渲染顺序的 Bundle。 | [Prompt 渲染](../README.md) | [类型契约](../src/types.ts) |
| PromptBundleRegistry | 校验模板引用与 Manifest 结构的注册表。 | [Prompt 渲染](../README.md) | [注册表](../src/registry.ts) |
| InMemoryLoader | 只接受已注册模板 ID 的内存 Loader。 | [Prompt 渲染](../README.md) | [Loader](../src/loader.ts) |
| 封闭渲染环境 | 启用稳定 Filter 与确定性换行的 Nunjucks 环境。 | [Prompt 渲染](../README.md) | [环境](../src/environment.ts) |
| DynamicSectionRegistry | 按显式定义投影动态 section 的通用机制。 | [Prompt 渲染](../README.md) | [注册机制](../src/dynamic-section-registry.ts) |
| PromptRenderError | 只含版本、slot 与模板 ID 的脱敏渲染错误。 | [Prompt 渲染](../README.md) | [错误契约](../src/errors.ts) |
| 版本拒绝 | 未注册版本或协议不匹配时不回退。 | [Prompt 渲染](../README.md) | [注册表](../src/registry.ts) |

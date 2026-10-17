# Prompt Bundle 语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| 模板真源 | 当前唯一 `.njk` 资产与其稳定 ID、来源 URL。 | [Prompt Bundle](../README.md) | [默认装配](../src/default-bundles.ts) |
| Bundle v1 Manifest | 固定 slot 顺序与 Decide/Think 映射的当前组合。 | [Prompt Bundle](../README.md) | [默认装配](../src/default-bundles.ts) |
| 默认动态 Section | run_mode、任务、GoalPlan、工具、Memory 与导航的投影定义。 | [Prompt Bundle](../README.md) | [默认 Section](../src/default-dynamic-sections.ts) |
| 默认协议适配 | 只接受 structured@1 + trajectory-layered@1 + bm25-lite@1 + v1。 | [Prompt Bundle](../README.md) | [默认装配](../src/default-bundles.ts) |
| 默认 Renderer | 显式加载当前资产并装配注册机制的工厂。 | [Prompt Bundle](../README.md) | [默认装配](../src/default-bundles.ts) |

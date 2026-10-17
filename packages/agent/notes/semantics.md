# Agent 默认装配语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| createAgentExecutor | 解析默认 Renderer/裁剪策略并构造执行器的工厂。 | [Agent 默认装配](../README.md) | [工厂入口](../src/create-agent-executor.ts) |
| AgentExecutorOptions | 工厂参数契约与可选的 Renderer、裁剪策略覆盖。 | [Agent 默认装配](../README.md) | [工厂入口](../src/create-agent-executor.ts) |
| 默认模板选择 | 未显式注入 Renderer 时使用当前唯一 Prompt Bundle。 | [Prompt Bundle](../../prompt-bundle/README.md) | [默认装配](../../prompt-bundle/src/default-bundles.ts) |

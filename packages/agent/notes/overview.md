# Agent 默认装配

本包只提供默认模型执行器工厂 [`createAgentExecutor`](../src/create-agent-executor.ts) 与自身 [`AgentExecutorOptions`](../src/create-agent-executor.ts) 参数契约；它不保存能力实现，也不作为统一转导出入口。公开入口是 [src/index.ts](../src/index.ts)。

## 装配行为

工厂解析两个默认值并构造 [模型执行协调](../../model-execution/README.md) 的执行器：

- 未提供 `renderer` 时使用 [Prompt Bundle](../../prompt-bundle/README.md) 的当前默认 Renderer；模板缺失、语法或配置错误在构造期抛出，不静默选择其它模板。
- 未提供 `contextCompactor` 时使用 [上下文预算](../../context-budget/README.md) 的 `DropOldestContextCompactor`。

其余依赖（Adapter 或 Binding Provider、Trace Sink、Model Input Store、指标 Recorder、轨迹组装器、模型能力）原样传给执行器；显式注入的 Renderer 与裁剪策略原样使用。工厂是异步的：调用方等待返回后获得满足现有 `StepExecutor` 契约的执行器。

## 边界

工厂不解析环境变量、TOML/Profile，不创建 Provider、Store、工具集、Runner 或关闭管理器；不注册进程信号、不退出进程、不创建 Goal，也不调用模型或工具。借用依赖继续由宿主拥有，本包不提供执行器关闭或全局资源管理机制。需要精确控制的调用方可直接构造 [模型执行协调](../../model-execution/README.md) 的 `LLMStepExecutor`。

各能力的当前实现与限制见其拥有者文档：[上下文预算](../../context-budget/README.md)、[模型视图](../../model-view/README.md)、[模型上下文组装](../../model-context/README.md)、[Prompt 渲染](../../prompt-renderer/README.md)、[Prompt Bundle](../../prompt-bundle/README.md)、[模型请求准备](../../model-request/README.md)、[模型响应解码](../../model-response/README.md)、[模型调用](../../model-call/README.md)、[模型执行协调](../../model-execution/README.md)。

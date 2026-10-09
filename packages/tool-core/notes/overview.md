# 工具核心

本包提供不依赖 Goal、GoalStore 或 Runner 的工具定义和执行注册表。Runtime 负责权限、提交与重试边界；具体文件或 Shell Tool 在 [Tools](../../tools/README.md)。

## 输入与执行

[createToolRegistration](../src/registration.ts) 把 Tool Input Contract 的结构解析与语义校验绑定为一次准备过程；[InMemoryToolRegistry](../src/registry.ts) 按工具 ID 查找注册项。[类型契约](../src/types.ts) 规定请求、Observation 与可选流事件。调用方不能跳过已注册的输入准备后直接把模型 JSON 当可信参数。

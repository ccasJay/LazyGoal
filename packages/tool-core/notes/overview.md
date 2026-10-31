# 工具核心

本包提供不依赖 Goal、GoalStore 或 Runner 的工具定义和执行注册表。Runtime 负责权限、提交与重试边界；具体文件或 Shell Tool 在 [Tools](../../tools/README.md)。

## 输入与执行

[createToolRegistration](../src/registration.ts) 只接受带 `inputBinding` 的 [BoundTool](../src/types.ts)，在 `prepare` 中调用一次 `inputBinding.read(input, "strip")`。已知字段错误由绑定 Schema 和生成校验器拒绝；未知字段被移除并保留有界 `inputDiagnostic`，隔离后的 canonical 输入再进入 Tool 语义校验与执行闭包。[InMemoryToolRegistry](../src/registry.ts) 按工具 ID 查找注册项。调用方不能跳过已注册的输入准备后直接把模型 JSON 当可信参数。

`ToolDefinition` 仍保留供模型线消费的输入 AST；`BoundToolDefinition` 在其上增加权威绑定。与模型线联合切换后删除 `ToolDefinition.inputContract` 和过渡期 AST。`createTransitionalToolInputBinding` 只用于生成能力尚未覆盖整数注解的工具，不能作为真实集成证据。

`ToolDefinition.discoveryAliases` 是可选的工具发现名称，注册时复制保存；它不进入模型 Schema，也不改变 Tool 授权或执行权限。

`ToolDefinition.isReadOnly` 是实现者声明的副作用分类，不授予 Profile 权限。Plan Run 的任务获批前，Runtime 将它作为只读门依据，只公开和允许 `true` 的业务工具；普通 Run 与已批准 Plan Run 仍经过 Runtime 的常规授权和审批流程。

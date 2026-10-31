# 工具核心

本包提供不依赖 Goal、GoalStore 或 Runner 的工具定义和执行注册表。Runtime 负责权限、提交与重试边界；具体文件或 Shell Tool 在 [Tools](../../tools/README.md)。

## 输入与执行

[createToolRegistration](../src/registration.ts) 只接受带 `inputBinding` 的 [BoundTool](../src/types.ts)，在 `prepare` 中调用一次 `inputBinding.read(input, "strip")`。已知字段错误由绑定 Schema 和生成校验器拒绝；未知字段被移除并保留有界 `inputDiagnostic`，隔离后的 canonical 输入再进入 Tool 语义校验与执行闭包。[InMemoryToolRegistry](../src/registry.ts) 按工具 ID 查找注册项。调用方不能跳过已注册的输入准备后直接把模型 JSON 当可信参数。

`ToolDefinition` 只描述模型可见身份、说明、发现别名与只读分类；`BoundToolDefinition` 增加权威输入 `ContractBinding`，注册、准备、模型声明和远程 Worker 清单都消费该绑定。`ToolDefinition` 不再携带第二份输入 AST。生产工具全部消费 Catalog 生成的绑定；测试夹具使用 [JSON Schema 辅助函数](../test/binding-fixtures.ts) 构造隔离绑定，不读取旧 Contract AST。

`ToolDefinition.discoveryAliases` 是可选的工具发现名称，注册时复制保存；它不进入模型 Schema，也不改变 Tool 授权或执行权限。

`ToolDefinition.isReadOnly` 是实现者声明的副作用分类，不授予 Profile 权限。Plan Run 的任务获批前，Runtime 将它作为只读门依据，只公开和允许 `true` 的业务工具；普通 Run 与已批准 Plan Run 仍经过 Runtime 的常规授权和审批流程。

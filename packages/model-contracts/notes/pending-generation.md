# 模型契约联合切换前置条件

本说明记录模型数据契约迁移在当前分支已完成的部分与仍需集成阶段完成的工作。生产请求、Runtime 校验与 Provider Adapter 仍消费 Contract AST；生成绑定与组合器已就绪，但尚未接入生产链路。

## 生成与绑定状态

[TS 契约类型](../src/model-output/schema-types.ts) 已作为模型输出与 system tools 的单源，并直接从生成能力线固定提交 `813c6b87` 继续。36 个模型根契约中已有 35 个以 `typescript-binding` 启用，生成 Schema、Ajv standalone 校验器、Manifest 与 `ContractBinding`，产物位于 [`src/generated`](../src/generated)，并由 [generated-bindings.ts](../src/model-output/generated-bindings.ts) 装配为 `modelOutputBindings`。

未生成的第 36 个根是 canonical `ToolCallAgentDecision`：它的 `action.input` 依赖共享包中的递归 `JsonValue`，而生成器的 `declaredTypes` 来源检查只接受契约文件内的声明，直接生成会要求复制共享 JSON 原语。模型线改用封闭的 [ToolCallDecisionEnvelope](../src/model-output/schema-types.ts) 作为 `tool_call` 生成根，并在组合时插入工具绑定的 `action.input`；canonical 类型保留到集成阶段随 Runtime 校验一起切换。

数组与整数约束已落在同源 JSDoc 上：

- AskUser `questions` 1–3、`options` 2–3；
- 路线阶段与阶段验收条件非空；
- Fact / Retire 证据非空，Context Lookup 过滤器最多 16 项；
- 证据序列、位置、修订号、分页与 step 索引使用 `JsonInteger`、`NonNegativeInteger`、`PositiveInteger`、`ContextLookupPageSize`，约束落在数组 `items` 或字段本身。

## 已由真实生成绑定验证

[生成绑定测试](../test/generated-bindings.test.ts) 直接使用 `modelOutputBindings`，覆盖：

- 35 个生成根装配与契约身份；
- Provider Schema 保留 `minItems`/`maxItems`、`items.type = integer` 与 `minimum`；
- 越界数组、负整数、分数整数元素拒绝；
- 未知字段剥离诊断、空/重复/未授权工具拒绝；
- strict 与 prompt-only 共用可移植 Schema 与 Shape Guide；
- 完成审查 accept/reject 与拒绝反馈约束。

## 联合切换剩余工作

1. 从工具线固定提交取得每个业务工具的 `BoundToolDefinition.inputBinding`，以其身份、说明和只读标记构造 [AuthorizedToolBinding](../src/model-output/bindings.ts)；工具发现与模型上下文投影不得继续读取第二份字段表。
2. 在 [请求构造](../../model-request/src/prompt.ts) 中用 `createBoundModelOutputContractBundle` 与 `createBoundUnifiedToolDeclarations` 替换 AST 工厂；`ModelOutputRequestPlan.bundle` 已消费 `ModelOutputBundle` 消费面。
3. 在 [Runtime 决策校验](../../runtime/src/runner.ts) 中改用生成的决策分支或等价的同源组合，替换 `AgentDecisionContract`；`tool_call` 的 `input` 继续由工具绑定校验。
4. 将未知字段剥离诊断接入现有 Trace 或等价旁路；不改变执行、审批、恢复或关闭语义。
5. 移除 Gemini Adapter 中按 `kind` 清理跨分支字段的手写表，改为由生成分支 Schema 驱动，并重跑 strict/prompt-only Provider 测试。
6. 移除范围内旧 AST、`wire.ts`、旧 `factory.ts` 与对应索引导出；扫描确认无生产消费者。
7. 运行 Model → Runtime → Tool 的 strict/prompt-only 联合场景、审批与恢复回归，以及全量 `npm test`。完成前不得宣称联合验收通过。

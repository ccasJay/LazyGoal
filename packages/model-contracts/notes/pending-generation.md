# 模型契约联合切换前置条件

本说明记录模型数据契约迁移在生成能力线与工具线实际提交到位前仍需完成的工作。当前分支的生产请求、Runtime 校验与 Provider Adapter 仍消费 Contract AST；组合器与绑定接口已就绪，但未接入生产链路。

## 生成能力状态

[TS 契约类型](../src/model-output/schema-types.ts) 与 [Catalog 登记](../../../contracts/catalog.json) 已就绪。截至本方向准备时，生成能力线的已验证提交已提供以下能力；集成时以协调者固定的提交为准，本分支不直接依赖这些提交：

- 判别联合与 `anyOf` wire 投影；
- 可空类型数组、required-nullable 与 canonical 解码；
- 联合分支选择、开放对象读取和本地约束清单。

仍缺少以下能力，启用前必须由生成能力线补齐或由协调者确认已有等价实现：

1. **整数区分**：TS `number` 无法区分整数；接受小数会放宽 sequence、证据索引与 GoalPlan revision 约束。
2. **数组长度与元素约束**：`minItems`、`maxItems` 与数组元素下界没有生成注解；缺失会放宽 AskUser 选项数量、证据数组非空与阶段验收条件约束。
3. **固定工具外壳**：开放 JSON 投影会明确失败，因此 `tool_call` 使用 [ToolCallDecisionEnvelope](../src/model-output/schema-types.ts) 的封闭外壳；组合器再从 `AuthorizedToolBinding.inputBinding` 插入并校验 `action.input`。集成不得改为把开放 JSON 直接送入生成投影。

Catalog 中的模型 TS 登记项当前为 `generation.state: "none"`。启用时把它们改为 `typescript-binding`，补齐 `rootType`、`declaredTypes`、`outputDirectory`、制品名和 binding 导出元数据，并保证 `npm run contracts:generate -- --check` 通过。

## 替身范围

[组合定向测试](../test/bound-factory.test.ts) 使用测试内的 `ContractBinding` 实现与少量手写本地 Schema，覆盖：

- 空授权、重复/空工具 ID、未授权或未知工具；
- 普通模式、Plan 未批准/已批准、Think、工具发现与 GoalPlan 能力；
- Checkpoint 与完成审查分支；
- 未知字段剥离诊断、非法已知字段、业务 `null` 与可选 `null`；
- 阶段工具身份注入与获批路线下一阶段限制。

这些替身只验证模型线组合逻辑，不代表生成制品、工具实际绑定或联合验收通过。

## 联合切换剩余工作

1. 从生成能力线固定提交生成全部根绑定，装配 [ModelOutputBindingSet](../src/model-output/bindings.ts)。
2. 从工具线固定提交取得每个业务工具的 `BoundToolDefinition.inputBinding`，以其身份、说明和只读标记构造 [AuthorizedToolBinding](../src/model-output/bindings.ts)；工具发现与模型上下文投影不得继续读取第二份字段表。
3. 在 [请求构造](../../model-request/src/prompt.ts) 中用 `createBoundModelOutputContractBundle` 与 `createBoundUnifiedToolDeclarations` 替换 AST 工厂；`ModelOutputRequestPlan.bundle` 已消费 `ModelOutputBundle` 消费面。
4. 在 [Runtime 决策校验](../../runtime/src/runner.ts) 中改用生成的决策分支或等价的同源组合，替换 `AgentDecisionContract`；`tool_call` 的 `input` 继续由工具绑定校验。
5. 将未知字段剥离诊断接入现有 Trace 或等价旁路；不改变执行、审批、恢复或关闭语义。
6. 移除 Gemini Adapter 中按 `kind` 清理跨分支字段的手写表，改为由生成分支 Schema 驱动，并重跑 strict/prompt-only Provider 测试。
7. 移除范围内旧 AST、`wire.ts`、旧 `factory.ts` 与对应索引导出；扫描确认无生产消费者。
8. 运行 Model → Runtime → Tool 的 strict/prompt-only 联合场景、审批与恢复回归，以及全量 `npm test`。完成前不得宣称联合验收通过。

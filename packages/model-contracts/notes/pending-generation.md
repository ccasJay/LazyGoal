# 模型契约联合切换前置条件

本说明记录模型数据契约迁移在生成能力线与工具线实际提交到位前仍需完成的工作。当前分支的生产请求、Runtime 校验与 Provider Adapter 仍消费 Contract AST；组合器与绑定接口已就绪，但未接入生产链路。

## 生成能力缺口

[TS 契约类型](../src/model-output/schema-types.ts) 与 [Catalog 登记](../../../contracts/catalog.json) 已就绪。真实生成仍需要生成能力线提供以下能力：

1. **判别联合**：从 TS 联合生成可确定分支的 Schema 与解码；联合先按判别字段确定分支，再处理未知字段，歧义或非法已知字段失败。
2. **可递归与开放 JSON**：`ToolCallAction.input` 需要开放 JSON；组合器在 Provider Schema 中以具体工具绑定替换该位置，但生成与解码必须保留开放载荷。
3. **整数与数组约束**：TS `number` 无法区分整数；`minItems`、`maxItems` 与数组元素下界需要可生成的注解或等价机制。缺少这些能力会放宽序列、证据与 AskUser 选项约束，不能启用。
4. **联合模型投影**：`ContractBinding.modelProjection()` 需要为含 `anyOf` 的本地 Schema 派生 wire Schema 并成对解码；当前投影拒绝联合与多类型节点。
5. **可选与 `null` 映射**：生成 wire 必须保持 required-nullable 表示，并在解码时只消除可选占位 `null`，保留合法业务 `null`。

Catalog 中的 90 个 `schema-types`/绑定接缝登记项当前为 `generation.state: "none"`。启用时把它们改为 `typescript-binding`，补齐 `rootType`、`declaredTypes`、`outputDirectory`、制品名和 binding 导出元数据，并保证 `npm run contracts:generate -- --check` 通过。

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
2. 从工具线固定提交取得每个业务工具的 `ContractBinding`，以 [AuthorizedToolBinding](../src/model-output/bindings.ts) 替换生产 `AuthorizedToolContract`；工具发现与模型上下文投影不得继续读取第二份字段表。
3. 在 [请求构造](../../model-request/src/prompt.ts) 中用 `createBoundModelOutputContractBundle` 与 `createBoundUnifiedToolDeclarations` 替换 AST 工厂；`ModelOutputRequestPlan.bundle` 已消费 `ModelOutputBundle` 消费面。
4. 在 [Runtime 决策校验](../../runtime/src/runner.ts) 中改用生成 `AgentDecision` 绑定，替换 `AgentDecisionContract`。
5. 将未知字段剥离诊断接入现有 Trace 或等价旁路；不改变执行、审批、恢复或关闭语义。
6. 移除 Gemini Adapter 中按 `kind` 清理跨分支字段的手写表，改为由生成分支 Schema 驱动，并重跑 strict/prompt-only Provider 测试。
7. 移除范围内旧 AST、`wire.ts`、旧 `factory.ts` 与对应索引导出；扫描确认无生产消费者。
8. 运行 Model → Runtime → Tool 的 strict/prompt-only 联合场景、审批与恢复回归，以及全量 `npm test`。完成前不得宣称联合验收通过。

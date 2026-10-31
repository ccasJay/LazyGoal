# 模型数据契约迁移执行计划

本计划为待审阅草案；以[Spec](./spec.md)为准，与工具线并行准备、以实际提交统一切换。

## 任务清单

- [x] //TODO 1. 迁移模型输出和 system tools 的类型与绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：核对模型 canonical/wire 和全部 system tools，将字段与约束改为 TS 单源，按真实模式生成绑定和投影；未知字段安全剥离，非法已知字段拒绝。
  - 基本验证：用典型系统工具和判别联合的合法、非法及额外字段样本验证解码。
- [x] //TODO 2. 按阶段和授权集合组合真实模型契约
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：使用工具线绑定动态构造 Provider Schema、声明和解码，维持阶段与授权规则、可选/null 映射和本地约束验证。
  - 基本验证：验证空授权、重复 ID、未授权工具、不同阶段以及非法分支。
- [x] //TODO 3. 与工具线联合切换完整模型消费链
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：模型请求、原生工具、响应及 Runtime 校验统一改用实际绑定；移除范围内旧 AST，保留执行与审批语义。
  - 基本验证：运行模型请求到 Runtime、工具准备的集成场景，覆盖 strict 与 prompt-only。

## 执行记录

- TODO 1、TODO 2 的独立准备已完成：TS 单源、Catalog 登记、`ContractBinding` 接缝、按阶段/模式/授权集合的动态组合以及隔离替身验证通过。
- TODO 3 的生成部分已完成：基于生成能力线固定提交 `813c6b87`，35 个模型根契约以 `typescript-binding` 生成 Schema、校验器与绑定，`modelOutputBindings` 已装配；canonical `ToolCallAgentDecision` 因开放 `JsonValue` 输入不进入生成，`tool_call` 使用封闭外壳加工具绑定。
- TODO 3 联合切换已执行：`buildStepRequest` 使用 `createBoundModelOutputContractBundle` 与 `createBoundUnifiedToolDeclarations`，Runtime 使用 `decodeBoundAgentDecision` 校验 canonical 决策，`tool_call.action.input` 由实际 Tool 绑定在 `prepare` 校验；旧 `canonical.ts`、`factory.ts`、`wire.ts`、`system-tools.ts` 和 `completion-review.ts` 已删除。补齐对可选字段缺失的原生工具参数兼容、未知字段诊断 Trace 与 Gemini 生成分支 Schema 驱动清理。
- 联合集成证据见 `packages/model-execution/test/model-runtime-tool-integration.test.ts`；外部 GEPA Reflection LLM 阻塞仍使完整 `npm test` 未通过，不能标记整体回归 passed。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 模型类型及生成 | [1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3) | 模型与 system tools 单源，联合、null、已知约束及未知字段诊断正确，范围内旧 AST 已退出。 | 模型契约和生成测试、源码扫描。 |
| 授权与动态组合 | [1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4) | 阶段/模式及授权集合变化得到正确工具声明；未知、重复和未授权工具被拒绝。 | 真实工厂、请求/解码和 Runtime 集成测试。 |
| Provider 及整体链路 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | strict/prompt-only 与支持的 Provider 正确投影和解码；失败纠错、审批及工具联调不退化。 | Provider/model-response/runtime 测试、`npm test`、生成/文档/依赖检查、`git diff --check`。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31（集成分支完整回归）
- 验证提交：`ff11f027`（集成分支 `feat/contract-migration-integration`；代码提交 `a4dc3a23`、`739ac9d7`、`22d3d55b`；本记录仅更新 plan.md）
- 验证摘要：
  - 模型类型及生成：passed。TS 单源、35 个根契约生成绑定与 `modelOutputBindings` 继续作为唯一生产来源；模型 canonical/wire AST、旧工厂、旧 system tool 声明和范围索引导出已删除。Runtime 决策校验改用 `decodeBoundAgentDecision`，工具输入由实际 Tool 绑定校验。
  - 授权与动态组合：passed。`buildStepRequest`、原生工具声明、`model-context` 投影和授权集合都读取工具线 `BoundToolDefinition.inputBinding`；空集合、重复身份、未知/未授权工具和阶段分支继续按原规则处理。新增联合测试覆盖 strict/prompt-only、审批等待与恢复、失败纠错和重复身份拒绝。
  - Provider 及整体链路：passed。Gemini Adapter 已改为从生成分支 Schema 选择并清理跨分支字段，不再维护按 `kind` 的字段表；未知字段剥离诊断接入 `model_output_diagnostic` Trace。合并 Web、Storage、AgentProfile 与其他边界后，定向跨 Spec 测试 70/70 通过；完整 `npm test` 在集成 worktree 通过（TypeScript 2736/2736、scripts 98/98、GEPA adapter 通过），`npx tsc --noEmit`、`contracts:generate -- --check`、`check:dependencies`、`check:docs`、`git diff --check` 通过。
- 未解决问题：旧共享 Contract AST 的最终删除由独立方向处理；Retrieval Index Sidecar 嵌套 `ContextLookupResult` 的归属需在删除方向复核。

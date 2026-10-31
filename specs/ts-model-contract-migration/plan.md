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
- [ ] //TODO 3. 与工具线联合切换完整模型消费链
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：模型请求、原生工具、响应及 Runtime 校验统一改用实际绑定；移除范围内旧 AST，保留执行与审批语义。
  - 基本验证：运行模型请求到 Runtime、工具准备的集成场景，覆盖 strict 与 prompt-only。

## 执行记录

- TODO 1、TODO 2 的独立准备已完成：TS 单源、Catalog 登记、`ContractBinding` 接缝、按阶段/模式/授权集合的动态组合以及隔离替身验证通过。
- TODO 3 的生成部分已完成：基于生成能力线固定提交 `813c6b87`，35 个模型根契约以 `typescript-binding` 生成 Schema、校验器与绑定，`modelOutputBindings` 已装配；canonical `ToolCallAgentDecision` 因开放 `JsonValue` 输入不进入生成，`tool_call` 使用封闭外壳加工具绑定。
- 生产请求、Runtime 校验、Provider 切换与旧 AST 删除属于 TODO 3 联合切换，未执行，不能据此宣称联合验收通过。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 模型类型及生成 | [1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3) | 模型与 system tools 单源，联合、null、已知约束及未知字段诊断正确，范围内旧 AST 已退出。 | 模型契约和生成测试、源码扫描。 |
| 授权与动态组合 | [1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4) | 阶段/模式及授权集合变化得到正确工具声明；未知、重复和未授权工具被拒绝。 | 真实工厂、请求/解码和 Runtime 集成测试。 |
| Provider 及整体链路 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | strict/prompt-only 与支持的 Provider 正确投影和解码；失败纠错、审批及工具联调不退化。 | Provider/model-response/runtime 测试、`npm test`、生成/文档/依赖检查、`git diff --check`。 |

### Latest Result

- 状态：blocked
- 验证时间：2026-10-31 13:13 CST
- 验证提交：`a35222b3`（生成绑定、约束与测试）；本记录更新不改变被验证代码
- 验证摘要：
  - 模型类型及生成：pending-integration。TS 单源、数组/整数约束、35 个根契约真实生成绑定、类型一致性测试与既有 system tools 回归通过；canonical `ToolCallAgentDecision` 保持未生成，范围内旧 AST 未退出。
  - 授权与动态组合：passed。使用真实 `modelOutputBindings` 覆盖空授权、重复/空 ID、未授权工具、阶段与模式组合、未知字段诊断、越界数组与非法整数元素；真实工具绑定接入仍为 pending-integration。
  - Provider 及整体链路：pending-integration。strict/prompt-only 可移植 Schema、Shape Guide 与既有 Provider/Runtime 回归通过；生产请求、Runtime 与 Provider 的联合切换未执行，不能宣称联合验收通过。
  - 当前提交定向检查：TypeScript 类型检查通过；`model-contracts`、`model-response`、`model-request`、`model-execution` 共 255 项测试通过；`scripts` 98 项测试通过；`npm run build:web`、`npm run check:docs`、`npm run check:dependencies`、`npm run contracts:generate -- --check` 与 `git diff --check` 通过。
  - 全量回归：`npm test` 通过（GEPA adapter 运行中出现瞬时限流重试，最终通过）。

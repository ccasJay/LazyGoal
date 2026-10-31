# 工具输入契约迁移执行计划

本计划已完成执行；[Spec](./spec.md)要求所有工具与模型线统一切换生产装配，联合集成验收见 Latest Result。

## 任务清单

- [x] //TODO 1. 核对全部工具并准备 TS 输入绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：按默认、条件、Program、评测和远程注册追踪工具及约束；各工具族并行以 TS/JSDoc 定义输入并登记生成绑定，建立覆盖表。
  - 基本验证：抽查不同工具生成的类型、Schema 和边界值；核对清单与实际注册路径。
- [x] //TODO 2. 接入统一准备和跨边界工具声明
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：注册、`prepare`、工具发现和 Worker 消费同源绑定；已知字段非法拒绝，未知字段剥离并诊断，隔离输入进入原语义校验与执行。
  - 基本验证：对真实注册的代表工具验证合法、非法和附加字段输入，以及授权拒绝。
- [x] //TODO 3. 与模型线统一切换并清除旧工具 AST
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：以双方已验证提交和真实生成能力在集成环境同时切换全部工具及模型消费，删除工具输入旧 AST 和推导，保留权限、审批、沙箱及恢复流程。
  - 基本验证：执行真实模型工具声明到 `prepare` 的集成测试与 AST 引用扫描。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 完整工具清单与生成 | [1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3) | 默认/条件/Program/评测注册与远程声明逐项对应 TS 绑定，旧输入 AST 不再参与。 | 注册与 Catalog 对照、源代码扫描和生成检查。 |
| 准备、权限及进程 | [1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4) | 有效/错误/未知输入、权限与审批、沙箱、取消/恢复及 Worker 边界保持约定。 | tool-core、tools、runtime 和 benchmark 对应真实链路测试。 |
| 联合集成及回归 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 实际模型 Schema、授权工具和执行读取同源；所有工具统一切换，非替身测试通过。 | 模型到工具集成测试、`npm test`、生成/文档/依赖检查、`git diff --check`。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31（集成分支完整回归）
- 测试提交：`ff11f027`（集成分支 `feat/contract-migration-integration`；代码与合并提交 `a4dc3a23`、`739ac9d7`、`22d3d55b`、`7171291a`；本记录仅更新 plan.md）
- 验证摘要：
  - 完整工具清单与生成：passed。30 个工具输入全部消费 Catalog 生成的 `typescript-binding`；`ToolDefinition.inputContract`、`ToolInputContract`、工具输入 AST 常量、`createTransitionalToolInputBinding` 和测试夹具过渡绑定均已删除。对 `packages/`、`benchmarks/`、`apps/` 的 `inputContract|ToolInputContract|transitional-binding` 扫描无匹配；`contracts:generate -- --check` 通过并重新生成固定制品。
  - 准备、权限及进程：passed。注册与 `prepare` 只读取 `BoundToolDefinition.inputBinding`；未知字段剥离诊断、语义校验、授权/审批/沙箱/取消/恢复和 Worker describe 保持原语义。`tool-core`、`tools`、`runtime`、`storage`、`goal-server` 与 benchmark 测试通过；Tool RPC 与远程 Tool Registry 测试验证 Worker 声明使用绑定 Schema。
  - 联合集成及回归：passed。新增 `packages/model-execution/test/model-runtime-tool-integration.test.ts`，覆盖 strict 与 prompt-only 的 Model → Runtime → Tool、授权声明、重复身份拒绝、审批等待与跨 Runner 恢复、无效输入纠错。合并 Web、Storage、AgentProfile 与其他边界后，定向跨 Spec 测试 70/70 通过；完整 `npm test` 在集成 worktree 通过（TypeScript 2736/2736、scripts 98/98、GEPA adapter 通过），`npx tsc --noEmit`、`contracts:generate -- --check`、`check:dependencies`、`check:docs`、`git diff --check` 通过。
- 未解决问题：旧共享 Contract AST 的最终删除由独立方向负责；Retrieval Index Sidecar 嵌套 `ContextLookupResult` 的归属需在删除方向复核。

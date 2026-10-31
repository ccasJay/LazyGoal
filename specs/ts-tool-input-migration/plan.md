# 工具输入契约迁移执行计划

本计划为待审阅草案；[Spec](./spec.md)要求所有工具与模型线完成后统一切换生产装配，领域分支的替身测试不是集成验收。

## 任务清单

- [x] //TODO 1. 核对全部工具并准备 TS 输入绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：按默认、条件、Program、评测和远程注册追踪工具及约束；各工具族并行以 TS/JSDoc 定义输入并登记生成绑定，建立覆盖表。
  - 基本验证：抽查不同工具生成的类型、Schema 和边界值；核对清单与实际注册路径。
- [x] //TODO 2. 接入统一准备和跨边界工具声明
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：注册、`prepare`、工具发现和 Worker 消费同源绑定；已知字段非法拒绝，未知字段剥离并诊断，隔离输入进入原语义校验与执行。
  - 基本验证：对真实注册的代表工具验证合法、非法和附加字段输入，以及授权拒绝。
- [ ] //TODO 3. 与模型线统一切换并清除旧工具 AST
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

- 状态：blocked
- 验证时间：2026-10-31
- 测试提交：294a475e（工作树干净；本地 node_modules 安装未纳入版本控制）
- 验证摘要：
  - 完整工具清单与生成：blocked。30 个工具输入已登记；18 个启用 `typescript-binding` 并由 `contracts:generate -- --check` 验证，12 个因共享生成器尚未支持 `@asType integer` 处于 `generation.state = none`。旧输入 AST 仍供模型线消费，因此 [1.1](./spec.md#spec-req-1-1) 与 [1.3](./spec.md#spec-req-1-3) 尚未完成。
  - 准备、权限及进程：passed（本方向独立范围）。工具注册与 `prepare` 使用同一绑定；已知字段错误、未知字段剥离及有界诊断、语义校验、授权/审批/沙箱/取消/恢复和远程 Worker describe 均有测试覆盖。`packages/tools` 157、runtime 598、storage 174、goal-server 61、model-context/model-execution 496、benchmark 180、model-contracts/model-request/llm 149、scripts 98 项测试通过。
  - 联合集成及回归：pending-integration / blocked。排除依赖外部 GEPA reflection 的 `benchmarks/test/prompt-evaluation/` 后，等价完整 TypeScript 套件 2555/2555 通过；完整 `npm test` 在 GEPA reflection 外部 LLM 429/500 重试处无法完成，未作为通过证据。`tsc --noEmit`、`contracts:generate --check`、`check:docs`、`check:dependencies`、`build:web` 与 `git diff --check` 通过；模型线尚未切换到绑定 Schema，旧 AST 未删除，联合验收仍由集成阶段执行。

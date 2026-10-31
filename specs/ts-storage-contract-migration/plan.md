# Storage 数据契约迁移执行计划

本计划为待审阅草案；[Spec](./spec.md)引用 AgentProfile 已批准小 Spec，Snapshot 与其他文件族独立准备。

## 任务清单

- [x] //TODO 1. 核对文件契约与 AgentProfile 已批准范围
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)。
  - 实施目标与场景：以 Catalog 与实际读写恢复调用链逐项登记文件族、版本、边界策略和不变量，纳入 AgentProfile 小 Spec 的真实验收证据。
  - 基本验证：抽查 Profile、Snapshot、账本和索引的实际读取者及错误语义。
- [x] //TODO 2. 将 Snapshot 与其他文件族切换到 TS 生成绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：按文件族迁移字段单源、生成绑定和 Codec/Store；保留独立跨字段、身份、版本及损坏文件处理；删除重复 Schema，无旧读取回退。
  - 基本验证：定向验证 Snapshot 往返、身份不匹配及错误版本，另验证一个账本或索引文件。
- [x] //TODO 3. 核验各文件族真实持久化与恢复
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：逐项核对文件族真实调用、生成与清理；检查审批等待、重启恢复、原子写入及损坏/重建行为。
  - 基本验证：运行 Storage 定向恢复与 Codec 测试并检查清单无遗漏。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 覆盖与所有权 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2) | 文件族、Schema 与实际消费者逐项对照；Profile 严格拒绝，其他边界及领域不变量不变。 | Catalog/读写调用链与小 Spec 验收记录，旧字段表扫描。 |
| 恢复与失败 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 合法数据往返；损坏、版本、身份、跨字段错误按原边界失败或重建；审批状态及原子写入保持。 | 真实文件、Snapshot Codec、Runtime 恢复与写入故障测试。 |
| 整体回归 | [1.4](./spec.md#spec-req-1-4) | 全部迁移族与已批准 AgentProfile 场景通过。 | `npm test`、生成/文档/依赖检查、`git diff --check`。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31T05:19:23Z–05:28:26Z（UTC）；完整回归 `npm test` 为 05:21:30Z–05:27:48Z。
- 测试提交：`5a3017a1`（Sidecar 补齐后的代码状态；工作区在记录前干净）。上游生成能力固定提交：`36515714`（已合并为 `65b42fa2`）。
- 覆盖与所有权（[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)）：文件族、版本、读取策略、不变量和真实消费者逐项记录在 [Storage 文件契约清单](../../packages/storage/notes/file-contracts.md)。Catalog 当前 893 项、13 个启用生成项；80 个被 TS 文件 DTO/生成绑定取代的 Zod 或派生声明标记为 `deleted`。`packages/storage/src` 的 Zod 扫描仅剩 `agent-profile-file.ts`，其字段与严格拒绝行为仍归已批准的 [AgentProfile 文件契约](../ts-agent-profile-file-contract/spec.md)，本方向未宣称其验收完成。Goal Snapshot、Tool/Sandbox Grant、模型偏好、权限模式、调用指标、进程会话、模型输入、Goal Context Index 与 Retrieval Index Sidecar 顶层均由生成绑定消费。
- 恢复与失败（[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)）：`npx tsx --test packages/storage/test/*.test.ts` 180/180 通过，覆盖 Snapshot 编解码、身份/版本/损坏文件、审批等待、原子写入、账本、索引、指标、进程会话、模型输入和真实文件往返。`npx tsx --test packages/runtime/test/goal-multi-run-recovery.test.ts packages/runtime/test/think-decision-recovery.test.ts packages/runtime/test/program-interruption.test.ts packages/runtime/test/permission-grant-recovery.test.ts apps/goal-server/test/runtime-recovery.integration.test.ts apps/goal-server/test/execution-composition.test.ts` 44/44 通过，覆盖重启恢复与执行装配。Retrieval Index Sidecar 顶层由生成绑定校验；嵌套文档、倒排索引和查询缓存结果仍由 `context-retrieval` 的索引重建与查询缓存校验执行。
- 整体回归（[1.4](./spec.md#spec-req-1-4)）：`npm test` 通过，发现 447 个 TS 测试文件与 7 个 scripts 测试文件；TS 测试 2714/2714、scripts 98/98 通过，入口同时覆盖 `contracts:generate --check`、`tsc --noEmit`、`check:docs`、`check:dependencies` 与 GEPA adapter。单独执行 `npm run contracts:generate -- --check` 输出 `Contract artifacts are current.`；`npm run check:dependencies` 通过（352 个源文件）；`npm run check:docs` 通过（47 个模块、170 份当前说明）；`git diff --check` 无输出。
- 验证过程中曾出现两个与本方向无关的并发清理时序抖动：`apps/goal-server/test/runtime-composition.integration.test.ts` 的 `ENOTEMPTY` 与 `benchmarks/test/isolated-environment.test.ts` 的清理预算断言；两者单独重跑均通过，最终完整 `npm test` 干净通过。证据不以抖动前的失败运行作为通过依据。
- 未解决问题与外部依赖：AgentProfile 小 Spec 尚未在本分支实施，继续作为外部依赖；Retrieval Index Sidecar 的嵌套查询结果仍依赖模型数据契约迁移把 `ContextLookupResult` 收敛为 TS 单源，当前以既有 `context-retrieval` 校验保留行为。除上述事项外本方向无阻塞。

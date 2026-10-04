# Context Retrieval 独立包实施计划

- [x] //TODO 1. 拆出检索包并接入默认与可替换的历史查询

  - 实现目标：先以现有实现记录固定语料、结果及 Sidecar 基线，再建立 `@lazygoal/context-retrieval` 的检索服务、索引与结果契约；在同一切片迁移 Runtime 来源适配、Storage Sidecar、TUI 组合根及公共调用方，删除 Runtime 中迁出的算法入口并补齐接口 TSDoc 与自动化测试。
  - 成功判据：默认 `system_context_lookup` 对同一已提交来源保留文档、Token、排序、结果和 Step/恢复行为；跨 Run、未提交 tail、旧 Run Evidence、非法替换结果均受原边界控制；原格式 Sidecar 可恢复，落后可增量更新，损坏可重建，写入失败不改变查询；新包无 Runtime/Storage 反向依赖且显式替换检索器可接入。
  - 验证方式：新增包级等价与 Runtime 适配测试（待实现），扩展现有 `context-retrieval-lifecycle.test.ts`、`multi-run-context-lookup.test.ts`、`context-retrieval-index-sidecar.test.ts`、`context-api-exports.test.ts` 与 TUI 装配测试；运行 `npx tsx --test packages/context-retrieval/test/*.test.ts packages/runtime/test/context-retrieval-lifecycle.test.ts packages/runtime/test/multi-run-context-lookup.test.ts packages/storage/test/context-retrieval-index-sidecar.test.ts packages/runtime/test/context-api-exports.test.ts` 和 `npm run check:dependencies`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [x] //TODO 2. 建立无需 Runtime 的固定语料检索评测

  - 实现目标：以 TODO 1 的迁移前基线为输入，新增仅导入检索包与 `contracts` 的固定语料评测入口和指标计算测试，并接入仓库可执行脚本。
  - 成功判据：无需创建 Goal/Runner 即可报告 Recall@5、MRR、负查询判定及分词/查询耗时；相同语料与参数得到确定性命中和排序，质量不低于迁移前基线，耗时不使用机器相关硬阈值。
  - 验证方式：新增 `packages/context-retrieval/test/retrieval-evaluation.test.ts`（待实现），复用 TODO 1 的固定语料与基线；运行 `npx tsx --test packages/context-retrieval/test/retrieval-evaluation.test.ts` 及待新增的 `npm run benchmark:context-retrieval`。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3) | 仅导入新包即可构建文档、分词、索引和排序；包依赖单向，Runtime 算法实现与旧转发入口已移除，现有调用方编译通过。 | TODO 1 包级测试、公共导出与 `npm run check:dependencies`（新增测试待实现）。 |
| [2.1](./requirements.md#req-2-1) | 相同 committed 语料下文档、Token、字段、分数、Top-K、相邻单元及预算结果与迁移前基线一致。 | TODO 1 固定语料等价测试与现有分词、排名、结果测试（迁移后路径待实现）。 |
| [2.2](./requirements.md#req-2-2) | 单 Run/跨 Run 只索引各自已提交来源；同号 sequence 不混淆，未提交 tail、内部程序和 lookup 事实不进入命中。 | TODO 1 来源边界和 `multi-run-context-lookup.test.ts`（扩展部分待实现）。 |
| [2.3](./requirements.md#req-2-3) | `found`、`not_found`、`lookup_error` 保持区分，来源、历史与截断标记准确；旧 Run 命中被当前 Run 完成证据门禁拒绝。 | TODO 1 结果与 Evidence Gate 集成测试（新增部分待实现）。 |
| [2.4](./requirements.md#req-2-4), [5.2](./requirements.md#req-5-2) | 原 Sidecar JSON 可恢复；缺失、损坏、超前或失配时重建，落后时增量更新；保存失败不改变结果，来源损坏返回查询错误。 | TODO 1 `context-retrieval-index-sidecar.test.ts` 与 Runtime 故障测试（扩展部分待实现）。 |
| [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3) | 默认及注入实现均经相同 `ContextLookupPort`；跨 Goal/Run、越界或无效替换结果在提交前拒绝，不绕过 Tool、Step 或恢复流程。 | TODO 1 Runtime 适配、替换实现和生命周期测试（新增部分待实现）。 |
| [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3) | 固定语料从新包独立运行并报告 Recall@5、MRR、负查询与耗时；命中和排序确定且质量不低于迁移前基线。 | TODO 2 评测入口及指标测试（待实现）；耗时仅报告。 |
| [5.1](./requirements.md#req-5-1), [5.3](./requirements.md#req-5-3) | `system_context_lookup` 保持唯一模型入口；Runtime 校验并提交事实，检索器不能改写 Goal/Trajectory；当前协议和存储版本未改变。 | TODO 1 原生工具、Runtime/Storage 回归及版本常量检查（扩展部分待实现）。 |
| 组合查询与恢复 | 默认组合根查询、重启恢复和跨 Run 查询都得到同一已提交结果；缓存和重建路径等价。 | TUI 装配、Runtime 生命周期及 Storage Sidecar 集成测试（扩展部分待实现）。 |
| medium 风险边界 | 依赖图无环，完整事件摘要与原 Sidecar 一致；坏来源及坏替换结果不产生可提交的伪命中，错误与取消沿现有路径结算。 | 新包/Runtime/Storage 故障与依赖测试（新增部分待实现）。 |
| 全量回归与文档 | 类型、依赖、自动化回归通过；公共接口 TSDoc 和 `docs/architecture/` 与最终职责一致，`//TODO` 原文保持。 | `npx tsc --noEmit`、`npm run check:dependencies`、`npm test`、`git diff --check` 与变更审查。 |

### Latest Result

- 状态：通过 (PASSED)
- 时间：2025-05-18
- 验证证据：
  1. `npx tsc --noEmit`：0 类型错误。
  2. `npm run check:dependencies`：225 个源文件单向依赖边界验证完全通过（`context-retrieval` 仅依赖 `contracts`，无反向依赖）。
  3. `npx tsx --test packages/context-retrieval/test/*.test.ts packages/runtime/test/context-retrieval-lifecycle.test.ts packages/runtime/test/multi-run-context-lookup.test.ts packages/storage/test/context-retrieval-index-sidecar.test.ts packages/runtime/test/context-api-exports.test.ts packages/runtime/test/runtime-context-lookup-adapter.test.ts packages/runtime/test/context-lookup-result.test.ts`：40/40 自动化测试全数通过。
  4. `npm run benchmark:context-retrieval`：固定语料检索评测通过，Recall@5: 100.0% (>= 1.0), MRR: 1.0000 (>= 1.0), Negative Accuracy: 100.0% (>= 1.0)。
  5. 架构文档与 TSDoc：完成 `packages/context-retrieval` 公共接口中文 TSDoc（含 `@example`）及 `docs/architecture/context-retrieval.md` 架构文档。

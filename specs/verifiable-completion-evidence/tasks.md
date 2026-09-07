# 可验证完成证据 实施计划

- [x] //TODO 1. CompletionCriterion 领域结构与 codec 演进

  - 实现目标:`domain.ts` 定义 `CompletionCriterion { text, acceptance? { expectToolId, expectOutcome } }` 并将 `GoalTask.completionCriteria` 改为该结构;`goal-snapshot-codec.ts` 就地更新序列化/反序列化与结构校验(旧 `string[]` 快照解析报清晰 unsupported 错误);所有读取 criteria 文本的调用点(prompt 渲染、校验处)改读 `.text`
  - 成功判据:codec roundtrip 保留 acceptance;旧形态快照 fail-fast;现有 runtime 测试(改读 text 后)全部通过
  - 验证方式:待实现用例加入 `packages/storage/test/`;`npx tsx --test packages/runtime/test/*.test.ts`
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2)_

- [x] //TODO 2. Evidence Gate 解析函数

  - 实现目标:`evidence-gate.ts` 新增纯函数 `resolveEvidenceObservation(sequence, index)`,`tool_finished` 直接取 payload 的 toolId 与 observation.kind,`observation_recorded` 按 actionId 与索引内 `tool_started`/`tool_finished` 配对解析 toolId,其余返回 `undefined`
  - 成功判据:四类场景用例(直接解析/配对解析/配对缺失/非工具事件)全部符合预期
  - 验证方式:待实现用例加入 `packages/runtime/test/`
  - _Requirements: [2.1](./requirements.md#req-2-1)_

- [x] //TODO 3. Runner 声明匹配校验

  - 实现目标:`validateCompletionEvidence` 在现有校验后追加分支:携带 acceptance 的条件须有至少一条 evidenceSequences 解析为 (expectToolId, expectOutcome),否则抛 `INVALID_AGENT_DECISION` 且消息含条件序号、预期工具/结果与缺口;无声明条件路径不变
  - 成功判据:匹配通过/不匹配拒绝/expect failure 双向用例通过;无声明回归通过
  - 验证方式:待实现用例加入 `packages/runtime/test/runner.test.ts`
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1)_

- [x] //TODO 4. Benchmark descriptor 注入

  - 实现目标:`headless-composition-root.ts` 的 `BenchmarkTaskDescriptor.completionCriteria` 演进为 `readonly (string | CompletionCriterion)[]`,解析时字符串归一为 `{text}`、结构校验 acceptance 形态并要求 `expectToolId ∈ profile.toolIds`(违反抛 TypeError)
  - 成功判据:字符串简写与结构化声明均正确注入 Goal Task;未授权工具声明被拒绝
  - 验证方式:待实现用例加入 `benchmarks/test/`
  - _Requirements: [1.3](./requirements.md#req-1-3)_

- [x] //TODO 5. TSDoc、架构文档与全量回归

  - 实现目标:更新 `CompletionCriterion`/`resolveEvidenceObservation`/descriptor 的中文契约 TSDoc(含 @example);`docs/architecture/` 中完成判定相关描述同步(声明校验为追加分支、报告成功语义不变);跑 runtime/storage/agent/benchmarks 相关全部测试
  - 成功判据:TSDoc 与实现一致;文档与实现一致;相关测试目录全部通过
  - 验证方式:`npx tsx --test packages/runtime/test/*.test.ts packages/storage/test/*.test.ts packages/agent/test/*.test.ts benchmarks/test/*.test.ts benchmarks/alfworld/test/*.test.ts`
  - _Requirements: [1.2](./requirements.md#req-1-2), [3.2](./requirements.md#req-3-2)_

## Feature Verification

风险依据:[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 条件可携带 expectToolId/expectOutcome 声明 | Codec/domain 单测(待实现,TODO 1) |
| [1.2](./requirements.md#req-1-2) | 无声明条件校验语义与现状一致 | Runner 无声明回归用例(待实现,TODO 3) |
| [1.3](./requirements.md#req-1-3) | descriptor 声明正确注入 Goal Task | Descriptor 解析单测(待实现,TODO 4) |
| [2.1](./requirements.md#req-2-1) | 无匹配证据的声明 complete 被拒 | Runner 拒绝用例(待实现,TODO 3) |
| [2.2](./requirements.md#req-2-2) | 全部声明匹配时后续流程不变 | Runner 通过用例(待实现,TODO 3) |
| [2.3](./requirements.md#req-2-3) | expect failure 引用 success 被拒 | Runner 双向用例(待实现,TODO 3) |
| [2.4](./requirements.md#req-2-4) | 拒绝消息含条件序号与证据缺口 | 断言错误消息内容(待实现,TODO 3) |
| [3.1](./requirements.md#req-3-1) | expect failure 引用 failure 通过 | Runner 双向用例(待实现,TODO 3) |
| [3.2](./requirements.md#req-3-2) | 环境成功事实(如 ALFWorld won)语义不变 | 现有 ALFWorld 报告测试回归(TODO 5) |
| 组合流 | 声明任务的 complete→拒绝→补充证据→complete 全链路 | Runner 集成用例(待实现,TODO 3) |
| 旧快照 fail-fast | 旧 string[] criteria 快照解析报清晰错误 | Codec 用例(待实现,TODO 1) |

### Latest Result

- **整体状态**: 全部通过 (Pass)
- **验证时间**: 2026-09-07T19:10:00+08:00
- **被测代码状态**: Git commit `e1e5685` (工作树干净)
- **逐项证据**:
  - `[1.1]` `GoalSnapshotCodec round-trips CompletionCriterion with acceptance`: 通过 (`packages/storage/test/goal-store.test.ts`)
  - `[1.2]` `Runner 声明匹配：无 acceptance 声明的条件保持现状校验通过`: 通过 (`packages/runtime/test/runner.test.ts`)
  - `[1.3]` `injects structured completion criteria with acceptance into Goal Task during headless execution` 与 `validateTaskDescriptor normalizes string and structured criteria and validates tools against profile`: 通过 (`benchmarks/test/headless-composition-root.test.ts`)
  - `[2.1]` `Runner 声明匹配：工具标识不匹配时拒绝 complete 并返回明确缺口`: 通过 (`packages/runtime/test/runner.test.ts`)
  - `[2.2]` `Runner 声明匹配：携带 acceptance 的条件引用匹配工具与成功结果时通过`: 通过 (`packages/runtime/test/runner.test.ts`)
  - `[2.3]` `Runner 声明匹配：expect failure 引用 success 观察时被拒` & `expect success 引用 failure 观察时被拒`: 通过 (`packages/runtime/test/runner.test.ts`)
  - `[2.4]` 断言拒绝原因指向条件序号与证据缺口 (`completion criterion 1 requires test_tool failure observation, referenced evidence does not match`): 通过 (`packages/runtime/test/runner.test.ts`)
  - `[3.1]` `Runner 声明匹配：expect failure 声明引用匹配的 failure 观察时通过`: 通过 (`packages/runtime/test/runner.test.ts`)
  - `[3.2]` `environment won is authoritative when model returns complete` & `ALFWorld model completion without an environment win remains evaluator-owned`: 通过 (`benchmarks/alfworld/test/evaluation-runner.test.ts`)
  - `组合流` 声明任务完整生命周期 complete 校验在各场景下放行与拦截: 通过
  - `旧快照 fail-fast` `GoalSnapshotCodec fails fast on legacy string completionCriteria`: 通过 (`packages/storage/test/goal-store.test.ts`)
- **全量回归**: 全仓 `npm test` 701 tests + 11 scripts tests 100% 通过。

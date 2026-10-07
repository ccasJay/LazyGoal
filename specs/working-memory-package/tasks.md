# Working Memory 拆包任务

按编号顺序实施，每步保持现有调用链可用。类型迁出时，现有 Runtime 导出先引用新包的唯一定义；TODO 3 完成调用方迁移后删除这些导出。不得复制类型或算法实现。

- [x] //TODO 1. 迁出记忆数据契约与基础构造能力

  - 实现目标：建立新包，迁移记忆类型、阶段元数据、`createEmptyWorkingMemory` 和 `isMemoryProtocol`；Runtime 领域状态改为引用新定义，注册依赖规则并接入基础测试。
  - 成功判据：无 Runtime 实例即可构造既有结构的空记忆和识别当前协议；新包无 Runtime 依赖，Runtime 使用同一组定义，Snapshot／revision 字段与当前编码一致。
  - 验证方式：新包基础契约测试（待实现）；`npx tsc --noEmit`、`npm run check:dependencies`、`node --test scripts/check-dependencies.test.mjs`；`npx tsx --test packages/runtime/test/working-memory-contract.test.ts packages/storage/test/goal-snapshot-current.test.ts`。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [3.4](./requirements.md#req-3-4)_

- [x] //TODO 2. 迁出 Patch 算法并接入 Runtime 准入与恢复

  - 实现目标：迁移 Core 算法、限制、结果类型和错误；Runner、Evidence Gate、Session 及现有算法调用方直接使用新包，移除旧 Core 文件与算法转发导出；迁移算法测试并补齐提交／恢复的具体覆盖缺口。
  - 成功判据：公开入口对固定输入产生原有 canonical 结果，非法 Patch 原子拒绝；Runtime 继续决定证据资格及提交顺序，只重放有效已提交链，保存失败和损坏数据不放行有效记忆。
  - 验证方式：`npx tsx --test packages/working-memory/test/*.test.ts`（迁移后入口，待创建）；Runtime 的 `working-memory-session.test.ts`、`working-memory-runner.test.ts`、`working-memory-coordinator.test.ts`、`evidence-gate.test.ts` 与 `trajectory-checkpoint-committer.test.ts`；`npx tsc --noEmit`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 3. 完成模型与外部调用方迁移并收紧公开入口

  - 实现目标：迁移 Agent、组合根、benchmark、测试和 smoke 的剩余记忆导入；移除 Runtime 的类型与基础函数转发导出，保留独立模型／存储表示，完成公开入口和模型可见性回归。
  - 成功判据：迁出符号只能从新包取得，现有调用方无旧导入；相同已提交记忆生成原有模型投影和 Patch 接受结果，未提交记忆不可见，控制字段不能通过 Patch 指定。
  - 验证方式：`npx tsx --test packages/agent/test/model-inference-projector.test.ts packages/agent/test/prompt.test.ts packages/agent/test/model-output.test.ts packages/model-contracts/test/model-output-*.test.ts`；导入／导出检查、`npx tsc --noEmit`、`npm run check:dependencies`，随后执行下方 Feature Verification。
  - _Requirements: [1.2](./requirements.md#req-1-2), [3.2](./requirements.md#req-3-2), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
| --- | --- | --- |
| [1.1](./requirements.md#req-1-1) | 只提供记忆、Patch、限制和元数据，通过公开入口得到规范化操作与归约结果，无需 Runtime 实例或 I/O。 | 新包 Core 测试（从现有算法测试迁移，入口待创建）。 |
| [1.2](./requirements.md#req-1-2) | 新包只依赖 Contracts 和 Model Contracts；新包导入 Runtime、Contracts/Model Contracts 导入新包均被拒绝。 | `scripts/check-dependencies.test.mjs` 负向用例（待实现）、实际源码依赖检查。 |
| [1.3](./requirements.md#req-1-3) | Session、证据资格和提交仍由 Runtime 执行；新包只接受已提供的数据。 | Runtime Session／Evidence Gate／提交器集成测试及公开入口检查。 |
| [2.1](./requirements.md#req-2-1) | 固定输入产生既有 Fact ID、canonical operations 和记忆内容。 | 新包 Core 测试；保留或补充固定预期值，避免只用迁移后的函数计算预期。 |
| [2.2](./requirements.md#req-2-2) | Patch 含非法字段、操作、引用或转换时整体失败，输入记忆未改变。 | 新包 Patch 准入失败测试；证据引用资格由 `packages/runtime/test/evidence-gate.test.ts` 验证。 |
| [2.3](./requirements.md#req-2-3) | 重复／过时提议被抑制，新证据强化或替换原值；容量决策生成既有操作，恢复不因当前限制重算淘汰。 | 新包事实与容量测试，以及 Runtime 重放测试；缺失场景补充回归（待实现）。 |
| [2.4](./requirements.md#req-2-4) | 状态转换及终态作用域清理产生原有有效条目。 | 新包生命周期测试与 `packages/runtime/test/working-memory-runner.test.ts`。 |
| [3.1](./requirements.md#req-3-1) | 选择当前 Goal/Run 的有效 revision 链，只重放 Snapshot 边界内的可达 Patch，tail 不可见。 | `packages/runtime/test/working-memory-session.test.ts` 与 Evidence Gate 测试。 |
| [3.2](./requirements.md#req-3-2) | Patch 追加后 Snapshot 保存失败，revision 不推进；恢复及后续模型输入不出现该 Patch。 | `packages/runtime/test/trajectory-checkpoint-committer.test.ts`、Working Memory Runner／Session 集成测试；补充缺失的模型可见性断言（待实现）。 |
| [3.3](./requirements.md#req-3-3) | 损坏、断链、循环、身份失配或无效提交边界导致恢复失败，无部分记忆进入后续调用。 | Runtime Session 恢复失败测试；现有断言不足时补充对应场景（待实现）。 |
| [3.4](./requirements.md#req-3-4) | Snapshot、accepted Event、协议及 revision 保持原有编码、解码与版本。 | `packages/storage/test/goal-snapshot-current.test.ts`、Runtime 提交器与 `packages/runtime/test/working-memory-contract.test.ts`；核对编解码改动。 |
| [4.1](./requirements.md#req-4-1) | 相同已提交记忆生成相同模型投影及动态 section 内容，继续保持对象隔离。 | `packages/agent/test/model-inference-projector.test.ts` 与 `packages/agent/test/prompt.test.ts`。 |
| [4.2](./requirements.md#req-4-2) | 模型 Memory Patch 的结构、版本及有效／无效输入结果保持一致。 | `packages/model-contracts/test/model-output-*.test.ts`、Runtime Memory Contract 与 `packages/agent/test/model-output.test.ts`。 |
| [4.3](./requirements.md#req-4-3) | 控制字段被拒绝，Patch 不可指定 Run 状态、审批或执行计数；错误结算仍由 Runtime 决定。 | 新包控制字段拒绝测试、Runtime Runner 集成测试。 |
| 跨包执行链 | 已提交记忆经模型提议、证据准入、canonical 提交与 Snapshot 保存后，在恢复和下一模型请求中产生相同结果；失败路径不放行未提交内容。 | Runtime Working Memory、提交器及 Agent 集成入口；最后执行 `npm test`。 |
| 仓库文档约束 | 布局、当前架构职责、依赖方向及新包契约说明与已实现结果一致。 | 按 Design 同步 `AGENTS.md`、相关 `docs/architecture/` 文档与新包职责入口，检查链接、TSDoc 示例及 `git diff --check`。 |

上述 TypeScript 测试通过 `npx tsx --test <测试入口>` 运行；新包测试和新增负向／失败场景在实施时创建。保留既有测试覆盖，仅针对具体缺口补充断言；不使用真实模型调用作为验收。

### Latest Result

未执行。实施后记录逐项实际结果与证据、整体状态、时效、验证时间、被测提交或未提交改动，以及相应需求与设计版本。

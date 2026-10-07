# Run 执行与持久化恢复职责拆分任务

- [x] //TODO 1. 拆分 Run 恢复读取与执行推进并保持现有入口行为

  - 实现目标：保留 `Runner` 的公开调度入口，将恢复读取和执行循环划归设计中的独立职责，并补充覆盖普通/Plan Run、等待点和重启恢复的自动化测试。
  - 成功判据：恢复读取不推进 Run 或写入；执行与恢复后的 Goal/Run 身份、Step、消息、审批和终态与现有行为一致；调用级取消后仍从已提交快照恢复。
  - 验证方式：待实现的职责拆分测试及现有 `runner.test.ts`、`goal-multi-run-recovery.test.ts`、`browser-recovery.test.ts`；运行 `npx tsx --test packages/runtime/test/runner.test.ts packages/runtime/test/goal-multi-run-recovery.test.ts packages/browser/test/browser-recovery.test.ts`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [x] //TODO 2. 使 Trajectory 事实与提交标记写入在临时故障后安全重试

  - 实现目标：在内置 JSONL Trajectory Store 的单次追加中保留事件身份、核对不确定写入结果并有限重试；保持提交端口及事实到 Snapshot 再到标记的顺序。
  - 成功判据：写入前或完整落盘后发生可重试故障时，事实和标记各只出现一次，提交成功后才继续；部分行、协议错误及重试耗尽时停止并报告错误，不调用后续模型或 Tool。
  - 验证方式：待实现的文件追加故障注入测试及现有 `trajectory-store.test.ts`、`trajectory-checkpoint-committer.test.ts`、`trajectory-failure.test.ts`；运行 `npx tsx --test packages/storage/test/trajectory-store.test.ts packages/runtime/test/trajectory-checkpoint-committer.test.ts packages/runtime/test/trajectory-failure.test.ts`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5)_

- [x] //TODO 3. 使 Goal 快照原子替换在临时故障后安全重试

  - 实现目标：在内置 JSON Goal Store 的单次保存中复用同一快照内容，核对替换结果并有限重试，补充与 Action/Observation 提交边界相连的自动化测试。
  - 成功判据：写入前及正式快照已替换后的临时故障均可安全完成；不可重试错误或次数耗尽时明确失败，恢复只读取有效快照，已发生的 Tool 效果不被重做或报告为回滚。
  - 验证方式：待实现的快照故障注入测试及现有 `goal-store.test.ts`、`action-observation-recovery.test.ts`、`runner.test.ts`；运行 `npx tsx --test packages/storage/test/goal-store.test.ts packages/storage/test/action-observation-recovery.test.ts packages/runtime/test/runner.test.ts`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [3.5](./requirements.md#req-3-5)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
| --- | --- | --- |
| [1.1](./requirements.md#req-1-1) | 普通与 Plan Run 经既有入口得到相同状态、Step、消息与终态 | Runtime 回归和待实现的职责拆分测试 |
| [1.2](./requirements.md#req-1-2) | 用户交互和审批等待阻止继续执行，恢复同一 Run | Runtime 交互与审批测试 |
| [1.3](./requirements.md#req-1-3) | Web 和 Benchmark 入口只读取已提交 Goal/Run/Trajectory 投影 | `browser-recovery.test.ts`、`headless-composition-root.test.ts` 与待实现的集成测试 |
| [2.1](./requirements.md#req-2-1) | 重启后按最近快照恢复同一 Run，未提交尾部不作为进度 | `goal-multi-run-recovery.test.ts`、`trajectory-failure.test.ts` 与待实现的跨进程测试 |
| [2.2](./requirements.md#req-2-2) | pending Action 按 safe/manual 规则恢复，已确认效果不重复 | `action-observation-recovery.test.ts` 与待实现的故障测试 |
| [2.3](./requirements.md#req-2-3) | 关闭或调用级取消不隐式持久化取消终态 | `execution-control.test.ts` 与重启恢复测试 |
| [2.4](./requirements.md#req-2-4) | 仅恢复读取不调用模型/Tool，也不写快照或轨迹 | 待实现的只读恢复测试 |
| [3.1](./requirements.md#req-3-1) | 事实、快照、标记遇明确临时故障后有限重试并继续 | 待实现的两个文件 Store 故障注入测试及提交器集成测试 |
| [3.2](./requirements.md#req-3-2) | 写入结果不明后核对已落盘内容，不重复事实、Step 或工具效果 | 待实现的落盘后报错与 Action/Observation 集成测试 |
| [3.3](./requirements.md#req-3-3) | 检查点未提交前不调用模型/Tool，已发生外部效果不声称回滚 | `trajectory-failure.test.ts`、`action-observation-recovery.test.ts` 与待实现的失败路径测试 |
| [3.4](./requirements.md#req-3-4) | 重试耗尽后停止并报错，恢复仍以有效快照为准 | 待实现的耗尽、标记失败和重启测试 |
| [3.5](./requirements.md#req-3-5) | 协议损坏、部分 JSONL 行和未知错误不重试 | 待实现的确定性错误测试 |
| 组合与风险检查 | Web/Benchmark 组合入口、端口签名、架构文档与源码契约一致；完整回归无受影响失败 | `npm test`、`npm run check:dependencies`，并检查当前架构文档与公开 TSDoc |

### Latest Result

- 状态：passed / current；验证时间：2026-10-07 22:58 CST。
- 被测代码：`7afd22ea24d2a66e75edf136484f28e8048f7513`；工作树干净；Requirements SHA-256 `8d076d7a94dfa30bc3f1d9040aef870a034dda5ef6114cfec1927396b7e37c43`，Design SHA-256 `48867f20ab87c6f6829af2d1a05e4976d146995686923f2c330502229b6c9ba2`，Tasks SHA-256 `dfd8eb1aa99a86147825b2a57f9c01439a3d6b9bdfd90696890ab71271d49ed5`。
- [1.1–1.3](./requirements.md#req-1-1)：Runtime、Browser recovery、Headless Composition Root 和全量回归通过；TODO 1 的 81 项定向测试通过，覆盖普通/Plan Run、等待点、身份与恢复边界。
- [2.1–2.4](./requirements.md#req-2-1)：多 Run 恢复、pending Action、执行取消和存储恢复测试通过；TODO 1 的 Browser/PTC 恢复与 TODO 3 的 90 项定向测试覆盖恢复仅读取及已确认效果不重做。
- [3.1–3.5](./requirements.md#req-3-1)：TODO 2 的 27 项 Trajectory/提交器/失败路径测试及 TODO 3 的 90 项 GoalStore/Action-Observation/Runner 测试通过，覆盖短暂写入故障、落盘后报错、部分行、协议错误、重试耗尽和结果核对。
- 组合与风险：`npm test` 通过（Node 1,586 项、Benchmark 259 项、GEPA adapter 198 项、scripts 24 项）；`npx tsc --noEmit --pretty false` 通过；`npm run check:dependencies` 通过（218 个源文件）；相关 Architecture 与公开 TSDoc 已随实现更新；`git diff --check` 通过。
- 首次全量回归因 worktree 缺少 `benchmarks/package-lock.json` 中的 `smol-toml` 未通过；在隔离 worktree 按锁文件安装依赖后重跑，全量回归通过。未解决问题：无。

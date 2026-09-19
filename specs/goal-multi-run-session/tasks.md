# Goal 计划模式与多 Run 会话实施任务

状态：规划草稿，整包待审查；尚未实施。执行依据为 [Requirements](./requirements.md) 与 [Design](./design.md)，本文件不授予实现权限。

每项代码变更同时补齐公共接口的中文契约 TSDoc；涉及架构所有权的实现同步更新 Design 指定的架构文档。保留全部 `//TODO` 文本，完成时仅修改复选框。

- [x] //TODO 1. 建立 GoalPlan 领域模型与原子 reducer

  - 实现目标：在 `packages/runtime/src` 增加 `GoalMode`、`GoalPlan`、`GoalPlanItem`、`GoalPlanPatch` 与 reducer；扩展 `GoalState`/`RunState` 的当前字段，并实现 ID、position、状态转换、容量和单个 `in_progress` 校验。
  - 成功判据：有效增量 patch 只改变被引用项并递增 revision；Runtime 分配新增 ID；未知 ID、旧 revision、非法转换、重复进行中项和超容量 patch 整批保持原状态。
  - 验证方式：新增 `packages/runtime/test/goal-plan.test.ts`（待实现），扩展 `packages/runtime/test/domain.test.ts`；执行 `npx tsx --test packages/runtime/test/goal-plan.test.ts packages/runtime/test/domain.test.ts`。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4)_

- [x] //TODO 2. 扩展 Snapshot、Trajectory 与恢复边界

  - 实现目标：更新 `packages/storage/src/goal-snapshot.ts`、`goal-snapshot-codec.ts` 与 Runtime Trajectory 类型，持久化 `mode`、GoalPlan、`completedRuns`、`todoId`，并增加 `plan_mode_entered`、`goal_plan_updated`、`run_created` 事实及其校验。
  - 成功判据：normal/plan 两种 Snapshot、两轮消息区间和 Run/todo 关联均可 round-trip；重复 ID、非法模式/状态、断裂消息区间、跨 Goal 轨迹和不支持结构全部 fail closed。
  - 验证方式：扩展 `packages/storage/test/goal-snapshot-current.test.ts`、`packages/storage/test/goal-store.test.ts`、`packages/runtime/test/trajectory.test.ts`；执行对应测试文件。
  - _Requirements: [2.3](./requirements.md#req-2-3), [6.1](./requirements.md#req-6-1), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [8.4](./requirements.md#req-8-4)_

- [x] //TODO 3. 接通 `/plan` Slash Command 与 Runtime 模式入口

  - 实现目标：在 `packages/slash-command` 增加无参数 `planCommandDefinition` 和 `enter_plan_mode` Effect；扩展 TUI 命令注册与 `GoalCoordinator.enterPlanMode`，并为尚无 Goal 的 intent 流保存一次性启动模式。
  - 成功判据：`/plan` 不进入 Goal.messages，安全边界下原子进入 plan 并初始化/恢复 GoalPlan；带参数、未知命令、busy 或模型/Tool 执行中均无持久化副作用；普通文本和模型输出不能切换模式。
  - 验证方式：扩展 `packages/slash-command/test/slash-command.test.ts`、`packages/tui/test/command-aware-text-input.test.tsx`、`packages/runtime/test/goal-coordinator.test.ts`；执行三组测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [5.3](./requirements.md#req-5-3)_

- [x] //TODO 4. 增加 GoalPlan 模型契约、系统工具与 Prompt 投影

  - 实现目标：在 `packages/contracts/src/model-output` 增加 GoalPlan patch 与 `goal_plan_update` 契约；在 `system-tools.ts`、`factory.ts`、Agent projector 和 Prompt 中只为 `planMode=true` 暴露 `system_update_goal_plan`，并保留现有 Working Memory Patch 分支。
  - 成功判据：Plan Mode 的 provider schema、wire 解码和 Prompt 包含计划操作；normal mode 完全没有该分支；模型提交文本、Memory Patch 或伪造 ID 不能直接改变 GoalPlan。
  - 验证方式：新增/扩展 `packages/contracts/test/model-output-canonical.test.ts`、`model-output-wire.test.ts`、`system-tools.test.ts`、`packages/agent/test/model-inference-projector.test.ts` 与 `prompt.test.ts`；执行这些测试文件。
  - _Requirements: [3.3](./requirements.md#req-3-3), [8.2](./requirements.md#req-8-2), [8.4](./requirements.md#req-8-4)_

- [x] //TODO 5. 绑定 Todo Run 并原子提交完成状态

  - 实现目标：扩展 Runner、终态提交器和 Coordinator 的 Run 创建路径；Plan Mode 执行 Run 写入 `todoId`/`activeRunId`，完成时把当前 Run Evidence、Run completed 与 Todo completed 放进同一 Checkpoint，失败/取消保持可重试状态。
  - 成功判据：一个 Run 只能绑定一个 Todo；waiting/Action approval 恢复同一关联；完成证据缺失、引用旧 Run 或跨 Goal 时拒绝勾选，失败和取消不产生 completed Todo。
  - 验证方式：新增 `packages/runtime/test/goal-plan-run.test.ts`（待实现），扩展 `runner.test.ts`、`evidence-gate.test.ts` 和 `trajectory-checkpoint-committer.test.ts`；执行这些测试文件。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [6.2](./requirements.md#req-6-2)_

- [x] //TODO 6. 实现 waiting resume 与 completed continue 的会话分流

  - 实现目标：在 `GoalCoordinator` 增加 `continue(ref, newInput)`，加入 completed Run 归档、消息索引、新 Run 建立、Plan Mode pending Todo 选择和按 Goal 串行闸门；保留 `resume` 只恢复 waiting Run。
  - 成功判据：waiting 输入不产生新 Run；completed 输入先保存历史与新 Run 再调度；Plan Mode 无合法 Todo、空输入、错误状态和重复并发请求均不写入，normal mode 继续不 materialize GoalPlan。
  - 验证方式：新增 `packages/runtime/test/goal-multi-run-session.test.ts`（待实现），扩展 `goal-coordinator.test.ts`、`goal-coordinator-task-interaction.test.ts`；执行这些测试文件。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 7. 隔离跨 Run 历史来源与当前 Run Evidence

  - 实现目标：调整 Context Lookup、Trajectory reader、Evidence Gate 和 Working Memory 恢复，使历史读取携带完整 Run 身份，但完成证据只接受当前 Run 的已提交事实；禁止把旧 Lookup 结果洗成当前 Observation。
  - 成功判据：可读取合法旧 Run 事实；未知 Run、跨 Goal、越过 Snapshot boundary、损坏来源和旧 Run Evidence 均被拒绝；相同局部 sequence 在不同 Run 中不会串联。
  - 验证方式：新增 `packages/runtime/test/multi-run-context-lookup.test.ts`（待实现），扩展 `context-retrieval-lifecycle.test.ts`、`context-lookup-result.test.ts`、`working-memory-session.test.ts` 和 `evidence-gate.test.ts`；执行这些测试文件。
  - _Requirements: [6.4](./requirements.md#req-6-4), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 8. 接入 TUI PlanPanel、终态输入与 Run 身份去重

  - 实现目标：扩展 `SessionController`、`SessionScreen`、`UiSessionViewModel` 和 App 命令路由；Plan Mode 从 Goal Snapshot 投影 Todo，completed terminal 保留输入并调用 continue，waiting 仍调用 resume，消息/步骤/流通知按 Run 身份隔离。
  - 成功判据：普通模式不显示猜测的 GoalPlan；Plan Mode 状态稳定区分；完成后可提交下一条输入；旧 Run 的迟到保存和流不会覆盖新 Run 的低序号 Step，恢复历史不重复。
  - 验证方式：扩展 `packages/tui/test/session-controller.test.ts`、`session-controller-timeline.test.ts`、`session-screen.test.tsx`、`trajectory-projector.test.ts` 与 `slash-command-model-e2e.test.ts`；执行这些测试文件。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [ ] //TODO 9. 覆盖持久化故障、重启恢复与 Headless 边界

  - 实现目标：在真实临时 JSON Store、Checkpoint、Trajectory 和 Scheduler 组合根中注入提交前/提交后/marker/调度失败；补齐恢复流程和 Headless/Benchmark 的显式单 Run 返回。
  - 成功判据：提交前失败不调用模型且保留草稿；提交后失败恢复已保存新 Run；孤立文件不回放；Plan Mode pending Todo 不自动启动，normal mode 不自动创建 GoalPlan，权限和安全关闭回归通过。
  - 验证方式：新增 `packages/runtime/test/goal-multi-run-recovery.test.ts`、`packages/tui/test/multi-run-recovery.test.ts`（待实现），扩展 `packages/runtime/test/launcher.test.ts`、`packages/tui/test/cli.integration.test.ts` 与 `benchmarks/test/headless-composition-root.test.ts`；执行这些测试文件。
  - _Requirements: [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [8.1](./requirements.md#req-8-1), [8.4](./requirements.md#req-8-4)_

- [ ] //TODO 10. 完成组合根接线并执行全量回归

  - 实现目标：把新的 Coordinator、Launcher、Slash Registry、Agent Contract、Storage Codec 和 TUI 依赖接入所有生产组合根，补齐公共接口 TSDoc 与实现后架构文档。
  - 成功判据：首轮正常执行、`/plan` 进入规划、Todo Run 完成、completed 后继续、normal 多 Run 和现有 waiting/Action approval 均能从同一组合根工作；所有测试文件被回归入口发现。
  - 验证方式：执行 `npm test`、`npm run check:dependencies` 和 `git diff --check`；检查新增文件、TSDoc、Runtime/Storage/Agent/TUI 架构文档与实现一致。
  - _Requirements: [1.4](./requirements.md#req-1-4), [7.3](./requirements.md#req-7-3), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。以下 Planned Checks 随整包审查，不因已有测试文件存在而视为通过；所有新增场景均待实现。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3)、[1.4](./requirements.md#req-1-4) | `/plan` 只在安全边界进入并持久化 plan；参数、未知命令、busy 和普通模式计划操作均无 Goal 写入；重启恢复模式 | Slash Registry、Coordinator、Launcher 与 Snapshot recovery 测试（待实现） |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3) | GoalPlan 包含稳定 ID、顺序、状态和 revision；非法 Snapshot 不恢复 | Goal domain/reducer 与 Storage Codec round-trip 测试（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3)、[3.4](./requirements.md#req-3-4) | 新增项由 Runtime 分配 ID；增量 patch 保留其他项；计划工具仅 Plan Mode 暴露；无效批次原子拒绝 | Contract schema/wire、system tool、Prompt 和 reducer 测试（待实现） |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3)、[4.4](./requirements.md#req-4-4) | 一个 Todo 只绑定一个 Run；waiting/approval 恢复同一关系；完成证据与勾选同一提交；失败/取消不完成 | Runner、Coordinator、Evidence Gate 与 Checkpoint 集成测试（待实现） |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3)、[5.4](./requirements.md#req-5-4) | waiting 输入走 resume；completed 输入走 continue；normal/plan 分支正确；空输入、错误状态和并发重复请求无写入 | Coordinator 状态分流、Promise barrier 与故障路径测试（待实现） |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3)、[6.4](./requirements.md#req-6-4) | Todo 事实写入 Snapshot；完成仅接受当前 Run Evidence；重启保留计划/Run/步骤；损坏或跨 Goal 来源 fail closed | JSON Store、Trajectory、Evidence 和 recovery 测试（待实现） |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2)、[7.3](./requirements.md#req-7-3) | PlanPanel 只投影 Snapshot；状态可区分；完成后输入可继续；迟到旧 Run 通知不倒退 UI | Ink/Controller、命令 E2E、timeline/projector 测试（待实现） |
| [8.1](./requirements.md#req-8-1)、[8.2](./requirements.md#req-8-2)、[8.3](./requirements.md#req-8-3)、[8.4](./requirements.md#req-8-4) | Headless 不自动串行 pending Todo；计划不扩权；旧 Run 结果不能成为当前 Evidence；不支持协议拒绝推进 | Headless/Benchmark、Tool Policy、Lookup 来源和协议回归测试（待实现） |
| 整体集成与契约同步 | 首轮单 Run、Plan Mode 多 Run、普通模式多 Run、现有问答/Action approval 和安全关闭共同通过；架构文档与实现一致 | `npm test`、`npm run check:dependencies`、`git diff --check` 与源码/文档审查 |

### Latest Result

未执行。当前仅生成 Spec，未运行功能测试，TODO 完成数为 0/10。执行后按 delivery-loop.md 记录每项实际结果、证据位置、验证时间、Git commit（或明确无提交）、相关未提交文件及内容指纹、对应 Spec 指纹；整体状态使用 `passed`/`failed`/`blocked`/`pending-human`，时效使用 `current`/`stale`。Spec 文档校验不作为功能通过证据。

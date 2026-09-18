# 实施计划

- [x] //TODO 1. 收敛 Domain、Transition 与 Snapshot 的普通读取不变量

  - 实现目标：删除 `RunInput.observe_probe`、`PlanProbeProgressEvent` 及其导出，更新 `transition` 和当前 Snapshot 校验，使无最终任务的 Goal 可以保存普通只读 Step、`lastStep` 与可恢复 `pendingAction`，同时拒绝旧 Probe 数据。
  - 成功判据：无 task 的普通只读 Action/Observation 能完成一次 `observe_action` 并增加一次 Step；旧 Probe 事件、字段或不完整执行单元不能通过当前 Codec/Storage 边界。
  - 验证方式：待实现的 `packages/runtime/test/transition.test.ts`、`packages/storage/test/goal-snapshot*.test.ts` 与恢复往返测试；执行相关 Storage/Runtime 测试。
  - _Requirements: [1.3](./requirements.md#req-1-3), [5.3](./requirements.md#req-5-3), [7.1](./requirements.md#req-7-1), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 2. 将 Runner 的前置只读读取接入普通 Action/Observation

  - 实现目标：删除 `executePlanProbe`、`countCommittedProbes`、Probe 回调和专用循环；在任务门控后复用普通 Tool Policy、`stage_action`、`executeToolAndObserve` 与 `observe_action`，并让 `maxSteps` 统一包含前置读取。
  - 成功判据：无 task 的只读 Tool 经过保存待执行状态、执行、Observation 提交后 `stepCount` 恰好增加一次；无 task 的写 Tool 在任何 Tool/Policy 副作用前被拒绝；需要批准的只读 Action 可通过既有恢复路径继续。
  - 验证方式：待实现的 `packages/runtime/test/runner.test.ts`、`packages/runtime/test/runner-plan-probe.test.ts` 替换测试与 `goal-coordinator` 恢复测试；覆盖保存失败、Tool 失败、预算耗尽和批准后普通执行。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 3. 统一 Trajectory 执行单元与下一轮上下文

  - 实现目标：移除 Agent Context Adapter 对无 `action_staged` Probe 单元的特殊识别，确保普通只读 Action/Observation 进入 Hot/Warm 上下文，并保留失败 Observation、提交边界和 Evidence 过滤。
  - 成功判据：读取成功或失败提交后，下一轮模型请求都能看到对应 Tool 标识、状态和受限结果；缺失 staging、跨身份、序号断裂或旧 Probe 单元 fail-closed。
  - 验证方式：更新 `packages/agent/test/trajectory-execution-unit-adapter.test.ts`、`trajectory-model-context-assembler.test.ts` 和 Runtime Observation 集成测试；确认不再依赖 Probe 标记。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [7.2](./requirements.md#req-7-2), [8.1](./requirements.md#req-8-1)_

- [x] //TODO 4. 重写统一默认工作模式 System Prompt 与决策投影

  - 实现目标：更新统一 `executing` Prompt，使模型按“读取事实—等待 Observation—最小下一步—必要时提问/提案—证据完成”的循环工作；保留 task gate 的合法分支投影，但删除 Probe 术语和特殊能力叙述。
  - 成功判据：无 task Prompt 允许只读读取、`ask_user`、Context Lookup 和 Task Proposal；有 task Prompt 引导执行验证并禁止再次提案；两种 Prompt 都明确 Observation/Evidence 优先级，模型不得生成 Runtime 元数据。
  - 验证方式：更新 `packages/agent/test/prompting-default-bundles.test.ts`、`render.test.ts`、模型输出和 Contracts 测试；覆盖已有 Observation 时优先推进、非法分支拒绝和 Prompt 不替代 Runtime 校验。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [8.3](./requirements.md#req-8-3)_

- [x] //TODO 5. 移除 TUI Probe 事件与专用活动状态

  - 实现目标：删除 `SessionCoordinator.onProbeProgress`、`activeProbeDescription`、Probe 监听和专用文案，使只读结果完全由普通 Goal 保存通知、Step Projection 和统一 Session 活动抽屉驱动。
  - 成功判据：只读 Observation 以普通 Step 进入时间线；创建、等待、恢复和任务批准始终停留在统一 Session 页面；TUI 不依赖 Probe 事件或 UI 私有进度重建状态。
  - 验证方式：更新 `packages/tui/test/session-controller.test.ts`、时间线/恢复测试和相关类型测试；确认 `packages/tui/src` 不再导出或订阅 Probe 事件。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [7.1](./requirements.md#req-7-1)_

- [ ] //TODO 6. 完成跨包协议收口、架构文档和组合流回归

  - 实现目标：清理跨包导出、测试夹具和架构说明中的 Probe 语义，补充“创建 Goal → 读取环境 → Observation → 任务提案 → 批准 → 执行”的自动化组合测试，并保持现有 Action Approval、Evidence Gate 与流式屏障行为。
  - 成功判据：生产源码、当前测试入口和架构文档不再依赖 Probe 专用路径；组合流不会停留在 `creating goal...`，读取结果可推动任务提案，批准后普通执行仍可完成。
  - 验证方式：运行受影响包测试、`npx tsc --noEmit`、`npm run check:dependencies`、全量 `npm test` 和 `git diff --check`；检查未提交用户修改未被覆盖。
  - _Requirements: [4.3](./requirements.md#req-4-3), [5.4](./requirements.md#req-5-4), [8.2](./requirements.md#req-8-2)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | 无 task 的只读读取走普通 Action/Observation，成功和失败都形成一个完整 Step，并更新 `lastStep` | Runtime Runner/Transition 集成测试（待实现） |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3)、[2.4](./requirements.md#req-2-4) | 两种 task 状态收到统一默认工作模式；已有 Observation 推动下一步，不重复停留；批准后不再生成 Task Proposal | Prompt Renderer/Contract 测试与固定输出断言（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3) | 未批准写 Tool、未授权 Tool 均在外部调用前拒绝；批准后普通 Policy/Approval 行为不变 | Runner 安全边界与批准恢复测试（待实现） |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3) | 成功/失败 Observation 均进入下一轮上下文；一次读取结束后进入下一轮，不依赖 Probe 回调或无限自旋 | Trajectory Context/Runner 组合测试（待实现） |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3)、[5.4](./requirements.md#req-5-4) | 保存顺序、单次计数、重启恢复和 maxSteps 对前置读取与普通 Step 一致 | Storage 往返、失败注入、恢复和预算测试（待实现） |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3) | TUI 只从普通 Step 和快照恢复读取进度，不显示或订阅 Probe 专用状态 | SessionController/Timeline 测试（待实现） |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2)、[7.3](./requirements.md#req-7-3) | 生产协议只保留普通 Tool 单元；旧 Probe 事件、无 staging 单元和损坏边界 fail-closed | 全仓符号检索、Codec/Adapter 测试和依赖检查 |
| [8.1](./requirements.md#req-8-1)、[8.2](./requirements.md#req-8-2)、[8.3](./requirements.md#req-8-3) | 完成和环境事实只接受已提交 Evidence；Prompt 与 Runtime 不一致时以 Runtime 拒绝为准 | Evidence Gate、非法决策和组合流测试（待实现） |
| 高风险组合流程 | 创建 Goal 后读取环境，Observation 推动 Task Proposal，批准后继续执行且不出现 `creating goal...` 自旋 | 自动化端到端测试；必要时进行一次人工 TUI 体验复核 |

### Latest Result

未执行。运行后按 `delivery-loop.md` 记录逐项证据、整体状态、时效、测试提交或未提交工作树指纹及当前契约版本。

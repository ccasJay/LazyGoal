# Implementation Plan

- [x] //TODO 1. 扩充 ViewModel 步骤流类型契约
  - 实现目标：在 `packages/tui/src/types.ts` 中新增 `UiStepSummary` 接口，并在 `UiSessionViewModel` 中加入 `committedSteps: readonly UiStepSummary[]`。
  - 成功判据：编译通过，`UiStepSummary` 包含序号、工具标识、动作标识、执行状态、输入摘要与输出摘要，且向后兼容既有代码。
  - 验证方式：执行 `npx tsx --test packages/tui/test/session-progress.test.tsx`。
  - _Requirements: [2.1](./requirements.md#req-2-1)_

- [x] //TODO 2. 修复 CLI 组合根的 NotifyingGoalStore 提交通知装配
  - 实现目标：在 `packages/tui/src/cli.tsx` 中使用 `NotifyingGoalStore` 包装存储实例，并将通知对象注入到 `SessionController` 的 `notifyingStore` 依赖中。
  - 成功判据：Controller 初始化时建立有效的保存通知监听；Runtime 保存快照时触发回调；关闭时安全解绑。
  - 验证方式：在 `packages/tui/test/cli.test.ts` 中验证 `notifyingStore` 依赖注入与生命周期。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3)_

- [x] //TODO 3. 实现 SessionController 步骤时间线单调累积与快照投影
  - 实现目标：在 `SessionController` 中维护私有步骤列表，在构造函数与 `onGoalCommitted` 中提取最新 Step，执行单调递增去重并暴露到 ViewModel。
  - 成功判据：按 `stepCount` 严格递增去重，乱序或已提交步骤不重复追加；已有 Goal 恢复时正确初始化步骤历史。
  - 验证方式：在 `packages/tui/test/session-controller.test.ts` 中增加多步提交通知与恢复投影的单元测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [x] //TODO 4. 实现 StepWaterfallItem 紧凑单行与安全截断组件
  - 实现目标：创建 `packages/tui/src/step-waterfall-item.tsx`，将单个已完成步骤渲染为单行紧凑视图，超长输入/输出文本自动截断并显示省略号。
  - 成功判据：成功状态显示绿色勾号，失败显示红色叉号；单行展示控制在安全宽度内，超长字符串安全截断。
  - 验证方式：新增 `packages/tui/test/step-waterfall-item.test.tsx` 单元测试覆盖正常与截断场景。
  - _Requirements: [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 5. 重构 SessionScreen 瀑布流布局与底部活动抽屉
  - 实现目标：重构 `packages/tui/src/session-screen.tsx`，将已完成步骤推入 Ink `<Static>` 区域以提交至终端历史，底部收敛为活动抽屉渲染运行中 Spinner、审批面板或终态摘要。
  - 成功判据：多步执行时，旧步骤行完全保留在终端 scrollback 中，不发生原地擦除覆盖；底部动态区域清晰切换交互态。
  - 验证方式：在 `packages/tui/test/session-screen.test.tsx` 中使用 `ink-testing-library` 断言多步提交时终端帧保留所有历史步骤。
  - _Requirements: [3.1](./requirements.md#req-3-1), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 6. 全量集成验证与端到端回归
  - 实现目标：执行全量测试套件，验证 CLI 与 TUI 在真实场景下的连续步骤推进与视觉渲染。
  - 成功判据：全部测试用例通过，无类型错误，无视觉撕裂或历史步骤丢失。
  - 验证方式：运行 `node scripts/run-regression.mjs`。
  - _Requirements: [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [3.1](./requirements.md#req-3-1)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | CLI 启动时正确包装并向 Controller 注入 NotifyingGoalStore | 待实现的 CLI 组合根装配测试 |
| [1.2](./requirements.md#req-1-2) | Runtime 保存快照时实时触发 Controller 的提交通知 | 待实现的 Controller 实时通知集成测试 |
| [1.3](./requirements.md#req-1-3) | Controller 关闭后丢弃通知不触发重绘 | 待实现的 Controller 关闭生命周期测试 |
| [2.1](./requirements.md#req-2-1) | 新 Step 到达时追加到 ViewModel 的 committedSteps | 待实现的 Controller 步骤投影测试 |
| [2.2](./requirements.md#req-2-2) | 相同或旧的 stepCount 被自动去重拒绝 | 待实现的 Controller 幂等去重测试 |
| [2.3](./requirements.md#req-2-3) | 恢复已有 Goal 时正确初始化已提交步骤 | 待实现的 Controller 恢复初始化测试 |
| [3.1](./requirements.md#req-3-1) | 已提交步骤通过 Ink Static 固化到终端历史中 | 待实现的 SessionScreen Static 渲染测试 |
| [3.2](./requirements.md#req-3-2) | 步骤条目清晰包含序号、Tool 名称与成功/失败指示 | 待实现的 StepWaterfallItem 单元测试 |
| [3.3](./requirements.md#req-3-3) | 超长参数与输出执行安全单行截断 | 待实现的 StepWaterfallItem 截断测试 |
| [4.1](./requirements.md#req-4-1) | 运行中在底部展示 StatusSpinner 和当前步骤文案 | 待实现的 SessionScreen 运行态渲染测试 |
| [4.2](./requirements.md#req-4-2) | 等待审批时底部展示待审批面板且保留上方步骤流 | 待实现的 SessionScreen 审批交互渲染测试 |
| [4.3](./requirements.md#req-4-3) | 终态时展示完成/失败摘要并完整保留全部步骤流 | 待实现的 SessionScreen 终态视图测试 |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。

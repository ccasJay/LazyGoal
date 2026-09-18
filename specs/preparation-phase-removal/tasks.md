# 实施计划

- [x] //TODO 1. 建立统一 Goal 状态与 Agent 交互协议

  - 实现目标：将 `GoalWorkflowState` 收敛为统一 `executing`，新增 `pendingInteraction`、`task_proposal` 和 `ask_user` 的严格 Contract/DTO，并删除当前协议中的 Preparation 专属类型。
  - 成功判据：新 Goal 可表示“无最终任务但等待交互”的状态；合法 `ask_user` 请求能被规范化，非法数量、选项和未知字段被整体拒绝；交互状态不增加 Step。
  - 验证方式：待实现的 Runtime domain 与 Contracts 单元测试，覆盖创建、协议解析、交互等待和拒绝分支。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [8.2](./requirements.md#req-8-2)_

- [x] //TODO 2. 更新 Snapshot、Trajectory 与恢复不变量

  - 实现目标：更新当前 Snapshot schema/codec、Trajectory 事件和跨字段校验，持久化 `pendingInteraction`、`ask_user_answered` 与任务批准边界，删除旧 Preparation 字段和迁移分支。
  - 成功判据：等待中的 `ask_user`/任务提案重启后恢复完整请求、模式和关联 ID；请求 ID、Goal/Run 不匹配、提交边界损坏或旧 Preparation 数据均 fail-closed，保存失败保留最后成功快照。
  - 验证方式：待实现的 Storage、Trajectory checkpoint 和 recovery 集成测试，覆盖成功恢复、错误恢复和 tail 不可见。
  - _Requirements: [2.4](./requirements.md#req-2-4), [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [8.2](./requirements.md#req-8-2), [8.4](./requirements.md#req-8-4)_

- [x] //TODO 3. 重构 Coordinator、Runner 与任务批准推进

  - 实现目标：移除阶段分支和 `PreparationExecutor` 调用，统一处理 `ask_user`、任务提案、反馈、批准、普通决策和终态，并让每次下游调用都遵守保存后继续。
  - 成功判据：任务提案未批准时副作用 Tool 不会执行；批准会固定任务并继续；反馈会保存真实消息并生成新提案；失配操作不改变 Goal、Run 或 Tool 状态；交互等待不增加 Step。
  - 验证方式：待实现的 GoalCoordinator、Runner、transition 集成测试，覆盖首轮推进、批准/反馈、恢复和保存失败顺序。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [6.1](./requirements.md#req-6-1), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [8.4](./requirements.md#req-8-4)_

- [x] //TODO 4. 迁移计划期只读探查与 Tool 安全边界

  - 实现目标：在统一 Runner 中加入 `planProbe` 路径，复用 `ToolRegistry`、`isReadOnly`、Observation 和审计事件；批准前只允许只读 Tool，批准后回到现有 Action/Observation 流。
  - 成功判据：只读探查成功/失败均进入统一 Trajectory 和 TUI 顺序，探查不增加 `stepCount`；写 Tool 在执行前被拒绝且不创建外部副作用；YOLO 不会自动回答 `ask_user`。
  - 验证方式：待实现的 Tool Policy、Runner probe、Action 恢复和 step-count 测试，覆盖只读/写入/YOLO 三类路径。
  - _Requirements: [1.4](./requirements.md#req-1-4), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [8.4](./requirements.md#req-8-4)_

- [x] //TODO 5. 统一 Agent Prompt、Projector 与模型输出适配

  - 实现目标：删除 Preparation Prompt/Executor 和阶段类型，建立一个能区分“任务未批准/任务已批准”的统一 Step Prompt，接入 `ask_user`/`task_proposal` Contract、Memory Patch、Context Lookup 和 Provider Schema。
  - 成功判据：无 task 请求只暴露 `ask_user`、任务提案、lookup 和只读 Tool；有 task 请求允许普通执行决策；模型不能提交 Runtime ID、Step、Epoch 或旧 Preparation 输出；用户回答不能通过 Prompt 变成完成证据。
  - 验证方式：待实现的 Agent Prompt、Projector、Parser、Provider schema 和 EvidenceGate 测试，覆盖两种任务状态与非法旧协议。
  - _Requirements: [1.2](./requirements.md#req-1-2), [3.1](./requirements.md#req-3-1), [3.3](./requirements.md#req-3-3), [5.1](./requirements.md#req-5-1), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2)_

- [ ] //TODO 6. 实现统一 TUI 时间线与 AskUserPanel

  - 实现目标：删除 `PreparationScreen`、`preparationSteps` 和旧阶段派发，扩展 `UiSessionViewModel`/`UiCommand`，在 `SessionScreen` 的 `ActiveDrawer` 中实现计划问题、执行期问题、单选、多选、`Other` 和任务批准反馈。
  - 成功判据：启动/恢复只显示统一 Session；`AskUserPanel` 正确显示问题进度、选项和模式标签；键盘提交只发生一次，错误/忙碌保留输入；答案、提案、Observation 和步骤按提交顺序进入同一瀑布。
  - 验证方式：待实现的 `ink-testing-library` 组件测试、SessionController 测试和恢复 UI 测试，覆盖单选、多选、Other、重复提交和跨 Goal 事件。
  - _Requirements: [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [ ] //TODO 7. 完成跨包回归、架构文档和流式边界验证

  - 实现目标：更新 Runtime、Agent、TUI 当前架构文档和全部受影响回归测试，覆盖统一交互链路、证据边界、旧协议失败和流式 transcript 切换。
  - 成功判据：完整链路可从初始意图进入 `ask_user`、只读探查、任务提案、批准和普通执行；完成声明拒绝用户回答作为证据；活动流冲刷后尾部保留且下一流可启动；所有已有非 Preparation 行为保持不变。
  - 验证方式：执行 `npx tsc --noEmit`、受影响包测试、流式 transcript 定向测试和全量 `npm test`；补充一次交互式 TUI 手工检查记录。
  - _Requirements: [5.2](./requirements.md#req-5-2), [7.2](./requirements.md#req-7-2), [8.1](./requirements.md#req-8-1), [8.3](./requirements.md#req-8-3), [8.4](./requirements.md#req-8-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3)、[1.4](./requirements.md#req-1-4) | 新 Goal 直接进入统一执行；交互等待可恢复且不计 Step；批准后执行继续遵守 Step 不变量 | Runtime domain/Coordinator/Runner 集成测试（待实现） |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3)、[2.4](./requirements.md#req-2-4) | 未批准提案阻止副作用；批准继续；反馈重提案；失配操作无副作用 | 任务批准门控与恢复测试（待实现） |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.3](./requirements.md#req-3-3)、[3.4](./requirements.md#req-3-4) | 合法 1–3 题请求进入等待；非法请求拒绝；单/多选及自由输入答案规范化且只提交一次 | Contracts、Runtime 和 UI 测试（待实现） |
| [4.1](./requirements.md#req-4-1)、[4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3)、[4.4](./requirements.md#req-4-4)、[4.5](./requirements.md#req-4-5) | 统一活动抽屉显示计划/执行问题；键盘选择、Other、错误保留和模式标签符合约定 | Ink 组件测试 + 交互式 TUI 检查（待实现） |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3) | 批准前只读 Tool 可审计且不计 Step；写 Tool 被拒绝；批准后复用既有 Action/YOLO 规则 | Tool Policy、Runner 和回归测试（待实现） |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3)、[6.4](./requirements.md#req-6-4) | 交互先保存后继续；重启恢复完整请求；失配和保存失败保持最后成功快照 | Storage codec、checkpoint 和恢复测试（待实现） |
| [7.1](./requirements.md#req-7-1)、[7.2](./requirements.md#req-7-2)、[7.3](./requirements.md#req-7-3) | 无 Preparation 页面或 Step 1；所有内容按顺序进入单一时间线，恢复后不重复 | TUI Controller/Screen 测试与快照检查（待实现） |
| [8.1](./requirements.md#req-8-1)、[8.2](./requirements.md#req-8-2)、[8.3](./requirements.md#req-8-3)、[8.4](./requirements.md#req-8-4) | 用户回答不能作为完成证据；旧协议 fail-closed；流式尾部保留并允许下一流；边界失败无伪造状态 | EvidenceGate、协议、stream barrier 定向测试和全量回归（待实现） |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。

# Implementation Plan

- [x] //TODO 1. 建立 v2 Goal 领域模型与状态不变量

  - 修改 `packages/runtime/src/domain.ts` 与 `transition.ts`，实现 definition/state、Preparation、消息、StepRecord、stopReason 和 `maxSteps = 0` 语义，同时隔离旧版兼容类型
  - 扩展 Runtime 领域与转换测试，覆盖初始准备快照、未批准任务保护及 Preparation 不消费 Step
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.4](./requirements.md#req-1-4), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 2. 实现版本化 Goal 快照解码与 v1 迁移

  - 修改 `packages/runtime/src/goal-store.ts`，按版本校验 v2 交叉字段并将合法 v1 快照只读转换为 v2
  - 扩展 GoalStore 测试与跨进程 fixture，覆盖消息保序、下一次保存升级、未知版本及损坏快照
  - _Requirements: [1.3](./requirements.md#req-1-3), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3), [8.4](./requirements.md#req-8-4)_

- [ ] //TODO 3. 增加分阶段 Preparation Executor 协议

  - 在 Runtime 增加 PreparationExecutor/PreparationResult 契约，在 Agent 增加按 Goal phase 选择的严格响应 Schema 与 LLM 实现
  - 导出新扩展点并添加单元测试，覆盖 phase/result 不匹配、Adapter 异常和 Tool 提前拒绝
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.4](./requirements.md#req-4-4)_

- [ ] //TODO 4. 重构三阶段 Working Context 与真实消息请求

  - 修改 Agent Prompt Builder，按 gathering_context、planning、executing 派生 WorkingContext，并固定 system、历史消息、当前控制消息的请求顺序
  - 添加 Prompt 与消息测试，覆盖不持久化控制内容、assistant 来源以及恢复后消息内容和顺序不变
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 5. 将 Runner 收敛为 executing 阶段连续执行器

  - 修改 StepExecutor、Runner 与 Run transition，使 Step 结果、规范化 assistant 消息和最新快照按契约保存，并移除公开 Runner resume 路径
  - 扩展 Runner 测试，覆盖 continue 自动循环、blocked、异常 fail、累计 checkpoint、正数上限和 `maxSteps = 0`
  - _Requirements: [4.3](./requirements.md#req-4-3), [6.1](./requirements.md#req-6-1), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 6. 实现 GoalCoordinator 的阶段自动推进

  - 新增 GoalCoordinator，处理 active Preparation 的 question、context_ready、task_proposal，并把 executing Goal 委派给 Scheduler
  - 添加 Coordinator 测试，验证正向阶段转换、问题与完整提案持久化，以及每次继续前先保存成功
  - _Requirements: [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [5.2](./requirements.md#req-5-2)_

- [ ] //TODO 7. 实现 GoalCoordinator 的准备阶段恢复操作

  - 实现 gathering 回答、planning 反馈与批准的 action 校验、消息追加、状态推进和完整快照保存
  - 扩展 Coordinator 测试，覆盖重规划、批准、空输入、无提案及非等待状态的无副作用失败
  - _Requirements: [2.2](./requirements.md#req-2-2), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [5.1](./requirements.md#req-5-1)_

- [ ] //TODO 8. 接入 Launcher、执行阻塞恢复与端到端流程

  - 修改 Launcher、Scheduler 接口与公共导出，校验 LaunchRequest，先保存新 Goal，再由 Coordinator 推进；执行恢复需原子保存用户消息和 running 状态后再调度
  - 添加集成测试，覆盖完整准备到执行流程、RunRef/等待错误、持久化失败停止以及执行首个 Step 的保存顺序
  - _Requirements: [4.3](./requirements.md#req-4-3), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [7.2](./requirements.md#req-7-2)_

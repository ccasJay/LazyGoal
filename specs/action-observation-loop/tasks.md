# 实现计划

- [x] //TODO 1. 升级 Goal v3 领域模型与快照协议

  - 修改 `domain.ts`、`goal-store.ts` 与 Runtime 导出，加入 Action、Observation、AgentDecision、StepRecord、checkpoint 和 pendingAction 数据结构及契约级 TSDoc
  - 建立 v3 严格跨字段校验，并将 v1/v2 快照确定性只读迁移为 v3
  - 扩展 Domain 与 GoalStore 测试，覆盖有界快照、克隆隔离、损坏数据和延迟写回
  - _Requirements: [6.3](./requirements.md#req-6-3), [8.3](./requirements.md#req-8-3), [8.4](./requirements.md#req-8-4)_

- [x] //TODO 2. 实现 Action/Observation 状态转换

  - 扩展 `RunInput` 与 `transition`，实现 Action 暂存、Observation 完成、结束决策、拒绝和执行失败转换
  - 用状态机测试覆盖合法与非法组合、pendingAction 清理、终态不变量及 Step 单次计数
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2)_

- [x] //TODO 3. 建立 Tool 扩展边界并实现 read_file

  - 在 Runtime 增加 Tool、ToolRegistry、ToolPolicy、输入校验和 replayPolicy 契约及内存实现
  - 新增 `packages/tools` 与 ReadFileTool，严格限制 workspaceRoot、绝对路径、路径穿越和符号链接越界
  - 添加真实临时工作区测试，覆盖成功读取、领域失败、拒绝越界与 safe 重放声明
  - _Requirements: [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2)_

- [x] //TODO 4. 将 Agent 执行协议升级为 AgentDecision

  - 修改 StepExecutor、LLMStepExecutor、Prompt 与 Zod Schema，传入授权 ToolDefinition 并严格解析四种 AgentDecision 分支
  - 将 checkpoint、lastStep 和 pendingAction 投影到非持久化 Working Context，移除执行与 Preparation 的 Tool 前置拦截
  - 扩展 Agent 测试，覆盖协议外字段、非法分支、Tool 描述、累计 checkpoint 和纯文本完成决策
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [ ] //TODO 5. 接入 Runner 的 Tool 授权与失败边界

  - 扩展 RunnerDependencies，按冻结 Profile、Registry、Tool 输入协议和 Policy 顺序校验 Agent Action
  - 将越权、缺失 Tool、非法参数、非法决策和 Tool 基础设施异常保存为稳定 execution_error，且不伪造 Observation 或 assistant 消息
  - 添加 Runner 测试，断言失败发生在 Tool 调用前、错误码稳定且不消费 Step
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 6. 实现 Runner 的自动 Action/Observation 循环

  - 在 Runner 中编排 checkpoint 与 pendingAction 先保存、Tool 执行、Observation 保存和连续下一轮
  - 区分 success/failure Observation 与抛出异常，保证每个保存失败都立即停止后续调用
  - 用顺序记录 Fake 覆盖自动允许、保存失败、普通领域失败继续和完整 Step 计数
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.1](./requirements.md#req-4-1)_

- [ ] //TODO 7. 接入 Action 审批、拒绝与瞬时授权

  - 扩展 GoalCoordinator、GoalUserAction、等待结果与 RunScheduler，支持 actionId 匹配的 approve_action、reject_action 和瞬时 authorizedActionId
  - 保证审批等待不执行 Tool，批准先保存再调度，拒绝生成 Observation 后继续且不追加伪造消息
  - 添加 Coordinator、Scheduler 与 Runner 协作测试，覆盖错误 actionId、等待类型隔离和不重复计数
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [7.3](./requirements.md#req-7-3)_

- [ ] //TODO 8. 完成中断恢复与跨模块自动化验证

  - 实现 pendingAction 恢复分流：safe Tool 保留 actionId 自动重放，manual Tool 进入 outcome_unknown 并等待用户决定
  - 增加跨进程和端到端测试，覆盖 read_file 单 Step 重放、正数 maxSteps 与 maxSteps 为 0 的连续循环
  - 运行 TypeScript 编译及 Runtime、Agent、Tools 全量测试，确认执行链集成无回归
  - _Requirements: [7.4](./requirements.md#req-7-4), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2)_

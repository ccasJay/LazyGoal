# 实现任务清单

- [ ] //TODO 1. 建立通用 headless Composition Root 与 benchmark adapter 契约

  - 在 `benchmarks/src/` 定义 `BenchmarkTaskDescriptor`、`BenchmarkEpisode`、`BenchmarkAdapter`、Root 输入与结果类型，并实现单 task 的 Preparation、Planning、Approval、Executing 装配。
  - 通过现有 `Launcher`、`GoalCoordinator`、`InlineScheduler`、`Runner` 和 `LLMStepExecutor` 完成依赖注入；headless 使用确定性的 Preparation 结果和自动批准策略。
  - 使用两个不同任务类型、结果类型的 fake adapter 编写生命周期与契约测试，并确认通用层不导入 ALFWorld。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3)_

- [ ] //TODO 2. 完成 Episode 生命周期、结果封装与错误中止处理

  - 在 Root 中实现每次任务独立创建 Episode/Tool Registry、收集不透明 outcome、等待或终态返回，以及所有退出路径的幂等 `close()`。
  - 保持现有 Tool/Profile 授权、领域错误、基础设施错误和 `ExecutionAbortedError` 语义，处理 close 失败而不覆盖主结果或伪造成功。
  - 增加终态、waiting、环境异常、关闭异常和 Abort 的自动化测试，验证模型或环境调用不会在中止后继续发生。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2)_

- [ ] //TODO 3. 接入 LazyGoal 持久化 Port 与任务命名空间适配

  - 实现 `BenchmarkPersistenceAdapter` 及其 bindings/locator，将 task 映射到独立 namespace，并把同一组 `GoalStore`、`TrajectoryStore` 和可选 `DiagnosticTraceSink` 注入 Root。
  - 默认文件实现复用现有 `JsonFileGoalStore`、`JsonFileTrajectoryStore` 和 `JsonFileDiagnosticTraceSink`；不新增 benchmark 专用编解码或事件协议。
  - 使用内存替身和临时目录测试 Snapshot、Trajectory、Trace 的标识共享与相互隔离、Trace 旁路失败、必要写入失败及多 task namespace 隔离。
  - _Requirements: [4.2](./requirements.md#req-4-2), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3), [8.4](./requirements.md#req-8-4)_

- [ ] //TODO 4. 固化 Snapshot 恢复边界与持久化失败语义

  - 在 Root 返回结果和持久化集成中沿用最新 Goal Snapshot 的 `committedThroughSequence` 作为恢复边界，保留未提交 tail 且禁止隐式 replay。
  - 覆盖初始 Snapshot、Trajectory 追加、commit marker 和 Trace 写入失败的组合场景，确保真实主状态、未确定状态与持久化故障可区分。
  - 验证结果对象包含 Runner 状态、模型完成事实、环境 outcome 和稳定 locator，同时不把环境评分字段硬编码到通用层。
  - _Requirements: [1.2](./requirements.md#req-1-2), [5.1](./requirements.md#req-5-1), [6.3](./requirements.md#req-6-3), [8.5](./requirements.md#req-8-5)_

- [ ] //TODO 5. 将 ALFWorld evaluator 接入通用 Root 并保留评分边界

  - 新增 ALFWorld adapter，把 Manifest task、SidecarClient 和现有 ToolSet 转换为通用 Episode；将 `evaluation-runner.ts` 的单 task 执行委托给 Root。
  - 保留 ALFWorld 的 `won`、`done`、步数、重试、失败分类和报告聚合逻辑；由 evaluator 判定成功，不由 Root 解释领域结果。
  - 增加 adapter-to-Root 与 Profile/Tool 授权集成测试，确认模型声明 `complete` 但环境未获胜时不会被通用层判为成功。
  - _Requirements: [4.1](./requirements.md#req-4-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 6. 完成 package 接线、架构文档与全量回归验证

  - 更新 `benchmarks` 的 TypeScript 包含范围、导出/脚本和 `docs/architecture/benchmarks.md`，说明通用 Root、持久化绑定与 ALFWorld adapter 的实现边界。
  - 增加普通 LazyGoal CLI/TUI 不加载 benchmark 的回归检查，并确认新增 benchmark 不修改 `packages/*` 生产接口。
  - 运行 benchmarks 类型检查、单元/集成测试、项目类型检查、依赖边界检查和 `git diff --check`；确认未显式启用外部环境时测试可运行。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [4.3](./requirements.md#req-4-3)_

# 最小同步 Run Loop 实施计划

执行各项时保留任务文本中的 `//TODO` 标记，按顺序一次只执行一项。

- [x] //TODO 1. 建立同步 Run Loop 的公共类型与导出边界

  - 新增 `packages/runtime/src/step-executor.ts`，声明只接收 `RunState` 并异步返回 `StepResult` 的 `StepExecutor`。
  - 新增 `packages/runtime/src/runner.ts` 中的 `RunnerResult`、`RunnerDependencies` 与 `Runner` 公开签名；`RunnerResult` 表达一次 Runner 调用结果，不表示模型输出。
  - 修改 `packages/runtime/src/scheduler.ts`，使 `RunScheduler.schedule(runId)` 返回 `Promise<RunnerResult>`；更新 `packages/runtime/src/index.ts` 的类型与类导出。
  - 不引入 LLM、Tool、队列、Worker 或新的持久化实体。
  - _需求：1.2、1.4、2.2、5.1、6.1_

- [x] 2. 编写 Runner 的自动化契约测试

  - 新增 `packages/runtime/test/runner.test.ts`，使用 fake `StepExecutor`、记录保存顺序的内存 Store 与既有 `createRun` / `transition`。
  - 覆盖 `created → running → continue → completed` 的保存和执行顺序、`wait → resume → complete`、终态或 `waiting` 时无副作用、Run 不存在与非法恢复。
  - 覆盖累计 `maxSteps`、Executor 抛错转为 `step.fail`、无效 `maxSteps`，以及 Store 读写失败时原错误向上抛出且不再继续执行。
  - 测试不得访问真实 LLM、Tool、网络、文件系统、定时器或后台队列。
  - _需求：2.1–2.6、3.1–3.4、4.1–4.4、5.2–5.5_

- [ ] //TODO 3. 实现 Runner 的同步推进与恢复

  - 在 `packages/runtime/src/runner.ts` 实现 `runUntilBlocked(runId)`：加载最新 `RunState`，对 `created` 先保存 `running`，随后逐步执行、转换并保存，直至 `waiting`、终态或步数上限。
  - 实现 `resume(runId)`：仅允许从 `waiting` 先保存 `running` 后复用同一推进逻辑；对不存在或非等待状态返回对应业务失败。
  - 使用持久化 `stepCount` 作为累计 `maxSteps` 预算；达到上限时保存带 `MAX_STEPS_EXCEEDED` 的 `failed` 状态且不额外调用 Executor 或增加步数。
  - 将 Executor 异常转换为一次 `step.fail` 并保存；Store 与内部状态不变量错误保持向调用方抛出。
  - _需求：2.1–2.6、3.1–3.4、4.1–4.4、5.1–5.3_

- [ ] //TODO 4. 编写 InlineScheduler 的自动化契约测试

  - 新增 `packages/runtime/test/inline-scheduler.test.ts`，以 fake Runner 验证 Scheduler 只委托一次明确 `runId`。
  - 验证它原样返回 Runner 的 `RunnerResult`，并将 Runner 抛出的异常原样交给调用方。
  - 测试不得引入 Store 扫描、后台任务、定时器或并发行为。
  - _需求：1.1–1.4、5.4–5.5_

- [ ] //TODO 5. 实现同步 InlineScheduler

  - 新增 `packages/runtime/src/inline-scheduler.ts`，实现 `RunScheduler` 并仅调用注入 Runner 的 `runUntilBlocked(runId)`。
  - 保持调用同步等待、返回 Runner 的结果、异常透明传递；不得持有 Run 状态或读取 `RunStore`。
  - 从 `packages/runtime/src/index.ts` 导出 `InlineScheduler`。
  - _需求：1.1–1.4、5.1_

- [ ] //TODO 6. 更新 Launcher 的自动化契约测试

  - 修改 `packages/runtime/test/launcher.test.ts` 的 fake Scheduler 以适配新的 `RunnerResult` 返回值。
  - 将成功路径改为断言 `launch()` 返回 Scheduler 提供的最终 `RunState`，包括 `waiting`、`completed` 或 `failed`，而非固定 `created` 状态。
  - 保留并适配 Profile 不存在、ID 生成失败、首次保存失败、Scheduler 抛错等既有边界；补充 Scheduler 返回业务失败时不伪造成功结果的断言。
  - _需求：1.1–1.3、5.4–5.5、6.1–6.4_

- [ ] //TODO 7. 接线 Launcher 的同步执行结果与公共 API

  - 修改 `packages/runtime/src/launcher.ts` 的 `LaunchResult` 成功分支，使其包含 `runId`、Profile 标识与最终 `RunState`，不再声明固定 `created` 状态。
  - 在初始 `RunState` 保存后处理 `scheduler.schedule(runId)` 的成功或业务失败分支，并保持 `PROFILE_NOT_FOUND` 与基础设施异常的既有语义。
  - 确认 `packages/runtime/src/index.ts` 导出的公共类型可供 Launcher、Scheduler 和调用方使用，且 Runtime 不导入 `@kai/llm`。
  - _需求：1.1–1.3、5.1、5.3、6.1–6.4_

- [ ] //TODO 8. 执行最小 Run Loop 的自动化回归验证

  - 运行 `npx tsx --test packages/runtime/test/*.test.ts` 与 `npx tsc --noEmit`。
  - 验证 Runner、InlineScheduler、Launcher 与既有状态机、Store 测试均通过，且测试没有真实外部依赖。
  - 若发现生产代码行为与已批准需求不一致，仅报告失败位置与预期行为，待确认后再调整实现。
  - _需求：1.1–1.4、2.1–2.6、3.1–3.4、4.1–4.4、5.1–5.5、6.1–6.4_

# 最小 Goal-driven Loop 基础设施实施计划

## 执行约束

- Runtime 生产代码由用户手写，Agent 不得执行标记为“用户”的任务。
- Agent 只可执行标记为“Agent”的自动化测试任务，不得把生产逻辑写入测试。
- 先由用户确定公共接口，再按“小测试 → 小实现”逐步推进；不在接口存在前编写测试。
- 不增加 Agent framework、LLM、Tool、完整 loop、checkpoint 或事件历史。

## 任务

- [X] 1. **用户：手写 Runtime package 与公共接口**
  - 创建 `packages/runtime/package.json`、`packages/runtime/src/domain.ts`、`packages/runtime/src/transition.ts`、`packages/runtime/src/run-store.ts` 和 `packages/runtime/src/index.ts`。
  - 定义 `Goal`、`RunStatus`、`RunState`、`StepResult`、`RunInput`、`TransitionResult` 和 `RunStore`。
  - 实现只负责创建初始状态的 `createRun`。
  - 固定 `transition`、`InMemoryRunStore.save` 和 `InMemoryRunStore.load` 的签名；行为可暂时明确抛出未实现错误。
  - 从 `index.ts` 导出所有公共接口，不编写状态转换和存储行为。
  - _Requirements: 1.1, 1.2, 1.4, 1.5, 2.1, 2.2, 2.3, 4.1_

- [X] 2. **Agent：编写初始契约测试**
  - 创建 `packages/runtime/test/domain.test.ts` 和 `packages/runtime/test/transition.test.ts`。
  - Domain Model 测试覆盖 `createRun` 的初始状态、Goal 关联和 JSON round-trip；该部分允许首次运行即通过。
  - Transition Core 测试只覆盖 `created → running → waiting → running → completed` 主路径。
  - 验证每次调用只发生一次转换、有效 step 恰好增加一次 `stepCount`，并更新 `lastResult`。
  - 运行两个测试文件，确认 Transition 测试因行为未实现而失败，而不是因公共接口缺失而失败。
  - _Requirements: 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 4.3, 4.5_

- [X] 3. **用户：手写主生命周期转换**
  - 在 `packages/runtime/src/transition.ts` 中只实现任务 2 所需的 `start`、`step.wait`、`resume` 和 `step.complete`。
  - 保持函数同步、无 I/O，并为每次成功转换返回新的 `RunState`。
  - 运行任务 2 的测试并使其通过。
  - _Requirements: 1.2, 1.4, 1.5, 3.1, 3.4, 3.5, 3.7_

- [X] 4. **Agent：补充 Transition Core 分支与错误测试**
  - 扩展 `packages/runtime/test/transition.test.ts`。
  - 覆盖 `step.continue`、`step.fail` 和 `created`、`running`、`waiting` 的 `cancel`。
  - 覆盖非法转换、终态拒绝输入、错误码 `INVALID_TRANSITION`、原状态不变和输入不被修改。
  - 运行测试，确认尚未实现的分支失败，已经完成的主路径继续通过。
  - _Requirements: 1.3, 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 4.4, 4.5_

- [ ] 5. **用户：补全 Transition Core**
  - 在 `packages/runtime/src/transition.ts` 中实现任务 4 覆盖的剩余合法分支。
  - 非法转换返回失败的 `TransitionResult`、`INVALID_TRANSITION` 和未改变的原状态。
  - 不增加自动循环、LLM、Tool、Clock、存储调用或状态机框架。
  - 运行完整 `transition.test.ts` 并使其通过。
  - _Requirements: 1.2, 1.4, 1.5, 3.1, 3.3, 3.4, 3.6, 3.7, 4.4_

- [ ] 6. **Agent：编写 RunStore 契约测试**
  - 创建 `packages/runtime/test/store.test.ts`。
  - 覆盖首次保存、按 Run ID 加载、覆盖最新快照和不存在时返回 `undefined`。
  - 测试不得依赖文件系统、网络、LLM 或 Tool。
  - 运行该测试文件，确认测试因存储行为未实现而失败，而不是因公共接口缺失而失败。
  - _Requirements: 1.3, 4.1, 4.2, 4.4, 4.5_

- [ ] 7. **用户：手写 InMemoryRunStore**
  - 在 `packages/runtime/src/run-store.ts` 中实现 `save` 与 `load`。
  - 每个 Run ID 只保留最新内存快照，并保持存储逻辑与 `transition` 分离。
  - 不加入历史、删除、查询、事务或磁盘持久化。
  - 运行任务 6 的测试并使其通过。
  - _Requirements: 1.2, 1.4, 1.5, 4.1, 4.2_

- [ ] 8. **Agent：完成自动化验证**
  - 只允许修改 `packages/runtime/test/*.test.ts` 中的测试代码。
  - 运行 `npx tsx --test packages/runtime/test/*.test.ts` 和 `npx tsc --noEmit`。
  - 若失败来自 Runtime 生产实现，只报告失败位置与预期行为，由用户修改生产代码。
  - 确认全部测试不承载生产实现，也不访问真实 LLM、Tool、文件系统或网络。
  - _Requirements: 1.2, 1.3, 3.1, 3.6, 3.7, 4.3, 4.4, 4.5_

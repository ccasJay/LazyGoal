# 最小 Launcher 与单 Run 调度实施计划

生产代码中的核心编排逻辑由你手写；我只在标注为“Agent”的任务中编写测试或执行验证。

- [ ] 1. 用户：建立 Launcher 的公开边界与初始 Run 数据模型
  - 新增 `packages/runtime/src/agent-profile.ts`，定义 `AgentProfile`、可序列化的 `AgentProfileSnapshot` 与确定性查询的 `AgentProfileRegistry`。
  - 新增 `packages/runtime/src/scheduler.ts`，定义只接收一个 `runId` 的 `RunScheduler` 接口。
  - 扩展 `packages/runtime/src/domain.ts` 中的 `RunState` 和 `createRun`，使新 Run 带有冻结的 Profile Snapshot 并保持 `created` 状态。
  - 新增 `packages/runtime/src/launcher.ts` 的公开类型：`LaunchRequest`、`RunIdGenerator`、`LaunchResult`、依赖项与 `launch` 函数签名；暂不编写编排逻辑。
  - 从 `packages/runtime/src/index.ts` 导出以上公开 API；第一版不定义 Profile `version`。
  - _需求：1.1、1.3、1.4、1.5、1.6、2.1、2.2、3.1_

- [ ] 2. Agent：编写 Launcher 的自动化契约测试
  - 新增 `packages/runtime/test/launcher.test.ts`，使用 fake Profile Registry、固定 RunIdGenerator、fake Scheduler 和 `InMemoryRunStore`。
  - 覆盖成功路径：先保存 `created` Run，再以生成的唯一 ID 调度；验证 Generator 仅调用一次及 Profile Snapshot 独立于 Registry 后续修改。
  - 覆盖失败路径：`PROFILE_NOT_FOUND`、Generator 抛错、Store 保存失败、Scheduler 调用失败，并断言不会伪造成功状态或错误调度。
  - 测试不得调用真实 LLM、Tool、网络、文件系统或后台队列。
  - _需求：1.2、1.4、1.5、1.6、2.1、2.3、2.4、2.5、3.2、3.3_

- [ ] 3. 用户：实现单 Run 的 `launch` 编排
  - 在 `packages/runtime/src/launcher.ts` 中按固定顺序实现：解析 Profile → 生成 Run ID → 创建带快照的 Run → 保存 → `schedule(runId)`。
  - 将找不到 Profile 表达为 `PROFILE_NOT_FOUND`；其余依赖错误保持向调用方抛出。
  - 确保保存失败不会调度，调度失败后已保存 Run 仍为 `created`；不增加队列扫描、重试、LLM、Tool 或 loop 行为。
  - _需求：1.1、1.2、1.4、1.5、1.6、2.1、2.3、2.4、2.5、3.1_

- [ ] 4. Agent：执行自动化回归验证
  - 运行 `npx tsx --test packages/runtime/test/*.test.ts` 与 `npx tsc --noEmit`。
  - 仅修正测试自身的问题；生产代码测试失败时，将失败信息交给你决定如何调整实现。
  - _需求：1.1–1.6、2.1–2.5、3.1–3.3_

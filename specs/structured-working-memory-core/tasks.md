# Implementation Plan

- [ ] //TODO 1. 定义 Runtime Working Memory 与冻结协议契约

  - 在 `packages/runtime/src/domain.ts`、Executor Port 与公共入口中增加 `MemoryProtocol`、Memory Entry/Patch/Revision、对象式执行输入和 `GoalProtocolValidator`，保持 Runtime 执行状态为独立权威来源。
  - 为新增或扩展的公共 Interface 补充中文契约级 TSDoc 与最小示例，并增加协议组合、字段隔离和 DTO 不变量测试。
  - _Requirements: [1.3](./requirements.md#req-1-3), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.4](./requirements.md#req-2-4)_

- [ ] //TODO 2. 实现 Patch Validator、Normalizer、Reducer 与 Limits

  - 在 `packages/runtime` 增加纯 Working Memory Core，原子校验操作、stable ID、状态转换、来源、集合容量和大小限制，并生成规范化操作。
  - 增加单元测试覆盖无 Patch、重复 ID、非法更新、控制状态注入、全有或全无应用、确定性归约以及拒绝截断。
  - _Requirements: [2.3](./requirements.md#req-2-3), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 3. 实现 committed Evidence Index 与 Evidence Gate

  - 基于当前 Goal/Run 和 Snapshot 旧提交边界构建 sequence 索引，校验 Finding evidence 的存在性、事件类别、归属和提交状态。
  - 增加 Evidence Gate 测试，覆盖跨 Goal/Run、未提交 tail、Decision、marker、Compact、无结果查询以及 Finding/Hypothesis 降级边界。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 4. 扩展 Trajectory Patch 事实并统一 Snapshot 提交器

  - 在 `packages/runtime/src/trajectory.ts` 增加 `memory_patch_accepted` payload，并以共享 `TrajectoryCheckpointCommitter` 替换 Coordinator 与 Runner 重复的提交边界和 marker 顺序。
  - 增加提交与故障测试，覆盖业务拒绝、Event 追加失败、Snapshot 失败孤儿分支、revision 只在保存副本中推进，以及 marker 失败后仍以 Snapshot 为提交权威。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5)_

- [ ] //TODO 5. 扩展 Storage 到 Snapshot v7 Memory 协议

  - 在 `packages/storage` 增加 v7 DTO、Schema 与 Codec，保存 `definition.memoryProtocol` 和 `state.run.memoryRevision`，并强制 structured/legacy 跨字段不变量。
  - 增加 v5/v6 只读 legacy 恢复、v7 round-trip、未知协议、损坏 revision、恢复不写回及现有 fixture 兼容测试。
  - _Requirements: [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [5.1](./requirements.md#req-5-1), [5.5](./requirements.md#req-5-5)_

- [ ] //TODO 6. 实现 WorkingMemorySession 的 revision 链恢复

  - 从 Snapshot `memoryRevision` 反查 accepted Patch 链，校验边界与 parent 连续性后按 sequence 正序归约，并排除孤儿 Patch、未提交 tail 和原始 Decision。
  - 增加 Session 恢复测试，覆盖 genesis、无 Patch 提交、重复构建幂等、缺失 Trajectory/提交边界、跨 Run/循环链和进程缓存丢弃后的重建。
  - _Requirements: [1.4](./requirements.md#req-1-4), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [5.5](./requirements.md#req-5-5)_

- [ ] //TODO 7. 增加 Agent Prompt Bundle v4 与结构化响应协议

  - 在 `packages/agent` 增加 v4 三阶段 Prompt、Manifest Memory 协议、structured Preparation/AgentDecision Schema 与 `ModelInferenceView.workingMemory` 投影，structured Decision 不再携带 checkpoint。
  - 更新 LLM Preparation/Step Executor 使用对象式输入和冻结协议解析；固定 v1-v3 Prompt、Schema、checkpoint 与无 Trajectory 行为的回归测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [3.1](./requirements.md#req-3-1)_

- [ ] //TODO 8. 将 Working Memory 接入 Preparation 生命周期

  - 在 GoalCoordinator 中于模型调用前重建 Session、校验可选 Patch，并将模型操作与 context-ready、planning feedback、planning approval 的 Runtime lifecycle 操作合并提交。
  - 增加 Coordinator 集成测试，覆盖三个 Preparation 分支、每轮单次模型调用、无 Patch 不变、阶段失效、stable ID 更新、Snapshot 失败及批准任务契约隔离。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [ ] //TODO 9. 将 Working Memory 与 Completion Evidence 接入 Runner

  - 在 Runner 中按冻结协议验证 structured Decision、Patch、Tool Policy/Input/Action 与 `completionEvidence`，并将 Action/终态事实和 accepted Patch 纳入同一次 Snapshot 提交。
  - 增加 Runner 集成测试，覆盖允许、需批准和拒绝 Action、非法 Patch 不污染 Session、Tool 外部作用顺序、criteria 精确覆盖与证据不足时禁止完成。
  - _Requirements: [2.3](./requirements.md#req-2-3), [3.1](./requirements.md#req-3-1), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [7.3](./requirements.md#req-7-3)_

- [ ] //TODO 10. 完成 Composition Root 接线与跨包回归

  - 在 Launcher/TUI Composition Root 为新 Goal 冻结 v4/`structured@1`，注入 Validator、Limits、Session、Committer 与 Store，并在首次保存或模型副作用前拒绝缺失依赖和协议错配。
  - 更新受影响的 `docs/architecture/` 当前实现说明，并增加新旧 Goal、缺失 Trajectory、恢复中断和协议兼容的自动化集成测试。
  - 运行 Runtime、Agent、Storage、TUI 全部测试、`npx tsc --noEmit`、`npm run check:dependencies` 与 `git diff --check`，修复本 Spec 引入的回归。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [3.2](./requirements.md#req-3-2)_

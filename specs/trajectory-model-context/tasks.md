# Implementation Plan

- [x] //TODO 1. 冻结 Model Context 协议并扩展 Snapshot v8

  - 在 Runtime Domain、Prompt Bundle Manifest 与 Storage Codec 中增加 `conversation@1`/`trajectory-layered@1`、Snapshot v8 及 v5–v7 只读映射。
  - 增加协议矩阵、未知组合、恢复不写回和 legacy Conversation 行为测试，并为新增公共 Interface 补齐契约级 TSDoc。
  - _Requirements: [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2)_

- [x] //TODO 2. 实现完整请求 Estimator 与 BudgetPlanner

  - 在 `packages/agent` 增加 Token/字符 Estimator、`ModelContextBudgetPolicy` 和预算报告，计量渲染后的固定 View、响应预留及 Hot/Warm 可用量。
  - 增加 Token 优先、字符兜底、Warm 回借、配置校验、固定输入软超限和输入不可变测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [ ] //TODO 3. 实现 Trajectory Execution Unit Adapter 与 Hot Window

  - 收窄现有 Trajectory Adapter，只从 Snapshot committed boundary 内构造完整 execution units，并实现按预算选择连续最新后缀的 `HotWindowSelector`。
  - 增加 Action/Tool/Observation 分组、首个超限停止、禁止拆分/跳选、tail/marker/非法单元排除和跨身份拒绝测试。
  - _Requirements: [1.2](./requirements.md#req-1-2), [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4)_

- [ ] //TODO 4. 实现大型 Trajectory 输出的模型投影

  - 在 Agent View DTO 与 Trajectory Projector 中增加有界 preview、SHA-256、sequence range、截断状态及可选 artifact availability/reference。
  - 增加超限、无 artifact、稳定重复投影、hash 和原始 Observation 不变测试。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 5. 实现 WarmReducer 与分区语义淘汰

  - 增加 Warm Entry、分区配额、stable ID/source hash 合并、状态失效、retained/overflow 切分及确定性语义 LRU。
  - 增加分类容量、保护上限、reinforcement 合法来源、稳定 tie-break 和 Warm 淘汰不修改 Trajectory 的测试。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_

- [ ] //TODO 6. 实现严格 ContextCompactAdapter 与失败回退

  - 在 `packages/agent` 增加一次性 Compact 调用、严格输入/输出 Schema、来源与预算校验，以及独立 `context_compact_*` Diagnostic Trace。
  - 增加阈值触发、确定性优先、单次调用、非法/无来源/超限响应、中止、Provider 失败和已有 Sidecar 不污染测试。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [ ] //TODO 7. 实现 Warm Sidecar Port、文件 Store 与恢复

  - 在 Runtime 定义 `WarmContextSidecarStore`，在 Storage 实现安全路径、严格 Codec、来源摘要校验、受限权限和原子替换。
  - 增加有效/落后 Sidecar 增量恢复、领先/损坏/版本/hash 失配回退、删除重建和读写故障隔离测试。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

- [ ] //TODO 8. 将分层 Context Assembler 接入 Agent Executor

  - 扩展 `ModelInferenceView` 与 Projector，在 Conversation 裁剪后统一组装 Working Memory、Hot、Warm 和预算报告，并保证权威控制字段不重复。
  - 接入 Preparation/Step Executor 的调用级 Session 生命周期，增加三阶段输入、无状态重建、等待/中断/终止丢弃和所有来源不回写测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [8.3](./requirements.md#req-8-3)_

- [ ] //TODO 9. 完成 Prompt v5、Composition Root 与跨包回归

  - 注册 Prompt Bundle v5，接线 Estimator、Policy、Trajectory/Sidecar Store、Compact Adapter，并在任何模型或缓存副作用前校验协议和配置。
  - 更新受影响的 `docs/architecture/` 当前实现说明，增加新旧 Goal、Sidecar 删除恢复、软超限和 Compact 故障的跨包自动化测试。
  - 运行 Agent、Runtime、Storage、TUI 全部测试、`npx tsc --noEmit`、`npm run check:dependencies` 与 `git diff --check`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.3](./requirements.md#req-2-3), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

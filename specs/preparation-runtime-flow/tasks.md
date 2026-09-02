# Preparation Runtime Flow 实施任务

## 1. Runtime 协议、校验与提交边界

- [x] //TODO 1.1 扩展 Trajectory provenance 协议并统一 content hash

  - 修改 `packages/runtime/src/trajectory.ts`，增加 `PreparationInputEvidence`、`preparation_input_recorded` payload、严格字段校验和 `computeContentHash`；由 `conversation-context-document.ts` 复用同一 hash 实现。
  - 在 Context Document Builder 中将 provenance event 作为透明 metadata 跳过，不切断 Preparation segment，也不生成检索正文。
  - 增加 Trajectory、Conversation Document 和 segment 行为测试；同步新增公开契约的中文 TSDoc 与最小示例。
  - _Requirements: [4.1](./requirements.md#req-4-1)_

- [x] //TODO 1.2 实现 Working Memory 分类与唯一 Phase Policy

  - 在 `packages/runtime/src/working-memory-core.ts` 提供纯 `validateMemoryPatchPhase`，在 canonicalize 前检查原始 PlanItem 操作和当前条目存在性。
  - 让 `GoalCoordinator`、`Runner` 和 Tool Projector 复用该入口；保证整个非法 Patch 原子拒绝，Runtime lifecycle 的 `supersede_scope` 保持独立路径。
  - 增加 gathering、planning、executing 三阶段及四类 Working Memory 的单元测试。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [x] //TODO 1.3 扩展 EvidenceGate 的 Preparation/Execution scope

  - 修改 `packages/runtime/src/evidence-gate.ts` 的公开校验接口，显式传递 `preparation | execution` scope；Preparation 仅允许匹配的用户输入 provenance 支持 Fact create/update。
  - 保持环境、Workspace、验证和完成状态只能由 Tool/Observation 支持；禁止 `retire_fact` 使用 Preparation provenance，并让 executing 与 Plan completion 拒绝该来源。
  - 增加 Fact create/update、retire、scope 混用和无效 sequence 的 focused tests。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [4.5](./requirements.md#req-4-5)_

- [x] //TODO 1.4 统一 accepted Patch canonical 提交并按 phase 恢复

  - 修改 `GoalCoordinator`、`Runner` 和 `WorkingMemorySession`，确保所有来源只提交 canonical operations，并在 replay 时按 accepted Patch 的 phase 选择 Evidence scope。
  - 让 Session 只从 committed revision 链恢复 Memory/Evidence，排除 tail，并保留 plan completion evidence 的 Tool/Observation 限制。
  - 增加 accepted Patch、revision parent、缺失消息、非 user 消息、hash 不匹配和恢复错误测试。
  - _Requirements: [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [4.2](./requirements.md#req-4-2), [5.2](./requirements.md#req-5-2), [5.4](./requirements.md#req-5-4)_

- [x] //TODO 1.5 收敛 PreparationResult、用户输入与 GoalTask 流程

  - 修改 `preparation-executor.ts`、`GoalCoordinator` 和 `launcher.ts`，让 `kind` 驱动流程，让 task proposal 只在批准后复制为最终 `GoalTask`，并保持原始模型响应不进入 Goal State。
  - 按初始创建、gathering 回复和 planning feedback 的既定顺序追加 `preparation_input_recorded`；只向 Preparation 传递 provenance getter，不向 Executing 传递。
  - 增加 Coordinator/Launcher 的事件顺序、approval、初始 intent 和失败不推进测试。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [4.1](./requirements.md#req-4-1)_

- [x] //TODO 1.6 让 CheckpointCommitter 使用单一 TrajectoryStore 并校验 provenance tail

  - 修改 `trajectory-checkpoint-committer.ts` 及 Composition Root，使用同一个 `TrajectoryStore` 完成 append 与 `readWithBoundary`，不新增公开 `TrajectoryReader` seam。
  - 在 `GoalStore.save` 前校验 provenance tail 的 Goal/Run、message index、user 角色和 hash；错配或 reader 缺失时复用现有 `TrajectoryAppendError` 并停止下游副作用。
  - 增加 tail 匹配/错配、普通执行 tail、Snapshot/marker 副作用和单 Store 装配测试。
  - _Requirements: [5.1](./requirements.md#req-5-1), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2)_

## 2. Agent 投影与 Conversation provenance

- [x] //TODO 2.1 为模型 Conversation 和 Preparation provenance 增加独立 DTO

  - 修改 `model-inference-view.ts`、`model-inference-projector.ts` 和相关 Preparation 输入类型，让每条 `ModelConversationMessage` 保留原始 `sourceMessageIndex`。
  - Projector 从 Goal 原始消息数组填充 index，并为 Preparation 暴露独立的 `ModelPreparationInputEvidence`；公开接口同步中文 TSDoc 与最小示例。
  - 增加 Projector 深拷贝、user/assistant 顺序和原始 index 测试。
  - _Requirements: [6.1](./requirements.md#req-6-1)_

- [x] //TODO 2.2 保证 compaction、Epoch 和上下文组装不丢失原始 index

  - 修改 `conversation-context-unit-adapter.ts`、`context-compactor.ts`、`trajectory-model-context-assembler.ts` 和 `prompt.ts`，所有 Conversation 变换只复制 source index。
  - 将 Context Epoch 过滤从裁剪后数组位置改为基于 `sourceMessageIndex` 与 `conversationStartIndex` 的原始索引过滤。
  - 增加完整单元裁剪、Epoch 起点、Trajectory assembler 和 token pruning 后的映射测试。
  - _Requirements: [6.2](./requirements.md#req-6-2)_

- [x] //TODO 2.3 在最终 renderer 边界生成 map 并隔离 Preparation provenance

  - 修改 `render.ts`、`prompt.ts`、Preparation/Step Executor 请求构建路径，在最终 Conversation 确定后一次生成 `visibleConversationMessageMap` 和过滤后的 provenance payload。
  - 保持真实消息正文不嵌入索引；executing 请求不携带 provenance，Projector 或 renderer 收到该字段（包括空数组）时 fail-closed。
  - 增加 Adapter/Compactor/render 后 map、隐藏消息过滤、Preparation 输入和 Executing 无 provenance 的测试。
  - _Requirements: [5.3](./requirements.md#req-5-3), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

## 3. Prompt Bundle v1

- [x] //TODO 3.1 原地更新四个 v1 Prompt 契约

  - 修改 `global-overview@1.njk`、`gathering-context@1.njk`、`planning@1.njk` 和 `agent-decision@1.njk`，补充四类 Memory、provenance、Observation、map 和 PlanItem 阶段规则。
  - 保持 Manifest、Bundle、`structured@1`、`trajectory-layered@1` 与 `bm25-lite@1` 版本不变，不加入迁移或兼容分支。
  - 更新 Prompt、Renderer 和默认 Bundle 测试，确认 Conversation 不作为通用 Fact evidence，完成证明只引用 committed Tool/Observation。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

## 4. 集成与回归

- [x] //TODO 4.1 完成 Composition Root 与跨阶段集成回归

  - 更新 `packages/tui/src/cli.tsx`、Coordinator、Runner、Launcher 和 Agent Executor 的装配，确认共享 TrajectoryStore、Snapshot boundary、恢复 Memory 与最终批准任务的输入关系。
  - 增加初始 intent、gathering、planning feedback、approval、Executing 和 Snapshot 边界的集成测试，覆盖下游调用顺序和 provenance tail 失败副作用。
  - 保持普通执行 tail、Tool Observation 和现有 TUI 启动路径行为不变。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.3](./requirements.md#req-5-3), [8.2](./requirements.md#req-8-2)_

- [ ] //TODO 4.2 同步已实现 Runtime 架构并执行全量回归

  - 根据实际实现更新 `docs/architecture/runtime.md` 的 Evidence、Working Memory、Preparation 数据流和恢复边界；不修改 `project-memory/`。
  - 运行 `npx tsc --noEmit`、完整 packages 测试、`npm --prefix benchmarks run typecheck`、`npm --prefix benchmarks test`、`npm run test:memory`、`npm run memory:check`、`npm run check:dependencies` 和 `git diff --check`。
  - 修复本 Spec 引入的类型、依赖边界、Runtime/Agent/Benchmark/Memory 回归后再结束实现。
  - _Requirements: [5.2](./requirements.md#req-5-2), [5.4](./requirements.md#req-5-4), [7.1](./requirements.md#req-7-1), [8.2](./requirements.md#req-8-2)_

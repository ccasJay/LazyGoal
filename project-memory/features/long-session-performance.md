---
feature: long-session-performance
status: active
summary: "长会话执行热路径的增量读取、单次提交读取、有界进程内缓存与紧凑快照"
source_spec: specs/long-session-performance/
distilled_at: 2026-11-04
reviewed_at: 2026-11-04
tags: [performance, trajectory, snapshot, incremental-read, cache, model-context, polling, json-format, commit-gate]
authorities: [packages/runtime/notes/overview.md, packages/storage/notes/overview.md, packages/model-context/notes/overview.md, packages/runtime/src/trajectory.ts, packages/runtime/src/trajectory-checkpoint-committer.ts, packages/runtime/src/runner.ts, packages/storage/src/json-file-trajectory-store.ts, packages/storage/src/goal-store.ts, packages/storage/src/goal-snapshot-codec.ts, packages/model-context/src/trajectory-model-context-assembler.ts, packages/model-context/src/trajectory-execution-unit-adapter.ts, packages/model-call/src/model-call.ts]
---

# Long Session Performance

## Purpose

- 消除长会话执行热路径上的重复全量读取、深拷贝与无缓存计量，使每步成本不随历史重复放大，同时保持恢复、校验与模型可见语义不变。 [S1, S2, S3, S4]
- 同机 5,000 message/event 档位记录：commit 360.3 → 237.3 ms，warm assembly 198.4 → 30.9 ms；数字只是该基准的参照，不是稳定性断言。 [S1, S18]

## Durable Decisions

- D1 — 每次提交在同一个 mutation gate 内只读取一次最新 Snapshot。`TrajectoryCheckpointCommitter` 把该快照通过 `prepare(latest)` 交给调用方做前置检查或构造待保存 Goal，保存复用同一 latest；`prepare` 抛错或返回不同 Goal ID 时中止提交，不追加事实也不写 Snapshot。 [S1, S2, S6, S7, S22]
- D2 — `read` 与 `readWithBoundary` 保持全量 fail-closed 校验；新增 `TrajectoryIncrementalReadPort.readAfter(afterSequence)` 只校验 `afterSequence` 之后的后缀，调用方必须已通过同一 Store 实例校验过前缀。索引缺失、损坏、行身份不匹配或读取失败时回退全量读取；后缀协议错误仍然抛出而不是降级。 [S1, S3, S5, S8, S9]
- D3 — Assembler 在单实例内按 `(goalId, runId)` 保留至多两个 committed 前缀、执行单元投影与 Hot/Warm 计量缓存。复用要求相同 Epoch 与 native identity：boundary 不变直接复用；boundary 前进时只读取并适配新增后缀；Run/Epoch/native identity 变化、边界回退或 Store 缺少 `readAfter` 时回退全量读取，结果必须与冷启动一致。 [S1, S4, S10, S11]
- D4 — Snapshot 编解码不再在 binding 校验与 clone 之外追加外层深拷贝，返回值不得与输入或已存快照共享可变引用。Goal 快照文件写为 compact JSON 加 trailing newline，schema 与字段语义不变；`atomicWriteJson` 的 durable、重试与目标核对策略保持。 [S1, S3, S12, S14, S15]
- D5 — `GoalStore.readRevision` 是可选变更检测端口：返回值必须与 `restore` 的 `state.commitRevision` 一致。文件实现用进程内 hint 加 `mtime`／`size` 校验，未命中或外部替换时回退完整 `restore` 并刷新 hint；`GoalRevisionMonitor` 优先使用它轮询，缺失时回退 `restore`。 [S1, S2, S12, S13, S19]
- D6 — 计量与来源分类不重复全量计算：Trajectory 执行单元的 `characterCount` 首次读取时计算并缓存，Hot/Warm 选择复用缓存单元的计量而不为未选中单元重新 `stableJson`；Model Input 来源标签使用预计算索引，但必须保持既有标签语义。 [S1, S16, S17, S20, S21]

## Guardrails

- `readAfter` 不能替代 `read`，不能用于跨进程或恢复读取，也不得越过 Snapshot 的 `committedThroughSequence` 扩大可见性。 [S1, S3, S5]
- Assembler 缓存不得持久化、跨实例共享或作为恢复权威；未提交 tail 永不进入模型上下文；缓存失效或不可用时必须回退全量读取。 [S1, S4, S10]
- compact JSON 只改变磁盘字节形态，不得改变 Snapshot schema、字段语义或 fsync/durability 策略；编解码去重不得引入输入、输出与存储之间的共享可变引用。 [S1, S3, S14, S15]
- `prepare(latest)` 只在 gate 内、事实与 Snapshot 写入之前运行；不得借它跳过 gate 顺序或改写 Goal ID。 [S2, S6, S7]
- `readRevision` 只用于变更检测；不得用它的值恢复状态，也不得把它当成跨进程实时保证。 [S1, S2, S12, S13]
- 本次不改变 fsync 频率、不合并 step 内多次 Snapshot 写入，也不新增持久化缓存或存储引擎替换；执行热路径至今仍不持有持久化缓存，`long-session-io-performance` 为列表新增的 catalog 摘要不参与执行或恢复。 [S1, S23]

## Revisit When

- 需要重新讨论 fsync/durability、把多个 step 的事实合并为一次 Snapshot，或引入跨进程缓存时。 [S1]
- Trajectory 编码、Snapshot schema、执行单元边界或模型上下文所有权变化时。 [S1, S3, S4]
- 同一个 Run 需要多实例并发读写，或 revision hint 需要跨进程协调时。 [S1, S12, S13]
- Model Input 来源协议或执行单元计量语义变化时。 [S1, S16, S17]

## Sources

- S1: `specs/long-session-performance/spec.md`
- S2: `packages/runtime/notes/overview.md`
- S3: `packages/storage/notes/overview.md`
- S4: `packages/model-context/notes/overview.md`
- S5: `packages/runtime/src/trajectory.ts`
- S6: `packages/runtime/src/trajectory-checkpoint-committer.ts`
- S7: `packages/runtime/test/commit-restore-count.test.ts`
- S8: `packages/storage/src/json-file-trajectory-store.ts`
- S9: `packages/storage/test/trajectory-increment-read.test.ts`
- S10: `packages/model-context/src/trajectory-model-context-assembler.ts`
- S11: `packages/model-context/test/long-session-assembler-cache.test.ts`
- S12: `packages/storage/src/goal-store.ts`
- S13: `packages/storage/test/goal-revision.test.ts`
- S14: `packages/storage/src/goal-snapshot-codec.ts`
- S15: `packages/storage/test/goal-snapshot-aliasing.test.ts`
- S16: `packages/model-call/src/model-call.ts`
- S17: `packages/model-context/src/trajectory-execution-unit-adapter.ts`
- S18: `packages/runtime/test/long-session-benchmark.test.ts`
- S19: `packages/runtime/src/session-stream.ts`
- S20: `packages/model-call/test/model-input-recording.test.ts`
- S21: `packages/model-context/test/trajectory-execution-unit-adapter.test.ts`
- S22: `packages/runtime/src/runner.ts`
- S23: `specs/long-session-io-performance/spec.md`

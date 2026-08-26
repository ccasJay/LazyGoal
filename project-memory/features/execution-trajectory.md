---
feature: execution-trajectory
status: active
summary: "Runtime 事实轨迹、Snapshot 提交边界与诊断 Trace 分流"
source_spec: specs/execution-trajectory/
distilled_at: 2026-08-26
reviewed_at: 2026-08-26
tags: [trajectory, domain-events, snapshot-boundary, diagnostic-trace, recovery, audit]
authorities: [docs/architecture/runtime.md, docs/architecture/storage.md, docs/architecture/agent.md, docs/architecture/tui.md, packages/runtime/src/trajectory.ts, packages/runtime/src/runner.ts, packages/runtime/src/goal-coordinator.ts, packages/storage/src/goal-snapshot-codec.ts, packages/storage/src/json-file-trajectory-store.ts, packages/agent/src/llm-diagnostic-trace.ts, packages/tui/src/cli.tsx]
---

# Execution Trajectory

## Purpose

- Runtime 通过独立 Trajectory 追加不可变的事实型 Domain Event，记录 Preparation、Executing、Action、Tool、Observation、等待与终态过程；Runtime State 仍由 Goal Snapshot 拥有。 [S1, S2, S5, S6, S11]
- Snapshot 是恢复权威，Diagnostic Trace 是与领域事件分离的诊断旁路；轨迹不会隐式 replay 回 Runtime。 [S1, S2, S7, S9, S10]

## Durable Decisions

- D1 — Trajectory Event 只保存已经发生的事实，禁止把 `currentRunStatus`、`currentPlan` 或 `currentPendingAction` 等派生状态写入 payload；每个事件带有 `eventId`、Run 内单调 `sequence`、Goal/Run、phase 和可选执行单元、Action 关联。 [S1, S2, S5, S6, S11]
- D2 — Runtime 在外部 Tool 效果或状态转换前追加必要事实；追加失败采用 fail-closed。`tool_started` 后若 Tool 未返回，不伪造 `tool_finished` 或成功 Observation；已有 pending Action 保持可恢复。 [S1, S2, S6, S11]
- D3 — Goal Snapshot v6 的 `committedThroughSequence` 是唯一恢复提交边界。事实事件追加后先保存 Snapshot，成功后再追加 `state_committed` marker；marker 丢失不改变边界，未提交 tail 永不自动 replay。 [S1, S2, S7, S11, S12]
- D4 — `JsonFileTrajectoryStore` 使用 Goal/Run 安全编码路径和 JSONL，按 Run 串行追加、严格校验、支持序列范围读取与 committed/tail 查询；当前不提供跨进程锁或 exactly-once。 [S1, S2, S8, S12]
- D5 — LLM 请求、响应、Provider metadata、耗时和异常进入独立 Diagnostic Trace；上游负责递归脱敏与大小限制，Trace 缺失或写入失败不得改变 Snapshot、Domain Event 或执行结果。 [S1, S2, S9, S13]
- D6 — TUI 通过 Composition Root 提供按 Goal/Run 读取轨迹的只读入口；Context Adapter 只能把事件映射为通用 `ContextUnit`，不修改事件、Snapshot 或 Runtime，也不会自动加入当前 Prompt。 [S1, S2, S10, S13, S14]
- D7 — 旧 v5 Snapshot 读取时将缺失边界视为 `0` 且不回写，v1–v4 和未知版本继续拒绝；省略 Trajectory/Trace 依赖时保留原有 Goal 执行语义。当前不实现 Durable Outbox、异步重试、exactly-once 或 Trajectory replay 恢复。 [S1, S2, S3, S4, S7, S12]

## Guardrails

- Runtime State、Trajectory Event 和 Diagnostic Trace 是不同数据面；消费者不得用事件流覆盖或推导当前 Runtime State。 [S1, S2, S5, S9]
- `state_committed` 只证明 Snapshot 持久化成功，不得作为恢复边界的唯一来源；恢复必须读取最新有效 Snapshot。 [S1, S2, S7, S11]
- Domain Event 追加失败不得继续外部 Action、伪造成功结果或创建新的提交快照；Snapshot 已成功但 marker 追加失败时保留 Snapshot，并以 Trace 暴露缺口。 [S1, S2, S6, S7, S11, S12]
- Abort/shutdown 不会隐式写入 `cancelled`、失败状态或新 Snapshot；当前没有生产性的 `run_cancelled` 事件来源。 [S1, S2, S6, S11]
- 当前 TUI 不自动渲染完整轨迹，Agent 不自动把 Trajectory 注入 Prompt；两者都必须通过独立只读消费者接入。 [S1, S2, S10, S13, S14]

## Revisit When

- 需要 Snapshot 与 Trajectory 原子双写、异步重试、跨进程并发保护或 exactly-once 时。
- Trajectory 成为模型上下文正式数据源，或 TUI/Report 开始提供轨迹展示时。
- Runtime 增加明确的用户取消事件生产路径时。
- 事件 Schema、恢复协议或 Snapshot 版本策略再次变化时。

## Sources

- S1: `specs/execution-trajectory/requirements.md`
- S2: `specs/execution-trajectory/design.md`
- S3: `specs/execution-trajectory/tasks.md`
- S4: `docs/architecture/runtime.md`
- S5: `packages/runtime/src/trajectory.ts`
- S6: `packages/runtime/src/runner.ts`
- S7: `packages/storage/src/goal-snapshot-codec.ts`
- S8: `packages/storage/src/json-file-trajectory-store.ts`
- S9: `packages/agent/src/llm-diagnostic-trace.ts`
- S10: `packages/tui/src/cli.tsx`
- S11: `packages/runtime/test/trajectory-lifecycle.test.ts`
- S12: `packages/runtime/test/trajectory-failure.test.ts`
- S13: `packages/storage/test/trajectory-store.test.ts`
- S14: `packages/agent/test/trajectory-context-unit-adapter.test.ts`

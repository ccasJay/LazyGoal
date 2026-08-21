---
feature: goal-session-persistence
status: superseded
summary: "Goal 聚合身份、最新快照与只读协议迁移边界"
source_spec: specs/goal-session-persistence/
distilled_at: 2026-08-16
reviewed_at: 2026-08-19
tags: [goal-store, snapshot, atomic-write, migration]
authorities: [docs/architecture/runtime.md, packages/runtime/src/goal-store.ts]
status_reason: "被 three-view-architecture 取代：旧快照由内存迁移改为统一拒绝，持久化实现迁至 @lazygoal/storage"
superseded_by: [project-memory/features/three-view-architecture.md]
---

# Goal Session Persistence

## Purpose

- Goal Store 持久化每个 Goal 的最新完整快照，使同一 Goal 可以跨进程恢复，同时保持执行身份与 Goal 身份分离。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — `goalId` 标识可恢复的长期会话，`runId` 标识一次执行尝试；恢复同一 Goal 时可以开始新的 Run，而不改变 Goal 身份。 [S1, S2, S3, S4]
- D2 — 每个 Goal 只保留最新完整快照；文件写入采用同目录临时文件加原子替换，不提供历史版本或并发写锁。 [S1, S2, S3, S4]
- D3 — 恢复路径必须严格解码当前协议，并在内存中迁移受支持的旧快照；读取和迁移本身不得回写磁盘。 [S2, S3, S4]

## Guardrails

- 快照不存在时返回 `undefined`；协议损坏产生可识别错误，底层文件系统错误保持传播。 [S1, S3, S4]
- Profile 定义、真实消息与执行状态必须从完整快照恢复，不得用当前 Registry 或合成消息替换。 [S2, S3, S4]
- 协议升级不得把恢复操作变成隐式写入；只有后续正常 checkpoint 才能持久化新格式。 [S2, S3, S4]

## Revisit When

- 存储从单一最新快照扩展为历史、数据库或并发写模型时。
- `goalId` 与 `runId` 的身份语义发生变化时。
- 支持的协议迁移窗口或损坏恢复策略改变时。

## Sources

- S1: `specs/goal-session-persistence/requirements.md`
- S2: `specs/goal-session-persistence/design.md`
- S3: `packages/runtime/src/goal-store.ts`
- S4: `packages/storage/test/goal-store.test.ts`

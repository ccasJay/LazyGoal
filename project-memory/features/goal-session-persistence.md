---
feature: goal-session-persistence
status: active
source_spec: specs/goal-session-persistence/
distilled_at: 2026-08-16
tags: [goal-store, json-snapshot, cross-process-recovery, session-persistence, atomic-rename]
supersedes: []
superseded_by: []
status_reason: ""
---

# Goal Session Persistence

## Capability

- GoalStore 提供单 Goal 最新快照的持久化与跨进程恢复能力，以 goalId 为主键管理包含任务定义、冻结 Profile、有序消息历史和 RunState 的完整 Session 聚合根；JsonFileGoalStore 通过本地文件原子替换实现无锁单快照覆盖。 [S1, S2, S3]

## Durable Decisions

- Goal 作为唯一聚合根：删除 RunState 对 Goal 和 Profile 的反向引用，消除循环引用并保持纯 JSON 可序列化；goalId 负责持久化寻址，runId 负责执行身份，两者以 RunRef 显式组合。 [S1, S2, S3]
- 临时文件加原子 rename 写入：写入同目录 `.tmp` 文件并刷新后通过 rename 覆盖目标文件（文件名由 goalId 的 base64url 编码生成），保证系统崩溃或异常断电不会产生半写入损坏文件。 [S1, S2, S3, S4]
- 恢复操作严格只读：restore 仅负责读取、校验并返回快照克隆，不推进 Run、不追加消息、不写文件，杜绝隐式写副作用。 [S1, S2, S3, S4]

## Contracts and Invariants

- 单一快照原则：对同一 goalId 再次保存直接替换旧快照，标准恢复只返回最近一次成功保存的完整快照，不维护持久化历史分支或事件流。 [S1, S2, S3, S4]
- 存储异常与协议损坏分流：文件不存在返回 undefined；JSON 语法错误、Schema 校验不匹配或文件内 ID 不一致抛出 GoalSnapshotProtocolError；底层文件系统 I/O 错误原样传播。 [S1, S2, S3, S4]

## Lessons

- 使用结构化克隆（InMemory）与独立进程恢复验证（tsx 子进程），有效证明了 Goal 聚合根能够做到真正的进程生命周期解耦与安全恢复。 [S2, S4]

## Reuse Triggers

- 扩展存储后端（如数据库/分布式KV）、设计快照协议升级迁移、实现跨进程/分布式恢复或排查会话持久化异常。

## Sources

- S1: `specs/goal-session-persistence/requirements.md`
- S2: `specs/goal-session-persistence/design.md`
- S3: `packages/runtime/src/goal-store.ts`
- S4: `packages/runtime/test/goal-store.test.ts`

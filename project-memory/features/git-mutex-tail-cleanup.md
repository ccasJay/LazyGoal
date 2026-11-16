---
feature: git-mutex-tail-cleanup
status: active
summary: GitMutex 在同键最后一个回调结算时按队尾 Promise 身份回收锁记录，保留较新等待者，Git 写操作继续按 commonDir 共享锁
source_spec: specs/git-mutex-tail-cleanup/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [git-mutex, lock-lifecycle, in-process-map, tail-reclamation, queue-drain, sandbox]
authorities: [packages/sandbox/src/git-runner.ts, packages/sandbox/test/git-mutex.test.ts, packages/tools/src/git-write-tools.ts, packages/sandbox/src/capability.ts, specs/git-mutex-tail-cleanup/spec.md]
---

# GitMutex 空闲键回收

## Purpose

- `GitMutex.withLock` 在同一仓库键的最后一个回调结算时从进程内 Map 删除锁记录，使长期访问多个仓库时只保留仍有操作的键；同键回调按入队顺序逐一执行、同一时刻最多一个回调运行，同键互斥语义不变。 [S1, S2]

## Durable Decisions

- D1 — 回收判定按队尾身份：`withLock` 把 `currentLock.then(() => nextLock)` 的结果作为队尾写入 Map；结算时 `finally` 先按既有顺序释放 `nextLock`，再仅当 Map 中该键仍指向本次写入的队尾 Promise 时删除键，保留结算后排入的较新队尾；同一键可重新入队并再次回收。 [S1, S2]
- D2 — 回归观测边界：生产端继续使用现有 `GitMutex.withLock` 与既有 Git 写入入口，仓库锁键、授权检查、命令执行与工具结果语义保持不变；回归测试直接观测 Map 键与队尾 Promise 身份，用于捕获回调结果正确但锁记录仍残留的回归。 [S1, S2, S3]

## Guardrails

- 删除条件只允许按队尾 Promise 身份判定，不得无条件清理或扩大删除范围；误删较新队尾会破坏同键互斥。 [S2]
- 不改变锁获取、释放顺序与 commonDir 共享锁语义；不引入持久化锁或跨进程协调。 [S2]

## Revisit When

- 锁记录存储结构或同键并发语义（入队顺序、单执行名额）调整时。
- Git 写操作入口或 commonDir 解析语义变化时。

## Sources

- S1: `specs/git-mutex-tail-cleanup/spec.md`
- S2: `packages/sandbox/src/git-runner.ts`
- S3: `packages/sandbox/test/git-mutex.test.ts`

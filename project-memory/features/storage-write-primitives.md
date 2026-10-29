---
feature: storage-write-primitives
status: active
summary: 让 storage 的原子替换、JSONL 与字节追加、按键串行只有一份实现，并把权限、重试与阶段 ENOENT 策略交给调用点显式声明
source_spec: specs/storage-write-primitives/
distilled_at: 2026-10-29
reviewed_at: 2026-10-29
tags: [storage, atomic-write, jsonl-append, keyed-queue, permissions, enoent, fault-injection, sqlite]
authorities: [packages/storage/src/json-file-write.ts, packages/storage/src/keyed-serial-queue.ts, packages/storage/src/json-file-process-session-store.ts, packages/storage/test/storage-write-invariants.test.ts, packages/storage/notes/overview.md]
---

# 存储写入原语与错误策略

## Purpose

- 让 `@lazygoal/storage` 的原子替换、JSONL 与字节追加、按键串行各只有一份实现，取代 9 处原子替换、6 处追加与 11 处手写队列。 [S1]
- 把权限、重试、核对与缺失目录语义从各 Store 的隐式实现改为调用点可审查的显式声明。 [S1, S7]

## Durable Decisions

- D1 — 原子替换唯一入口是 `atomicWriteJson`：同目录 `<target>.<uuid>.tmp`、创建时文件 `0600` 目录 `0700`、`durable` 决定 rename 前是否 `fsync`、失败清理临时文件并重抛原始错误。原语不定义错误包装，也不从包入口导出。 [S1, S3]
- D2 — 策略由调用点逐点声明，不依赖默认值：`durable`、`retry`、`verify` 按 Store 与文件类型声明；Goal Snapshot 保持三次临时错误上限与逐字节核对，Trajectory 保持尾部核对与协议错误终止。 [S1, S3, S6]
- D3 — 阶段 `ENOENT` 语义固定：`saveSession` 只对 `rename` 的 `ENOENT` 静默（`tolerateRenameEnoent`），`writeMeta` 对整段写入的 `ENOENT` 静默（调用点 `try/catch`）。两者不得互换、合并或扩大，其余 errno 一律原样抛出。 [S1, S4]
- D4 — 追加原语分工：`appendJsonl` 负责单行序列化与核对重试，`appendFileChunk` 负责字节追加与可选 `fsync`；进程输出分片走后者。 [S1]
- D5 — 按键串行统一为 `KeyedSerialQueue`：FIFO、失败只拒绝该操作、最后一个操作结算后释放簿记，并提供 `drain` 支持读己之写。 [S1, S5]
- D6 — 重复写入由静态守护固定：`storage-write-invariants.test.ts` 禁止原语外出现 `rename`、`.tmp` 构造、直接 `appendFile`、`sync` 与 `open(..., "a")`，违规报告文件与行号。 [S1, S8]
- D7 — SQLite 延后到独立 Spec，并记录三项决定性约束：Benchmark 制品按目录复制、`node:sqlite` 仍打印实验性警告、当前无原生模块依赖。 [S1, S2, S9]

## Guardrails

- 权限只在创建时设置：不对已存在路径补 `chmod`，历史宽松权限不被自动纠正。 [S1]
- 不得吞掉非 `ENOENT` 的写入错误；临时文件清理失败不得掩盖原始错误。 [S1]
- 不得新增依赖、SQLite、原生模块、跨进程锁，也不承诺 exactly-once。 [S1]
- 不得改变持久化路径、文件名、JSON/JSONL 字节格式或 Store 公开类型签名。 [S1]

## Revisit When

- 引入 SQLite 或其他持久化介质，或需要跨进程锁时。
- 新增 Store 写入路径，或现有调用点需要新的重试/核对策略时。

## Sources

- S1: `specs/storage-write-primitives/spec.md`
- S2: `specs/storage-write-primitives/plan.md`
- S3: `packages/storage/src/json-file-write.ts`
- S4: `packages/storage/src/json-file-process-session-store.ts`
- S5: `packages/storage/src/keyed-serial-queue.ts`
- S6: `packages/storage/src/goal-store.ts`
- S7: `packages/storage/notes/overview.md`
- S8: `packages/storage/test/storage-write-invariants.test.ts`
- S9: `packages/storage/test/json-file-write.test.ts`

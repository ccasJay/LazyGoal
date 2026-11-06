---
feature: long-session-io-performance
status: active
summary: 长会话 I/O 热路径的正文摘要复用、派生索引合批与 catalog 摘要
source_spec: specs/long-session-io-performance/
distilled_at: 2026-11-04
reviewed_at: 2026-11-04
tags: [performance, io, model-input, trajectory-index, sqlite, catalog, derived-cache, long-session]
authorities: [packages/storage/notes/overview.md, packages/storage/src/json-file-model-input-store.ts, packages/storage/src/json-file-trajectory-store.ts, packages/storage/src/trajectory-index.ts, packages/storage/src/goal-store.ts, packages/runtime/src/trajectory.ts, packages/runtime/src/trajectory-checkpoint-committer.ts, packages/storage/test/io-benchmark.test.ts]
---

# Long Session I/O Performance

## Purpose

- 消除模型输入正文重复写读、轨迹索引逐事件事务与 Goal 列表全量 decode 的写放大，使每次模型调用、每条轨迹事实和每次列表的成本不随会话规模重复放大，同时保持恢复与校验语义不变。 [S1, S2]
- 基准参照（同机 `io-benchmark`）：5,000 档 8 Goal 的 `listHistory` 冷 1005.0ms / 热 0.7ms；4 次模型输入 append 只写 5,000 条正文、读回 0 次；200 条轨迹事件追加约 20ms。数字只是该基准的参照，不是稳定性断言。 [S1, S11]

## Durable Decisions

- D1 — Model Input 正文摘要复用：实例按 Goal 维护已落盘正文摘要集合，首次 append 用一次 `readdir` 种子化，之后每次 append 用一次 `stat` 校验正文目录身份；目录被外部删除或重建时重新种子化并重写正文。命中摘要跳过 `writeFile` 与 EEXIST 读回比对，未命中仍执行 `wx` 写入与读回校验，内容不匹配仍然失败。集合是进程内派生状态，不是跨进程事实源。 [S1, S2, S3, S4, S11]
- D2 — 轨迹索引按 Run 缓冲：JSONL 仍逐事件落盘并保持重试与 fail-closed 校验；索引行先缓冲，在缓冲达到 128 行、提交边界显式 `flushIndex` 或任何索引读取前合并为一个事务写入。索引读取前必须先刷新，否则 `maxSequence` 落后会截断 `readAfter`。索引 schema、`PRAGMA user_version = 1` 与 DELETE journal 不变。 [S1, S5, S6, S7, S12, S13]
- D3 — 索引刷新失败与重开恢复：事务失败时丢弃本批缓冲并把该 Run 标记为脏，后续 `ensureIndex` 走既有 repair/rebuild；进程在缓冲未刷新时退出，下次打开按 JSONL 补齐。刷新不是提交成功条件，committer 通过可选 `TrajectoryIndexFlushPort` 调用并忽略刷新错误。 [S1, S5, S7, S8, S12, S13, S14]
- D4 — Catalog 摘要：`save` 成功后写 `catalog/<goalId>.json` 派生摘要，记录身份、展示字段、`commitRevision` 与快照 `mtime`/`size` 指纹。`listHistory` 优先读摘要并用指纹校验，缺失、损坏或不匹配时回退完整 decode 并重写。摘要写失败不使已完成的快照保存失败；删除 Goal 时同时删除摘要；归档标记不进入摘要，仍由快照旁的 marker 决定。 [S1, S2, S9, S10, S11]
- D5 — 派生数据归属：轨迹索引与 catalog 摘要都是可重建派生态，不是恢复、可见性或表述权威。任何不一致都回退 JSONL／Snapshot 全量路径；索引缓冲不得改变事件顺序，摘要不得扩大可见范围。 [S1, S5, S9]

## Guardrails

- 摘要集合只跳过写入，不改变清单内容；种子化只信任已有文件名，正文内容损坏仍由读取路径的摘要校验发现。 [S1, S3]
- 索引缓冲不得改变 JSONL 落盘顺序、重试或 fail-closed 语义；不得用滞后索引回答 `readAfter`／`queryPage`；刷新失败必须降级为脏并修复。 [S1, S5, S7]
- catalog 摘要不得作为恢复输入，也不得成为 Snapshot 的替代或第二个真源。 [S1, S9, S10]
- 本次不改变 fsync/durability 边界、不引入 WAL、不改索引 schema、JSONL 字节格式或 Snapshot schema。 [S1, S5, S9]

## Revisit When

- 需要跨进程共享正文摘要集合、catalog 摘要或索引缓冲时。
- 索引缓冲阈值、flush 时机或事务边界需要调整时。
- 快照写入新增派生文件，或 `listHistory` 需要新字段时。
- 目录级 copy-out 或 Benchmark 制品语义变化时。

## Sources

- S1: `specs/long-session-io-performance/spec.md`
- S2: `packages/storage/notes/overview.md`
- S3: `packages/storage/src/json-file-model-input-store.ts`
- S4: `packages/storage/test/model-input-store.test.ts`
- S5: `packages/storage/src/json-file-trajectory-store.ts`
- S6: `packages/storage/src/trajectory-index.ts`
- S7: `packages/storage/test/trajectory-index-batch.test.ts`
- S8: `packages/storage/test/trajectory-index-write.test.ts`
- S9: `packages/storage/src/goal-store.ts`
- S10: `packages/storage/test/goal-catalog-summary.test.ts`
- S11: `packages/storage/test/io-benchmark.test.ts`
- S12: `packages/runtime/src/trajectory.ts`
- S13: `packages/runtime/src/trajectory-checkpoint-committer.ts`
- S14: `packages/runtime/test/commit-restore-count.test.ts`

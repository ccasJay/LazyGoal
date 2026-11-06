---
feature: trajectory-query-contract
status: active
summary: "JSONL 事实账本 + 可重建 SQLite 索引 + 固定 Snapshot 水位的轨迹查询系统"
source_spec: specs/trajectory-query-contract/
distilled_at: 2026-11-02
reviewed_at: 2026-11-02
tags: [trajectory, query, sqlite-index, watermark, cursor, execution-unit, timeline, blob, model-input, visibility]
authorities: [packages/runtime/notes/overview.md, packages/storage/notes/overview.md, packages/browser/notes/overview.md, packages/runtime/src/trajectory-query.ts, packages/storage/src/json-file-trajectory-store.ts, packages/storage/src/trajectory-index.ts, packages/browser/src/browser-trajectory.ts, packages/browser/src/browser-model-input.ts, apps/goal-board/src/trajectory.tsx]
---

# Trajectory Query Contract

## Purpose

- 将 Trajectory 查询从整文件读取改为「JSONL 事实账本 + 可重建索引 + 固定 Snapshot 水位」，让列表、详情、执行单元、关联事件、时间线与模型输入共用同一可见性边界。 [S1, S2, S3, S4]
- 三个职责严格分离：JSONL 决定事实，索引决定查询效率，Snapshot 水位决定可见范围；任何查询都不得用索引或前端推断扩大可见性。 [S1, S2, S5]

## Durable Decisions

- D1 — JSONL 仍是唯一事实账本；存储编码 v2 将超过 64 KiB 的 payload 外置为内容寻址 Blob（`<goal>/blobs/<sha256>.json`），超过 64 MiB 滚动到 `<run>.partN.jsonl`，`read()` 重新物化完整领域事件。 [S1, S5, S11]
- D2 — 每个 Run 的 `<run>.index.db` 是只保存查询元数据的 SQLite 索引：sequence、JSONL 字节位置、eventId、时间、类型、执行单元、Action／ModelCall／Program 关联、有界预览与 payload 字节／引用；使用 DELETE journal 与 `PRAGMA user_version = 1`。索引可由 JSONL 完整重建，索引超前时重建、落后时从最后已验证位置补齐、缺失或损坏时删除重建，索引永不领先事实。索引行按 Run 缓冲，在 128 行、提交边界或任何索引读取前合并为一个事务；缓冲未写入时索引只是滞后，读取必须先刷新，刷新失败由既有 repair/rebuild 从 JSONL 恢复。 [S1, S2, S5, S6, S7, S12, S17, S21]
- D3 — 所有浏览器轨迹查询必须携带首次读取的 `committedThroughSequence`；分页游标是不透明字符串并绑定 Run、水位与过滤条件，跨水位或跨过滤复用返回协议错误；列表、详情、执行单元与时间线都在同一水位内解释。 [S1, S4, S5, S9, S18, S19]
- D4 — 执行单元查询拆分为「定位」与「精确查询」：`locateExecutionUnit` 只返回首条已提交序号；`queryExecutionUnitPage` 只返回显式携带该 `executionUnitId` 的事件，并用独立的 `contextBefore`／`contextAfter` 标注上下文；未归属事件不得按时间范围或相邻关系推断归属。 [S1, S3, S4, S5, S9, S18]
- D5 — Action、ModelCall 与 Program 关联由索引元数据提供，只取事件自身事实；索引只提供定位能力，Snapshot 水位仍是最终可见性决定权，部分提交的关联不得泄露水位之后的事件。 [S1, S4, S5, S6, S9, S18]
- D6 — 时间线按固定水位返回事件计数、时间范围与分桶类型分布，不加载 payload；轨迹全文搜索已移除，查询只依赖结构化元数据。 [S1, S4, S8, S10]
- D7 — 模型输入存储仍是调用前独立事实、不参与 Snapshot 恢复；浏览器历史只暴露水位内已提交模型调用对应的输入，孤立输入不进入历史，只能由显式 `maintenance:prune-model-inputs --apply` 清理。 [S1, S4, S13, S14, S20]
- D8 — 索引使用 Node 内置 `node:sqlite`，不引入原生模块；入口与 Worker 启动时抑制实验警告，Benchmark 制品按目录复制后首次查询就地重建索引，不提供跨版本迁移。 [S1, S5, S6, S15, S16]

## Guardrails

- 不得让索引扩大可见性，也不得让 Browser 重新实现 Action／ModelCall／Program 关联；可见性只由 Snapshot 水位决定。 [S1, S4, S5, S18]
- 不得为旧 JSONL 编码、旧索引 schema 或旧游标增加迁移／兼容分支；不支持时 fail-closed。 [S1, S5, S6]
- 不得支持跨进程并发写同一 Run；序号冲突或索引／JSONL 身份不一致必须失败。 [S1, S12]
- 不得自动删除未提交 Model Input、孤立 Blob、JSONL 或索引；删除只能由显式 maintenance 命令执行。 [S1, S14, S20]
- 详情超过 256 KiB、payload 超过 8 MiB 时明确拒绝，不能把截断内容当作完整 Raw。 [S1, S8]
- `program_time_reserved` 仍按独立恢复规则处理，不进入普通轨迹查询语义。 [S1, S3]

## Revisit When

- 同一 Run 需要多个 Store 实例或跨进程并发写入时。
- JSONL 分段、Blob 外置或索引需要压缩、垃圾回收或保留策略时。
- 需要跨 Run 查询、全文检索或替换索引实现时。
- 索引 schema、存储编码或游标协议版本变化时。
- 模型输入需要与已提交轨迹事件建立强制关联或自动清理策略时。

## Sources

- S1: `specs/trajectory-query-contract/spec.md`
- S2: `packages/storage/notes/overview.md`
- S3: `packages/runtime/notes/overview.md`
- S4: `packages/browser/notes/overview.md`
- S5: `packages/storage/src/json-file-trajectory-store.ts`
- S6: `packages/storage/src/trajectory-index.ts`
- S7: `packages/storage/test/trajectory-index-write.test.ts`
- S8: `packages/browser/src/browser-trajectory.ts`
- S9: `packages/storage/test/trajectory-index-query.test.ts`
- S10: `apps/goal-board/src/trajectory.tsx`
- S11: `packages/storage/test/trajectory-encoding.test.ts`
- S12: `packages/storage/test/trajectory-index-recovery.test.ts`
- S13: `packages/browser/src/browser-model-input.ts`
- S14: `scripts/prune-model-inputs.ts`
- S15: `bin/lazygoal.cjs`
- S16: `benchmarks/swebench/src/worker-preflight.ts`
- S17: `packages/storage/test/trajectory-benchmark.test.ts`
- S18: `packages/runtime/src/trajectory-query.ts`
- S19: `packages/browser/test/browser-trajectory-pagination.test.ts`
- S20: `packages/storage/test/model-input-prune.test.ts`
- S21: `specs/long-session-io-performance/spec.md`

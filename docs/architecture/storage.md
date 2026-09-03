# Storage 模块

## 摘要

`@lazygoal/storage` 拥有持久化文件表示与实现：Profile 文件 DTO、当前 Goal Snapshot v1 DTO 与严格 Schema、Runtime↔Snapshot 双向 Codec、Trajectory/Diagnostic JSONL Store，以及实现 Runtime/Agent Port 的内存/JSON 文件 Store。它依赖 Runtime 的 Port 与领域契约；Runtime 不反向加载本模块。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [AgentProfileFile](../../packages/storage/src/agent-profile-file.ts) | Profile 文件 DTO（`schemaVersion: 1`）、严格 Schema 与 `AgentProfileConfigurationError` | 读取文件系统、构造 Runtime Profile |
| [JsonFileAgentProfileStore](../../packages/storage/src/json-file-agent-profile-store.ts) | 实现 Runtime `AgentProfileStore` Port，读取单个 `<profileId>.json` | 扫描其它 Profile、读取 Tool 实例、校验 Tool 注册 |
| [GoalSnapshotV1 协议](../../packages/storage/src/goal-snapshot.ts) | 当前唯一 Snapshot DTO、严格字段与跨字段不变量校验；保存当前 Prompt/Memory/Model Context/Retrieval 组合、完整消息、Run 恢复边界和 Context Epoch | 文件系统 I/O、构造 Runtime Goal、迁移历史 Snapshot |
| [GoalSnapshotCodec](../../packages/storage/src/goal-snapshot-codec.ts) | Runtime Goal↔v1 Snapshot 的 encode/decode 深复制转换；只接受当前 v1，不迁移或回写历史版本 | 文件系统 I/O、读写 Store |
| [InMemoryGoalStore](../../packages/storage/src/goal-store.ts) | 实现 Runtime `GoalStore` Port：save 经 Codec encode、restore 经 decode | 跨实例或跨进程恢复 |
| [JsonFileGoalStore](../../packages/storage/src/goal-store.ts) | 实现 `GoalStore` 与 `GoalCatalog`：base64url 文件名、临时文件 + rename 原子替换、目录扫描摘要 | 乐观锁、租约或版本冲突检测 |
| [JsonFileTrajectoryStore](../../packages/storage/src/json-file-trajectory-store.ts) | 将每个 Goal/Run 的事实事件追加到安全编码的 JSONL 文件，提供序列范围读取与 Snapshot 边界分类 | Snapshot 恢复、marker 推导边界、跨进程锁与 exactly-once |
| [JsonFileDiagnosticTraceSink](../../packages/storage/src/json-file-diagnostic-trace-sink.ts) | 将已脱敏、已限长的诊断记录追加到独立 JSONL 文件 | Domain Event、Snapshot 恢复、Trace 查询与重试 |
| [JsonFileContextRetrievalIndexStore](../../packages/storage/src/context-retrieval-index-sidecar.ts) | 以安全编码路径保存、恢复、原子替换和删除 Retrieval Index Sidecar；严格校验倒排快照、来源摘要、版本与 64 项查询缓存 | 推导 committed boundary、读取 Workspace、修改 Goal 或 Trajectory |

## 生命周期与错误

每次 Profile `load` 只访问 `<directory>/<profileId>.json`：文件缺失返回 `undefined`；不安全 ID、读取失败、非法 JSON、Schema 不匹配或文件内 ID 不一致抛出 `AgentProfileConfigurationError`（稳定错误码 `INVALID_AGENT_PROFILE`）。

Goal 快照统一经 `GoalSnapshotCodec`：`save` 先对 Runtime Goal 按严格 v1 Schema 校验（拒绝多余字段、非法 StepRecord，以及非法的 Trajectory/Memory/Model Context/Retrieval 组合）再深复制 encode；`restore`/decode 只接受当前 v1。历史 Snapshot、未知版本和不完整的当前恢复状态统一在 Codec 边界抛出 `INVALID_GOAL_SNAPSHOT`，不会自动迁移、保存或回写。

`JsonFileGoalStore.listResumable` 只扫描正式 `.json` 普通文件并忽略 `.tmp`；任一正式快照损坏都会报告协议错误而非静默跳过；过滤三个终态后按 `mtime` 倒序、`goalId` 升序返回摘要。

`JsonFileTrajectoryStore` 将轨迹写入 `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl`。
同一实例内按 Run 串行追加并严格校验 JSONL、事件身份和单调序列；缺失文件或空文件读取为空。
`readWithBoundary` 只使用调用方从最新 Goal Snapshot 读取的
`committedThroughSequence` 分类 committed 与未提交 tail，`state_committed` 不具有恢复权威。

`JsonFileDiagnosticTraceSink` 使用独立的 `.jsonl` 目录和同样的安全编码路径；它只负责
追加上游已经脱敏、限长的 `TraceRecord`，不被 `GoalStore` 或 Trajectory 读取，也不参与
恢复边界。

`JsonFileContextRetrievalIndexStore` 将索引缓存写入 `<directory>/<base64url(goalId)>/<base64url(runId)>/retrieval-v1.json`，保存前由严格 Codec 验证文档、倒排表、字段统计和查询结果，再以临时文件 + `fsync` + rename 原子替换；目录为 `0700`、文件为 `0600`。读取时缺失、JSON/Schema 损坏、Goal/Run 不一致、版本失配或 Sidecar 领先当前 boundary 返回 `undefined`。落后 Sidecar 可以先恢复为候选，由 Runtime 根据旧 committed 前缀摘要校验后增量更新；Sidecar 的查询缓存按 canonical query 的键保持 oldest → newest 的确定性顺序，删除或写入失败不会影响领域状态。

## 当前限制与背景

Runtime 执行协议按 Goal 冻结的唯一 `structured@1 + trajectory-layered@1 + bm25-lite@1` 组合解码；Storage 只负责表示，不判断 Prompt Bundle 是否受 Agent 支持。当前 v1 保存完整协议选择、`memoryRevision`（如有）、`committedThroughSequence` 和 Context Epoch，仍不保存 Working Memory 投影；`state_committed` 只是 Snapshot 成功后的审计 marker，恢复以提交边界和 revision 指针为权威。Sidecar 通过同一边界和来源摘要自校验，失配即可重建。

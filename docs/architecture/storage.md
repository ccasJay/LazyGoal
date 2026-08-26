# Storage 模块

## 摘要

`@lazygoal/storage` 拥有持久化文件表示与实现：Profile 文件 DTO、独立 v5/v6 Goal Snapshot DTO 与严格 Schema、Runtime↔Snapshot 双向 Codec，以及实现 Runtime Port 的内存/JSON 文件 Store。它依赖 Runtime 的 Port 与领域契约；Runtime 不反向加载本模块。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [AgentProfileFile](../../packages/storage/src/agent-profile-file.ts) | Profile 文件 DTO（`schemaVersion: 1`）、严格 Schema 与 `AgentProfileConfigurationError` | 读取文件系统、构造 Runtime Profile |
| [JsonFileAgentProfileStore](../../packages/storage/src/json-file-agent-profile-store.ts) | 实现 Runtime `AgentProfileStore` Port，读取单个 `<profileId>.json` | 扫描其它 Profile、读取 Tool 实例、校验 Tool 注册 |
| [GoalSnapshotV5/V6 协议](../../packages/storage/src/goal-snapshot.ts) | 独立 v5/v6 Snapshot DTO、严格字段与跨字段不变量校验；v6 的 `committedThroughSequence` 建立 Trajectory 恢复边界 | 文件系统 I/O、构造 Runtime Goal、版本迁移 |
| [GoalSnapshotCodec](../../packages/storage/src/goal-snapshot-codec.ts) | Runtime Goal↔v6 Snapshot 的 encode/decode 深复制转换；decode 同时接受 v5/v6，v5 边界归一化为 `0` | 文件系统 I/O、读写 Store |
| [InMemoryGoalStore](../../packages/storage/src/goal-store.ts) | 实现 Runtime `GoalStore` Port：save 经 Codec encode、restore 经 decode | 跨实例或跨进程恢复 |
| [JsonFileGoalStore](../../packages/storage/src/goal-store.ts) | 实现 `GoalStore` 与 `GoalCatalog`：base64url 文件名、临时文件 + rename 原子替换、目录扫描摘要 | 乐观锁、租约或版本冲突检测 |
| [JsonFileTrajectoryStore](../../packages/storage/src/json-file-trajectory-store.ts) | 将每个 Goal/Run 的事实事件追加到安全编码的 JSONL 文件，提供序列范围读取与 Snapshot 边界分类 | Snapshot 恢复、marker 推导边界、跨进程锁与 exactly-once |
| [JsonFileDiagnosticTraceSink](../../packages/storage/src/json-file-diagnostic-trace-sink.ts) | 将已脱敏、已限长的诊断记录追加到独立 JSONL 文件 | Domain Event、Snapshot 恢复、Trace 查询与重试 |

## 生命周期与错误

每次 Profile `load` 只访问 `<directory>/<profileId>.json`：文件缺失返回 `undefined`；不安全 ID、读取失败、非法 JSON、Schema 不匹配或文件内 ID 不一致抛出 `AgentProfileConfigurationError`（稳定错误码 `INVALID_AGENT_PROFILE`）。

Goal 快照统一经 `GoalSnapshotCodec`：`save` 先对 Runtime Goal 按同一严格 Schema 校验（拒绝多余字段、非法 StepRecord、缺失或非正整数的 `promptBundleVersion`，以及非法的 `committedThroughSequence`）再 encode 深复制；`restore`/decode 读取 `metadata.schemaVersion`，接受 v5/v6，v5 缺失的提交边界映射为 `0`，不改写原文件；v1 至 v4 与未知版本统一抛出 `INVALID_GOAL_SNAPSHOT`。并发写入为最后替换者覆盖，失败保存会清理 `.tmp` 临时文件，文件系统错误原样传播。

`JsonFileGoalStore.listResumable` 只扫描正式 `.json` 普通文件并忽略 `.tmp`；任一正式快照损坏都会报告协议错误而非静默跳过；过滤三个终态后按 `mtime` 倒序、`goalId` 升序返回摘要。

`JsonFileTrajectoryStore` 将轨迹写入 `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl`。
同一实例内按 Run 串行追加并严格校验 JSONL、事件身份和单调序列；缺失文件或空文件读取为空。
`readWithBoundary` 只使用调用方从最新 Goal Snapshot 读取的
`committedThroughSequence` 分类 committed 与未提交 tail，`state_committed` 不具有恢复权威。

`JsonFileDiagnosticTraceSink` 使用独立的 `.jsonl` 目录和同样的安全编码路径；它只负责
追加上游已经脱敏、限长的 `TraceRecord`，不被 `GoalStore` 或 Trajectory 读取，也不参与
恢复边界。

## 当前限制与背景

Runtime 执行协议统一为单一 `AgentDecision` 路径；本模块在解码侧拒绝所有 v1 至 v4 快照（不迁移、不改写），当前不存在 Prompt Bundle 版本缺省值，v5/v6 都对该字段校验正整数，v6 另外保存 Snapshot 纳入的最大 Domain Event 序号。`state_committed` 只是 Snapshot 成功后的审计 marker，恢复消费者以 Snapshot 的 `committedThroughSequence` 为权威边界。后续新增 Bundle 版本不再升级 Snapshot Schema。演进背景见 [三视图分层架构 Spec](../../specs/three-view-architecture/design.md)。

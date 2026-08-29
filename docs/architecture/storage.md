# Storage 模块

## 摘要

`@lazygoal/storage` 拥有持久化文件表示与实现：Profile 文件 DTO、独立 v5/v6/v7/v8 Goal Snapshot DTO 与严格 Schema、Runtime↔Snapshot 双向 Codec、Trajectory/Diagnostic JSONL Store，以及实现 Runtime/Agent Port 的内存/JSON 文件 Store。它依赖 Runtime 的 Port 与领域契约；Runtime 不反向加载本模块。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [AgentProfileFile](../../packages/storage/src/agent-profile-file.ts) | Profile 文件 DTO（`schemaVersion: 1`）、严格 Schema 与 `AgentProfileConfigurationError` | 读取文件系统、构造 Runtime Profile |
| [JsonFileAgentProfileStore](../../packages/storage/src/json-file-agent-profile-store.ts) | 实现 Runtime `AgentProfileStore` Port，读取单个 `<profileId>.json` | 扫描其它 Profile、读取 Tool 实例、校验 Tool 注册 |
| [GoalSnapshotV5/V6/V7/V8 协议](../../packages/storage/src/goal-snapshot.ts) | 独立 v5/v6/v7/v8 Snapshot DTO、严格字段与跨字段不变量校验；v6+ 的 `committedThroughSequence` 建立 Trajectory 恢复边界，v7+ 保存 Memory 协议与 revision 指针，v8 保存 Model Context 协议 | 文件系统 I/O、构造 Runtime Goal、版本迁移 |
| [GoalSnapshotCodec](../../packages/storage/src/goal-snapshot-codec.ts) | Runtime Goal↔v8 Snapshot 的 encode/decode 深复制转换；decode 接受 v5/v6/v7/v8，旧版本按 legacy `checkpoint@1` 恢复，下一次保存升级为 v8 | 文件系统 I/O、读写 Store |
| [InMemoryGoalStore](../../packages/storage/src/goal-store.ts) | 实现 Runtime `GoalStore` Port：save 经 Codec encode、restore 经 decode | 跨实例或跨进程恢复 |
| [JsonFileGoalStore](../../packages/storage/src/goal-store.ts) | 实现 `GoalStore` 与 `GoalCatalog`：base64url 文件名、临时文件 + rename 原子替换、目录扫描摘要 | 乐观锁、租约或版本冲突检测 |
| [JsonFileTrajectoryStore](../../packages/storage/src/json-file-trajectory-store.ts) | 将每个 Goal/Run 的事实事件追加到安全编码的 JSONL 文件，提供序列范围读取与 Snapshot 边界分类 | Snapshot 恢复、marker 推导边界、跨进程锁与 exactly-once |
| [JsonFileDiagnosticTraceSink](../../packages/storage/src/json-file-diagnostic-trace-sink.ts) | 将已脱敏、已限长的诊断记录追加到独立 JSONL 文件 | Domain Event、Snapshot 恢复、Trace 查询与重试 |
| [JsonFileWarmContextSidecarStore](../../packages/storage/src/warm-context-sidecar.ts) | 以安全编码路径保存、恢复、原子替换和删除可丢弃 Warm Context Sidecar；按 Snapshot 边界、来源摘要和 compactor 版本拒绝失配缓存 | Goal Snapshot、Trajectory 事实提交、模型 Compact 调用 |

## 生命周期与错误

每次 Profile `load` 只访问 `<directory>/<profileId>.json`：文件缺失返回 `undefined`；不安全 ID、读取失败、非法 JSON、Schema 不匹配或文件内 ID 不一致抛出 `AgentProfileConfigurationError`（稳定错误码 `INVALID_AGENT_PROFILE`）。

Goal 快照统一经 `GoalSnapshotCodec`：`save` 先对 Runtime Goal 按同一严格 v8 Schema 校验（拒绝多余字段、非法 StepRecord、缺失或非正整数的 `promptBundleVersion`，以及非法的 `committedThroughSequence`、Memory/Model Context 协议和 revision 跨字段组合）再 encode 深复制；`restore`/decode 读取 `metadata.schemaVersion`，接受 v5/v6/v7/v8，v5 缺失的提交边界映射为 `0`，v5/v6 按 legacy `checkpoint@1` 恢复，v7 缺失 Model Context 协议时按 `conversation@1` 恢复，旧文件不改写且下一次正常保存生成 v8。v1 至 v4 与未知版本统一抛出 `INVALID_GOAL_SNAPSHOT`。并发写入为最后替换者覆盖，失败保存会清理 `.tmp` 临时文件，文件系统错误原样传播。

`JsonFileGoalStore.listResumable` 只扫描正式 `.json` 普通文件并忽略 `.tmp`；任一正式快照损坏都会报告协议错误而非静默跳过；过滤三个终态后按 `mtime` 倒序、`goalId` 升序返回摘要。

`JsonFileTrajectoryStore` 将轨迹写入 `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl`。
同一实例内按 Run 串行追加并严格校验 JSONL、事件身份和单调序列；缺失文件或空文件读取为空。
`readWithBoundary` 只使用调用方从最新 Goal Snapshot 读取的
`committedThroughSequence` 分类 committed 与未提交 tail，`state_committed` 不具有恢复权威。

`JsonFileDiagnosticTraceSink` 使用独立的 `.jsonl` 目录和同样的安全编码路径；它只负责
追加上游已经脱敏、限长的 `TraceRecord`，不被 `GoalStore` 或 Trajectory 读取，也不参与
恢复边界。

`JsonFileWarmContextSidecarStore` 将 Sidecar 写入 `<directory>/<base64url(goalId)>/<base64url(runId)>/warm-v1.json`，保存先编码校验，再使用临时文件 + rename 原子替换；`remove` 是幂等的，缺失、损坏、版本/来源失配或领先 Snapshot 的 Sidecar 在恢复时统一返回 `undefined`。Sidecar 只是可重建缓存，Assembler 读取它但不负责写入；调用方应在对应 Snapshot 成功提交后再保存派生结果。

## 当前限制与背景

Runtime 执行协议按 Goal 冻结的 Prompt/Memory/Model Context 组合解码；本模块只负责 Snapshot 表示，不判断 Prompt Bundle 是否受 Agent 支持。v8 保存 `definition.memoryProtocol`、`definition.modelContextProtocol` 与可选 `state.run.memoryRevision`，不保存 Working Memory 集合；v5/v6 只读恢复为 legacy，v7 缺失 Model Context 时恢复为 conversation，新的 v5/structured/trajectory-layered Goal 由 Composition Root 在写入前冻结协议。`state_committed` 只是 Snapshot 成功后的审计 marker，Working Memory 恢复消费者以 Snapshot 的 `committedThroughSequence` 和 revision 指针为权威边界；Sidecar 通过同一边界和来源摘要自校验，失配即可重建。后续新增 Bundle 版本不再升级 Snapshot Schema。演进背景见 [三视图分层架构 Spec](../../specs/three-view-architecture/design.md)。

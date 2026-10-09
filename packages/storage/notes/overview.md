# 持久化实现

Snapshot、Trajectory、Profile 和调用事实的文件 Schema 与 Store。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 摘要

`@lazygoal/storage` 拥有持久化文件表示与实现：Profile 文件 DTO、当前 Goal Snapshot v1 DTO 与严格 Schema、Runtime↔Snapshot 双向 Codec、Trajectory/Diagnostic JSONL Store、Tool Grant 授权账本，以及实现 Runtime/Agent Port 的内存/JSON 文件 Store。它依赖 Runtime 的 Port 与领域契约；Runtime 不反向加载本模块。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [AgentProfileFile](../src/agent-profile-file.ts) | Profile 文件 DTO（`schemaVersion: 1`）、严格 Schema 与 `AgentProfileConfigurationError` | 读取文件系统、构造 Runtime Profile |
| [JsonFileAgentProfileStore](../src/json-file-agent-profile-store.ts) | 实现 Runtime `AgentProfileStore` Port，读取单个 `<profileId>.json` | 扫描其它 Profile、读取 Tool 实例、校验 Tool 注册 |
| [GoalSnapshotV1 协议](../src/goal-snapshot.ts) | 当前唯一 Snapshot DTO、严格字段与跨字段不变量校验；保存当前 Prompt/Memory/Model Context/Retrieval 组合、模型选择状态（`modelSelection`）、完整消息、`mode`、GoalPlan、`completedRuns`、Run/todo 关系、Run 的唯一 `exposedToolIds`、Context Epoch 与待执行 Action 的授权引用 | 文件系统 I/O、构造 Runtime Goal、迁移历史 Snapshot |
| [GoalSnapshotCodec](../src/goal-snapshot-codec.ts) | Runtime Goal↔v1 Snapshot 的 encode/decode 深复制转换；只接受当前 v1，不迁移或回写历史版本 | 文件系统 I/O、读写 Store |
| [InMemoryGoalStore](../src/goal-store.ts) | 实现 Runtime `GoalStore` Port：save 经 Codec encode、restore 经 decode | 跨实例或跨进程恢复 |
| [JsonFileGoalStore](../src/goal-store.ts) | 实现 `GoalStore` 与 `GoalCatalog`：base64url 文件名、临时文件 + rename 原子替换、明确临时故障核对后有界重试、目录扫描摘要 | 跨进程锁、乐观锁、租约或版本冲突检测 |
| [JsonFileToolGrantStore](../src/json-file-tool-grant-store.ts) | 严格验证 workspace 授权账本，以临时文件 + fsync + rename 保存 pending/active/revoked Grant，按来源 Action 幂等暂存/激活 | Goal 状态转换、跨进程锁或分布式事务 |
| [JsonFileModelPreferenceStore](../src/json-file-model-preference-store.ts) | 在工作区私有目录严格解析并原子替换 Web 模型偏好身份；损坏文件不被覆盖 | 模型可选性判断、Goal Snapshot 或跨进程锁 |
| [JsonFileTrajectoryStore](../src/json-file-trajectory-store.ts) | 将每个 Goal/Run 的事实事件（包括结构化 `model_context_frame`）追加到安全编码的 JSONL 文件，提供序列范围读取与 Snapshot 边界分类；对明确临时文件错误核对尾部后有界重试 | Snapshot 恢复、marker 推导边界、跨进程锁与 exactly-once |
| [JsonFileDiagnosticTraceSink](../src/json-file-diagnostic-trace-sink.ts) | 将已脱敏、已限长的诊断记录追加到独立 JSONL 文件 | Domain Event、Snapshot 恢复、Trace 查询与重试 |
| [JsonFileMetricsStore](../src/json-file-metrics-store.ts) | 将模型调用开始/结束事实、历史覆盖标记与已知写入缺口分别追加到 JSONL | Goal 恢复、token 估算、累计投影缓存和跨进程锁 |
| [JsonFileContextRetrievalIndexStore](../src/context-retrieval-index-sidecar.ts) | 以安全编码路径保存、恢复、原子替换和删除 Retrieval Index Sidecar；严格校验倒排快照、来源摘要、版本与 64 项查询缓存 | 推导 committed boundary、读取 Workspace、修改 Goal 或 Trajectory |

## 生命周期与错误

每次 Profile `load` 只访问 `<directory>/<profileId>.json`：文件缺失返回 `undefined`；不安全 ID、读取失败、非法 JSON、Schema 不匹配或文件内 ID 不一致抛出 `AgentProfileConfigurationError`（稳定错误码 `INVALID_AGENT_PROFILE`）。

Goal 快照统一经 `GoalSnapshotCodec`：`save` 先对 Runtime Goal 按严格 v1 Schema 校验（拒绝多余字段、非法 StepRecord，缺失或非法的 `modelSelection`，以及非法的 Trajectory/Memory/Model Context/Retrieval 组合）再深复制 encode；`restore`/decode 只接受当前 v1。Schema 同时保证 normal Goal 没有 GoalPlan、Plan Mode 必须有 GoalPlan、Todo ID/position/status 与 `Run.todoId` 一致、历史 Run 的消息区间有序且不包含当前 Run。历史 Snapshot、未知版本、缺失 `modelSelection` 的旧开发快照和不完整的当前恢复状态统一在 Codec 边界抛出 `INVALID_GOAL_SNAPSHOT`，不会自动迁移、保存或回写。

当前 Snapshot 同时校验 `pendingProgram` 与运行中父 Action、子 `pendingAction` 的身份及调用位置；Codec 原位保存恢复指针和已用结果字节数。PTC 子事实的 `programId/callIndex` 随 Trajectory 严格解析，结果仍以 Snapshot 的提交边界为准。`program_time_reserved` 是例外：它在同一 JSONL 中单独同步到磁盘，恢复时无论 Snapshot 是否纳入该事件都要计入预算，防止崩溃重置额度。Storage 不推断工具是否已经产生外部副作用。

`JsonFileGoalStore.save` 对 Snapshot 只编码一次，并在同一目录写临时文件、同步后原子替换。`EINTR`、`EAGAIN`、`EBUSY` 最多尝试三次；每次重试前核对正式快照是否已成为目标内容，只有未替换时才重写相同快照。替换已成功但调用返回临时错误时继续完成归档标记清理，不重放 Runtime 提交。临时文件损坏或无法核实正式文件时停止。`listResumable` 只扫描正式 `.json` 普通文件并忽略 `.tmp`；任一正式快照损坏都会报告协议错误而非静默跳过；过滤三个终态后按 `mtime` 倒序、`goalId` 升序返回摘要。

`JsonFileToolGrantStore` 将当前 workspace 的 Grant 写入私有 `tool-grants.json`；损坏 JSON、Schema 错误、重复 ID/来源或同一来源授权冲突均失败关闭，不会重置账本。只有 active 且 workspace 与操作匹配的 Grant 可被 Runner 查询；goal 范围还必须匹配 `goalId`。pending Grant 仅供 Coordinator 在批准 Snapshot 提交后恢复激活，revoked Grant 不再匹配。Store 实例内写入串行化并原子替换文件，不提供跨进程并发事务。

`JsonFileTrajectoryStore` 将轨迹写入 `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl`。
同一实例内按 Run 串行追加并严格校验 JSONL、事件身份和该 Run 内的单调序列；明确的 `EINTR`、`EAGAIN`、`EBUSY` 写入错误最多尝试三次。每次重试前核对事件是否已完整落盘；仅确认未追加时才复用相同 Event 身份与序号重试。完整落盘后报错则视为该次追加成功，部分行或无法确认的状态立即失败。新 Run 从本地序号 1 开始，缺失文件或空文件读取为空。`run_created`、`plan_mode_entered` 和 `goal_plan_updated` 是事实事件，不能替代 Goal Snapshot 的当前状态。
`readWithBoundary` 只使用调用方从最新 Goal Snapshot 读取的
`committedThroughSequence` 分类 committed 与未提交 tail，`state_committed` 不具有恢复权威。Snapshot 已保存而 marker 追加失败时，恢复仍以 Snapshot 边界为准；孤立或越界事件只保留为未提交 tail，不会被自动 replay。`model_context_frame` 在 Trajectory 协议中校验阶段、Epoch、Conversation 位置、Section 身份、结构化 JSON 投影与实际更新文本；Runtime 恢复查询还会对照当前注册表过滤未知或身份不匹配的 Section。

`JsonFileDiagnosticTraceSink` 使用独立的 `.jsonl` 目录和同样的安全编码路径；它只负责
追加上游已经脱敏、限长的 `TraceRecord`，不被 `GoalStore` 或 Trajectory 读取，也不参与
恢复边界。

`JsonFileMetricsStore` 按 Goal/Run 保存调用事实，并在 Goal 子目录保存覆盖状态和已知缺口。目录权限为 `0700`、文件权限为 `0600`；读取严格校验 JSONL、协议和身份，坏记录直接报错。指标事实不进入 Goal Snapshot，不作为恢复输入；`session-metrics` 每次查询都以当前 Snapshot 和这些事实重新计算投影。

`JsonFileContextRetrievalIndexStore` 将索引缓存写入 `<directory>/<base64url(goalId)>/<base64url(runId)>/retrieval-v1.json`，保存前由严格 Codec 验证文档、倒排表、字段统计和查询结果，再以临时文件 + `fsync` + rename 原子替换；目录为 `0700`、文件为 `0600`。读取时缺失、JSON/Schema 损坏、Goal/Run 不一致、版本失配或 Sidecar 领先当前 boundary 返回 `undefined`。落后 Sidecar 可以先恢复为候选，由 Runtime 根据旧 committed 前缀摘要校验后增量更新；Sidecar 的查询缓存按 canonical query 的键保持 oldest → newest 的确定性顺序，删除或写入失败不会影响领域状态。

## 当前限制与背景

Runtime 执行协议按 Goal 冻结的唯一 `structured@1 + trajectory-layered@1 + bm25-lite@1` 组合解码；Storage 只负责表示，不判断 Prompt Bundle 是否受 Agent 支持。当前 v1 保存完整协议选择、`memoryRevision`（如有）、`committedThroughSequence` 和 Context Epoch，仍不保存 Working Memory 投影；`state_committed` 只是 Snapshot 成功后的审计 marker，恢复以提交边界和 revision 指针为权威。Sidecar 通过同一边界和来源摘要自校验，失配即可重建。

## 模型消息日志

[`JsonFileModelInputStore`](../src/json-file-model-input-store.ts) 实现 Runtime 的独立输入查看端口。每个 Goal/Run 在 `model-inputs/` 下保存调用 JSONL 清单，消息正文在同一 Goal 的 Run 之间按 SHA-256 寻址复用；相同 system 或历史消息只写一次。清单记录 `think`、`decide` 或 `completion_review` 调用用途，保留 role、来源、消息顺序和独立调用身份，以及原生 assistant 的工具调用、独立 reasoning、续接字段和 tool 结果关联 ID；正文写入完成后才追加引用。读取校验当前 schema、路径引用与内容哈希；未记录时为空，损坏时拒绝。文件权限为 0600。

该日志不参与 Snapshot、Trajectory 或上下文基线恢复。正式 CLI 组合根配置写入端口，写入失败会阻止当前 Adapter 调用；诊断 Trace 只保留完整输入的调用引用。崩溃可能留下未引用正文；不提供多进程共同写入或 exactly-once 保证，当前读取遍历完整 Run。

原生续接的权威来源是已提交 Trajectory 中的 `model_response_received`，由 Runtime 当前协议校验后持久化；Gemini 签名作为不透明字符串原样保存，不单独建立模型会话存储。完整输入查看日志保留原生消息字段，重启读取验证消息形状与正文哈希，但不据此恢复 Goal。

# Storage 文件契约清单

本清单以 `contracts/catalog.json`、Storage 源码和真实装配入口为依据，登记 Storage 拥有的持久化文件族。字段定义以各文件族的 TS 类型为唯一来源；跨字段不变量、身份绑定、版本校验和错误映射留在对应 Store 或 Codec。所有族只支持当前版本；读取失败不迁移、不回退旧 Schema、不写回。

## 文件族

| 文件族 | 路径与版本 | 读取策略 | 不变量与错误 | 真实消费者 | 本方向处置 |
| --- | --- | --- | --- | --- | --- |
| Agent Profile | `<profile-directory>/<profileId>.json`；`schemaVersion: 1` | 生成绑定 `reject` 未知字段 | Profile ID 必须匹配文件名；缺失返回 `undefined`；不安全路径、非法 JSON、生成绑定拒绝和 ID 不一致抛 `AgentProfileConfigurationError`（`INVALID_AGENT_PROFILE`），保留安全字段路径/问题分类，不含字段值或正文 | [`JsonFileAgentProfileStore`](../src/json-file-agent-profile-store.ts) → Runtime `AgentProfileStore` | 已迁移：`AgentProfileFile` TS DTO（含具名 `NonEmptyString`）+ `storage.agent-profile.file` 生成绑定；ID/路径与错误映射保留 |
| Goal Snapshot | `<goal-directory>/<base64url(goalId)>.json`；`metadata.schemaVersion: 1` | 严格拒绝未知字段 | 版本、消息身份与位置、Run/GoalPlan/Plan Route、待审批交互、账本、队列和模型选择等跨字段规则由 Codec 与 Snapshot 校验器执行；损坏、未知版本和非法组合抛 `GoalSnapshotProtocolError`（`INVALID_GOAL_SNAPSHOT`） | [`goalSnapshotCodec`](../src/goal-snapshot-codec.ts)、[`JsonFileGoalStore`](../src/goal-store.ts) | 已迁移：TS DTO + `storage.goal.snapshot` 生成绑定；跨字段与字段级语义校验保留 |
| Trajectory JSONL | `<trajectory-directory>/<base64url(goalId)>/<base64url(runId)>.jsonl` 及超过 64 MiB 后的 `<run>.partN.jsonl`；大型 payload 存于同 Goal 的 `blobs/<sha256>.json`，行内为 `storageEncodingVersion: 2`、`payloadRef` 或内联 `payload` | 运行时事件协议校验与存储编码校验 | 追加序号单调、Goal/Run 身份匹配、事件信封与 payload 判别；未知存储编码、歧义 payload、缺失 Blob 和非法事件抛 `TrajectoryProtocolError`；不按 Snapshot marker 推导提交边界 | [`JsonFileTrajectoryStore`](../src/json-file-trajectory-store.ts) → Runtime `TrajectoryStore` | 事件 DTO 与校验归 Runtime；Storage 只登记文件布局、Blob 引用与编码版本 |
| 模型输入记录 | `<model-input-directory>/<goal>/<run>/requests.jsonl` 与同 Goal 的 `messages/<sha256>.txt`；清单 `schemaVersion: 1` | 手写清单与消息结构校验 | 正文 SHA-256 必须匹配引用；身份、阶段、Step、消息 shape 和 `goalId`/`runId` 必须匹配；不参与 Goal 恢复 | [`JsonFileModelInputStore`](../src/json-file-model-input-store.ts) → Runtime `ModelInputStore` | 已迁移：`ModelInputManifest` TS DTO + 生成绑定；正文摘要与消息 predicate 保留 |
| Process Session | `<processes>/<base64url(goalId)>/<base64url(processId)>/session.json`；无独立版本 | 严格拒绝未知字段 | 非终态且宿主实例不同的记录投影为 `interrupted`；列表跳过不完整目录；通道 `meta.json` 校验偏移与分片 | [`JsonFileProcessSessionStore`](../src/json-file-process-session-store.ts) → Runtime `ProcessSessionStore` | 已迁移：`ProcessSessionFileRecord`/`ProcessChannelMetaFile` TS DTO + 生成绑定；宿主投影保留 |
| Retrieval Index Sidecar | `<sidecar-directory>/<base64url(goalId)>/<base64url(runId)>/retrieval-v1.json`；`schemaVersion: 1` | 严格拒绝未知字段 | 版本、Goal/Run 身份、document/source 身份唯一、序列范围、来源摘要、查询缓存与 `derivedThroughSequence` 边界；失配或损坏返回 `undefined` 以便重建 | [`JsonFileContextRetrievalIndexStore`](../src/context-retrieval-index-sidecar.ts) → `TrajectoryRetrievalIndexStore` | 已迁移顶层：`ContextRetrievalIndexSidecarFile` TS DTO + 生成绑定；嵌套文档、倒排与查询缓存由 `context-retrieval` 领域校验 |
| Goal Context Index | `<context-sidecar-directory>/<base64url(goalId)>/goal-index.json`；`schemaVersion: 1` | 缓存无效返回 `undefined` | Goal 身份、来源摘要、来源边界、Stage/Note 结构与构建标识；失配不修改领域状态 | [`JsonFileGoalContextIndexStore`](../src/goal-context-index-store.ts) | 已迁移：`GoalContextIndexSnapshotFile` TS DTO + 生成绑定；缓存失配仍返回 `undefined` |
| Tool Grant 账本 | `<workspace-directory>/tool-grants.json`；`version: 1` | 严格拒绝未知字段 | `goal`/`workspace` 范围与 `goalId` 一致；Grant ID 与来源唯一；损坏账本失败关闭，不重置 | [`JsonFileToolGrantStore`](../src/json-file-tool-grant-store.ts) → Runtime `ToolGrantStore` | 已迁移：`ToolGrantLedgerFile` TS DTO + 生成绑定；账本身份唯一性保留 |
| Sandbox Grant 账本 | `<workspace-directory>/sandbox-grants.json`；`version: 1` | 严格拒绝未知字段 | 范围/goal 一致性、Grant ID 与来源唯一、matcher 结构；损坏账本失败关闭，不重置 | [`JsonFileSandboxGrantStore`](../src/json-file-sandbox-grant-store.ts) → `SandboxGrantStore` | 已迁移：`SandboxGrantLedgerFile` TS DTO + 生成绑定；账本身份唯一性保留 |
| 模型偏好 | `<workspace-directory>/model-preference.json`；`version: 1` | 严格拒绝未知字段 | 缺失返回 `undefined`；损坏或未知版本拒绝读取和覆盖 | [`JsonFileModelPreferenceStore`](../src/json-file-model-preference-store.ts) → Runtime `ModelPreferenceStore` | 已迁移：`ModelPreferenceFile` TS DTO + 生成绑定 |
| 项目权限模式 | `<workspace-directory>/permission-mode.json`；`version: 1` | 严格拒绝未知字段 | 缺失返回默认 `default`/`0`；workspace 不匹配按默认读取；写入按 revision 乐观并发；损坏失败关闭 | [`JsonFileProjectPermissionModeStore`](../src/json-file-project-permission-mode-store.ts) → `ProjectPermissionModeStore` | 已迁移：`PermissionModeFile` TS DTO + 生成绑定；revision 冲突保留 |
| 模型调用指标 JSONL | `<metrics-directory>/<base64url(goalId)>/<base64url(runId)>.jsonl` 与 `<goal>/coverage.jsonl`；无独立版本，`recordType` 判别 | 逐行严格结构校验 | 身份匹配、同一调用同类事实不冲突、覆盖记录首个 Goal 标记唯一、缺口去重；坏记录抛 `ModelCallMetricStoreProtocolError` | [`JsonFileMetricsStore`](../src/json-file-metrics-store.ts) → Runtime `MetricsStore`/`ModelCallMetricsCoverageStore` | 已迁移：指标与覆盖 TS DTO + 生成绑定；事实冲突与覆盖聚合保留 |
| Diagnostic Trace JSONL | `<trace-directory>/<base64url(goalId)>/<base64url(runId)>.jsonl`；`traceSchemaVersion: 1` | 无读取校验器 | 只追加已脱敏、已限长的诊断记录；不参与 Snapshot、Trajectory 或恢复边界 | [`JsonFileDiagnosticTraceSink`](../src/json-file-diagnostic-trace-sink.ts) → Runtime `DiagnosticTraceSink` | Trace DTO 归 Runtime；Storage 只登记写入边界，不新增读取回退 |

## 版本与失败边界

- 只接受当前版本。Goal Snapshot、Trajectory、模型输入、Sidecar、Agent Profile、Grant 账本和偏好文件的未知版本或损坏内容都在各自边界失败或缓存失效；没有旧版本迁移分支。
- 原子写入统一经 [`atomicWriteJson`](../src/json-file-write.ts)；JSONL 追加统一经 `appendJsonl`。审批等待、重启恢复和损坏文件处理继续由 Runtime 与各 Store 的现有状态转换承担。
- Agent Profile 的未知字段严格拒绝由生成绑定执行；该策略不扩展到其他文件族。
- Runtime 拥有的 Trajectory 事件和 Diagnostic Trace DTO 不复制到 Storage；Storage 负责其文件布局、追加顺序和错误包装。

## 迁移证据入口

- Catalog 登记与生成策略：`contracts/catalog.json`。
- Snapshot 编解码：[`goal-snapshot-codec.ts`](../src/goal-snapshot-codec.ts)。
- 真实文件与恢复测试：`packages/storage/test/goal-store.test.ts`、`goal-snapshot-current.test.ts`、`trajectory-store.test.ts`、`context-retrieval-index-sidecar.test.ts`、`json-file-tool-grant-store.test.ts`、`sandbox-grant-store.test.ts`、`process-session-store.test.ts`、`session-metrics-store.test.ts`、`model-input-store.test.ts`。

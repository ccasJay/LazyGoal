# 持久化实现

Snapshot、Trajectory、Profile 和调用事实的文件 Schema 与 Store。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。文件族、版本、读取策略和真实消费者的逐项登记见 [文件契约清单](./file-contracts.md)。


用户中断的 Snapshot Schema 只保存 `requested`／`finished` 状态、未知效果及 Action 身份，不再包含模型收尾预算。执行语义见 [Runtime](../../runtime/notes/overview.md)。

## 摘要

`@lazygoal/storage` 拥有持久化文件表示与实现：Profile 文件 DTO、当前 Goal Snapshot v1 DTO 与严格结构绑定、Runtime↔Snapshot 双向 Codec、Trajectory/Diagnostic JSONL Store、Tool/Sandbox Grant 授权账本，以及实现 Runtime/Agent Port 的内存/JSON 文件 Store。Snapshot、Agent Profile、Grant 账本、模型偏好、权限模式、调用指标、进程会话和模型输入清单的结构 Schema 由 Catalog 从 TS 文件 DTO 生成，并由生成绑定校验；生成能力归 [`@lazygoal/contract-binding`](../../contract-binding/src/index.ts) 与 `scripts/generate-contracts.mjs`。它依赖 Runtime 的 Port 与领域契约；Runtime 不反向加载本模块。所有文件写入经共享写入原语；同一进程内的写入顺序由按键串行队列保证。

所有 Store 的路径段编码统一由内部 [`encodePathSegment`](../src/path-segment.ts) 完成（UTF-8 base64url），该模块不从公共入口导出；各 Store 只保留身份校验与目录布局，编码结果保持不变。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [写入原语](../src/json-file-write.ts) | `atomicWriteJson`、`appendJsonl` 与 `appendFileChunk` 的唯一实现：同目录临时文件、创建时文件 `0600` 与目录 `0700`、按需 `fsync`、可重试 errno 的效果核对与失败清理 | 识别 Store 类型、协议错误或路径语义；跨进程锁、目录 `fsync` |
| [Supervisor 所有权](../src/supervisor-ownership.ts) | SQLite 内核文件锁排斥同一路径的并发所有者，关闭等待已借用操作 | 验证锁路径与工作区映射、Worker 身份或运行时装配 |
| [Trigger 投递存储](../src/trigger-delivery-store.ts) | SQLite 事务保存事件、投递身份、Goal 创建意图及收据与队列；入口按宿主认证身份验证来源及目标；发布时以暂存文件身份恢复 | 传输身份认证、准入策略、执行所有权及派发 |
| [串行队列](../src/keyed-serial-queue.ts) | `KeyedSerialQueue` 的按键 FIFO 串行、失败隔离、簿记释放与 `drain` | 跨进程锁、事务或 exactly-once |
| [AgentProfileFile](../src/agent-profile-file.ts) | Profile 文件 DTO（`schemaVersion: 1`）、具名 `NonEmptyString` 约束、生成绑定与 `AgentProfileConfigurationError` | 读取文件系统、构造 Runtime Profile |
| [JsonFileAgentProfileStore](../src/json-file-agent-profile-store.ts) | 实现 Runtime `AgentProfileStore` Port，读取单个 `<profileId>.json` | 扫描其它 Profile、读取 Tool 实例、校验 Tool 注册 |
| [GoalSnapshotV1 协议](../src/goal-snapshot.ts) | 当前唯一 Snapshot DTO、生成结构绑定与字段级/跨字段语义校验；模型选择可保存动态执行 API、容量和能力；并保存当前 Prompt/Memory/Model Context/Retrieval 组合、完整消息、`mode`、GoalPlan、`completedRuns`、Run/todo 关系、Run 的唯一 `exposedToolIds`、Context Epoch、内部阶段（`currentStage`）、获批 Plan Run 路线（`planRoute`）、待执行 Action 的授权引用、Goal 提交修订（`commitRevision`）、输入账本（`inputLedger`）与消息队列（`messageQueue`） | 文件系统 I/O、构造 Runtime Goal、迁移历史 Snapshot |
| [GoalSnapshotCodec](../src/goal-snapshot-codec.ts) | Runtime Goal↔v1 Snapshot 的 encode/decode 转换；隔离由 `binding.read` 的副本提供，不再叠加外层 `structuredClone`；只接受当前 v1，不迁移或回写历史版本 | 文件系统 I/O、读写 Store |
| [InMemoryGoalStore](../src/goal-store.ts) | 实现 Runtime `GoalStore` Port：save 经 Codec encode、restore 经 decode | 跨实例或跨进程恢复 |
| [JsonFileGoalStore](../src/goal-store.ts) | 实现 `GoalStore` 与 `GoalCatalog`：base64url 文件名、经共享原语以 compact JSON + trailing newline 原子替换快照、可核对的无覆盖创建、目录扫描摘要 | 跨进程锁、乐观锁、租约或版本冲突检测 |
| [JsonFileToolGrantStore](../src/json-file-tool-grant-store.ts) | 以生成绑定严格验证 workspace 授权账本，经共享原语保存 pending/active/revoked Grant，按来源 Action 幂等暂存/激活 | Goal 状态转换、跨进程锁或分布式事务 |
| [JsonFileModelPreferenceStore](../src/json-file-model-preference-store.ts) | 以生成绑定严格解析并保存 Web 模型偏好身份；损坏文件不被覆盖 | 模型可选性判断、Goal Snapshot 或跨进程锁 |
| [JsonFileTrajectoryStore](../src/json-file-trajectory-store.ts) | 将每个 Goal/Run 的事实事件（包括结构化 `model_context_frame`）追加到安全编码的 JSONL 分段，并把大型 payload 外置为内容寻址 Blob；维护可删除重建的 SQLite 查询索引；提供序列范围读取与 Snapshot 边界分类；追加结果未知时核对当前分段尾部 | Snapshot 恢复、marker 推导边界、跨进程锁、exactly-once 与旧存储编码迁移 |
| [TrajectoryIndex](../src/trajectory-index.ts) | 单 Run 的 SQLite 查询索引：事件元数据、Action/ModelCall/Program 关联与 JSONL 字节位置；DELETE journal，可由 JSONL 完整重建 | 事实存储、可见性判断、WAL 并发写入与跨版本迁移 |
| [JsonFileDiagnosticTraceSink](../src/json-file-diagnostic-trace-sink.ts) | 将已脱敏、已限长的诊断记录追加到独立 JSONL 文件 | Domain Event、Snapshot 恢复、Trace 查询与重试 |
| [JsonFileMetricsStore](../src/json-file-metrics-store.ts) | 以生成绑定校验模型调用开始/结束事实（含可选端到端请求耗时），并将事实、历史覆盖标记与已知写入缺口分别追加到 JSONL | Goal 恢复、token 估算、累计投影缓存和跨进程锁 |
| [JsonFileContextRetrievalIndexStore](../src/context-retrieval-index-sidecar.ts) | 以安全编码路径保存、恢复和删除 Retrieval Index Sidecar；严格校验倒排快照、来源摘要、版本与 64 项查询缓存 | 推导 committed boundary、读取 Workspace、修改 Goal 或 Trajectory |

## 生成绑定与迁移边界

Catalog 启用项从 TS 文件 DTO 生成 JSON Schema、Ajv 校验器、Manifest 和 `@lazygoal/contract-binding` 绑定；生成文件位于 [`src/generated`](../src/generated)，由 `npm run contracts:generate -- --check` 检查漂移。真实读取路径消费生成绑定：Snapshot Codec 使用 `goalSnapshotFileBinding` 后再执行字段级与跨字段语义校验；Agent Profile、Grant 账本、模型偏好、权限模式、调用指标、进程会话和模型输入 Store 均先以 `reject` 策略读取生成绑定，再执行各自的身份、摘要、版本或冲突不变量。

结构 Schema 覆盖字段类型、封闭对象、版本常量与可由 JSDoc 表达的非空和数组约束；其余字段级规则、摘要格式、跨字段不变量、身份绑定、版本校验和错误映射仍在 Store 或 Codec。读取失败不迁移、不回退旧 Schema、不写回。

Retrieval Index Sidecar 顶层已使用生成绑定；嵌套文档、倒排索引与查询缓存结果仍由 `context-retrieval` 的索引重建与查询缓存校验执行。Goal Context Index 的 Note 来源与类别以 Storage 文件表示显式声明。Agent Profile 的标量字段与数组元素共用 TS 具名 `NonEmptyString`，空数组合法，含空字符串的数组元素由生成绑定拒绝。

## 生命周期与错误

正式消息的 Snapshot 位置由当前或完成 Run 的事实边界约束；语义校验同时拒绝未知 Run、越界序列、Run 内逆序和同锚点不连续的次序。

每次 Profile `load` 只访问 `<directory>/<profileId>.json`：文件缺失返回 `undefined`；不安全 ID、读取失败、非法 JSON、生成绑定拒绝或文件内 ID 不一致抛出 `AgentProfileConfigurationError`（稳定错误码 `INVALID_AGENT_PROFILE`）。结构错误保留 Profile ID、文件路径和有界的字段路径/问题分类，不包含字段值或原始正文；非法 JSON 不保留可能回显正文的解析异常。

Goal 快照统一经 `GoalSnapshotCodec`：`save` 先对 Runtime Goal 按当前 v1 生成结构与语义规则校验（拒绝多余字段、非法 StepRecord，缺失或非法的 `modelSelection`，以及非法的 Trajectory/Memory/Model Context/Retrieval 组合）再深复制 encode；`restore`/decode 只接受当前 v1。语义校验同时保证 normal Goal 没有 GoalPlan、Plan Mode 必须有 GoalPlan、Todo ID/position/status 与 `Run.todoId` 一致、历史 Run 的消息区间有序且不包含当前 Run。历史 Snapshot、未知版本、缺失 `modelSelection` 的旧开发快照和不完整的当前恢复状态统一在 Codec 边界抛出 `INVALID_GOAL_SNAPSHOT`，不会自动迁移、保存或回写。

`modelSelection.executionApi` 当前只允许 `openai-completions`，且必须搭配 OpenCode Go Provider 与有效的上下文、输出容量；Codec 对执行协议、推理、视觉及工具选择能力深复制往返。Snapshot 不保存 Base URL、API Key 或认证头，schemaVersion 仍为 1。

每条正式消息在 Snapshot 中保存 `messageId`、所属 `runId`、判别式来源与助手用途（`process`／`answer`／`notice`）。语义校验要求同一 Goal 内 `messageId` 与来源各自唯一；重复身份、重复来源或缺少身份字段的旧结构消息在 Codec 边界 fail-closed，不做兼容解析或迁移。

Plan Run 的 `planRoute` 仅能出现在已有 `approvedTask` 的 Plan Run 上。语义校验路线非空、阶段身份唯一、顺序状态与恢复游标一致、已接受阶段有提交序列，且序列不超过 Snapshot 的 `committedThroughSequence`；修订后的路线还必须保存非空理由。普通 Run 和待审批 Run 不能保存完整路线。Codec 对路线及修订理由做深复制往返，旧开发快照不迁移。

待审批 Plan Run 的 `task_approval` 交互必须包含非空阶段和验收条件组成的 `planRouteCandidate`。Snapshot 对候选做严格字段和非空约束校验，Codec 深复制往返；该字段不含 Runtime 身份或执行状态，批准后候选随等待交互清除并由 Runtime 创建正式路线。不迁移缺失字段的旧开发快照。

路线扩展等待保存在 `pendingInteraction.routeRevision`，包括基于的路线 revision、完整候选、修订理由和唯一批准选项。只有选择该批准项才应用修订；用户选择保留当前路线时，Snapshot 中的路线不变。路线修订事实进入 Trajectory，Snapshot 游标决定恢复时可见的修订边界。

Snapshot 原样保存 Goal 级 `commitRevision`、`inputLedger` 与 `messageQueue`。账本记录只保存 `inputId`、种类、`sha256` 载荷摘要、受理序号、`admittedAtRevision` 与 pending／applied／cleared 状态及必要关联；正文只保存在队列项或 Goal 消息中。语义校验要求账本身份唯一、受理序号在账本顺序内严格递增、已应用记录指向真实 user 消息位置、队列项与一条 pending message 记录一一对应，并要求摘要为 `sha256:<64 hex>`；不一致的快照 fail-closed，不自动修正或迁移。


当前 Snapshot 同时校验 `pendingProgram` 与运行中父 Action、子 `pendingAction` 的身份及调用位置；Codec 原位保存恢复指针和已用结果字节数。PTC 子事实的 `programId/callIndex` 随 Trajectory 严格解析，结果仍以 Snapshot 的提交边界为准。`program_time_reserved` 是例外：它在同一 JSONL 中单独同步到磁盘，恢复时无论 Snapshot 是否纳入该事件都要计入预算，防止崩溃重置额度。Storage 不推断工具是否已经产生外部副作用。

`JsonFileGoalStore.save` 对 Snapshot 只编码一次，并调用共享 `atomicWriteJson` 以 compact JSON + trailing newline 原子替换：临时文件、`0600` 文件、`0700` 目录、`fsync`、`EINTR`／`EAGAIN`／`EBUSY` 三次重试、目标内容核对与失败清理由写入原语统一执行。替换已成功但调用返回临时错误时继续完成归档标记清理，不重放 Runtime 提交。`listResumable` 只扫描正式 `.json` 普通文件并忽略 `.tmp`；任一正式快照损坏都会报告协议错误而非静默跳过；过滤三个终态后按 `mtime` 倒序、`goalId` 升序返回摘要。`listHistory` 面向历史复盘：遇到无法解码的快照时跳过该条并计入 `unreadableCount`，不让一条旧版本快照使整份历史列表不可用；目录级读取失败仍然拒绝。保存快照后在 `catalog/<goalId>.json` 写入只读派生摘要；列表优先使用摘要并用快照 `mtime`／`size` 校验，缺失、损坏或指纹不匹配时回退完整 decode 并重写摘要。摘要写失败不影响已完成的快照保存。`readRevision` 使用进程内 revision hint 与文件 `mtime`／`size` 校验；未命中或文件被外部替换时回退完整 `restore` 并刷新 hint。它只用于变更检测，不保证跨进程实时，也不能替代恢复读取。

`JsonFileToolGrantStore` 将当前 workspace 的 Grant 写入私有 `tool-grants.json`；损坏 JSON、结构或语义错误、重复 ID/来源或同一来源授权冲突均失败关闭，不会重置账本。只有 active 且 workspace 与操作匹配的 Grant 可被 Runner 查询；goal 范围还必须匹配 `goalId`。pending Grant 仅供 Coordinator 在批准 Snapshot 提交后恢复激活，revoked Grant 不再匹配。Store 实例内写入经 `KeyedSerialQueue` 串行化，不提供跨进程并发事务。

`JsonFileTrajectoryStore` 将轨迹写入 `<directory>/<base64url(goalId)>/<base64url(runId)>.jsonl`；超过 64 MiB 后继续写入 `<run>.part2.jsonl` 等分段，超过 64 KiB 的 payload 写入同 Goal 的 `blobs/<sha256>.json`，JSONL 行只保留 `payloadRef`。同目录的 `<run>.index.db` 是只保存查询元数据与字节位置的可重建索引；首次追加或查询前会校验索引与 JSONL 的最后位置，索引超前时重建、落后时从最后已验证位置补齐，缺失时从 JSONL 完整重建。索引行按 Run 缓冲，在缓冲达到 128 行、显式 `flushIndex` 或任何索引读取前合并为一个事务写入；缓冲未写入只表示索引滞后，JSONL 仍是唯一事实源，写入失败时丢弃缓冲并标记为脏，由后续读取修复。索引使用 DELETE journal，不使用 WAL。

同一 Store 实现 `TrajectoryQueryPort`：分页、详情、执行单元与时间线查询都只使用调用方固定的 `committedThroughSequence`；索引负责定位与关联，不扩大可见性。分页游标绑定 Run、水位与过滤条件，跨水位或跨过滤复用会失败。列表查询不读取 JSONL 或 Blob，详情与 payload 只读取目标事件及同 Action 的有限关联事件。
同一实例内按 Run 串行追加并严格校验存储编码版本、JSONL、事件身份和该 Run 内的单调序列；不支持旧编码时直接失败。追加结果未知时由 Store 提供的当前分段尾部核对判定：完整命中视为成功，序号恰为前一条视为未写入并交由原语重试，部分行或无法确认的状态立即失败。新 Run 从本地序号 1 开始，缺失文件或空文件读取为空。`run_created`、`plan_mode_entered` 和 `goal_plan_updated` 是事实事件，不能替代 Goal Snapshot 的当前状态。
`readWithBoundary` 只使用调用方从最新 Goal Snapshot 读取的
`committedThroughSequence` 分类 committed 与未提交 tail，`state_committed` 不具有恢复权威。Snapshot 已保存而 marker 追加失败时，恢复仍以 Snapshot 边界为准；孤立或越界事件只保留为未提交 tail，不会被自动 replay。`model_context_frame` 在 Trajectory 协议中校验阶段、Epoch、Conversation 位置、Section 身份、结构化 JSON 投影与实际更新文本；Runtime 恢复查询还会对照当前注册表过滤未知或身份不匹配的 Section。

`readAfter` 是显式增量读取端口：调用方必须已经通过同一实例校验过 `afterSequence` 及之前的事件；实现使用已验证索引从该位置之后按字节读取并只校验后缀，索引缺失、行身份不匹配或读取失败时回退全量 `read`。`read` 与 `readWithBoundary` 仍执行全量 fail-closed 校验，`readAfter` 不能替代它们，也不能作为跨进程恢复权威。

`JsonFileDiagnosticTraceSink` 使用独立的 `.jsonl` 目录和同样的安全编码路径；它只负责
追加上游已经脱敏、限长的 `TraceRecord`，不被 `GoalStore` 或 Trajectory 读取，也不参与
恢复边界。

`JsonFileMetricsStore` 按 Goal/Run 保存调用事实，并在 Goal 子目录保存覆盖状态和已知缺口。写入经共享追加原语完成；读取严格校验 JSONL、协议和身份，坏记录直接报错。完成事实中的 `requestDurationMs` 是可选的有限正毫秒数；缺少该字段的既有事实仍可读取，但不具备端到端速率的耗时输入。指标事实不进入 Goal Snapshot，不作为恢复输入；`session-metrics` 每次查询都以当前 Snapshot 和这些事实重新计算投影。

`JsonFileContextRetrievalIndexStore` 将索引缓存写入 `<directory>/<base64url(goalId)>/<base64url(runId)>/retrieval-v1.json`，保存前由严格 Codec 验证文档、倒排表、字段统计和查询结果，再经共享原子原语保存。读取时缺失、JSON/Schema 损坏、Goal/Run 不一致、版本失配或 Sidecar 领先当前 boundary 返回 `undefined`。落后 Sidecar 可以先恢复为候选，由 Runtime 根据旧 committed 前缀摘要校验后增量更新；Sidecar 的查询缓存按 canonical query 的键保持 oldest → newest 的确定性顺序，删除或写入失败不会影响领域状态。

## 写入原语与串行队列

[`json-file-write.ts`](../src/json-file-write.ts) 是 storage 内 JSON 原子替换、JSONL 追加与原始字节追加的唯一实现。原子替换使用目标同目录的 `<target>.<uuid>.tmp`，创建时文件 `0600`、目录 `0700`，`durable` 决定 rename 前是否 `fsync`；失败时尽力删除临时文件，清理失败不掩盖原始错误。可重试 errno 与次数由调用点显式声明，原语只执行调用方提供的效果核对：`applied` 直接返回，`absent` 才重试，核对抛错立即停止。JSONL 追加每次只写一条换行结尾记录；没有核对回调时首次失败即传播，不执行盲重试。追加原语不创建父目录。

[`KeyedSerialQueue`](../src/keyed-serial-queue.ts) 是 storage 内唯一的按键串行实现：同一 key 按提交顺序执行，失败只拒绝该操作，最后一个操作结算后删除簿记，`drain(key)` 提供读己之写等待。队列只保证进程内顺序与读取互斥，不提供跨进程锁。

权限只在创建时设置：新建文件为 `0600`，新建目录为 `0700`；已存在路径不会通过 `chmod` 纠正。

`atomicWriteJson` 默认把每个阶段的文件系统错误原样抛出。`tolerateRenameEnoent` 只把 `rename` 阶段的 `ENOENT` 视为目标目录已被并发清理；`mkdir`、`open`、写入、`sync` 与 `close` 的 `ENOENT` 仍抛出。`JsonFileProcessSessionStore.saveSession` 仅在 `rename` 阶段静默 `ENOENT`；`writeMeta` 不传该选项，改在调用点捕获整段写入的 `ENOENT`。

### SQLite 索引边界

索引使用 Node 内置 `node:sqlite`，不引入原生模块依赖，因此 Worker 单文件打包产物仍可直接运行；入口与 Worker 启动时以 `--disable-warning=ExperimentalWarning` 抑制该实验 API 的启动警告。Schema 以 `PRAGMA user_version = 1` 标识，不兼容版本、损坏文件或无法打开的数据库直接删除并从 JSONL 重建，不提供迁移分支。索引文件随 `trajectories/<goal>/` 目录一起复制；Benchmark 制品按目录独立 copy-out 后首次查询会就地重建索引，不需要额外导出步骤。

## 当前限制与背景

Runtime 执行协议按 Goal 冻结的唯一 `structured@1 + trajectory-layered@1 + bm25-lite@1` 组合解码；Storage 只负责表示，不判断 Prompt Bundle 是否受 Agent 支持。当前 v1 保存完整协议选择、`memoryRevision`（如有）、`committedThroughSequence` 和 Context Epoch，仍不保存 Working Memory 投影；`state_committed` 只是 Snapshot 成功后的审计 marker，恢复以提交边界和 revision 指针为权威。Sidecar 通过同一边界和来源摘要自校验，失配即可重建。

## 模型消息日志

[`JsonFileModelInputStore`](../src/json-file-model-input-store.ts) 实现 Runtime 的独立输入查看端口。每个 Goal/Run 在 `model-inputs/` 下保存调用 JSONL 清单，消息正文在同一 Goal 的 Run 之间按 SHA-256 寻址复用；相同 system 或历史消息只写一次。实例在进程内按 Goal 记住已落盘正文摘要，并用正文目录身份校验失效：命中摘要时跳过写入与 EEXIST 读回比对，目录被外部重建或进程重启后重新种子化。清单记录 `think`、`decide` 或 `completion_review` 调用用途，保留 role、来源、消息顺序和独立调用身份，以及原生 assistant 的工具调用、独立 reasoning、续接字段和 tool 结果关联 ID；正文写入完成后才追加引用。读取校验当前 schema、路径引用与内容哈希；未记录时为空，损坏时拒绝。

该日志不参与 Snapshot、Trajectory 或上下文基线恢复。正式 CLI 组合根配置写入端口，写入失败会阻止当前 Adapter 调用；诊断 Trace 只保留完整输入的调用引用。崩溃可能留下未引用正文；不提供多进程共同写入或 exactly-once 保证，当前读取遍历完整 Run。Browser 只暴露 Snapshot 水位内已提交的模型调用；孤立清单只能由 `npm run maintenance:prune-model-inputs` 在显式 `--apply` 下删除。

原生续接的权威来源是已提交 Trajectory 中的 `model_response_received`，由 Runtime 当前协议校验后持久化；Gemini 签名作为不透明字符串原样保存，不单独建立模型会话存储。完整输入查看日志保留原生消息字段，重启读取验证消息形状与正文哈希，但不据此恢复 Goal。

## 批次进度与两级修复计数

Run 快照新增 `pendingActionBatch`（`batchId` + 按模型返回顺序排列的剩余业务 Action），与 `pendingAction` 共同构成批次恢复点；编码与解码两侧都覆盖该字段。`pendingModelRepair` 新增 `continuationsStarted`（不推进类计数，上限 3）与 `latestFailureClass`（`non_advancing` / `protocol`），与既有 `attemptsStarted` 一起决定下一次调用计入哪个预算。

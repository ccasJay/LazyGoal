# Runtime 模块

## 摘要

Runtime 是 Agent 的控制平面：拥有 Goal/Run 领域状态、状态机、启动和恢复流程、结构化 Working Memory 会话，以及持久化 Port（`GoalStore`、`GoalCatalog`、`AgentProfileStore`、`TrajectoryStore`）。它不构造 Prompt，也不知道模型供应商与文件格式。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [Domain](../../packages/runtime/src/domain.ts) | Goal definition/state、Preparation、Run、Action/Observation 数据契约 | I/O 和模型调用 |
| [PreparationExecutor](../../packages/runtime/src/preparation-executor.ts) | 定义准备阶段单轮结构化决策边界 | 阶段推进、消息追加与持久化 |
| [GoalCoordinator](../../packages/runtime/src/goal-coordinator.ts) | 推进 Preparation、恢复全部输入、持久化等待点、委派 executing Goal | Step 执行 |
| [Launcher](../../packages/runtime/src/launcher.ts) | 校验输入、冻结 Profile、创建并保存 Goal、调用 Coordinator | 恢复已有 Goal |
| [AgentProfile 契约](../../packages/runtime/src/agent-profile.ts) | `AgentProfile`、`AgentProfileRegistry` 与 `AgentProfileStore` Port | 文件读取、Schema 校验、Tool 实例与 Prompt |
| [Runner](../../packages/runtime/src/runner.ts) | executing Run 循环、AgentDecision 运行时校验、Tool 授权边界、转换与逐步保存 | 外部输入恢复与模型供应商协议 |
| [WorkingMemorySession](../../packages/runtime/src/working-memory-session.ts) | 从 committed Trajectory 的 revision 链重建临时 Working Memory，并执行 Patch/Evidence 校验 | Snapshot 内保存 Memory 内容、Runtime 控制状态转换 |
| [Working Memory Core](../../packages/runtime/src/working-memory-core.ts) | 将 Fact proposal 规范化为 canonical identity，执行准入、强化、supersede、生命周期与确定性容量淘汰 | I/O、模型调用、领域专属事实提炼 |
| [ToolMemoryProjector](../../packages/runtime/src/tool-memory-projector.ts) | 为 Tool 注册同步、无 I/O 的 Action+Observation→Fact proposal 投影；默认 Registry 不产生 Patch | 接受 Patch、分配 ID、修改 Snapshot 或吞掉 Observation |
| [TrajectoryCheckpointCommitter](../../packages/runtime/src/trajectory-checkpoint-committer.ts) | 统一事实、accepted Patch、Snapshot 提交边界与 marker 顺序 | 业务分支校验、模型调用与 Tool 执行 |
| [Context Lookup 契约](../../packages/runtime/src/context-retrieval.ts) | 校验历史查询、生成稳定 lookupId、归一化有界 found/not_found/lookup_error 结果与 requested/outcome 事实 | 读取 Workspace/Environment、执行 Tool、持久化 Goal 或实现索引算法 |
| [ContextSourceRouter](../../packages/runtime/src/context-source-router.ts) | 按信息需求将历史事实、当前状态、Goal Task 和 Conversation 路由到各自授权来源；只允许历史需求进入 Context Lookup | 读取 Workspace、执行 Tool、替代当前状态观察或改写任务契约 |
| [Context Lookup Result](../../packages/runtime/src/context-lookup-result.ts) | 将排名命中转换为带 query hash、索引版本和原始 source refs 的完整文档结果，并在预算/身份边界失败时 fail-closed | 改写 Trajectory 或把历史结果升级为 Evidence |
| [ContextDocumentBuilder](../../packages/runtime/src/context-document.ts) | 按 Snapshot committed boundary 将完整 execution/preparation 事实构建为稳定字段和来源范围文档 | 读取未提交 tail、索引 lookup 事件、执行 BM25 或写入 Sidecar |
| [FieldTokenizer/Index](../../packages/runtime/src/context-tokenizer.ts) | 对文档执行版本化 NFKC/标识拆分并建立确定性倒排、df 与字段长度统计 | 修改 Trajectory、执行查询排序或持久化 Sidecar |
| [Fielded BM25-lite](../../packages/runtime/src/context-ranking.ts) | 按字段权重、精确标识加分、过滤、稳定 tie-break 和完整文档预算完成排名与相邻扩展 | 改写文档、使用 recency 替代相关性或跨边界查询 |
| [Retrieval Index Session](../../packages/runtime/src/context-retrieval-index.ts) | 校验 Sidecar 来源前缀、在当前 committed boundary 重建或增量合并索引，并提供 64 项 boundary/version 隔离 LRU | 改写 Trajectory、越过 Snapshot boundary 读取、把索引缓存当作恢复权威 |
| [Evidence Gate](../../packages/runtime/src/evidence-gate.ts) | 只接受 committed 原始 Observation/Tool 事件，校验 Lookup source refs 并拒绝 Lookup 事件作为证据 | 将查询结果、预览或查询文本直接视为 Fact/Completion Evidence |
| [Transition](../../packages/runtime/src/transition.ts) | 纯函数式 Run 状态转换 | 持久化 |
| [GoalStore 契约](../../packages/runtime/src/goal-store.ts) | 保存/恢复最新完整 Goal 的 Port 与 `GoalCatalogEntry` 摘要；快照中的 `committedThroughSequence` 是轨迹恢复边界 | 历史与事件查询、文件格式 |
| [Trajectory 契约](../../packages/runtime/src/trajectory.ts) | 追加事实型 Domain Event、记录提交 marker，并为只读消费者提供事件查询、Snapshot 边界分类和读取辅助函数 | Runtime State、Snapshot 恢复或 Diagnostic Trace |
| [GoalCatalog 契约](../../packages/runtime/src/goal-store.ts) | 扫描并排序可恢复 Goal 摘要的 Port | 写入快照或返回历史版本 |
| [CheckpointGateGoalStore](../../packages/runtime/src/checkpoint-gate.ts) | 关闭流程中冻结新快照写入并等待已进入保存 | 回滚快照或修改 Goal 状态 |
| [Scheduler](../../packages/runtime/src/scheduler.ts) | 按 RunRef 发起执行 | 拥有 Goal 数据 |
| [Tool contracts](../../packages/runtime/src/tool.ts) | Tool 描述、输入校验、重放声明、Registry 与 Policy 边界 | 具体 Tool 执行与 Goal 持久化 |
| [ExecutionControl](../../packages/runtime/src/execution-control.ts) | 在一次调用链内传播 AbortSignal，并将中止规范化为控制流错误 | 改写 Goal 状态或决定进程退出 |
| [ShutdownCoordinator](../../packages/runtime/src/shutdown.ts) | 幂等编排 Gate 冻结、根 abort、受管资源清理与退出码 130 | 领域取消或快照回滚 |

## 生命周期与保存顺序

Goal 将创建后冻结的 intent、`promptBundleVersion`、Memory 协议、Model Context 协议、Cold Trajectory Retrieval 协议、Profile 和 executionPolicy 放在 `definition`，将 workflow、真实 messages 和 Run 放在 `state`。Runtime 只拥有 Prompt Bundle/Model Context/Retrieval 的通用版本标识，不持有或渲染文本；Composition Root 为新 Goal 冻结协议，并注入 `GoalProtocolValidator` 在保存或模型调用前校验组合。旧 Goal 省略 Retrieval 字段时按 `none@1` 解释，不要求索引或 Sidecar。Run 可保存 legacy 有界 `checkpoint`、最近 `lastStep`、当前 `pendingAction`、`committedThroughSequence` 和 structured `memoryRevision`；Action/Observation 不进入真实消息历史。新 Goal 从 `gathering_context/active` 与 `created/0` 开始；Preparation 不消费 Step，只有拥有最终 task 的 `executing` workflow 可进入 Runner。

Composition Root 通过 [`@lazygoal/storage`](./storage.md) 的 `JsonFileAgentProfileStore`
按当前生效的 `profileId` 从 workspace 的 `.lazygoal/profiles/<profileId>.json`
读取一个 Profile 文件；Runtime 自身只依赖 `AgentProfileStore` Port，不感知文件路径、
文件格式或解码器状态。Profile 缺失、损坏或引用未注册 Tool 时，启动在 Goal Store 写入前
失败。成功加载的 Profile 进入内存 Registry，之后由 Launcher lookup 并冻结到 Goal。

Launcher 在 Profile lookup 和 runId 生成前校验 intent、maxSteps 与 Prompt/Memory 协议。structured Goal 缺少 Validator 或显式 `memoryProtocol`、以及未知或交叉组合，均在首次 Profile、Snapshot 或模型副作用前抛出 `GOAL_PROTOCOL_ERROR`。合法 Goal 保存初始快照成功后才调用 Coordinator；它返回 Coordinator 的等待点或终态，不直接调用 Scheduler。

Composition Root 通过 [`@lazygoal/storage`](./storage.md) 的 `JsonFileGoalStore`
组合 Goal 持久化；它同时实现 `GoalCatalog`，扫描语义（`.json` 过滤、终态过滤、
`mtime` 倒序与 `goalId` 平局）详见 Storage 模块文档。Runtime 只依赖 `GoalStore` 与
`GoalCatalog` Port，不感知文件路径、Schema 或解码器。

Coordinator 对 active Preparation 每轮调用一次 Executor。Composition Root 向 Coordinator 与 Runner 注入同一个 ToolRegistry、TrajectoryStore、Working Memory 限制、Protocol Validator、`TrajectoryCheckpointCommitter` 和只读 `ContextLookupPort`，使 planning 看到的能力集合、Memory 恢复和执行边界一致；同时注入 `ContextSourceRouter`，在调用检索端口前封闭校验信息需求。`gathering_context` 传入空 ToolDefinition；`planning` 则按冻结 Profile 白名单与当前 ToolRegistry 的已注册交集解析独立 ToolDefinition 副本。Runtime 不根据 Prompt Bundle 版本筛选这些描述，是否展示由 Agent 决定。structured Goal 在模型调用或生命周期 Patch 前打开 `WorkingMemorySession`；`question` 保存为真实 assistant 消息并进入 `waiting_input`；`context_ready` 先保存 `planning/active`，再继续生成 task proposal；proposal 与完整批准文本一起保存为 `waiting_approval`。Preparation 返回合法 `context_lookup` 时，Coordinator 先由 `ContextSourceRouter` 确认它属于历史执行/决策理由需求，再调用 ContextLookupPort，不执行 Tool；它把 `preparation_result`、`context_lookup_requested` 与一个 outcome fact 按同一 Snapshot 边界提交，并把结果仅作为下一轮 Executor 的瞬时输入；一次 `advance` 最多连续处理三次 lookup，已提交结果可在重新启动时按最新事实恢复。模型 Patch 与阶段生命周期失效操作在同一 accepted Patch 中提交，Snapshot 成功后才把本轮 Patch 应用于临时 Session。ContextDocumentBuilder 读取同一 committed boundary，将带 executionUnitId 的完整执行单元跨 marker 聚合，并把合法准备阶段提交片段作为单个文档；lookup、marker、tail 与未闭合单元不会成为检索语料。每个继续点都以保存成功为前提。解析失败发生在 Executor 调用与新状态保存前。executing Goal 委派给 Scheduler，并在调度结束后重新恢复最新 Goal。

Coordinator 的 `resume` 接受分阶段 user action：gathering message 保存原文回答并恢复 active；planning message 移除当前 proposal、保存反馈并重新规划；approve 不追加消息，将 proposal 固定为最终 task；executing blocked message 追加原文输入并把 Run 恢复为 running；`approve_action` 匹配 `awaiting_approval` 或 `outcome_unknown` 的 pendingAction，保存为 `approved` 后透传一次性 `authorizedActionId`；`reject_action` 保存 rejected Observation 后继续推进。以上状态均先保存再继续自动推进。

当前 Runner 主流程为 `created → running → (Action/Observation | Context Lookup)* → waiting | completed | failed`，`cancelled` 也是终态。Prompt Bundle v7 的 Working Memory 只含 `facts/hypotheses/plan/blockers`：Fact identity 由规范化的 `subject+predicate` 决定，Runtime 分配 ID，并按 evidence 新旧执行重复抑制、同值强化和异值 supersede。默认投影上限为 32 KiB、64 Fact、8 Hypothesis、16 Plan、8 Blocker；active Plan/Blocker 与 Plan 依赖不可淘汰，其余按类别、强化次数、最近证据、更新时间和 ID 确定性选择，淘汰作为 canonical `evict_entries` 写入轨迹，恢复不重新计算。

模型 Patch 在关联 Action 执行前提交。Tool 返回后，Runner 用已分配的 Observation 事实 sequence 调用可选 `ToolMemoryProjector`；合法 proposal 仍由同一 Admission Core 接受，并和 `observation_recorded`、Snapshot 进入一个提交边界。Projector 缺失或返回 `no_op` 不写 Patch，抛错或非法结果只写 Diagnostic Trace，原始 Observation 仍提交。`stable` Fact 在更新证据出现前持续成立；`last_observed` 只表示证据序列处的最后观察，作为当前外部状态使用前必须重新观察。completed/failed 的 canonical lifecycle Patch 清理 executing phase 的 Hypothesis、Plan 与 Blocker。旧 Prompt Bundle v4–v6 的 structured shape 在 Memory 重建或模型调用前返回 `UNSUPPORTED_STRUCTURED_MEMORY_SHAPE`；v1–v3 checkpoint Goal 不经过该路径。

StepExecutor 生成 AgentDecision 后，Runner 对返回值做严格协议和 Evidence 校验。`context_lookup` 是独占分支，只允许历史执行/决策理由；当前 Workspace/Environment/验证状态必须重新调用 Tool。自动允许 Action 先保存 pending intent，再调用 Tool；需要批准时保存等待点。safe Tool 可沿用原 `actionId` 重放，manual Tool 转为 `outcome_unknown` waiting。structured `complete` 必须覆盖每个 completion criterion 的 committed evidence。每个保存点成功后才进入下一步；`state_committed` marker 只用于审计，恢复以 Snapshot 的 `committedThroughSequence` 和 revision 为准。

Context Retrieval Index Session 在同一 boundary 上校验 Sidecar 的 Goal/Run、Tokenizer、排名版本和 committed 事件前缀摘要；Sidecar 落后时只复用已验证的旧闭合文档并加入新闭合文档，失配则从 committed Trajectory 重建。Session 内查询 LRU 固定 64 项，键包含规范化 query、filters、boundary 和 index version；索引与缓存都是可丢弃性能缓存，不属于 Goal、Trajectory 或 Working Memory 的恢复事实。

Launcher、Coordinator、Scheduler、Runner、Preparation/Step Executor、LLM Adapter 和 Tool
共享可选的 `ExecutionControl`。各层在外部调用前、异步返回后以及状态转换或保存前
调用 `throwIfAborted`；中止原样传播 `ExecutionAbortedError`，不生成失败 Step、
`execution_error`、`cancelled` 或新的领域快照。已经进入的 Store 保存仍由存储边界决定
是否完成。

关闭边界由 `CheckpointGateGoalStore`、`ManagedResourceRegistry` 和
`ShutdownCoordinator` 组成。Gate 的 `freeze()` 是单向操作，只拒绝尚未进入的
`save`，已经进入底层 Store 的保存继续完成；`restore` 始终可用。Coordinator 首次
收到关闭请求时先冻结 Gate、abort 根控制器，再并发请求受管资源正常关闭，并在默认
2 秒 grace period 内等待保存和资源归零。超时后强制处理剩余资源，最后通过可注入的
`ExitPort` 请求退出码 130；重复请求复用同一个 Promise，不重复执行清理。

Runner 从 Goal 冻结的 executionPolicy 读取累计上限：正数达到后写入 `max_steps_exceeded`，不覆盖最近 Step、不追加消息；`0` 不限制连续 Step 数量。

Runtime 通过内存 `ToolRegistry` 提供 Tool 扩展边界；Agent 接收已注册的授权
ToolDefinition 并自行选择下一步，生成并校验严格 AgentDecision，Runner 自动执行允许的
Action。Runtime 不根据 Bash 命令文本改写或替换 Agent 的 Tool 选择；Profile 白名单、
Registry、输入校验和 Policy 仍是实际授权边界。
[`packages/tools`](../../packages/tools/src/index.ts) 提供五个 Tool：只读 `ReadFileTool`、
写入 UTF-8 文本的 `WriteFileTool`（safe 重放，父目录须已存在，拒绝 `.lazygoal`
前缀）、执行唯一匹配字符串替换的 `EditFileTool`（safe 重放，`oldString` 须恰好
出现一次，重放时 `newString` 已存在则幂等成功，拒绝 `.lazygoal` 前缀）、按正则
递归搜索文本文件的只读 `GrepTool`（safe 重放，跳过符号链接、`.git`、`.lazygoal`
与 `node_modules`，扫描 2000 文件/返回 200 行匹配后截断）与 `BashTool`（manual
重放，非 Windows 以 `/bin/bash -c` 执行、cwd 为 workspaceRoot、默认 30 秒/上限
120 秒超时，使用 `spawn` 持续消费 stdout/stderr，各自有界保留尾部 10000 字符，
输出超量不提前终止命令）。五者共享 workspaceRoot
沙箱：拒绝绝对路径、`..` 路径段和解析后越出 workspaceRoot 的符号链接；文件不
存在等领域问题返回 `failure`，非零退出码与超时分别返回 `COMMAND_FAILED`/
`COMMAND_TIMEOUT`，替换不匹配分别返回 `STRING_NOT_FOUND`/`STRING_NOT_UNIQUE`
领域失败。TUI 组合根的默认策略（`createDefaultToolPolicy`）只自动放行只读
Tool（`read_file` 与 `grep`），`write_file`、`edit_file` 与 `bash` 需逐次
批准。Runner、Agent 与 Coordinator 支持自动允许/审批 Action 的授权、持久化执行
编排、拒绝 Observation、瞬时授权和 safe/manual 中断恢复；跨进程重放依赖
JsonFileGoalStore，仍没有并发租约或 exactly-once 保证。

## 错误与不变量

- Goal 不存在或 `runId` 不匹配：返回 `RUN_NOT_FOUND`，不执行、不保存。
- Goal 没有匹配等待点、文本为空或 action 不匹配：返回 `GOAL_NOT_WAITING` 或 `INVALID_GOAL_INPUT`，无副作用。
- 未携带或携带错误 `authorizedActionId` 调度已批准 Action：返回 `ACTION_NOT_AUTHORIZED`，不调用 Tool。
- PreparationResult 与当前 phase 不匹配：返回 `INVALID_PHASE_RESULT`，不追加消息、不保存。
- 非 `bm25-lite` Goal、非法 Context Lookup 请求或 Preparation 链超过三次：返回 `INVALID_CONTEXT_LOOKUP` 或 `CONTEXT_LOOKUP_CHAIN_LIMIT`，不调用检索端口、不追加 lookup 事实、不推进阶段。
- 当前状态需求被伪装成 Context Lookup，或历史需求缺少有效问题/筛选条件：返回 `CONTEXT_SOURCE_ROUTE_REJECTED` 或 `INVALID_CONTEXT_SOURCE_ROUTE`，不访问检索端口、不执行 Tool、不追加 lookup 事实。
- Context Lookup 端口不可用、抛错或返回非法结果：以 `lookup_error` 事实区分查询故障与 `not_found`；查询结果提交失败时不会发起下一轮模型调用。
- Adapter 等非协议 Executor 异常：兼容转换为一次持久化的 `fail` Step；AgentDecision 协议错误、Tool 越权/缺失/输入错误与边界基础设施异常：保存稳定 `execution_error`，不消费 Step。Tool 抛错发生在 pendingAction 保存后时标记 `outcome_unknown`。
- Transition 非法组合：返回原状态与 `INVALID_TRANSITION`，不抛异常、不修改输入状态。
- Action 状态不变量：pendingAction 必须与当前 Action 生命周期匹配；Observation/rejection 必须匹配 actionId；Action 暂存、取消和执行错误不消费 Step，只有完整 Observation、拒绝或终止决策消费一次 Step。
- Tool 边界不变量：Profile 白名单先于 Registry 和输入校验；Registry 中的 Tool ID 必须唯一；首次执行 Tool 前必须完成输入校验和 Policy 评估，已批准且携带匹配瞬时授权的 Action 只重新校验 Tool 与输入；`ReadFileTool` 只允许 workspaceRoot 内的相对文件路径，且不读取越界符号链接目标；`WriteFileTool` 同受 workspaceRoot 沙箱约束、父目录必须已存在且拒绝 `.lazygoal` 前缀写入；`EditFileTool` 要求 `oldString` 唯一匹配且与 `newString` 不同、拒绝 `.lazygoal` 前缀，未应用的重放返回 `STRING_NOT_FOUND`、已应用的重放幂等成功；`GrepTool` 跳过符号链接与 `.git`/`.lazygoal`/`node_modules` 目录、不读取含 NUL 字节的文件并在文件数或匹配数上限处截断；`BashTool` 在 workspaceRoot 内执行命令，超时终止与输出截断由 Tool 边界负责，命令内容本身不受限制。
- Store I/O 或协议错误：原样向调用方传播；协议解码、迁移与并发覆盖语义由 [`@lazygoal/storage`](./storage.md) 拥有。Working Memory revision 链缺失、跨 Run、循环或越过 Snapshot 边界时，Session 抛出可识别的恢复错误并阻止模型继续。
- `AbortSignal` 已中止：传播独立的 `ExecutionAbortedError`，不落盘控制流产生的失败状态；LLM/Tool 边界负责将供应商中止对齐为该错误。
- Retrieval Index Sidecar 缺失、损坏、领先 Snapshot、来源摘要不匹配或索引统计失配：Session 丢弃缓存并从 committed Trajectory 重建；查询缓存失效只影响性能，不改变 Goal、Trajectory 或 Working Memory。
- Checkpoint Gate 冻结后新 `save` 抛出 `CHECKPOINT_GATE_FROZEN`；关闭流程不回滚快照、不写入 `cancelled`，已进入的底层保存仍可成为最新检查点。
- ShutdownCoordinator 对受管资源先执行正常关闭，grace period 到期后执行强制关闭并只请求一次退出码 130；资源清理错误不会阻止其他资源处理。

## 当前限制与背景

一个 Goal 只有一个当前 Run；`InlineScheduler` 没有队列、租约或自动重启扫描。Runtime 已提供 ContextLookupPort、lookup 生命周期、ContextSourceRouter、committed ContextDocumentBuilder、版本化 FieldTokenizer、倒排统计、BM25-lite 排名、有界 Result/source-ref 校验、可重建 Retrieval Index Sidecar 和 64 项查询 LRU；索引 Sidecar 仍是性能缓存，TUI 当前只冻结 v6 检索协议，具体 ContextLookupPort 由组合调用方按需提供。模型上下文预算、Hot/Warm/Compact 与 Lookup Result 的 Prompt 投影由 Agent 负责，也不提供并发恢复保护；Tool 外部系统仍不承诺 exactly-once。当前演进设计见 [Goal Preparation Workflow Spec](../../specs/goal-preparation-workflow/design.md)。

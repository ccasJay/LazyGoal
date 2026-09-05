# Agent 模块

## 摘要

Agent 是 Runtime 与 LLM 之间的集成层。Runtime Composition Root 从当前生效的
Profile JSON 加载并冻结 Profile，同时创建共享的 Prompt Bundle Renderer 与
ContextCompactor；Agent 从完整 Goal 投影模型视图，按完整交互单元裁剪本轮
Conversation，保留 Goal 原始消息索引，渲染请求，并严格解析 PreparationResult 或
AgentDecision。

## 负责 / 不负责

- 负责：三阶段 Working Context 派生、不可变 PromptContext 投影、从授权 ToolDefinition 的 Input Contract 确定性导出并展示模型可见 inputSchema、Prompt Bundle 版本化组合与确定性渲染、Conversation 完整单元适配与字符预算裁剪、PreparationResult/AgentDecision 输出约束、基于 Contract AST 的 Wire 响应确定性解码与校验、稳定协议错误。
- 不负责：Profile 文件 I/O、Run 状态转换、Profile/Registry/Policy 授权、Tool 执行、循环、GoalStore、重试、具体供应商 SDK、决定 Prompt Bundle 版本是否受支持（只根据 Goal 冻结版本解析，未知版本即失败）。

主要入口是 [LLMPreparationExecutor](../../packages/agent/src/llm-preparation-executor.ts) 与 [LLMStepExecutor](../../packages/agent/src/llm-step-executor.ts)。独立模型视图位于 [model-inference-view.ts](../../packages/agent/src/model-inference-view.ts)，投影、请求组装分别位于 [model-inference-projector.ts](../../packages/agent/src/model-inference-projector.ts) 与 [render.ts](../../packages/agent/src/render.ts)；模型输出响应契约由 `@lazygoal/contracts` 的模型输出契约 Bundle 统一驱动。Preparation View 可接收 Runtime 已提交的 hash-only `preparation_input_recorded` provenance；Executing View 不能携带该字段。当前 v1 可接收一次已提交的 `bm25-lite@1` Lookup Result，不触发 Agent 内部查询；历史命中保留 source refs，但不升级为 Evidence。

Prompt 基础设施集中在 [prompting/](../../packages/agent/src/prompting/)。默认 Renderer 只注册 Prompt Bundle v1 及其当前 `.njk` 资产；v1 固定 `structured@1`、`trajectory-layered@1` 与 `bm25-lite@1`，要求 MemoryPatch 只提交 durable semantic delta，禁止保存 next Action 与 Runtime 控制状态。业务 Prompt 以版本化 `.njk` 资产维护于对应业务目录。

## 单轮数据流

1. TUI Composition Root 创建一次 Renderer 和一次无状态 `DropOldestContextCompactor` 并共享给两个 Executor，同时创建 Protocol Validator、Working Memory 限制和 `TrajectoryCheckpointCommitter`，注入 Launcher、Coordinator 与 Runner。它还创建不可变的 `ModelContextBudgetPolicy`、目标模型输入计量器和只读 `TrajectoryModelContextAssembler`，并把 Assembler 注入两个 Executor。Conversation 预算来自 `LLM_CONVERSATION_CHAR_BUDGET`，缺失时为 `196608`；非法值在访问 Goal 或调用模型前失败。Composition Root 将唯一的 Prompt Bundle v1 与 `structured@1`、`trajectory-layered@1`、`bm25-lite@1` 组合传给 Launcher，由 `createGoal` 冻结进 GoalDefinition。
2. 每轮先从 Goal 单向投影出独立 `ModelInferenceView`：深冻结的 `PromptContext`（含冻结 Bundle 版本、当前 Phase、执行期已审批的 Goal Task 契约、冻结 Profile、Memory 协议、Model Context 协议与按 Tool ID 稳定排序的授权 Tool 描述）、保留 `sourceMessageIndex` 的真实会话投影与阶段化 Working Context。Projector 对每个已授权 ToolDefinition 的 `inputContract` 调用 `compileJsonSchema`，仅剔除根 `$schema` 元数据，将确定性 JSON Schema 投影为 `ModelToolDefinition.inputSchema`；Contract AST 本身不进入 `ModelInferenceView`，View 保持纯 JSON 数据，Prompt 模板直接消费稳定的 JSON Schema。Structured Goal 还接收由 Runtime `WorkingMemorySession` 从 committed Trajectory 重建的临时 Memory；Preparation 另外接收独立的 hash-only provenance DTO。Projector 逐字段深复制并递归冻结，不修改 Goal、消息历史或 Snapshot，也不在 Epoch 前缀携带浮动 Token 水位、瞬时执行资源或非确定性数据（时间、随机数、环境变量）。Preparation Executor 接收 Runtime 解析的 ToolDefinition，但 `gathering_context` 与 v1 `planning` 固定投影空集合；支持 planning Tool 能力的 Bundle 才投影调用方输入。
3. Conversation Adapter 以 user 消息为边界生成 `ContextUnit`，开头连续 assistant 消息形成独立前缀单元。默认 Compactor 按 UTF-16 `content.length` 从旧到新丢弃完整单元，只保留连续最新后缀；最新单元即使超出软预算也完整保留。Adapter、Compactor、Epoch 过滤和 Trajectory Assembler 都只复制原始消息索引；裁剪只生成本轮临时 View，不修改 Goal 或 Snapshot。
4. 请求计划与渲染：`buildPreparationRequest` 与 `buildStepRequest` 根据当前 Phase、checkpoint 需求与 Adapter 的固定 `structuredOutputMode`，返回成对绑定的 `LLMRequest` 与 `ModelOutputContractBundle`：
   - 阶段分支与 checkpoint 独占：active `gathering_context` 唯一允许 `question/context_ready`；active `planning` 唯一允许 `task_proposal`；executing 允许 Tool、Lookup、complete、wait、fail 分支；预算裁剪触发 checkpoint 时单向切换为独占的 `context_checkpoint` Bundle。
   - `prompt_only` 模式：将 Bundle 的 Shape Guide 写入 Step-dynamic 尾部控制消息并计入 `TokenBudgetPlanner`，不向 `LLMRequest` 传入 `structuredOutput`。
   - `strict` 模式：不向 Prompt 注入 Shape Guide，直接向 `LLMRequest` 附加共用 JSON Schema（`structuredOutput`）。
   - 提示词三层拓扑：Goal-stable 根前缀（System 消息，含固定 Overview、Phase Protocol、Approved Task Contract、Profile 与授权 Tools）、Epoch-stable 中间前缀（Conversation 消息）、Step-dynamic 尾部控制消息（纯增量状态，含指标、轨迹、Working Memory 及 prompt-only Guide）。
5. active `gathering_context` 只接受 `question/context_ready`；active `planning` 只接受 `task_proposal`；执行阶段接受 Tool、Lookup、complete、wait、fail 五类严格分支。
6. Adapter 每轮只调用一次并返回原始文本；Executor 使用请求计划中绑定的 `ModelOutputContractBundle` 对原始输出进行单次严格解码与校验（必须符合 wire 外层 `result` envelope、内层分支定义及可空 `memoryPatch`），解码后映射为 canonical 对象并解包剔除 `null` 值。不符合 Contract 或 phase/result 不匹配时按协议错误拒绝，抛出带有 issue path 的 `INVALID_LLM_RESPONSE`，不修复、不重试。Executor 把 `ExecutionControl.signal` 传给 Conversation Compactor 和 LLM Adapter，中止或裁剪失败时不调用后续边界。
7. Working Context 与模型协议 JSON 都不写入真实消息。保存和恢复始终使用完整 `Goal.state.messages`；恢复后的下一轮会从完整历史重新投影和裁剪。
8. 两个 LLM Executor 可接收独立的 `DiagnosticTraceSink`：模型请求、响应、Provider
   扩展 metadata、耗时和异常经过递归脱敏与限长后写入 Trace；Trace 写入失败被隔离，
   不改变 AgentDecision、Snapshot 或 Domain Event。

## 错误与不变量

- 非法 JSON、Schema 或 Preparation phase 不匹配：Agent 抛出 `INVALID_LLM_RESPONSE`（错误码 `LLM_RESPONSE_PROTOCOL_ERROR_CODE`），保留定位 issue path，不修复、不重试；Runner 在 executing 边界将 AgentDecision 协议错误归类为 `INVALID_AGENT_DECISION`。
- Bundle 配置/资产错误（重复 ID/版本、非法 Manifest、缺失资产、模板语法错误）抛出 `PromptBundleConfigurationError`，在 TUI 启动期即失败；Goal 引用未注册 Bundle 版本抛出 `UnsupportedPromptBundleVersionError`，不回退；必需变量缺失或模板渲染失败抛出脱敏的 `PromptRenderError`。三类错误都发生在 Adapter 调用前，Executor 不重试、不修复。
- `createDefaultPromptBundleProtocolValidator` 只接受 Prompt Bundle v1 与 `structured@1 + trajectory-layered@1 + bm25-lite@1` 的完整组合；未知或交叉组合抛出 `GOAL_PROTOCOL_ERROR`。
- Conversation 原始索引只存在于 Agent 内部 DTO；最终 Preparation 控制消息的 map 不包含正文，隐藏消息对应的 provenance 被过滤。Executing 请求不接受 Preparation provenance，即使字段为空数组也直接失败。
- Adapter 异常保持原对象向上传播；Runner 将其记录为失败 Step。
- `ExecutionAbortedError` 原样传播，不进入失败 Step 或协议错误分支。
- Executor 不修改传入 Goal，也不直接写 Store。
- `ContextCompactor` 不依赖 Runtime、Storage 或 Trajectory 类型，不缓存 Goal、Conversation 或上一次裁剪结果。`TrajectoryModelContextAssembler` 同样只读且无状态，直接从当前 committed Trajectory 计算确定性结果。当前 Composition Root 不在主模型调用路径中装配独立 Compact 模型，因而不会因 Warm 归约额外等待或调用 LLM。
- 模型原始请求/响应只进入可选 Diagnostic Trace；Trace 记录不进入 Domain Event，也不要求
  记录隐藏思维链。字符串、递归深度、集合项目和总 JSON 大小均有界，敏感字段按键名脱敏。
- 只有 LazyGoal 注册的模板可被执行；Profile、Instructions、ToolDefinition、Conversation 与 Working Context 中的 Nunjucks 语法一律作为数据/文本插入，不二次执行。
- Global Overview 与 Active Phase Protocol 高于冻结 Profile，Profile 只补充不冲突的角色、领域和工作方式。
- 相同输入产生字符级一致输出：模板与结果统一 LF，Tools 按 Tool ID 稳定升序且其 `inputSchema` 由 Input Contract 确定性编译（仅剔除根 `$schema`，字段顺序和 optional 语义稳定，不含开放 record 或非可移植结构），`stableJson` 键按代码单元排序，fragment 以 `\n\n` 连接且无结尾换行，空 Instructions/空 Tools 有固定表示。
- Global Overview、Profile 与阶段协议都不写入 Goal 消息历史；恢复后的 user/assistant 内容和顺序原样参与后续请求，assistant 来源仍保存在 Goal 的 `profileId` 中。

## 当前限制与背景

Agent 不持久化 Memory、pendingAction、Tool 结果或审批；Runtime 接受/拒绝模型 Fact proposal。`ContextCompactor` 只裁剪本轮 Conversation，Trajectory Assembler 注入 Hot/Warm，Lookup Result 仅作为只读历史输入。Agent 不提供流式响应、自动重试和协议自修复；模型原始 JSON 不进入 Goal 消息或 Domain Event，但可进入独立 Diagnostic Trace。最终模型请求仍把真实 Conversation 正文按原文发送，消息索引只通过 DTO 和 Preparation 控制消息映射表达。当前 Fact shape 设计见 [Structured Working Memory v1 重设计](../../specs/structured-working-memory-v1-redesign/design.md)。

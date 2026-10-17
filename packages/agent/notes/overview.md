# Agent 模型请求

从 Runtime 提供的上下文组装 Prompt、解析模型决策；不拥有 Goal 持久化。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 职责

Agent 将 Runtime 提供的 Goal、Profile、授权 Tool、当前 Run 的 `exposedToolIds`、Working Memory 和已提交 Context Lookup 结果投影为模型请求。业务 Schema 只取授权目录与暴露 ID 的交集，并统一供 Prompt、Wire Contract、native declarations 和 PTC 子工具说明使用。Decide 可通过 `system_find_tools` 请求 Runtime 查询工具目录；匹配结果只作为下一次 Decide 的临时反馈，Think 不带发现分支或系统工具声明。主要入口是 [`LLMStepExecutor`](../src/llm-step-executor.ts)；阶段请求、消息组装与 Section 更新计划归 [模型请求准备](../../model-request/README.md)，Runtime→模型投影与已提交历史组装归 [模型上下文组装](../../model-context/README.md)，模型可见表示归 [模型视图](../../model-view/README.md)。Decide 指引大量文件审阅先发现 `execute_program` 及其子工具；程序入口暴露后，Prompt 指引模型批量读取、过滤并返回简洁证据，简单或依赖逐项推理的操作可直接调用 Tool。PTC 内部调用事实不进入原生历史、Hot/Warm 或检索索引，只有已结算的父程序结果参与下一次模型请求。Agent 不保存 Goal，不执行 Tool，不生成 Runtime ID，也不决定审批结果。模型输入计量、预算分配、完整单元选择与确定性序列化归 [上下文预算](../../context-budget/README.md)；本包只按现有调用顺序消费其策略与裁剪结果。

## Prompt Bundle

固定 system 前缀由 [Prompt Bundle](../../prompt-bundle/README.md) 的当前 Manifest 与模板真源决定；[Prompt 渲染](../../prompt-renderer/README.md) 负责内存模板编译与确定性渲染。默认 Renderer 只注册 Prompt Bundle v1 的三个固定 system slot，并按以下顺序渲染：

1. Global Overview；
2. Profile；
3. 当前推理阶段的固定说明（Decide 或 Think）。

Bundle 固定匹配 `structured@1`、`trajectory-layered@1` 和 `bm25-lite@1`。Registry 在构造期检查模板、slot 顺序、协议及 Decide/Think 模板映射；不提供旧模板或版本回退。当前 `ModelInferenceProjector` 默认选择 Decide，Think 使用同一固定基础指令和专属阶段说明。

Run 模式、已批准任务、GoalPlan、授权工具和 Working Memory 不进入固定 `PromptContext`。默认 Bundle 的 `DynamicSectionRegistry` 按稳定 ID、来源、角色和顺序投影这些 section，并使用 Bundle v1 注册的版本化模板渲染为 `user` 消息；[Prompt 渲染](../../prompt-renderer/README.md) 的注册机制通用遍历注册项，不按 section ID 分支。新增 section 只需增加注册定义和模板资产。

纯函数 `planDynamicSectionUpdates`（[模型请求准备](../../model-request/README.md)）接收当前渲染投影及已筛选的同阶段 frame，按注册身份校验并规范化 JSON 投影，折叠每个 section 的最新状态，只输出完整注入、整段替换或失效 tombstone，同时生成与实际消息对应的 frame 记录。它不改写 Conversation，也不负责读取历史或组装请求。

## 单轮请求

`ModelInferenceProjector`（[模型上下文组装](../../model-context/README.md)）从 Goal 生成深冻结的 `ModelInferenceView`，包括固定 Prompt 上下文、动态运行状态（含当前活动阶段 `currentStage` 目标、条件与审查反馈投影）、真实 Conversation、Working Memory、Context Epoch 和可选的已提交 Lookup Result。模型只能看到稳定 DTO，不能提交 Runtime 的 Goal/Run、Step、Epoch、Todo ID、Action ID 或内部计数。

`buildStepRequest`（[模型请求准备](../../model-request/README.md)）在单次调用内完成上下文组装、预算裁剪和 Prompt 渲染，并返回与请求绑定的 `ModelOutputContractBundle`。`TrajectoryModelContextAssembler`（[模型上下文组装](../../model-context/README.md)）按 Goal Snapshot 的 committed boundary、Goal/Run、当前 Decide/Think 阶段、Epoch、Conversation 起点和注册身份筛选 Section frame，并在同一次 Trajectory 读取中构造固定预算输入及 Hot/Warm 上下文。Planner 将每个当前 Section 的最新状态重建进无状态请求；变化只产生完整替换或失效更新，未变化 Section 沿用已提交的最新消息。Epoch 切换、历史裁剪或缺少有效基线时，当前投影会重新完整注入。

请求顺序为固定 system、保留的真实 Conversation、按注册顺序排列的动态 section、本轮 Working Context；Working Memory 单独作为动态 section 提供，不重复进入尾部控制消息。每次候选请求都把原生 Tool schema 和单调用指令纳入输入预算；Decide 挂载工具时不再携带顶层决策 Schema 或文本 JSON Shape Guide；裁剪 Conversation 后会重算动态更新并保留当前 checkpoint 控制消息，必需内容仍超限则在调用模型前失败。请求计划同时返回本次新增 Section frame 元数据，供 Runtime 提交路径持久化。Assembler 把带已批准 `action_staged` 的完整 Tool Action/Observation 执行单元投影到下一轮 Hot/Warm 上下文；未提交、缺少 staging 或不完整单元不可见。

`ModelExecutionBinding` 将同一 provider/model 的 prompt_only Think Adapter 与供应商适配的 Decide Adapter 作为一个 generation 原子发布；OpenAI、Google、OpenAI-compatible 的 Decide 使用原生 strict，Anthropic、OpenRouter、DeepSeek 使用 prompt_only。当前 `LLMStepExecutor.execute` 是一次 Decide 调用，只通过该阶段 Adapter 发送请求，并用该请求绑定的 Wire Contract 在本地验证响应。执行开始后绑定 generation 固定，不会中途切换 Adapter。

## Think 与 Decide 阶段

Decide 按阶段专用 Adapter 执行；挂载工具并设置 `toolChoice: required` 时，所有供应商都必须返回恰好一个声明调用。Agent 仅解码调用参数，零个或多个调用进入现有三次纠错链，不从正文 JSON 回退解析，也不静默接受第一个调用。附带正文不参与决策解码；`nativeConversationIdentity` 只控制原生历史回放及续接校验。Decide 的 `request_think { goal }` 只请求 Runtime 调用 Think，不是 AgentDecision，也不属于业务工具授权。Think 使用同一模型的 `prompt_only` Adapter，不附带结构化 Schema 或工具声明；Runtime 提供明确目标和本 Step 已提交的 Think 目标/输出。Think 文本作为 assistant 消息交给后续 Decide，不进入 Goal Conversation。

每次成功 Decide/Think 调用都返回本请求的 `modelContextFrame`。Runner 在下一阶段继续前提交阶段事实、frame 和 Snapshot；未提交 frame 不会成为后续请求的 diff 基线。Agent 只负责组装请求和解析结果，不拥有阶段循环或持久化。

## 当前决策门控

Contracts 根据当前 Run 的模式、任务批准状态和可见工具集合生成决策声明：普通 Run 可直接提交完成候选，Plan Run 必须先批准任务才可完成。任务未批准时，Runtime 只传入明确声明 `isReadOnly: true` 的工具，固定 Prompt 说明此边界；Plan Mode 额外暴露 `system_update_goal_plan`。Plan Prompt 要求先收集影响范围、正确性或授权的关键信息，再按独立交付结果、真实依赖和验收关口形成单阶段或多阶段完整路线，并随单个任务提案提交；普通 Run 不要求全路线。Schema 可见性不授予执行权；Runtime 仍在调用入口校验只读门、Profile、Registry、Policy、审批和沙箱规则。

获批 Plan Run 的动态上下文包含 Runtime 权威路线和游标。Prompt 要求按序声明下一阶段、保留已接受结果，并在需要改动完整路线时调用 `system_update_plan_route`；普通 Run 不投影路线，也不暴露该声明。

## 完成审查

所有完成候选通过 Runtime 协议与引用校验后，由 [`reviewCompletion`](../src/llm-step-executor.ts) 使用当前 Decide Adapter 独立审查。专用 [Prompt 与请求构造器](../../model-request/src/completion-review.ts) 提供当前请求和约束、获批条件、完整候选及 Runtime 解析的引用证据正文；只声明 `system_review_completion`，不执行工具或改写答案。`summary` 承载完整用户回复；Think、模型自述、目录和规模统计不能代替所需实现证据，已提供源码可直接使用，简单请求允许简短回答。

审查使用既有模型预算。请求保留引用的已提交 Observation 与操作来源，避免把同一工具输出同时作为工具完成和 Observation 正文发送；必要输入仍超限时，在调用模型前以 `COMPLETION_REVIEW_INPUT_TOO_LARGE` 失败，不裁剪后放行。拒绝通过有界 `origin: completion_review` 反馈进入 Decide 纠错链；协议错误与拒绝合计最多三次 Decide 尝试。传输失败沿用请求重试。审查没有 Section frame 或独立恢复阶段；未提交审查恢复后可能重新调用并产生费用。

## 输出处理

Decide 的模型原始文本由当前请求 Wire Contract 严格解析（[模型响应解码](../../model-response/README.md)）：`request_think` 解码为独立阶段控制结果，业务输出解码为 Canonical `AgentDecision`。Think 不解析 AgentDecision，拒绝空文本和任何工具调用。Plan Mode 的 `goal_plan_update` 仍只是模型提案，由 Runtime 的 GoalPlan reducer 分配 Todo ID、校验 revision/状态并提交 Snapshot；普通模式不会解码该分支。解析、Schema、分支或 Tool 参数错误会转换为带稳定来源、路径和有界安全提示的 `RuntimeFeedback`，字段提示按稳定错误码生成，业务工具参数路径统一标记为 `action.input`（正文 JSON 带 `result` 前缀），并指导模型纠正调用后继续取证。已声明原生工具的 Object 参数校验失败时，反馈 constraints 附工具名、已提供字段以及允许和必填字段的有界形状摘要；不回传参数值，非法 JSON 与未知工具不生成该摘要。反馈作为标记为 `runtime_feedback` 的临时阶段消息追加到历史、动态 Section 与 Working Context 之后；它不会追加到 Goal Conversation，也不会改变 strict 或 prompt_only 输出模式。Runner 在提交反馈后最多尝试同一 Decide 或 Think 纠错链三次（含首次）；恢复只读取 Snapshot 边界内的反馈事实，并忽略未提交输出。原始响应可进入独立诊断 Trace，但不进入 Goal Conversation；已提交 Think 的目标与输出以专用 Trajectory 事实保存。

Agent 不拥有 UI；当 Adapter 提供 `stream` 时，`LLMStepExecutor` 将模型增量映射到
`@lazygoal/execution-stream`，同时只用最终 `completed` 响应解析 AgentDecision。没有流接口的 Adapter
继续调用 `generate()` 并发布一次性模型事件；完成审查调用不发布模型文本或函数参数，内部结果只用于审查和诊断。实时显示由 Web Goal Board 的适配器管理。

每次模型调用由 `LLMStepExecutor` 向可选的 Runtime 指标 Recorder 记录开始和结束事实。输入/输出 token 只取原生 Adapter 的供应商上报用量；pi-ai 诊断计数和无用量响应记为不可用。流式调用的生成时长从首个非空文本增量计至完成；非流式调用不推测生成速度。Recorder 失败被隔离，不改变 AgentDecision。

## 模型消息记录

正式组合根为 LLMStepExecutor 注入独立的 [`ModelInputStore`](../../runtime/src/model-input.ts)。每次 Think、Decide 或 `completion_review` 在 Adapter 调用前保存最终消息正文与顺序，调用身份与指标共享；审查使用独立 callId，成功 Decide/Think frame 由 modelCallId 关联。写入失败阻止当前调用；调用失败不删除已保存输入，输入事实不推进 Section 比较基线。诊断请求日志通过调用引用指向完整消息，避免再次写入 system 正文。请求、Adapter 原始响应及校验错误通过同一 callId 关联；每个原生工具的实际请求 schema 单独记录为 model_tool_schema，错误保留 code 与 issues。Trace 仍为脱敏、有界且 best effort 的诊断，超限标记截断，不保证供应商 HTTP wire 原文，也不参与恢复。

## 原生工具对话历史

OpenAI Chat Completions 与 Gemini 的 Decide 请求从 Snapshot 提交边界内重建原生调用交换。Agent 返回规范化响应，Runner 随接受的阶段 checkpoint 提交 `model_response_received`；诊断和输入日志不参与恢复。供应商调用 ID 与 Runtime Action ID 独立，工具 Observation、lookup 结果、已提交 Think 输出或系统决策接受确认按调用 ID 配对。审批等待和未结算调用不进入下一请求。

同身份的近期交换按 Conversation 位置插入请求；调用、结果及签名以完整执行单元参与 Hot 预算，被替代的结果不再重复写入 Hot 文本或 previousStep。已纳入请求的原生工具交换消除 Hot 投影中重复的 `action_staged` 与 `tool_started` 动作参数，只保留必要操作身份与状态；原生路径的动态授权 Section 移除重复参数 Schema，仅保留授权身份、描述及 `execute_program` 等必要指导；`prompt_only` 模式保留完整解码 Schema。当前未结束 Step 的已结算 Think 交换也可见，输出只通过配对 tool result 发送。较旧单元由原始语义投影提取 Warm；切换 provider、端点、模型、协议或进入语义 Adapter 路径结束旧续接段。Think 请求保持纯文本，不携带原生调用历史。契约见 [model-conversation.ts](../../model-contracts/src/model-conversation.ts)，组装见 [native-model-history.ts](../../model-context/src/native-model-history.ts)。

Context Lookup 的 found、not_found、lookup_error 模型投影统一标记 `sourceScope: goal_history` 与来源限制；普通上下文和原生工具结果共用该投影。语料不搜索仓库文件，未命中不证明文件或决策不存在。用户指定资料尚缺时通过授权文件工具读取，充分已有来源可复用。完成审查同样接收范围说明，并核对指定来源与实际交付物；通用示例不能替代要求的真实案例，是否附带 Memory Patch 不影响判断。Lookup 与阶段导航投影归 [模型上下文组装](../../model-context/README.md)。

来源选择与 Memory 修复的固定单步评测沿用 `npm run llm:decision-eval`，完成审查评测使用 `npm run llm:decision-eval -- --completion-review`。新来源场景使用实际文件 Tool Schema 和生产反馈消息注入，每项重复三次；缺失调用标记 incomplete，任何新场景失败不通过。报告只衡量固定单步／候选判断，不代表长期任务成功率。

完成审查按用户原文、当前阶段、完整候选和引用的已提交证据组装输入，不默认重放完整会话。仅允许一次 `system_review_completion` 调用，不发送顶层决策 Schema 或文本 JSON 输出指导；调用数量错误区分缺失与多调用并给出纠错要求。保守保留历史用户要求；当前 Run 用户回复紧邻的 Assistant 消息用于问答、批准及沿用结果的语境，记录原始消息位置。其他历史答复通过显式 Context Lookup 来源提供。必要原文或证据仍超预算时在调用前失败，不截断后放行。

## Decide 响应形状的分级接受

`LLMStepExecutor` 不再要求"恰好一个工具调用"。`classifyDecideResponse` 把一次 Decide 响应分为四类：

- **单调用**：进入既有解析、授权与执行流程，行为不变。
- **多调用**：按模型返回顺序解码为有序决策数组（`DecideStageResult.kind === "batch"`），交由 Runner 逐个暂存与执行；Executor 不执行、不排序、不去重。批次中混入控制请求（`complete`/`wait`/`fail` 等）时按不可判定协议错误拒绝，因为"控制请求必须最后执行"的顺序语义尚未定义。
- **零调用 + 非空正文**：接受为合法 Assistant 消息（`assistant_message`），不推进 Step、不构成完成语义；由 Runner 提交为 Goal 消息并按不推进类预算继续。
- **零调用且无可用正文**（空内容或仅 reasoning）：抛 `no_usable_result` 反馈，不是 `missing_tool_call`。

每个调用的参数解码（JSON 解析、契约校验、动作身份分配）由 `decodeToolCallOutcome` 统一承担，单调用与批次复用同一错误语义。完成审查等结构化控制请求不经过该分级，仍要求唯一结果。

# Agent 模块

## 职责

Agent 将 Runtime 提供的 Goal、Profile、授权 Tool、Working Memory 和已提交 Context Lookup 结果投影为模型请求。Decide 返回经本地契约校验的业务 `AgentDecision`，或独立的 `request_think` 控制请求；Think 返回自由文本和模型可见上下文 frame。主要入口是 [`LLMStepExecutor`](../../packages/agent/src/llm-step-executor.ts)、[`model-inference-view.ts`](../../packages/agent/src/model-inference-view.ts)、[`prompt.ts`](../../packages/agent/src/prompt.ts) 和 [`render.ts`](../../packages/agent/src/render.ts)。Agent 不保存 Goal，不执行 Tool，不生成 Runtime ID，也不决定审批结果。

## Prompt Bundle

默认 Renderer 只注册 Prompt Bundle v1 的三个固定 system slot，并按以下顺序渲染：

1. Global Overview；
2. Profile；
3. 当前推理阶段的固定说明（Decide 或 Think）。

Bundle 固定匹配 `structured@1`、`trajectory-layered@1` 和 `bm25-lite@1`。Registry 在构造期检查模板、slot 顺序、协议及 Decide/Think 模板映射；不提供旧模板或版本回退。当前 `ModelInferenceProjector` 默认选择 Decide，Think 使用同一固定基础指令和专属阶段说明。

Run 模式、已批准任务、GoalPlan、授权工具和 Working Memory 不进入固定 `PromptContext`。独立 `DynamicSectionRegistry` 按稳定 ID、来源、角色和顺序投影这五个 section，并使用 Bundle v1 注册的版本化模板渲染为 `user` 消息；Projector/Renderer 通用遍历注册项，不按 section ID 分支。新增 section 只需增加注册定义和模板资产。

纯函数 `planDynamicSectionUpdates` 接收当前渲染投影及已筛选的同阶段 frame，按注册身份校验并规范化 JSON 投影，折叠每个 section 的最新状态，只输出完整注入、整段替换或失效 tombstone，同时生成与实际消息对应的 frame 记录。它不改写 Conversation，也不负责读取历史或组装请求。

## 单轮请求

`ModelInferenceProjector` 从 Goal 生成深冻结的 `ModelInferenceView`，包括固定 Prompt 上下文、动态运行状态、真实 Conversation、Working Memory、Context Epoch 和可选的已提交 Lookup Result。模型只能看到稳定 DTO，不能提交 Runtime 的 Goal/Run、Step、Epoch、Todo ID、Action ID 或内部计数。

`buildStepRequest` 在单次调用内完成上下文组装、预算裁剪和 Prompt 渲染，并返回与请求绑定的 `ModelOutputContractBundle`。`TrajectoryModelContextAssembler` 按 Goal Snapshot 的 committed boundary、Goal/Run、当前 Decide/Think 阶段、Epoch、Conversation 起点和注册身份筛选 Section frame，并在同一次 Trajectory 读取中构造固定预算输入及 Hot/Warm 上下文。Planner 将每个当前 Section 的最新状态重建进无状态请求；变化只产生完整替换或失效更新，未变化 Section 沿用已提交的最新消息。Epoch 切换、历史裁剪或缺少有效基线时，当前投影会重新完整注入。

请求顺序为固定 system、保留的真实 Conversation、按注册顺序排列的动态 section、本轮 Working Context；Working Memory 单独作为动态 section 提供，不重复进入尾部控制消息。每次候选请求都把原生 Tool schema 和当前结构化输出约束（strict JSON schema 或 prompt_only Shape Guide）纳入输入预算；裁剪 Conversation 后会重算动态更新并保留当前 checkpoint 控制消息，必需内容仍超限则在调用模型前失败。请求计划同时返回本次新增 Section frame 元数据，供 Runtime 提交路径持久化。Assembler 把带已批准 `action_staged` 的完整 Tool Action/Observation 执行单元投影到下一轮 Hot/Warm 上下文；未提交、缺少 staging 或不完整单元不可见。

`ModelExecutionBinding` 将同一 provider/model 的 prompt_only Think Adapter 与供应商适配的 Decide Adapter 作为一个 generation 原子发布；OpenAI、Google、OpenAI-compatible 的 Decide 使用原生 strict，Anthropic、OpenRouter、DeepSeek 使用 prompt_only。当前 `LLMStepExecutor.execute` 是一次 Decide 调用，只通过该阶段 Adapter 发送请求，并用该请求绑定的 Wire Contract 在本地验证响应。执行开始后绑定 generation 固定，不会中途切换 Adapter。

## Think 与 Decide 阶段

Decide 按阶段专用 Adapter 执行：支持原生严格输出的供应商在业务决策约束上使用 strict，其余供应商依赖 Shape Guide 和同一本地契约校验。Decide 的 `request_think { goal }` 只请求 Runtime 调用 Think，不是 AgentDecision，也不属于业务工具授权。Think 使用同一模型的 `prompt_only` Adapter，不附带结构化 Schema 或工具声明；Runtime 提供明确目标和本 Step 已提交的 Think 目标/输出。Think 文本作为 assistant 消息交给后续 Decide，不进入 Goal Conversation。

每次成功阶段调用都返回本请求的 `modelContextFrame`。Runner 在下一阶段继续前提交阶段事实、frame 和 Snapshot；未提交 frame 不会成为后续请求的 diff 基线。Agent 只负责组装请求和解析结果，不拥有阶段循环或持久化。

## 当前决策门控

Contracts 根据 `workflow.task` 和后端 `planMode` 动态生成 Wire Schema：

- task 缺省：`ask_user`、`task_proposal`、历史 `context_lookup` 和显式只读 Tool；
- task 已批准：上述执行入口加上全部授权 Tool、`complete`、`wait` 和 `fail`。
- Plan Mode：在对应分支额外暴露 `system_update_goal_plan`；普通模式不生成该分支。

只读能力由 Runtime `ToolDefinition.isReadOnly` 提供，Agent 只负责过滤模型可见列表；最终授权仍由 Runtime 再校验。完成条件和验收声明由 Task 投影给模型，但满足条件的事实只能来自已提交 Evidence。

## 输出处理

Decide 的模型原始文本由当前请求 Wire Contract 严格解析：`request_think` 解码为独立阶段控制结果，业务输出解码为 Canonical `AgentDecision`。Think 不解析 AgentDecision，拒绝空文本和任何工具调用。Plan Mode 的 `goal_plan_update` 仍只是模型提案，由 Runtime 的 GoalPlan reducer 分配 Todo ID、校验 revision/状态并提交 Snapshot；普通模式不会解码该分支。解析、Schema、分支或 Tool 参数错误会转换为带稳定来源、路径和有界安全提示的 `RuntimeFeedback`，字段提示按稳定错误码生成，业务工具参数路径统一标记为 `action.input`（正文 JSON 带 `result` 前缀），并指导模型纠正调用后继续取证。反馈可作为标记为 `runtime_feedback` 的临时阶段消息注入原阶段请求；它不会追加到 Goal Conversation，也不会改变 strict 或 prompt_only 输出模式。Runner 在提交反馈后最多重试同一 Decide 或 Think 阶段三次（含首次调用）；恢复只读取 Snapshot 边界内的反馈事实，并忽略未提交输出。原始响应可进入独立诊断 Trace，但不进入 Goal Conversation；已提交 Think 的目标与输出以专用 Trajectory 事实保存。

Agent 不拥有 UI；当 Adapter 提供 `stream` 时，`LLMStepExecutor` 将模型增量映射到
`@lazygoal/execution-stream`，同时只用最终 `completed` 响应解析 AgentDecision。没有流接口的 Adapter
继续调用 `generate()` 并发布一次性模型事件；实时显示由 TUI 或未来 WebUI 的适配器管理。

每次模型调用由 `LLMStepExecutor` 向可选的 Runtime 指标 Recorder 记录开始和结束事实。输入/输出 token 只取原生 Adapter 的供应商上报用量；pi-ai 诊断计数和无用量响应记为不可用。流式调用的生成时长从首个非空文本增量计至完成；非流式调用不推测生成速度。Recorder 失败被隔离，不改变 AgentDecision。

## 模型消息记录

正式组合根为 LLMStepExecutor 注入独立的 [`ModelInputStore`](../../packages/runtime/src/model-input.ts)。每次 Think/Decide 在 Adapter 调用前保存最终消息正文与顺序，调用身份与指标共享，并由成功 frame 的 modelCallId 关联。写入失败阻止当前调用；调用失败不删除已保存输入，输入事实不推进 Section 比较基线。诊断请求日志通过调用引用指向完整消息，避免再次写入 system 正文。

## 原生工具对话历史

OpenAI Chat Completions 与 Gemini 的 Decide 请求从 Snapshot 提交边界内重建原生调用交换。Agent 返回规范化响应，Runner 随接受的阶段 checkpoint 提交 `model_response_received`；诊断和输入日志不参与恢复。供应商调用 ID 与 Runtime Action ID 独立，工具 Observation、lookup 结果、已提交 Think 输出或系统决策接受确认按调用 ID 配对。审批等待和未结算调用不进入下一请求。

同身份的近期交换按 Conversation 位置插入请求；调用、结果及签名以完整执行单元参与 Hot 预算，被替代的结果不再重复写入 Hot 文本或 previousStep。当前未结束 Step 的已结算 Think 交换也可见，输出只通过配对 tool result 发送。较旧单元由原始语义投影提取 Warm；切换 provider、端点、模型、协议或进入语义 Adapter 路径结束旧续接段。Think 请求保持纯文本，不携带原生调用历史。契约见 [model-conversation.ts](../../packages/contracts/src/model-conversation.ts)，组装见 [native-model-history.ts](../../packages/agent/src/native-model-history.ts)。

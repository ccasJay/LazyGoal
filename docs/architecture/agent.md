# Agent 模块

## 摘要

Agent 是 Runtime 与 LLM 之间的集成层。Runtime Composition Root 从当前生效的
Profile JSON 加载并冻结 Profile，同时创建共享的 Prompt Bundle Renderer 与
ContextCompactor；Agent 从完整 Goal 投影模型视图，按完整交互单元裁剪本轮
Conversation，渲染请求，并严格解析 PreparationResult 或 AgentDecision。

## 负责 / 不负责

- 负责：三阶段 Working Context 派生、不可变 PromptContext 投影、Prompt Bundle
  版本化组合与确定性渲染、Conversation 完整单元适配与字符预算裁剪、调用方传入的授权 ToolDefinition 展示、PreparationResult/AgentDecision 输出约束、JSON/Zod 校验、稳定协议错误。
- 不负责：Profile 文件 I/O、Run 状态转换、Profile/Registry/Policy 授权、Tool 执行、循环、GoalStore、重试、具体供应商 SDK、决定 Prompt Bundle 版本是否受支持（只根据 Goal 冻结版本解析，未知版本即失败）。

主要入口是 [LLMPreparationExecutor](../../packages/agent/src/llm-preparation-executor.ts) 与 [LLMStepExecutor](../../packages/agent/src/llm-step-executor.ts)。独立的模型输入视图 DTO 位于 [model-inference-view.ts](../../packages/agent/src/model-inference-view.ts)，从 Runtime State 到该视图的逐字段投影位于 [model-inference-projector.ts](../../packages/agent/src/model-inference-projector.ts)，纯 Prompt 请求组装位于 [render.ts](../../packages/agent/src/render.ts)，响应边界位于 [response-schema.ts](../../packages/agent/src/response-schema.ts)。

版本化 Prompt 基础设施集中在 [prompting/](../../packages/agent/src/prompting/)：Registry、内存 Loader、封闭 Nunjucks Environment、确定性 Renderer、错误与 DTO，以及默认 Bundle 工厂 [default-bundles.ts](../../packages/agent/src/prompting/default-bundles.ts)。业务 Prompt 以版本化 `.njk` 资产就近维护于 [global-system-prompt/](../../packages/agent/src/global-system-prompt/)、[preparation-prompt/](../../packages/agent/src/preparation-prompt/) 与 [step-prompt/](../../packages/agent/src/step-prompt/)。

## 单轮数据流

1. TUI Composition Root 创建一次 Renderer 和一次无状态 `DropOldestContextCompactor` 并共享给两个 Executor。Conversation 预算来自 `LLM_CONVERSATION_CHAR_BUDGET`，缺失时为 `196608`；非法值在访问 Goal 或调用模型前失败。Composition Root 同时把 Agent 导出的 `CURRENT_PROMPT_BUNDLE_VERSION` 注入 `LauncherDependencies.promptBundleVersion`，由 `createGoal` 冻结进 `GoalDefinition.promptBundleVersion`。
2. 每轮先从 Goal 单向投影出独立 `ModelInferenceView`：深冻结的 `PromptContext`（含冻结 Bundle 版本、当前 Phase、冻结 Profile 与按 Tool ID 稳定排序的授权 Tool 描述）、真实会话投影与阶段化 Working Context。Projector 逐字段深复制并递归冻结，不修改 Goal、消息历史或 Snapshot，也不携带 Run 状态字段、瞬时执行资源或非确定性数据（时间、随机数、环境变量）。
3. Conversation Adapter 以 user 消息为边界生成 `ContextUnit`，开头连续 assistant 消息形成独立前缀单元。默认 Compactor 按 UTF-16 `content.length` 从旧到新丢弃完整单元，只保留连续最新后缀；最新单元即使超出软预算也完整保留。裁剪只生成本轮临时 View，不修改 Goal 或 Snapshot。
4. `renderRequest(view, renderer)` 依据 `PromptContext` 生成唯一 system 消息（Global Overview → Profile → Phase Protocol → Authorized Tools），再追加已选择的 Conversation 与完整 JSON Working Context。`pendingAction`、`previousStep` 和 checkpoint 不参与 Conversation 裁剪。
5. active `gathering_context` 只接受 `question/context_ready`；active `planning` 只接受 `task_proposal`；执行阶段只接受四分支 AgentDecision。
6. Adapter 每轮只调用一次并返回原始文本；phase/result 不匹配按协议错误拒绝，不修复、不重试。Executor 把 `ExecutionControl.signal` 传给异步 Compactor 和 LLM Adapter，中止或裁剪失败时不调用后续边界。
7. Working Context 与模型协议 JSON 都不写入真实消息。保存和恢复始终使用完整 `Goal.state.messages`；恢复后的下一轮会从完整历史重新投影和裁剪。

## 错误与不变量

- 非法 JSON、Schema 或 Preparation phase 不匹配：Agent 抛出 `INVALID_LLM_RESPONSE`，不修复、不重试；Runner 在 executing 边界将 AgentDecision 协议错误归类为 `INVALID_AGENT_DECISION`。
- Bundle 配置/资产错误（重复 ID/版本、非法 Manifest、缺失资产、模板语法错误）抛出 `PromptBundleConfigurationError`，在 TUI 启动期即失败；Goal 引用未注册 Bundle 版本抛出 `UnsupportedPromptBundleVersionError`，不回退；必需变量缺失或模板渲染失败抛出脱敏的 `PromptRenderError`。三类错误都发生在 Adapter 调用前，Executor 不重试、不修复。
- Adapter 异常保持原对象向上传播；Runner 将其记录为失败 Step。
- `ExecutionAbortedError` 原样传播，不进入失败 Step 或协议错误分支。
- Executor 不修改传入 Goal，也不直接写 Store。
- `ContextCompactor` 不依赖 Runtime、Storage 或 Trajectory 类型，不缓存 Goal、Conversation 或上一次裁剪结果。
- 只有 LazyGoal 注册的模板可被执行；Profile、Instructions、ToolDefinition、Conversation 与 Working Context 中的 Nunjucks 语法一律作为数据/文本插入，不二次执行。
- Global Overview 与 Active Phase Protocol 高于冻结 Profile，Profile 只补充不冲突的角色、领域和工作方式。
- 相同输入产生字符级一致输出：模板与结果统一 LF，Tools 按 Tool ID 稳定升序，`stableJson` 键按代码单元排序，fragment 以 `\n\n` 连接且无结尾换行，空 Instructions/空 Tools 有固定表示。
- Global Overview、Profile 与阶段协议都不写入 Goal 消息历史；恢复后的 user/assistant 内容和顺序原样参与后续请求，assistant 来源仍保存在 Goal 的 `profileId` 中。

## 当前限制与背景

Agent 不直接持久化 pendingAction、执行 Tool 或处理审批；这些由 Runtime Runner/Coordinator 负责。当前 Compactor 只丢弃本轮不可见的旧单元，不生成摘要；Trajectory 仍未建模，后续只能通过独立 Adapter 接入中立 `ContextUnit`。Agent 仍不提供流式响应、自动重试和协议自修复。LLM Step Executor 返回 AgentDecision，Coordinator 负责 Preparation 消息，模型原始 JSON 不会持久化。默认工厂按 `import.meta.url` 定位 `.njk` 资产，仓库以源码运行故无需复制流程。裁剪设计见 [Model Context Pruning Spec](../../specs/model-context-pruning/design.md)，早期执行器背景见 [LLM Step Executor Spec](../../specs/llm-step-executor/design.md)，现状以源码为准。

# Goal-driven Workflow Prompt 设计

## Overview

本功能在现有版本化 Prompt Bundle 上新增 v2，通过 Global Overview 与三个 Phase Protocol 的职责分工强化 Agent 的端到端决策纪律，并让 planning 根据当前 Goal 实际授权的 ToolDefinition 约束完成条件。默认 Renderer 同时支持 v1 和 v2；新 Goal 冻结 v2，已有 v1 Goal 恢复后仍按原字符内容渲染。现有 `PromptContext`、消息顺序、严格响应 Schema、Runtime Workflow、Tool 授权和 Snapshot v5 均保持不变；`PreparationExecutor` 增加由 Runtime 调用方提供的 ToolDefinition 输入。

本设计覆盖 [需求 1](./requirements.md#req-1-1) 至 [需求 7](./requirements.md#req-7-1)。仓库现有 Prompt Registry、Renderer、ToolRegistry 与通用正整数 `promptBundleVersion` 已满足版本路由和 ToolDefinition 投影需要，不引入外部依赖。

## Key Design Decisions

### 1. 新增 v2 Bundle，完整保留 v1

- `CURRENT_PROMPT_BUNDLE_VERSION` 从 `1` 提升为 `2`，使现有 Composition Root 自动为新 Goal 冻结 v2，满足需求 1.1。
- v1 Manifest 与其引用的 `@1` 模板继续注册到默认 Renderer，任何 v1 文件均不修改，以保证需求 1.2 的字符级兼容。
- `DEFAULT_PROMPT_BUNDLE_MANIFEST` 表示当前默认的 v2 Manifest；默认工厂内部另保留 v1 Manifest，并将两者一并传给 Registry。
- v2 只新增发生行为变化的 `global-overview@2`、`gathering-context@2`、`planning@2` 和 `agent-decision@2`。Profile 与 Authorized Tools 的展示契约未变化，因此复用不可变的 `profile@1` 和 `authorized-tools@1`。
- 未注册版本继续由现有 Registry 抛出 `UnsupportedPromptBundleVersionError`，不增加回退路径，满足需求 1.4。

Snapshot v5 已把 `promptBundleVersion` 定义为通用正整数，Runtime 也只冻结 Composition Root 注入的版本，所以本功能不修改 Runtime 或 Storage 协议。

### 2. Global Overview 只承载跨阶段不变量

`global-overview@2` 使用英文指令，与仓库 Agent 输出语言约束一致，并只保留所有阶段都需要的规则：

- 说明 LazyGoal 的三阶段生命周期与当前 Phase Protocol 的职责边界。
- 固定 Global/Phase 高于 Profile 的优先级，同时要求在不冲突时遵循 Profile。
- 将 Conversation、Working Context 和 Authorized Tools 定义为当前轮事实输入；Prompt 不能充当 Runtime 授权，未经 Observation 的结果不得视为事实。
- 要求 Agent 在现有上下文内自主推进，但不得跨越当前 Phase 或响应协议。

追问条件、任务提案质量和执行算法不放入 Global Overview，避免 Preparation 请求携带无关执行规则，也避免同一规则在多个 fragment 中形成维护副本。该分工覆盖需求 2。

### 3. 每个 Phase Protocol 同时定义决策规则与输出协议

三个 v2 Phase 模板均保留“只输出一个 JSON 对象”的现有协议约束，并在 Schema 说明之前加入该阶段的最小决策顺序：

| Phase 模板 | 决策规则 | 对应需求 |
| --- | --- | --- |
| `gathering-context@2` | 先判断现有事实是否足以形成任务；只对显著改变结果、高风险或阻塞规划的单个缺口提问；对可安全推断且可验证或撤销的细节直接推断 | 3 |
| `planning@2` | 把已确认上下文整理为结果与边界明确的 `objective`；根据当前 Authorized Tools 可产生的 Observation 约束 `completionCriteria`；显式标出用户要求但 Runtime 无法自行取得的外部证据 | 4、7 |
| `agent-decision@2` | 依据任务、checkpoint、previousStep、pendingAction 与 Observation 选择最小有效下一步；优先继续可执行路径，按证据区分 `tool_call`、`complete`、`wait`、`fail` | 5、6 |

模板只描述当前已存在的响应字段，不增加自由文本区、推理字段或新分支。严格合法性仍由 `response-schema.ts` 和 Runtime 校验，而不是由 Prompt 代替。

### 4. Executing 采用显式的证据与终止顺序

`agent-decision@2` 先吸收已有 Observation，再按 `complete → tool_call → wait/fail` 的适用条件选择分支；排序表达判断顺序，不代表必须优先结束。只要仍存在可执行、可验证的下一步，就继续以最小有效 Action 推进。每个分支的 `checkpoint` 都是累计恢复摘要，并逐条记录每项 completion criterion 的当前证据状态，供后续轮次核对完成条件；修改后的验证强度由任务风险决定，Prompt 不硬编码某个 Tool、命令或技术栈。该策略覆盖需求 5 与需求 6，同时保持 Profile 的领域判断空间。

### 5. v2 Prompt 使用固定的逐字内容

以下文本是 v2 四个新模板的权威草案；实现时只允许为 `.njk` 换行控制做不改变渲染字符的调整。Profile 与 Authorized Tools 继续使用现有 `@1` 文本。

#### `global-overview@2.njk`

```text
Global Overview:
You are operating inside LazyGoal, a goal-driven and resumable agent runtime.
LazyGoal turns user intent into an approved task through gathering_context and planning, then advances it through a controlled executing phase.
Use only the active Phase Protocol to determine the current responsibility and required response format.
This Global Overview and the active Phase Protocol take precedence over the frozen Profile.
Follow the frozen Profile for role-specific behavior, domain guidance, and working style when it does not conflict with those higher-level instructions.
Treat the supplied Conversation, Working Context, and Authorized Tool definitions as the inputs for the current turn.
Only an Observation in Working Context establishes the result of a Tool Action; never treat an instruction, plan, or requested Action as completed work.
Advance autonomously from available evidence, but do not cross the active Phase boundary or invent unavailable information.
```

#### `gathering-context@2.njk`

```text
Active Phase Protocol: gathering_context
Decision policy:
1. Read the intent and Conversation before deciding whether a question is necessary.
2. Return context_ready when the existing context is sufficient to define a bounded task with verifiable completion criteria.
3. Return question only when one missing fact would materially change the expected result, permit a high-risk operation, or block an executable task.
4. Ask exactly one focused question about the highest-impact missing fact. Do not repeat known information or ask for optional preferences.
5. Infer a detail instead of asking when the inference is supported by context, low risk, and later verifiable or reversible.
Output protocol:
Return exactly one JSON object without a Markdown code block or additional text.
The allowed shapes are {"kind":"question","question":"non-empty text"} or {"kind":"context_ready"}.
Do not return a task proposal, Tool request, or execution result.
```

#### `planning@2.njk`

```text
Active Phase Protocol: planning
Decision policy:
1. Use only facts in Conversation and Working Context plus safe inferences supported by them.
2. Define objective as one concrete expected result with its necessary scope and boundaries; do not merely repeat the broad intent.
3. Define completionCriteria as observable evidence that is collectively sufficient to judge the objective complete and obtainable from Conversation, Working Context, or Authorized Tool Observations available in this runtime.
4. If the user explicitly requires evidence that this runtime cannot obtain, preserve it as an external dependency and state that dependency in both completionCriteria and approvalRequest.
5. Unless the user constrained the implementation, do not turn guessed steps or technical choices into mandatory task requirements.
6. Make approvalRequest explicitly ask the user to approve the complete proposed task contract.
Output protocol:
Return exactly one JSON object without a Markdown code block or additional text.
The only allowed shape is {"kind":"task_proposal","task":{"objective":"non-empty text","completionCriteria":["non-empty text"]},"approvalRequest":"non-empty text"}.
Do not return a question, context_ready, Tool request, or execution result.
```

#### `agent-decision@2.njk`

```text
Active Phase Protocol: executing
Decision policy:
1. Read the approved task, completion criteria, checkpoint, previousStep, and pendingAction before choosing the next decision.
2. Treat only recorded Observations as Tool results. Use both success and failure evidence to update the next decision; do not invent unobserved outcomes.
3. Return complete only when every completion criterion has sufficient evidence.
4. Otherwise, if an executable and verifiable next step exists, request one Authorized Tool Action that best reduces the most consequential uncertainty or directly advances a completion criterion.
5. After changing task state, obtain verification evidence proportionate to the change risk before returning complete.
6. Return wait only when progress requires external input or a decision unavailable from the current context.
7. Return fail only when the task cannot be completed under current constraints and no reasonable recovery path remains.
8. Do not return complete, wait, or fail while an executable and verifiable next step remains.
Checkpoint policy:
Every checkpoint must be a cumulative recovery summary of confirmed progress, key evidence, and remaining work.
Cover the current evidence status of each completion criterion, not merely the latest actions.
Output protocol:
Return exactly one JSON object without a Markdown code block or additional text.
For a Tool request, use {"kind":"tool_call","checkpoint":"non-empty cumulative state","action":{"actionId":"stable non-empty ID","toolId":"Authorized Tool ID","input":{}}}; replace input with a JSON object satisfying the selected Tool inputSchema.
For completion, use {"kind":"complete","checkpoint":"non-empty cumulative state","summary":"non-empty implemented result"}.
For an external blocker, use {"kind":"wait","checkpoint":"non-empty cumulative state","reason":"non-empty specific blocker"}.
For an unrecoverable failure, use {"kind":"fail","checkpoint":"non-empty cumulative state","error":"non-empty stable failure reason"}.
Use only Tool IDs listed in Authorized Tool definitions, and wait for the Runtime Observation before judging a requested Action's result.
```

### 6. 不改变 View、Renderer 和响应边界

- `PromptContext` 已包含版本、Phase、Profile 和 Authorized Tools；本功能只让 planning 收到真实 ToolDefinition，不增加 DTO 字段，也不把 Working Context 注入 Nunjucks。
- 请求顺序保持 system → 已裁剪 Conversation → Working Context，Conversation 裁剪和 Goal 持久化语义不变。
- Renderer 继续按 Global Overview → Profile → Phase Protocol → Authorized Tools 确定性组合；本功能只增加已注册资产和 Manifest。
- `PreparationResult` 与 `AgentDecision` 的现有 Schema 完整保留。Prompt 的行为规则属于模型指导，不扩大 Agent 或 Tool 的实际权限。

## Components and Interfaces

### Planning ToolDefinition 输入边界

- Runtime 提取可复用的 `resolveAuthorizedToolDefinitions(goal, registry)`：按 Goal 冻结 Profile 的 `toolIds` 查询 ToolRegistry，只复制已注册 Tool 的 definition；Runner 与 GoalCoordinator 共用该规则，且都不解释 Prompt Bundle 版本。
- `PreparationExecutor.execute` 扩展为 `(goal, tools, control?)`。`tools` 由 Runtime 调用方解析，Executor 不查询 Registry、不决定授权，也不执行 Tool。
- GoalCoordinator 增加可选 `toolRegistry` 依赖，缺省为空 Registry；调用 active planning Executor 前解析 ToolDefinition，gathering_context 仍传空数组，避免扩大该阶段输入。
- `LLMPreparationExecutor` 把调用方传入的 Tools 交给 `buildPreparationRequest`。Agent 在投影前按自身拥有的 Bundle 语义选择输入：仅 v2 planning 使用这些 Tools，v1 和 gathering_context 均使用空数组；未知版本仍交给 Renderer 按现有规则失败。Runtime 因此不需要识别 v1/v2。
- Projector 继续复制、深冻结并按 Tool ID 排序，`PromptContext` 类型不变。
- TUI Composition Root 向 GoalCoordinator 与 Runner 注入同一 ToolRegistry，使 planning 与后续 executing 使用同一能力来源。

该改动只扩展单轮 Preparation 输入，不持久化 ToolDefinition，不修改 Goal、Working Context 或 Snapshot。

### 版本化模板资产

- `packages/agent/src/global-system-prompt/`：新增 v2 Global Overview 文件与资产描述符，保留 v1 描述符。
- `packages/agent/src/preparation-prompt/`：新增 gathering/planning v2 文件与描述符；v1 文件不变。
- `packages/agent/src/step-prompt/`：新增 AgentDecision v2 文件与描述符；v1 文件不变。

新增描述符使用带版本的常量名，现有未带版本常量继续指向 v1，避免隐式改写旧 Manifest。所有新模板 ID 必须与文件名版本一致。

### 默认 Bundle 组合

`packages/agent/src/prompting/default-bundles.ts` 负责：

- 将 v1/v2 模板资产都加入 `DEFAULT_PROMPT_TEMPLATE_ASSETS`，继续在启动期一次性加载和 eager compile。
- 保留 v1 的四 slot Manifest，并建立引用 v2 Global/Phase 与共享 Profile/Tools 的 v2 Manifest。
- 令 `DEFAULT_PROMPT_BUNDLE_MANIFEST` 指向 v2，同时让 `createDefaultPromptBundleRenderer()` 注册 `[v1, v2]`。

对外的 `PromptBundleRenderer`、`PromptBundleManifest` 和 Composition Root 依赖接口不变化。

## Error Handling

- v1 或 v2 资产缺失、语法错误、ID 重复或 Manifest 引用错误时，沿用 `PromptBundleConfigurationError`，并在默认 Renderer 创建阶段失败。
- Goal 引用 v1/v2 以外版本时，沿用 `UnsupportedPromptBundleVersionError`；错误中的 supported versions 应包含 `1` 和 `2`。
- 模板渲染失败继续使用脱敏的 `PromptRenderError`，不得包含 Profile、Conversation、Working Context 或 Tool Schema 原文。
- planning ToolDefinition 解析只返回冻结 Profile 已授权且 Registry 已注册的交集；Registry 查询或 definition 复制异常发生在 LLM 调用前并原样传播，不追加消息或保存新的工作流状态。Runner 对相同解析异常继续维持现有执行错误归类。v1 即使收到调用方传入的 Tools，也必须在请求投影时丢弃它们，保持原有空 Tools 渲染。
- 模型不遵守新增行为指导但返回了合法 JSON 时，现有运行边界不会把质量问题误判为协议错误；本功能通过 Prompt 契约测试降低该风险，不引入自动重试或响应修复。

## Testing Strategy

### Prompt Bundle 契约测试

- 固定 v1 三个 Phase 的完整期望字符串；为 v1 planning 传入非空 ToolDefinition 后仍断言空 Tools 输出，证明新增版本后 v1 字符内容与 fragment 顺序不变（需求 1.2、7.1）。
- 固定 v2 三个 Phase 的完整期望字符串，证明 Global/Profile/当前 Phase/Tools 的组合顺序、LF 与无结尾换行保持确定（需求 1.3、2）。
- 断言 v2 每个 Phase 只包含自身行为契约，并覆盖最小必要追问、可用 Observation 能力、外部证据依赖、逐项 completion criterion 证据状态、checkpoint 和终止条件的关键命题（需求 3–7）。
- 断言空 Instructions、空 Tools、模板注册顺序变化及 Nunjucks 数据不二次执行的现有行为对 v2 仍成立。

### 版本与入口测试

- 断言 `CURRENT_PROMPT_BUNDLE_VERSION === 2`，默认 v2 Manifest 的版本及模板映射正确。
- 用默认 Renderer 分别渲染 v1 与 v2，证明版本选择互不串用；未知版本仍在 Adapter 调用前失败且报告 `[1, 2]`。
- 覆盖 Composition Root 创建的新 Goal 冻结 v2，以及恢复的 v1 Goal 仍能完成 Preparation/Executing 请求构造。
- 覆盖 ToolDefinition 解析的 Profile 白名单、未注册过滤、definition 复制和确定性投影；断言 gathering_context 投影为空，v2 planning 与 executing 投影同一授权集合，v1 planning 即使调用方传入 Tools 也投影为空。
- 覆盖 GoalCoordinator → PreparationExecutor → `buildPreparationRequest` 的 Tools 传递，并证明解析失败时不会调用 LLM、追加消息或保存新状态。

### 回归验证

- 运行 Agent Prompt、Renderer、Preparation Executor 与 Step Executor 测试。
- 运行 Runtime、Storage 与 TUI 相关测试，确认版本提升与 planning Tool 输入未改变 Workflow 或 Snapshot v5 行为；同步更新 Agent、Runtime 与 TUI 架构说明中的单轮数据流和所有权边界。
- 运行 TypeScript 类型检查、依赖边界检查与 `git diff --check`。

# Model Output Contracts 需求

## 审批摘要

### 目标

以 `@lazygoal/contracts` 中的 Contract 声明作为模型结构化输出的唯一结构事实源，由同一声明派生 TypeScript 类型、本地校验、Provider 严格 Schema 和 Prompt-only Shape Guide，消除 Agent、Runtime 与 LLM Adapter 之间的协议漂移。

### 范围

- 包含：覆盖 gathering、planning、executing 和 checkpoint 四类模型请求，统一 `PreparationResult` 与 `AgentDecision` 的模型 wire 契约和 Runtime canonical 契约；OpenAI-compatible 与 Gemini Adapter 支持严格模式，TUI 与 benchmark 仍只装配 OpenAI-compatible Adapter。
- 不包含：不重新定义或迁移 Tool Input Contract、Tool output、持久化协议或 Storage Schema；本特性只消费已授权 Tool 的 Input Contract，Storage 继续使用现有 Zod 校验。

### 核心行为

- 所有模型结构化响应统一使用严格 `{"result": ...}` envelope；所选联合分支内的字段递归必填，语义上无值的字段显式使用 `null`。
- Executing 的 `tool_call` wire 分支按本轮已授权 Tool 动态生成：`toolId` 与对应 Input Contract 必须匹配；没有授权 Tool 时不允许返回 `tool_call`。
- Agent 在本地校验 wire 响应后执行确定性 wire-to-canonical 映射：移除 envelope，将 nullable 缺省值还原为现有可选字段，且不将 envelope 或占位 `null` 写入 Goal 或 Snapshot。
- 每类请求只接受当前阶段授权的结果分支，checkpoint required 时只接受 `context_checkpoint`；Fact value 只接受标量或一维标量数组。
- 每个 LLM Adapter 实例必须显式固定为 `strict` 或 `prompt_only`；TUI 与 benchmark 从 `LLM_STRUCTURED_OUTPUT_MODE` 读取该值并对缺失或非法配置 fail-fast。前者使用 Provider 原生结构化输出，后者仅使用由同一 Contract 生成的确定性 Shape Guide。
- 两种模式都必须在 Agent 边界再次执行本地 Contract 校验；模型文本只接受裸 JSON 或完整 JSON fenced code block，不从任意正文提取 JSON；失败时单次调用终止，不自动修复、降级、重试或切换模式。
- Runtime 对可替换 Executor 输出执行 canonical Contract 校验，同时继续独立强制阶段准入、Evidence、Memory Patch 与 Context Lookup 语义规则。

### 风险与待确认

- 风险：实施以 `contract-dsl-core` 和 `tool-input-contracts` 完成实现为前置，不得在本特性中复制 DSL 或 Tool 输入结构；Provider 对 JSON Schema 的支持不完全一致，因此模型 wire 契约必须限制在 OpenAI-compatible 与 Gemini 的共同可移植子集内。
- 风险：当前 `structured@1` 和 Prompt Bundle v1 会原地更新，旧的无 envelope 响应不保留兼容路径。
- 待确认：无。

## 引言

当前模型结构化输出同时依赖 Agent Zod Schema、Runtime 手写结构校验和 Prompt 格式说明，且 LLM Adapter 未共享同一份可机读契约。本特性将模型 wire 形状、Provider 结构约束和本地校验收敛到同一 Contract 声明，同时保持 Runtime 对领域语义和持久化边界的现有所有权。

## 需求

### 需求 1：单一模型输出契约

**用户故事：** 作为协议维护者，我希望每类模型输出只有一份结构声明，以便类型、校验、Provider Schema 和 Prompt 说明不再独立演化。

#### 验收标准

1. <a id="req-1-1"></a> 当系统处理 gathering、planning、executing 或 checkpoint 模型请求时，每类 wire Contract 必须从共享 canonical Contract 与当前请求的已授权 Tool Input Contract 确定性派生，并由该 wire Contract 派生 wire 类型、本地校验、严格 JSON Schema 和 Prompt-only Shape Guide。
2. <a id="req-1-2"></a> 当 Agent 或 Runtime 消费 `PreparationResult` 或 `AgentDecision` 时，系统必须从共享的 canonical Contract 获取其类型与结构校验规则。
3. <a id="req-1-3"></a> 当本特性完成时，Agent 生产代码不得再依赖 Zod，也不得为同一模型输出维护平行的手写结构 Schema。

### 需求 2：统一 wire envelope 与 nullable 形状

**用户故事：** 作为模型输出消费者，我希望所有响应具有统一且严格的 wire 形状，以便不同 Provider 产生的数据能够以相同方式解析。

#### 验收标准

1. <a id="req-2-1"></a> 当模型返回结构化响应时，顶层对象必须仅包含必填的 `result` 字段，且该字段必须匹配当前请求允许的结果分支。
2. <a id="req-2-2"></a> 当所选结果分支包含语义上可缺省的字段时，该分支内的每个对象属性必须递归出现，并以 `null` 表示无值；其他联合分支专属字段不得被混入当前分支。
3. <a id="req-2-3"></a> 当响应缺少必填字段、包含未声明字段、使用错误类型或在不允许的位置使用 `null` 时，系统必须拒绝该响应。
4. <a id="req-2-4"></a> 当 wire 响应通过校验时，Agent 必须确定性移除 `result` envelope，并将可空缺省值还原为当前 canonical 类型的可选字段，不得修改其他合法值。
5. <a id="req-2-5"></a> 当模型提交 Fact 值时，`value` 必须是字符串、数字、布尔值、`null` 或由这些标量组成的一维数组；对象和嵌套数组必须被拒绝。

### 需求 3：请求与结果分支匹配

**用户故事：** 作为 Goal 工作流维护者，我希望模型只能返回当前请求授权的结果分支，以便阶段边界不会因共享大联合而被放宽。

#### 验收标准

1. <a id="req-3-1"></a> 当普通 gathering 请求需要响应时，系统必须只接受 `question`、`context_ready` 或 `context_lookup` 结果。
2. <a id="req-3-2"></a> 当普通 planning 请求需要响应时，系统必须只接受 `task_proposal` 或 `context_lookup` 结果。
3. <a id="req-3-3"></a> 当普通 executing 请求需要响应时，系统必须只接受 `tool_call`、`complete`、`wait`、`fail` 或 `context_lookup` 结果。
4. <a id="req-3-4"></a> 当请求标记为 checkpoint required 时，系统必须只接受 `context_checkpoint` 结果；未标记的请求必须拒绝该结果。
5. <a id="req-3-5"></a> 当 executing 请求包含已授权 Tool 时，每个 `tool_call` wire 分支必须把 `toolId` 固定为对应 Tool ID，并从该 Tool 的 Input Contract 派生 `action.input` 的 required-nullable wire 形状；映射后的 canonical input 必须符合原 Input Contract，未授权 Tool、Tool ID 与 input 不匹配以及无授权 Tool 时返回 `tool_call` 都必须被拒绝。

### 需求 4：显式且固定的 Provider 模式

**用户故事：** 作为模型 Provider 集成者，我希望结构化输出模式在 Adapter 创建时明确且在运行期稳定，以便同一 Goal 不会在不同契约强度之间隐式切换。

#### 验收标准

1. <a id="req-4-1"></a> 当系统创建模型 Adapter 实例时，必须显式指定 `strict` 或 `prompt_only`；TUI 和 benchmark 必须从 `LLM_STRUCTURED_OUTPUT_MODE` 读取该选择，缺少或使用非法值时必须在首次模型请求前失败。
2. <a id="req-4-2"></a> 当 Adapter 实例已创建时，其结构化输出模式必须在该实例生命周期内保持不变，不得根据模型名称、单次响应或运行错误自动切换。
3. <a id="req-4-3"></a> 当 OpenAI-compatible 或 Gemini Adapter 以 `strict` 模式发送请求时，必须通过对应 Provider 的原生参数传递由当前 Contract 生成的结构 Schema；除通用编译器统一省略元数据外，Adapter 不得按 Provider 改写或放宽该 Schema。
4. <a id="req-4-4"></a> 当模型输出 Contract 使用超出 OpenAI-compatible 与 Gemini 共同可移植子集的结构，或 Provider 拒绝原生结构化输出请求时，系统必须使当前请求失败，不得降级为 `prompt_only` 或触发隐式重试。

### 需求 5：Prompt-only 指引与统一本地校验

**用户故事：** 作为不具备原生结构化输出能力的模型使用者，我希望系统仍能给出稳定的响应形状指引并严格校验结果，以便不会因 Provider 能力不同而放宽协议。

#### 验收标准

1. <a id="req-5-1"></a> 当 Adapter 以 `prompt_only` 模式生成请求时，系统必须将由当前 Contract 生成的紧凑、确定性 Shape Guide 纳入当前阶段的稳定 Prompt；相同 Contract 必须产生逐字相同的指引。
2. <a id="req-5-2"></a> 当 Adapter 以 `prompt_only` 模式发送请求时，请求不得包含 Provider 原生结构 Schema 参数。
3. <a id="req-5-3"></a> 当任一模式收到模型响应时，Agent 必须先使用当前请求的 Contract 校验原始 JSON 值，通过后才能转换为 canonical 结果；非空字符串必须在不改变原文的前提下校验，系统不得执行 trim、coerce 或 default。
4. <a id="req-5-4"></a> 当模型响应既不是裸 JSON、也不是只包裹一个完整 JSON 值的 fenced code block，或其 JSON 值不符合 Contract 时，系统必须返回稳定的 `INVALID_LLM_RESPONSE` 并保留可定位的 issue path，不得提取任意正文中的 JSON，也不得为该请求自动发起修复调用、重试或模式降级。

### 需求 6：Runtime canonical 信任边界

**用户故事：** 作为 Runtime 边界维护者，我希望可替换 Executor 的输出也经过统一结构校验，以便非 LLM 实现不能绕过 Runtime 的安全边界。

#### 验收标准

1. <a id="req-6-1"></a> 当 Preparation Executor 或 Step Executor 返回 canonical 结果时，Runtime 必须使用共享的 `PreparationResult` 或 `AgentDecision` Contract 验证其结构，不得仅信任 TypeScript 类型。
2. <a id="req-6-2"></a> 当可替换 Executor 返回结构不合法的结果时，Runtime 必须在改变 Goal 状态、执行 Tool、提交 Trajectory 或保存 Snapshot 前失败。
3. <a id="req-6-3"></a> 当 canonical 结果通过结构校验时，Runtime 必须继续执行现有的阶段准入、Evidence scope、Memory Patch、Context Lookup、Tool 授权和完成证明语义校验。
4. <a id="req-6-4"></a> 当合法结果被 Runtime 接受时，本特性不得改变单轮模型调用数、Goal 状态转换、Trajectory 与 Snapshot 提交顺序或恢复语义。

### 需求 7：开发期协议更新与范围隔离

**用户故事：** 作为 LazyGoal 维护者，我希望模型输出契约在开发期一次性收敛，以便不为未发布的旧格式保留平行协议或扩大迁移范围。

#### 验收标准

1. <a id="req-7-1"></a> 当本特性上线时，系统必须原地更新当前 `structured@1` 和 Prompt Bundle v1，不得仅因本次开发期格式收敛而增加新版本或兼容分支。
2. <a id="req-7-2"></a> 当系统收到旧的无 `result` envelope 模型响应时，必须按当前协议拒绝，不得回退到旧解析路径。
3. <a id="req-7-3"></a> 当 wire 结果映射为 canonical 结果并进入 Runtime 时，现有 Goal、Snapshot、Trajectory、Profile、Sidecar 和 Diagnostic Trace 协议形状必须保持不变，且不得持久化 wire envelope 或占位 `null`。
4. <a id="req-7-4"></a> 当本特性完成时，系统只能消费 `tool-input-contracts` 提供的 Input Contract，不得在模型输出层重新声明、迁移或放宽 Tool 输入结构；Storage 的现有 Zod 校验必须保持不变。
5. <a id="req-7-5"></a> 当 TUI 或 benchmark 装配模型 Provider 时，系统必须继续使用 OpenAI-compatible Adapter；Gemini Adapter 必须支持直接集成和契约测试，但不得在本特性中新增 CLI 选择或装配路径。

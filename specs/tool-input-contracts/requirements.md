# Tool Input Contracts 需求

## 审批摘要

### 目标

以 `@lazygoal/contracts` 中的不可变 Contract 作为 Tool 输入结构的唯一事实源，由同一声明派生 TypeScript 输入类型、本地结构校验和确定性 JSON Schema，消除手写 `inputSchema`、类型与字段解析之间的重复。

### 范围

- 包含：迁移 Bash、Read File、Write File、Edit File、Grep 五个通用 Tool，以及两个现有 ALFWorld benchmark Tool；更新 Runtime 校验边界和 Agent 的授权 Tool Schema 投影。
- 不包含：模型响应 envelope、Provider strict/prompt-only 模式、`AgentDecision` 或 `PreparationResult` 迁移、Tool 输出契约、持久化协议及其版本和新 Tool 功能。

### 核心行为

- 每个 Tool 必须公开唯一 Input Contract；输入类型、本地结构解析和展示给模型的 JSON Schema 均从它派生。
- Runtime 在输入进入 Tool Policy、新的 pending Action 或 Tool 执行前完成 Contract 解析；结构失败继续使用 `INVALID_TOOL_INPUT` 且不产生 Tool 副作用。
- Contract 只负责结构和可移植约束；跨字段关系、正则可编译性、Workspace 边界等领域规则仍由 Tool 在结构解析后校验。
- 每次执行尝试对同一输入最多做一次 Contract 解析；语义校验与 Tool 执行只接收不经 trim、coerce 或 default 的隔离副本，不再重复解析原始 JSON。
- Tool 授权、Policy、审批、重放、中止、Observation 和现有合法输入的执行结果保持不变；恢复中的每次新尝试仍须重新校验已持久化输入。
- `ToolDefinition.inputSchema` 在开发期直接替换为 Input Contract，不保留兼容字段或 wrapper；仓库内现有 Tool 实现和测试替身必须一次性迁移。

### 风险与待确认

- 风险：这是开发期 Tool 公共接口的破坏性更改，仓库外的自定义 Tool 也需要改为 Input Contract；实施以完成 `contract-dsl-core` 为前置，不得在 Runtime 或 Tools 中复制 DSL。
- 待确认：无。

## 引言

当前 Tool 输入结构同时存在于 `ToolDefinition.inputSchema`、手写 TypeScript 类型和私有字段解析中，Runtime 校验后 Tool 执行路径还会再次解析同一输入。本特性将这些结构义务收敛到 Input Contract，同时保留 Tool 对领域语义、执行副作用和 Observation 的现有所有权。

## 需求

### 需求 1：单一 Tool 输入结构声明

**用户故事：** 作为 Tool 实现者，我希望只声明一次输入结构，以便类型、校验和模型可见 Schema 不会独立演化。

#### 验收标准

1. <a id="req-1-1"></a> 当 Tool 向 Runtime 注册时，其定义必须包含唯一、不可变的 Input Contract，作为该 Tool 输入 JSON 结构的规范来源。
2. <a id="req-1-2"></a> 当 Tool 实现和其他消费者使用 Input Contract 时，系统必须从它派生只读 TypeScript 输入类型、本地结构解析和确定性 JSON Schema。
3. <a id="req-1-3"></a> 当本特性完成时，任一现有 Tool 实现不得再维护手写 `inputSchema`、重复的输入字段类型或与 Contract 平行的结构解析器。
4. <a id="req-1-4"></a> 当相同 Input Contract 被重复导出时，其 JSON Schema 必须在结构、字段顺序和约束上保持一致，并与本地 Contract 对受支持结构的接受或拒绝结论一致。

### 需求 2：不可信 Tool 输入的统一解析边界

**用户故事：** 作为 Runtime 维护者，我希望所有未知 Action 输入先经过相应 Tool 的 Contract 解析，以便后续决策和执行只处理已验证数据。

#### 验收标准

1. <a id="req-2-1"></a> 当新的 `tool_call` Action 已通过 Profile 授权且在 Registry 中找到对应 Tool 时，Runtime 必须在调用 Tool Policy、保存 pending Action 或执行 Tool 前使用该 Tool 的 Input Contract 解析 Action input。
2. <a id="req-2-2"></a> 当 Action input 缺少必填字段、包含未声明字段或使用错误的 JSON 类型时，Runtime 必须以 `INVALID_TOOL_INPUT` 拒绝该 Action，且不得调用 Tool Policy、保存新的 pending Action 或产生 Tool 执行副作用。
3. <a id="req-2-3"></a> 当 Action input 通过 Contract 解析时，后续消费者必须接收与原始输入引用隔离的解析结果，原始对象的后续修改不得改变已验证输入。
4. <a id="req-2-4"></a> 当 Action input 需要 trim、类型转换或默认值才符合 Contract 时，系统必须保持原值并拒绝不合法输入，不得执行静默规范化。

### 需求 3：结构校验与 Tool 语义分离

**用户故事：** 作为 Tool 实现者，我希望在已解析的输入上只编写领域规则，以便不再手写字段存在性和 JSON 类型检查。

#### 验收标准

1. <a id="req-3-1"></a> 当 Input Contract 成功解析 Action input 时，Tool 的语义校验和执行入口必须仅接收由该 Contract 推导的已解析输入类型。
2. <a id="req-3-2"></a> 当输入包含跨字段关系、正则可编译性、Workspace 路径或其他需要 Tool 领域知识的规则时，系统必须在 Contract 结构解析后继续执行相应语义校验。
3. <a id="req-3-3"></a> 当已解析输入不符合 Tool 语义规则时，系统必须继续以 `INVALID_TOOL_INPUT` 拒绝该 Action，且不得执行 Tool 副作用。
4. <a id="req-3-4"></a> 当同一 Action 输入进入一次执行尝试时，系统必须最多执行一次 Contract 解析；语义校验和 Tool 执行不得再次解析原始 JSON。

### 需求 4：现有 Tool 与模型可见 Schema 迁移

**用户故事：** 作为 LazyGoal 使用者，我希望现有 Tool 换用 Input Contract 后仍接受相同的有效输入并向模型展示相同能力，以便迁移不改变已有任务行为。

#### 验收标准

1. <a id="req-4-1"></a> 当本特性完成时，Bash、Read File、Write File、Edit File、Grep、ALFWorld Reset 和 ALFWorld Step 必须全部使用 Input Contract 声明其输入结构。
2. <a id="req-4-2"></a> 当这些 Tool 收到当前合法的 canonical 输入时，字段名、必填性、可选性和有效值范围必须保持不变；可选字段不得被改为必填 `null` 字段。
3. <a id="req-4-3"></a> 当 Agent 投影已授权 Tool 供模型消费时，其 `inputSchema` 必须由 Input Contract 确定性导出，并保持当前字段与可选语义。
4. <a id="req-4-4"></a> 当后续模型输出契约组合当前仓库 Tool 时，这些 Input Contract 必须能够在不引入开放 record、递归引用或其他非可移植结构的前提下，派生严格的模型 wire 输入形状。

### 需求 5：Tool 生命周期与恢复语义不变

**用户故事：** 作为可恢复任务的使用者，我希望输入契约迁移不改变 Tool 授权、执行和重放边界，以便现有 Goal 仍按同一安全流程推进。

#### 验收标准

1. <a id="req-5-1"></a> 当 Runtime 处理 Tool Action 时，Profile 白名单、Registry 查找、Tool Policy 与用户审批的先后关系必须保持不变，Contract 校验不得代替授权或 Policy 决策。
2. <a id="req-5-2"></a> 当 Runtime 恢复已持久化的 pending Action 时，必须在每次新的恢复尝试中重新使用当前 Tool Contract 校验输入，并继续遵守该 Tool 的 `safe` 或 `manual` replay policy。
3. <a id="req-5-3"></a> 当 Tool 成功执行或返回领域失败时，Action、`tool_started`、Observation 和 Snapshot 的现有数据形状、提交顺序与恢复含义必须保持不变。
4. <a id="req-5-4"></a> 当 Tool 校验或执行期间的中止信号已触发时，系统必须继续传播 `ExecutionAbortedError`，不得将中止转换为 `INVALID_TOOL_INPUT` 或 Observation。

### 需求 6：开发期 API 收敛与范围隔离

**用户故事：** 作为 LazyGoal 维护者，我希望 Tool 输入接口在开发期一次性收敛，以便不积累平行字段、适配器或旧版本协议。

#### 验收标准

1. <a id="req-6-1"></a> 当本特性完成时，`ToolDefinition` 必须用 Input Contract 取代手写 `inputSchema`，不得保留 deprecated 字段、兼容 wrapper 或从旧 Schema 到 Contract 的运行时转换器。
2. <a id="req-6-2"></a> 当仓库内的 Tool 实现、组合根、fixture 或测试替身实现当前 Tool 接口时，它们必须直接使用新 Contract 接口，不得依赖兼容路径。
3. <a id="req-6-3"></a> 当本特性完成时，模型响应格式、Provider 请求、`AgentDecision`、`PreparationResult`、Tool Observation 和持久化数据契约必须保持不变。
4. <a id="req-6-4"></a> 当 Tool 输入接口从手写 Schema 切换到 Contract 时，系统不得仅因本次开发期更改而升级 Snapshot、Trajectory、Prompt Bundle 或其他持久化协议版本。

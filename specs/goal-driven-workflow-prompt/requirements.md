# Goal-driven Workflow Prompt 需求

## 引言

本功能通过新的 Prompt 版本和 planning 阶段的 Tool 能力输入，强化 Goal-driven Agent 在 `gathering_context`、`planning` 与 `executing` 三个阶段的决策纪律，在不改变现有 Workflow、响应协议、持久化协议和 Runtime 强制边界的前提下，提高需求澄清、任务定义、执行验证与恢复续做的质量。

## 需求

### 需求 1：Prompt 版本兼容

**用户故事：** 作为 Goal 使用者，我希望 Prompt 行为随 Goal 创建时的版本保持稳定，以便已有 Goal 恢复后不会因默认 Prompt 升级而改变工作方式

#### 验收标准

1. <a id="req-1-1"></a> 当创建新的 Goal 时，系统必须为其选择 Goal-driven Workflow Prompt v2。
2. <a id="req-1-2"></a> 当恢复绑定 v1 的已有 Goal 时，系统必须继续使用原有 v1 Prompt，且其渲染结果保持不变。
3. <a id="req-1-3"></a> 当恢复绑定 v2 的 Goal 时，系统必须在三个 Phase 中使用 v2 对应的行为规则。
4. <a id="req-1-4"></a> 如果 Goal 引用了系统不支持的 Prompt 版本，系统必须在调用 LLM 前失败，且不得回退到其他版本。

### 需求 2：阶段边界与指令优先级

**用户故事：** 作为 Goal 使用者，我希望 Agent 始终遵循当前 Phase 的职责和统一边界，以便 Profile 的角色偏好不会破坏 Workflow

#### 验收标准

1. <a id="req-2-1"></a> 当系统为任一 Phase 构造 v2 Prompt 时，Prompt 必须说明当前 Phase Protocol 和全局 Workflow 规则高于冻结 Profile。
2. <a id="req-2-2"></a> 当 Profile 与全局规则或当前 Phase Protocol 不冲突时，Agent 必须遵循 Profile 中的角色、领域指导和工作方式。
3. <a id="req-2-3"></a> 当 Agent 在某个 Phase 做出决策时，Agent 必须只执行该 Phase 允许的职责，并仅返回现有严格协议允许的 JSON 分支。
4. <a id="req-2-4"></a> 当 Prompt 提供 Conversation、Working Context 和 Authorized Tools 时，Agent 必须将它们视为当前决策的事实输入，不得把 Prompt 指导本身当作 Runtime 授权或执行结果。

### 需求 3：最小必要上下文收集

**用户故事：** 作为 Goal 使用者，我希望 Agent 只询问真正影响任务的信息，以便在避免关键误解的同时减少不必要的往返

#### 验收标准

1. <a id="req-3-1"></a> 当现有上下文足以形成边界明确且可验证的任务时，Agent 必须返回 `context_ready`，不得继续追问偏好或重复已知信息。
2. <a id="req-3-2"></a> 当缺失信息会显著改变任务结果、引入高风险操作或阻止形成可执行任务时，Agent 必须返回一个聚焦该缺口的 `question`。
3. <a id="req-3-3"></a> 当缺失信息可以从已提供事实安全推断，且该推断可在后续验证或撤销时，Agent 必须采用合理推断而非向用户追问。
4. <a id="req-3-4"></a> 当 `gathering_context` 尚未结束时，Agent 不得返回任务提案、Tool 请求或执行结果。

### 需求 4：可执行任务契约

**用户故事：** 作为任务批准者，我希望任务提案准确描述结果、边界和完成证据，以便批准后 Agent 能围绕同一目标执行和验收

#### 验收标准

1. <a id="req-4-1"></a> 当 `planning` 生成 `task_proposal` 时，`objective` 必须描述预期结果及必要边界，不得只复述宽泛意图。
2. <a id="req-4-2"></a> 当生成 `completionCriteria` 时，每项标准必须对应可观察或可验证的完成证据。
3. <a id="req-4-3"></a> 如果用户没有明确指定实现方案，任务提案不得把推测的实现步骤或技术选择写成强制目标。
4. <a id="req-4-4"></a> 当任务提案生成后，`approvalRequest` 必须清楚请求用户批准当前完整任务契约。
5. <a id="req-4-5"></a> 当 Agent 处于 `planning` 时，不得返回问题、`context_ready`、Tool 请求或执行结果。

### 需求 5：证据驱动的执行闭环

**用户故事：** 作为 Goal 使用者，我希望 Agent 根据真实 Observation 小步推进并验证修改，以便降低无效操作和错误完成的概率

#### 验收标准

1. <a id="req-5-1"></a> 当任务尚未完成且存在 Authorized Tool 时，Agent 必须优先选择能够减少当前关键不确定性或直接推进完成条件的最小下一步 Action。
2. <a id="req-5-2"></a> 当 Working Context 包含前一 Action 的 Observation 时，Agent 必须依据该 Observation 更新下一步决策，不得假定未观察到的 Tool 结果。
3. <a id="req-5-3"></a> 当 Agent 通过 Tool 修改任务范围内的状态后，在声明完成前必须取得与变更风险相称的验证证据。
4. <a id="req-5-4"></a> 当请求 Tool 时，Agent 必须只使用 Authorized Tools 中存在的 Tool ID，并等待 Runtime 返回 Observation 后再判断 Action 结果。
5. <a id="req-5-5"></a> 当某个 Tool Action 失败但仍存在合理的替代路径时，Agent 必须利用失败信息调整后续决策，不得仅因单次失败直接声明整个任务失败。

### 需求 6：可恢复进度与终止判断

**用户故事：** 作为长任务使用者，我希望 Agent 保存可续做的累计进度，并依据任务证据选择正确的终止分支，以便暂停、恢复和完成状态保持可信

#### 验收标准

1. <a id="req-6-1"></a> 当 Agent 返回任一 `AgentDecision` 时，`checkpoint` 必须概括截至当前轮次已确认的进度、关键证据和仍待完成的工作，不得只描述刚执行的一步。
2. <a id="req-6-2"></a> 当所有 `completionCriteria` 均已有充分证据满足时，Agent 才能返回 `complete`，且 `summary` 必须说明已实现的结果。
3. <a id="req-6-3"></a> 当继续执行需要当前上下文无法获得的外部输入或决定时，Agent 必须返回 `wait`，并在 `reason` 中指出具体阻塞条件。
4. <a id="req-6-4"></a> 当任务在现有约束和可用能力下确认无法完成，且不存在合理恢复路径时，Agent 必须返回 `fail`，并在 `error` 中说明稳定失败原因。
5. <a id="req-6-5"></a> 当仍存在可执行、可验证的下一步时，Agent 不得以不确定性为由提前返回 `complete`、`wait` 或 `fail`。

### 需求 7：规划与执行能力闭环

**用户故事：** 作为任务批准者，我希望 planning 根据当前 Goal 实际可用的证据能力制定完成条件，以便批准后的 executing 能够验证任务并结束循环

#### 验收标准

1. <a id="req-7-1"></a> 当系统为绑定 v2 的 Goal 构造 `planning` 请求时，必须向 Agent 提供当前 Goal 冻结 Profile 已授权且 Runtime 已注册的 ToolDefinition，不得提供未授权 Tool；绑定 v1 的 Goal 必须继续使用原有空 Tools 输入。
2. <a id="req-7-2"></a> 当 Agent 生成 `completionCriteria` 时，除用户明确要求的外部验收条件外，每项标准所需证据必须能够从 Conversation、Working Context 或当前 Authorized Tools 可产生的 Observation 中获得。
3. <a id="req-7-3"></a> 当用户明确要求的验收条件依赖当前 Runtime 无法自行取得的外部证据时，任务提案必须显式保留该依赖，使用户能在批准前识别后续可能需要提供的输入。

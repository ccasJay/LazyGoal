# Preparation Runtime Flow 需求

## 引言

本功能规范 Preparation → Runtime → Executing 之间的结构化数据边界：Preparation 只输出受约束的阶段结果、任务提案和 Memory 增量，Runtime 负责校验、规范化与提交，Executing 只消费已提交 Trajectory 重建出的 Working Memory，并通过当前未发布的 v1 Prompt 契约表达这些限制。

## 需求

### 需求 1：Preparation 结果边界

**用户故事：** 作为 Runtime 维护者，我希望 Preparation 结果只表达阶段所需的结构化信息，以便原始模型响应不会成为 Runtime 的平行状态来源。

#### 验收标准

1. <a id="req-1-1"></a> 当 Preparation 返回 `question`、`context_ready`、`context_lookup`、`task_proposal` 或 `context_checkpoint` 时，系统必须只依据 `kind` 推进对应的 Preparation 工作流分支。
2. <a id="req-1-2"></a> 当 Preparation 返回 `task_proposal` 时，系统必须将 `task` 和 `approvalRequest` 保留为待批准提案，只有收到显式批准后才能将该任务作为最终 `GoalTask` 交给 Executing。
3. <a id="req-1-3"></a> 当 Preparation 返回 `memoryPatch` 时，系统必须把它视为待校验的结构化增量，不得直接将其视为当前 Working Memory 或持久化结果。
4. <a id="req-1-4"></a> 当模型响应被记录为领域状态或领域事件时，系统不得保存完整的原始 Preparation 响应，也不得新增 `goal.state.preparationResult`。

### 需求 2：Working Memory 分类与阶段准入

**用户故事：** 作为模型调用者，我希望 Working Memory 的条目类别和阶段权限明确，以便上下文中的事实、判断、执行步骤和阻塞依赖不会互相混淆。

#### 验收标准

1. <a id="req-2-1"></a> 当系统生成 Working Memory 时，当前投影必须只包含 `fact`、`hypothesis`、`plan` 和 `blocker` 四类条目。
2. <a id="req-2-2"></a> 当 Goal 处于 `gathering_context` 时，系统必须允许 Fact、Hypothesis 和 Blocker 的结构化增量，并拒绝任何 PlanItem 创建或更新操作。
3. <a id="req-2-3"></a> 当 Goal 处于 `planning` 时，系统必须允许创建或更新 PlanItem；当 Goal 处于 `executing` 时，系统只能更新已有 PlanItem，不得创建新的 PlanItem。
4. <a id="req-2-4"></a> 当一个 Patch 包含当前阶段不允许的操作时，系统必须拒绝整个 Patch，且不得写入 `memory_patch_accepted` 或改变当前 Working Memory。

### 需求 3：Memory Patch 证据与规范化

**用户故事：** 作为 Runtime 维护者，我希望所有 Memory Patch 都经过统一证据校验和规范化，以便连续执行与恢复重建得到相同的语义状态。

#### 验收标准

1. <a id="req-3-1"></a> 当系统接受 Preparation Patch 时，系统必须先校验 Patch 结构、当前条目引用、阶段准入和 Evidence，再生成规范化的 canonical operations。
2. <a id="req-3-2"></a> 当 Fact 被创建、更新或失效时，系统必须保留其规范化身份、值、稳定性、来源范围和合法 evidence sequences。
3. <a id="req-3-3"></a> 当 PlanItem 进入 `completed` 时，系统必须要求其 completion evidence 指向 committed Observation 或 Tool 事件。
4. <a id="req-3-4"></a> 当模型、Runtime lifecycle 或 Tool Projector 的 Patch 被接受时，系统必须通过同一 canonicalization 和提交边界处理，不能由模型直接分配不可验证的 Runtime 字段。

### 需求 4：Preparation 用户输入 Provenance

**用户故事：** 作为 Preparation 模型，我希望能够引用已提交的用户约束来源，以便把明确的用户要求保存为 Fact，同时不把用户原文重复写入 Trajectory。

#### 验收标准

1. <a id="req-4-1"></a> 当初始 Goal intent 或 Preparation 阶段的用户消息被记录为可引用输入时，系统必须追加 `preparation_input_recorded` 事件，并且该事件只能包含 `messageIndex` 与 `contentHash` 等 provenance 信息，不得包含消息原文。
2. <a id="req-4-2"></a> 当系统恢复 Preparation provenance 时，系统必须确认 `messageIndex` 指向 Snapshot 中的 user 消息，并确认其内容 hash 与事件记录一致；任一检查失败时必须 fail-closed。
3. <a id="req-4-3"></a> 当 Preparation Fact 描述明确的用户约束时，系统必须允许它引用匹配的 `preparation_input_recorded` sequence；Conversation 中没有匹配 provenance 的内容不得单独成为 Fact evidence。
4. <a id="req-4-4"></a> 当 Fact 声明环境、Workspace、验证或完成状态时，系统必须要求对应的 Tool Observation evidence，不得使用 `preparation_input_recorded` 替代。
5. <a id="req-4-5"></a> 当系统校验 Plan completion evidence 或 Executing Fact/Completion evidence 时，系统必须拒绝 `preparation_input_recorded` sequence。

### 需求 5：提交边界与 Working Memory 恢复

**用户故事：** 作为可恢复 Goal 的使用者，我希望已接受的 Memory 增量只在 Snapshot 提交后生效，以便 Preparation、Runtime 和 Executing 在中断恢复后保持一致。

#### 验收标准

1. <a id="req-5-1"></a> 当结构化 Memory Patch 通过校验和规范化后，系统必须先记录 `memory_patch_accepted`，并且只有成功保存 Snapshot 后才能把该 Patch 纳入 committed boundary。
2. <a id="req-5-2"></a> 当 Working Memory 被重新打开时，系统必须只从 committed Trajectory 中可达的 accepted Patch 链重建，不得从未提交 tail 或原始 PreparationResult 恢复。
3. <a id="req-5-3"></a> 当 Goal 进入 Executing 后，StepExecutor 必须获得从 Trajectory 恢复的 Working Memory 和最终批准任务，不得直接消费 PreparationResult。
4. <a id="req-5-4"></a> 当恢复过程中发现 accepted Patch、revision、provenance 或 committed boundary 不一致时，系统必须停止继续模型调用并返回稳定的恢复错误。

### 需求 6：模型输入中的原始消息索引

**用户故事：** 作为 Preparation 模型，我希望 provenance 在 Conversation 被裁剪后仍能定位原始用户消息，以便证据引用不会因上下文压缩而指向错误内容。

#### 验收标准

1. <a id="req-6-1"></a> 当 Goal Conversation 被投影为模型输入时，系统必须保留每条消息对应的原始 Goal message index，并保持 user/assistant 顺序。
2. <a id="req-6-2"></a> 当 Conversation 经过完整单元裁剪或其他模型上下文整理时，系统必须保留保留消息的原始 index，不得将裁剪后的数组位置误当作 Goal message index。
3. <a id="req-6-3"></a> 当 Preparation 请求生成 Working Context 时，系统必须提供不含消息正文的 `visibleConversationMessageMap`，用于关联可见位置与原始 message index。
4. <a id="req-6-4"></a> 当某个 provenance 对应的原始消息不在当前可见 Conversation 映射中时，模型不得直接使用该 provenance 作为本轮 Fact evidence。

### 需求 7：Prompt Bundle v1 契约

**用户故事：** 作为 Prompt 维护者，我希望当前 v1 Prompt 明确表达新的数据与证据边界，以便模型不会因旧文案而生成非法 Patch 或错误完成证明。

#### 验收标准

1. <a id="req-7-1"></a> 在确认 Prompt Bundle v1 尚未对外发布的前提下，当新请求使用当前默认 Bundle 时，系统必须继续使用 v1、`structured@1`、`trajectory-layered@1` 与 `bm25-lite@1`，不得新增版本迁移或隐式回退。
2. <a id="req-7-2"></a> 当 Preparation Prompt 描述 Fact evidence 时，系统必须明确只有匹配的 `preparation_input_recorded` provenance 能支持用户约束 Fact，Conversation 本身不是通用 Fact evidence。
3. <a id="req-7-3"></a> 当 Executing Prompt 描述完成和环境证据时，系统必须明确要求 committed Tool Observation，并明确禁止使用 Preparation provenance 证明 Plan 或 Executing 完成。

### 需求 8：Provenance Tail 失败边界

**用户故事：** 作为 Runtime 维护者，我希望 Snapshot 保存失败后不会错误吸收与消息状态不一致的 provenance tail，以便恢复时不会把伪造或错配的用户约束当作已提交事实。

#### 验收标准

1. <a id="req-8-1"></a> 当提交前发现未提交 tail 中存在 `preparation_input_recorded` 时，系统必须验证其 Goal/Run、message index、user 角色和 content hash 是否与候选 Snapshot 一致。
2. <a id="req-8-2"></a> 当 provenance tail 的任一校验失败时，系统必须在保存 Snapshot 或继续下游调用前 fail-closed；当全部 provenance tail 与候选 Snapshot 完全匹配时，系统必须允许现有提交流程继续，且不得改变现有普通执行 tail 的处理语义。

---
status: proposed
created_at: 2026-10-15
supersedes: []
superseded_by: null
---

# 自适应 Run 阶段路线与活动组 Spec

## 目标与范围

Plan Run 根据用户请求自主规划一条完整的、有序的阶段路线。简单任务可以只有一个阶段；存在多个独立交付物、前后依赖或不同验收关口的任务拆成多个阶段。一个阶段可以跨越许多 Step；阶段数量不得按 Step 数、工具调用数或 token 数机械推算。普通 Run 沿用现有逐阶段 RunStage 执行方式，不要求在首个业务工具前提交完整路线。

Run 的阶段路线描述将要做什么；执行活动组概括实际发生了什么。两者是独立视图：阶段路线先完整呈现，实际事件继续保留在 Run 轨迹中，并以可展开的活动组减少冗长。活动组在运行时随事件增量更新；恢复或分页加载后，必须能从真实事件重建相同的分组事实。

本 Spec 覆盖 Plan Run 的完整路线规划，以及普通 Run 与 Plan Run 共用的活动组展示：

- 普通模式继续按现有 RunStage 生命周期逐阶段工作；本 Spec 不增加完整路线前置规划、路线审批或只读探查门。
- Plan 模式先进行只读调查并收集影响范围或正确性的必要用户信息，再将任务目标、验收条件和完整阶段路线作为一个审批对象。用户一次批准后，同一 Run 自主逐阶段执行；新证据可促使 Agent 说明理由并修订路线。
- 两种模式的实际工具活动都可以投影为活动组；活动组不参与路线规划或执行调度。

本 Spec 不创建子 Goal，不把阶段映射为 GoalPlan Todo，不改变 GoalPlan 的独立生命周期，也不引入阶段并行执行、模型专属活动协议或可配置的复杂度分数。阶段路线和活动组属于执行过程，不改变 Goal 最终完成状态的既有裁决。

## 需求与验收标准

### 需求 1：按任务复杂度规划 Plan Run 完整路线

作为选择 Plan 模式的用户，我希望简单任务保持简洁、复杂任务在审批前拆成可验收阶段，以便查看整体路线并了解当前进度。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当 Plan Run 获批进入执行时，Runtime 必须先持久化覆盖获批任务范围的完整阶段路线；路线缺失或无效时，不得调用会产生副作用的业务工具。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当 Plan Run 任务是单一、连贯且可用一个验收关口验证的结果时，Agent 应提交一个阶段；当任务包含多个可独立验收的结果、真实的阶段依赖或不同的验证关口时，Agent 应提交对应的多个有序阶段。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：每个阶段必须具有清楚的目标与完成条件；阶段按路线顺序逐个进入执行，同一时刻最多一个活动阶段。一个阶段可包含多个 Step。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：阶段数不得仅依据预计 Step 数、工具调用数、运行时长或 token 数决定，也不得为制造细粒度而将每个动作拆成一个阶段。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：接受一个中间阶段只推进到路线中的下一个阶段，不得因此自动将 Goal 或 Run 标记为完成；Run 和 Goal 的最终完成仍遵循现有完成审查契约。

### 需求 2：Plan Run 在一次审批后逐阶段执行

作为选择 Plan 模式的用户，我希望先看到经调查形成的完整路线，并且只对完整任务提案审批一次，以便执行过程自主推进而无需逐阶段确认。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当 Plan Run 尚未提交审批提案时，Runtime 只允许规划/提问控制工具，以及 ToolDefinition 明确标记为只读的业务工具；其他业务工具必须在执行前被 Runtime 拒绝。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：只读边界依据工具契约判定；Runtime 不得通过解析任意 Bash 命令文本来推断其只读性。未标为只读的 Bash 或程序执行工具在路线审批前不得运行。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：当存在会实质影响任务范围、正确性或授权的未知信息时，Agent 必须先使用用户提问流程收集必要信息，再提交提案；不得把常规偏好问题变成额外审批。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：Plan Run 的单一审批对象必须同时呈现任务目标/范围、总体验收条件和完整有序的阶段路线；不得要求用户分别批准任务提案和路线，也不得在获批范围内逐阶段再次审批。
- <a id="spec-req-2-5"></a>**验收标准 2.5**：用户批准后，Runtime 必须在同一 Run 内允许 Agent 顺序推进各阶段，并继续执行既有 Tool Grant、YOLO、Action 审批及完成审查规则。
- <a id="spec-req-2-6"></a>**验收标准 2.6**：提案等待或被拒绝时，不得调用写入类业务工具；若路线修改实质扩大已批准的任务范围或改变其结果承诺，Agent 必须暂停相关执行并再次取得用户决定。
- <a id="spec-req-2-7"></a>**验收标准 2.7**：获批后，新证据可以触发获批范围内的路线修订，但 Agent 必须提供理由，Runtime 必须持久化修订并保留仍有效的阶段结果；超出获批范围或改变结果承诺时，必须重新取得用户决定。

### 需求 3：普通 Run 保留现有逐阶段规划行为

作为使用普通模式的用户，我希望 Run 保留现有逐阶段执行方式，以便轻量任务不承担完整路线规划与审批流程。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：普通 Run 继续使用现有当前/最新 RunStage 状态与阶段转换契约；Runtime 不要求 Agent 在首次业务工具调用前提交覆盖整个 Run 的完整路线。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：普通 Run 不增加完整路线审批、Plan Run 的审批前只读门或逐阶段新增审批；工具调用继续遵循现有 Tool Grant、YOLO、Action 审批和范围授权规则。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：普通 Run 的阶段声明、执行、审核、接受/拒绝及恢复继续遵循既有 RunStage 生命周期；本 Spec 不要求普通 Run 持久化尚未启动阶段的路线。

### 需求 4：路线状态可持久化恢复，且不与 GoalPlan 混淆

作为需要恢复或审查长时间 Run 的用户，我希望路线、阶段进度和用户审批状态保持一致，以便恢复后从正确位置继续。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：Plan Run 路线和当前阶段游标必须由 Runtime 持有并纳入 Run 持久化状态；Agent 只能提交候选目标、验收条件与修订理由，不能分配稳定 ID 或自行写入审批/接受状态。普通 Run 继续使用既有 RunStage 状态，不新增完整路线字段。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：提交路线、Plan 审批、路线修订、阶段启动及阶段接受必须先经过 Runtime 的领域校验和检查点持久化，再允许依赖这些状态的后续执行。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：恢复 Plan Run 时必须依据 Snapshot 与已提交 Trajectory 恢复有效路线、当前路线修订和活动阶段；已批准的同一提案不得重复要求审批，尚未提交的模型候选不得被当成有效路线。普通 Run 按原有 RunStage 恢复规则恢复。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：阶段路线不得创建、完成或改写 GoalPlan Todo；GoalPlan 继续由其现有生命周期管理，并可跨 Run 存在。
- <a id="spec-req-4-5"></a>**验收标准 4.5**：旧开发期 Snapshot 依照仓库当前数据版本规则处理，不为旧路线状态增加历史兼容分支或迁移层。

### 需求 5：独立呈现阶段路线和可展开的执行活动组

作为查看 Plan Run 进度的用户，我希望先看到完整阶段路线，再用简洁活动组扫读执行过程；在普通 Run 中，我希望用相同活动组查看实际执行，以便兼顾全局进度和细节核验。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：Plan Run 会话视图必须将完整阶段路线作为独立列表呈现，至少显示阶段目标、路线顺序和阶段状态；普通 Run 继续显示现有 RunStage 状态。路线不得取代现有 Run 事件/Trajectory 视图。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：活动投影必须消费实时 ExecutionStream 与已提交 Trajectory：收到工具开始事件后即可显示运行中活动；后续可见性策略允许展示的输出、完成或失败事件必须更新相同的调用与活动。投影不得把仅存在于实时流的内容误认为持久化事实。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：活动组必须保留每个成员的原始顺序及组内详情插入位置。同一 Run、同一阶段内、语义类别相容且来源相邻的调用可以合并；Agent 面向用户的新决策/回复、用户等待、阶段或 Run 切换、终态失败及活动类别不兼容时必须结束当前组。内部决策事件或推理摘要本身不必打断相邻调用；仅在来源身份和相邻位置可验证时才可穿过调用边界，并且只有既有可见性策略允许显示的详情才可呈现，不得暴露隐藏推理内容。
- <a id="spec-req-5-4"></a>**验收标准 5.4**：每个实际工具调用必须以 Runtime 分配的稳定 `actionId` 关联开始、增量输出、尝试结果、完成与 Observation；重试用 attempt 序号区分。Trajectory 的 `eventId`/`sequence` 与 ExecutionStream 的 `eventId`/`cursor` 属于独立身份和顺序空间，不得假定彼此相同；投影须在各自来源内去重，并以 `actionId` 与提交边界协调实时状态和持久化结果。流重连或快照刷新后，相同调用不得重复添加或错配。
- <a id="spec-req-5-5"></a>**验收标准 5.5**：历史记录重建必须只依据持久化事件及其身份验证成员相邻关系。同一组跨 Trajectory 分页边界时，投影器可以在相邻页数据齐全后修复分组；不得仅凭摘要相同、时间接近或工具名称相同合并，也不得跨 Run、阶段或无法验证的序号缺口合并。
- <a id="spec-req-5-6"></a>**验收标准 5.6**：活动组至少投影稳定成员引用、Run/阶段范围、语义类别及 `running`、`completed` 或 `failed` 状态；组 ID 由来源身份确定，不要求新增持久化组 ID。瞬时可重试的 `tool_attempt_failed` 必须保留为该 Action 的尝试详情，不得在同一 Action 后续成功时把整组错误标成终态失败。
- <a id="spec-req-5-7"></a>**验收标准 5.7**：展开活动组后，用户仍可按原顺序检查原始 Step/事件、工具调用、结果、错误与现有详情入口；没有足够分类信息的事件必须原样单列，不得丢弃或猜测分组。
- <a id="spec-req-5-8"></a>**验收标准 5.8**：活动组是实时事件和已提交执行事实的可重建 UI 投影，不是新的持久化领域状态；显隐、折叠、摘要和实时状态不得改变 Run 状态、授权、轨迹内容或评测结果。仅有 `live` durability 的增量在 Run 恢复后不得伪装成已提交历史。

## 架构与核心决策

### 当前架构事实与变化边界

当前 Run 快照只持有一个 `currentStage`；`RunStageState` 表示当前或最新阶段，不保存尚未启动阶段的完整路线。普通 Run 将继续使用此模型；完整路线新增到 Plan Run 的 Runtime 状态中。[Run 状态](../../packages/runtime/src/domain.ts) [阶段状态与流转](../../packages/runtime/src/run-stage.ts)

当前 Agent Prompt 要求业务工具前声明活动阶段，但允许逐阶段决定；Plan Run 通过任务提案等待审批，现有契约尚未将完整阶段路线纳入该审批对象。[阶段决策提示](../../packages/agent/src/step-prompt/agent-decision@1.njk) [任务提案模式设计](../mode-driven-task-proposal/design.md)

当前 GoalSession 已按已知 RunStage 分组 Steps，并为常见工具生成单步摘要；Trajectory 使用稳定的 `eventId`/`sequence`，工具生命周期以 `actionId` 关联；ExecutionStream 另有可合并的实时增量与单调 `cursor`。Goal Board 的事件视图按序号分页，当前实时钩子只显示通用运行状态，尚无跨实时流、已提交轨迹与分页窗口的活动组投影。[Run 会话视图](../../apps/goal-board/src/components/GoalSession.tsx) [阶段 Step 投影](../../apps/goal-board/src/components/run-stage-utils.ts) [单步活动摘要](../../apps/goal-board/src/components/step-activity.ts) [Trajectory 事件身份](../../packages/runtime/src/trajectory.ts) [ExecutionStream 事件身份与耐久级别](../../packages/execution-stream/src/event.ts) [实时 Run 钩子](../../apps/goal-board/src/hooks/useRunStream.ts) [Trajectory 分页窗口](../../apps/goal-board/src/trajectory-page-window.ts)

本 Spec 只在 Plan Run 中改变 [Run 阶段审查与上下文投影 Spec](../run-stage-review-and-context-projection/spec.md) 的“逐阶段确定”约束，增加一次审批前的完整路线；普通 Run 保持该逐阶段行为。新路线不是旧 GoalPlan 的别名；本 Spec 交付前，现有行为仍以当前源码为准。
### 核心决策

- **完整路线仅属于 Plan Run**：Plan Run 状态保存完整、有序、可修订的阶段路线及活动阶段游标。Runtime 分配稳定身份、验证顺序和状态转换；Agent 提交候选路线。每个阶段包含目标和验收条件；路线按顺序执行，不引入阶段依赖图、并行调度或独立 Planner。普通 Run 保留现有逐阶段 RunStage 状态，不新增全路线规划或持久化。
- **Plan Run 采用只读调查和一次路线审批**：Plan Run 允许只读调查，随后把任务范围、验收条件与完整路线合成一个审批对象，批准后在同一 Run 自主推进；路线修订在获批范围内自主执行，扩展授权或承诺时回到用户决定。
- **只读门由工具契约强制且仅作用于 Plan Run**：Plan Run 获批前允许 ToolDefinition 明确标记为只读的业务工具和所需控制工具；执行授权继续归 Tool/Permission Runtime 管理。不得因 Prompt 声称只读而放行写入调用。普通 Run 不新增只读门。
- **活动组是连续事件的可增量投影**：Goal Board 的 ActivityProjector 消费 ExecutionStream 事件以即时更新进行中的组，并从已提交 Trajectory 重建历史。投影项关联 `runId`、阶段、类别、状态、按序成员 `actionId` 与可见详情；稳定事件身份用于流/历史去重和调用生命周期配对，组标识从来源身份派生。摘要采用已有工具元数据和已记录操作结果，不新增模型输出协议或持久化组 ID。
- **事件身份按各自来源解释**：Trajectory 的 `eventId`/`sequence` 与 ExecutionStream 的 `eventId`/`cursor` 不互换；Runtime `actionId` 是一个工具 Action 的生命周期关联键，attempt 序号区分同 Action 的重试。实时流先驱动运行中的展示，已提交 Trajectory 在提交/刷新后提供可恢复的最终事实。
- **保留 Codex 式组内详情与来源校验**：连续同类调用可合为一组，允许策略明确可见的透明详情保留在调用之间，并按原位置展开；用户可见助手回复、等待、阶段切换与终态错误仍形成边界。历史分页拼组必须按持久化调用/事件身份验证同一 Run 内的相邻关系，不得只依赖展示文本。
- **路线视图仅在 Plan Run 出现，活动视图覆盖两种模式**：Plan Run 完整路线含尚未执行的阶段；活动组只包含已发生的事实。普通 Run 显示既有当前阶段状态；两种模式均可通过活动组检查实际调用。
- **沿用 Codex 的分层思想，不复制其内部协议**：Codex Plan Mode 是执行前的对话式探索与审批工作流；update_plan 是执行期清单工具，两者有明确边界。[Codex Plan Mode 源码模板](https://github.com/openai/codex/blob/main/codex-rs/collaboration-mode-templates/templates/plan.md) [update_plan 协议定义](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/plan_tool.rs) [Plan Mode 对 update_plan 的限制](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/handlers/plan.rs)
- **活动组借鉴其连续事件合并和实时状态更新**：Codex 的 `ActivityGroup<T>` 将调用列表与有序详情分开保存，实时活动单元会随流式事件原地更新；历史重建按调用/项目身份验证相邻关系，并修复被分页边界拆开的组。本功能复用这些投影语义，不复制其 TUI cell 或协议。[ActivityGroup 结构](https://github.com/openai/codex/blob/main/codex-rs/tui/src/history_cell/activity_group.rs) [实时活动单元](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget.rs) [轨迹投影与推理详情](https://github.com/openai/codex/blob/main/codex-rs/tui/src/thread_transcript.rs) [探索组归并](https://github.com/openai/codex/blob/main/codex-rs/tui/src/thread_transcript/exploration_groups.rs) [Computer 组身份校验](https://github.com/openai/codex/blob/main/codex-rs/tui/src/thread_transcript/computer_groups.rs) [分页边界修复](https://github.com/openai/codex/blob/main/codex-rs/tui/src/app/activity_groups.rs) [分页详情折叠](https://github.com/openai/codex/blob/main/codex-rs/tui/src/thread_transcript/activity_pages.rs)
- **按验收关口推进，而非按固定 Step 数推进**：长任务路线由可完成的里程碑和每阶段验收点组成；完成当前阶段后观察结果，必要时先修复或有理由地修订再继续。[OpenAI Codex 长任务说明](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex)

### 主要流程

1. **普通 Run**：接收请求 → 按现有逐阶段 RunStage 机制决定当前阶段 → 按现有授权调用业务工具 → 接受/拒绝阶段并继续；不要求预先规划或持久化完整路线。
2. **Plan Run**：只读调查 → 必要时收集用户信息 → 提交包含任务范围、验收条件和完整路线的单一审批对象 → 等待一次用户审批 → 同一 Run 按路线逐阶段执行。
3. **活动组投影**：先按 Stream `eventId`/`cursor` 消费实时事件并用 `actionId` 更新进行中调用 → 将实时尾部与已提交 Trajectory 按事件身份去重 → 按 Run、阶段、相邻关系和活动语义类别派生活动组 → 在完成、终态失败或边界事件时结组 → 展开时按原顺序定位到调用及详情。历史分页补齐边界数据后，仅在来源身份验证成功时重建跨页活动组。

## 曾考虑的备选方案

- **每个 Plan Run 固定一个阶段**：实现简单，但无法表达跨多个验收关口的复杂工作，且会继续把整次 Run 压成一个大目标；不采用。
- **每次 Run 都固定拆成多个阶段**：能展示阶段，但简单任务会产生无意义的计划与审批负担；普通 Run 也不需要完整路线；不采用。
- **普通 Run 也预先提交完整路线**：能提前展示全局路线，但会把 Plan Run 的路线规划协议扩展到普通执行；按用户决定不采用。
- **Plan Run 等开始执行后再按观察动态拆分**：会导致用户在首个副作用发生前看不到全局路线，和一次路线审批边界冲突；不采用。普通 Run 继续沿用逐阶段观察与推进。
- **将路线直接存成 GoalPlan Todo 或子 Goal**：混淆跨 Run 的长期用户目标与单次 Run 的短期执行结构，会污染 Todo 生命周期；不采用。
- **由模型为每个活动组输出名称和持久化 ID**：可表达复杂语义，但会把纯呈现聚合变成模型协议和恢复状态；本期没有必要，改由已记录事件派生。
- **只增加阶段路线，不做活动组**：可以回答“计划做什么”，却不能缩短已有逐 Step 活动列表；不采用，因为用户明确希望同时获得 Codex 式活动组概览。
- **让活动摘要覆盖或重排原事件**：会损害轨迹核验、时序与故障排查；不采用。

## 风险与否定性保证

- **过度拆分/拆分不足**：复杂度判断没有可靠的单一数字阈值。Agent 依据独立结果、真实依赖和验收关口判断；宁可保留可验证的单阶段任务，也不得为凑数拆分。
- **Plan Run 路线漂移**：修订必须提供理由并保留仍有效的阶段结果；跨出用户已授权的目标时必须回到用户决定。普通 Run 不维护完整路线。
- **只读误判**：只依赖 ToolDefinition 的显式只读契约，不将任意 Bash 命令字符串推断为安全。
- **活动组信息损失或重复**：组是可重建投影；事件顺序和逐条详情始终可访问。实时重连使用稳定事件身份去重；历史跨页拼组需验证相邻来源身份；未知事件不归入推断组。
- **重试状态误判**：Runtime 的 `tool_attempt_failed` 可能代表同一 Action 的可恢复尝试。投影必须区分尝试失败与 Action/Run 的终态失败，避免后续成功仍显示为整组失败。
- **恢复和审批一致性**：Plan Run 的路线批准与当前路线版本必须匹配；恢复不得把候选、拒绝或未提交路线误当作获批事实。普通 Run 继续按既有阶段恢复。
- **阶段边界**：路线是本 Run 的执行计划，不等价于 Todo、Step 或 Tool；阶段验收不等价于 Run/Goal 完成。
- **验证依据**：实施计划必须验证 Plan Run 单阶段与多阶段、只读门/一次审批/路线修订/Snapshot 恢复，普通 Run 仍按既有 RunStage 逐阶段执行且无全路线前置门，以及两种模式下活动组的事件顺序、边界、恢复和原始详情。

# Structured Working Memory v1 重设计需求

## 引言

本功能以实体化、证据化且有界的 Working Memory 替换尚未发布的 `structured@1` 叙事结构，使模型与可选 Tool Projector 能提交可恢复的语义事实，同时由 Runtime 确定性地控制准入、生命周期与容量。

## 需求

### 需求 1：实体化 Working Memory

**用户故事：** 作为 Goal 执行者，我希望 Working Memory 保存结构化事实与长期执行状态，以便后续模型调用获得明确、可验证且不混入即时控制意图的上下文。

#### 验收标准

1. <a id="req-1-1"></a> 当 Runtime 构造 Working Memory 时，当前投影必须仅包含 `facts`、`hypotheses`、`plan` 与 `blockers`。
2. <a id="req-1-2"></a> 当保存 Fact 时，系统必须记录规范化身份、JSON 值、`stable | last_observed` 语义、证据 sequences、强化次数、最近证据、scope 与来源。
3. <a id="req-1-3"></a> 当模型提交即时下一步意图或 Runtime 控制状态时，系统必须拒绝把它保存为 Working Memory Fact。
4. <a id="req-1-4"></a> 当 Fact 被失效、替换或淘汰时，当前投影不得保留该 Fact，但原始 Trajectory 历史必须保持可检索。

### 需求 2：候选 Memory Patch 协议

**用户故事：** 作为 Agent 实现者，我希望模型通过受限的候选 Patch 表达 durable semantic delta，以便 Runtime 而非模型掌握身份与控制字段。

#### 验收标准

1. <a id="req-2-1"></a> 当模型创建内容时，Patch 必须只允许 `upsert_fact`、`retire_fact`、Hypothesis、PlanItem 与 Blocker 的 create/update 操作。
2. <a id="req-2-2"></a> 当模型执行 create 操作时，模型不得提供条目 ID，Runtime 必须按 canonical Fact identity 或 accepted sequence 与 operation index 分配稳定 ID。
3. <a id="req-2-3"></a> 当模型执行 update 或 retire 操作时，目标 ID 必须引用当前 Working Memory 中对应类型的有效条目。
4. <a id="req-2-4"></a> 当 PlanItem 改变状态时，系统必须支持 `pending | active | completed | blocked | superseded`、Fact/Plan 依赖和完成证据。

### 需求 3：Tool Memory Projector

**用户故事：** 作为工具集成者，我希望可选的纯函数 Projector 从 Action 与 Observation 提议事实，以便领域工具可以补充模型未稳定提炼的语义状态而不增加模型调用。

#### 验收标准

1. <a id="req-3-1"></a> 当注册的 `ToolMemoryProjector` 被调用时，它必须同步、无 I/O、无模型调用地接收 Goal、Action、Observation、Observation sequence 与当前 Memory。
2. <a id="req-3-2"></a> 当 Projector 返回结果时，系统必须支持 `changed | no_op | rejected | unknown` 与 Fact proposals，并通过同一准入流程处理候选事实。
3. <a id="req-3-3"></a> 当 Projector 缺失、抛错或返回非法结果时，Runtime 必须记录 Diagnostic Trace、提交原始 Observation，并保持 Working Memory 不变。
4. <a id="req-3-4"></a> 当 Observation 与 Projector Patch 均合法时，它们及 Snapshot 必须进入同一提交边界，Patch 证据必须引用预分配的 Observation sequence。

### 需求 4：证据准入与冲突处理

**用户故事：** 作为 Runtime 维护者，我希望所有候选 Patch 经过确定性准入和 canonicalization，以便连续执行与恢复重放得到相同结果。

#### 验收标准

1. <a id="req-4-1"></a> 当 Patch 违反 Schema、Evidence、身份引用或控制字段权限时，Runtime 必须拒绝 Patch 并返回稳定原因。
2. <a id="req-4-2"></a> 当操作完全重复、只含旧 evidence 或已被更新证据覆盖时，Runtime 必须抑制该操作；全部被抑制时不得写入 accepted Event，合法 Action 仍须继续。
3. <a id="req-4-3"></a> 当同一 Fact identity 以相同值和更新 evidence 再次出现时，Runtime 必须合并 evidence 并增加强化次数。
4. <a id="req-4-4"></a> 当同一 Fact identity 以不同值和更新 evidence 出现时，Runtime 必须以新值替换旧值；缺少更新 evidence 时必须拒绝。
5. <a id="req-4-5"></a> 当同一 sequence 上模型与 Projector 提交冲突值时，`tool_projector` 必须优先于 `model`。

### 需求 5：生命周期与容量

**用户故事：** 作为长任务执行者，我希望 Working Memory 在固定预算内保留当前高价值状态，以便上下文不会无界增长且活跃计划不会被意外淘汰。

#### 验收标准

1. <a id="req-5-1"></a> 当 Working Memory 超过 32 KiB、64 Fact、8 Hypothesis、16 PlanItem 或 8 Blocker 的默认限制时，Runtime 必须执行确定性保留选择；单 Fact 必须受 4 KiB 与 JSON 深度 6 限制。
2. <a id="req-5-2"></a> 当执行容量选择时，active Blocker、active PlanItem 与 active PlanItem 引用的 Fact 必须受保护。
3. <a id="req-5-3"></a> 当需要淘汰未保护条目时，Runtime 必须依次考虑 Hypothesis、`last_observed` Fact、stable Fact，并按强化次数、最近证据、更新时间与 ID 稳定排序。
4. <a id="req-5-4"></a> 当候选自身未进入保留集合时，Runtime 必须以 `capacity_low_utility` 抑制；当受保护集合自身超限时，必须拒绝整个 Patch。
5. <a id="req-5-5"></a> 当容量淘汰发生时，accepted Patch 必须记录 canonical `evict_entries` 操作，恢复时不得按当前配置重新计算。

### 需求 6：阶段、终态与恢复

**用户故事：** 作为可恢复 Runtime 的使用者，我希望 Memory 生命周期与 Goal 提交边界一致，以便中断前后的状态等价且终态不残留执行意图。

#### 验收标准

1. <a id="req-6-1"></a> 当 Goal 阶段变化时，Runtime 必须通过 canonical `supersede_scope` 失效旧 phase scope 内容。
2. <a id="req-6-2"></a> 当 Run 进入 completed、failed 或 cancelled 时，Runtime 必须清理 executing phase 的 Hypothesis、PlanItem 与 Blocker，且终态不得残留 active phase intent。
3. <a id="req-6-3"></a> 当进程从 Snapshot 与 Trajectory 恢复时，Runtime 必须只重放 `memoryRevision` 可达且位于 committed 边界内的 canonical Patch。
4. <a id="req-6-4"></a> 当使用同一 committed canonical Patch 链时，连续执行与恢复后的 Working Memory 必须等价。

### 需求 7：协议版本与兼容性

**用户故事：** 作为已有 Goal 的维护者，我希望新版协议明确区分可恢复与不可迁移的历史形状，以便失败是稳定且可诊断的。

#### 验收标准

1. <a id="req-7-1"></a> 当创建新 Goal 时，Agent 必须使用 Prompt Bundle v7 与新 Patch Schema，Storage 必须写入 Snapshot v10。
2. <a id="req-7-2"></a> 当恢复 Prompt Bundle v4–v6 的 structured Goal 时，系统必须在模型调用或 Memory 重建前返回 `UNSUPPORTED_STRUCTURED_MEMORY_SHAPE`，且不得静默迁移。
3. <a id="req-7-3"></a> 当读取历史 Snapshot v7–v9 时，Storage 必须继续完成解码；是否可执行由 Goal 协议校验决定。
4. <a id="req-7-4"></a> 当恢复 Prompt Bundle v1–v3 的 checkpoint Goal 时，原有兼容路径必须保持可用。
5. <a id="req-7-5"></a> 当运行 ALFWorld 烟雾验证时，新 Trajectory 不得出现 `set_next_action`，重复或陈旧 Fact 不得形成 accepted Patch。

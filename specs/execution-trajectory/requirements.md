# Execution Trajectory 需求

## 引言

本特性为 LazyGoal 增加独立的事实型 `Trajectory` 事件流，记录 Goal 从准备、决策、Action、Tool 执行到终态的完整执行过程。`Goal Snapshot` 仍是恢复权威，`Diagnostic Trace` 与 Domain Events 分离；事件流用于审计、TUI、报告和未来上下文投影，不改变现有 Runtime、Storage 或 Action/Observation 恢复语义。

## 需求

### 需求 1：记录完整的事实事件

**用户故事：** 作为 Goal 使用者，我希望每个可观察的执行事实都进入轨迹，以便完整回看一次执行过程。

#### 验收标准

1. <a id="req-1-1"></a> 当 Goal 在 `gathering_context`、`planning` 或 `executing` 阶段发生可观察的执行事实时，系统必须向 `Trajectory` 追加对应的 Domain Event。
2. <a id="req-1-2"></a> 当模型产生决策、Action 被暂存/批准/拒绝/恢复、Tool 开始/结束、Observation 被记录、Run 等待或进入终态时，系统必须分别记录能够表达该事实的事件。
3. <a id="req-1-3"></a> 如果 Tool 已产生 `tool_started` 但在返回结果前中断或失败，系统不得伪造 `tool_finished` 或成功 Observation。
4. <a id="req-1-4"></a> 当一次执行事实已经被记录时，后续事件必须保留其真实结果，不得用派生状态覆盖或改写原事实。

### 需求 2：提供可关联且有序的事件元数据

**用户故事：** 作为审计和调试工具开发者，我希望事件带有稳定的关联信息，以便重建执行单元和事件顺序。

#### 验收标准

1. <a id="req-2-1"></a> 每个 Domain Event 必须包含唯一 `eventId`、单调递增的 `sequence`、`goalId`、`runId`、事件类型、发生时间和当前业务阶段。
2. <a id="req-2-2"></a> 属于同一次模型决策或 Step 的事件必须共享可识别的 `executionUnitId`，涉及 Action 时必须携带对应的 `actionId`。
3. <a id="req-2-3"></a> 具有关联因果关系的事件必须能够通过父事件或等价关联元数据建立关系，消费者不得依赖事件文本猜测顺序。
4. <a id="req-2-4"></a> Domain Event 的 payload 只能描述已经发生的事实，不得把 `currentRunStatus`、`currentPlan` 或 `currentPendingAction` 等当前派生结果作为事件事实保存。

### 需求 3：明确 Snapshot 提交和恢复边界

**用户故事：** 作为需要恢复长任务的使用者，我希望轨迹和快照之间有明确边界，以便中断后不会重复执行未提交操作。

#### 验收标准

1. <a id="req-3-1"></a> 当 Goal Snapshot 成功持久化后，Snapshot 必须记录其纳入恢复边界的最大 Domain Event `committedThroughSequence`，并且系统必须追加一个用于审计的 `state_committed` 事件。
2. <a id="req-3-2"></a> 当消费者读取 Trajectory 时，系统必须以最新有效 Goal Snapshot 记录的 `committedThroughSequence` 作为恢复提交边界；位于该 sequence 之后的事件必须识别为未提交 Trajectory tail，而不能仅依据最后一个 `state_committed` 事件判断。
3. <a id="req-3-3"></a> 当进程恢复 Goal 时，系统必须只使用最新有效 Goal Snapshot 及其 `committedThroughSequence` 恢复 Runtime State，不得自动 replay 边界之后的未提交 Trajectory tail。
4. <a id="req-3-4"></a> `state_committed` 必须仅表达 Snapshot 成功持久化这一审计事实，不得成为判断恢复提交边界的唯一依据。
5. <a id="req-3-5"></a> 即使 Trajectory 中存在更新或未提交的事实，Goal Snapshot 及其 `committedThroughSequence` 仍必须保持唯一的 Runtime 恢复权威。

### 需求 4：处理 Domain Event 追加失败

**用户故事：** 作为 Runtime 维护者，我希望事件写入失败时停止不确定的推进，以便系统不宣称没有被可靠记录的执行结果。

#### 验收标准

1. <a id="req-4-1"></a> 当执行某个状态转换或外部 Action 前所需的 Domain Event 追加失败时，系统必须停止该转换的后续推进，并且不得继续产生新的 Snapshot 提交。
2. <a id="req-4-2"></a> 当 Snapshot 已成功保存但其后的 `state_committed` 事件追加失败时，系统必须保留已保存 Snapshot 及其中的 `committedThroughSequence`，不得伪造 `state_committed`，并通过 `Diagnostic Trace` 暴露该缺口；消费者仍必须依据 Snapshot 边界识别已提交事件。
3. <a id="req-4-3"></a> 当 Domain Event 追加失败时，系统不得静默报告对应 Action、Observation 或 Run 已成功完成。
4. <a id="req-4-4"></a> Domain Event 追加失败不得触发未提交 Trajectory tail 的自动 replay，也不得回写或删除已有事实事件。

### 需求 5：分离 Domain Events 与 Diagnostic Trace

**用户故事：** 作为运维和调试人员，我希望诊断信息不污染领域事实，以便同时满足稳定审计和临时排障需求。

#### 验收标准

1. <a id="req-5-1"></a> 当系统产生耗时、Provider request ID、调试消息、异常堆栈或其他运行诊断信息时，系统必须将其写入独立的 `Diagnostic Trace`，不得把它们伪装成 Domain Event。
2. <a id="req-5-2"></a> 当 `Diagnostic Trace` 不可用或写入失败时，系统不得据此改变 Goal Snapshot 的恢复语义或 Domain Event 的事实定义。
3. <a id="req-5-3"></a> 当诊断输出包含原始模型请求、响应或 Tool 输出时，系统必须遵守配置的脱敏和大小限制，并且不得要求记录隐藏思维链。

### 需求 6：支持轨迹消费者读取和投影

**用户故事：** 作为 TUI、报告或上下文适配器的开发者，我希望按稳定顺序读取轨迹，以便构建不同的展示和分析视图。

#### 验收标准

1. <a id="req-6-1"></a> 当消费者按 `goalId`、`runId` 或事件序列查询 Trajectory 时，系统必须返回不可变且按 `sequence` 排序的 Domain Events。
2. <a id="req-6-2"></a> 当消费者读取包含未提交 tail 的 Trajectory 时，系统必须依据最新有效 Goal Snapshot 的 `committedThroughSequence` 区分已提交事件和未提交事件，不得将二者合并为单一当前状态。
3. <a id="req-6-3"></a> 当 TUI 或 Report 展示执行过程时，系统必须能够使用事件元数据显示执行单元、Action、Tool 和 Observation 的关联关系。
4. <a id="req-6-4"></a> 当未来 `Context Adapter` 使用 Trajectory 生成模型上下文时，投影过程不得修改 Goal Snapshot、Runtime State 或原始 Domain Events。

### 需求 7：保持现有行为兼容

**用户故事：** 作为现有 Goal 和工具链的维护者，我希望接入轨迹后原有恢复和报告行为保持不变，以便逐步启用新能力。

#### 验收标准

1. <a id="req-7-1"></a> 当恢复已有 Goal Snapshot 时，系统必须沿用现有 Action、Observation、审批、safe/manual replay 和终态语义，不得因为 Trajectory 缺失而自动改变状态。
2. <a id="req-7-2"></a> 当 Runtime 继续执行已有 Profile 和 Tool 时，系统必须保持原有授权、输入校验、执行和错误分类行为。
3. <a id="req-7-3"></a> 当现有 CLI 或评测程序只请求最终报告时，系统必须保持既有报告结构和机器可读输出边界；轨迹展示必须通过独立入口提供。
4. <a id="req-7-4"></a> 当 Domain Event、TrajectoryStore 或 Diagnostic Trace 功能出现故障时，系统必须保留现有 Goal Snapshot 的可恢复性和已有测试覆盖的兼容性。

### 需求 8：预留未来可靠投递能力

**用户故事：** 作为未来 Runtime 基础设施维护者，我希望当前设计明确可靠事件投递的扩展方向，以便后续增强一致性而不重写 Domain Event 契约。

#### 验收标准

1. <a id="req-8-1"></a> 当未来需要解决 Snapshot 与 TrajectoryStore 的原子双写时，系统必须能够在不改变 Domain Event 事实语义的前提下引入 `Durable Outbox`。
2. <a id="req-8-2"></a> 当前实现不得把异步 Outbox、最终一致性重试或事件 replay 恢复行为当作已提供能力。

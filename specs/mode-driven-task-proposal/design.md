# 按 Run 选择的任务提案模式与独立 GoalPlan 设计

## 审批摘要

### 方案

把 `/plan` 改为只作用于一个 Run 的提案策略；普通 Run 直接执行用户请求。Plan Prompt 要求先提案，但 Runtime 不以 `isReadOnly` 门控审批前的业务 Tool，因此提案审批不保证此前没有副作用。GoalPlan 留在 Goal 中作为独立计划状态；Benchmark 保持普通 Run，评测条件不转换为任务提案。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| Run 级一次性模式 | 当前 Run 保存模式；已完成 Run 上的 `/plan` 持久化为下一 Run 的一次性选择。持久化 `run_started` 是切换截止点，并发切换与启动按提交顺序线性化 | 重启后仍能正确启动目标 Run，提交后不能追溯改模式，消费后恢复普通模式 |
| 提案顺序与 Tool 权限 | Plan Prompt 要求 Agent 先提交提案；Runtime 不增加 `isReadOnly` 审批前 Tool 门控，现有 Profile、Tool Policy 与 Action 审批继续生效 | 任务审批不是副作用隔离保证；可能发生已授权 Tool 调用后才显示提案，Run 完成仍需获批 Task |
| Benchmark 普通执行 | Headless 与 TUI Benchmark 都使用普通 Run；`completionCriteria` 仅作为执行上下文或外部评测输入，环境评分决定 Benchmark 成功 | 不自动生成或批准任务提案；Runtime Observation Evidence 与 Benchmark 环境评分保持各自判定职责 |
| GoalPlan 独立授权 | 计划 Tool 的暴露和 Runtime 授权由模式能力决定，GoalPlan 首次成功更新时才创建，计划本身不授予业务 Tool 权限 | 已有 GoalPlan 可跨模式保留和只读展示；未来模式可复用同一操作，无需改变计划数据所有者 |
| Todo 进度与证据 | 移除 Todo 与 Run 的一对一绑定；同一 Run 可顺序推进多个 Todo，完成 Todo 必须引用当前 Run 已提交 Observation | 旧 Run 或未提交证据不能完成 Todo；Run 完成不自动改写 Todo |
| 当前协议与执行边界 | 更新当前 Snapshot、模型决策与轨迹契约，不增加旧开发数据迁移或并行版本 | 不支持的旧 Goal 明确失败；运行启动、审批、计划与 Tool 副作用仍以已提交边界恢复 |

### 风险与待确认

- 风险等级：**high**；理由：模式持久化边界、任务审批与 Tool 授权关系、Benchmark 执行语义、Todo 证据和恢复路径均改变。
- 关键操作：普通 Run 与 Plan 提案审批前都可能调用已通过既有授权的写入 Tool；本文不授权运行真实外部副作用。
- 风险：Prompt 约束不是强制 Runtime 门控，Agent 可能在提案审批前产生已授权 Tool 副作用；普通请求没有逐条获批完成条件，Runtime 只能验证当前 Run Observation 引用；旧 Snapshot 不迁移。
- 待确认：无。

## Overview

本设计覆盖 [需求 1](requirements.md#req-1-1) 至 [需求 7](requirements.md#req-7-4)。`/plan` 仅选择提案审批策略，`ask_user` 继续承担具体问题的可恢复交互；先前预留的 `AskUserTool` 接口供后续模式复用，本次不新增第二套提问、等待或回答协议。

```text
用户 /plan ----> GoalCoordinator ----> Run.mode / Goal.nextRunMode
用户任务  ----> Launcher / continue ----> Run ----> Runner
                                              |        |
                                              |        +--> Tool Policy / Evidence Gate
                                              |        +--> GoalPlan Tool --> Goal.goalPlan
                                              v
                                      Agent 决策契约
                                              |
                                              v
                              Snapshot + committed Trajectory --> TUI
```

模式选择、任务审批和计划修改由 Runtime 提交；模型只能请求已暴露的决策，TUI 只投影最新已提交状态。GoalPlan 不因模式切换而创建或删除。

## Key Design Decisions

### Run 级一次性模式

用 `Run.mode: "normal" | "plan"` 取代 Goal 级 `mode`。`/plan` 在当前 Run 的持久化 `run_started` 尚未提交时直接设置 `plan`；当前 Run 已完成时，Coordinator 保存 `Goal.nextRunMode: "plan"`，下一次 `continue` 在创建 Run 时消费并清除它。新 Goal 创建前的选择仍由输入界面暂存，随首次 `launch` 写入 Run；无 Goal 存在时不承诺跨进程恢复。Coordinator 必须把模式选择与 `run_started` 的持久化提交放入同一串行化边界：若 `/plan` 先提交则 Run 以 Plan 启动；若 `run_started` 先提交则切换无副作用拒绝。该截止点不依赖模型调用或 Tool 调用是否已经实际开始；同一目标 Run 重复 `/plan` 幂等。[需求 1](requirements.md#req-1-1)

`nextRunMode` 只表示尚未创建的下一 Run，不是 Goal 当前模式。它在 Goal Snapshot 保存成功后才对下一输入生效；`run_created` 记录最终 Run.mode，不向已终结 Run 追加新的执行 Step。当前 Run 进入终态后，后续 Run 缺省 `normal`；已批准 Task 不被继承。`/plan` 命令文本不进入 Goal.messages。

### 提案顺序与 Tool 权限

保留单一 `executing` 生命周期，把 `workflow.task` 移为 `Run.approvedTask?`。Plan Run 未获批时该字段为空；审批成功后保存当前提案。普通 Run 不生成提案或伪造“已批准任务”，其目标直接来自当前 Run 的真实用户消息。现有 `ask_user` 在两种模式均可用，但回答不是 Tool Observation。[需求 2](requirements.md#req-2-1)、[需求 3](requirements.md#req-3-3)

模型决策契约按 `Run.mode` 与是否存在 `approvedTask` 派生；Tool 暴露仍由普通 Profile 和 Tool 授权决定，`isReadOnly` 不用于 Plan 提案前的额外门控：

| Run 状态 | 业务 Tool | 系统决策 | 完成证据 |
|---|---|---|---|
| 普通 | 全部已授权 Tool | 提问、Lookup、完成、等待、失败 | `complete.evidenceSequences`；仅引用当前 Run 已提交 Observation |
| Plan 未批准 | Profile 已授权 Tool；Prompt 要求先提案，但 Runtime 不按只读属性新增审批前门控 | 提问、Lookup、任务提案、获授权的 GoalPlan 更新 | 不允许完成 |
| Plan 已批准 | 全部已授权 Tool | 提问、Lookup、GoalPlan 更新、完成、等待、失败 | 沿用获批 Task 的逐条 `completionEvidence` |

Plan Prompt 明确要求 Agent 先提交任务提案，再调用业务 Tool；这只是模型行为约束，Runtime 不保证提案前无副作用。如果 Agent 先请求某个业务 Tool，Runtime 仍按原有 Profile、Tool Policy 和 Action 审批路径处理，不因缺少 `approvedTask` 或 `isReadOnly` 属性额外拒绝。提案一旦保存为 `pendingInteraction`，Run 停在等待点，直到用户批准或反馈后才可继续模型/Tool 调用。批准后任务目标和完成条件固定在本 Run；Run 完成前仍执行获批条件校验。Tool Profile、Tool Policy、Action 审批、Context Checkpoint 和 Step 预算不因模式跳过。[需求 2](requirements.md#req-2-2)、[需求 3](requirements.md#req-3-1)

普通完成声明如果当前 Run 已产生业务 Tool Observation，至少引用一条允许的已提交 Observation；没有业务 Tool Observation 时允许空引用，以支持纯回答。所有非空引用都经 Evidence Gate 校验 Goal、Run、提交边界与事件类型；模型的完成摘要和用户回答不能成为证据。Plan 模式继续按获批完成条件逐条校验，含可选的 Tool/outcome 验收声明。[需求 7](requirements.md#req-7-4)

### Benchmark 普通执行

Headless Composition Root 与 TUI Benchmark Runner 均创建普通 Run，不生成任务提案，也不自动批准任务。descriptor 的 `intent` 和 `completionCriteria` 作为 Benchmark 执行上下文提供给 Agent；`completionCriteria` 不写入 `Run.approvedTask`，也不成为 Runtime Run 完成门槛。Runtime 仍按当前 Run 的提交 Observation 校验完成引用；Benchmark 环境返回的评分（例如 `won=true`）是 Benchmark 成功判定依据，即使模型提交 `complete` 或覆盖了描述符条件也不能替代环境结果。[需求 2](requirements.md#req-2-5)

TUI Benchmark 的 `auto` / `review` 不再用于任务提案自动批准或提案面板等待；它们继续保留现有 Action 审批及用户交互阻塞处理语义。Headless Benchmark 直接返回普通 Run 的 waiting 或终态。两种 Root 的集成测试必须覆盖“无提案审批、criteria 不成为获批 Task、环境评分仍权威”的组合行为。[需求 2](requirements.md#req-2-5)

### GoalPlan 独立授权

GoalPlan 仍由 Goal Snapshot 持有，计划 reducer 只校验 revision、Todo ID、容量和状态转换，不读取 Run.mode。单一模式能力映射决定本轮是否暴露 `system_update_goal_plan`；Runner 在提交前再次校验相同授权。目前普通模式关闭计划写入，Plan 模式在审批前后均开放。今后新模式可以选用该能力，不需要新的 GoalPlan 存储或 Tool 协议；本次不建立可动态注册的模式框架。[需求 4](requirements.md#req-4-1)

`/plan` 不创建空计划。首次获授权的计划操作以临时 revision 0 空计划验证，只有整个 Patch 成功后才在同一提交边界保存 GoalPlan 与 `goal_plan_updated` 事实；失败时 GoalPlan 仍缺省。已存在计划不随 Run.mode 改变而消失；模型可获得其只读投影，TUI 依据计划是否存在决定显示，而不是依据当前模式。普通模式尝试计划写入时即使模型输出了相应决策，也必须由 Runtime 无副作用拒绝。[需求 4](requirements.md#req-4-2)、[需求 6](requirements.md#req-6-2)

`SystemAskUserDeclaration` 继续复用现有 `ask_user` 请求、`pendingInteraction` 和回答校验。已预留的 `AskUserTool` 接口只约束声明身份与解码结果；未来模式的授权接入仍由源码中的 `//TODO` 标记，本次不改变问答行为。

### Todo 进度与证据

GoalPlanItem 保留稳定 ID、内容、顺序、状态，移除 `activeRunId`；Run 和完成历史不再保存 `todoId`。`in_progress` 是计划进度，不再表示必须有一个正在执行的绑定 Run，因此 Run 结束后可以原样保留。继续保持同一 Goal 最多一个 `in_progress` Todo；同一 Run 可依次完成、取消或退回前一项，再推进下一项。[需求 5](requirements.md#req-5-1)

Agent 仍只能通过 `system_update_goal_plan` 提交结构化 Patch。请求将 Todo 置为 `completed` 时，Runner 要求该操作携带当前 Run 已提交 Observation sequence 并先经 Evidence Gate 校验；旧 Run、未提交或无效引用必须在提交任何计划变更前拒绝整个 Patch，Reducer 不负责证据或模式判断。任务提案批准与 Todo 状态互不授权。Run `complete` 只检验该 Run 的完成声明，不扫描剩余 Todo，也不自动修改状态；`continue` 只因用户新输入创建 Run，不再自动选取 Todo。[需求 3](requirements.md#req-3-4)、[需求 5](requirements.md#req-5-2) 至 [需求 5](requirements.md#req-5-5)

### 当前协议与执行边界

开发期只保留当前协议形状：Snapshot 持久化 `Run.mode`、当前 Run 的 `approvedTask`、可选 `Goal.nextRunMode` 和可选 GoalPlan；去除 Goal.mode、Goal 级 Task、Run/Todo 绑定及“普通模式不能包含 GoalPlan”的旧不变量。Storage 同时校验模式、审批等待点和 Task 的对应关系：普通 Run 不能出现任务提案等待；Plan Run 未批准不能完成，提案等待点提交后不能继续模型或 Tool 调用；此前业务 Tool 是否运行仍由既有 Profile、Tool Policy 和 Action 审批决定，不受 `isReadOnly` 的 Plan 特殊门控；已完成 Run 不保留活动审批。旧开发期 Snapshot 明确报不支持，不添加迁移或版本并存路径。[需求 7](requirements.md#req-7-1)

任务提案、反馈、审批和计划更新继续使用提交边界：先写轨迹事实与快照，再调度模型或执行 Tool。失效的 requestId、旧 Run 的回答或未提交尾部不得改变当前 Run。TUI 的提案面板由 `pendingInteraction` 决定，计划面板由已保存 GoalPlan 决定，通知按 Goal/Run/plan revision 丢弃过期更新。[需求 6](requirements.md#req-6-1)、[需求 7](requirements.md#req-7-2)

## Data Models

下列形状只展示需要改变所有权的字段；现有 Run 计数、Context Epoch、消息、Tool 与 Trajectory 字段继续保留。

```ts
type RunMode = "normal" | "plan";

interface GoalState {
    readonly nextRunMode?: "plan"; // 已完成 Run 后，一次性选择下一 Run
    readonly goalPlan?: GoalPlan;    // 与当前 Run.mode 无关
    readonly run: RunState;
}

interface RunState {
    readonly mode: RunMode;
    readonly approvedTask?: GoalTask; // 只属于这个 Plan Run
    readonly pendingInteraction?: PendingInteraction;
}

interface GoalPlanItem {
    readonly id: string;
    readonly content: string;
    readonly position: number;
    readonly status: "pending" | "in_progress" | "completed" | "cancelled";
}

type NormalCompleteDecision = {
    readonly kind: "complete";
    readonly summary: string;
    readonly evidenceSequences: readonly number[];
};

type CompleteTodoOperation = {
    readonly type: "update";
    readonly id: string;
    readonly status: "completed";
    readonly evidenceSequences: readonly number[];
};
```

Snapshot 与 Agent 视图按这些所有权生成同一份当前状态；`nextRunMode` 不投影给模型为正在执行的模式。上述决策和操作只展示新增字段；Plan Run 的 `complete.completionEvidence` 及其他 GoalPlan 操作保留现有形状。GoalPlan Patch 保留 `baseRevision`，仅置为 `completed` 的操作要求当前 Run 证据引用。模型只能引用当前 Run 已提交的 Observation sequence，不能自行分配新的 Runtime ID、Run 绑定或事件序号；证据引用保存在相应决策或计划更新轨迹中，不成为 Todo 与 Run 的持久绑定。[需求 4](requirements.md#req-4-4)、[需求 5](requirements.md#req-5-5)

## Error Handling

- `/plan` 在忙碌或非法输入时无副作用拒绝；模式切换与 `run_started` 竞态必须按持久化提交顺序线性化；已完成 Run 的下一模式选择保存失败时，不得让 UI 显示已生效状态。
- 提案批准、反馈和 `ask_user` 回答必须匹配当前 Goal/Run/requestId；不匹配时保留原等待点。
- 未授权 GoalPlan 更新、过期 revision、缺失或非当前 Run 的 Todo 完成证据及保存失败均不得提交部分计划，也不得启动下一次模型或业务 Tool。
- 恢复发现旧模式、旧 Todo/Run 绑定、不一致的审批状态或未提交轨迹事实时 fail closed；无兼容性猜测。[需求 7](requirements.md#req-7-3)

## Testing Strategy

- **模式与入口：** 覆盖新 Goal 首次 `/plan`、已完成 Run 上的一次性选择、`run_started` 提交前后切换、并发竞态、忙碌拒绝、重复命令、重启后消费一次及下一 Run 回普通模式；TUI、CLI 与 Headless 普通入口都直接执行。[需求 1](requirements.md#req-1-1)、[需求 1](requirements.md#req-1-4)、[需求 2](requirements.md#req-2-1)
- **授权与完成：** 验证 Plan Prompt 包含先提案再调用业务 Tool 的指引；Runtime 不以 `isReadOnly` 或未批准状态新增 Tool 门控，既有 Tool Policy/Action 审批仍有效；提案进入等待点后必须等用户响应；完成声明只接受当前 Run 已提交 Observation，Plan 完成继续逐条检查获批条件。[需求 2](requirements.md#req-2-2)、[需求 3](requirements.md#req-3-1)、[需求 3](requirements.md#req-3-2)、[需求 7](requirements.md#req-7-4)
- **Benchmark：** 覆盖 Headless 与 TUI Benchmark 普通 Run，不产任务提案/自动审批，`completionCriteria` 作为上下文或外部评分输入且不成为 Task；Run 完成引用仍遵守 Observation 规则，环境评分决定评测成功。[需求 2](requirements.md#req-2-5)
- **GoalPlan：** 验证首次成功 Patch 才创建、无权限模式拒绝、revision 冲突原子失败、稳定 ID、同 Run 多 Todo、仅当前 Run 已提交 Observation 可完成 Todo，以及 Run 终态保留未完成项且不自动启动下一 Run。[需求 4](requirements.md#req-4-1)、[需求 5](requirements.md#req-5-1)、[需求 5](requirements.md#req-5-5)
- **恢复与展示：** 验证 Snapshot/Trajectory 提交失败不继续副作用，计划在普通模式仍可见，审批面板与计划面板由各自状态投影，迟到通知不覆盖新 Run；当前旧开发数据明确失败。[需求 6](requirements.md#req-6-1)、[需求 7](requirements.md#req-7-1)
- **风险验证：** 运行受影响包单测、TypeScript 检查和仓库全量回归；用真实 TUI 手动确认 `/plan` 只影响目标 Run、普通模式没有任务提案面板，以及一个 Run 内多个 Todo 的状态呈现。

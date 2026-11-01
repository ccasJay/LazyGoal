---
status: proposed
created_at: 2026-11-01
supersedes: []
superseded_by: null
---

# Browser 控制契约 Spec

## 目标与范围

将 Goal Board 与 Runtime 之间的控制流收敛为一条可归约的 Browser 控制协议。所有 Goal/Workspace 作用域的变更命令使用统一的 `ControlIntent` 与 `ControlReceipt`；Runtime 事实通过显式 `ControlEvent` 发布；`state_sync` 提供权威 `ControlSnapshot`；Goal Board 使用纯 reducer 派生命令展示、审批、工具活动与失效范围。

目标是消除三类现有问题：每个 hook 各自维护 busy／error／unknown 状态；`run_status`、`run_result`、`interaction_settled`、`stream_fault` 被压扁成通用 `activity_boundary`；每个事件都触发一次 session／activity／goal 的全量重读。控制事件必须让页面知道“发生了什么、对应哪条命令、影响了哪个投影、是否需要重新同步”，而不是让页面从事件顺序猜测。

本次包括：

- `packages/web-contracts` 的控制 intent、receipt、event、snapshot 与 scope wire DTO，以及原位替换现有 Browser SSE 事件联合。
- `packages/browser` 的 Runtime 事件到 Browser 控制事件的投影、控制快照组装与 SSE 映射。
- `apps/goal-board` 的控制 reducer、统一 intent 状态、命令迁移、事件消费迁移与现有页面接线。
- `packages/runtime`、`apps/goal-server` 为完成控制契约所需的必要关联、快照字段与命令装配；不重写 Runtime 状态机。

本次不包括：

- Provider Profile 创建／更新／删除／激活／测试，以及全局模型偏好、Provider 设置等全局管理命令。
- `human-interaction` 拥有的交互表单视觉重设计与问答／审批语义；本次只提供通用控制契约并复用其 `respond` 与交互视图。
- 新增通用收据存储、持久化 `ApprovalSession`、第二套 SSE 控制端点或旧事件双解析。
- Activity／Trajectory／Metrics 的分页与展示重设计；这些投影仍由现有所有者提供。
- 修改权限、审批、沙箱、Interrupt、完成证据或 `strip`／`reject` 的领域语义。
- TUI、SDK 包或对外公共协议发布。

## 需求与验收标准

### 需求 1：统一控制意图与受理收据

作为 Goal Board 维护者，我希望所有控制命令共用一套 intent／receipt 生命周期，以便页面不再为每个端点复制 busy、错误和未知结果处理。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当页面提交任一 Goal/Workspace 作用域的控制命令（含只读审批预检）时，系统应使用带稳定 `intentId`、判别 `kind`、目标身份与必要预期修订的 `ControlIntent`；不得为每个 HTTP 端点维护独立的前端命令状态机。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：每个 intent 应返回 `ControlReceipt`，明确区分 `accepted`、`existing`、`rejected` 与 `unknown`；拒绝携带稳定业务码，`unknown` 不得被当作成功或已应用。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：对同步提交类命令（计划模式、权限模式、Grant 撤销、Goal 归档／删除、模型选择），receipt 的 `accepted` 表示服务端已提交；对受理与执行分离的命令（创建 Session、SessionInput），`accepted` 只表示已受理，应用状态必须由 `input_result`、`state_sync` 或 `state_committed` 确认；`action_review` 是只读预检，`accepted` 只表示审阅结果已生成，不表示任何状态变更。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：当同一 intent 以原冻结载荷重试时，系统应通过既有幂等身份或修订返回原结果或稳定冲突，且不得重复执行副作用；同一身份携带不同载荷时应明确拒绝，且不得改写原结果。不得要求新增通用收据存储来记住客户端 `intentId`。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：当命令结果不明时，页面应保留原 `intentId` 与冻结载荷，并按需求 7 的统一核验流程处理；不得生成新身份直接重发。

### 需求 2：控制事件与命令关联

作为页面消费者，我希望事件直接告诉我控制事实和失效范围，而不是从通用活动边界猜测。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：Runtime 控制事实应投影为显式事件：`state_sync`、`state_committed`、`input_result`、`interaction_opened`、`interaction_settled`、`run_status_changed`、`run_result`、`tool_activity`、`stream_fault` 与 `closed`；不得用通用 `activity_boundary` 代替 Run 状态、Run 终态或交互结算。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：每个改变控制状态的事件应携带 `commitRevision`（不适用时明确省略）与 `changed: ControlScope[]`；`state_committed` 不得出现空 scope，无法确定影响范围时应保守报告 `session`。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：SessionInput 的结果应携带 `inputId` 并复用现有 `input_result`；其他 intent 的 `intent_applied`／`intent_rejected` 是 reducer 根据 receipt 与事实派生的本客户端状态，不得伪装成 Runtime 事件或进入 SSE 事实流。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：当事件重复、迟到或乱序到达时，页面应按 `commitRevision`、来源 cursor 与稳定业务身份幂等处理；低修订事件不得覆盖更高修订的 Snapshot。
- <a id="spec-req-2-5"></a>**验收标准 2.5**：当连接出现缺口、读取失败或背压时，`stream_fault` 应携带稳定 `code` 与需要重新同步的 `resync: ControlScope[]`；页面应保留最后确认状态并只重读受影响范围，不得把故障伪装为 Run 失败或自动重发输入。

### 需求 3：权威控制快照与精确失效

作为页面消费者，我希望 `state_sync` 足以恢复控制状态，事件只更新受影响的范围。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当订阅建立或重建时，`state_sync` 应携带可直接应用的 `ControlSnapshot`，包含 Goal／Run 身份、Run 状态与模式、`commitRevision`、队列修订与暂停、待处理消息／Steer、完整交互视图、待审批 Action、中断状态、`needsRecovery` 与 `executionOwner`。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：页面收到 `state_sync` 后应直接替换 session 控制状态，不得立即发起一次完整 session／activity 历史重读；Activity、Trajectory、Metrics 与 goals／grants／permission／model 仍按各自入口读取。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：当收到 `state_committed` 时，页面应只更新 `changed` 声明的作用域；未声明的作用域不得因该事件失效或重读。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：当 `ControlSnapshot` 无法从当前 `state_sync` 完整组装时，Browser 投影应在同一提交边界读取一次完整 Goal 快照并绑定 `commitRevision`；不得在每个增量事件重复读取，也不得伪造缺失字段。
- <a id="spec-req-3-5"></a>**验收标准 3.5**：当页面需要读取 Activity、Trajectory 或 Metrics 的新页时，应按现有稳定 cursor／分页契约读取，并只把结果合并到对应投影；控制快照不得被历史分页结果反向覆盖。

### 需求 4：Run 状态、终态与交互生命周期

作为用户，我希望等待、终态和交互结算直接可见，而不是靠刷新推断。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：当 Run 进入 running、waiting、阶段变化或失败恢复等状态时，系统应发布显式 `run_status_changed`；当 Run 真正 completed、failed 或 cancelled 时，应发布 `run_result` 并携带稳定 `runId` 与终态分类。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：当等待建立或结算时，系统应发布 `interaction_opened`／`interaction_settled`，携带 `interactionId`、交互种类、`runId` 与结算结果；页面不得从 `activity_boundary` 或消息正文推断交互已结束。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：交互控制在页面内应遵循 `opened → submitting → accepted → settled` 或 `invalidated` 的显式阶段；`accepted` 只表示决定已保存，`settled` 才表示等待已解除。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：当另一个客户端或宿主结算了当前交互时，页面应在下一次 `state_sync`／`interaction_settled` 后切换到真实后续状态；旧草稿不得应用到新交互，旧 `interactionId` 的决定不得解除新等待。

### 需求 5：审批会话

作为审批用户，我希望从预检到提交到结算是一条可核验的状态链，而不是三个独立按钮和一次刷新。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：`ApprovalSession` 应派生自现有 `pendingAction`、`reviewRef`、SessionInput 收据与 `commitRevision`，不得新增 Snapshot 字段或第二份审批权威。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：审批会话应区分 `unreviewed`、`reviewing`、`reviewed`、`submitting`、`accepted`、`settled`、`invalidated` 与 `unknown`；`accepted` 不等于 Action 已执行或 Observation 已提交，`settled` 才表示当前等待已解除。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：当预检结果、最终参数、授权范围或 `pendingAction` 身份发生变化时，页面应使旧 `reviewRef` 失效并要求重新预检；`reviewRef` 不得被当作认证令牌或跨请求复用。
- <a id="spec-req-5-4"></a>**验收标准 5.4**：提交审批必须复用既有 `respond` SessionInput 与 `reviewRef`；审批会话不得直接调用 Tool、写入 Grant 或绕过 Runtime 的身份、权限与沙箱校验。

### 需求 6：工具活动生命周期

作为用户，我希望工具卡片明确显示尝试、重试、结果返回、Observation 提交和结果未知，而不是按事件顺序拼装。

- <a id="spec-req-6-1"></a>**验收标准 6.1**：ToolActivity 应以 `actionId` 与 `executionUnitId` 为活动身份，以 `attempt` 区分尝试，至少区分 `started`、`attempting`、`retrying`、`result_pending`、`observed_committed` 与 `unknown`；`observed_committed` 携带 `success`／`failure` 结果。
- <a id="spec-req-6-2"></a>**验收标准 6.2**：工具返回结果只进入 `result_pending`；只有对应 Observation 已提交的控制事实或 `state_committed` scope 才能进入 `observed_committed`。工具返回不得被显示为已提交。
- <a id="spec-req-6-3"></a>**验收标准 6.3**：同一 Action 的迟到、重复或旧 attempt 事件不得回退已确认状态；重试应保留先前 attempt 的事实，不得把重试显示为首次执行。
- <a id="spec-req-6-4"></a>**验收标准 6.4**：`ControlState` 持有当前活动工具状态，Activity 页仍作为历史投影；不得在控制层和 Activity 层各维护一份互相竞争的工具活动状态。

### 需求 7：未知结果的统一核验

作为页面维护者，我希望所有命令结果不明时都走同一条核验路径，而不是只有 message／steer 有 verify。

- <a id="spec-req-7-1"></a>**验收标准 7.1**：当任一变更 intent 返回 `unknown` 或读取失败时，页面应保留原 `intentId`、冻结载荷与目标身份，并进入可核验状态；不得用新身份重发。
- <a id="spec-req-7-2"></a>**验收标准 7.2**：统一 `verify(intentId)` 应复用各资源现有身份与修订：SessionInput 查 `inputId` 收据，权限模式查 revision，Grant 查 `grantId` 状态，Goal 查归档／存在状态，模型选择查当前选择，审批预检查当前 `pendingAction` 与 `reviewRef`。不得新增通用收据存储。
- <a id="spec-req-7-3"></a>**验收标准 7.3**：核验结果应区分 `applied`、`not_applied` 与 `unknown`；只有 `not_applied` 允许以原身份重试，`unknown` 必须继续等待或要求人工刷新，不得声称成功或不存在。
- <a id="spec-req-7-4"></a>**验收标准 7.4**：页面应区分“已受理”“已应用”“结果不明”三种展示状态；受理不得显示为执行完成，结果不明不得显示为失败，也不得清除可恢复草稿。

### 需求 8：模型选择与默认偏好原子化

作为用户，我希望切换模型与保存默认偏好是一条命令，而不是一次成功后再补一次失败重试。

- <a id="spec-req-8-1"></a>**验收标准 8.1**：`model_selection` intent 应携带 `persistAsDefault`，一次命令完成模型切换与可选默认偏好保存；页面不得在 `selectModel` 成功后再发起第二次 `setModelPreference`。
- <a id="spec-req-8-2"></a>**验收标准 8.2**：receipt 应分别报告 `selection` 与 `defaultPreference` 子结果；模型切换成功但默认偏好失败时，应报告部分成功并保留可重试入口，不得把整体显示为失败或未切换。
- <a id="spec-req-8-3"></a>**验收标准 8.3**：部分失败后的重试应复用同一 `model_selection` intent 身份；服务端应重新验证当前选择与偏好，避免重复副作用。若当前 Run 已不允许模型切换，则保留默认偏好失败的可见提示并返回稳定拒绝，不得绕过状态检查单独写入偏好。

### 需求 9：Goal Board 迁移与验证

作为维护者，我希望控制状态只有一个 reducer，页面不再因控制事件全量刷新。

- <a id="spec-req-9-1"></a>**验收标准 9.1**：Goal Board 的会话、命令、队列、权限、Grant、模型选择与审批消费应统一读取控制 reducer；不得继续在多个 hook 中分别维护 busy／error／unknown 或重复 list／revoke 逻辑。
- <a id="spec-req-9-2"></a>**验收标准 9.2**：`refreshSelectedSession`／`onRefreshSession` 不得由普通控制事件触发；它们只用于显式用户刷新、首次同步失败兜底与分页读取。
- <a id="spec-req-9-3"></a>**验收标准 9.3**：现有视觉布局、Activity／Trajectory 展示、候选正文与交互表单重设计保持不变；本次只替换控制消费路径。
- <a id="spec-req-9-4"></a>**验收标准 9.4**：当功能交付时，应通过 reducer 单元测试、Browser 投影测试、wire 生成与校验测试、真实 SSE 集成测试、Goal Board 组件／Hook 测试和至少一条 Chrome 端到端流程；覆盖重复 intent、未知结果核验、审批失效、迟到事件、部分成功与 stream fault。
- <a id="spec-req-9-5"></a>**验收标准 9.5**：应更新变化所有者的中文 TSDoc、模块概览与语义表，并删除被替换的旧事件压扁、旧命令状态机与双解析路径；不得保留两套可推进实现。

## 架构与核心决策

### 系统拓扑与接口

```text
Goal Board
  ControlIntent + frozen payload
        │ HTTP
        ▼
Goal Server / Browser command service
  ControlReceipt (accepted | existing | rejected | unknown)
        │
        ▼
Runtime authority (Snapshot / receipts / revisions)
        │ SessionOutputEvent
        ▼
Browser control projection
  ControlEvent (facts) + ControlSnapshot
        │ SSE
        ▼
Goal Board control reducer
  ControlState = snapshot + intents + toolActivities + resources + connection
        │ selectors
        ▼
UI
```

控制协议分两层：

- **ControlReceipt**：命令受理结果，由 HTTP 命令端点返回。
- **ControlEvent**：Runtime 实际事实，由 SSE 发布。

`intent_applied`／`intent_rejected` 是 reducer 根据 receipt 与事实派生的本客户端状态，不是 Runtime 事件，不进入 SSE 事实流。这保证页面可以统一展示命令进度，同时不把 UI 意图伪装成领域事实。

`intentId` 是客户端控制身份，不写入 Goal Snapshot。对 `session_input`，它与 `input.inputId` 相同；对 `create_session`，它可由客户端生成并与 `goalId`／首条 `inputId` 关联；服务端在 receipt 中原样回显，但领域幂等仍由既有 `inputId`／revision 规则决定。

### 核心数据形状

```ts
type ControlScope =
  | "session" | "activity" | "trajectory" | "metrics"
  | "goals" | "grants" | "permission" | "model";

type ControlIntent =
  | { kind: "create_session"; intentId: string; goalId: string; inputId: string; intent: string; mode?: "plan"; modelId?: string }
  | { kind: "session_input"; intentId: string; goalId: string; input: BrowserSessionInputCommand }
  | { kind: "plan_mode"; intentId: string; goalId: string; runId: string }
  | { kind: "model_selection"; intentId: string; goalId: string; runId: string; modelId: string; providerProfileId?: string; persistAsDefault: boolean }
  | { kind: "permission_mode"; intentId: string; mode: BrowserPermissionMode; expectedRevision: number }
  | { kind: "grant_revoke"; intentId: string; goalId: string; runId: string; grantId: string; scope: "goal" | "workspace"; grantKind?: "tool" | "sandbox" }
  | { kind: "goal_archive"; intentId: string; goalId: string; archived: boolean }
  | { kind: "goal_delete"; intentId: string; goalId: string }
  | { kind: "action_review"; intentId: string; goalId: string; runId: string; actionId: string; input?: unknown; scope?: BrowserActionReviewScope };

type ControlReceipt =
  | { intentId: string; status: "accepted" | "existing"; acceptedAtRevision?: number; result: ControlIntentResult }
  | { intentId: string; status: "rejected"; code: string; actualRevision?: number }
  | { intentId: string; status: "unknown" };

interface ControlIntentState {
  readonly intent: ControlIntent;
  readonly phase: "pending" | "accepted" | "applied" | "rejected" | "unknown";
  readonly receipt?: ControlReceipt;
  readonly verification?: "applied" | "not_applied" | "unknown";
}

interface ToolAttempt {
  readonly attempt: number;
  readonly phase: "started" | "failed" | "returned";
  readonly reason?: string;
}

interface ToolActivity {
  readonly actionId: string;
  readonly executionUnitId: string;
  readonly toolId: string;
  readonly attempts: readonly ToolAttempt[];
  readonly phase: "started" | "attempting" | "retrying" | "result_pending" | "observed_committed" | "unknown";
  readonly outcome?: "success" | "failure";
  readonly summary?: string;
}

interface ControlSnapshot {
  readonly goal: BrowserGoalSessionState;
  readonly session: BrowserSessionState;
}

interface ControlResources {
  readonly goals?: BrowserGoalList;
  readonly grants?: readonly BrowserToolGrantSummary[];
  readonly permission?: Extract<BrowserPermissionModeResult, { readonly ok: true }>;
  readonly model?: BrowserModelCatalog;
}

interface ControlState {
  readonly snapshot: ControlSnapshot;
  readonly intents: readonly ControlIntentState[];
  readonly toolActivities: readonly ToolActivity[];
  readonly resources: ControlResources;
  readonly connection: { readonly connected: boolean; readonly synced: boolean; readonly staleScopes: readonly ControlScope[] };
}
```

`ControlIntentResult` 按 kind 复用现有命令结果字段，不维护第二份字段表：

- `create_session`：`goalId`、`runId`、首条 `receipt`。
- `session_input`：`BrowserSessionInputReceipt`。
- `plan_mode`：`AcceptedCommand`。
- `model_selection`：`selection` 与 `defaultPreference` 子结果。
- `permission_mode`：`mode`、`revision`、`workspaceId`。
- `grant_revoke`：`grants`。
- `goal_archive`／`goal_delete`：`ok`。
- `action_review`：`BrowserActionReview`。

### 控制事件

`BrowserGoalEvent` 原位替换现有 `BrowserGoalLiveEvent`，同一 Goal SSE 端点，不保留旧事件双解析。`BrowserGoalEvent` 是 `BrowserControlEvent` 与 `BrowserContentEvent` 的并集：

- `BrowserControlEvent`（控制事实）：`state_sync`、`state_committed`、`input_result`、`interaction_opened`、`interaction_settled`、`run_status_changed`、`run_result`、`tool_activity`、`stream_fault`、`closed`。
- `BrowserContentEvent`（内容事实）：`generation_event`、`message_committed`、`candidate_preview`、`candidate_invalidated`。

`state_committed` 至少携带 `goalId`、可选 `runId`、`commitRevision` 与 `changed: ControlScope[]`。`stream_fault` 携带 `code: "gap" | "read_failed" | "backpressure" | "publisher_closed"` 与 `resync: ControlScope[]`；无法确定受影响范围时保守报告 `session`。`run_status_changed` 与 `run_result` 不得再折叠为 `activity_boundary`；`interaction_settled` 不得再折叠为 `user_wait` 边界。

`state_committed` 应尽量携带可直接应用的控制字段；字段不足时，页面只重读 `changed` 中的 `session`，不得重读未声明 scope。

若 Runtime 当前提交边界事件不直接携带 `changed`，Browser 投影必须从同一次提交的来源事件确定性映射 scope；无法确定时保守报告 `session`，不得把全部 scope 一律标为失效。

`ControlSnapshot` 由 Browser 控制投影组装。若当前 Runtime `state_sync` 的窄状态不足以生成完整快照，Browser 可在首次同步／重连时读取一次同一提交边界的 Goal 快照并绑定 `commitRevision`；后续增量事件不得重复完整读取。

### 作用域与失效

`ControlScope` 的稳定含义：

| Scope | 内容 |
| --- | --- |
| `session` | Run 状态、交互、队列、待处理 Action、提交修订、执行所有者 |
| `activity` | Activity 页、工具活动与 Observation 历史 |
| `trajectory` | Trajectory 页与执行事实 |
| `metrics` | 会话／Run 指标 |
| `goals` | Goal 列表、归档与删除 |
| `grants` | Tool／Sandbox Grant 摘要 |
| `permission` | 项目权限模式与 revision |
| `model` | 当前模型选择与模型目录 |

事件只声明实际变化的作用域。页面只失效并重读声明范围；`session` 由 `state_sync` 或显式读取恢复，`activity`／`trajectory`／`metrics` 按现有 cursor 分页读取。

`ControlSnapshot` 只拥有 `session` 作用域；`ControlResources` 持有 `goals`、`grants`、`permission` 与 `model` 的独立资源投影；Activity／Trajectory／Metrics 保持在各自窗口。收到某 scope 失效时，页面只把该 scope 标记为 stale 并调用对应读取入口，不得用一次完整 Goal session 重读替代 grants／permission／model／goals 的定向读取。`goals`、`grants`、`permission` 与 `model` 的跨客户端实时性沿用现有读取与刷新能力，不由 Goal SSE 保证逐变更推送。

### 意图状态与核验

`ControlIntentState` 的阶段为 `pending` → `accepted` → `applied`，或 `rejected`／`unknown`。同步提交类命令在 receipt 后直接进入 `applied`；`create_session` 与 `session_input` 在 receipt 后保持 `accepted`，直到 `input_result` 的 `receipt.status` 为 `applied` 或 `state_sync` 确认对应 Goal／消息；`action_review` 在 `accepted` 后终止，不进入 `applied`。

统一 `verify(intentId)` 是 reducer／客户端操作，不是新的服务端收据接口。它按 kind 复用现有读取：

| Intent | 核验来源 |
| --- | --- |
| `create_session` | Goal 是否存在、首条 `inputId` 收据、当前 Run |
| `session_input` | `GET inputs/:inputId` 收据 |
| `permission_mode` | 当前权限模式与 revision |
| `grant_revoke` | 当前 Grant 摘要中该 `grantId` 的状态 |
| `goal_archive`／`goal_delete` | Goal 列表／存在状态 |
| `model_selection` | 当前模型选择与偏好状态 |
| `action_review` | 当前 `pendingAction` 与 `reviewRef` |

核验只允许把 `not_applied` 重新提交为同一 `intentId` 与同一冻结载荷；`applied` 结算为成功，`unknown` 保持待核验。页面不得用读取失败推断“未执行”。

### 审批会话与工具活动

`ApprovalSession` 是 reducer selector，不是独立持久化资源。状态为 `unreviewed`、`reviewing`、`reviewed`、`submitting`、`accepted`、`settled`、`invalidated`、`unknown`。`action_review` 成功产生 `reviewed`；`respond` 受理产生 `accepted`；`interaction_settled` 或 `pendingAction` 清除产生 `settled`；`pendingAction` 身份、最终参数或授权范围变化，或相关提交事实证明当前等待已变化时，旧 review 失效。审批会话只拥有审阅／提交／结算阶段；`human-interaction` 拥有的问题草稿、逐题导航与表单编辑状态仍留在页面，二者不得互相覆盖。

`ToolActivity` 以 `actionId` + `executionUnitId` 为活动身份，内部 `attempts` 按 `attempt` 区分。状态为 `started`、`attempting`、`retrying`、`result_pending`、`observed_committed`、`unknown`；`observed_committed` 携带 `success`／`failure` 结果。工具返回只进入 `result_pending`；Observation 已提交的控制事实或 `state_committed.changed` 包含 `activity` 时才进入 `observed_committed`。旧 attempt 与低 cursor 事件不得回退状态。

### 相关联 Spec 与职责边界

| Spec | 关系 | 本次边界 |
| --- | --- | --- |
| [session-output-protocol](../session-output-protocol/spec.md) | 已交付的统一会话输出所有者 | 复用其 `SessionOutputEvent` 语义；本次修复 Browser 投影中被压扁的 Run／交互／故障事实，不修改该 Spec |
| [human-interaction](../human-interaction/spec.md) | 已批准的交互协议与表单重设计所有者 | 复用 `respond`、交互视图与审批语义；本次只做通用 intent／receipt／reducer，不重做表单 |
| [goal-board-streaming](../goal-board-streaming/spec.md) | 现有 Activity／时间线／候选展示所有者 | 保留 Activity 与候选路径；本次只替换控制消费与失效来源 |
| [goal-board-architecture-refactor](../goal-board-architecture-refactor/spec.md) | 现有 Hooks／Context 分工所有者 | 新增控制 reducer 与 selector，不重新引入上帝文件，不扩大全树重渲染 |
| [streaming-session](../streaming-session/spec.md) | 输入受理、收据、队列与提交修订所有者 | 复用 `inputId`、收据、`queueRevision` 与显式恢复；不新增队列或执行循环 |
| [permission](../permission/requirements.md) | 授权、审批与沙箱语义所有者 | 只增加控制 receipt 与核验；不改变授权判定或审批语义 |
| [action-approval-revision](../action-approval-revision/spec.md) | `reviewRef` 与修订审批语义所有者 | 复用预检与提交链；不新增审批权威 |

控制契约与内容契约可以并行实现：`web-contracts`／`browser` 可用 fixture 验证 projection，`goal-board` 可用纯 reducer 验证 intent／event；真实 SSE 与审批集成验证需要 Runtime 与 Browser 的真实事件。`human-interaction` 的完整表单可在其自身 Spec 下并行推进，但集成时必须使用同一 `respond` 与交互引用。

`specs/shared-json-types` 是未批准的 JSON 静态类型草案；本 Spec 不依赖其具体类型命名。若其获批，只替换 JSON 类型别名，不改变本 Spec 的 intent／receipt／event 语义。

### 核心决策

- **原位替换，不保留旧事件**：Goal SSE 直接迁移到 `BrowserGoalEvent`。备选的双端点或旧事件双解析会长期保留两套控制语义，且违反当前开发期不保留兼容层的规则。
- **Receipt 与 Event 分离**：receipt 只表达命令受理，event 只表达 Runtime 事实，reducer 派生展示状态。备选让 Runtime 为所有命令发布 `intent_applied` 会把 UI 意图引入领域层，并使多客户端观察到不属于自己的意图。
- **`state_sync` 权威快照**：首次同步直接应用 `ControlSnapshot`，不再每个事件全量重读。备选继续保持“事件即刷新提示”会让页面持续依赖 HTTP 快照和本地竞态处理。
- **作用域失效**：事件声明 `ControlScope`，页面按域重读。备选每次 `snapshot_changed` 都重读 session／activity／goals 会放大延迟与竞态。
- **派生 ApprovalSession**：审批状态由 `pendingAction`、`reviewRef`、收据与修订派生，不新增 Snapshot 字段。备选持久化 ApprovalSession 会复制审批权威，并与 `human-interaction` 的等待所有者冲突。
- **统一 verify，复用资源身份**：不新增通用收据存储。备选为所有命令持久化 `ControlIntentReceipt` 会引入新的存储模型和生命周期，而现有资源身份已能支撑核验。
- **模型选择原子化**：一次 `model_selection` 完成选择与可选默认偏好，部分失败以子结果报告。备选保留 UI 第二次 `setModelPreference` 会让部分成功与重试继续散落在页面。
- **Provider Profile 排除**：全局设置不是 Goal/Workspace 控制流，保持独立管理入口，避免把所有设置命令塞进会话控制。

## 风险与否定性保证

- **风险评估**：中等。改动跨 `web-contracts`、`browser`、`goal-board`、`goal-server` 与少量 Runtime 投影字段，属于公开 wire 与跨组件行为变化；不改变权限、审批、沙箱、完成证据或持久化语义，也不做破坏性迁移。关键操作是命令幂等、审批状态失效、`commitRevision` 单调性与事件乱序处理；这些需要失败路径、重连和集成验证。
- **否定性保证（Invariants）**：
  - Runtime 事实与 reducer 派生状态不得混用；`intent_applied`／`intent_rejected` 不得作为 Runtime 事件发布。
  - `ControlReceipt` 的 `accepted` 不得被解释为已应用；`input_result`、`state_sync` 与 `state_committed` 才是应用事实。
  - 页面不得在未收到 receipt 或事实前乐观修改权威控制状态；草稿与临时展示可以本地保存，但不得写成已受理或已应用。
  - 低 `commitRevision`、旧 cursor 或旧 attempt 的事件不得覆盖已确认状态；无法证明顺序时应报告缺口并重新同步，不得猜测。
  - `reviewRef` 变化、`pendingAction` 变化，或相关提交事实证明当前等待已变化时，必须使旧审批会话失效；旧参数不得用于新审批。
  - 工具返回（`result_pending`）不得显示为 `observed_committed`；Run `waiting` 不得显示为 completed。
  - 不新增第二套 SSE 控制流、旧事件双解析、通用收据存储或持久化 ApprovalSession。
  - 不改变 `strip`／`reject` 的边界策略、权限判定、审批规则、Interrupt 收尾或完成证据规则。
  - 不修改 `session-output-protocol`、`human-interaction`、`goal-board-streaming` 或 `goal-board-architecture-refactor` 的 Spec 内容；仅在本 Spec 中引用其契约。
  - Provider Profile CRUD、全局模型偏好与 Provider 设置不在本次控制流内。

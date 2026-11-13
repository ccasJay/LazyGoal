---
feature: web-manual-goal-continuation
status: proposed
risk: high
created_at: 2026-11-13
delivered_at: null
supersedes: []
superseded_by: null
---

# Web 手动 Goal 的终态续接

## 目标与范围

用户通过 Web 的 **New goal** 主动创建 Goal 后，可以在当前 Run 已完成、失败或取消时发送普通消息，在同一 Goal 中启动下一 Run 并保留历史。
Supervisor 自主准入并派发的 Goal 不接收 Web 普通续聊，仍可在当前 Run 终态结算后，通过经认证和授权的续接指令 Trigger 在同一 Goal 中启动下一 Run。本次不恢复运行中排队、Steer 或自动重试。已有审批、交互回答、停止和检查点恢复继续按各自的权限与状态规则处理。

## 用户故事

- **S1** 作为手动创建 Goal 的用户，我希望 Run 结束后仍能在原 Goal 中补充或更正输入，以便接着已有历史工作。
- **S2** 作为获授权的 Trigger 发起方，我希望能向已经结束一轮执行的派发 Goal 提交新指令，以便继续原有工作并保留历史。Web 用户仍可使用该 Goal 已有的控制和交互入口。
- **S3** 作为提交后未收到回执的用户，我希望能查询原提交的结果，以便避免重复创建 Run。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 已认证的 Web 用户通过创建入口提交工作 | 持久记录由服务端确认的手动创建来源，与原始 work Trigger 一起受理。初次路由和重启后的路由都以该记录判断来源。切换 Worker、重启 Web 或更新浏览器会话不改变已创建 Goal 的资格，访问仍须通过现有 Web 认证和 Goal 可见性检查。 | 覆盖创建成功、受理后冻结前重启、发布后重启及换浏览器会话。 |
| R1.2 | S2 | 异常 | Goal 由 Supervisor 自主准入，或已有 Goal 缺少可信创建来源 | Web 不展示普通消息输入框，直接请求 Web 普通消息接口也被拒绝。拒绝后消息、Run、Trigger 和执行队列均无变化。来源相同为 `external`、在 Web 打开 Goal 或原请求自称手动创建，均不能取得 Web 续聊资格。 | 用 UI harness 的 Session 场景断言派发 Goal 和缺少可信来源的 Goal 不显示输入框。用真实 HTTP 集成覆盖派发、来源缺失及伪造来源的拒绝和无写入。 |
| R2.1 | S1 | 状态 | 手动 Goal 的当前 Run 为 `completed`、`failed` 或 `cancelled`，其终态已结算且可接收续接 | Activity 显示普通消息输入框。连接状态未确认或终态仍在结算时禁用提交。运行、等待及可恢复检查点沿用当前操作入口，普通消息不得代替等待回复。 | 用 UI harness 验证三个终态和不可提交状态。复用 `send-message` 流程，增加从 `failed` 开始的场景，断言只发送一条绑定旧 Run 的命令，并在原 Goal 的 Activity 中看到新 Run 的消息和结果。 |
| R2.2 | S1 | 事件 | 用户向符合条件的 Goal 提交非空消息，提交绑定的 Run 仍是当前已结算终态 | 追加一条用户消息、保留上一 Run 的历史并创建一个新 Run。沿用原 Goal、授权和工作区，按既有续接规则处理 Run 模式和上下文，由 Supervisor 排队并分配 Worker。回执可在消息持久受理后返回，模型执行结果由新 Run 的状态和事件报告。 | 真实 Worker 集成测试覆盖三个终态，断言 Goal ID 相同、Run ID 更新、历史保留、消息只追加一次，并在挂起模型时收到回执。 |
| R2.3 | S1、S2 | 异常 | 普通消息或续接指令为空、目标 Run 已过期、上一 Run 尚未结算或已有续接占用同一终态 | 后端拒绝且不创建额外 Run。两条不同身份的输入争用同一终态时，至多一个被受理，包括 Web 提交与直接提交的续接 Trigger 同时到达。失败 Run 的动作和副作用不会因为续接被自动重放。 | 验证两种入口并发、迟到提交及暂缓旧 Worker 结算，核对输入数、Run 数、调度和工具调用记录。 |
| R2.4 | S2 | 事件 | 经认证的发起方通过 Trigger 入口提交获授权的 `instruction.continue`，且明确指向已有 Goal 和当前已结算终态 | 在同一 Goal 中提交指令正文并创建下一 Run，保留来源 Trigger、旧 Run 历史和原有授权上限。Supervisor 排队并分配 Worker，后继 Run 的进度和结果关联此指令。此入口不依赖 Web 续聊资格，也不要求发起方具有 Supervisor 角色。 | 对 Supervisor 派发的 Goal 先验证 Web 普通消息被拒绝，再分别以获授权的外部来源和 Supervisor 提交指令，验证真实 Worker 执行、输入来源和响应关联。 |
| R2.5 | S2 | 异常 | 续接 Trigger 的提交者未获此动作或目标 Goal 授权，或 `replyTo` 不属于该 Goal 和 Run 的已结算终态 | 受理前拒绝，不提交输入或启动 Run。调用者声明的来源须与认证身份一致。Web 普通消息接口不能靠提交指令类型绕过来源限制。 | 覆盖伪造来源、缺少动作授权、跨 Goal 或跨 Run 引用及错误的终态响应。 |
| R3.1 | S3 | 异常 | 受理后回执丢失，或服务在受理、快照提交、重新入队之间退出 | Web 用原 Goal 和输入 ID 查询受理、应用或拒绝结果。同一 ID 与相同目标、内容的 Web 重试只核验或返回原结果，身份复用但内容或目标不同则冲突。直接重复提交 Trigger ID 仍按 Trigger 协议拒绝。重启按原身份完成已受理的 Web 消息或直接提交的续接 Trigger，后续查询仍能定位该输入对应的 Run ID。 | 在三处提交边界注入故障并重启，验证一次追加、一次分配、原身份收据和 Trigger 重复拒绝。核验失败时 UI 保留原身份和输入。 |

组合：用真实 Web、Supervisor 和 Worker 配合受控模型，重现首个 Run 模型请求失败后在同一 Goal 发送新消息，再验证新 Run 的实时进度和终态。以 Supervisor 自主派发的 Goal 验证 Web 无法续聊但授权 Trigger 能继续执行，并在指令受理后重启验证只产生一个后继 Run。按 [UI harness 说明](../../apps/goal-board/notes/ui-harness.md) 运行交互、截图、诊断和视觉回归，fixture 用于验证界面及 wire 行为，授权、持久化、调度和重启恢复由真实集成测试验证。实施后运行 `npm run contracts:generate -- --check`、`npm run check:dependencies` 和 `npm run check:docs`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 在 [Supervisor 准入](../../apps/goal-server/src/runtime/trigger-admission.ts) 接受 work Trigger 时，将已认证的 Web 创建入口作为宿主持久元数据记录，沿 Goal 的原始 `triggerContext.triggerId` 读取。 | 当前宿主 `user` 与其它外部调用在 Trigger 中都可表示为 `external`，浏览器 Actor ID 也随会话令牌变化。资格应随 Goal 来源稳定保留。 | 依赖 Actor 角色、工作区模式、当前浏览器 ID，或为历史 Goal 猜测和补写来源。 |
| [Web 命令](../../packages/web-contracts/src/wire.ts) 复用 `session_input/message` 与 `inputId`，要求绑定预期终态 `runId`。[Web 后端](../../apps/goal-server/src/browser-session-port.ts) 核对普通消息资格后，将输入转换为 `instruction.continue`。Trigger 入口按 `type` 和 `payload.action` 识别续接语义，按宿主认证与动作、目标 Goal 授权裁决。Supervisor、Worker 或外部 Actor 均可在各自授权范围内提交，仍由 Supervisor 受理和路由。Trigger 携带文本和目标 Run，并以 `replyTo` 关联该 Run 的终态响应。 | 两个入口共用后继 Run 提交逻辑，各自核验授权。保留 Web 输入或直接提交的续接 Trigger 的真实来源，模型可读取指令正文，历史可追溯原 Trigger。续接指令使用固定名称，免去模型命名。 | 按正文推断指令，或把取消、检查点恢复等其它 `instruction` 动作当成续接。 |
| [Supervisor 调度器](../../apps/goal-server/src/runtime/worker-scheduler.ts) 按 Goal 串行受理、核对终态快照与上一 Worker 的结算，持久绑定输入身份，再使用 [Coordinator 续接](../../packages/runtime/src/goal-coordinator.ts#L864) 的领域逻辑提交下一 Run。将提交与推进拆开，按现有队列重新分配 Worker。 | 保留已有同步 `continue` 调用能力。续接记录与快照通过同一输入身份及新 Run 关联，重启以已提交快照为准补做未完成的排队步骤。后继 Run 按本次受理顺序排队，保持 FIFO 和每个 Goal 单执行名额。后继 Run 的进度和结果关联本次续接指令。 | HTTP 内等待整个 Run，重新创建 Goal 或直接在 Web 适配层改写 Run 快照。 |
| Web 会话和控制同步使用后端投影的续接可用性，Activity 复用现有 `MessageComposer`，提交、核验与错误处理复用现有控制收据。 | UI 可以说明暂时不可用的原因，后端仍在受理时核对最新状态。收据的 `targetRunId` 指向上一 Run，应用后 `appliedRunId` 指向新 Run。真实服务和 fixture 使用同一约定。 | 浏览器自行推断来源，或把查询时的当前 Run 当成旧提交的结果。 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| high | 来源校验授予已有 Goal 的执行资格。续接指令不得扩大 Goal 的既有工具、工作区或执行权限。旧 Worker 结算、快照和队列分开持久化，竞态或恢复错误可能触发重复执行。 | 使用临时工作区、受控模型和真实 Worker 验证。 |

## 任务

- [x] //TODO 1. 持久化手动创建来源并接入重启后的准入判断 → R1.1、R1.2；检查：来源、恢复与越权的定向测试。
- [x] //TODO 2. 接通 Web 终态消息与各授权来源的续接指令的授权、持久受理和后继 Run 调度 → R2.2、R2.3、R2.4、R2.5、R3.1；检查：续接契约生成、真实 Worker、授权拒绝、并发与故障恢复测试。
- [x] //TODO 3. 恢复手动 Goal 的终态输入框和原身份核验，对齐 Session fixture 的命令与收据，补齐失败续接及来源限制场景，并更新所属模块契约说明 → R1.2、R2.1、R3.1；检查：Goal Board 编译、`npm run check:ui-harness` 与 Activity 定向流程。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无

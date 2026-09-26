# Goal 看板单会话后端验证设计

## 审批摘要

### 方案

增加显式的本机浏览器入口，由同一 LazyGoal 进程提供看板页面、受保护的会话 API 和实时连接。页面沿用原型主要布局，所有可推进会话的操作通过既有 Launcher、GoalCoordinator 与持久化边界执行；已提交历史由快照和 Trajectory 重建，实时事件只作临时展示。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 同源本机入口 | 使用显式浏览器命令启动现有回环 HTTP 服务，同源提供构建后的页面和 API；Vite 保留纯界面预览。 | 默认 TUI 不变；验证入口无需跨来源授权。 |
| 会话访问授权 | 启动时生成随机短期能力凭据，经本机 URL 片段交给页面；API 和实时连接均校验凭据、Host 与来源，不返回原始 Runtime 对象。 | 本机其他网页及无凭据客户端不能读写 Goal；重启需使用新入口 URL。 |
| 真实命令边界 | 浏览器仅提交带 Goal/Run 及等待请求身份的类型化命令；创建时提供稳定 Goal ID 以处理重试；服务端串行复核最新快照，再调用现有创建、恢复或继续操作。 | 长时执行受理后由页面继续观察；旧审批、重复提交和跨 Run 操作被拒绝，工具授权仍由现有策略控制。 |
| 已提交状态与临时事件 | Snapshot 加提交边界内的 Trajectory 构成会话历史；只转发当前 Goal/Run 的公开实时进展，断线后重新取状态。 | 页面刷新及服务重启不重播旧流，也不把文本流结束当作完成。 |
| 单会话验证范围 | 看板只读取当前工作区正式 Goal；一次只推进选中的 Goal，原型中未接入的设置、项目及模拟动作不提供可执行假象。 | 保留主要宽窄屏布局，明确延后完整看板功能。 |

### 风险与待确认

- 风险等级：high；理由：浏览器命令可驱动模型、工作区工具和持久化状态。
- 关键操作：真实工具可能修改工作区；自动验收只在隔离工作区使用受控工具，用户日常使用时仍须在当前 Action 等待点明确批准。
- 风险：服务崩溃时命令响应可能丢失、工具结果可能未知；恢复以已提交快照和现有重放规则为准，不自动重复未知动作。
- 待确认：无。

## Overview

对应需求 1–7。新增独立于 React Ink 的浏览器适配层，复用现有工作区组合根及 Runtime 端口；不修改 Goal/Snapshot/Trajectory 协议。浏览器模式由显式 CLI 命令启动，并在退出时遵循组合根的中止、冻结与资源关闭顺序。用户确认了同源本机入口，开发时的 Vite 预览不取得真实会话权限。

## Architecture

```text
Browser Goal Board
    | same-origin HTTP + authorized stream
    v
Local Browser Adapter ----> GoalStore / GoalCatalog / TrajectoryStore
    |                         ^
    | typed commands          | committed facts
    v                         |
Launcher / GoalCoordinator -> Scheduler / Runner -> Tool Policy
    |
    +--> ExecutionStream (public live events) --> Local Browser Adapter
```

浏览器适配层拥有 wire 校验、访问授权、页面投影和命令排队；Runtime 继续拥有状态转换、工具授权、提交与恢复。看板数据只来自当前工作区正式 Goal 目录，避免将 Benchmark 聚合目录中的 Goal 混入此入口。TUI 的 `SessionController` 可作为交互映射参考，但不复用其全量 `UiSessionViewModel`、自动审批模式或内存页面状态作为 HTTP 契约。

## Key Design Decisions

### 同源本机入口

新增显式浏览器子命令，在已存在的 `HttpService` 上、开始监听前挂载静态页面和会话路由；只监听 `127.0.0.1`。构建产物随浏览器入口提供，原型的 React 组件和响应式布局作为实现基础。默认 `lazygoal` 仍打开 TUI。页面路由与 API 使用同一 origin；接口不启用 CORS，HTML 禁止外部脚本和资源，字体使用本地回退。

### 会话访问授权

浏览器模式每次启动生成高熵随机凭据，入口 URL 将其放在 fragment，服务端仅保存校验用值；页面从 fragment 读取并在 `Authorization` 头携带。包括实时流在内的受限读取与写入一律要求凭据；实时流采用支持自定义头的 `fetch` 流。服务端要求精确的回环 Host；写入还要求同源 `Origin`，并拒绝不符合的 Fetch Metadata 与非 JSON 请求。无效授权统一拒绝且不泄露 Goal 是否存在。页面设置限制来源的安全响应头及 `no-store` 缓存策略；网页不持久化凭据到应用数据、日志或 Snapshot，服务重启后新凭据生效。响应仅输出白名单字段、有限长度文本和已裁剪的工具摘要，不发送凭据、模型配置、内部推理、原始事件载荷或完整 Goal。

### 真实命令边界

服务端接收 `create`、`message`、`approve_task`、`feedback_task`、`answer_ask_user`、`approve_action`、`reject_action`；`message` 根据最新 Run 状态仅映射到普通等待的 `resume` 或 completed 的 `continue`。命令包含目标 `goalId`、当前 `runId`、请求 `requestId` 或 `actionId`（按种类适用）；每个写入在解析与大小限制后，按 Goal 加锁，读取最新快照并检查身份和等待类型，随后委托 `launch` 或 `GoalCoordinator`。`create` 使用客户端生成并经校验的稳定 Goal ID 作为重试键；服务端在调用 `launch` 前检查该 ID 是否已存在，避免响应丢失后的重复创建。队列中的并发或同一命令重试只返回已有进展，不并行推进；已提交审批的再次提交会因等待身份不再匹配而被拒绝。新 Goal 由当前已配置的 Profile、模型绑定与默认 Tool Policy 启动；浏览器不提供自动批准开关。

命令接受后返回命令身份及目标关联键；长时间模型执行在服务进程内继续，状态经读取和实时连接观察。服务仅保留进程内命令忙碌状态，避免并发提交；HTTP 断线不取消已经接受的执行，进程关闭则走现有中止与恢复边界。服务重启后不依据浏览器命令历史自动重放执行；页面重新查询最新快照。对于已保存批准但结果未知的 Action，遵守 Runtime 的 `outcome_unknown` 与 `replayPolicy` 处理，不从浏览器连接事件再次发起 Tool。

### 已提交状态与临时事件

看板使用 `GoalCatalog.listHistory` 的正式工作区目录摘要。会话读取 `GoalStore.restore` 和 `readTrajectoryAtSnapshot`，依据各 Run 的提交序列与消息区间投影有序消息、步骤、等待交互、可选 GoalPlan 和终态；不把未提交 tail 显示为稳定历史。投影只输出当前需求所需的安全视图，工具输出限长并保留截断标记。新快照提交时发出“重新读取”通知，而不是直接把进程内 Goal 发给浏览器。

实时连接仅订阅选中 Goal 的当前 Run、`public` 且非 reasoning 的 ExecutionStream 事件；对允许的进展种类再次做载荷白名单与长度限制。客户端用连接代际和 Goal/Run 身份丢弃迟到事件，临时文本/活动与已提交步骤分层显示；新快照到达后清除已覆盖的临时内容。连接断开、队列溢出或服务重启时重新读取最新快照并建立新订阅，不使用旧 cursor 恢复持久事实。只有快照中的 Run 状态决定完成、失败、取消或等待展示。

### 单会话验证范围

将原型内存数据源替换为真实看板与会话投影，并保留卡片、会话面板、展开及窄屏返回等主要操作。搜索、筛选等纯本地视图操作可以保留；与需求无关的项目、设置、Profile、示例流、伪计划和模拟“批准”动作应隐藏或禁用。切换卡片只更换读取和订阅目标，不隐式推进 Goal；已接受的执行继续归属原 Goal，在其结束前对其他 Goal 的推进命令返回忙碌错误。

## Components and Interfaces

| 边界 | 最小契约 |
|---|---|
| `BrowserSessionRoutes` | 同源页面、授权的 Goal 列表/详情、类型化命令和单 Goal 实时流；对外返回稳定错误码及安全消息。 |
| `BrowserSessionService` | 注入正式 Goal Catalog、Store、Trajectory 读取器、Launcher、Coordinator、提交通知与 ExecutionStream；管理活动 Goal 锁和命令生命周期。 |
| `BrowserGoalView` | 只含 `goalId`、当前 `runId`、意图、状态、消息/步骤摘要、可选 GoalPlan、当前等待请求与安全错误；不含完整 `Goal` 或 Trajectory Event。 |
| 浏览器状态适配器 | 从列表/详情读取稳定历史，从流追加临时进展；所有写入带当前视图身份，失败后重新读取。 |

`BrowserSessionService` 与浏览器 DTO 若成为公开 TypeScript 接口，按仓库要求提供中文契约级 TSDoc 与最小示例。HTTP 输入在 wire 边界严格校验，避免把当前类型系统保证的进程内值重复验证。

## Error Handling

无效身份、已过期审批或不适用的 Run 状态返回可识别的 4xx，并附当前可安全读取状态的刷新提示；输入过大或格式错误在 Runtime 调用前拒绝。快照/Trajectory 损坏或基础设施失败返回 5xx，页面保留上次已确认内容并标为可能过期，随后允许重新读取。命令受理与结果展示分离：网络超时的客户端先按关联键查询，不盲目重发有副作用命令。关闭服务时停止接收新命令和订阅，再完成现有关闭流程；订阅异常不会改变 Run 状态。

## Testing Strategy

- 用隔离工作区、确定性模型与受控工具，浏览器驱动从创建 Goal 到真实消息、步骤、`ask_user`、任务提案、Action 审批和 completed 后继续；核对页面与快照/提交轨迹一致（需求 1–4、7）。
- 在等待、运行和工具动作边界刷新页面、断开流、重连并重启服务；核对同一 Goal/Run 的提交历史、无重复步骤和未知结果动作的重放策略（需求 2、5、7）。
- 从其他 origin、无凭据、错误 Host、过期 Goal/Run/requestId/actionId 与重复提交发起读取或写入；确认均不推进模型/工具，也不泄露敏感字段（需求 3、6–7）。
- 检查宽窄屏主要布局及禁用的原型动作，并运行受影响的 HTTP、Runtime、TUI 回归；默认 CLI 启动保持 TUI（需求 1、7）。

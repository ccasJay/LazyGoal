---
feature: goal-board-state-admission
status: proposed
risk: medium
created_at: 2026-11-11
delivered_at: null
supersedes: []
superseded_by: null
---

# Goal Board 按视图代次与提交修订接纳状态

## 目标与范围

让当前 Goal 的 Run 状态、等待项和审批决定始终基于同一份已确认的控制状态，避免迟到的 HTTP 响应或 SSE 事件恢复旧状态。
覆盖当前会话的首次读取、手动刷新、定向刷新和 SSE 重连。沿用现有命令与传输格式，以及 Activity、Trajectory 和完整历史各自的读取边界。

## 用户故事

- **S1** 作为查看和操作 Goal 的用户，我希望切换会话或收到迟到响应时仍看到当前 Goal 的最新已确认状态，以便针对正确的 Run 和等待项操作。
- **S2** 作为查看执行历史的用户，我希望断线或读取失败时保留已加载内容，并能继续读取固定窗口内的历史，以便恢复观察或查阅旧记录。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 同一 Goal 已接纳 revision 2 的完成或等待状态，revision 1 的窄 HTTP 响应或 `state_sync` 随后抵达 | 保留 revision 2 的状态、等待项和按钮，低修订结果不清除当前失效标记。较高修订可由 HTTP 或 SSE 推进 | 受控交错首次、手动、定向状态读取与 SSE，断言两种到达顺序下会话和审批读取同一状态 |
| R1.2 | S1 | 事件 | 从 A/revision 10 切到 B/revision 1，随后旧 A 的 SSE 事件或 HTTP 结果抵达 | 接纳 B 的状态，切换时清除 A 的会话控制与连接状态。旧 A 无法恢复审批、同步标记、内容或错误 | reducer 与 Chrome E2E 在切换后放行 A 的事件，核对当前 Goal、同步状态和 B 的审批 |
| R1.3 | S1 | 异常 | A → B → A，或关闭后重新打开 A，第一次观察 A 的异步结果仍在途 | 淘汰旧视图代次的成功、失败与收尾更新，即使返回修订较高。保留新视图的加载状态、内容和错误 | 分别延迟窄读取、完整会话和 Activity 读取，断言旧结果不能写入第二次打开的 A |
| R1.4 | S1 | 事件 | 同一 Goal 进入后继 Run，或当前等待已经结算或被替换 | 接纳同 Goal 更高修订的后继 Run。旧 Run 的状态事件、旧等待及旧审批预检结果无法重新显示为可提交项，决定仍绑定当前等待引用 | 流事件测试覆盖迟到 Run 状态和交互事件。Chrome E2E 核对旧审批消失，实际控制请求只携带当前等待的 `requestId` |
| R1.5 | S1 | 异常 | 窄 HTTP 投影或 SSE 组装期间，同一 Run 又发生一次提交 | 供控制接纳的 Goal 状态和会话修订来自同一提交。SSE 无法对齐时省略组合快照，由客户端定向读取窄状态 | 服务端受控交错两次同 Run 提交，断言 HTTP 配对一致，SSE 给出一致快照或触发定向恢复 |
| R2.1 | S2 | 异常 | SSE 断线，随后收到低修订同步、缺少组合快照的同步，或恢复读取失败 | 保留最后确认状态与草稿，显示现有断线或读取错误。仅在当前连接接纳的快照或窄读取达到当前已确认修订及该连接声明的同步修订后恢复同步。单纯断线沿用现有提交行为 | Chrome E2E 控制重连和 HTTP 响应，核对内容、连接提示和提交限制，确认有效快照不触发历史重读 |
| R2.2 | S2 | 异常 | 当前视图刷新失败，或失败晚于一次已成功的新状态读取 | 当前有效失败保留已有内容和草稿，沿用错误、重试及提交限制。已被后续有效状态覆盖的失败无法重新禁用提交或清除新错误 | 受控请求验证失败、成功恢复、旧失败晚到和首次无内容时的错误呈现 |
| R2.3 | S2 | 状态 | 当前实时状态已推进，用户仍在浏览较早的 Activity 或 Trajectory 窗口，或按需打开完整历史 | 依据各查询自己的 Run、cursor、水位和请求代次接纳历史。固定窗口仍可分页，历史结果不更新实时控制状态 | Activity 窗口回归和 Chrome E2E 固定旧水位、推进实时状态后继续分页，核对来源顺序与窗口位置 |

组合：在真实 Chrome 中交错 HTTP 和 SSE，经 Goal 切换、审批、断线与恢复观察按钮及控制请求。复用 `apps/goal-board/e2e` 的本地服务和 Chrome 入口，执行 `npm run build:web`、`npm run test:web-e2e` 与 `npm test`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 以 `refector/project-review` 的 `8daeb1e2` 为基线。由现有 `ControlState` 接纳窄 HTTP 与 SSE 的已确认状态，会话状态、等待与审批从同一结果派生。保留意图收据和 Workspace 资源的独立生命周期。[控制 reducer](../../apps/goal-board/src/control/reducer.ts#L167) · [页面接线](../../apps/goal-board/src/hooks/useGoalBoardApp.tsx#L126) | 两条快照写入路径会令状态展示与审批分叉，HTTP 更新也须参与同一判断。 | 无 |
| 先核对选择的 `goalId`、视图代次和 SSE 连接归属，再比较同一 Goal 的 `commitRevision`。真实选择变化、关闭或重开使旧代次失效。同一视图断线重连沿用已确认修订，后继 Run 沿用 Goal 的修订序列。[修订提交](../../packages/runtime/src/trajectory-checkpoint-committer.ts#L150) | Goal 身份限定修订比较范围，代次限定异步结果的接纳范围。 | 无 |
| 以已确认快照派生可提交操作。SSE 增量保留已有关联的意图、实时提示和工具活动处理，按 Goal、Run 与等待身份核验。只有可靠的提交证据才能推进快照修订。带修订的会话失效须由达到该修订的状态读取消除。需要重新确认等待或终态时走窄状态入口。[事件分流](../../apps/goal-board/src/control/event-routing.ts) · [审批派生](../../apps/goal-board/src/control/approval-session.ts#L58) | 部分增量事件无 `commitRevision`，也缺少重建待审批项所需的完整数据。 | 无 |
| Browser 复用已有投影，从同一已读取的 Goal Snapshot 生成窄状态配对。SSE 组合快照以同步事件的 Goal、Run 和修订核对该配对。沿用现有可选字段，缺少完整配对时维持定向恢复。[HTTP 路由](../../packages/browser/src/browser-goal-routes.ts#L446) · [SSE 快照](../../packages/browser/src/browser-session-port.ts#L594) | 仅对齐 Run ID 无法识别同一 Run 内不同提交的混读。 | 无 |
| 历史查询与实时控制共享当前视图的身份核验，各自维护请求顺序、cursor 和查询水位。[会话读取](../../apps/goal-board/src/hooks/useGoalSession.ts#L127) | `commitRevision` 只用于实时控制。历史页保留其明确请求的提交范围。 | 无 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| medium | 涉及 Browser 投影、HTTP/SSE 和页面控制状态。错误接纳可导致提交错误的等待引用，命令服务继续按既有规则验证 Goal、Run、等待身份及授权。 | 无 |

## 任务

- [x] //TODO 1. 对齐窄 HTTP 与 SSE 的已提交投影并固定同 Run 混读回归 → R1.5；检查：运行 Browser 定向路由与 SSE 测试。
- [x] //TODO 2. 统一当前视图的会话与审批状态接纳并淘汰旧观察 → R1.1、R1.2、R1.3、R1.4；检查：运行 reducer 与会话受控交错测试。
- [ ] //TODO 3. 固定重连、失败恢复和历史窗口行为并同步所有者文档 → R2.1、R2.2、R2.3；检查：运行连接恢复与窗口定向测试及 `npm run check:docs`。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无

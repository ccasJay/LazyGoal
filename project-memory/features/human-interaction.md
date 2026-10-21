---
feature: human-interaction
status: active
summary: 统一提问、任务审批与工具审批的交互协议、宿主处理函数和 Web 交互区域，所有决定都经 Runtime 提交
source_spec: specs/human-interaction/
distilled_at: 2026-10-21
reviewed_at: 2026-10-21
tags: [interaction, ask-user, task-approval, action-approval, session, host-handler, web-ui, recovery]
authorities: [packages/runtime/src/interaction-view.ts, packages/runtime/src/interaction-handlers.ts, packages/runtime/src/session-input.ts, packages/runtime/src/session.ts, packages/browser/src/browser-goal-routes.ts, packages/web-contracts/src/session.ts, apps/goal-board/src/interaction-panel.tsx, apps/goal-board/src/interaction-state.ts]
---

# 人机交互协议与 Web 交互区域

## Purpose

- 把模型澄清、任务批准、工具／沙箱批准与操作恢复统一为可辨识、可恢复的交互请求；未提交的模型文本不产生可操作表单。 [S1, S2, S3]
- 无界面宿主可按种类程序化决定或交给真人，Web 侧由统一交互区域承载，两者走同一 Runtime 提交与授权路径。 [S1, S2, S4, S7]

## Durable Decisions

- D1 — 交互视图由当前已提交等待派生，`interactionId` 由种类与既有等待身份构成（`question`／`task_approval` 用 `requestId`，`action_approval`／`action_recovery` 用 `actionId`）；重复同步、重复通知与重连得到同一引用，不同 Goal／Run 或新等待不继承旧引用，Snapshot 不复制一份可变请求正文。 [S1, S2, S3, S9]
- D2 — 决定一律是 `SessionInput.kind = "respond"` 的分支：逐题回答、整体回复、跳过三者互斥；整体回复替代整份问卷并追加真实用户消息后由同一 Run 继续，跳过提交“未回答并要求继续”控制语义，普通 `message` 只入队。逐题回答的事实保存与消息顺序沿用 `project-memory/features/preparation-phase-removal.md` 的 D3。 [S1, S2, S5, S10]
- D3 — 回答／批准与停止由同一 Goal 提交边界决定先后：Interrupt 先受理则旧交互引用失效，回答先受理时后续停止按最新 Run 状态处理而不回滚已提交事实；停止只能通过显式 Interrupt 输入表达，不得用跳过问卷、拒绝某工具或解除句柄冒充。中断意图与队列暂停、显式继续的机制见 `project-memory/features/streaming-session.md` 的 D4／D5，本篇只负责交互引用随受理失效这一侧。 [S1, S2, S5, S11]
- D4 — 宿主处理函数按种类分派（`onQuestion`／`onTaskApproval`／`onActionApproval`／`onActionRecovery`）；同一 Goal 只允许一个自动所有者，第二次连接明确返回 `HANDLER_CONFLICT` 而不替换，同一请求引用只投递一次；函数在短提交 Gate 外运行，携带局部取消信号与受同一边界保护的只读详情入口。 [S1, S2, S4, S9]
- D5 — 处理器结果只作为统一 `send` 受理：函数抛错、Runtime 业务拒绝与提交结果不明都按冻结的 `inputId` 核验原收据，不默认批准或拒绝、不重调函数；已被其他客户端结算、Interrupt 取代或终态到达时迟到结果不提交，解除连接不撤销已受理决定，不合作的 Promise 不拖住有界关闭。 [S1, S2, S4, S9, S14]
- D6 — 处理器投递只发生在本实例正常产生的等待，或宿主显式 `resume` 成功且仍需交互的历史等待上；注册处理器、读取详情与重新连接本身不推进历史任务，恢复被 busy 或状态错误拒绝时不开启投递，重新连接不承诺跨连接或跨进程 exactly-once。恢复门禁本身见 `project-memory/features/streaming-session.md` 的 D6。 [S1, S2, S4, S14]
- D7 — Web 侧由统一交互区域按已提交等待的种类、稳定引用与可用决定分派具体视图，整体替换旧 AskUser／任务批准／工具批准三套表单；提交状态机区分编辑、提交中、待核验、已受理与失效，结果不明时冻结原 `inputId` 与载荷并只允许原身份核验或重试，明确拒绝保留草稿并释放身份；页面草稿按请求引用隔离，不镜像到 localStorage。 [S1, S2, S7, S8, S12, S13]

## Guardrails

- 公开投影与事件只携带有界摘要；完整问题、任务范围与工具参数必须经按稳定引用核验的详情读取获得，详情读取失败时保留等待并禁用依赖完整范围的决定，不静默降级为批准，只读查询不推进执行。 [S1, S2, S3, S6]
- 问答整体回复与跳过不被解释为结构化批准，也不隐式批准任务或权限；带路线扩展审批的问卷只认既有明确批准选项，普通消息不代答。 [S1, S2, S5, S10]
- 宿主函数没有绕过 Runtime 的执行权：不直接调用 Tool、不修改 Goal、不写 Grant；`onActionRecovery` 必须单独注册，普通工具审批函数不得代答恢复等待。 [S1, S2, S4, S9]
- 页面草稿只在当前页面会话内保留，不承诺跨刷新恢复；关闭卡片、离开页面或取消本地回调不产生用户 Interrupt；重复停止不重置预算或绕过必要结算，停止中、收尾中与最终取消按真实阶段分别呈现。 [S1, S2, S11, S12]

## Revisit When

- 交互种类、响应联合或可用决定集合变化，或出现第二个自动处理器所有者的需求时。
- 宿主交互入口被提炼为公开 SDK，或要求跨进程 exactly-once 交付时。
- Web 交互区域再次整体重写，或引入通用表单引擎、可配置交互平台、图像与任意 HTML 输入时。
- streaming-session 的统一受理、收据、提交协调与显式恢复契约变化时。

## Sources

- S1: `specs/human-interaction/spec.md`
- S2: `specs/human-interaction/plan.md`
- S3: `packages/runtime/src/interaction-view.ts`
- S4: `packages/runtime/src/interaction-handlers.ts`
- S5: `packages/runtime/src/session-input.ts`
- S6: `packages/browser/src/browser-goal-routes.ts`
- S7: `apps/goal-board/src/interaction-panel.tsx`
- S8: `apps/goal-board/src/interaction-state.ts`
- S9: `packages/runtime/test/session-interaction-handlers.test.ts`
- S10: `packages/runtime/test/session-question-responses.test.ts`
- S11: `packages/runtime/test/session-interaction-races.test.ts`
- S12: `apps/goal-board/test/human-interaction.test.tsx`
- S13: `apps/goal-board/e2e/human-interaction.test.mjs`
- S14: `packages/runtime/test/session-interaction-handler-recovery.test.ts`

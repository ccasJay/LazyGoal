---
feature: goal-board-streaming
status: active
summary: 在 Goal Board 按真实来源交错渲染正文、工具活动与 Run 边界，并提供有界历史窗口、候选原位结算与只读队列状态
source_spec: specs/goal-board-streaming/
distilled_at: 2026-10-21
reviewed_at: 2026-10-21
tags: [goal-board, timeline, activity-projection, candidate-presentation, history-window, reading-controls, queue-ownership]
authorities: [apps/goal-board/src/session-timeline.ts, apps/goal-board/src/activity-projector.ts, apps/goal-board/src/session-output-consumer.ts, apps/goal-board/src/activity-page-window.ts, apps/goal-board/src/hooks/useQueue.ts, packages/browser/src/browser-projection.ts, packages/web-contracts/src/activity.ts, packages/runtime/src/domain.ts]
---

# Goal Board 流式会话体验

## Purpose

- 按真实来源交错呈现用户消息、过程正文、工具活动、交互与最终答复，保留 Run／阶段分界，刷新或重建后仍得到相同顺序与身份。 [S1, S2, S3]
- 为长会话提供有界历史窗口、可控阅读位置与明确的候选展示边界，并把看板侧队列状态改为直接读取 Runtime 会话投影。 [S1, S2, S10, S12]

## Durable Decisions

- D1 — 交错时间线由持久化位置重建：正式消息在 Run 内带 `position`（已提交轨迹 `afterSequence` 与同锚点 `order`），看板按服务端位置排序并按稳定身份去重，不按角色分区排列、正文相同或客户端到达时间判断正式历史。 [S1, S2, S3, S4]
- D2 — Activity 分组在前端按真实邻接断组：只有同 Run、同阶段、同展示类别且在交错时间线上相邻的成员可合并；用户／助手正文、交互、未知来源、阶段边界与未加载缺口断组，关闭 Execution steps 只隐藏活动主体而不改变断组判定。 [S1, S2, S5, S6]
- D3 — 活动成员按 Action 身份协调实时与已提交事实：同一 Action 的尝试、实时返回与 Observation 提交更新同一成员并区分执行中、重试、结果待保存、已提交失败／成功与未知结果；卡片定位与结果更新时间分别表达。 [S1, S2, S5, S7]
- D4 — 候选以预览身份原位结算：有效预览转正式时保留展示实例并换用规范正文，重复通知只保留一份正式项；作废候选收为标明“未采纳”的折叠项，最多暂存 8 份旧稿、最多展开 1 份，刷新、切 Goal 或连接重建即清除临时旧稿。 [S1, S2, S8, S9]
- D5 — 历史窗口有界且阅读位置由用户控制：单一 Run 可按双向 cursor 分段读取，页面最多缓存 3 个 Activity 页与 3 个正文分段；距底部 60px 内视为跟随，用户主动上滑即暂停并提供 Jump to latest。 [S1, S2, S10, S11]
- D6 — 看板侧队列所有权改为读取 Runtime：已受理队列、暂停状态与队列修订全部来自 Runtime 会话投影，前端不维护本地任务镜像、不由 effect 启动后继 Run；普通 Enter 直接排队，Steer 与 Stop run 是独立显式入口。 [S1, S2, S12, S13]
- D7 — 首屏窄状态与有界 Activity 分离：`?view=state` 显式标记历史集合未内嵌，`GET /api/goals/:goalId/activity` 返回固定水位与双向 cursor 的原子展示项；服务分页不切开单个原子项，也不宣称一页已包含完整工具组。 [S1, S2, S14, S16, S17]

## Guardrails

- 预览不成为正式消息或完成证据；同一来源只产生一份正式项；保存不明先核对；已作废旧稿不复活，历史不从未提交 tail、诊断 Trace 或网络到达时间重建。 [S1, S2, S8]
- 页面只提交显式输入；连接、分页、切换视图与组件挂载不恢复执行、不消费队列、不自动批准；Stop 不被草稿占用也不等同回滚。 [S1, S2, S13]
- 公开白名单不因新布局扩大，不在本地存储镜像正文、参数或凭据；临时项、页面缓存、合并帧与请求均有界并隔离目标。 [S1, S2, S14]
- 已知限制：逐阶段修订号与 `run_stage_rejected` 问题正文不再单独渲染，恢复需扩展公开 wire 契约。 [S2, S15]

## Revisit When

- 需要展示逐阶段修订号、审查拒绝问题清单或新的公开内容块时。
- 引入图片、附件、子代理或终端 UI 等新的公开载荷时。
- 需要跨 Run 连续全文检索、无窗口上限导出或离线阅读时。
- 候选暂存上限、页面缓存上限或跟随阈值需要调整时。

## Sources

- S1: `specs/goal-board-streaming/spec.md`
- S2: `specs/goal-board-streaming/plan.md`
- S3: `packages/runtime/src/domain.ts`
- S4: `packages/runtime/test/message-timeline-position.test.ts`
- S5: `apps/goal-board/src/activity-projector.ts`
- S6: `apps/goal-board/test/activity-projector.test.ts`
- S7: `apps/goal-board/src/collect-activity-projections.ts`
- S8: `apps/goal-board/src/session-output-consumer.ts`
- S9: `apps/goal-board/test/candidate-presentation.test.ts`
- S10: `apps/goal-board/src/activity-page-window.ts`
- S11: `apps/goal-board/test/activity-page-window.test.ts`
- S12: `apps/goal-board/src/hooks/useQueue.ts`
- S13: `apps/goal-board/src/session-controls.ts`
- S14: `packages/browser/src/browser-projection.ts`
- S15: `apps/goal-board/src/style.css`
- S16: `packages/web-contracts/src/activity.ts`
- S17: `apps/goal-server/test/goal-board-streaming.integration.test.ts`

---
feature: action-approval-revision
status: active
summary: 工具审批可修订同一工具的最终参数并按获批版本执行，未知结果的重执行成为独立决定
source_spec: specs/action-approval-revision/
distilled_at: 2026-10-21
reviewed_at: 2026-10-21
tags: [approval, revision, review, grant, reexecution, ptc, sandbox, recovery]
authorities: [packages/runtime/src/action-approval.ts, packages/runtime/src/goal-coordinator.ts, packages/runtime/src/transition.ts, packages/storage/src/goal-snapshot.ts, packages/storage/src/json-file-tool-grant-store.ts, packages/model-context/src/native-model-history.ts, packages/web-contracts/src/session-input.ts, apps/goal-board/src/interaction-panel.tsx]
---

# 工具审批参数修订与未知结果重执行

## Purpose

- 审批者可以在工具尚未执行的等待点修改同一工具的参数，审阅最终操作与权限范围后明确批准；直接调用与 PTC 程序内业务子调用具备相同能力。 [S1, S2, S3]
- 首次执行批准与未知结果后的重执行授权是两条独立决定，后者明确允许原操作按最终获批参数再次执行或拒绝再次执行；无界面宿主与 Web 消费同一预检、受理与授权路径。 [S1, S2, S4, S5, S12, S13]

## Durable Decisions

- D1 — 只有同一工具、尚未开始执行的首次审批等待可修订；工具身份、Goal／Run、PTC 父程序与调用位置不可被修订请求替换，已批准、已启动、结果未知、已结算与失效等待一律拒绝修订。 [S1, S2, S3, S4]
- D2 — 审批是“只读预检 → 明确确认”两阶段：预检重新准备参数、规划执行准入、权限与沙箱范围，返回原参数、最终 canonical 参数、实际目标与能力变化及审阅指纹；预检不保存批准、不暂存或激活授权、不解除等待、不调用业务工具，多客户端预检互不覆盖。 [S1, S2, S3, S8]
- D3 — 确认在同一提交边界重算并比对审阅指纹，与所审阅内容不一致时明确拒绝并要求重新审阅，不静默并入变化；`reviewRef` 是内容一致性引用而非认证令牌，访问权限仍由既有宿主／wire 边界控制。 [S1, S2, S3, S4, S8]
- D4 — 修订保留同一逻辑 Action 与原始 `action_staged`，原请求引用与最终 canonical 参数一并冻结为该 Action 的执行版本，获批后不可再编辑；执行、授权激活、沙箱计划与恢复都经同一执行版本选择入口取实际参数，原始模型响应与程序请求不被改写。 [S1, S2, S3, S4, S8]
- D5 — 持续授权按最终已验证参数生成既有匹配器，并沿用 Grant pending → 批准快照保存 → 激活 → 执行的顺序；Grant 事务来源扩展稳定批准输入身份 `approvalInputId`，只有被已提交批准引用的记录可激活，旧 pending 保留但不匹配、不被自动清理，也不阻塞新决定身份。 [S1, S2, S4, S6]
- D6 — 首次批准、修订批准与未知结果重执行是三条互不消费对方等待的决定分支；重执行绑定本次未知结果等待的恢复身份 `recoveryRef`，只允许按获批版本再次执行，不携带新参数或持续授权期限；同一 Action 再次未知时恢复身份改变，旧决定不能授权新一轮。 [S1, S2, S4, S5, S9]
- D7 — PTC 子调用修订后仍以原请求身份校验重放，但准备、授权与沙箱计划改用最终参数；结果信封追加修订说明与事实引用，业务 Observation 输出不换形，父 Step 与既有预算不重置。程序内再授权与重放边界见 `project-memory/features/programmatic-tool-calling.md` 的 D2／D3；未知效果的等待语义见 `project-memory/features/runtime-feedback-tool-approval.md` 的 D4。 [S1, S2, S3, S10]

## Guardrails

- 策略、Profile 与模式的拒绝不可由用户选项覆盖；扩大范围必须重新审阅并明确确认，旧沙箱范围与旧输入匹配器不被沿用；预检失败保留原等待与本地草稿，不裁剪参数、不降级权限、不执行原操作作为回退。 [S1, S2, S3, S8]
- 原 Provider 响应、原生工具调用 ID 与参数、程序源码和初次暂存事实保持原文；下一模型请求与历史查询只携带有界修订说明，改写后的目标不能证明原目标已完成，原完成审查规则仍决定任务是否满足；完整 canonical 输入只落在已提交事实，公开 SSE 活动不广播完整输入。 [S1, S2, S7, S11]
- 拒绝重执行只阻止再执行，此前效果未知的事实继续可见，不存在人工填写成功的入口；显式恢复只重建等待，不替用户授权再次执行，也不能恢复已被 Interrupt 禁止的原任务。 [S1, S2, S5, S9]
- 程序可能忽略修订元数据是明确限制；修订不新增自动重放许可、不重置已消耗的 PTC 或收尾预算，PTC 不承诺外部副作用 exactly-once。 [S1, S2, S3, S10]

## Revisit When

- 工具审批新增换工具、改程序、改授权期限以外的决定种类，或预检需要持久化候选时。
- Grant 账本引入撤销／清理接口，或需要跨账本分布式事务保证时。
- 未知结果恢复引入人工填写成功、跨 Action 重放或批量重执行时。
- 模型上下文开始消费完整 canonical 参数，或公开事件被要求携带更完整的工具输入时。

## Sources

- S1: `specs/action-approval-revision/spec.md`
- S2: `specs/action-approval-revision/plan.md`
- S3: `packages/runtime/src/action-approval.ts`
- S4: `packages/runtime/src/goal-coordinator.ts`
- S5: `packages/runtime/src/transition.ts`
- S6: `packages/storage/src/json-file-tool-grant-store.ts`
- S7: `packages/model-context/src/native-model-history.ts`
- S8: `packages/runtime/test/action-approval-revision.test.ts`
- S9: `packages/runtime/test/action-reexecution.test.ts`
- S10: `packages/runtime/test/program-approval-revision.test.ts`
- S11: `packages/model-context/test/action-revision-context.test.ts`
- S12: `apps/goal-board/test/action-approval-revision.test.tsx`
- S13: `apps/goal-server/test/action-approval-revision.integration.test.ts`

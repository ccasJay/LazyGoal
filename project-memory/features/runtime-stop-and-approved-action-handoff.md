---
feature: runtime-stop-and-approved-action-handoff
status: active
summary: Runtime 在按 Goal 串行的 Mutation Gate 内线性化等待决定与 Interrupt，Grant 激活以权威 Snapshot 裁决，PTC 未知结果重执行按最终获批参数并以标准信封记账
source_spec: specs/runtime-stop-and-approved-action-handoff/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [runtime, interrupt, grant-activation, revocation, pending-stop, ptc-reexecution, mutation-gate, linearization, result-envelope]
authorities: [packages/runtime/src/goal-coordinator.ts, packages/runtime/src/goal-mutation-gate.ts, packages/runtime/src/trajectory-checkpoint-committer.ts, packages/runtime/src/action-approval.ts, packages/runtime/test/run-interrupt.test.ts, packages/runtime/test/permission-grant-recovery.test.ts, packages/runtime/test/program-approval-revision.test.ts, packages/runtime/test/program-interruption.test.ts]
---

# Runtime 停止、Grant 激活与 PTC 未知结果交接

## Purpose

- 让停止、等待决定与授权撤销都以最新已提交状态裁决：Interrupt 已受理或目标等待失效后，过期回答、任务决定、工具审批与未知结果决定无法覆盖已提交状态。 [S1]
- 让可能已产生外部效果的 PTC 工具操作在延迟停止后按最终获批参数重执行，拒绝重试后仍可恢复且结果记账可信。 [S1]

## Durable Decisions

- D1 — 决定提交线性化：GoalCoordinator 复用按 Goal 串行的 Mutation Gate 与共享提交器处理回答、任务决定、工具审批与未知结果决定；Gate 内读取最新 Snapshot，核验 Goal、Run、等待、Interrupt 与决定绑定后构造转换，一次提交关联事实和 Snapshot。Interrupt 先受理或目标等待失效时以既有业务错误拒绝过期决定，不产生该决定的有效事实、消息、Grant 激活或执行；Gate 外的准备结果在使用前核对绑定。提交结束释放 Gate 后才进入既有调度与执行准入，模型、业务工具与整轮执行留在 Gate 外。 [S1, S2, S3, S4]
- D2 — 等待仅解除一次：同一等待只允许一次有效解除，并发提交两个决定只落一份有效事实和业务结果；随后受理的 Interrupt 保持有效，阻止未开始的工具并按既有规则结算已开始操作。允许的状态更新（如模型选择）先于等待决定提交且等待仍有效时，决定在最新 Goal 上重新校验并应用且保留先提交的更新；修订审阅失效时沿用重新审阅的业务结果，旧 `reviewRef` 不能通过。 [S1, S2, S6]
- D3 — Grant 激活以权威 Snapshot 裁决：持续授权暂存可在 Gate 外完成，进入提交时复核其与最新等待的绑定；仅在权威 Snapshot 确认当前可执行批准引用同一决定、最终版本与范围后，激活待激活 Grant 并进入既有执行准入；无法确认时传播失败，交由既有恢复流程核验。append 成功、pending 记录或重试本身不构成授权；`state_committed` marker 仍是旁路事实；已激活的持续授权由既有撤销入口处理。 [S1, S2, S4, S7]
- D4 — 撤销绑定当前 Run：统一撤销与 Tool 撤销两个入口在同一 Goal Gate 内验证当前 Run 后执行撤销并提交审计撤销事实；保存基于最新 Goal，保留执行、等待、模型与中断状态；Grant Store 保持授权事实源。撤销后的审计写入失败保留错误，但授权本身已撤销。 [S1, S2, S3]
- D5 — PTC 延迟停止按获批参数重执行：PTC 子调用因资源停止留下 `pendingStop` 与未知结果、用户以当前 `recoveryRef` 明确允许重执行时，用同一 Action 的最终获批参数准备工具、解析沙箱计划与实际执行；原请求仅用于校验程序重放身份，重执行保留原请求、程序身份、调用位置与延迟停止原因。缺少当前重执行决定、旧决定再次提交、宿主关闭或达到资源上限时，未知副作用保持人工确认门禁，宿主关闭保留可恢复状态；修订元数据沿用相同额度规则，重执行不重置预算；无自动写入、无伪造取消终态。 [S1, S5, S8, S9]
- D6 — 拒绝重试按标准信封记账：用户拒绝 PTC 未知结果重试（无论是否存在 `pendingStop`）时记录拒绝与对应 Observation，保留此前效果未知的事实；结果记账复用执行版本解析的标准信封与既有 `0` 引用占位字节口径，修订调用计入修订元数据；后续按既有路径重放结果或完成延迟停止。重建信封累计字节一致、无 `PTC_REPLAY_MISMATCH`、工具不重执行、父程序只结算一次。 [S1, S5, S8, S9]

## Guardrails

- 等待转换事实只在按 Goal 的 Mutation Gate 内提交；Gate 外不产生有效决定事实，Grant 激活与撤销不以 append 结果或 pending 记录为权威。 [S1, S2, S3]
- 撤销事实不保存撤销前取得的执行状态；撤销入口不绕过 Grant Store 或复制授权数据。 [S1, S2]
- PTC 活动时间预留继续按既有恢复规则计费；重执行不携带新参数、不产生自动重放许可，拒绝重试不等于效果已知的成功结论。 [S1, S5]
- Session 收据与调度名额归属由会话创建与执行所有权契约承担（见 `project-memory/features/runtime-create-answer-execution-ownership.md`）；沿用现有 Snapshot、Trajectory、权限作用域和公开协议。 [S1]
- 验证使用可控 Grant Store、临时文件 Snapshot/Trajectory、隔离工具与本地程序 worker；生产 Grant 与真实业务副作用不在验收操作范围。 [S1]

## Revisit When

- Mutation Gate 的线性化范围扩大（新增等待决定种类或跨 Goal 提交）时。
- Grant 激活需要跨账本事务、自动确认或新增撤销入口时。
- PTC 重执行引入参数再修订、批量重执行或外部副作用补偿语义时。
- `action-approval-revision`、`programmatic-tool-calling` 相关契约（执行版本选择、标准信封口径、`recoveryRef`）变化时。

## Sources

- S1: `specs/runtime-stop-and-approved-action-handoff/spec.md`
- S2: `packages/runtime/src/goal-coordinator.ts`
- S3: `packages/runtime/src/goal-mutation-gate.ts`
- S4: `packages/runtime/src/trajectory-checkpoint-committer.ts`
- S5: `packages/runtime/src/action-approval.ts`
- S6: `packages/runtime/test/run-interrupt.test.ts`
- S7: `packages/runtime/test/permission-grant-recovery.test.ts`
- S8: `packages/runtime/test/program-approval-revision.test.ts`
- S9: `packages/runtime/test/program-interruption.test.ts`

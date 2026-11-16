---
feature: runtime-create-answer-execution-ownership
status: active
summary: 同一 Goal 的会话创建按首条输入身份幂等唯一落库，交互回答与 blocked 恢复在等待转换中写入 applied 收据，实例以单一会话执行名额交接后台推进与关闭结算
source_spec: specs/runtime-create-answer-execution-ownership/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [session-create, idempotency, input-ledger, receipt, execution-slot, ownership, shutdown-settlement, runtime, recovery]
authorities: [packages/runtime/src/session-manager.ts, packages/runtime/src/goal-coordinator.ts, packages/runtime/src/goal-mutation-gate.ts, packages/runtime/src/trajectory-checkpoint-committer.ts, packages/runtime/test/session-create-answer-ownership.test.ts, packages/runtime/test/session-execution.test.ts, apps/goal-server/test/runtime-composition.integration.test.ts]
---

# 会话创建幂等、应用收据与单一执行名额

## Purpose

- 让同一 Goal 的首次创建与在途重试得到稳定且唯一的 Run 与收据，丢失响应后可按原输入身份安全重连。 [S1]
- 让交互回答与 blocked 恢复在决定已保存时即可取得收据，收据与执行进度分别核验，嵌入 Runtime 的宿主可定位关闭时的未结算工作。 [S1]

## Durable Decisions

- D1 — 创建身份与唯一首创建：SessionManager 在按 Store/Goal 的 Mutation Gate 内读取最新存在性、核对首条输入并执行首次检查点提交；创建身份由 Goal ID、首个 inputId 与规范化正文摘要构成，以首条持久输入为凭据。同一 Goal 的首次创建与同身份并发重试只成功创建一个首 Run、首条消息与首收据，正常创建者返回 `existing: false`，重复请求返回原收据与 `existing: true`。已存在 Goal 的重连仅打开句柄，重建 Runtime 后仍须显式恢复才能重新推进。 [S1, S2, S3, S6]
- D2 — 创建输入冲突与冻结配置：同 Goal 的创建使用不同 inputId、原 inputId 配不同正文，或用该 Goal 后续普通消息冒充首条输入时返回 `INPUT_CONFLICT`，保留首次提交的内容、Run 与收据；原 inputId 与正文重试沿用首次已冻结的创建配置。 [S1, S2, S6]
- D3 — 创建故障边界：首次 Snapshot 确认前失败传播原创建故障并释放本次占用，保存前失败无执行、可按原身份重试；Snapshot 已保存后抛错或 marker 失败时，重试连接同一首 Run 并返回原收据，后续推进走显式恢复，零次未确认推进。 [S1, S2, S6]
- D4 — 收据随等待转换提交：有效 `respond` 与携带正文、匹配当前修订的 blocked `resume` 在一次 Snapshot 提交中应用决定或正文、推进当前等待，并写入原 inputId、摘要、受理修订与目标 Run 的 `applied` 收据；`send` 与输入结果反馈以该受理为准，下一轮模型或工具挂起时仍可取得收据。重复原输入返回已存收据（即使等待已解除或另一 Goal 占用名额），同 ID 异载荷 `INPUT_CONFLICT`，新输入只按最新 Goal/Run/等待或修订裁决；Interrupt 先受理时旧决定无效，后受理时保留已存收据并按原规则结算。 [S1, S2, S4, S5, S6]
- D5 — 收据与执行进度分离：按权威 Snapshot 的输入账本核对提交结果；受理收据确认决定已保存，Run 状态表示执行进度，两者分别核验。保存前失败保留原等待且无收据；已保存后故障传播异常，状态与收据同在，本次输入不触发新推进；成功提交后即使响应丢失或后续执行失败，收据仍可查询，重复提交只返回原结果，后台按既有渠道报告执行故障，无重复正文、审批、处理函数调用或工具副作用。Trajectory marker 故障保留原错误与诊断。 [S1, S2, S5, S6]
- D6 — 单会话执行名额与交接：Runtime 实例只有一个会话执行名额；新的推进受理在提交前取得名额或由同 Goal 的执行所有者接手，另一 Goal 的新工作返回 `BUSY` 且无部分受理。成功交接后恰好推进已提交的目标 Run，运行期间状态投影不误报 `needsRecovery`；失败或结算只释放本次拥有的名额。旧执行退出与新推进接手由同一 owner 协调，队列后继沿用原执行循环及 FIFO、当前 Run 模型绑定、已核对的 Action/Grant 授权与未知效果门禁；收据不能重建瞬时执行授权，直接调用 Coordinator `resume` 复用同一提交路径。 [S1, S2, S4, S7]
- D7 — 关闭结算：实例关闭开始后拒绝新推进；在途写入与后台执行纳入结算，交接期间无漏登记；期限到达仍未结算时报告可定位的 Goal，必要时可按持久收据关联 Run；保留已提交收据与真实恢复状态，宿主关闭不产生用户 Interrupt、不伪造取消终态。 [S1, S2, S7, S8]

## Guardrails

- 执行名额按单 Runtime 实例保证；跨进程互斥与未知副作用自动重试不在当前契约内。 [S1]
- 沿用当前 Snapshot、输入账本与协议格式；Supervisor Trigger、Worker IPC 与浏览器协议沿用既有契约，Session 输入核验与账本条目随等待转换经共享提交器同时保存。 [S1, S5]
- 等待释放名额、终态按现有暂停和继续规则处理队列；重建后显式恢复沿用现有批准恢复规则，恢复不代答等待。 [S1]
- 验收使用临时文件存储、可控模型、隔离工具与显式闸门；显式 `resume` 的解锁、Run/修订核验与队列继续语义沿用 `project-memory/features/streaming-session.md` 的契约。 [S1]

## Revisit When

- Session 输入种类、收据账本结构或创建身份口径变化时。
- 需要多实例并行执行名额、跨进程租约或名额排队策略时。
- Coordinator 短提交路径、执行所有权交接或关闭结算时限变化时。
- `streaming-session` 的受理、收据或显式恢复契约再次调整时。

## Sources

- S1: `specs/runtime-create-answer-execution-ownership/spec.md`
- S2: `packages/runtime/src/session-manager.ts`
- S3: `packages/runtime/src/goal-mutation-gate.ts`
- S4: `packages/runtime/src/goal-coordinator.ts`
- S5: `packages/runtime/src/trajectory-checkpoint-committer.ts`
- S6: `packages/runtime/test/session-create-answer-ownership.test.ts`
- S7: `packages/runtime/test/session-execution.test.ts`
- S8: `apps/goal-server/test/runtime-composition.integration.test.ts`

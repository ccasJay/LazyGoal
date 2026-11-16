---
feature: worker-interaction-cancellation
status: active
summary: Goal Server 让同一 Run 的 Stop 在交互回复触发的执行仍进行时送达 Worker，并在中断与持久终结算完成后才收敛取消终态与 Worker 复用
source_spec: specs/worker-interaction-cancellation/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [worker, cancellation, interaction-resume, stop, supervisor, ipc, terminal-state, worker-reuse, outbox]
authorities: [apps/goal-server/src/runtime/worker-process.ts, apps/goal-server/src/runtime/worker-scheduler.ts, apps/goal-server/src/worker-process-entry.ts, apps/goal-server/test/worker-process.test.ts, apps/goal-server/test/worker-scheduler.test.ts, apps/goal-server/test/worker-interaction.integration.test.ts]
---

# Worker 交互恢复期间的取消与终态收敛

## Purpose

- 让回复 Goal 交互后的恢复执行仍可停止：同一 Run 的取消在交互回复触发、本地模型请求保持打开时送达 Worker 并实际中断该调用。 [S1]
- 让 Supervisor 可独立验证命令提交与结果结算，在并发、断线和迟到回复时保全 Goal 状态、持久终态与 Worker 归属。 [S2]

## Durable Decisions

- D1 — 交互提交后取消可达：沿用父进程的 `activeParentOperation.requestSubmitted`、操作槽与请求关联；交互命令提交后操作占用与请求关联保留到该操作返回或失败，同一 Run 的取消在此期间可送达 Worker。重复推进、回复与关闭仍受既有命令准入约束；IPC 提交只提供发送顺序。 [S1, S2, S5]
- D2 — 两条恢复入口均可中断：直接回复与 `pump()` 恢复未路由回复两条入口都向当前已绑定 Worker 发出取消并中断仍打开的本地模型请求；取消路由不得被 `pump()` 对恢复中交互回复的等待阻塞。 [S1, S3, S7]
- D3 — 取消终态按持久证据收敛：取消受理并实际中断执行后，等待 Runtime 确认中断结束、权威 Snapshot 保存、提交队列终态及关联源 work Trigger 的取消响应，之后才返回取消终态；Worker 仅在原操作与终态均结算后可复用。取消先受理时交互恢复随后完成不产生重复终态；恢复先完成且同一 Run 已有完成或失败终态时，取消沿用该终态并保持已保存结果与响应。 [S1, S3, S6, S7]
- D4 — 中断与结算分工：子进程 Runtime 负责中断执行；Supervisor 根据已保存 Snapshot 和当前绑定结算进度、终态及释放，复用现有请求 ID、outbox、进度确认与终态响应标识。两条结果路径可能报告同一终态时，结算收敛到已保存的同一 Run 结果。 [S1, S3, S4, S6]
- D5 — IPC 故障与迟到结果：IPC 提交失败，或通道在交互与取消结果返回前断开且没有终态证据时，挂起的调用以现有 IPC 失败路径结束，未结算 Trigger 保持未路由，原 Worker 绑定留待核验。取消已结算后的迟到交互结果或重放进度保持已确认队列终态与唯一终态响应，按既有请求、Goal、Run 与 Worker 代次处理 outbox，旧结果无法影响后续分配。 [S1, S2, S5, S6]
- D6 — 并发与身份核验保持：`advance` 或 `respondActionPermission` 与取消并发，或取消目标身份不匹配时，保持既有提交顺序、操作互斥、同一在途取消请求去重以及 Goal、Run 和 Worker 代次核验。 [S1, S2, S5, S6]

## Guardrails

- 不提前释放 Worker 绑定、不接纳旧进度或不为断线补造终态；无终态证据的断线不产生取消成功响应。 [S1, S5]
- 沿用现有命令准入、身份核验、Trigger 与 Snapshot 格式；Supervisor/Worker IPC 协议、持久队列与 Trigger 归属不因取消扩展而重定义。 [S1]
- 交互等待中收到取消时保留交互操作占用，清理顺序不允许取消绕过既有排他与代次边界。 [S1, S5]
- 验证使用受控 IPC、独立 OS Worker 与本地可控模型端点，不依赖真实模型供应商。 [S1, S7]

## Revisit When

- 父进程操作槽与 `requestSubmitted` 语义、Worker 进程生命周期或 IPC 协议变化时。
- Trigger 路由、outbox 代次或终态响应标识调整时。
- 引入多 Worker 共享、跨 Supervisor 取消或进程外持久队列时。
- Runtime 停止与获批操作交接契约变化时（见 `project-memory/features/runtime-stop-and-approved-action-handoff.md`）。

## Sources

- S1: `specs/worker-interaction-cancellation/spec.md`
- S2: `apps/goal-server/src/runtime/worker-process.ts`
- S3: `apps/goal-server/src/runtime/worker-scheduler.ts`
- S4: `apps/goal-server/src/worker-process-entry.ts`
- S5: `apps/goal-server/test/worker-process.test.ts`
- S6: `apps/goal-server/test/worker-scheduler.test.ts`
- S7: `apps/goal-server/test/worker-interaction.integration.test.ts`

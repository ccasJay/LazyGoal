---
feature: worker-interaction-cancellation
status: proposed
risk: medium
created_at: 2026-11-11
delivered_at: null
supersedes: []
superseded_by: null
---

# Worker 交互恢复期间的取消

## 目标与范围

让同一 Run 的 Stop 在交互回复触发的执行仍在进行时送达 Worker，并在实际中断和持久结算后返回终态。
覆盖 Goal Server 的直接交互、未路由回复恢复及 IPC 故障，沿用现有命令准入、身份核验、Trigger 和 Snapshot 格式。

## 用户故事

- **S1** 作为回复 Goal 交互的操作者，我希望恢复执行时仍能停止当前 Run，以便中断尚未完成的调用。
- **S2** 作为 Supervisor 维护者，我希望能独立验证命令提交与结果结算，以便在并发、断线和迟到回复时保全 Goal 状态及 Worker 归属。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 当前 Goal 的交互回复已进入提交路径，回复结果仍挂起，收到同一 Run 的取消 | 在交互命令提交后发送 `cancel`，同时保留交互操作占用和请求关联，直至该操作返回或失败 | `worker-process.test.ts` 用受控 IPC 固定顺序，保持交互结果挂起直至观察到 `cancel`，核对重复推进、回复和关闭仍受准入约束 |
| R1.2 | S1 | 状态 | 真实 Worker 已处理交互回复，恢复后的本地模型请求保持打开 | 直接回复和 `pump()` 恢复未路由回复两条入口均能向当前 Worker 发出取消并中断该请求 | `worker-interaction.integration.test.ts` 用独立 OS Worker 和本地可控模型端点分两条入口触发，在端点未主动结束响应时观察连接因取消关闭 |
| R1.3 | S1 | 事件 | 取消先被受理并实际中断执行 | 等待 Runtime 确认中断结束和 Snapshot 保存，提交队列终态及关联源 work Trigger 的取消响应后才返回取消终态；Worker 仅在原操作与终态均结算后可复用 | `worker-interaction.integration.test.ts` 暂缓终态保存，断言取消仍待定且 Worker 保持绑定；放行后核对 Snapshot 为 `cancelled`、中断为 `finished`、队列终态、单一取消响应及 Trigger 路由状态 |
| R1.4 | S1 | 事件 | 交互恢复先完成且同一 Run 已有完成或失败终态 | 取消沿用该终态并保持已保存的结果和响应 | `worker-scheduler.test.ts` 受控交错终态进度与取消，断言取消返回已存在的终态，持久响应无重复 |
| R2.1 | S2 | 异常 | IPC 提交失败，或通道在交互与取消结果返回前断开且没有终态证据 | 挂起的调用以现有 IPC 失败路径结束，未结算 Trigger 保持未路由，原 Worker 绑定留待核验 | `worker-process.test.ts` 注入写入失败和断线并等待 Promise 拒绝；调度测试核对无终态或绑定释放 |
| R2.2 | S2 | 异常 | 取消已结算，随后收到旧交互结果或重放的进度 | 保持已确认的队列终态与唯一终态响应；按既有请求、Goal、Run 和 Worker 代次处理 outbox，旧结果无法影响后续分配 | `worker-process.test.ts` 注入迟到回复并核对请求关联；调度测试重放迟到进度，核对终态、响应和后续绑定 |
| R2.3 | S2 | 普遍 | `advance` 或 `respondActionPermission` 与取消并发，或取消目标身份不匹配 | 保持既有提交顺序、操作互斥、同一在途取消请求去重以及 Goal、Run 和 Worker 代次核验 | 运行现有 Worker 代理、权限及调度测试，按需补充共享路径的缺口 |

组合：交互等待 → 回复 → 挂起模型调用 → Stop → 中断 → 持久终态 → Worker 可复用。执行两条入口的真实 Worker 集成测试及 `npm test`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| 以 `refector/project-review` 的 `f8f1e419` 为基线，沿用父进程的 `activeParentOperation.requestSubmitted`、操作槽和请求关联。[提交与等待](../../apps/goal-server/src/runtime/worker-process.ts#L539) | 基线已在提交交互命令后解除取消屏障，操作槽仍保留到结果或失败。IPC 提交只提供发送顺序。 | 无 |
| 通过定向测试验证已绑定 Worker 的取消可独立于在途交互结算；若重现阻塞，局部修正取消路由对 `pump()` 的等待。保留持久接收、路由时身份复核及找不到当前 Worker 时的恢复路径。[取消入口](../../apps/goal-server/src/runtime/worker-scheduler.ts#L257) · [恢复入口](../../apps/goal-server/src/runtime/worker-scheduler.ts#L731) | `pump()` 会等待恢复中的交互回复。该等待可能在父进程发送屏障之前拦住 Stop，须用 R1.2 验证。 | 无 |
| 子进程 Runtime 负责中断，Supervisor 根据已保存 Snapshot 和当前绑定结算进度、终态及释放；复用现有请求 ID、outbox、进度确认和终态响应标识。[Worker 中断](../../apps/goal-server/src/worker-process-entry.ts#L426) · [Supervisor 终态提交](../../apps/goal-server/src/runtime/worker-scheduler.ts#L834) | 两条结果路径可能报告同一终态，结算应收敛到已保存的同一 Run 结果。 | 无 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| medium | 取消横跨父进程代理、Worker Runtime 与持久队列。提前释放绑定或接纳旧进度可能破坏终态一致性。 | 无 |

## 任务

- [x] //TODO 1. 固化交互提交顺序、操作占用和 IPC 失败行为 → R1.1、R2.1、R2.3；检查：运行 Worker 代理定向测试。
- [x] //TODO 2. 覆盖直接回复和恢复路由期间的 Stop，按复现修正阻塞 → R1.2；检查：运行可控模型端点的交互取消用例。
- [ ] //TODO 3. 验证取消结算与终态竞态，按失败证据修补并同步受影响的 Goal Server 语义说明 → R1.3、R1.4、R2.1、R2.2；检查：运行定向结算与迟到进度测试及 `npm run check:docs`。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无

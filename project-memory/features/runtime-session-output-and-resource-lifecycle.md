---
feature: runtime-session-output-and-resource-lifecycle
status: active
summary: 同一 Goal 的订阅跨后继 Run 持续观察并单调接纳同步，背压由最终交付边界承担且有界释放，输入消费清理与交互派发竞态以当前连接身份裁决
source_spec: specs/runtime-session-output-and-resource-lifecycle/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [session-stream, subscription, backpressure, run-handoff, input-consumption, iterator-return, interaction-dispatch, connection-identity, runtime]
authorities: [packages/runtime/src/session-stream.ts, packages/runtime/src/session-manager.ts, packages/execution-stream/src/publisher.ts, packages/runtime/test/session-stream.test.ts, packages/runtime/test/session-output.test.ts, packages/runtime/test/session-input-consumption.test.ts, packages/runtime/test/session-interaction-attachment-races.test.ts]
---

# 会话输出订阅、局部资源生命周期与交互派发竞态

## Purpose

- 让会话输出消费者持续观察同一 Goal 的后继 Run，并正确区分当前进度与迟到的旧片段。 [S1]
- 让慢订阅有明确的缓冲上限与关闭结果，隔离资源占用并恢复可信状态。 [S1]
- 让输入源或自动处理器的解除与关闭后不启动新工作，宿主资源可预测地管理。 [S1]

## Durable Decisions

- D1 — 跨 Run 订阅身份交接：GoalSessionStream 持有每个订阅的当前观察身份，依据 Snapshot 提交修订与已提交的 Run 切换事实；订阅从 Run A 切换到后继 B 时在原订阅上交付 B 的开始与当前临时片段，保留真实 Run 与执行单元身份。B 的身份经当前状态或已提交切换事实确认后，过滤迟到的 A 临时片段，继续交付应见的 A 正式事实和控制结果；Goal 订阅跨 Run，实时 cursor 只标识发布位置。 [S1, S2, S4]
- D2 — 同步接纳单调：初始快照读取与事件发布并发时，首个成功同步建立 Goal 基线，基线覆盖的通知按既有身份去重；同步修订单调接纳，旧快照不能切回前一 Run 或撤回已显示状态；末次通知丢失仍可通过只读核对恢复，读失败沿用同步故障语义。初始交接与持续观察使用同一单调接纳边界。 [S1, S2, S4]
- D3 — 背压收敛到最终交付边界：Core 与调用方之间的待交付事件有明确固定上限，包含 Session 侧同步与派生事件；合并积压增量时只合并同 Run、同来源的相邻兼容片段且合并结果受上限约束，优先复用事件 Core 的有界队列、相邻增量处理与关闭原因。无法保留控制事件时仅结束该订阅：调用方观察一次 `closed/backpressure` 后结束迭代，可新建订阅重新同步；订阅仍开放但临时内容不完整时显式报告缺口并重新同步；另一订阅和已受理执行不受影响，正式消息与收据按既有只读入口核对。 [S1, S2, S3, S4]
- D4 — 订阅释放幂等：调用方结束迭代、解除句柄、Runtime 关闭或背压结束订阅时，释放该订阅的积压、监听与核对注册并保留可观察的终止结果；挂起的读取晚到后不再派生输出，关闭对同一订阅是幂等的；其他观察者持有的核对和会话不受该订阅单独退出影响。 [S1, S2, S4]
- D5 — 输入消费清理：detach 或 close 停止输入消费时至多请求一次 `iterator.return()`，观察同步抛错与异步拒绝，并通过现有宿主诊断入口标识 Goal、清理阶段及原因；消费与关闭不等待来源结束，受理失败继续作为主错误；停止后迟到的 `next()` 不受理，既有收据与已开始的受理遵循原结算语义。SessionManager 观察源迭代器的清理结果并通过既有后台诊断通道报告，宿主仍拥有来源资源。 [S1, S2, S5, S6]
- D6 — 交互派发以当前连接身份裁决：匹配当前 Run 与修订的显式 `resume` 发现仍待交互时沿用 `INTERACTION_REQUIRED`，有且仅有当前有效连接可解锁并尝试投递该等待；没有处理器时保持等待，由宿主显式回答。连接初始基线读取在途时不启动宿主函数，待基线建立后重新核对当前等待；基线中的历史等待只在合法显式解锁后投递，初始化期间的合法解锁不丢失，较新的可投递请求按稳定身份至多启动一次；初始读取失败不得把基线当成空历史。派发读取或宿主函数在途且原连接解除、被替换或 Runtime 开始关闭时，读取完成后只有同一当前有效连接可启动宿主函数；已启动的调用收到中止信号，不合作的函数不阻塞关闭；迟到结果不能提交新决定或影响替代连接，已受理的决定按原结果结算。派发错误由既有诊断边界观察，进程无未处理拒绝。 [S1, S2, S5, S7]

## Guardrails

- 连接与订阅状态留在内存；事件反馈沿用当前 DTO，重连按 Snapshot 和收据查询恢复，实时流不承诺跨重启回放或 exactly-once。 [S1]
- 宿主关闭或 detach 不生成用户 Interrupt；订阅故障只能放弃观察，不取消已受理执行。 [S1]
- 背压结束订阅不影响其他订阅与执行；正式消息与收据查询不因订阅结束失效。 [S1, S3]
- 会话执行所有权沿用单一名额契约（见 `project-memory/features/runtime-create-answer-execution-ownership.md`）；Supervisor 默认 Browser feed 沿用现有契约。 [S1]
- 验证使用真实 Session、事件 Core、受控模型、可暂停 Store 与显式闸门，交互竞态在 Node 未处理拒绝严格模式下验证。 [S1]

## Revisit When

- 事件 Core 的有界队列、增量合并或关闭原因契约变化时。
- 会话输出 wire 契约或订阅模型引入回放、断点续传或跨实例订阅时。
- 输入源宿主所有权、后台诊断通道或处理器注册模型变化时。
- `streaming-session`、`session-output-protocol` 或 `human-interaction` 相关联契约再次调整时。

## Sources

- S1: `specs/runtime-session-output-and-resource-lifecycle/spec.md`
- S2: `packages/runtime/src/session-stream.ts`
- S3: `packages/execution-stream/src/publisher.ts`
- S4: `packages/runtime/test/session-stream.test.ts`
- S5: `packages/runtime/src/session-manager.ts`
- S6: `packages/runtime/test/session-input-consumption.test.ts`
- S7: `packages/runtime/test/session-interaction-attachment-races.test.ts`

---
feature: streaming-session
status: active
summary: 以持久化 Goal 队列与显式 Steer、Interrupt、resume 支撑长期开放的文本 Session 与跨 Run 输出订阅
source_spec: specs/streaming-session/
distilled_at: 2026-10-21
reviewed_at: 2026-10-21
tags: [session, runtime, queue, persistence, steering, interruption, recovery, subscription, backpressure]
authorities: [packages/runtime/src/session.ts, packages/runtime/src/session-manager.ts, packages/runtime/src/session-input.ts, packages/runtime/src/session-admission.ts, packages/runtime/src/session-stream.ts, packages/runtime/src/session-output.ts, packages/storage/src/goal-snapshot.ts, packages/browser/src/browser-session-port.ts]
---

# 文本流式会话完整接入

## Purpose

- 提供长期开放的文本 Session：一个 Session 对应一个持久化 Goal 并跨越多个 Run，宿主持续提交输入并异步消费执行事件，不依赖浏览器保持在线。 [S1, S2, S3]
- 受理、队列与执行所有权收回 Runtime；普通消息默认排队进入后继 Run，只有显式 Steer 修正当前 Run，重启后必须显式恢复。 [S1, S2, S4, S5]

## Durable Decisions

- D1 — Goal Snapshot 是会话状态的唯一权威：输入账本、FIFO 队列、暂停原因与 Goal 级单调提交修订存放在同一快照，不建独立 inbox 文件，也不从日志重放重建第二份 Goal。 [S1, S2, S5, S6]
- D2 — 受理与执行是两个分离的 Promise：`send` 只等待持久化受理并返回收据，不等待 Run 完成；执行由被生命周期追踪的后台任务推进，同一 Goal 只有一个执行所有者，实例最多一个活动 Goal，其余明确 busy。 [S1, S2, S4, S7]
- D3 — 输入身份即幂等键：`inputId` 加规范化载荷摘要决定去重，重复请求返回原收据，载荷冲突明确拒绝且不改写原记录；去重判定先于过期 Run 等状态拒绝，响应不明时按原身份查询而非另生成身份。 [S1, S2, S8, S9]
- D4 — 普通消息面向 Goal 并按 FIFO 排队：每条普通消息各创建一个后继 Run，旧 Run 归档、队首标记应用、真实用户消息追加与新 Run 创建在同一次快照提交内完成；等待交互、失败或中断时队列暂停，继续必须显式。 [S1, S2, S10, S12]
- D5 — Steer 与 Interrupt 都显式绑定目标 Run：Steer 在同一 Run 的安全边界按受理顺序应用且不取消在途调用；Interrupt 在同一提交边界保存中断意图并暂停队列，委派既有有限收尾，收尾未结算不得报告 cancelled。 [S1, S2, S11, S13]
- D6 — 恢复是显式操作：重建实例、只读连接与普通新消息都不恢复旧 Run、收尾或队列；只有匹配最新 Run 与提交修订的 `resume` 才推进，恢复不代答等待，也不解除失败或 Interrupt 造成的暂停。 [S1, S2, S14, S15]
- D7 — 订阅先同步后增量：注册即建立观察边界并先输出一致 `state_sync`，随后交接缓冲与跨 Run 活动；有界队列无法保留控制事件时以 `backpressure` 关闭订阅，并以不超过一秒的间隔核对提交修订以补偿末次通知丢失。 [S1, S2, S16, S17]

## Guardrails

- 受理成功只表示输入已保存，不得据此认为消息已应用、工具已停止或 Run 已完成；队列不得替代当前交互，队列消息也不能代答审批。 [S1, S2, S8, S15]
- 慢订阅者与客户端断开只能放弃观察，不得取消已受理执行；发布失败不得回滚已提交结果，实时流不承诺跨重启回放或 exactly-once。 [S1, S2, S16, S17]
- 输入源异常、订阅断开与宿主关闭是三种不同控制原因，不得转成用户 Interrupt；关闭未确认结算时保留类型化错误，不伪造 Run 取消或安全关闭。 [S1, S2, S13, S18]
- 已知限制：收据长期保留且不做压缩或归档，大 Goal 的账本增长是明确成本；会话契约只在仓库内部使用，不构成对外 SDK 承诺。 [S1, S2, S6]

## Revisit When

- 需要多活动 Goal 并行、跨进程租约或跨 Goal 公平调度时。
- 需要持久化每个分片并提供跨重启 exactly-once 的实时回放时。
- 对外发布 SDK 包，或把默认装配迁出 `apps/goal-server/src/runtime/` 时。
- 引入图片、附件、MCP 或子代理等新的会话输入种类时。

## Sources

- S1: `specs/streaming-session/spec.md`
- S2: `specs/streaming-session/plan.md`
- S3: `packages/runtime/src/session.ts`
- S4: `packages/runtime/src/session-manager.ts`
- S5: `packages/storage/src/goal-snapshot.ts`
- S6: `packages/runtime/src/session-input.ts`
- S7: `packages/runtime/src/session-admission.ts`
- S8: `packages/runtime/test/session-input.test.ts`
- S9: `packages/runtime/test/session.test.ts`
- S10: `packages/runtime/test/session-queue.test.ts`
- S11: `packages/runtime/test/run-steer.test.ts`
- S12: `packages/runtime/test/run-interrupt.test.ts`
- S13: `packages/runtime/src/session-output.ts`
- S14: `packages/runtime/test/session-recovery.test.ts`
- S15: `packages/runtime/src/session-stream.ts`
- S16: `packages/runtime/test/session-stream.test.ts`
- S17: `packages/browser/src/browser-session-port.ts`
- S18: `packages/browser/test/browser-session-inputs.test.ts`

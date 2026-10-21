---
feature: session-output-protocol
status: active
summary: 用单一类型化会话输出区分生成、候选、正式消息与 Run 结算，并让正式消息具备稳定身份、来源与有界只读查询
source_spec: specs/session-output-protocol/
distilled_at: 2026-10-21
reviewed_at: 2026-10-21
tags: [session-output, message-identity, message-source, candidate-preview, source-dedup, bounded-query, wire-protocol, sse]
authorities: [packages/runtime/src/session-output.ts, packages/runtime/src/session-message-query.ts, packages/runtime/src/domain.ts, packages/runtime/src/runner.ts, packages/model-execution/src/summary-preview.ts, packages/model-request/src/process-message-dedup.ts, packages/browser/src/browser-goal-routes.ts, packages/web-contracts/src/session.ts]
---

# 会话输出协议与正式消息

## Purpose

- 把同一 Goal 的输入结果、公开生成、正式消息、工具活动、人工交互与 Run 结算组织为一条类型化会话输出，让消费者能区分“正在生成”“候选待确认”“已保存消息”“Run 已完成”。 [S1, S2, S3]
- 让正式消息在刷新、重试或切换 Run 后仍可定位，并为最终答复候选提供始终未确认的安全预览与按稳定身份的有界只读查询。 [S1, S2, S6]

## Durable Decisions

- D1 — 正式消息身份在所属提交边界分配：每条真实消息保存 `messageId`、`runId`、Run 内 `position`、角色、助手用途（process／answer／notice）与来源判别式；身份不由正文哈希或数组位置推导，同源重试复用原身份，不同来源同文保留为两条消息。 [S1, S2, S4, S10]
- D2 — 消息通知只在保存成功后发布：`message_committed` 携带 `messageId`、提交修订与被替换的 `previewId`，重复通知只更新同一条消息；保存结果不明时先按来源读取核对，不得用新身份绕过不确定提交。 [S1, S2, S3, S11]
- D3 — 完成候选预览只暴露已声明的单一字段：仅在 Decide 请求声明 `system_complete_task` 且工具身份可靠时投影顶层 `summary` 字符串，增量按解码后字段值给出 `startOffset`；单条预览公开正文上限 64,000 UTF-16 code unit，超限只停止增加公开正文而不取消生成。 [S1, S2, S7, S13]
- D4 — 预览未确认、候选作废与正式结算三者分离：拒绝、取消、失败、被替代或歧义只作废对应预览且不等同 Run 失败；只有既有协议与完成审查全部通过且消息已保存后才以正式消息结算候选，阶段接受只产生过程正文。 [S1, S2, S5, S11]
- D5 — 过程正文按模型调用来源去重：只有本次请求实际选入、协议身份匹配且已结算的原生交换才覆盖同源过程正文，覆盖以 `modelCallId` 关联而非比较正文字符串；交换未结算、被预算淘汰或模型身份切换时保留仍在对话预算范围内的正文。 [S1, S2, S8, S16]
- D6 — 消息查询按稳定身份分页且有界：首批由服务端确定 `throughMessageId` 固定读取范围，`afterMessageId` 定位起点，默认 50 条、最多 100 条；单条正文每次最多 64,000 UTF-16 code unit 并返回实际范围、截断标记与后续位置，不拆 Unicode 代理项。 [S1, S2, S6, S12]
- D7 — 统一输出 wire 契约：会话输出是可辨识判别联合（`state_sync`／`input_result`／`generation_event`／`message_committed`／`tool_activity`／`interaction_required`／`interaction_settled`／`run_status`／`run_result`／`stream_fault`／`commit_boundary`／`closed`）；实时 cursor 与持久化提交修订语义分离，wire 只做受授权序列化与边界校验，不反向推断 Runtime 状态。 [S1, S2, S3, S9, S15]

## Guardrails

- 预览不进入 Snapshot、不进入模型上下文，不授权工具、不代替审批、不充当完成证据；已提交正文不可被迟到分片改写，同源重试不增消息。 [S1, S2, S7]
- 受理不等于应用、模型结束不等于正式消息或 Run 完成、工具实时返回不等于 Observation 已提交；waiting 不得发布 completed，Run 终态按 `runId` 归并。 [S1, S2, S3]
- 读取故障与背压只报告为 `stream_fault`，不得撤销真实提交、自动重发输入或自动恢复执行；当前不承诺 token exactly-once 与跨重启 cursor 续传。 [S1, S2, S14]
- 已知限制：逐字增量预览尚未在真实流式供应商上接通（本次接入为整块路径，增量解析器已实现但供应商未在流中提供可靠工具身份）；Chrome 场景未覆盖“预览被正式消息替换”的 DOM 断言（该不变量由协议层与消费层测试覆盖）；`action-approval-revision` 的修订／恢复引用与 PTC 父程序身份已在组合交付中复核（按最终获批版本执行并结算正式答复）。 [S2]

## Revisit When

- 需要跨重启 cursor 续传或 token exactly-once 语义时。
- 摘要预览需要供应商级流式逐字增量，或引入图片、MCP、子代理等新的公开内容块时。
- `action-approval-revision` 合入、参数修订可能触发候选作废或替换时。
- 正式消息 Schema、来源判别式或会话输出联合需要新增成员时。

## Sources

- S1: `specs/session-output-protocol/spec.md`
- S2: `specs/session-output-protocol/plan.md`
- S3: `packages/runtime/src/session-output.ts`
- S4: `packages/runtime/src/domain.ts`
- S5: `packages/runtime/src/runner.ts`
- S6: `packages/runtime/src/session-message-query.ts`
- S7: `packages/model-execution/src/summary-preview.ts`
- S8: `packages/model-request/src/process-message-dedup.ts`
- S9: `packages/browser/src/browser-goal-routes.ts`
- S10: `packages/runtime/test/message-identity.test.ts`
- S11: `packages/runtime/test/candidate-message-commit.test.ts`
- S12: `packages/runtime/test/session-message-query.test.ts`
- S13: `packages/model-execution/test/summary-preview.test.ts`
- S14: `packages/runtime/test/session-output-recovery.test.ts`
- S15: `packages/browser/test/browser-session-output.test.ts`
- S16: `packages/model-request/test/process-message-dedup.test.ts`

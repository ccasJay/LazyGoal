---
feature: model-context-pruning
status: active
summary: "按完整执行单元和字符预算裁剪单轮模型 Conversation，同时保留完整 Goal 历史"
source_spec: specs/model-context-pruning/
distilled_at: 2026-08-23
reviewed_at: 2026-08-23
tags: [context-pruning, context-unit, conversation, compactor, agent, recovery]
authorities: [docs/architecture/agent.md, packages/agent/src/context-unit.ts, packages/agent/src/conversation-context-unit-adapter.ts, packages/agent/src/context-compactor.ts, packages/agent/src/prompt.ts, packages/tui/src/cli.tsx]
---

# Model Context Pruning

## Purpose

- 限制每次 LLM 请求携带的 Conversation 大小，但不删除 Runtime Goal 或 Storage Snapshot 中的完整消息历史。 [S1, S2, S6, S13, S14]
- 以完整 Agent 执行单元作为裁剪边界，避免拆散 user 消息及其后续 assistant decision、Tool Call、Tool Result 和 observation。 [S1, S2, S3, S4, S8]
- 让裁剪策略与当前 Conversation 来源解耦，为未来摘要 Compactor 和 Trajectory Adapter 保留独立扩展边界。 [S1, S2, S3, S5]

## Durable Decisions

- D1 — `ContextUnit` 是来源无关的完整裁剪单元，只暴露有序 `items` 和 Adapter 预先计算的 `characterCount`；当前 Conversation Adapter 将每条 user 消息及之后连续的 assistant 消息组成一个单元，开头连续的 assistant 消息组成前缀单元，字符数按消息 `content.length` 的 UTF-16 code unit 之和计算。 [S1, S2, S3, S4, S8]
- D2 — 默认 `DropOldestContextCompactor` 无状态且确定性地保留连续最新后缀：从最新单元向旧单元累计，遇到首个无法完整容纳的单元即停止，不拆分、不跳选；最新单元即使单独超限也始终完整保留，因此预算是软上限。 [S1, S2, S5, S9]
- D3 — 每次模型调用统一执行 Projector → Conversation Adapter → await Compactor → Renderer；只在新 View 中替换 Conversation，system prompt、PromptContext、Authorized Tools、Working Context 和 pendingAction 保持不变。Preparation 与 Step Executor 共享同一异步 Compactor、透传 `AbortSignal`，裁剪失败或中止时不得调用 LLM Adapter。 [S1, S2, S6, S10, S11]
- D4 — 裁剪只作用于单次 LLM Input View，不回写 Goal、不删除 Snapshot 消息、不升级 Snapshot Schema；每轮调用及跨进程恢复后都从完整历史重新投影并重新裁剪。 [S1, S2, S6, S10, S13, S14]
- D5 — 默认 Conversation 字符预算固定为 `196608`，可通过 `LLM_CONVERSATION_CHAR_BUDGET` 覆盖；缺失或空白使用默认值，非正安全整数产生稳定配置错误，并在工作区、Store、Goal 或 LLM 操作前失败。Composition Root 只创建一个无状态默认 Compactor，并共享注入所有模型阶段。 [S1, S2, S5, S7, S12]

## Guardrails

- `ContextCompactor` 不得依赖 Runtime、Storage、Goal Snapshot 或 Trajectory；新上下文来源必须通过独立 Adapter 映射为 `ContextUnit`。 [S2, S3, S4, S5]
- 默认策略不得截断消息或执行单元，也不得在较新单元无法装入后继续选择更旧单元。 [S1, S2, S5, S9]
- 裁剪只决定本轮 Conversation；Prompt Bundle、Working Context、严格响应 Schema、Tool 授权和 Goal 状态推进仍由原有边界负责。 [S1, S2, S6, S10, S11]
- 未来摘要能力应实现新的异步 Compactor；默认丢弃策略不得隐式增加 LLM 调用或持久化摘要。 [S2, S5]
- `TODO(model-context-summary)` 与 `TODO(trajectory-context-adapter)` 是预留扩展边界，不表示当前实现已经生成摘要或读取 Trajectory。 [S2, S4, S5]

## Revisit When

- 字符预算需要替换为 tokenizer、provider 或具体模型感知的 token 预算时。
- 被丢弃历史需要压缩为摘要并重新注入模型上下文时。
- Trajectory 成为模型上下文的正式数据源时。
- 预算需要成为 per-goal 配置或随 Goal 持久化时。
- Prompt 或消息协议改变，导致当前字符计量不再适合作为稳定近似值时。

## Sources

- S1: `specs/model-context-pruning/requirements.md`
- S2: `specs/model-context-pruning/design.md`
- S3: `packages/agent/src/context-unit.ts`
- S4: `packages/agent/src/conversation-context-unit-adapter.ts`
- S5: `packages/agent/src/context-compactor.ts`
- S6: `packages/agent/src/prompt.ts`
- S7: `packages/tui/src/cli.tsx`
- S8: `packages/agent/test/conversation-context-unit-adapter.test.ts`
- S9: `packages/agent/test/context-compactor.test.ts`
- S10: `packages/agent/test/prompt.test.ts`
- S11: `packages/agent/test/execution-control.test.ts`
- S12: `packages/tui/test/cli.test.ts`
- S13: `packages/tui/test/cli.integration.test.ts`
- S14: `packages/storage/src/goal-snapshot-codec.ts`

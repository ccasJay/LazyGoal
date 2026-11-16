---
feature: openai-compatible-generation-contract
status: active
summary: 常规 Goal 的 openai-compatible 供应商按 Chat Completions 协议执行 Think 与 Decide，以封口内容块统一流式生成、单调用校验、持久化与重启后原生回放
source_spec: specs/openai-compatible-generation-contract/
distilled_at: 2026-11-16
reviewed_at: 2026-11-16
tags: [openai-compatible, chat-completions, content-blocks, streaming, tool-calling, native-replay, protocol-contract, llm]
authorities: [packages/llm-openai/src/openai-compatible.ts, packages/llm/src/default-adapters.ts, packages/llm-core/src/types.ts, packages/runtime/src/runner.ts, packages/llm-openai/test/openai-stream.test.ts]
---

# OpenAI-compatible 生成与原生回放契约

## Purpose

- 常规 Goal 的 `openai-compatible` 供应商按 Chat Completions 协议装配单一 Adapter，Think 与 Decide 共用同一连接；目标路径删除 `strict`／`prompt_only`／`two_stage` 的模式匹配与按模式分支，Adapter 只按本次请求声明的生成约束构造供应商参数。 [S1, S2, S3]
- 封口内容块是流式生成、请求历史持久化与重启回放的统一数据形式：完整生成、拒绝与未完成响应是可区分的结果类别，恢复执行以原生工具交换回放续接。 [S1, S2]

## Durable Decisions

- D1 — 共享内容块唯一归属 `model-contracts`，`llm-core` 借其表达流封口；目标路径请求历史与持久化复用同一份封口块，正文与工具列表按需派生，不单独维护扁平 assistant 字段或回放副本。 [S1, S2]
- D2 — 终态只由 Adapter 归一化：流正常消费结束且收到明确 `stop` 或 `tool_calls`、所需内容均已封口时交付唯一 `completed` 并保留原始结束原因；拒绝、过滤、截断、响应不完整、取消与协议错误各自独立记录，工具执行次数为零，已发布片段仅供观察。 [S1, S2, S5]
- D3 — Decide 每轮最多执行一个合法调用：回复只有正文产生 `NO_USABLE_RESULT` 纠正反馈并重试；一轮多个工具调用拒绝整轮并以 `multiple_tool_calls` 反馈重试；调用未通过既有工具声明、参数或阶段契约校验时零执行并返回可定位反馈；工具块封口仍缺网关原始调用 ID 是协议错误且零执行。 [S1]
- D4 — 原生回放边界：只取当前同身份（provider + endpoint + model + protocol）、已结算且已提交的工具交换，从封口块回放 assistant 消息，原样回传调用 ID、工具名与参数字符串并按原始 ID 配对工具结果；身份切换或交换未提交时用语义历史重建上下文，保留当前 Goal 的已提交事实。 [S1, S4]
- D5 — 故障与重试边界：已分类暂时传输故障由 Runtime 按既有预算重试，Adapter 单次调用只发一次请求并释放流；已结算工具不因重试、恢复或重启再次执行。 [S1, S4, S5]

## Guardrails

- 请求按本次声明构造：两阶段省略顶层输出 Schema、`parallel_tool_calls` 与 `stream_options.include_usage`，Decide 省略工具声明的 `strict` 字段，Think 结果保持为 `system_request_think` 的工具结果；不得重新引入按旧模式的分支。 [S1, S2]
- 原生 reasoning 只按原样回放：首批回放字段以 `reasoning_content` 为准，`thought` 保留在生成记录，不进入回放。 [S1]
- 用量只记录网关实际返回的有效值，不伪造、不估算补齐。 [S1, S6]
- 不以 EOF、部分 JSON 或是否出现过工具索引推断可执行结果；明确拒绝、过滤与耗尽直接报告，不转写为工具执行失败。 [S1, S2]

## Revisit When

- 新增供应商协议、内容块类型，或需要按模式分支的生成约束时。
- `model-contracts` 内容块形状、阶段请求装配或 Runtime 阶段接受条件变化时。
- 跨身份与未提交交换的回放边界调整时。

## Sources

- S1: `specs/openai-compatible-generation-contract/spec.md`
- S2: `packages/llm-openai/src/openai-compatible.ts`
- S3: `packages/llm/src/default-adapters.ts`
- S4: `packages/runtime/src/runner.ts`
- S5: `packages/llm-core/src/types.ts`
- S6: `packages/llm-openai/test/openai-stream.test.ts`

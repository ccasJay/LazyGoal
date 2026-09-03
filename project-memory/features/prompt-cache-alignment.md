---
feature: prompt-cache-alignment
status: active
summary: "实现 Goal-stable → Epoch-stable → Step-dynamic 三层请求拓扑以最大化大模型前缀缓存命中"
source_spec: specs/prompt-cache-alignment/
distilled_at: 2026-09-03
reviewed_at: 2026-09-03
tags: [prompt-cache, kv-cache, prompt-topology, token-budget, stateless-render]
authorities: [docs/architecture/agent.md, packages/agent/src/model-inference-view.ts, packages/agent/src/render.ts, packages/agent/src/step-prompt/agent-decision@1.njk]
---

# Prompt Cache Alignment

## Purpose

- 构建面向大语言模型 KV 缓存对齐的三层请求拓扑，固化高生命周期前缀并隔离浮动水位，使长任务执行中的多轮步骤共享相同前缀，同时保持纯函数无状态恢复契约。 [S1, S2]

## Durable Decisions

- D1 — 提升 Approved Task Contract（`objective` 与带索引编号的 `completionCriteria`）至 `Goal-stable` 根前缀（System Message），在整个执行阶段跨步 100% 逐字相同。 [S1, S2, S3, S5]
- D2 — 隔离 `Epoch-stable` 中间前缀的微观 Token 水位（`inputTokens` 与 `remainingTokens`），仅在超限时注入离散 `checkpointRequired: true` 信号，保证同一 Epoch 内对话消息前缀 100% 逐字固定。 [S1, S2, S3, S4]
- D3 — 精简 `Step-dynamic` 尾部控制消息为纯增量 `StepDynamicPayload`，彻底剔除重复的 `intent`、`task`、`contextEpoch` 及内部 `budget` 报告，降低单次传输开销与注意力干扰。 [S1, S2, S3, S4]
- D4 — 保持 `renderRequest` 的纯函数无状态特性，断点恢复完全基于已持久化 Snapshot 与 Trajectory committed boundary，不依赖任何外部有状态连接。 [S1, S2, S4, S6]

## Guardrails

- 尾部 Step-dynamic 消息严禁重复全量序列化已在 System Message 声明的任务契约与目标。 [S1, S2, S4]
- 严禁将微观浮动 Token 数字或动态时间戳注入 Goal-stable 或 Epoch-stable 前缀。 [S1, S2, S3, S4]
- Tool Action 必须将参数放置于 `input` 对象中，严禁将工具参数平铺在 `action` 顶层。 [S2, S5]
- 恢复后的首次请求必须与同状态中断前生成的请求完全幂等。 [S1, S2, S6]

## Revisit When

- 引入支持会话级持久连接（Stateful Session API）的专属模型运行时时。
- 任务执行期支持动态重协商或运行时增加 Completion Criterion 时。

## Sources

- S1: `specs/prompt-cache-alignment/requirements.md`
- S2: `specs/prompt-cache-alignment/design.md`
- S3: `packages/agent/src/model-inference-view.ts`
- S4: `packages/agent/src/render.ts`
- S5: `packages/agent/src/step-prompt/agent-decision@1.njk`
- S6: `packages/agent/test/prompt-cache-alignment.test.ts`

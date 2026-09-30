---
feature: session-metrics-projection
status: active
summary: "从持久化模型调用事实与 Goal Snapshot 投影逐 Run 和全会话指标，提供可信用量、效率、覆盖状态及本机只读订阅"
source_spec: specs/session-metrics-projection/
distilled_at: 2026-09-30
reviewed_at: 2026-09-30
tags: [session-metrics, model-usage, cache-hit, throughput, run, http, coverage]
authorities: [docs/architecture/session-metrics.md, docs/architecture/http.md, packages/runtime/src/model-call-metrics.ts, packages/agent/src/llm-step-executor.ts, packages/storage/src/json-file-metrics-store.ts, packages/session-metrics/src/session-metrics-service.ts, packages/session-metrics/src/session-metrics-http.ts, packages/http/src/http-service.ts, packages/tui/src/cli.tsx]
---

# Session Metrics Projection

## Purpose

- 将独立的模型调用事实与 Goal Snapshot 合成为当前及历史 Run、全会话的只读指标，并通过本机 HTTP 提供读取和运行中更新；指标不参与 Goal 执行或恢复。 [S1, S2, S3, S4, S8, S13]

## Durable Decisions

- D1 — 每次 Adapter 调用以稳定 `callId` 记录开始与结束事实，按 Goal/Run 独立追加到 JSONL；指标查询从事实重算并按 `callId` 去重，损坏或冲突事实报错。记录面与 Diagnostic Trace、Trajectory、Goal Snapshot 分离，不持久化指标累计值。 [S1, S2, S5, S6, S7, S8, S13]
- D2 — Step 数和 Run 列表以最新 Goal Snapshot 为权威；有已提交 Step 的 Run 计为一轮。模型输入/输出用量按调用事实归属到 Run，再汇总到 Goal；缓存命中率是 Run/Goal 指标，`stepCount` 不表示逐 Step 用量或命中率。 [S1, S2, S4, S8, S12, S13]
- D3 — 正式 Token 合计只使用供应商确认的用量；缺失、失败、中止及恢复后未结束的调用进入缺失计数。新旧 Goal 的接入标记和可检测的写入缺口决定 `complete`、`partial`、`unavailable` 覆盖状态；无真实上报时合计为 `null`，旧会话不回填。 [S1, S2, S6, S7, S8, S12]
- D4 — 缓存命中率只对明确报告缓存读取数且输入量为正的调用计算 `cachedInputTokens / inputTokens`；生成速度只对同时有真实输出量和流式首个非空文本至完成的正时长的调用计算。两者都公开参与/排除调用数；无合格调用时为 `null`。 [S1, S2, S6, S8, S12, S13]
- D5 — `@lazygoal/session-metrics` 提供每次重读事实的 `read`/`watch` 和只读 JSON/SSE 路由；`@lazygoal/http` 负责复用型路由挂载与显式回环监听生命周期。指标路由拒绝非 GET、非法 Host 和跨域 Origin，慢或断开的 SSE 客户端不阻塞 Goal；组合入口装配服务但不自动监听端口。 [S1, S2, S4, S8, S9, S10, S11, S13, S14, S15]

## Guardrails

- 指标文件只保存身份、调用结果、用量来源、数值及计时，不保存 Prompt、模型响应正文、Tool 参数、凭据或 pi-ai 诊断估算；指标写入失败不得改变模型调用或 Goal 结果。 [S1, S2, S5, S6, S7, S8]
- 不得把缺失的缓存读取数或供应商用量推断为零，也不得用整次请求耗时替代首文本后的生成时长。 [S1, S2, S6, S8, S12]
- Goal Snapshot 与指标事实是独立提交边界；运行中两者可暂时反映不同提交时刻，可检测缺口须显式呈现，不能宣称指标是恢复依据或逐 Step 明细。 [S1, S2, S4, S8, S13]

## Revisit When

- 需要逐 Step 的用量或缓存命中率，并为模型调用与 Step 建立可核验的聚合契约时。
- 需要成本、缓存写入量、远程访问或基于指标的预算控制时。
- 需要 Goal Snapshot 与指标事实的跨存储原子一致性或不可检测写入故障的恢复保证时。

## Sources

- S1: `specs/session-metrics-projection/requirements.md`
- S2: `specs/session-metrics-projection/design.md`
- S3: `specs/session-metrics-projection/tasks.md`
- S4: `docs/architecture/session-metrics.md`
- S5: `packages/runtime/src/model-call-metrics.ts`
- S6: `packages/agent/src/llm-step-executor.ts`
- S7: `packages/storage/src/json-file-metrics-store.ts`
- S8: `packages/session-metrics/src/session-metrics-service.ts`
- S9: `packages/http/src/http-service.ts`
- S10: `packages/session-metrics/src/session-metrics-http.ts`
- S11: `packages/tui/src/cli.tsx`
- S12: `packages/session-metrics/test/session-metrics-service.test.ts`
- S13: `packages/session-metrics/test/session-metrics.integration.test.ts`
- S14: `packages/session-metrics/test/session-metrics-http.test.ts`
- S15: `docs/architecture/http.md`

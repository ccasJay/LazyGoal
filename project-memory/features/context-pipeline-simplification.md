---
feature: context-pipeline-simplification
status: active
summary: "移除无消费者的上下文压缩适配器与 Warm Sidecar，统一为严格协议驱动的执行单元上下文流水线"
source_spec: specs/context-pipeline-simplification/
distilled_at: 2026-09-03
reviewed_at: 2026-09-03
tags: [context-pipeline, trajectory, warm-context, dead-code-removal, pruning]
authorities: [docs/architecture/agent.md, docs/architecture/runtime.md, packages/agent/src/trajectory-model-context-assembler.ts, packages/runtime/src/goal-coordinator.ts]
---

# Context Pipeline Simplification

## Purpose

- 删除没有生产消费者的语义 Compact、Warm Sidecar 和后台维护生命周期，将模型输入上下文收敛为 Conversation 单元裁剪与 Trajectory 确定性执行单元组装。 [S1, S2]

## Durable Decisions

- D1 — 移除 `ContextCompactAdapter` 及其独立 Compact LLM 请求链路，主模型调用不依赖异步总结模型，避免未启用的次级推理开销。 [S1, S2, S3]
- D2 — 移除 `WarmContextSidecarStore` 与 `ContextMaintenanceWorker` 后台生命周期，Warm 上下文在组装时直接基于 committed boundary 内存纯函数计算，不持久化中间缓存。 [S1, S2, S3]
- D3 — 移除与现有严格协议重复的 `ContextSourceRouter`，历史检索直接经 `normalizeContextLookupRequest` 校验并派发至 `ContextLookupPort`。 [S1, S2, S4]
- D4 — 上下文装配统一基于 `TrajectoryExecutionUnitAdapter`，排除跨身份、乱序和未提交 tail，收窄公共 API 导出。 [S1, S2, S3, S6]

## Guardrails

- 严禁在未提交的 Trajectory tail 上生成 Hot 或 Warm 上下文。 [S1, S2, S3]
- 历史检索缓存仅由 Retrieval Index Sidecar 负责，不恢复独立的 Warm Sidecar 文件体系。 [S1, S2, S4]
- Context lookup 仅支持三类既定历史需求（`conversation_history`、`historical_execution`、`decision_rationale`），严禁替代当前环境 Tool Observation。 [S1, S2, S4, S5]

## Revisit When

- 生产环境出现超大规模执行轨迹需要引入独立离线分级压缩模型时。
- Context Lookup 需求扩展至跨会话检索或多 Agent 协同知识共享时。

## Sources

- S1: `specs/context-pipeline-simplification/requirements.md`
- S2: `specs/context-pipeline-simplification/design.md`
- S3: `packages/agent/src/trajectory-model-context-assembler.ts`
- S4: `packages/runtime/src/goal-coordinator.ts`
- S5: `packages/runtime/test/context-retrieval-protocol.test.ts`
- S6: `packages/agent/test/trajectory-model-context-assembler.test.ts`

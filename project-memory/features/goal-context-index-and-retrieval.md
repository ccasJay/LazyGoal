---
feature: goal-context-index-and-retrieval
status: active
summary: "在同一 Goal 内构建跨 Run 阶段目录与重要信息索引，提供有界模型导航与直接来源展开"
source_spec: specs/goal-context-index-and-retrieval/
distilled_at: 2026-10-13
reviewed_at: 2026-10-13
tags: [goal-context, run-stage, index, retrieval, navigation, context-lookup, sidecar, recovery]
authorities: [packages/context-retrieval/src/goal-context-index.ts, packages/storage/src/goal-context-index-store.ts, packages/agent/src/goal-context-navigation.ts, packages/agent/src/prompting/dynamic-section-registry.ts, packages/runtime/src/domain.ts, packages/runtime/src/runner.ts, packages/model-contracts/src/model-output/system-tools.ts]
---

# Goal Context Index and Retrieval

## Purpose

- 在同一 Goal 内建立跨 Run 的阶段与关键信息索引，让 Agent 在开始新 Run、恢复执行或长任务推进时先了解历史工作、决策与用户要求，再按稳定引用分层展开详情，避免重放全量历史或猜测事件序号。 [S1, S2, S3, S5]

## Durable Decisions

- D1 — 阶段目录与重要信息从已提交的权威 Trajectory 和 Snapshot 用户消息纯派生，包含每个 Run 的提交边界与来源摘要。派生索引作为只读缓存持久化于 `context-sidecars/<encoded-goal-id>/goal-index.json`；缓存损坏或边界失配时从权威来源安全重建，权威保存失败不使用失效缓存，索引写入不推进 Run 或 Memory 边界。 [S1, S3, S4, S10]
- D2 — 模型提议的重要信息字段（`contextNotes`）包含重要决策（`decision`）与用户强调信息（`user_emphasis`）。Runtime 在合法决策接受的提交边界验证并保存记录；用户强调信息必须引用真实已应用的原文片段，决策信息区分用户决定与 Agent 方案；非法提议原子拒绝走严格纠错，不作为 Fact 或业务授权。 [S1, S2, S5, S6, S11]
- D3 — 历史检索沿用 `context_lookup` / `system_context_lookup` 统一入口，扩展支持目录顺序浏览（`directory_browse`）、关键词搜索（`directory_search`）与直接来源展开（`source_expand`）。目录结果携带稳定游标与截断标记，直接展开无需搜索，未命中允许继续查询原会话历史；检索条目统一标记为历史，不作为当前 Run 的完成证据。 [S1, S3, S7, S12]
- D4 — Agent 请求动态组装 `goal_context_navigation` 动态 Section，优先保留当前阶段及其未完成缺口、上一阶段已接受结果与明确依赖入口；长目录按相关性与稳定身份截断并提供继续查询指引，引用已应用用户消息时不重复正文，固定预算超限调用前快速失败，末尾严格保留 `runtime_feedback`。 [S1, S2, S8, S9, S13]
- D5 — 评测质量套件与索引冒烟探针通过固定正反任务验证旧决策替代与同名阶段隔离、用户强调未提取时的原历史回查、时效数据边界核对，以及确定性失败优先；不以 Agent 纯自述或单一样本断言整体成功率。 [S1, S2, S14, S15]

## Guardrails

- 严禁将检索命中记录作为当前 Run 的完成 Evidence，严禁以此直接修改 Working Memory Facts 或绕过工具授权。 [S1, S5, S7]
- 严禁在 Goal Snapshot 中冗余保存全量阶段历史正文，严禁在导航中重复发送已应用用户消息的全文。 [S1, S3, S8]
- 索引缓存失效不能阻塞权威执行，权威来源读取失败绝不能返回不完整目录伪充全量结果。 [S1, S4, S10]

## Revisit When

- Run 内部阶段契约或 Trajectory 事件流定义变更时。
- 模型上下文预算策略、动态 Section 注册拓扑或提示词缓存规则变更时。
- Context Lookup 契约协议或底层向量/多模态检索能力扩展时。

## Sources

- S1: `specs/goal-context-index-and-retrieval/spec.md`
- S2: `specs/goal-context-index-and-retrieval/plan.md`
- S3: `packages/context-retrieval/src/goal-context-index.ts`
- S4: `packages/storage/src/goal-context-index-store.ts`
- S5: `packages/runtime/src/domain.ts`
- S6: `packages/runtime/src/runner.ts`
- S7: `packages/model-contracts/src/model-output/system-tools.ts`
- S8: `packages/agent/src/goal-context-navigation.ts`
- S9: `packages/agent/src/prompting/dynamic-section-registry.ts`
- S10: `packages/context-retrieval/test/goal-context-index.test.ts`
- S11: `packages/runtime/test/context-notes.test.ts`
- S12: `packages/context-retrieval/test/goal-context-query.test.ts`
- S13: `packages/agent/test/goal-context-navigation.test.ts`
- S14: `benchmarks/context/test/goal-context-quality.test.ts`
- S15: `benchmarks/context/src/goal-index-smoke.ts`

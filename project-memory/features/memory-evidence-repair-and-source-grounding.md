---
feature: memory-evidence-repair-and-source-grounding
status: active
summary: "在 Decide 阶段修复非法 Memory Patch，限定历史检索来源，并核对完成答复的真实依据"
source_spec: specs/memory-evidence-repair-and-source-grounding/
distilled_at: 2026-10-11
reviewed_at: 2026-10-11
tags: [memory-patch, evidence, model-repair, goal-history, completion-review, evaluation]
authorities: [packages/runtime/src/runner.ts, packages/runtime/src/runtime-feedback.ts, packages/runtime/src/evidence-gate.ts, packages/runtime/src/trajectory-checkpoint-committer.ts, packages/agent/src/context-lookup-projection.ts, packages/agent/src/completion-review.ts, packages/runtime/test/working-memory-runner.test.ts, packages/agent/test/completion-review-eval.ts]
---

# Memory Evidence Repair and Source Grounding

## Purpose

- 模型的非法记忆提议应在 Decide 阶段阻止副作用并得到可修复反馈；历史查询与完成审查应按实际来源和用户要求判断，避免把查询未命中或通用案例写成仓库事实。 [S1, S2, S3, S8, S9]

## Durable Decisions

- D1 — Runner 在业务动作、等待、检查点及完成审查前，用 Working Memory 和 Evidence 规则校验模型候选 Patch，并作无 I/O 的试归约；只将候选校验错误转成带稳定原因、字段路径及有界有效证据提示的 `memory_patch` 反馈。无有效证据时明确为 `none`，合法序号仍需与命题相关。具体阶段预算和持久化纠错归既有 Runtime Feedback 决策所有。 [S1, S3, S4, S5, S6, S12]
- D2 — 非法 Patch 原子拒绝；模型必须修正或显式省略，再重新验证完整决策。接受时在阶段事实追加后按 `memory_patch_accepted` 的实际序号最终归约并提交；试归约身份不得落盘。恢复、配置、存储和内部不变量错误维持原失败路径。 [S1, S3, S7, S12]
- D3 — Context Lookup 的 `found`、`not_found`、`lookup_error` 经普通上下文和原生工具历史都呈现 `goal_history` 来源范围及固定限制：只查询当前 Goal 历史，未搜索工作区文件，未命中不证明仓库对象不存在，lookup 事件不能直接支持 Fact。需要指定仓库资料时使用已有授权读取工具；充分来源可以复用。 [S1, S8, S13]
- D4 — 完成审查依据当前请求、实际提供的来源和候选交付物判断：真实案例要求不能由通用示例替代，设计说明不能写成已验证实现。拒绝沿用 `completion_review` 反馈；充分来源、明确通用示例和问候可正常接受，且不要求每个答案都有工具调用。 [S1, S9, S11]
- D5 — 来源选择和 Patch 修复与完成审查分别评测；场景使用生产请求、工具声明及反馈生成路径，每个固定场景重复三次。报告保留模型配置、输入哈希、逐次结果和误判；缺失调用算 `incomplete`。此证据只支持固定场景的当前行为，不推断长期任务成功率。 [S1, S2, S10, S11]

## Guardrails

- 不放宽 Fact 证据白名单，不把历史查询事件当直接证据，不静默丢弃 Patch 操作，不新增 RAG、审查服务或纠错预算。 [S1, S3, S5, S8]
- 评测夹具须与 Run 模式、工具 Schema 和生产反馈注入一致；检查点 marker 会改变实际 Patch 序号，不能用试归约序号生成持久身份。 [S2, S7, S10, S12]

## Revisit When

- Evidence 可用事件集合、Memory Patch 提交顺序、Context Lookup 语料范围或模型输入路径变化时。
- 完成审查模型、评测场景、工具 Schema 或来源要求变化时。

## Sources

- S1: `specs/memory-evidence-repair-and-source-grounding/spec.md`
- S2: `specs/memory-evidence-repair-and-source-grounding/plan.md`
- S3: `packages/runtime/src/runner.ts`
- S4: `packages/runtime/src/runtime-feedback.ts`
- S5: `packages/runtime/src/evidence-gate.ts`
- S6: `packages/working-memory/src/core.ts`
- S7: `packages/runtime/src/trajectory-checkpoint-committer.ts`
- S8: `packages/agent/src/context-lookup-projection.ts`
- S9: `packages/agent/src/completion-review.ts`
- S10: `packages/agent/test/decision-guidance-eval.ts`
- S11: `packages/agent/test/completion-review-eval.ts`
- S12: `packages/runtime/test/working-memory-runner.test.ts`
- S13: `packages/agent/test/context-lookup-projection.test.ts`

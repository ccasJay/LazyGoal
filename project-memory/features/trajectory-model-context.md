---
feature: trajectory-model-context
status: active
summary: "按 Token 预算组装包含 Hot 执行单元与有界 Warm 紧缩的有界模型上下文"
source_spec: specs/trajectory-model-context/
distilled_at: 2026-09-03
reviewed_at: 2026-09-03
tags: [trajectory, context-assembly, hot-window, warm-compact, token-budget]
authorities: [docs/architecture/agent.md, packages/agent/src/trajectory-model-context-assembler.ts, packages/agent/src/model-inference-view.ts]
---

# Trajectory Model Context

## Purpose

- 在不修改底层权威数据的前提下，依据模型可用预算从 committed 历史中组装有界模型输入：以近期完整执行单元形成 Hot 窗口，以分类结构化条目形成 Warm 紧缩。 [S1, S2]

## Durable Decisions

- D1 — 模型输入组装严格来源分离：只能使用当前 Goal/Run 中不超过 Snapshot 提交边界的 committed 来源，严禁将未提交 tail 纳入 Hot 或 Warm 上下文。 [S1, S2, S3]
- D2 — 预算分配覆盖全部不可裁剪内容：先扣除 System Prompt、Profile、Tool Schema、Goal Task、当前执行状态与输出预留，剩余预算再向动态窗口分配。 [S1, S2, S3]
- D3 — Hot Window 遵循连续执行单元原则：Action、Tool 结果与 Observation 组成不可拆分的原子执行单元，从最新向旧连续选择，严禁跳选或拆分单元。 [S1, S2, S3, S5]
- D4 — 超大历史 Tool 输出采用有界预览投影：包含 preview、内容哈希、截断标记与制品引用，保持原始 Observation 的不可变性。 [S1, S2, S3, S4]
- D5 — 移出 Hot Window 的中期信息进入容量受限的 Warm 紧缩层，受配额约束，支持确定性合并与失效，不产生永久 Pin 状态。 [S1, S2, S3]

## Guardrails

- 上下文选择与 Compact 属于只读投影过程，严禁修改原始 Trajectory、Goal Snapshot 或 Working Memory。 [S1, S2, S3]
- 不可裁剪核心输入超过预算时必须返回可识别诊断，严禁通过静默截断伪装成合法输入。 [S1, S2, S3]

## Revisit When

- 上下文组装支持跨 Run 历史执行单元合并时。
- 引入硬件级长序列上下文压缩协议时。

## Sources

- S1: `specs/trajectory-model-context/requirements.md`
- S2: `specs/trajectory-model-context/design.md`
- S3: `packages/agent/src/trajectory-model-context-assembler.ts`
- S4: `packages/agent/src/model-inference-view.ts`
- S5: `packages/agent/test/trajectory-model-context-assembler.test.ts`

---
feature: run-stage-review-and-context-projection
status: active
summary: "在同一 Run 内支持模型自主组织阶段、按阶段审查与修订、上下文去重与折叠展示"
source_spec: specs/run-stage-review-and-context-projection/
distilled_at: 2026-10-15
reviewed_at: 2026-10-17
tags: [run-stage, review, stage-revision, context-projection, deduplication, goal-board, recovery]
authorities: [packages/runtime/notes/overview.md, packages/agent/notes/overview.md, packages/runtime/src/run-stage.ts, packages/runtime/src/runner.ts, packages/model-contracts/src/model-output/system-tools.ts, packages/model-request/src/completion-review.ts, packages/storage/src/goal-snapshot-codec.ts, packages/browser/src/browser-projection.ts, packages/runtime/test/run-stage-execution.test.ts, packages/runtime/test/run-stage-review.test.ts, packages/runtime/test/run-stage-recovery.test.ts, packages/storage/test/run-stage-snapshot.test.ts, packages/model-execution/test/completion-review.test.ts, apps/goal-board/test/run-stage-presentation.test.ts]
---

# Run Stage Review and Context Projection

## Purpose

- 模型可在同一 Run 内自主组织阶段目标与完成条件，经多 Step 执行、审查和修订再推进；上下文投影消除重复动作参数与正文，Web 看板按阶段稳定身份折叠展示。 [S1, S2, S3, S4, S5, S7]

## Durable Decisions

- D1 — 同一 Run 内模型通过 `system_update_run_stage` 声明非空目标与完成条件自主组织阶段，Runtime 分配稳定身份（如 `stage-1`）、保存修订及前序已接受结果引用；阶段切换保持 goalId、runId、执行预算累计与授权边界，禁止因阶段流转创建新 Run、伪造用户输入或重置预算。 [S1, S3, S4, S8, S10]
- D2 — 阶段说明支持带非空理由的原子修订，过期修订整体拒绝；修订删除或拆分未完成条件不得降低用户既有要求，模型自行调低条件不能作为阶段或 Run 完成依据。 [S1, S3, S4, S10]
- D3 — 阶段候选经协议、Memory Patch 及证据校验后进入审查；中间阶段通过 `system_complete_run_stage` 审查接受后仅提交阶段结果并保持 Run executing；最终 `complete` 交付候选在同一次审查中兼顾当前阶段与整体用户要求，接受时阶段与 Run 完成原子提交。 [S1, S3, S4, S5, S8, S11, S14]
- D4 — 审查拒绝提交具体缺口反馈并作为同一 Run 的下一 Step 继续执行，不计入参数格式纠错预算；最终审查拒绝时原子重新打开已接受阶段为 executing 并保留历史事实；非法参数、过期修订及审查响应格式错误仍沿用既有纠错上限。 [S1, S3, S4, S11]
- D5 — 上下文投影对已保留原生调用交换消除重复动作参数与封装，授权 Section 仅保留工具身份与使用指导而不复制已声明 Schema；审查输入去重 tool_finished 与 observation_recorded 重复正文并过滤内部 Think，保留原始要求、失败状态与截断标记。 [S1, S5, S9, S14]
- D6 — 阶段事实通过现有 CheckpointCommitter 持久化至 Trajectory 与 Snapshot，重启仅恢复 Snapshot 边界内的当前阶段修订与最新拒绝缺口；Web 看板按稳定阶段身份折叠展示 Steps 与审查记录，阶段接受不提前更新 Run 终态标签。 [S1, S3, S6, S7, S12, S13, S15]

## Guardrails

- 阶段流转、审查拒绝或执行失败不得自动新建 Run、重置执行预算或自动同步 GoalPlan Todo。 [S1, S3, S4, S10]
- 阶段通过不等于最终产物正确；若后续修改了产物但未重新验证，前序通过记录不得支持交付。 [S1, S5, S11, S14]
- 审查超预算或传输失败必须显式报错，不得以截断放行、有损摘要或伪装为语义拒绝。 [S1, S5, S14]
- Web 看板禁止展示内部思维过程，禁止以 SSE 临时状态作为恢复权威。 [S1, S7, S15]

## Revisit When

- 当 Run 生命周期、GoalPlan 调度或模型系统工具契约发生重大演进时。
- 当完成审查模型协议、上下文去重管线或 Web 看板阶段展示结构调整时。

## Sources

- S1: `specs/run-stage-review-and-context-projection/spec.md`
- S2: `specs/run-stage-review-and-context-projection/plan.md`
- S3: `packages/runtime/src/run-stage.ts`
- S4: `packages/runtime/src/runner.ts`
- S5: `packages/model-request/src/completion-review.ts`
- S6: `packages/storage/src/goal-snapshot-codec.ts`
- S7: `packages/browser/src/browser-projection.ts`
- S8: `packages/model-contracts/src/model-output/system-tools.ts`
- S9: `packages/model-context/src/trajectory-model-context-assembler.ts`
- S10: `packages/runtime/test/run-stage-execution.test.ts`
- S11: `packages/runtime/test/run-stage-review.test.ts`
- S12: `packages/runtime/test/run-stage-recovery.test.ts`
- S13: `packages/storage/test/run-stage-snapshot.test.ts`
- S14: `packages/model-execution/test/completion-review.test.ts`
- S15: `apps/goal-board/test/run-stage-presentation.test.ts`

---
feature: runtime-feedback-tool-approval
status: active
summary: "将有限授权、可安全重试与模型纠错反馈纳入可恢复 Runtime 阶段流程"
source_spec: specs/runtime-feedback-tool-approval/
distilled_at: 2026-10-01
reviewed_at: 2026-10-01
tags: [runtime-feedback, model-repair, retry, tool-approval, recovery, authorization]
authorities: [docs/architecture/agent.md, packages/runtime/src/runner.ts, packages/runtime/src/runtime-feedback.ts, packages/agent/src/stage-feedback.ts, packages/runtime/test/runner.test.ts, packages/runtime/test/think-decision-recovery.test.ts]
---

# Runtime Feedback and Tool Approval

## Purpose

- Runtime 按错误性质分流为安全重试、模型阶段纠错、等待用户或明确失败；模型纠错与 Tool 授权不改变原有 Contract、Profile、执行策略和证据 gate。 [S1, S2, S3, S4]

## Durable Decisions

- D1 — 模型输出解析、Contract、可纠正决策语义、Tool 选择／输入或完成证据错误，必须先阻止无效决策及其副作用，再把稳定错误码、问题路径与安全约束反馈至原 Think／Decide 阶段。纠错保留同一执行单元身份；Decide 错误保留已提交 Think 结果。 [S1, S2, S3, S5, S6]
- D2 — 每次纠错重新通过相同解析、授权和证据验证；无效 JSON／决策不成为 Conversation 完成消息。反馈以身份绑定的 Trajectory 事实持久化，恢复时只读取当前 Goal／Run／executionUnit／Step／stage 对应的提交反馈。 [S1, S2, S3, S4, S6]
- D3 — 模型纠错每个阶段最多三次总调用；耗尽后停止并报告终态失败。普通 `request_think` 循环不受该纠错次数限制。 [S1, S2, S3, S4, S7]
- D4 — 系统对可识别的暂时 Provider 故障作有限重试；Tool 只有在声明可安全重放且当前 Action 获准时才重放，并保留 Action 身份及原授权。取消立即停止；不确定结果的 manual Tool 不自动重放。 [S1, S2, S3, S7]
- D5 — 反馈、自动重试、等待与终态失败通过稳定身份和历史尝试分别投影；无效模型原文不显示为最终已提交答复。 [S1, S2, S4, S7]

## Guardrails

- RuntimeFeedback 不是用户消息或授权指令；模型纠错不能放宽输出 Contract、Tool 输入校验、Profile、Evidence 或授权范围。 [S1, S2, S3, S5]
- 适配器／Contract decoder 的单次调用仍只执行一次，不在其中隐式重试；模型纠错必须先追加匹配当前阶段的持久化反馈，再以新的阶段调用继续。 [S1, S2, S3, S4]
- 未提交的失败反馈、授权或结果不能驱动恢复执行；达到尝试上限、取消或不可纠正错误时停止后续模型与 Tool 调用。 [S1, S2, S3, S4, S7]

## Revisit When

- 反馈身份字段、错误分类、纠错上限、可安全重放 Tool 声明或授权范围变化时。
- 运行重试与模型纠错的 UI 时间线或恢复协议变化时。

## Sources

- S1: `specs/runtime-feedback-tool-approval/requirements.md`
- S2: `specs/runtime-feedback-tool-approval/design.md`
- S3: `specs/runtime-feedback-tool-approval/tasks.md`
- S4: `packages/runtime/src/runner.ts`
- S5: `packages/agent/src/stage-feedback.ts`
- S6: `packages/runtime/src/runtime-feedback.ts`
- S7: `packages/runtime/test/think-decision-recovery.test.ts`

---
feature: prompt-context-layering
status: active
summary: "分离阶段固定指令与动态上下文，并按模型可见历史恢复增量 section 更新"
source_spec: specs/prompt-context-layering/
distilled_at: 2026-10-01
reviewed_at: 2026-10-01
tags: [prompt, context, dynamic-sections, recovery, token-budget, think-decide]
authorities: [docs/architecture/agent.md, packages/agent/src/step-prompt/agent-decision@1.njk, packages/agent/src/llm-step-executor.ts, packages/runtime/src/trajectory.ts, packages/runtime/src/trajectory-checkpoint-committer.ts]
---

# Prompt Context Layering

## Purpose

- 将稳定的基础指令和阶段协议与当前 Goal／Run 动态状态分层，按阶段实际保留的模型可见历史重建每次 Think／Decide 请求，避免状态更新反复改写固定前缀或遗漏本轮必需上下文。 [S1, S2, S3, S4, S5]

## Durable Decisions

- D1 — 固定指令只描述长期规则与阶段职责；Run 模式、任务、GoalPlan、授权工具和 Working Memory 作为有来源身份的动态 section，不改变同阶段基础文本。参考场景中的内置基础指令与阶段固定说明各自至少 2,000 `o200k_base` tokens，不设上限；Profile、动态 section、Conversation、Working Context、Shape Guide 与工具 schema 不计入。 [S1, S2, S4, S5]
- D2 — Section 更新按相同阶段中当前模型可见投影与最近有效的保留历史比较：首次发送完整内容，投影不变不追加，变化时追加所需更新，移除时明确失效。只有已提交 frame 可以作为重建基线；事实轨迹和调用输入正文不得被投影更新改写。 [S1, S2, S3, S4]
- D3 — 每次模型请求都重新提供当前 Step 与 Action 等执行控制内容；Think 与 Decide 各自维护阶段历史，已提交 Think 输出显式传递给 Decide，不能因动态 section 未变而省略本轮状态。 [S1, S2, S3, S4]
- D4 — 不可裁剪的必需输入无法容纳时，请求在调用模型前以明确错误失败；上下文裁剪、Epoch 切换或恢复后，缺失的当前 section 必须补齐，不以未提交 tail 建立比较基线。 [S1, S2, S3, S4]

## Guardrails

- 固定指令、Profile、动态 section、真实 Conversation、Working Context 和 Think 历史保留各自来源与角色语义；不把用户消息状态拼入 system 指令，不对数据文本二次执行模板。 [S1, S2, S4, S5]
- Snapshot 提交边界内的 context frame 是 section 恢复基线；仅写入请求模型输入日志不提交 frame、不推进基线。 [S2, S3, S4, S6]
- 不得通过字符数、令牌目标或摘要裁剪静默移除不可裁剪内容；固定文本计量范围不得混入动态请求数据。 [S1, S2, S3]

## Revisit When

- 固定 Prompt Bundle 版本、消息角色／来源协议、Context Epoch 或 Section 更新语义改变时。
- 引入新的阶段、动态 section，或修改参考 tokenizer 与固定指令最低规模时。

## Sources

- S1: `specs/prompt-context-layering/requirements.md`
- S2: `specs/prompt-context-layering/design.md`
- S3: `specs/prompt-context-layering/tasks.md`
- S4: `docs/architecture/agent.md`
- S5: `packages/agent/src/step-prompt/agent-decision@1.njk`
- S6: `packages/runtime/src/trajectory.ts`

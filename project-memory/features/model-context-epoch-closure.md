---
feature: model-context-epoch-closure
status: active
summary: "基于 Token 预算、Context Epoch 与安全检查点的长任务上下文闭环"
source_spec: specs/model-context-epoch-closure/
distilled_at: 2026-09-03
reviewed_at: 2026-09-03
tags: [context, epoch, token-budget, checkpoint, long-running]
authorities: [docs/architecture/runtime.md, docs/architecture/agent.md, packages/runtime/src/context-epoch.ts, packages/runtime/src/runner.ts, packages/agent/src/model-inference-projector.ts]
---

# Model Context Epoch Closure

## Purpose

- 为长任务建立面向模型单轮真实 Token 窗口的上下文闭环：在完整保留持久化历史的前提下，通过 Context Epoch 划分、压力检查点与分层预算裁剪实现可持续迭代。 [S1, S2]

## Durable Decisions

- D1 — 单轮模型调用必须依据明确的 Token 能力计算硬上限，预留 5% 安全余量并扣除最大输出 Token 数；超过硬上限且无法容纳最小单元时立即 fail-closed 返回 `MODEL_CONTEXT_HARD_OVERFLOW`。 [S1, S2, S4]
- D2 — 当不可选输入与会话压力达到输入硬上限的 85% 或即将移除完整会话单元时，系统触发 `context_checkpoint` 要求模型生成阶段性工作摘要。 [S1, S2, S4]
- D3 — Context Epoch 推进为原子提交：在同一 Snapshot 提交边界内保存关闭的 Epoch 边界、新 Epoch 起点和可选 Working Memory Patch；Planning 批准进入 Executing 时自动开启新的执行 Epoch。 [S1, S2, S3, S4]
- D4 — Epoch 切换只改变模型的单轮可见投影，严禁删除或改写 Goal Conversation、Snapshot 或已提交 Trajectory 的物理事实。 [S1, S2, S3]
- D5 — 单轮上下文组装遵循权威优先层级：优先保证系统控制、执行状态与 Working Memory，预算不足时由外向内依次裁剪 Warm、更早 Conversation 与 Hot 单元，且完整 Tool 链单元不可拆分。 [S1, S2, S5]

## Guardrails

- 严禁在存在未决 Pending Action 或 Memory Patch 校验失败时强制切换 Epoch。 [S1, S2, S4]
- 裁剪可选历史时必须以完整会话或执行单元为单位，严禁拆分单条消息或 Tool 调用链。 [S1, S2, S5]

## Revisit When

- 支持原生无限上下文模型架构或新型 KV Cache 压缩机制时。
- 引入支持跨 Goal 记忆共享机制时。

## Sources

- S1: `specs/model-context-epoch-closure/requirements.md`
- S2: `specs/model-context-epoch-closure/design.md`
- S3: `packages/runtime/src/context-epoch.ts`
- S4: `packages/runtime/src/runner.ts`
- S5: `packages/agent/src/model-inference-projector.ts`

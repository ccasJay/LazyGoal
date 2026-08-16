---
feature: minimal-step-loop
status: active
source_spec: specs/minimal-step-loop/
distilled_at: 2026-08-16
tags: [launcher, run-scheduler, agent-profile, single-run]
supersedes: []
superseded_by: []
status_reason: ""
---

# Minimal Step Loop

## Capability

- Launcher 作为运行时统一启动入口，负责接收 Goal 与明确指定的 profileId，解析并冻结 AgentProfile，生成独立 runId，在持久化初始快照后单向提交给 Scheduler 调度；Launcher 本身不执行模型推理与 Step 循环。 [S1, S2, S3]

## Durable Decisions

- Profile 在启动时刻从 Registry 查找后深拷贝冻结进快照，后续 Registry 中同名 Profile 的变更不会影响已启动或恢复的运行实例。 [S1, S2, S3, S4]
- Launcher 与 Scheduler 职责解耦：Launcher 负责启动装配与首次持久化，Scheduler 仅接收不透明的运行标识引用（RunRef / runId），不参与 Profile 决策与任务内容修改。 [S1, S2, S3]

## Contracts and Invariants

- 严格遵循“先保存成功再发起调度”的事务顺序：若存储保存失败，不得触发调度且必须传播原始存储异常。 [S1, S2, S3, S4]
- 若 profileId 未在 Registry 中注册，返回可识别的 PROFILE_NOT_FOUND 业务失败，且不生成 ID、不写快照、不调用 Scheduler。 [S1, S2, S3, S4]

## Lessons

- 将 ID 生成（RunIdGenerator）、配置解析（ProfileRegistry）与调度（RunScheduler）完全抽象为注入依赖，使启动流程具备极高的可测试性，无需依赖外部队列或真实 LLM 即可覆盖全部启动与失败路径。 [S2, S4]

## Reuse Triggers

- 实现或重构运行时启动逻辑、AgentProfile 注册表设计、调度入口以及需要确保“启动即持久化”的场景。

## Sources

- S1: `specs/minimal-step-loop/requirements.md`
- S2: `specs/minimal-step-loop/design.md`
- S3: `packages/runtime/src/launcher.ts`
- S4: `packages/runtime/test/launcher.test.ts`

---
feature: goal-preparation-workflow
status: active
source_spec: specs/goal-preparation-workflow/
distilled_at: 2026-08-16
tags: [goal-coordinator, preparation-workflow, working-context, snapshot-v2, v1-migration]
supersedes: []
superseded_by: []
status_reason: ""
---

# Goal Preparation Workflow

## Capability

- GoalCoordinator 将 Goal 扩展为覆盖原始意图澄清（gathering_context）、任务方案规划（planning）、用户显式批准到连续执行（executing）的端到端可恢复会话聚合；准备交互不进入 Run，不消耗 stepCount，并支持只读迁移 v1 历史快照。 [S1, S2, S3]

## Durable Decisions

- 准备与执行阶段职责完全解耦：GoalCoordinator 独占准备阶段与用户输入转换，Runner 仅负责 executing 阶段的单步连续循环；准备交互（提问、反馈、批准）绝不进入 RunState 状态机，不计入 maxSteps 预算。 [S1, S2, S3]
- 真实消息与派生 Working Context 分离：Goal messages 仅保存真实交互文本（UserMessage 与带 Profile 标识的 AssistantMessage）；每轮控制状态作为临时只读 DTO 发送，绝不回写历史消息。 [S1, S2, S4]
- 零写副作用的 v1 只读迁移：读取 v1 快照时仅在内存中转换为 v2 结构并补齐 Profile 来源，只有下一次发生正常业务保存时才以 v2 协议原子落盘。 [S1, S2, S5]
- 结构化批准动作：approve 操作直接变更 WorkflowState 并将 proposal 固化为最终 task，不伪造额外的用户文本消息。 [S1, S2, S3]

## Contracts and Invariants

- 阶段单向推进：严格保证 `gathering_context → planning → executing` 单向正向流转，未经过用户显式批准的 task proposal 绝对禁止进入 executing。 [S1, S2, S3]
- 先保存后执行事务顺序：无论是阶段跃迁、提问挂起、回答恢复还是批准调度，必须先成功持久化完整 Goal 快照，再调用下游 Executor 或 Scheduler。 [S1, S2, S3]
- 严格分阶段等待类型：gathering 仅接受 question 等待，planning 仅接受 approval 等待，executing 仅接受 blocked 等待，类型不匹配直接返回无副作用的业务失败。 [S1, S2, S3]

## Lessons

- 利用 TypeScript Discriminated Unions 建模 WorkflowState，在编译期排除“未批准进入执行”等非法组合；结合 Zod 跨字段验证，保证了持久化与状态机运行时的双重不变量安全。 [S2, S3, S5]

## Reuse Triggers

- 实现多阶段人机交互工作流、构建带意图澄清与方案确认的 Agent 会话、设计 Session 协议升级迁移或扩展复杂工作流状态机。

## Sources

- S1: `specs/goal-preparation-workflow/requirements.md`
- S2: `specs/goal-preparation-workflow/design.md`
- S3: `packages/runtime/src/domain.ts`
- S4: `packages/agent/src/prompt.ts`
- S5: `packages/runtime/src/goal-store.ts`

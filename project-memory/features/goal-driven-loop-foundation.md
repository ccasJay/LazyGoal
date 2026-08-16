---
feature: goal-driven-loop-foundation
status: active
source_spec: specs/goal-driven-loop-foundation/
distilled_at: 2026-08-16
tags: [transition, pure-state-machine, run-status, domain-foundation, step-result]
supersedes: []
superseded_by: []
status_reason: ""
---

# Goal-Driven Loop Foundation

## Capability

- 提供基于纯函数状态机的最小运行时底座，定义 Goal、RunState、StepResult 领域模型与 transition 转换逻辑，以确定性、无副作用方式推进单个 Run 的生命周期状态。 [S1, S2, S3]

## Durable Decisions

- 状态机作为纯函数：`transition(state, input): TransitionResult` 严格禁止任何异步操作、外部 I/O、时间生成或自发循环，非法状态转换返回原状态与稳定错误对象而不抛出异常。 [S1, S2, S3, S4]
- 步数计数不变量：只有消费 StepResult（kind: "step"）时 stepCount 才加 1；start、resume、cancel 状态转换不消耗步数。 [S1, S2, S3, S4]
- 不可逆终态：completed、failed、cancelled 三个终态为封闭状态，一旦进入拒绝任何进一步的输入转换。 [S1, S2, S3, S4]

## Contracts and Invariants

- 生命周期流转约束：主路径为 `created → running ⇄ waiting`，最终进入终态；非 waiting 状态拒绝 resume，终态拒绝任何迁移。 [S1, S2, S3, S4]
- 存储与状态转换解耦：状态机不感知持久化实现，只专注于输入输出的状态纯计算。 [S1, S2, S3]

## Lessons

- 将状态转换逻辑与 I/O、执行编排（Runner）彻底剥离，使核心状态转移能够进行穷举式的单元测试，奠定了后续上层所有并发、异步与持久化扩展的基础。 [S2, S4]

## Reuse Triggers

- 新增状态类型、扩展 StepResult 变体、修改状态流转规则或构建新的执行器状态机。

## Sources

- S1: `specs/goal-driven-loop-foundation/requirements.md`
- S2: `specs/goal-driven-loop-foundation/design.md`
- S3: `packages/runtime/src/transition.ts`
- S4: `packages/runtime/test/transition.test.ts`

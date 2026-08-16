---
feature: minimal-run-loop
status: active
source_spec: specs/minimal-run-loop/
distilled_at: 2026-08-16
tags: [runner, inline-scheduler, step-executor, run-loop, max-steps]
supersedes: []
superseded_by: []
status_reason: ""
---

# Minimal Run Loop

## Capability

- Runner 驱动单个 Run 的同步单进程生命周期推进，通过 StepExecutor 逐步执行、调用纯状态机 transition 推进状态，并在每一步前后原子持久化快照，直至 waiting、终态或达到步数上限；InlineScheduler 提供同步调度的委派封装。 [S1, S2, S3]

## Durable Decisions

- maxSteps 作为累计预算策略：使用快照中的累计 stepCount 计算步数预算，进程重启或显式 resume 不会重置步数计数器。 [S1, S2, S3, S4]
- 步数上限保护不进入 transition：当达到 maxSteps 时直接持久化 failed 状态与 MAX_STEPS_EXCEEDED 错误，不调用 transition 也不增加 stepCount，真实反映实际完成的步数。 [S2, S3, S4]
- 先转换落盘再执行：created 启动或 waiting 恢复必须先持久化为 running 状态，再进入 StepExecutor 执行，确保崩溃后状态可追溯。 [S1, S2, S3, S4]

## Contracts and Invariants

- 每步执行循环严格保证“执行一步 -> transition 计算下一状态 -> save 完整快照成功 -> 决定是否继续”。 [S1, S2, S3, S4]
- StepExecutor 异常统一转换为 step.fail 并持久化为 failed 终态；Store 的持久化读写异常则原样向上传播并立即中断循环。 [S1, S2, S3, S4]

## Lessons

- Runner 保持无状态服务设计（不持有具体 Run 实例字段），使同一个 Runner 实例可以安全地复用于多个 Run 的顺序调度与测试隔离。 [S2, S3, S4]

## Reuse Triggers

- 实现或演进单步执行循环、StepExecutor 接口扩展、maxSteps 预算控制、异常容错以及等待恢复逻辑。

## Sources

- S1: `specs/minimal-run-loop/requirements.md`
- S2: `specs/minimal-run-loop/design.md`
- S3: `packages/runtime/src/runner.ts`
- S4: `packages/runtime/test/runner.test.ts`

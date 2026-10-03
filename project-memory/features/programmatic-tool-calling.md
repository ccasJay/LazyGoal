---
feature: programmatic-tool-calling
status: active
summary: "通过专用 Tool 在受限 Node.js 沙箱中编排获授权业务工具，并以可恢复的父 Step 返回显式结果"
source_spec: specs/programmatic-tool-calling/
distilled_at: 2026-10-03
reviewed_at: 2026-10-03
tags: [ptc, programmatic-tool-calling, runtime, sandbox, recovery, approval, tool-calling]
authorities: [docs/architecture/runtime.md, docs/architecture/sandbox.md, packages/agent/src/prompting/authorized-tools@1.njk, packages/runtime/src/runner.ts, packages/sandbox/src/program-sandbox.ts, packages/sandbox/src/macos-seatbelt.ts, packages/storage/src/goal-snapshot.ts]
---

# Programmatic Tool Calling

## Purpose

- PTC 作为默认可用的专用模型 Tool，由 Prompt 引导模型按任务选择直接调用业务工具或提交 JavaScript；只有显式 Tool 请求才启动程序。 [S1, S2, S4, S5]

## Durable Decisions

- D1 — `execute_program` 只触发一个 JavaScript 程序，不改变直接 Tool 路径；程序在每次调用新建的 Node.js 进程和 Seatbelt 策略中执行，隔离不可用时拒绝启动。 [S1, S2, S4, S5, S6, S7]
- D2 — 程序内每个业务调用都重新经过当前 Profile、输入契约、Policy、Grant 与审批；系统 Tool 和嵌套 PTC 被拒绝。内部调用串行复用 Runner 执行路径，不产生额外模型 Step。 [S1, S2, S6, S11, S12]
- D3 — 已提交的子调用事实可在程序重建时重放，结果未知且可能有副作用的调用必须等待人工处理，即使原 Tool 标记为 safe；父程序只结算一次，PTC 不承诺外部副作用 exactly-once。 [S1, S2, S3, S6, S9, S11]
- D4 — 内部调用输入与结果保留在 Trajectory 供审计和恢复，但不会自动进入原生模型历史、Hot/Warm 或检索；模型仅接收程序显式返回的 JSON-safe 结果或有界失败。 [S1, S2, S3, S4, S6, S10]
- D5 — 活动时间以预留事件持久化；恢复时未提交 tail 中的时间预留也计入预算，避免崩溃重置额度。 [S2, S3, S4, S6, S9, S12]

## Guardrails

- 程序代码、返回值、管道帧、调用次数、累计结果和诊断均有固定上限；同步及微任务循环由宿主 watchdog 终止，RSS 由宿主采样，Seatbelt 仍是宿主访问的内核边界。 [S2, S3, S5, S6, S7, S8, S12]
- 用户取消会结束父程序；宿主关闭保留可恢复状态。取消或资源停止遇到结果未知的写调用时，先处理未知副作用，再结算原停止原因；不得描述为回滚。 [S1, S2, S3, S6, S9, S12]

## Revisit When

- 新增 Linux 或 Windows 沙箱后端、内部工具并行执行、跨 Goal 并发恢复，或模型上下文开始消费内部 Trajectory 事实时。
- Node.js 运行规则、Snapshot/Trajectory 恢复契约或 PTC 固定资源预算发生变化时。

## Sources

- S1: `specs/programmatic-tool-calling/requirements.md`
- S2: `specs/programmatic-tool-calling/design.md`
- S3: `specs/programmatic-tool-calling/tasks.md`
- S4: `docs/architecture/runtime.md`
- S5: `docs/architecture/sandbox.md`
- S6: `packages/runtime/src/runner.ts`
- S7: `packages/sandbox/src/program-sandbox.ts`
- S8: `packages/sandbox/src/macos-seatbelt.ts`
- S9: `packages/storage/test/program-recovery.test.ts`
- S10: `packages/agent/test/program-model-context.test.ts`
- S11: `packages/runtime/test/program-execution.test.ts`
- S12: `packages/runtime/test/program-interruption.test.ts`

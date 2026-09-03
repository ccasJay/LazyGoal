---
feature: tool-output-safety
status: active
summary: "Bash 有界流式输出与专用 Tool 优先策略"
source_spec: specs/tool-output-safety/
distilled_at: 2026-08-25
reviewed_at: 2026-09-03
tags: [bash, output-bound, prompt, tool-selection, truncation]
authorities: [docs/architecture/agent.md, docs/architecture/runtime.md, packages/tools/src/bash.ts]
---

# Tool Output Safety

## Purpose

- BashTool 以持续消费进程输出、仅保留有界尾部的方式避免超大 stdout/stderr 触发缓冲区失败，同时保持原有 Tool Observation 契约。 [S1, S2, S3]

## Durable Decisions

- D1 — Bash stdout 与 stderr 分别使用 bounded tail collector；达到预算后继续消费并等待进程自然退出，不因输出量主动终止命令。 [S1, S2, S3, S4]
- D2 — spawn 生命周期继续保留原有 timeout、abort、非零退出、shell 启动失败、`COMMAND_TIMEOUT`、`COMMAND_FAILED` 和 `ExecutionAbortedError` 语义。 [S1, S2, S3, S4]
- D3 — v3 executing Prompt 优先使用已授权的专用 Tool；仓库文本搜索优先使用 `grep`，只有没有适用专用 Tool 或确需 Shell 能力时才回退 Bash，且不自动改写模型命令。 [S1, S2, S5, S6]

## Guardrails

- 输出截断继续使用既有省略标记，不新增 `ToolObservation.truncated` 字段，也不把截断变成新的 Runtime 状态。 [S2, S3, S4, S7, S8]
- Bash 搜索必须缩小路径并排除生成目录、`.git`、`.lazygoal`、`node_modules` 和 source map；Tool 选择仍受 Authorized Tool ID 边界约束。 [S1, S2, S5, S6]

## Revisit When

- Tool Observation 需要结构化截断元数据或新的输出传输协议时。
- Bash 需要主动终止超大输出命令，或专用 Tool 选择改由 Runtime 强制执行时。

## Sources

- S1: `specs/tool-output-safety/requirements.md`
- S2: `specs/tool-output-safety/design.md`
- S3: `packages/tools/src/bash.ts`
- S4: `packages/tools/test/bash.test.ts`
- S5: `packages/agent/src/step-prompt/agent-decision@1.njk`
- S6: `packages/agent/test/prompting-default-bundles.test.ts`
- S7: `docs/architecture/agent.md`
- S8: `docs/architecture/runtime.md`

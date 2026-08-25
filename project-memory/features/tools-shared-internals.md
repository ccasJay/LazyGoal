---
feature: tools-shared-internals
status: active
summary: "文件级 Tool 共享沙箱、单次校验与公共导出收窄"
source_spec: specs/tools-shared-internals/
distilled_at: 2026-08-25
reviewed_at: 2026-08-25
tags: [tools, sandbox, internals, exports, validation]
authorities: [docs/architecture/runtime.md, packages/tools/src/internal/workspace-sandbox.ts, packages/tools/src/index.ts]
---

# Tools Shared Internals

## Purpose

- 文件级 Tool 将 workspaceRoot 沙箱、路径解析、错误映射和中止感知文件系统操作集中到包内共享模块，同时保持工具公共行为不变。 [S1, S2, S3]

## Durable Decisions

- D1 — `WorkspaceSandbox` 是 `read-file`、`write-file`、`edit-file` 和 `grep` 共享的内部边界，统一负责路径安全、真实路径越界检查、文件读写和领域错误映射。 [S1, S2, S3, S4, S5]
- D2 — Tool 输入按 `parseInput` 与 `checkSemantics` 分离；同一次执行不重复运行完整 `validate`，结构化输入只解析一次。 [S1, S2, S3, S6]
- D3 — `index.ts` 只导出真实生产或测试消费者需要的 Tool 类与 ID；共享沙箱和零引用限值常量保持包内私有。 [S1, S2, S7]

## Guardrails

- 共享模块不得经 `packages/tools/src/index.ts` 外泄，工具错误码、消息、沙箱拒绝和 replayPolicy 必须与迁移前一致。 [S2, S3, S4, S5]
- `ExecutionAbortedError` 必须原样传播；共享文件系统包装不得吞掉中止、生成新的 Observation 或引入跨包依赖。 [S1, S2, S6, S7]

## Revisit When

- 沙箱需要迁移为独立 `@lazygoal/sandbox` 包时。
- 新增 Tool 需要超出当前 workspaceRoot 或错误映射边界时。
- 公共导出出现新的真实消费者时。

## Sources

- S1: `specs/tools-shared-internals/requirements.md`
- S2: `specs/tools-shared-internals/design.md`
- S3: `packages/tools/src/internal/workspace-sandbox.ts`
- S4: `packages/tools/src/read-file.ts`
- S5: `packages/tools/src/grep.ts`
- S6: `packages/tools/test/read-file.test.ts`
- S7: `scripts/check-dependencies.mjs`

---
feature: tool-input-contracts
status: active
summary: "Tool 输入契约全面迁移至不可变 Contract AST，建立单次准备边界与确定性模型 Schema 投影"
source_spec: specs/tool-input-contracts/
distilled_at: 2026-09-05
reviewed_at: 2026-09-05
tags: [tool, contracts, tool-registration, prepared-action, runtime, schema-projection]
authorities: [docs/architecture/runtime.md, packages/runtime/src/tool.ts, packages/runtime/src/runner.ts, packages/agent/src/model-inference-projector.ts]
---

# Tool Input Contracts

## Purpose

- 将仓库内所有 Tool 输入契约迁移至 `@lazygoal/contracts`，消除冗余的结构校验和类型声明，在 Runner 中确立单次 Action 准备边界，并将稳定的 JSON Schema 投影给模型。 [S1, S2]

## Durable Decisions

- D1 — 统一使用 `Tool<C>` 泛型接口与不可变 `inputContract`：每个 Tool 的输入结构仅由 `definition.inputContract` 定义，不再维护手写的 TS 类型、JSON 校验函数或额外 Schema。 [S1, S3, S7]
- D2 — 类型擦除的 `ToolRegistration` 注册绑定：Runtime 组合根通过 `createToolRegistration(tool)` 在注册时预编译并校验契约图完整性，对外提供一致的 `prepare(input)` 接口。 [S1, S3]
- D3 — Runner 的单次 Action 准备边界与执行闭包：Action 在通过 Profile 白名单授权后，先由 `ToolRegistration.prepare(input)` 完成单次结构解析（`safeParse`）与语义校验（`validate`），产出瞬时 `PreparedToolAction`，供 Policy、pending Action 持久化与执行闭包共享，单次尝试中严禁重复解析。 [S1, S4, S6]
- D4 — 模型端 Tool Schema 稳定投影：`ModelInferenceProjector` 从已授权 ToolDefinition 的 `inputContract` 编译 JSON Schema（剥离根 `$schema`），Contract AST 不进入 `ModelInferenceView`，保持 View 的纯 JSON 数据隔离。 [S1, S5]

## Guardrails

- 解析和校验过程严禁对输入进行任何 trim、coerce 或补充默认值。 [S1, S2, S3]
- 非法结构的 Tool 调用必须被拦截在 Policy、pendingAction 和执行闭包之前，严禁调用底层 Tool。 [S1, S4]
- 等待审批和崩溃恢复时，必须重新对持久化的 canonical Action 执行 prepare，不直接信任外部可能变更的未校验内存。 [S1, S4]

## Revisit When

- Tool 体系支持流式输入或二进制附件时。
- Tool 授权模型或 ToolPolicy 接口变更时。
- 支持动态 Tool 注册或远程 MCP Tool 协议时。

## Sources

- S1: `specs/tool-input-contracts/requirements.md`
- S2: `specs/tool-input-contracts/design.md`
- S3: `packages/runtime/src/tool.ts`
- S4: `packages/runtime/src/runner.ts`
- S5: `packages/agent/src/model-inference-projector.ts`
- S6: `packages/runtime/test/runner.test.ts`
- S7: `packages/tools/test/read-file.test.ts`

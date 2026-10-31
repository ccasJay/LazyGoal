---
feature: contract-migration
status: active
summary: "以 TS 单源、Catalog 生成制品与真实边界绑定取代 Contract AST，完成工具、模型、Web、Storage、Worker 与 Runtime 消费链迁移后删除旧 AST"
source_spec: specs/contract-migration/
distilled_at: 2026-10-31
reviewed_at: 2026-10-31
tags: [contracts, typescript, catalog, generation, binding, migration, ast-removal, model-output, tool-input, web-wire, storage, cross-process, recovery]
authorities: [contracts/README.md, packages/contract-binding/README.md, packages/model-contracts/src/model-output/generated-bindings.ts, packages/tool-core/src/registration.ts, packages/web-contracts/src/wire.ts, packages/storage/notes/file-contracts.md, packages/contracts/src/index.ts]
supersedes: [project-memory/features/model-output-contracts.md, project-memory/features/tool-input-contracts.md, project-memory/features/web-wire-contract-unification.md]
---

# 契约迁移：TS 单源与生成绑定

## Purpose

- 将生产数据契约从 Contract AST 迁移到 TS 单源、Catalog 生成制品与真实边界读取，并在全部真实消费者迁移后删除旧 AST；工具与模型作为联合切换交付，Web、Storage 与其他边界按各自依赖独立推进。 [S1, S2]
- 生成能力线只拥有共享生成器、`contract-binding` 与通用投影；各领域拥有自身类型、Catalog 登记和消费接缝，生成器不承载授权、执行或持久化规则。 [S2, S3]

## Durable Decisions

- D1 — TS 单源与 Catalog 生成：字段与约束只在 TS/JSDoc 声明，生成器输出 Schema、校验器、Manifest 与绑定；`contracts:generate -- --check` 守护漂移，未知注解或不支持结构明确失败，不手写第二份字段表。 [S2, S3, S4]
- D2 — 绑定读取：生成绑定支持 `strip` 与 `reject`；联合先按未修改输入确定合法分支，再处理未知字段；歧义、已知字段非法和非 JSON 值失败；成功数据深复制隔离，诊断有界且不含字段值。 [S4, S5]
- D3 — 模型投影：以同源本地约束派生 Provider Schema 与配套解码；Provider 无法表达的约束显式标记并在解码强制；递归、开放 JSON、元组等不可安全转换结构失败，不回退 AST。 [S6]
- D4 — 工具与模型联合切换：30 个工具输入消费生成的 `typescript-binding`；注册与 `prepare` 只读 `BoundToolDefinition.inputBinding`；模型请求、原生工具声明、Runtime 决策与 `model-context` 投影使用同源生成绑定；`tool_call.action.input` 由实际工具绑定校验，授权、审批、沙箱、取消与恢复语义不变。 [S7, S8, S9, S18]
- D5 — Web、Storage 与其他边界：Web HTTP/SSE/浏览器 DTO 由 `wire.ts` 原生 TS 单源生成；Storage 文件 DTO、Snapshot 与 Codec 使用生成绑定；AgentProfile 严格 `reject`；Worker、ACP、Mux 与 RPC 保留自身边界校验；类型化同进程调用不新增运行时验证。 [S10, S11, S12, S15, S16, S17, S19, S20]
- D6 — AST 删除与原语保留：删除 AST、DSL、Parser、Schema 编译器、专属测试与依赖；保留 `canonicalizeJson`、`canonicalJson`、`isRecord`、`deepFreeze`、`compareCodeUnits`、JSON 类型与共享校验错误于 `@lazygoal/contracts`；不保留兼容包装、双实现或失败回退。 [S13, S14]
- D7 — 交付验收：在独立集成 worktree 汇集固定提交，完成工具与模型原子切换、完整 `npm test`、跨 Spec 定向测试、真实 Chrome E2E、构建、生成、文档与依赖检查；合并后再次在 `dev` 运行完整回归。 [S1]

## Guardrails

- 不得为已迁移契约维护第二份字段表；生成失败不得回退旧 AST 或旧 Schema。 [S2, S13]
- 迁移不得改变授权、审批、沙箱、取消、恢复或关闭语义；`tool_call.action.input` 仍由工具绑定在执行准备阶段校验。 [S7, S9]
- 未知字段策略按边界执行：工具、模型与 Web 在已确认范围内剥离并诊断；AgentProfile 等严格边界继续拒绝。不得在共享层统一为单一策略。 [S7, S9, S10, S15]
- Provider 无法表达的本地约束必须在解码时强制验证，不得静默放宽 wire 表达。 [S6]
- 删除 AST 后不得保留隐藏兼容层；保留的 JSON 原语必须维持既有可观察行为。 [S13, S14]

## Revisit When

- 新增契约结构、Provider 投影能力、跨进程协议或持久化版本，需要扩展共享生成能力时。 [S2, S6]
- 需要重新引入 AST、第二套生成器或兼容旧持久化格式时。 [S13]
- 共享 JSON 原语的所有者或可观察行为发生变化时。 [S14]

## Sources

- S1: `specs/contract-migration/plan.md`
- S2: `specs/ts-contract-generation-capabilities/spec.md`
- S3: `scripts/generate-contracts.mjs`
- S4: `contracts/README.md`
- S5: `packages/contract-binding/src/binding.ts`
- S6: `packages/contract-binding/src/projection.ts`
- S7: `specs/ts-tool-input-migration/spec.md`
- S8: `packages/tool-core/src/registration.ts`
- S9: `specs/ts-model-contract-migration/spec.md`
- S10: `specs/ts-web-contract-migration/spec.md`
- S11: `specs/ts-storage-contract-migration/spec.md`
- S12: `specs/ts-other-boundaries-migration/spec.md`
- S13: `specs/remove-legacy-contract-ast/spec.md`
- S14: `packages/contracts/src/index.ts`
- S15: `specs/ts-agent-profile-file-contract/spec.md`
- S16: `specs/ts-provider-model-query-contract/spec.md`
- S17: `specs/ts-provider-profile-test-contract/spec.md`
- S18: `packages/model-contracts/src/model-output/generated-bindings.ts`
- S19: `packages/web-contracts/src/wire.ts`
- S20: `packages/storage/notes/file-contracts.md`

---
feature: web-wire-contract-unification
status: superseded
status_reason: "Web wire DTO 的 Contract AST 来源已由 wire.ts 原生 TS 单源与生成绑定取代。"
superseded_by: [project-memory/features/contract-migration.md]
summary: 让浏览器与本地后端的 wire 形状只由一份 Contract 派生，出站 guard 与入站 parser 不再各自维护字段表
source_spec: specs/web-wire-contract-unification/
distilled_at: 2026-10-29
reviewed_at: 2026-10-31
tags: [web-contracts, contract-ast, wire-dto, guard, parser, open-object, depth-budget, utf16, bundle-budget]
authorities: [packages/web-contracts/src/wire.ts, packages/web-contracts/src/bindings.ts, packages/web-contracts/src/validation.ts, packages/browser/src/browser-goal-routes.ts]
---

# Web 传输契约统一

## Purpose

- 让每个 Web wire DTO 的字段结构只声明一次，类型、出站 guard 与入站 parser 都从同一 Contract 派生。 [S1, S3]
- 让开放/严格、深度预算与文本上限等边界有唯一归属，避免三处各自演化。 [S1]

## Durable Decisions

- D1 — 每个 wire DTO 由 `packages/web-contracts/src/contracts/` 中唯一 Contract 声明，公开类型由 `InferContract` 派生。 [S1, S2, S3]
- D2 — 出站 guard 是 `safeParse` 加命名不变量：失败返回 `false`，不抛诊断、不改输入、不返回深复制；开放层保留未知 JSON，严格层拒绝未知字段。严格层至少覆盖会话状态顶层、`currentRunTerminalDetail`、Activity 顶层/`runs[].terminalDetail`/`gaps[]`/think/tool state/lifecycle entry。 [S1, S3]
- D3 — 入站命令一律严格对象；parser 留在 `packages/browser`，只做结构解析、跨字段关系、路径身份组合与 HTTP 错误映射，不拥有字段表。 [S1, S4]
- D4 — AST 只新增 `unknown` 与 `openObject` 两种节点：前者接受任意 JSON 并推导为 `unknown`，后者校验声明字段并保留额外 JSON；两者只用于受信任 Web wire 或显式开放载荷，模型输出与 Tool 输入必须拒绝。 [S1, S5]
- D5 — 深度预算只约束合同结构：`safeParse` 的 `MAX_DEPTH = 64` 不适用于 `unknown`/开放对象的 JSON 载荷，后者用独立显式栈遍历，保持迁移前的接受范围；不得把 `BrowserJsonValue` 写成递归合同。 [S1, S5]
- D6 — UTF-16 文本上限的唯一实现是 `hasUtf16LengthAtMost`，因为 Contract 的 `maxLength` 按 code point 计数；不得为此新增 AST 节点，也不得建立跨字段长度表。 [S1, S6]
- D7 — Bundle 预算归本 Spec：Goal Board 初始 JS gzip 相对迁移前增量不超过 10 KiB，实测 6.06 KiB。 [S1, S7]

## Guardrails

- 不得保留第二套 DTO 字段表、平行 guard 或 route 内白名单。 [S1]
- Contract AST 与 JSON Schema 不进入浏览器公开 API，不在请求或 SSE 事件上编译 Schema。 [S1]
- 开放对象语义不得放过 `apiKey`；凭证禁用键由共享不变量统一检查。 [S1]
- 已声明的行为变化不得回退：声明字段完整校验、严格枚举、显式 `undefined` 拒绝、`scope` 默认移除、`apiKey:null`/`scope:null` 拒绝、`isJsonValue` 只接受 JSON 标量与普通对象。 [S1]

## Revisit When

- 新增 wire DTO、SSE 事件或命令路由时。
- 需要调整深度预算，或模型输出/Tool 输入需要复用 wire 合同时。
- Goal Board 入口体积逼近 10 KiB 增量预算时。

## Sources

- S1: `specs/web-wire-contract-unification/spec.md`
- S2: `specs/web-wire-contract-unification/plan.md`
- S3: `packages/web-contracts/src/wire.ts`
- S4: `packages/browser/src/browser-goal-routes.ts`
- S5: `packages/web-contracts/src/bindings.ts`
- S6: `packages/web-contracts/src/invariants/utf16.ts`
- S7: `packages/web-contracts/src/validation.ts`

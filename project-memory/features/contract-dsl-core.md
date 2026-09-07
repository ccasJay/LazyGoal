---
feature: contract-dsl-core
status: active
summary: "基于不可变 AST 的纯 TypeScript 结构契约核心，支持静态类型推导、严格 JSON 校验与确定性 JSON Schema 2020-12 编译"
source_spec: specs/contract-dsl-core/
distilled_at: 2026-09-05
reviewed_at: 2026-09-05
tags: [contracts, ast, schema, validation, parser, json-schema, typescript]
authorities: [docs/architecture/contracts.md, packages/contracts/src/contract.ts, packages/contracts/src/parser.ts, packages/contracts/src/json-schema.ts, packages/contracts/src/types.ts, packages/contracts/src/definition.ts, packages/contracts/src/errors.ts]
---

# Contract DSL Core

## Purpose

- 提供 zero-outbound-dependency 的结构契约基础设施包 `@lazygoal/contracts`，消除业务协议对外部校验库的生产依赖，统一静态推导、运行时严格校验与模型暴露的 Schema 生成。 [S1, S2]

## Durable Decisions

- D1 — 不可变 AST 与纯推导类型系统：Contract 对象在构造时冻结且带品牌标记，通过 `InferContract<C>` 生成只读 TS 类型，不含运行时逻辑或外部依赖。 [S1, S3]
- D2 — 严格无副作用的 Parser 与深复制隔离：`parse` 与 `safeParse` 严格校验输入，拒绝未知字段与隐式类型转换（不 trim、不 coerce、不补 default），成功时产生无共享引用的深复制隔离副本。 [S1, S4, S6]
- D3 — 确定性 JSON Schema 2020-12 编译：`compileJsonSchema` 严格单向将 Contract AST 编译为标准 JSON Schema，递归类型编译为 `$defs`/`$ref`，输出键名与结构保持字符级确定性。 [S1, S5, S7]
- D4 — 有界失败与递归安全图检查：在消费 AST 前严格检查递归定义与 optional 位置；校验运行时通过祖先引用检测、64 层最大深度和 50 条 issue 上限防御 DoS 与死循环。 [S1, S2, S4]

## Guardrails

- `packages/contracts/src/` 必须保持零运行时依赖（Ajv 仅允许存在于 devDependencies oracle 测试中）。 [S1, S2]
- AST 构造后必须递归深度冻结，禁止在外部篡改。 [S1, S3]
- 校验失败必须返回可定位的 `path` 和稳定 `issue code`，禁止吞没错误。 [S1, S4]

## Revisit When

- JSON Schema 规范版本从 2020-12 升级时。
- 核心 Contract 节点类型（如 tuple、set 等）需要扩充时。
- 递归深度（64 层）或 issue 数量限制（50 条）无法满足更深层协议时。

## Sources

- S1: `specs/contract-dsl-core/requirements.md`
- S2: `specs/contract-dsl-core/design.md`
- S3: `packages/contracts/src/contract.ts`
- S4: `packages/contracts/src/parser.ts`
- S5: `packages/contracts/src/json-schema.ts`
- S6: `packages/contracts/test/parser.test.ts`
- S7: `packages/contracts/test/json-schema.test.ts`

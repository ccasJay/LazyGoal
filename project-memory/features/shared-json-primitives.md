---
feature: shared-json-primitives
status: active
summary: 让确定性 JSON 文本、通用对象守卫、环安全冻结与路径段编码各只有一份共享实现，并保持摘要与持久化字节不变
source_spec: specs/shared-json-primitives/
distilled_at: 2026-10-29
reviewed_at: 2026-10-29
tags: [json, canonical-json, object-guard, deep-freeze, path-encoding, single-implementation, stable-serialization]
authorities: [packages/contracts/src/json.ts, packages/context-budget/src/stable-json.ts, packages/web-contracts/src/invariants/record.ts, packages/storage/src/path-segment.ts, packages/contracts/test/single-implementation.test.ts]
---

# 共享 JSON 与通用原语

## Purpose

- 让确定性 JSON 文本、通用对象守卫与环安全冻结只有一份实现，供摘要、持久化路径与跨包边界共同调用。 [S1, S3]
- 收敛实现的同时保持摘要 golden 与 prompt 渲染字节不变。 [S1, S6]

## Durable Decisions

- D1 — canonical JSON 归 `packages/contracts/src/json.ts`：按 code unit 键序递归排序后交给 `JSON.stringify`，支持 compact 与两空格缩进；`context-budget` 的 `stableJson` 委托它，不保留第二份键排序。 [S1, S3, S4]
- D2 — `isRecord` 的单一实现归 `contracts`；`web-contracts` 保留公开名并转发。该谓词只判断“非 null 且非数组”，类实例与原型污染不由它承担。 [S1, S5]
- D3 — `deepFreeze` 为环安全、返回同一引用的递归冻结。 [S1, S3]
- D4 — 持久化路径的 base64url 段编码归 `packages/storage/src/path-segment.ts`，各 Store 只调用。 [S1, S7]
- D5 — 重复实现由 `packages/contracts/test/single-implementation.test.ts` 静态守护：扫描 `packages`、`apps`、`benchmarks` 下的 `src`，禁止 allowlist 之外重新定义守卫或重复算法，违规报告文件与行号。 [S1, S2, S8]
- D6 — 摘要入口保持字节等价：`stableJson`、摘要 golden 与 prompt 渲染输出在收敛前后一致。 [S1, S6]

## Guardrails

- `contracts` 不得引入 `node:`、`Buffer`、`process` 或 `require`，必须保持零出站依赖与浏览器可用。 [S1]
- 不得新增第二份键排序、对象守卫或深冻结实现；确有新合法用途时扩展 allowlist，而不是放宽检查。 [S1, S8]
- 已知限制：`benchmarks/src/**`（评测共享层）仍有若干 `isRecord` 定义，超出本 Spec 批准的 35 个守卫清单，尚未收敛。 [S9]

## Revisit When

- 需要新增摘要入口或新的规范化文本消费者时。
- 决定收敛 `benchmarks/src/**` 或 `packages/execution-stream` 的剩余守卫时。
- `contracts` 需要引入 Node 能力，或深冻结语义需要改变时。

## Sources

- S1: `specs/shared-json-primitives/spec.md`
- S2: `specs/shared-json-primitives/plan.md`
- S3: `packages/contracts/src/json.ts`
- S4: `packages/context-budget/src/stable-json.ts`
- S5: `packages/web-contracts/src/invariants/record.ts`
- S6: `packages/runtime/test/digest-golden.test.ts`
- S7: `packages/storage/src/path-segment.ts`
- S8: `packages/contracts/test/single-implementation.test.ts`
- S9: `benchmarks/src/prompt-evaluation/result-recorder.ts`

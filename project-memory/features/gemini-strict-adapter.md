---
feature: gemini-strict-adapter
status: active
summary: "Google Gemini strict 输出适配层：强语法约束 Nullable Required、单值枚举消除与逆向清洗闭环"
source_spec: specs/gemini-strict-adapter/
distilled_at: 2026-09-10
reviewed_at: 2026-09-10
tags: [llm, gemini, google, strict-mode, json-schema, nullable-required, projection, error-handling]
authorities: [docs/architecture/llm.md, packages/llm/src/gemini.ts, packages/llm/test/gemini.test.ts]
---

# Gemini Strict Adapter

## Purpose

- 解决 Google Gemini 官方 strict 结构化输出模式不支持顶层联合导致的自回归字段遗漏与适配层回滚死锁，通过强语法约束（Nullable Required）与完备逆向清洗，确保模型在长程多轮交互下 100% 稳定生成合规决策。 [S1, S2, S5]

## Durable Decisions

- D1 — 强语法约束 (Nullable Required) 展平：将判别联合的各分支关键字段（`action`、`summary`、`completionEvidence`、`memoryPatch`）定义为 `nullable: true` 并统一放入顶层 `required` 列表，迫使 Gemini 语法机在生成时必须输出完整键结构（非目标分支输出 `null`），从源头阻断 `tool_call` 漏发 `action`。 [S1, S3]
- D2 — 移除单一字符串枚举引力陷阱：删除 `summary` 字段注入的单值枚举（`enum: ["Task completed with verified evidence."]`），恢复为无枚举的普通可空 string 约束，消除该固定文本对模型自回归探索阶段的非法引力。 [S1, S3]
- D3 — 逆向投影分支判别与空字段安全剥离：根据当前分支类型在逆向层彻底剔除非目标分支产生的 `null` 属性（如在 `complete` 中剔除 `action: null`，在 `tool_call` 中剔除 `summary: null`），无损还原为底层 Wire 契约。 [S1, S3]
- D4 — 证据哨兵值与模式匹配闭环容错：严格区分证据占位符 `"__lazygoal_absent__"` 与真实证据，清洗后直接作为序列化结果输出，杜绝模式匹配未完全通过时静默回滚至原始畸形文本的死锁；真正非法的损坏输出如实透传由 Agent 契约校验拦截。 [S1, S3, S4]

## Guardrails

- 适配器严禁在逆向层伪造任何决策或凭空生成虚拟的完成证据序列。 [S1, S3]
- 适配层严禁在校验未通过时静默回退为模型原始损坏的 JSON 文本。 [S1, S3]
- `prompt_only` 模式链路必须完全隔离，严禁传递任何原生 `responseSchema` 或 `responseMimeType`。 [S1, S3]

## Revisit When

- Google Gemini 官方原生 API 正式支持带判别字段的联合 Schema（Discriminated Union）时。
- 引入新的结构化输出阶段契约或修改 Wire Contract 分支结构时。

## Sources

- S1: `specs/gemini-strict-adapter/requirements.md`
- S2: `specs/gemini-strict-adapter/design.md`
- S3: `packages/llm/src/gemini.ts`
- S4: `packages/llm/test/gemini.test.ts`
- S5: `docs/architecture/llm.md`

# Gemini Strict 模式适配层优化技术设计文档

## 审批摘要

### 方案
采用“强语法约束 + 完备逆向映射”机制，在 `packages/llm/src/gemini.ts` 内部闭环解决 Google Gemini strict 模式不支持 discriminated union 所引发的长程字段遗漏与纠偏死锁问题。对外保持严格的 Wire 契约不变，对内通过语法机强约束（Nullable Required）与逆向清洗保障 100% 协议合规。

### 关键决策
| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 分支关键字段可空必填 | 将 `action`、`summary`、`completionEvidence` 等字段设为 `nullable: true` 并全部加入 `required`。迫使 Gemini 语法机在生成时必须显式输出每个字段（非目标分支输出 `null`），从源头阻断 `tool_call` 遗漏 `action`。 | 彻底杜绝长程交互下的漏字段行为；对 Wire 契约完全透明。 |
| 移除 summary 单值枚举 | 删除 `enum: ["Task completed with verified evidence."]`，恢复为标准 string（可空）。消除人工注入的单一枚举对模型自回归生成的强引力陷阱。 | 避免模型在探索阶段被诱导输出结题文本。 |
| 证据哨兵值与模式匹配闭环 | 改造 `matchesKnownSchemaShape` 与 `restoreGeminiProjectedValue`，正确处理哨兵值 `"__lazygoal_absent__"` 与 `null` 字段清洗，消除死锁回退。 | 杜绝适配层静默丢弃纠偏结果抛出原始畸形 JSON 的崩溃问题。 |

### 风险与待确认
- **已知风险**：Gemini 端点对复杂嵌套对象的 null 支持已在真实端点验证通过；需确保逆向层彻底剔除多余的 `null` 键，避免破坏 downstream Canonical 契约。
- **待确认项**：无未决重大技术决策。

---

## Overview

本设计针对 `specs/gemini-strict-adapter/requirements.md` 中的全部要求，重构 `packages/llm/src/gemini.ts` 的结构 Schema 投影与响应逆向恢复逻辑。在满足 Google Gemini strict API 只能接受扁平单一 Object 的硬性限制下，通过 Grammar 级的完整字段约束与确定性字段清洗，消除协议漂移与长程崩溃。

---

## Architecture

执行阶段决策在 Gemini strict 模式下的请求投影与响应反向恢复流水线如下：

```text
  [LazyGoal Wire Contract]
  (Discriminated Union: tool_call | complete | wait | fail | lookup)
             │
             ▼ prepareGeminiSchema / mergeGeminiUnion
  [Gemini Flat Object Schema]
  - properties: kind, action, summary, completionEvidence, ...
  - all branch-specific keys: nullable=true
  - required: [kind, action, summary, completionEvidence, memoryPatch, ...]
             │
             ▼ HTTP POST (Google GenAI SDK)
  [Gemini 3.6 Flash High Endpoint]
  (Grammar enforces all keys must be emitted: target branch has data, other branches have null)
             │
             ▼ JSON Response String
  [restoreGeminiResponseProjection]
  1. JSON Parse
  2. Branch Discrimination: check target kind (e.g. tool_call)
  3. Strip irrelevant null keys (e.g. delete summary, delete completionEvidence)
  4. Parse compact completionEvidence (if complete) or strip sentinel (if tool_call)
  5. Validate against Wire Branch Contract
             │
             ▼ Validated JSON String
  [LazyGoal Agent / Contracts decode]
  (Decoded into Canonical AgentDecision without any null artifacts)
```

---

## Key Design Decisions

### 分支关键字段可空必填 (Nullable Required)
- **对应需求**：[Req 1.1](requirements.md#req-1-1), [Req 1.3](requirements.md#req-1-3)
- **实现机制**：在 `mergeGeminiUnion` 中，当合并 `properties.result` 的分支对象时：
  1. 收集所有分支出现的顶层属性列表；
  2. 对每个属性，将其标注为 `nullable: true`；
  3. 顶层的 `required` 数组不再取所有分支的交集，而是直接包含所有决策相关的关键字段：`["kind", "action", "summary", "completionEvidence", "memoryPatch", ...]`；
  4. 在 `description` 中明确指示语法机：“当 kind 为 tool_call 时，action 必须是对象，summary/evidence 输出 null；当 kind 为 complete 时，action 输出 null，summary/evidence 必须输出实际内容”。

### 移除 summary 单值枚举
- **对应需求**：[Req 1.2](requirements.md#req-1-2)
- **实现机制**：在 `mergeGeminiUnion` 中，移除针对 `key === "summary"` 强行注入固定单值枚举 `["Task completed with verified evidence."]` 的代码。将其保持为普通的 `{ type: "string", nullable: true, maxLength: "2000" }`。

### 证据哨兵值与模式匹配闭环
- **对应需求**：[Req 2.1](requirements.md#req-2-1), [Req 2.2](requirements.md#req-2-2), [Req 2.3](requirements.md#req-2-3), [Req 3.1](requirements.md#req-3-1), [Req 3.2](requirements.md#req-3-2)
- **实现机制**：
  1. **清洗阶段**：在 `restoreGeminiResponseProjection` 中，依据识别出的 `kind`，显式清理该分支下不应存在的字段（例如若 `kind === "tool_call"`，则删除 `summary`、`completionEvidence`、`reason`、`error` 等；若 `kind === "complete"`，则删除 `action` 等）；
  2. **反向投影匹配**：改造 `matchesKnownSchemaShape`，在评估 `completionEvidence` 字段时，若当前分支不是 `complete` 分支，允许字段缺省或为哨兵值；
  3. **禁止回滚**：改造函数返回逻辑，只要完成了字段清洗与 JSON 归一化，就直接返回清洗后的字符串，严禁在模式匹配不全时回滚返回原始破损内容。

### 契约纯洁性与失败透明性
- **对应需求**：[Req 4.1](requirements.md#req-4-1), [Req 4.2](requirements.md#req-4-2)
- **实现机制**：适配器只做语法投影与反向清洗，不伪造合法的证据数组或工具调用。如果模型输出的字段经过清洗后依然无法被 `bundle.decode` 解码，必须向运行时如实暴露 `ContractValidationError`，由 Agent 模块统一转换为 `LLMResponseProtocolError`，保持运行时事实可追溯。

---

## Error Handling

| 异常情况 | 触发场景 | 处理策略 |
|---|---|---|
| 模型返回非 JSON 文本 | 模型输出格式崩溃或被截断 | `restoreGeminiResponseProjection` 在 `JSON.parse` 失败时原样返回文本，由 Agent 解码器报告协议错误。 |
| 模型选错 kind 但输出完整 action | 自回归首词偏差但包含有效工具调用 | 纠偏层根据 `action !== undefined` 纠正 `kind: "tool_call"` 并剔除多余字段。 |
| 模型在 complete 时未提供证据 | 模型提前结题未传有效证据 | 逆向层不伪造虚假证据序列，交由 Agent 契约校验拦截并记录明确的诊断日志。 |

---

## Testing Strategy

1. **单元测试 (`packages/llm/test/gemini.test.ts`)**：
   - 验证 `prepareGeminiSchema` 生成的 `responseSchema` 包含 `action: { nullable: true }` 并处于 `required` 列表中。
   - 验证 `summary` 不再包含单值硬编码 enum。
   - 验证逆向投影能够正确剥离 `action: null`、`summary: null` 及 sentinel 值。
   - 验证纠偏与哨兵值同时存在时不再发生静默回滚。
2. **回归测试**：
   - `npm test`（795+ 单元测试）。
   - `npx tsc --noEmit` 与 `npm run check:dependencies`。
   - benchmarks 单元测试与 Python 测试。
3. **真实端点与 SWE-bench 验证**：
   - 在真实 Gemini 3.6 端点验证单题 `astropy__astropy-12907`。
   - 验证此前失败的 `astropy__astropy-13453` 或 `astropy__astropy-13398`，确认不再出现 `INVALID_AGENT_DECISION` 协议错误。

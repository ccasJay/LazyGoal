# 模型用量记录 设计

## 审批摘要

### 方案

Adapter 层把供应商 `usage` 归一化为固定形态写进既有 `providerMetadata`;Diagnostic Trace 零改动自动落盘；执行事实通道(`EpisodeExecutionFacts`)扩展用量聚合字段，报告按尝试记录聚合用量与缺失计数。全程不触碰 Domain Event、Snapshot 或模型上下文。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 用量归一化形态 | `providerMetadata` 新增 `usage: { inputTokens, outputTokens, cachedInputTokens? }` 子对象(字段名 snake/camel 归一为 camel);供应商缺失时整个 `usage` 缺省 | 归一化后 trace 与报告消费者不感知供应商差异;providerMetadata 是 JsonValue,无接口破坏 |
| 提取位置 | 在两个 Adapter 的响应组装处提取(OpenAI-compatible 取 `response.usage`,Gemini 取其响应用量字段),失败/中止调用无响应自然不记 | 提取靠近数据源;executor/trace 无需识别供应商结构 |
| 执行路径累计 | `HeadlessCompositionRoot` 在每次 Step/Preparation executor 调用后从返回的 `LLMResponse.providerMetadata` 读取 usage 累计,Run 结束时并入返回的 model 事实 | Runtime 不参与(usage 不进领域状态);benchmark 通用 root 获得能力,ALFWorld 免费继承 |
| 报告字段 | `EpisodeModelFacts` 新增 `usage: { inputTokens, outputTokens, missingCalls }`;缺失调用只增 `missingCalls`,token 数不求和、不补 0 | 报告 JSON 新增只读字段,旧字段不变;重试尝试天然独立聚合(每次 run() 独立累计) |

### 风险与待确认

- 风险等级:medium;理由:跨 llm/agent/benchmark 三层数据流,但均为追加式字段与本地聚合,不触碰恢复语义,可逆。
- 关键操作:无。
- 风险:Gemini 用量字段形态以 SDK 实际返回为准,实施时以真实类型定义映射,拿不到即缺失;兼容端点(如 CLIProxyAPI)不转发 usage 时只有缺失计数——本地环境已实测转发(2026-09-07)。
- 待确认:无。

## Overview

数据流全程单向追加,无状态迁移:

```text
Adapter(generate)
  └─ response.usage ──归一化──► providerMetadata.usage
        │
        ├─► Diagnostic Trace(model_response 记录,零改动继承)
        │
        └─► HeadlessCompositionRoot(每次调用后累计)
                └─► Run 结果 model 事实
                        └─► EpisodeModelFacts.usage(报告 JSON)
```

## Key Design Decisions

### 归一化字段契约

`providerMetadata.usage`(存在时)固定为:

```ts
interface NormalizedUsage {
    inputTokens: number;        // OpenAI promptTokens / Gemini 输入侧
    outputTokens: number;       // OpenAI completionTokens / Gemini 输出侧
    cachedInputTokens?: number; // OpenAI prompt_tokens_details.cached_tokens 等,可用才有
}
```

提取逻辑只做字段搬运与数字类型守卫(非有限非负数视为缺失),不做估算。OpenAI 侧 `total_tokens` 不记录(可由两者求和,避免冗余);Gemini 侧以其 SDK 响应的用量结构(`usageMetadata` 系字段)做同义映射。

### 累计与缺失语义

`HeadlessCompositionRoot` 维护单次 `run()` 内的累计器:每次 executor 返回带 `providerMetadata.usage` 的响应则 `inputTokens/outputTokens` 累加,无 usage 或响应缺失则 `missingCalls + 1`。累计器是 run 级内存状态,不持久化;基础设施重试产生的新 `run()` 天然从零累计,满足按尝试独立聚合。累加溢出防护:非安全整数时停止累加并保留最后一次合法值与警告字段(实现细节,不进契约)。

### 报告接线

`EpisodeModelFacts` 扩展可选 `usage` 字段(通用 root 不产生用量数据时缺省,报告层记 `missingCalls` 为全量缺失);`EpisodeAttempt` 由现有 `createEpisodeAttempt` 透传,`aggregateEvaluationReport` 汇总各尝试用量供顶层统计(仅求和已存在值)。报告 schema 新增字段全部可选,旧报告文件不受影响(评测报告不承诺跨版本兼容,但也不主动破坏)。

## Testing Strategy

- Adapter 单测(待实现):构造带 `usage` 的 OpenAI 响应对象断言归一化字段;`usage` 为 null/缺失时断言 `providerMetadata.usage` 缺省;Gemini 同形断言;非数字 usage 字段视为缺失。
- Trace 单测(待实现):带 usage 的响应经 `recordLlmResponse` 后 trace payload 含 `providerMetadata.usage`;缺失时不含字段;trace sink 异常不影响既有测试语义(现有用例回归)。
- 聚合单测(待实现):模拟多次调用(若干带 usage、若干缺失)断言累计值与 `missingCalls`;模型 `fail`/异常路径不产生 usage 累计。
- 报告单测(待实现):`EpisodeModelFacts.usage` 透传到 attempt;缺失用量不出现在 token 求和;旧形态 facts(无 usage)生成报告时记全量缺失。
- 真实环境复核(人工,Feature Verification):通过 CLIProxyAPI 跑一次 smoke,检查 trace 中 `providerMetadata.usage` 与 curl 实测一致(2026-09-07 已验证 proxy 转发 usage)。

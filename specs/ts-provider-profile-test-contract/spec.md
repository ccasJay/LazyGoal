---
status: proposed
created_at: 2026-10-30
supersedes: []
superseded_by: null
---

# Provider 连接测试结果改用 TS 类型 Spec

## 目标与范围

迁移 `BrowserProviderProfileTestResult` 及 `BrowserProviderProfileTestError`，以一个真实响应验证 `ok` 判别联合和安全整数约束。仅覆盖 `POST /api/providers/:providerProfileId/test` 的结果读取，不改请求、查询逻辑或设置页交互。

## 需求与验收标准

- <a id="spec-req-1-1"></a>**1.1 单源**：当维护结果时，应当用原生 TS 定义 `{ ok: true, modelCount: number } | { ok: false, error: BrowserProviderProfileTestError }` 及错误字符串联合；切换消费者时删除对应两个 AST、推导、登记和旧 guard，不维护第二份字段或枚举表。
- <a id="spec-req-1-2"></a>**1.2 校验**：当读取时，应当保留现有五个错误值，`modelCount` 限为 `1..Number.MAX_SAFE_INTEGER` 的整数。缺字段、错类型、未知 `ok`/错误值及非 JSON 数据均失败，不转换、不补值、不返回部分数据。
- <a id="spec-req-1-3"></a>**1.3 分支提取**：当附带额外字段时，应当先按未修改的 `ok` 确定分支，再提取该分支数据；另一分支的字段视为未知字段剥离。分支校验失败不得尝试另一分支，输入不变、结果独立；诊断仅含契约身份及有界路径，记录失败不阻断合法结果。
- <a id="spec-req-1-4"></a>**1.4 消费**：当浏览器 `testProvider` 收到 2xx 时，应当返回提取结果；非法结果仍报 `invalid_api_response`。非 2xx 的 `{ error }` 继续按现有 `BrowserApiError` 处理，不送入联合读取器；状态码、授权及取消语义不变。
- <a id="spec-req-1-5"></a>**1.5 生成**：当生成时，应当从 TS 与 JSDoc 产生分支 Schema 和读取制品；整数约束使用 `@minimum`、`@maximum`、`@multipleOf`。沿用第一步的身份、版本、方言和来源规则；无效注解、约束失效或制品漂移使检查失败，干净检出直接加载已提交 ESM。
- <a id="spec-req-1-6"></a>**1.6 验收**：当验证时，应当在 Node 与真实浏览器覆盖两分支、混合字段、错误判别值及数值边界；证明非法成功分支不因附带合法 `error` 而通过。实际 HTTP 路由的成功与非 2xx 映射、既有 Provider 回归保持通过。

## 架构与核心决策

[类型和读取器](../../packages/web-contracts/src/provider-settings.ts)归 `web-contracts`；浏览器复用[第一步](../ts-provider-models-contract/spec.md)的结果读取接缝。分支选择和字段清理依据同源生成 Schema，不手写分支字段表，不直接对整个联合试探清理。只支持本例互斥判别分支，不扩展无判别联合或歧义框架。

本步直接依赖第一步生成链，与[第二步输入迁移](../ts-provider-model-query-contract/spec.md)分别拥有自己的类型和制品；可独立准备和验证，不等待第二步。最终集成使用第一步实际产物；共享导出和生成入口只增加本契约登记，不改变前两步行为。同进程 Provider 端口继续依赖静态类型。

## 风险与否定性保证

风险等级：中，主要风险是分支清理顺序改变接受结果，以及整数约束被生成器忽略。不改变凭据处理、HTTP 失败协议或执行状态，不保留旧 AST 回退。

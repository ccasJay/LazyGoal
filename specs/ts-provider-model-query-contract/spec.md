---
status: delivered
delivered_at: 2026-10-31
created_at: 2026-10-30
supersedes: []
superseded_by: null
---

# 在线模型查询输入改用 TS 类型 Spec

## 目标与范围

将 `POST /api/providers/models` 的输入 `BrowserProviderModelQuery` 改为 TS 单源，接入真实 HTTP 路由。仅增加可选属性支持；成功响应归[第一步](../ts-provider-models-contract/spec.md)，其他契约不迁移。

## 需求与验收标准

- <a id="spec-req-1-1"></a>**1.1 单源**：当维护输入时，应当只声明原生 TS：`kind: string`，`apiKey?`、`baseURL?`、`profileId?` 均为字符串；用 JSDoc `@pattern` 约束非空白。删除对应 AST、`InferContract` 引用和登记项，不另写字段 Schema 或白名单。
- <a id="spec-req-1-2"></a>**1.2 校验**：当读取 JSON 对象时，可选字段省略应当保持省略；必需字段缺失、已提供字段为 `null`、空白或错误类型均失败，不转换、不补值、不 trim，不返回部分数据；非 JSON 值拒绝。
- <a id="spec-req-1-3"></a>**1.3 提取**：当附带未知字段时，应当改为剥离后继续处理，而非当前的拒绝；返回独立数据且不修改输入。诊断仅有契约身份和有界路径，不含字段值或正文；记录失败不阻断合法请求。
- <a id="spec-req-1-4"></a>**1.4 路由**：当接收请求时，应当只把读取结果交给 `fetchModels`；保留现有 UTF-16 长度、`profileId` 格式、16 KiB 请求上限及 JSON/授权检查。数据校验失败仍返回 400 `invalid_provider_profile`，不得触达查询端口；其他错误和取消语义不变。
- <a id="spec-req-1-5"></a>**1.5 制品**：当生成时，应当复用第一步生成链，为本输入登记独立身份，沿用其版本、方言、来源摘要及一致性规则；可选属性不得误变必填或可空。错拼/不支持注解和制品漂移使检查失败；干净检出直接消费已提交 ESM。
- <a id="spec-req-1-6"></a>**1.6 验证**：当验收时，应当通过读取样本及真实 HTTP 路由证明提取结果进入端口、非法及未授权请求不进入端口；浏览器请求构建、既有 Provider 回归和生成检查通过，诊断及响应不泄漏测试密钥。

## 架构与核心决策

类型与生成读取器归 `web-contracts`；[路由](../../packages/browser/src/browser-goal-routes.ts)保留 wire 限制和 HTTP 映射，替换该输入的 `safeParse`。同进程类型化调用不增加校验。

输入与第一步响应分别拥有自己的类型和制品，不改变其接口。类型及路由场景可独立准备；最终生成与集成验证须复用第一步通过验收的实际生成链，不复制工具链或以替身宣称集成通过。UTF-16 限制不改写为字符计数不同的 Schema `maxLength`。

## 风险与否定性保证

风险等级：高，输入含凭据，重点验证剥离和诊断不泄漏、不绕过原有限制。不改变凭据复用、保存或 Provider 查询逻辑，不添加兼容解析或旧 AST 回退。

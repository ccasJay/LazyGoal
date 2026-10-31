---
status: proposed
created_at: 2026-10-31
supersedes: []
superseded_by: null
---

# Web 数据契约迁移 Spec

## 目标与范围

将 Web HTTP、SSE 与浏览器 DTO 的生产数据边界逐族迁移到 TS 类型与生成绑定；Web 类型及 wire 行为归 `web-contracts` 与对应 HTTP/SSE 边界所有。

## 需求与验收标准

- <a id="spec-req-1-1"></a>**1.1 覆盖**：以 Catalog 和真实路由、SSE、浏览器消费者核对范围，每个已迁移 DTO 及可达类型由 TS 单源生成相应制品，删除其旧 AST、推导和重复字段验证；同进程类型调用不新增无谓验证。
- <a id="spec-req-1-2"></a>**1.2 读取**：自有 JSON 未知字段按已确认的宽容策略提取和安全诊断；已知字段错误、鉴权、请求大小、UTF-16 限制和敏感键规则继续有效，HTTP 错误及取消语义保持。
- <a id="spec-req-1-3"></a>**1.3 真实边界**：服务端路由、浏览器 API 和 SSE 实际消费新契约，覆盖嵌套数据、联合、开放 JSON 与凭据泄漏；通过真实浏览器、服务路由与全量回归，不使用旧解析回退。
- <a id="spec-req-1-4"></a>**1.4 既有 Spec**：在线模型查询输入及 Provider 连接测试结果继续以各自已批准 Spec 为验收依据；它们分别接入现有 Catalog/绑定，不改变已批准的字段和行为。其余契约族按所属边界分工并记录完成证据。

## 架构与核心决策

Web 线负责契约类型、路由与浏览器消费者；[生成能力](../ts-contract-generation-capabilities/spec.md)负责通用生成和分支能力。与[其他边界](../ts-other-boundaries-migration/spec.md)按 Web HTTP/SSE 归属划界；不修改模型/工具绑定。可按互不重叠的协议族并行准备，最终使用真实生成器与集成测试；共享导出及 Catalog 集中协调。

## 风险与否定性保证

风险等级：高。宽容读取改变部分旧 AST 对未知字段的处理，须防止绕过凭据与授权规则；不改变现有执行、审批和恢复语义。

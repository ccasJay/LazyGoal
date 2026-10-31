---
status: proposed
created_at: 2026-10-31
supersedes: []
superseded_by: null
---

# 模型数据契约迁移 Spec

## 目标与范围

迁移模型输出、模型 system tools 和按授权工具动态组合的生产契约，使用 TS 单源和生成绑定替代模型侧 AST 消费。

## 需求与验收标准

- <a id="spec-req-1-1"></a>**1.1 TS 单源**：模型 canonical、wire 所需数据及所有 system tools 的字段和约束由所属 TS 类型定义；Schema、读取及投影同源生成，不再使用对应 AST、推导或手写第二字段表。
- <a id="spec-req-1-2"></a>**1.2 动态组合**：运行时根据阶段、模式和当前授权工具集合组合模型声明、Schema 与解码；空集合、重复身份、未知或未授权工具和不合法阶段仍按现有规则处理。业务工具绑定来自[工具迁移](../ts-tool-input-migration/spec.md)，不以固定构建产物冒充所有动态组合。
- <a id="spec-req-1-3"></a>**1.3 读取与投影**：模型输出及 system tool 输入剥离未知字段并产生安全有界诊断；已知字段、判别值、授权及领域约束错误拒绝，不返回部分数据。Provider wire 与 canonical 的可选、`null`、约束、解码和错误路径一致，未经显式本地验证不得放宽约束。
- <a id="spec-req-1-4"></a>**1.4 真实链路**：模型请求、原生工具声明、响应解码和 Runtime 决策验证使用新契约，覆盖现有 strict/prompt-only、支持的 Provider、状态与审批流程。与工具线统一切换；真实请求组合、失败纠错和完整回归通过。

## 架构与核心决策

模型线拥有动态组合、模型 wire 与 system tool 接口；工具线拥有业务工具类型及绑定。共享生成能力由[生成能力 Spec](../ts-contract-generation-capabilities/spec.md)提供；可先以约定接口和隔离替身并行准备，集成须使用工具实际绑定并验证 Model → Runtime → Tool 的完整链路。其他模型消息或跨进程载荷归[其他边界](../ts-other-boundaries-migration/spec.md)，不得重复迁移。

## 风险与否定性保证

风险等级：高。关键风险是授权集合、分支解码、Provider 可移植性和阶段约束被削弱。除已确认的未知字段剥离外，不调整执行、审批、恢复或关闭语义，不保留 AST 失败回退。

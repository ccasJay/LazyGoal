# 契约运行时绑定语义表

本表只概括本包负责的概念；字段、错误与读取行为以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| 契约绑定 | 由生成制品创建的类型化读取入口，携带契约身份、版本、本地 Schema 与 `read`。 | [契约运行时绑定](../README.md) | [绑定实现](../src/binding.ts)、[模块说明](./overview.md) |
| 未知字段策略 | `strip` 删除未声明字段并诊断；`reject` 将其作为失败问题。 | [契约运行时绑定](../README.md) | [公共类型](../src/types.ts)、[读取实现](../src/binding.ts) |
| 读取结果 | 成功返回隔离数据与可选诊断；失败只返回契约身份、版本与有界问题。 | [契约运行时绑定](../README.md) | [公共类型](../src/types.ts) |
| 安全诊断 | 只含契约身份、版本和有界 JSON Pointer 路径，不含字段值或原始载荷。 | [契约运行时绑定](../README.md) | [读取实现](../src/binding.ts)、[Schema 遍历](../src/schema.ts) |
| 本地 Schema | 构建器从 TS 类型生成的 JSON Schema；绑定不维护第二份字段表。 | [契约运行时绑定](../README.md) | [公共类型](../src/types.ts)、[生成器](../../../scripts/generate-contracts.mjs)、[构建期 Catalog](../../../contracts/README.md) |
| JSON 隔离 | 读取前验证 JSON 形状并创建不共享引用的副本。 | [契约运行时绑定](../README.md) | [JSON 原语](../src/json.ts) |
| 模型投影 | 从同源本地 Schema 派生 Provider wire Schema 与 canonical 解码器。 | [契约运行时绑定](../README.md) | [投影实现](../src/projection.ts)、[模块说明](./overview.md) |
| Wire Schema | 封闭、required-nullable、内联引用且只含可移植约束的 draft-07 Schema。 | [契约运行时绑定](../README.md) | [投影实现](../src/projection.ts) |
| Canonical 解码 | 将 wire 可选 `null` 转为 canonical 省略并复用绑定校验。 | [契约运行时绑定](../README.md) | [投影实现](../src/projection.ts) |

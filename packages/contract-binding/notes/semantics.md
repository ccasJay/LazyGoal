# 契约运行时绑定语义表

本表只概括本包负责的概念；字段、错误与读取行为以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| 契约绑定 | 由生成制品创建的类型化读取入口，携带契约身份、版本、本地 Schema 与 `read`。 | [契约运行时绑定](../README.md) | [绑定实现](../src/binding.ts)、[模块说明](./overview.md) |
| 未知字段策略 | `strip` 删除未声明字段并诊断；`reject` 将其作为失败问题。 | [契约运行时绑定](../README.md) | [公共类型](../src/types.ts)、[读取实现](../src/binding.ts) |
| 联合分支选择 | 在未清理输入上按已知约束与非空判别值确定唯一分支；歧义或无匹配时失败。 | [契约运行时绑定](../README.md) | [Schema 判定](../src/schema.ts)、[模块说明](./overview.md) |
| 开放对象 | `additionalProperties` 为 `true`、空 Schema 或值 Schema 时接受额外键，后者继续校验嵌套值。 | [契约运行时绑定](../README.md) | [Schema 判定](../src/schema.ts)、[公共类型](../src/types.ts) |
| 可空类型数组 | `type` 数组按值选择具体类型，用于 `null` 与标量联合，不丢失已知约束。 | [契约运行时绑定](../README.md) | [Schema 判定](../src/schema.ts)、[公共类型](../src/types.ts) |
| 数组长度约束 | `minItems`/`maxItems` 限制数组长度，并在绑定读取与模型投影中保留；失败分别报告 `array_min_items` 与 `array_max_items`。 | [契约运行时绑定](../README.md) | [Schema 判定](../src/schema.ts)、[公共类型](../src/types.ts) |
| 问题分类 | 读取失败直接使用 `@lazygoal/contracts` 的共享 `ContractIssueCode`，区分数值、字符串与数组的上下界；消费方只补消息，不再翻译分类。 | [契约运行时绑定](../README.md) | [读取实现](../src/binding.ts)、[Schema 判定](../src/schema.ts)、[诊断词汇](../../contracts/src/errors.ts) |
| 契约定义错误 | 未分类关键字、`$ref` 别名环或无效 `pattern` 表明生成制品与绑定能力不匹配，读取抛出 `ContractSchemaError`，不作为输入问题上报。 | [契约运行时绑定](../README.md) | [绑定错误](../src/errors.ts)、[读取实现](../src/binding.ts) |
| 递归 Schema | 本地 `$ref` 按实际 JSON 值逐层解析；不消费值的引用环属于契约定义错误，抛出 `ContractSchemaError`。 | [契约运行时绑定](../README.md) | [Schema 判定](../src/schema.ts) |
| 读取结果 | 成功返回隔离数据与可选诊断；失败只返回契约身份、版本与有界问题。 | [契约运行时绑定](../README.md) | [公共类型](../src/types.ts) |
| 安全诊断 | 只含契约身份、版本和有界 JSON Pointer 路径，不含字段值或原始载荷；未声明属性名与开放对象键名替换为 `*`，只保留已声明属性名和数组下标；校验器 `instancePath` 按同一规则映射。 | [契约运行时绑定](../README.md) | [读取实现](../src/binding.ts)、[Schema 遍历](../src/schema.ts) |
| 本地 Schema | 构建器从 TS 类型生成的 JSON Schema；绑定不维护第二份字段表。 | [契约运行时绑定](../README.md) | [公共类型](../src/types.ts)、[生成器](../../../scripts/generate-contracts.mjs)、[构建期 Catalog](../../../contracts/README.md) |
| JSON 隔离 | 读取前验证 JSON 形状并创建不共享引用的副本。 | [契约运行时绑定](../README.md) | [JSON 原语](../src/json.ts) |
| 模型投影 | 从同源本地 Schema 派生 Provider wire Schema、本地约束清单与 canonical 解码器。 | [契约运行时绑定](../README.md) | [投影实现](../src/projection.ts)、[模块说明](./overview.md) |
| Wire Schema | 封闭、required-nullable、内联引用、联合为 `anyOf` 的 draft-07 Schema。 | [契约运行时绑定](../README.md) | [投影实现](../src/projection.ts) |
| 本地约束标识 | wire 省略的字符串约束以 JSON Pointer 和关键字列表提供给模型装配，由解码强制验证。 | [契约运行时绑定](../README.md) | [投影类型](../src/projection.ts) |
| Canonical 解码 | 按唯一联合分支将 wire 可选 `null` 转为 canonical 省略并复用绑定校验。 | [契约运行时绑定](../README.md) | [投影实现](../src/projection.ts) |

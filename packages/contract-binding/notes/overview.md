# 契约运行时绑定

`@lazygoal/contract-binding` 是数据契约的运行时绑定基础包。它不拥有 Web、Runtime、Storage、工具实现或旧 Contract AST，也不在运行时编译 TypeScript；字段与约束的唯一来源仍是 Catalog 登记的 TS 类型及其 JSDoc。

绑定的身份、版本、本地 Schema 与校验器由构建期生成器提供。`createContractBinding<T>` 只保存这些制品并暴露 `read(value, policy)`，因此调用方获得类型化数据而不需要再维护字段表。

## 读取生命周期

1. 输入必须是 JSON 数据。访问器、类实例、循环引用、非有限数、Symbol 与 BigInt 在复制前失败。
2. 绑定创建隔离副本，不修改调用方输入，也不共享对象或数组引用。
3. 联合在未清理副本上先确定分支：判别字段的 `const`/`enum`、必填字段和已知字段约束必须有效，未知字段不参与分支判定。无法唯一确定分支或已知字段无效时失败，不会因为提前删除字段而误选分支。
4. `strip` 策略按已确定分支删除全部未声明字段并返回有界诊断；`reject` 策略把未声明字段作为失败问题。开放对象的 `additionalProperties` 为 `true`、空 Schema 或值 Schema 时保留其允许的键；值 Schema 为封闭对象时仍递归检查嵌套未知字段。已知字段的类型、必填、枚举、数值、长度、模式等约束由生成校验器拒绝。
5. 递归 `$ref` 按实际 JSON 值逐层解析，不因 Schema 递归本身消耗调用栈；没有消费值的引用环会作为约束失败。
6. 成功结果只含隔离数据和可选诊断；失败结果只含契约身份、版本及有界问题列表，不返回部分数据。

诊断与问题路径受数量与长度上限保护，且不包含字段值、原始载荷或异常消息。已声明属性名可以出现在路径中。

## 模型投影

`modelProjection()` 从同一份本地 Schema 派生 Provider 可用的 draft-07 wire Schema，并返回成对的 canonical 解码器与本地约束清单：

- 对象保持封闭，所有属性进入 `required`；本地可选属性表示为 required-nullable（`type: [..., "null"]`、含 `null` 的 `enum` 或 `anyOf` 的 `null` 分支）。
- 本地联合映射为 `anyOf`；可空字段由 `type` 数组表达。可选属性本身允许 `null` 时无法区分缺席与显式 `null`，投影明确失败。
- 本地 `$ref` 在 wire Schema 中内联；递归引用、元组和开放对象无法安全转换为 Provider 可移植结构，投影明确失败。
- 数值类型（`number`/`integer`）与 `minimum`/`maximum` 保留；数组 `items`、`minItems`/`maxItems` 与可表达的元素约束保留。字符串 `pattern`、`minLength`、`maxLength` 从 wire Schema 省略，并记录在 `localConstraints`（JSON Pointer 与关键字列表）中，由 `decode` 使用同源本地 Schema 强制验证，不会静默放宽。
- `decode` 要求 wire 必填属性存在，按唯一合法联合分支处理，将可选 `null` 转为 canonical 省略，再复用绑定的本地校验与 `strip` 未知字段策略；失败不返回部分数据。

模型投影只负责数据形状；阶段、授权和工具可见性仍由模型执行链的现有所有者执行。无法安全转换时直接失败，不回退旧 Contract AST。

## 边界与限制

- 绑定只覆盖数据边界；阶段、授权、审批和持久化语义仍由各自所有者执行。
- `reject` 策略用于必须拒绝额外字段的严格配置边界；工具、模型与 Web 的宽容读取由调用方选择 `strip`。
- 本包当前不切换任何生产消费者，也不替代各领域现有的读取器；后续迁移线通过生成的绑定模块接入。
- 共享读取器只支持 Catalog 生成器已声明的 Schema 子集；不支持的结构必须由生成或投影明确失败。
- 模型 wire 投影与 canonical 解码作为同一能力提供；Provider 无法表达的本地字符串约束以 `localConstraints` 明确标识并由解码强制验证，其他无法安全转换的结构直接失败。

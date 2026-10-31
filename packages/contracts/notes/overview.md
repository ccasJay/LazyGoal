# 通用 JSON 原语

零出站依赖的确定性 JSON 原语、JSON 静态类型与共享契约校验诊断。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。

## 职责

`@lazygoal/contracts` 拥有全仓共享的 canonical JSON、对象守卫、深冻结、代码单元比较、JSON 类型与 `ContractValidationError`。它只依赖 ECMAScript 内建对象，浏览器构建与 Node 运行时使用同一实现；不包含 Contract DSL、AST、Parser、Schema 编译器、节点检查或具体业务协议，不执行 Tool、不读取 Goal、不拥有审批或持久化状态。

## 确定性 JSON 原语

[`json.ts`](../src/json.ts) 是 canonical JSON、通用对象守卫与深冻结的唯一实现，不导入 `node:` 模块。

- `canonicalizeJson`：递归复制 JSON 值并按 UTF-16 code unit 顺序重排自有可枚举字符串键；数组保序，标量原样返回，输入不被修改。自有 `"__proto__"` 键按普通自有键复制，不改变任何对象的原型。
- `canonicalJson`：对规范化结果调用 `JSON.stringify`，省略缩进时输出紧凑 JSON，`{ indent: 2 }` 输出两空格缩进；顶层不可序列化值返回字符串 `"null"`，其余标量、`toJSON` 与 `BigInt` 语义继承 `JSON.stringify`。
- `isRecord`：当且仅当值是非 `null`、非数组对象时返回 `true`；需要更窄领域类型时由调用点显式校验字段。
- `deepFreeze`：返回同一引用，先冻结子值再冻结父值，并通过已访问集合终止循环引用。
- `compareCodeUnits`：不受 locale 影响的字符串比较器，供规范化键排序与需要稳定文本序的调用点复用。

`@lazygoal/context-budget` 的 `stableJson` 是保留在该包的公开入口，内部委托 `canonicalJson(value, { indent: 2 })`；算法实现不在消费包内重复。确定性测试 [`single-implementation.test.ts`](../test/single-implementation.test.ts) 静态守护 allowlist 之外的重复定义。

## 类型与校验诊断

[`types.ts`](../src/types.ts) 定义 `JsonScalar`、`JsonValue`、`JsonSchemaValue` 与 `JsonSchema202012`，供工具、模型、Runtime、Storage、Web 与 benchmark 的 JSON 边界共享静态形状；这些类型不承诺运行时已经完成有限数字、普通对象原型、无循环引用或具体 Schema 方言校验。

[`errors.ts`](../src/errors.ts) 定义 `ContractIssueCode`、`ContractIssue` 与 `ContractValidationError`。模型输出生成绑定解码、语义校验与 system tool 参数校验使用该错误携带有序、可截断诊断；`code`、`path`、`message`、`issues` 与 `truncated` 是调用方可依赖的形状。本包不执行结构校验，接受范围由产生错误的边界拥有。

## 相关入口

- [确定性 JSON 原语](../src/json.ts)：canonical JSON、`isRecord`、`deepFreeze` 与 `compareCodeUnits`。
- [JSON 类型](../src/types.ts)：JSON 标量、值、Schema 值与 Schema 根类型。
- [校验诊断](../src/errors.ts)：共享 issue 分类与 `ContractValidationError`。

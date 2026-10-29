# 通用契约

无出站依赖的 Contract AST、解析与 JSON Schema 编译。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 职责

`@lazygoal/contracts` 提供零出站依赖的核心 Contract AST、运行时 Parser、确定性 JSON Schema 2020-12 编译器、统一只读节点检查器与确定性 JSON 原语。它只描述通用的结构约束与数据验证规则，不包含具体应用领域的模型交互或业务协议，不执行 Tool、不读取 Goal、不拥有审批或持久化状态。

## 核心 DSL 与 AST

- `contract`：用于构造基础标量、枚举、字面量、对象、数组、Record、联合及递归节点的冻结 AST。
- `safeParse` / `parse`：对输入数据执行契约校验与深复制隔离，返回确定性结果或结构化 `ContractValidationError`。
- `compileJsonSchema`：将 Contract 节点编译为确定性且符合 JSON Schema 2020-12 规范的纯数据对象。
- `inspectContractNode`：跨包安全识别核心 AST 节点类别（`"contract"` 或 `"optional-property"`）及只读节点引用，避免调用方依赖内部品牌 Symbol。

## 确定性 JSON 原语

[`json.ts`](../src/json.ts) 是全仓 canonical JSON、通用对象守卫与深冻结的唯一实现，只依赖 ECMAScript 内建对象，不导入 `node:` 模块，浏览器与 Node 运行时共用同一算法。

- `canonicalizeJson`：递归复制 JSON 值并按 UTF-16 code unit 顺序重排自有可枚举字符串键；数组保序，标量原样返回，输入不被修改。自有 `"__proto__"` 键按普通自有键复制，不改变任何对象的原型。
- `canonicalJson`：对规范化结果调用 `JSON.stringify`，省略缩进时输出紧凑 JSON，`{ indent: 2 }` 输出两空格缩进；顶层不可序列化值返回字符串 `"null"`，其余标量、`toJSON` 与 `BigInt` 语义继承 `JSON.stringify`。
- `isRecord`：当且仅当值是非 `null`、非数组对象时返回 `true`；需要更窄领域类型时由调用点显式校验字段。
- `deepFreeze`：返回同一引用，先冻结子值再冻结父值，并通过已访问集合终止循环引用。
- `compareCodeUnits`：不受 locale 影响的字符串比较器，供规范化键排序与需要稳定文本序的调用点复用。

`@lazygoal/context-budget` 的 `stableJson` 是保留在该包的公开入口，内部委托 `canonicalJson(value, { indent: 2 })`；算法实现不在消费包内重复。确定性测试 [`single-implementation.test.ts`](../test/single-implementation.test.ts) 静态守护 allowlist 之外的重复定义。

## Tool 输入契约基础

每个 Tool 通过 `ToolDefinition.inputContract` 声明唯一输入事实源。Runtime 与 Tool 实现使用同一 AST 生成模型可见 Schema，并在执行前执行 `safeParse` 与领域 `validate`。模型不能通过输出额外字段或自报结果绕过校验。

## 相关入口

- [AST 与 Parser](../src)：Contract 构造器、输入契约、递归节点与运行时错误。
- [JSON Schema 编译器](../src/json-schema.ts)：确定性 JSON Schema 生成器。
- [只读节点检查器](../src/node-inspection.ts)：跨包 AST 节点识别入口。
- [确定性 JSON 原语](../src/json.ts)：canonical JSON、`isRecord`、`deepFreeze` 与 `compareCodeUnits`。

# 通用契约

无出站依赖的 Contract AST、解析与 JSON Schema 编译。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 职责

`@lazygoal/contracts` 提供零出站依赖的核心 Contract AST、运行时 Parser、确定性 JSON Schema 2020-12 编译器和统一只读节点检查器。它只描述通用的结构约束与数据验证规则，不包含具体应用领域的模型交互或业务协议，不执行 Tool、不读取 Goal、不拥有审批或持久化状态。

## 核心 DSL 与 AST

- `contract`：用于构造基础标量、枚举、字面量、对象、数组、Record、联合及递归节点的冻结 AST。
- `safeParse` / `parse`：对输入数据执行契约校验与深复制隔离，返回确定性结果或结构化 `ContractValidationError`。
- `compileJsonSchema`：将 Contract 节点编译为确定性且符合 JSON Schema 2020-12 规范的纯数据对象。
- `inspectContractNode`：跨包安全识别核心 AST 节点类别（`"contract"` 或 `"optional-property"`）及只读节点引用，避免调用方依赖内部品牌 Symbol。

## Tool 输入契约基础

每个 Tool 通过 `ToolDefinition.inputContract` 声明唯一输入事实源。Runtime 与 Tool 实现使用同一 AST 生成模型可见 Schema，并在执行前执行 `safeParse` 与领域 `validate`。模型不能通过输出额外字段或自报结果绕过校验。

## 相关入口

- [AST 与 Parser](../src)：Contract 构造器、输入契约、递归节点与运行时错误。
- [JSON Schema 编译器](../src/json-schema.ts)：确定性 JSON Schema 生成器。
- [只读节点检查器](../src/node-inspection.ts)：跨包 AST 节点识别入口。

# Contract DSL Core 设计

## Overview

本设计新增独立基础包 `@lazygoal/contracts`。调用方只声明一份不可变 Contract AST，包内据此完成
TypeScript 输出类型推导、未知 JSON 输入校验和 JSON Schema 2020-12 导出。AST 是唯一运行时结构
事实源；Schema 是每次按需编译的派生产物，不保存第二份可编辑定义。（对应
[`req-1-1`](./requirements.md#req-1-1)、[`req-5-1`](./requirements.md#req-5-1)）

本 Feature 只建立通用内核，不替换 Agent、Runtime 或 Storage 现有 Zod Schema，也不接入模型和
Tool 请求。现有 wire shape、模型调用、状态转换、持久化和恢复路径保持原样。（对应
[`req-6-3`](./requirements.md#req-6-3)、[`req-6-4`](./requirements.md#req-6-4)）

## Architecture

```text
Contract builders
       |
       v
Immutable Contract AST -----> InferContract<C> (TypeScript only)
       |
       +---------------------> Recursive validator -----> cloned value / issues
       |
       +---------------------> Schema compiler --------> JSON Schema 2020-12
```

包内依赖保持单向：builder 只构造 AST；定义检查器验证完整 Contract 图；validator 与 compiler
分别消费通过检查的 AST，二者不互相调用。生产源码不导入 LazyGoal 其它 package，也不导入 Zod、
TypeBox、Ajv 或其它校验器。Ajv 只位于测试依赖中，作为独立语义 oracle。（对应
[`req-5-4`](./requirements.md#req-5-4)、[`req-6-1`](./requirements.md#req-6-1)、
[`req-6-2`](./requirements.md#req-6-2)）

## Key Design Decisions

### 1. 使用有品牌的不可变 AST，而不是可执行回调规则

公开 builder 返回带内部品牌的 `Contract<Output>` 节点。节点只包含可序列化约束和递归引用元数据；
不会保存 transform、coerce、default、refine 或任意用户函数。builder 在创建时复制 shape、分支数组、
enum 值和 option，再递归冻结节点，因此修改构造参数或强制改写返回值都不能改变既有 Contract。（对应
[`req-1-3`](./requirements.md#req-1-3)、[`req-1-4`](./requirements.md#req-1-4)）

受支持的公开 builder 为：

| builder | 约束与输出 |
| --- | --- |
| `string` | `minLength`、`maxLength`、ECMA-262 Unicode `pattern` |
| `number` | 有限数值、包含边界的 `minimum` / `maximum` |
| `integer` | 安全整数，并把安全整数边界编译进 Schema |
| `boolean` / `null` | 对应 JSON primitive |
| `literal` / `enum` | 非空、无重复的有限 JSON scalar 集合 |
| `object` | 声明字段；默认且始终 strict |
| `optional` / `nullable` | 分别表示字段可缺失、值可以为 `null` |
| `array` | 单一 item Contract，支持 `minItems` / `maxItems` |
| `record` | 字符串动态键到单一 value Contract 的开放字典 |
| `union` | 非空普通联合，任一分支完全匹配即可 |
| `discriminatedUnion` | discriminator 到 strict object 分支的唯一映射 |
| `recursive` | 命名自引用定义 |

`optional` 返回专用 `OptionalProperty`，只允许直接出现在 `object` shape 中，不能作为根、数组 item、
record value 或 union 分支。其它组合都是普通 `Contract`。这使 required 列表在类型、validator 和
Schema 中只有一条确定来源。（对应 [`req-1-1`](./requirements.md#req-1-1)、
[`req-2-2`](./requirements.md#req-2-2)、[`req-2-3`](./requirements.md#req-2-3)）

### 2. `InferContract` 从节点输出品牌推导只读类型

核心类型关系如下；具体节点字段仍由包内部类型承载：

```ts
export interface Contract<Output> {
    readonly kind: ContractKind;
    readonly [contractOutput]: Output;
}

export type InferContract<C extends Contract<unknown>> =
    C[typeof contractOutput];
```

`object` 的 required key 推导为只读必填属性，`optional` key 推导为只读可选属性；array、record、
nullable 和 union 递归传播其子节点输出类型。推导类型不包含协议外字段；TypeScript 本身对已赋值变量
采用结构类型兼容，运行时的额外字段拒绝仍由 strict object 强制执行。（对应
[`req-1-2`](./requirements.md#req-1-2)）

递归不要求调用方再手写一个输出类型。`recursive(name, self => body)` 为 `self` 注入带名称的类型标记，
`InferContract` 在类型层把 body 中的该标记替换为 body 自身；运行时节点则保存名称引用。例如：

```ts
const NodeContract = contract.recursive("Node", (self) =>
    contract.object({
        value: contract.string(),
        children: contract.array(self),
    }),
);

type Node = InferContract<typeof NodeContract>;
// readonly { value: string; children: readonly Node[] }
```

### 3. 使用前先校验完整 Contract 图

builder 立即拒绝局部配置错误，包括空 enum/union、重复 enum 值、非法 pattern、负长度、非有限边界和
最小值大于最大值。`safeParse`、`parse` 与 `compileJsonSchema` 在工作前共同调用定义检查器，遍历
完整 Contract 图并拒绝：

- 同一根 Contract 中名称重复的递归定义；
- 不在有效递归作用域内的悬空 self 引用；
- body 直接等于 self，或只经 union/nullable 回到自身的未受保护递归；
- 未知节点 kind、非法 optional 位置及其它伪造 AST。

合法递归的每条回边必须至少经过 object 字段、array item 或 record value，保证校验每次递归都消费
一层输入。递归名称限制为稳定 ASCII 标识符，直接用于 `$defs` 键和 JSON Pointer，避免名称转义产生
多种表示。（对应 [`req-3-3`](./requirements.md#req-3-3)、
[`req-3-4`](./requirements.md#req-3-4)）

### 4. 解释器严格校验并在成功时构造隔离副本

validator 是无外部依赖的递归解释器。它只接受 JSON 可表示值：有限 number、string、boolean、null、
array 和普通对象。它不修改输入，也不 trim、转换或补默认值。成功路径按 Contract 构造新 array/object；
strict object 按声明顺序复制字段，record 按稳定键顺序复制动态字段，并安全处理 `__proto__` 等键。
因此结果与输入没有可变 object/array 引用共享。（对应 [`req-2-1`](./requirements.md#req-2-1)、
[`req-2-4`](./requirements.md#req-2-4)）

字符串长度按 Unicode code point 计算，pattern 使用无 flag 的 Unicode RegExp；number 拒绝 `NaN` 和
正负无穷，integer 使用 `Number.isSafeInteger`。这些规则与导出 Schema 在 JSON 输入域内保持一致。

解释器维护当前祖先对象的 `WeakSet`，同一路径再次遇到同一引用时返回 `cyclic_value`；已经离开当前
路径的共享引用可以再次解析，并在结果中生成独立副本。固定最大深度为 64，达到限制返回
`max_depth_exceeded`，不得继续递归。（对应 [`req-3-5`](./requirements.md#req-3-5)）

普通 union 按声明顺序在隔离 collector 中试验分支：首个完整成功分支提供结果；全部失败只向主
collector 写入一个 `union_no_match`。discriminated union 先读取 discriminator，未知值返回
`unknown_discriminator`；已知值只校验对应分支。（对应 [`req-3-1`](./requirements.md#req-3-1)、
[`req-3-2`](./requirements.md#req-3-2)）

### 5. 数据错误与 Contract 配置错误使用不同通道

```ts
export interface ContractIssue {
    readonly code: ContractIssueCode;
    readonly path: readonly (string | number)[];
    readonly message: string;
}

export type SafeParseResult<T> =
    | { readonly success: true; readonly data: T }
    | {
        readonly success: false;
        readonly issues: readonly ContractIssue[];
        readonly truncated: boolean;
    };
```

普通输入错误由 `safeParse` 返回，不抛异常；`parse` 对同一输入抛出 `ContractValidationError`，并携带
同样的 `issues` 与 `truncated`。根 path 为 `[]`，对象字段和数组索引逐层追加。issue code 至少覆盖
类型、literal/enum、缺失/额外字段、各类约束、union/discriminator、循环输入和深度限制；message
固定为英文诊断，但调用方只依赖 code/path 分类。（对应 [`req-4-1`](./requirements.md#req-4-1)、
[`req-4-2`](./requirements.md#req-4-2)、[`req-4-3`](./requirements.md#req-4-3)）

对象声明字段按声明顺序报告，协议外字段按 code-point 字典序报告，数组按索引顺序报告。单次解析最多
收集 50 个 issues；到达上限后停止剩余遍历并设置 `truncated: true`，不额外加入第 51 个 issue。
Contract 定义错误不属于输入失败，三个消费 API 都抛出带稳定 reason code 的
`ContractDefinitionError`。（对应 [`req-4-4`](./requirements.md#req-4-4)、
[`req-4-5`](./requirements.md#req-4-5)）

### 6. JSON Schema 编译保持结构等价和顺序稳定

`compileJsonSchema(contract)` 每次返回新的只读 JSON 数据对象。根对象首先写入
`$schema: "https://json-schema.org/draft/2020-12/schema"`，再写入根约束，存在递归定义时最后写入
`$defs`。编译规则为：

- strict object 使用 `properties`、排除 optional 的 `required` 和 `additionalProperties: false`；
- record 使用 `type: "object"` 与 value Schema 形式的 `additionalProperties`；
- nullable 与普通 union 使用 `anyOf`，discriminated union 使用具有唯一 literal tag 的 `oneOf`；
- recursive 定义写入 `$defs`，使用本地 `#/$defs/<name>` 引用；
- integer 自动带上 JavaScript 安全整数上下界，其它长度与范围约束逐项映射。

字段、required、分支和 `$defs` 都沿稳定声明/遍历顺序写入。相同 AST 重复编译后的深比较结果及
`JSON.stringify` 字符串必须一致；调用方修改一次返回对象不能影响后续编译。（对应
[`req-5-2`](./requirements.md#req-5-2)、[`req-5-3`](./requirements.md#req-5-3)）

## Components and Interfaces

```text
packages/contracts/
  package.json
  package-lock.json
  src/
    contract.ts          Contract 品牌、节点类型、builder、InferContract
    definition.ts        局部约束与完整 AST 图检查
    errors.ts            issue code、Definition/Validation Error
    parser.ts            safeParse、parse、递归解释器与深复制
    json-schema.ts       JSON Schema 2020-12 类型与确定性 compiler
    index.ts             唯一公共入口
  test/
    contract.test.ts
    inference.test.ts
    parser.test.ts
    recursive.test.ts
    json-schema.test.ts
    json-schema-oracle.test.ts
```

公共入口只导出 `contract` builders、`Contract`、`InferContract`、`safeParse`、`parse`、
`compileJsonSchema`、结果/issue 类型和两类 Error。AST 遍历工具、类型标记、collector 与 graph
检查细节不导出。所有新增公开接口、函数和方法按仓库规则提供中文 contract TSDoc；主要接口至少带
一个最小示例。

根 `tsconfig.json` 已覆盖新包。依赖检查器增加 `contracts: []`，并把 `contracts` 加入其它 package
允许的下层目标；本 Feature 不实际修改其它 package 的 import。仓库布局说明和架构总览增加
`contracts`，并新增精简的 `docs/architecture/contracts.md` 描述已实现边界。

## Data Models

AST 是进程内只读对象图，不是 wire protocol，也不提供 JSON 反序列化入口。每个节点均有 `kind` 和
该 kind 的最小字段；object shape、union branches、约束 options 与 recursive name/body 都被冻结。
递归使用轻量 ref 节点而不是 JavaScript 对象环，因此 AST 自身可以有界遍历和确定性编译。

Schema 输出类型限制为 JSON-compatible readonly scalar、array 与 object，并公开最小
`JsonSchema202012` 根类型供调用方传给 Provider。它不携带 validator 实例、缓存或 AST 反向引用。

## Error Handling

`ContractDefinitionError` 表示调用方提供了无效 Contract，其顶层 code 固定为
`INVALID_CONTRACT_DEFINITION`，细分 reason code 用于区分 constraint、duplicate definition、
dangling reference 和 unguarded recursion。builder 能确定的错误在构造时抛出，其余在消费 API
预检时抛出。

`ContractValidationError` 表示输入未通过合法 Contract，顶层 code 固定为
`CONTRACT_VALIDATION_FAILED`。`safeParse` 对相同数据错误不抛异常。内存不足、恶意 Proxy/getter 抛错
等非 JSON 运行时异常不伪装成普通 validation issue。

## Testing Strategy

### 类型与 AST

- 使用类型等价断言和 `@ts-expect-error` 覆盖 primitive、required/optional、nullable、readonly
  array/record、union、discriminated union 及递归固定点推导。（`req-1-1`、`req-1-2`）
- 修改传入 shape/branches/options 和强制修改已返回节点，断言解析及 Schema 字符串不变；确认公共入口
  不导出被禁止的规则 API。（`req-1-3`、`req-1-4`）

### Parser 与错误

- 覆盖合法值深复制、原输入不变、额外/缺失字段、动态 record、所有约束和禁止隐式规范化。
  （`req-2-1` 至 `req-2-4`）
- 覆盖 union 分支顺序、discriminator 选择、有限递归、重复名称、泄漏 self 形成的悬空引用、未受保护
  递归、循环输入和第 65 层输入。（`req-3-1` 至 `req-3-5`）
- 对同一失败输入重复调用两种解析 API，断言 code/path/message/order 一致；制造超过 50 个错误并断言
  截断标记。（`req-4-1` 至 `req-4-5`）

### Schema 与独立 oracle

- 对每类节点和组合结构做精确 Schema fixture；重复编译并比较对象与 `JSON.stringify`，再修改返回值后
  重新编译确认隔离。（`req-5-1` 至 `req-5-3`）
- 测试中使用 Ajv 2020-12 编译派生 Schema，对只包含 JSON 值的合法/非法 fixture 与自研解释器做
  接受/拒绝交叉验证；Ajv 不进入 `src/` 或生产 dependencies。（`req-5-4`、`req-6-2`）

### 边界与回归

- 运行 contracts 测试、`npx tsc --noEmit`、全部现有 packages 测试、
  `npm run check:dependencies` 和 `git diff --check`。
- 依赖测试断言 `contracts` 无 LazyGoal 内部出站边；现有 Agent/Runtime/Storage schema 与入口不改，
  用全量回归证明工作流和持久化行为无变化。（`req-6-1`、`req-6-3`、`req-6-4`）

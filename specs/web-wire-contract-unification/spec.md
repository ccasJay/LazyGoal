---
status: proposed
created_at: 2026-10-28
supersedes: []
superseded_by: null
---

# Web 传输契约统一 Spec

## 目标与范围

`packages/web-contracts` 目前用 10 个 DTO 文件、约 3,800 行手写类型描述浏览器与本地后端之间的传输协议，并在 1,563 行的 `validation.ts` 中维护 48 个出站 guard；`packages/browser/src/browser-goal-routes.ts` 又用 11 个 parser 覆盖 12 条写入路由，各自维护字段白名单、长度限制和跨字段判断。同一字段的存在性、类型、枚举、长度与未知键策略因此分散在类型、出站 guard 和入站 parser 三处，`queueBinding`、`planRoute`、Activity gap、交互决定等不变量也只在某一侧成立。

本 Spec 把全部 Web wire DTO 收敛为 `@lazygoal/contracts` 的不可变 Contract AST：每个 DTO 只声明一次结构，公开 TypeScript 类型由 `InferContract` 派生；出站 guard 与入站命令 parser 都消费同一份 Contract。出站保留现有宽松对象语义：当前 guard 接受未知字段的层级继续接受，只有当前明确执行白名单的层级保持严格；入站命令始终使用严格对象。结构解析之后，跨字段规则由命名、纯函数式的显式不变量执行，不引入 Contract 回调或隐藏转换。

明确不包含：

- HTTP 传输层：`Content-Type`、请求体字节上限、UTF-8 解码、JSON 语法错误和 HTTP 状态映射继续由 `packages/browser` 负责。
- Runtime 的受理、去重、队列、审批、恢复与 `queueBinding` 状态核对语义；parser 只校验 wire 形状与 wire 级关系。
- Goal Snapshot、Trajectory、模型输入或任何持久化 Schema 的格式、版本与迁移。
- Goal Board 的 UI、数据流、投影合并或用户可见文案；`specs/unified-sse` 拥有的 SSE 传输分帧与重连也不在本 Spec 内。
- Provider 凭据的存储、掩码、在线模型拉取与 `packages/config` 的档案校验规则。
- Tool Input Contract、模型输出 Contract、Prompt Bundle、Provider strict Schema；本 Spec 只新增 `unknown`/`openObject` 并禁止它们进入这些可移植结构。
- 为旧开发期输入摘要、旧命令默认值或旧客户端保留兼容分支；开发期持久化数据可按仓库策略丢弃。
- 把 Contract AST、`ContractIssue` 或 JSON Schema 暴露给浏览器；浏览器只看到现有 DTO 与稳定错误码。
- 新增业务能力、路由、字段、错误码或状态转换。

### 当前重复清单

| 重复项 | 位置 | 说明 |
| --- | --- | --- |
| DTO 类型与出站 guard | `packages/web-contracts/src/*.ts`、`validation.ts` | 字段表在 interface/type 与 `is*` 中各写一遍；48 个 guard 中只有 `isBrowserGoalSessionState` 与 `isBrowserActivityPage` 在部分层级执行白名单。 |
| 入站命令与 parser | `packages/web-contracts/src/command.ts`、`session-input.ts`、`provider-settings.ts`、`packages/browser/src/browser-goal-routes.ts` | 11 个 body parser 覆盖 12 条写入路由，各自维护 exact-key、长度、非空白、安全整数与 kind 相关规则。 |
| 跨字段不变量 | `validation.ts`、`browser-goal-routes.ts` | `planRoute` 状态/游标、Activity gap/range、交互决定、`respond.requestId`、`queue_control.remove` 等规则没有统一归属。 |
| 开放 JSON 载荷 | `trajectory.ts`、`session-input.ts`、`session.ts` | `unknown`、索引签名与 `isJsonValue` 混用，无法从单一 Contract 派生。 |

## 需求与验收标准

### 需求 1：扩展 Contract AST 的开放 JSON 与开放对象能力

作为契约维护者，我希望通用 Contract AST 能表达“任意 JSON”和“保留未知字段的开放对象”，以便出站宽松语义也来自同一份结构定义。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当 `contract.unknown()` 解析值时，必须接受任意 JSON 值并返回与输入引用隔离的深复制；必须拒绝 `undefined`、函数、Symbol、BigInt、`NaN`/`Infinity`、类实例、非字符串键对象和循环引用。`InferContract` 必须推导为 `unknown`。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当 `unknown` 编译为 JSON Schema 时，根输出除独立文档所需的 `$schema` 外必须是空 Schema `{}`；不得添加额外约束或改变既有节点 Schema。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：当 `contract.openObject(shape)` 解析对象时，必须校验所有声明字段，接受并保留额外 JSON 字段，返回与输入引用隔离的深复制；额外字段的复制必须安全处理 `__proto__` 等键，不得修改原型。`InferContract` 必须只包含声明字段，不添加索引签名。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：当 `openObject` 编译为 JSON Schema 时，必须输出 `additionalProperties: true`；严格 `object` 必须继续输出 `additionalProperties: false`。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：当定义检查遇到非法 `openObject` shape、非法 optional 位置或悬空递归引用时，必须拒绝；现有严格 `object`、递归、联合与 `InferContract` 的解析、Schema 与类型行为不得改变。
- <a id="spec-req-1-6"></a>**验收标准 1.6**：当模型输出 wire 推导遇到 `unknown` 或 `openObject` 时，系统必须明确拒绝；Tool Input Contract 不得声明这两类节点，并由 Tool 注册测试或静态检查守护。它们只用于受信任的 Web wire 投影或显式开放 JSON 载荷，不得进入需要可移植严格 Schema 的模型/工具契约。

### 需求 2：每个 wire DTO 只有一个结构定义

作为 Web 前后端维护者，我希望每个传输 DTO 只声明一次字段结构，以便类型、出站校验和入站解析不会独立演化。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当本 Spec 完成时，每个现有 Web wire DTO 必须由 `packages/web-contracts/src/contracts/` 中唯一的 Contract AST 节点声明，公开 TypeScript 类型必须由 `InferContract` 派生；不得保留手写 interface/type 字段表作为第二份结构定义。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：当两个 DTO 共享嵌套结构时，系统必须复用同一嵌套 Contract；不得在多个 DTO 中复制字段表或仅改字段名后重复声明。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：当模块加载或测试导入 Contract 时，系统必须通过 `compileJsonSchema` 或等价定义检查拒绝非法 Contract 图；非法定义不得延迟到请求或 SSE 事件到达时才失败。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：当现有调用方导入 DTO 类型、guard 或 parser 时，公开名称与模块入口必须保持可用；不得要求调用方改用新名称或兼容 wrapper。
- <a id="spec-req-2-5"></a>**验收标准 2.5**：当为 DTO 选择对象开放策略时，系统必须遵循：入站命令使用严格 `object`；出站对象按现有 guard 的未知字段行为选择 `openObject` 或 `object`；明确声明的开放 JSON 由 `contract.unknown()` 承载并由 JSON 值不变量判定，`openObject` 的额外字段同样按 JSON 值校验。
- <a id="spec-req-2-6"></a>**验收标准 2.6**：当类型由 `InferContract` 派生时，可选字段必须表示为 `?: T` 而非显式 `T | undefined`；声明为 `unknown` 的开放 JSON 字段必须继续推导为 `unknown`；开放对象类型只暴露声明字段；结果类型中声明的错误码联合必须保持精确。

### 需求 3：出站 guard 使用共享 Contract 并保留宽松对象语义

作为浏览器端消费者，我希望现有成功响应与 SSE 事件继续被接受，同时 guard 不再维护第二套字段表。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当出站 guard 收到未知值时，系统必须使用对应 Contract 的 `safeParse` 结果和显式不变量判定；不得再手写字段存在性、类型、枚举或范围检查。UTF-16 文本上限是唯一例外，按 3.6 由共享不变量谓词承担。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：当现有出站 guard 接受未知字段时，对应 Contract 必须使用开放对象语义接受并保留这些字段；迁移不得因未知字段拒绝原本可接受的响应。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：当现有出站 guard 在某一层执行字段白名单时，对应 Contract 必须在该层使用严格对象拒绝未知字段；至少覆盖 `isBrowserGoalSessionState` 的顶层与 `currentRunTerminalDetail`，以及 `isBrowserActivityPage` 的既有白名单层级。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：当出站 DTO 声明字段时，Contract 必须校验该字段的类型与已声明约束；不得继续忽略声明字段。该要求会使部分此前只做浅检查的字段首次被完整校验，并会拒绝 `String(value)` 强转枚举、`NaN`/`Infinity`、非安全整数与未声明错误码。
- <a id="spec-req-3-5"></a>**验收标准 3.5**：当出站 DTO 存在跨字段不变量时，guard 必须在结构解析后执行命名不变量；至少保留 Plan Route 的状态/游标/修订理由/阶段身份/`acceptedSequence`，Activity 的 gap/range/limit/顺序/`contentLength`、lookup/stageTarget/tool 条件字段与消息 `purpose`/`previewId` 规则，交互决定的 kind 子集与 `requestId`/`actionId` 互斥，`currentRunTerminalDetail` 仅失败 Run，SSE 事件 kind 专属字段，以及 Trajectory 详情的 `eventType`/`payload.type`/`phase`/`eventSchemaVersion`。
- <a id="spec-req-3-6"></a>**验收标准 3.6**：当现有 wire 文本上限按 UTF-16 code unit 计时，guard 必须保留该上限；Contract 的 `maxLength` 按 Unicode code point 计时，不得因此放宽 Activity、SSE、Trajectory 或命令文本的既有上限。该上限的唯一实现是 `packages/web-contracts/src/invariants/` 导出的 `hasUtf16LengthAtMost(value, max)`；每个上限数值只在拥有该字段的合同或不变量处出现一次，不建立跨字段长度表，也不为此新增 AST 节点。`model_started.occurredAt` 的有效时间检查与 Activity 的动态 `limit` 关系必须保留。
- <a id="spec-req-3-7"></a>**验收标准 3.7**：当出站 guard 成功时，必须返回对应 DTO 的类型谓词；失败时返回 `false`。guard 不得抛出 Contract 诊断、修改输入或把解析后的深复制返回给调用方。
- <a id="spec-req-3-8"></a>**验收标准 3.8**：当 `isProviderProfile` 或任何包含 Provider 档案投影的 guard 收到含 `apiKey` 字段的对象时，必须继续拒绝；开放对象语义不得使明文凭据字段通过。该禁用键检查必须由共享不变量完成，并应用于 `isProviderSettings`、写入/删除/激活结果中的嵌套档案。
- <a id="spec-req-3-9"></a>**验收标准 3.9**：当开放对象携带额外字段时，额外字段必须是 JSON 值；函数、`undefined`、Symbol、类实例或循环引用不得通过开放对象进入解析结果。

### 需求 4：入站命令 parser 使用严格 Contract

作为本地后端维护者，我希望所有浏览器写入命令先经过同一份严格结构校验，以便非法字段不会进入 Runtime。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：当 browser route 收到 JSON body 时，必须在传输校验后使用 `packages/web-contracts` 的命令 Contract 与显式关系检查解析；parser 可以保留在 `packages/browser`，但不得在 route 内继续手写字段白名单、类型或长度检查。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：当命令 body 包含未声明字段时，parser 必须拒绝；所有入站命令对象必须使用严格对象，不得使用开放对象。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：当命令字段具有 wire ID、长度、非空白、安全整数、枚举或 JSON 值约束时，parser 必须按现有边界拒绝非法值，并保留现有 `isWireId`、`isWireActionIdentity` 与 UTF-16 上限语义。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：当命令存在 kind 相关或跨字段规则时，parser 必须在结构解析后执行显式关系检查；至少覆盖 `respond.requestId` 按 `response.kind` 选择普通身份或 Action 身份、`queue_control.remove` 必须且仅允许携带 `messageId`、`steer.queueBinding` 的嵌套身份、`resume.content` 的可选存在、Provider 档案可空字段、Action Review 的 `input`/`scope`，以及 Grant Revoke 的 body 与路径身份组合。
- <a id="spec-req-4-5"></a>**验收标准 4.5**：当 parser 成功时，必须返回现有 command DTO；不得 trim、coerce 或 default 用户文本。`approve_action`/`approve_action_revision` 不得再注入 `scope: "action"` 默认值；`apiKey: null` 与 `scope: null` 必须按 DTO 拒绝；Provider 已声明的 `baseURL`/token/模式 `null` 必须保留，由下游继续解释为清空。
- <a id="spec-req-4-6"></a>**验收标准 4.6**：当同一 wire body 被解析两次时，系统必须产生相同 command，并使 `computeSessionInputDigest` 得到相同摘要；不得因迁移引入依赖调用顺序或对象身份的摘要差异。
- <a id="spec-req-4-7"></a>**验收标准 4.7**：当 parser 失败时，browser 必须返回该路由现有的错误码与 HTTP 状态；不得把 `ContractIssue` 的 message、path 或原始 body 写入响应。
- <a id="spec-req-4-8"></a>**验收标准 4.8**：当 parser 成功时，Runtime 的受理、去重、队列修订、`queueBinding` 状态核对、审批与恢复语义必须保持不变；parser 只负责 wire 结构与 wire 级关系。

### 需求 5：迁移完整性、依赖、Bundle 与验证

作为维护者，我希望迁移完成后没有平行实现，并能用现有测试与新增负例证明行为边界。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：当本 Spec 完成时，48 个现有 guard 必须保留导出；其中 46 个 DTO/枚举/JSON guard 必须由 Contract 与显式不变量实现。`isRecord` 必须保留公开名，且不得新增第二份通用实现；其共享实现归属 `specs/shared-json-primitives`，该实现可用时 `web-contracts` 必须转发。`isNonEmptyString` 可保留为本地通用原语。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：当本 Spec 完成时，`validation.ts` 与 `browser-goal-routes.ts` 中不得保留第二套 DTO 字段表；所有入站 body parser 必须由共享命令 Contract 驱动。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：当运行测试时，必须覆盖每个 DTO 的合法/非法 fixture、开放/严格层级、全部显式不变量、全部命令 parser 规则、服务端投影与 SSE 事件的 guard 集成、`InferContract` 类型推导，以及现有 Runtime/Browser/Goal Board 回归。
- <a id="spec-req-5-4"></a>**验收标准 5.4**：当运行 `npm run check:dependencies` 时，本 Spec 新增的依赖方向只能是 `packages/web-contracts` 到 `packages/contracts`；其它 Spec 拥有的允许边不由此处重复定义。不得出现循环或从 `contracts` 反向依赖业务包。
- <a id="spec-req-5-5"></a>**验收标准 5.5**：当运行 `npm run build:web` 时，Goal Board 初始 JS 的 gzip 体积相对迁移前基线增加不得超过 10 KiB；必须记录原始与 gzip 数值。不得在每次请求/SSE 事件上编译 JSON Schema，也不得把 Contract AST 或 Schema 暴露给浏览器。若超出预算，必须先优化合同入口与 tree-shaking，不得通过删除 guard 或放宽校验换取体积。
- <a id="spec-req-5-6"></a>**验收标准 5.6**：当运行 `npm run check:docs` 时，`packages/contracts`、`packages/web-contracts`、`packages/browser` 与 Goal Board 的模块说明/语义表必须反映 Contract 单一来源、`unknown`/`openObject` 边界、出站开放对象策略、严格入站 parser 与不变量归属。
- <a id="spec-req-5-7"></a>**验收标准 5.7**：当本 Spec 完成时，持久化 Schema、协议版本、Runtime admission、Tool Input Contract、模型输出 Contract 与 Goal Board UI 行为不得改变；本 Spec 明确列出的校验收紧除外。

## 架构与核心决策

### 系统拓扑与接口

```text
packages/contracts
  contract.object(shape)       严格对象，拒绝未知字段（既有）
  contract.unknown()           任意 JSON 值，深复制（新增）
  contract.openObject(shape)   开放对象，校验声明字段并保留额外 JSON（新增）

packages/web-contracts/src/
  contracts/                   每个 DTO 的唯一 Contract AST 与字段语义
  invariants/                  出站跨字段不变量（planRoute、Activity、交互、SSE、Trajectory）
  validation.ts                48 个公开 guard：safeParse + 不变量
  command.ts / session-input.ts / ...  公开命令类型与命令 Contract
  session.ts / activity.ts / ...  公开类型别名：InferContract<typeof contract>

packages/browser/src/browser-goal-routes.ts
  readJsonBody（传输）
    -> safeParse(commandContract) + 关系检查 + 路径身份组合
      -> Runtime command

apps/goal-board
  is* guard（出站）
    -> 现有 DTO 类型
```

`packages/web-contracts` 只新增对 `packages/contracts` 的单向依赖；`packages/contracts` 保持零出站依赖与浏览器可用。Goal Board 继续只依赖 `web-contracts`，不直接导入 Contract AST 或 JSON Schema。Browser route 继续拥有传输、路径参数与 HTTP 错误映射，但不拥有 body 字段表。

### 结构解析与关系检查分层

所有校验遵循同一顺序：

1. **传输**：Content-Type、字节上限、UTF-8 解码、JSON 解析（仅入站）。
2. **结构**：`safeParse(contract, value)` 校验字段存在性、类型、枚举、范围、数组上限与对象开放/严格策略。
3. **关系**：命名纯函数检查跨字段不变量；输入是已解析的只读数据，不读取原始对象（`isProviderProfile` 的 `apiKey` 禁用键除外）。
4. **消费**：出站 guard 返回布尔类型谓词；入站 parser 返回现有 command DTO。没有第二个消费者再解析原始 JSON。

不变量函数不进入 Contract AST，不参与 JSON Schema 编译，也不执行 trim、coerce、default 或副作用。这样既保留 `planRoute`、Activity gap、交互决定等无法用 JSON Schema 表达的关系，又不把领域规则塞进通用 DSL。

### 深度预算与开放 JSON

`packages/contracts` 的 `safeParse` 对合同结构遍历设有 `MAX_DEPTH = 64`，超过时报告 `max_depth_exceeded`。该预算约束的是合同结构，不是 wire 载荷；迁移前后必须保持以下分配：

| 场景 | 归属 | 迁移后行为 |
| --- | --- | --- |
| 合同嵌套超过 64 层 | Contract 结构预算 | 继续以 `max_depth_exceeded` 失败；合法 DTO 远低于该上限 |
| `unknown` 字段承载的 JSON 载荷 | 独立 JSON 遍历 | 不消耗结构预算，深度不受 64 限制，与迁移前手写 guard 的接受范围一致；循环引用、`undefined`、函数、Symbol、BigInt、非有限数与类实例失败 |
| `openObject` 的额外字段 | 独立 JSON 遍历 | 同上，额外字段按 JSON 值校验后保留 |

因此 wire 的开放 JSON 字段一律使用 `contract.unknown()` 承载，并在需要布尔判定处复用 `isJsonValue` 不变量的同一实现；不得把 `BrowserJsonValue` 写成会消耗结构预算的递归合同，否则深度超过 64 的合法载荷会从“可接受”变为“拒绝”，构成未声明的收紧。`isJsonValue` 自身也不得递归到宿主栈上限，必须使用显式栈或等价的有界遍历。

### 出站宽松与严格层级

出站 Contract 的对象开放策略以现有 guard 的实际行为为准：

| 层级 | 策略 |
| --- | --- |
| 当前 guard 忽略未知字段的对象 | `contract.openObject(shape)`：校验声明字段，接受并保留额外 JSON 字段。 |
| 当前 guard 执行 `Object.keys` 白名单的对象 | `contract.object(shape)`：拒绝未知字段。 |
| 明确声明的开放 JSON 载荷 | `contract.unknown()` 承载，`isJsonValue` 不变量判定；`openObject` 的额外字段同样按 JSON 值校验（见“深度预算与开放 JSON”）。 |
| 入站命令对象 | 始终 `contract.object(shape)`。 |

严格层级至少包括 `isBrowserGoalSessionState` 的顶层与 `currentRunTerminalDetail`，以及 `isBrowserActivityPage` 的顶层、`runs[].terminalDetail`、`gaps[]`、message/fact/think 项、嵌套 `think`、tool state 与 lifecycle entry。其余出站对象使用 `openObject`。Provider 档案使用 `openObject` 加共享的 `!("apiKey" in value)` 不变量；所有包含档案投影的 guard 必须复用该不变量，而不是只在顶层 `isProviderProfile` 检查。

“保留宽松”指未知字段接受与保留；已声明字段仍会按 DTO 类型与现有显式约束校验。迁移后以下情况会比现有 guard 更严格，属于本 Spec 的明确行为变化：

- 此前被 guard 忽略的声明字段现在会被校验，例如 `BrowserSessionStep.runId`、`BrowserActionReview.capability`、`availableScopes` 元素、Activity stage/action 元素。
- `isJsonValue` 现在只接受 JSON 标量、数组与普通对象；`Date`、`Map`、`Set` 与类实例不再被当作空对象接受。
- 可选字段显式传 `undefined` 不再被接受；调用方必须省略字段。该变化对出站 guard 与入站 parser 同时生效。
- 枚举使用严格相等，不再接受 `String(value)` 强转后的值。
- `number` 字段拒绝 `NaN`/`Infinity`；`integer` 字段拒绝非安全整数。
- 结果类型中声明的错误码联合会被校验；此前接受任意字符串的 guard 会拒绝未声明错误码。
- `isModelSelectionAccepted` 会按 DTO 要求校验 `goalId`/`runId`，不再只校验 `modelId`/`defaultModelSaved`。
- 开放对象的额外字段必须是 JSON 值；非 JSON 额外值不再被静默忽略。

### 入站严格解析与行为变化

入站命令一律使用严格对象，保留现有 exact-key 白名单、wire ID、长度、非空白、安全整数与枚举约束。Contract 不提供 trim/coerce/default，因此：

- `approve_action`/`approve_action_revision` 的 `scope` 保持可选，parser 不再注入 `"action"`；Runtime 已将缺省视为单次放行。省略 `scope` 的同一 wire body 会得到与旧版不同的 command 摘要，但同一新版输入重复解析仍稳定。
- `apiKey: null` 与 `scope: null` 不再被接受，因为 DTO 未声明 `null`；调用方应省略字段或发送声明值。
- Provider 档案的 `baseURL`、`contextWindowTokens`、`maxOutputTokens`、`structuredOutputMode` 在 DTO 中已声明 `null`，Contract 保留 `null`；`apps/goal-server` 现有映射继续把 `null` 解释为清空/省略。
- 用户正文、意图、理由与 Provider 文本按原值保留；空白判断通过 Contract pattern 完成，不修改字符串。

### 公开类型与文档

现有 DTO 模块文件保留为公开入口，但类型改为 `InferContract<typeof contract>` 别名；字段语义移到 Contract 声明处的 TSDoc。公开类型别名继续保留契约级 TSDoc 与 `@example`。可选字段由 `contract.optional` 推导为 `?: T`，不再显式包含 `| undefined`；调用方必须省略字段而不是传 `undefined`。声明为开放 JSON 的 `unknown` 字段继续使用 `unknown`，不收敛为 `BrowserJsonValue`。

### 关联 Spec 边界

- `specs/contract-dsl-core` 拥有 Contract AST、Parser 与 JSON Schema 编译器；本 Spec 只新增 `unknown` 与 `openObject`，不改变严格 `object`、递归、联合或 `InferContract` 的既有语义。
- `specs/tool-input-contracts` 已建立“结构由 Contract、语义由 Tool 校验”的先例；本 Spec 将该模式用于 Web wire，不修改 Tool Input Contract，也不允许 Tool 输入使用 `unknown`/`openObject`。
- `specs/goal-board-backend-validation` 与 `specs/web-backend-separation` 拥有浏览器/后端边界行为：非法输入不得推进 Runtime，前端只依赖公开契约。本 Spec 保持这些需求，只收敛其实现。
- `specs/shared-json-primitives` 拥有 `contracts` 的 canonical JSON、共享 `isRecord` 与 `deepFreeze`，并引用本 Spec 拥有的 `web-contracts → contracts` 依赖边与 10 KiB gzip Bundle 预算。本 Spec 是该边与预算的所有者；`shared-json-primitives` 只复用，不重复定义。`isRecord` 的共享实现由该 Spec 接管，本 Spec 只保留公开导出且不新增第二份实现。两份 Spec 会在 `packages/contracts` 的类型/入口/文档与 `validation.ts` 上产生机械冲突，后落地者 rebase。
- `specs/unified-sse` 拥有 SSE 服务端写出与客户端分帧；它只调用 `isLiveEvent`/`isMetricsSnapshot` 的既有名称与签名。本 Spec 对这两个 guard 的接受范围变化（声明字段完整校验、严格枚举、UTF-16 上限）由需求 3 显式记录，不借 SSE 传输改动放宽。
- `specs/model-output-contracts` 拥有模型输出 wire 的可移植 Schema；本 Spec 在需求 1.6 明确拒绝 `unknown`/`openObject` 进入该推导。
- `specs/dependency-checker-ast-parser` 只替换依赖检查器的模块引用提取层，不拥有允许清单；本 Spec 的 `web-contracts → contracts` 边仍由 `check-dependencies.mjs` 的允许清单承载。
- 当前工作树的 `specs/storage-write-primitives` 与 `specs/web-content-hardening` 不涉及 Web wire DTO；本 Spec 可独立实现和验证，不依赖其它未交付产物。

### 核心决策

- **Contract AST 作为唯一结构事实源**：每个 DTO 的字段、必填性、枚举、范围与开放策略只写一次；类型、出站 guard、入站 parser 与 JSON Schema 都从同一 AST 派生。手写 interface 与 guard 字段检查在完成时删除。
- **新增 `contract.unknown` 与 `contract.openObject`**：`unknown` 表达任意 JSON 并保留 `unknown` 类型；`openObject` 校验声明字段、接受并保留额外 JSON、类型只暴露声明字段。这样出站宽松语义与开放 payload 都不需要退回 `record` 或手写 guard。
- **结构解析与关系检查分离**：Contract 只承担可序列化结构；`planRoute`、Activity gap、交互决定、`respond.requestId`、`queue_control.remove` 等关系由命名不变量执行。这样不扩展 DSL 的 `refine` 回调，也不把领域规则编译进 JSON Schema。
- **出站保留宽松、入站严格**：出站按现有 guard 的开放/严格层级选择 `openObject` 或 `object`，避免破坏已接受的响应；入站统一严格对象，确保浏览器写入不能携带未声明字段。
- **命令 parser 留在 `packages/browser`，但由共享合同驱动**：parser 只做 `safeParse(commandContract)`、显式关系检查、路径身份组合与 HTTP 错误映射；字段表与命令类型由 `web-contracts` 拥有。这样 route 不再复制形状，同时保留传输/路径/状态码归属，避免把 HTTP 语义搬进 DTO 包。
- **入站不做隐式归一化**：删除 `scope` 默认与 `apiKey:null` 接受；Provider 已声明的 `null` 保留。命令类型即 wire 形状，摘要稳定且无隐藏转换。
- **公开 API 保持名称稳定**：48 个 guard、现有 DTO 类型名与模块入口继续可用；不新增兼容 wrapper，不把 Contract AST 暴露给浏览器。
- **Bundle 预算约束**：Contract AST 与全部 DTO 合同进入 Goal Board 后，初始 JS gzip 相对基线增加不得超过 10 KiB；合同在模块加载时冻结，不在请求/SSE 事件上编译 Schema。

## 曾考虑的备选方案

- **只迁移入站命令，出站保留手写 guard**：实现风险最小，能先收紧浏览器写入。**落选原因**：出站 DTO 仍有两套结构定义，`planRoute`、Activity gap 等不变量继续散落，无法达到本 Spec 的单形状目标。
- **出站也改为严格对象，拒绝未知字段**：实现最简单，所有 DTO 使用同一严格策略。**落选原因**：用户明确选择保留出站宽松；严格化会改变现有响应与 SSE 事件的接受行为，并可能让旧服务端字段导致浏览器拒绝合法响应。
- **用 `record(JsonValue)` 表示所有开放对象**：无需新增 `openObject`。**落选原因**：会丢失声明字段的类型、必填性与约束，DTO 类型退化为动态字典，无法作为单一形状事实源。
- **让 `openObject` 忽略并丢弃额外字段**：解析结果更干净，类型与运行时更一致。**落选原因**：会静默丢失现有开放 payload 的字段；保留额外 JSON 更符合“宽松”语义，也让需要动态字段的调用方仍能读取原值。
- **只增加递归 JSON Contract，不增加 `unknown`**：可表达任意 JSON，无需新节点。**落选原因**：`InferContract` 会得到 `JsonValue` 而不是现有 DTO 的 `unknown`，扩大类型迁移面；`unknown` 节点能保持现有字段类型并明确拒绝非 JSON 值。
- **为 Contract AST 增加 `refine`/`transform` 回调**：可把跨字段规则写进 Contract。**落选原因**：AST 将不再可序列化、不可确定性编译为 JSON Schema，且会把领域状态与执行逻辑带入通用契约包。
- **保留入站 parser 的隐式归一化**：可保持旧 command 摘要与 `scope` 默认。**落选原因**：需要在严格 wire 形状之外增加归一化阶段，命令类型与 wire 形状不再一致，并重新引入隐藏转换。
- **用 Zod/TypeBox/JSON Schema 作为唯一来源**：生态成熟，可直接生成类型与校验。**落选原因**：仓库已有 `@lazygoal/contracts` 并被 Tool Input Contract 使用；引入第二套 Schema 体系会扩大依赖与迁移面，且无法复用现有递归、严格对象和类型推导。
- **把 parser 移到 `packages/web-contracts`**：可让命令解析完全集中在 DTO 包。**落选原因**：HTTP 错误码、路径身份与 `readJsonBody` 顺序仍属于 browser；移动 parser 会扩大 `web-contracts` 公共 API 与浏览器 Bundle，却仍需要 route 做错误映射。保留 parser 在 browser、只让形状与关系来自共享合同，能以更小改动达到单一形状。

## 风险与否定性保证

- **风险评估**：高。改动覆盖浏览器全部出站响应/SSE 接受面、全部入站命令解析、公开 DTO 类型与 Contract 基础包；虽然不改变持久化 Schema 或 Runtime 状态机，但校验边界变宽或变窄都会直接影响浏览器能否读取状态、能否提交命令。主要风险是出站声明字段收紧导致合法投影被拒、开放对象保留额外字段后消费者误用未声明数据、`unknown` 接受深层 JSON 带来解析成本、入站关系规则遗漏导致非法命令进入 Runtime、`InferContract` 可选字段语义造成类型迁移遗漏，以及 Bundle 超出 10 KiB 预算。
- **关键操作**：不得在迁移中放宽任何入站命令校验；不得把 `openObject`/`unknown` 用于入站命令、Tool 输入或模型输出 wire；不得在测试、日志或错误响应中写入原始命令、ContractIssue 详情或未过滤的 payload；不得改变 Runtime 受理、队列、审批或恢复顺序；不得升级持久化协议版本。
- **缓解措施**：按 DTO 分组迁移并保持每阶段可编译、可测试；为每个 guard 保留现有合法/非法 fixture，新增未知字段、声明字段与不变量负例；对服务端投影与 SSE 事件增加“生产值通过对应 guard”的集成测试；对每个命令 parser 增加 exact-key、边界与 kind 相关负例；用类型断言覆盖 `InferContract` 与公开导出；记录 Goal Board 原始与 gzip 体积；运行 `npm run check:dependencies`、`npm run check:docs`、`npx tsc --noEmit`、`npm run build:web` 与全量 `npm test`。
- **否定性保证（Invariants）**：
  - 入站命令永不绕过严格 Contract 解析与关系检查进入 Runtime。
  - 封闭 DTO 永不接受未声明字段；`openObject`/`unknown` 永不用于入站命令、Tool 输入或模型输出 wire。
  - 开放对象永不跳过声明字段校验；额外字段只作为 JSON 数据保留，不进入 DTO 类型收窄。
  - 现有跨字段不变量永不丢失：Plan Route、Activity gap/range/limit/order、交互决定、`currentRunTerminalDetail` 仅失败 Run、SSE kind 专属字段、Trajectory 详情身份。
  - 迁移完成后永不在类型、guard 或 parser 中保留第二套 DTO 字段表。
  - 永不对用户文本执行 trim、coerce 或 default；永不把 `ContractIssue` 或原始 payload 暴露到 wire。
  - 永不改变持久化 Schema、协议版本、Runtime admission、Tool Input Contract、模型输出 Contract 或 Goal Board UI 行为；本 Spec 明确列出的校验收紧除外。
  - Goal Board 初始 JS gzip 增加永不超 10 KiB；永不在请求/SSE 事件上编译 Schema 或把 Contract AST 暴露给浏览器。

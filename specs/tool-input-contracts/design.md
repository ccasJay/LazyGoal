# Tool Input Contracts 设计

## 审批摘要

### 方案

使用泛型 `Tool<C>` 将 Input Contract、语义校验和已解析输入的执行绑定在一起；`createToolRegistration` 把具体输入类型安全地封装为 Registry 可保存的动态绑定，并在每次 Action 尝试中生成不持久化的 `PreparedToolAction`。Agent 只把 Contract 编译后的 JSON Schema 投影给模型，不暴露 AST。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 泛型 Tool 契约与 Registry 类型擦除 | Tool 实现使用 `InferContract<C>` 获得精确输入；`createToolRegistration` 将不同 `C` 封装为统一动态绑定 | Registry 不暴露可接收任意 JSON 的 `validate/execute`；组合根显式注册 Tool |
| PreparedToolAction 保留单次解析结果 | 用瞬时对象携带隔离后的 Action、Tool 与类型安全执行函数 | 自动执行不重复解析；非法输入在 `decision_received` 前失败；审批、重启或重放后重新验证 |
| 结构校验与语义校验分层 | Contract 负责 JSON 形状；Tool `validate` 只处理跨字段和环境规则 | 删除手写 `parseInput`，保留现有安全与领域校验 |
| Agent 投影时编译 JSON Schema | Projector 从 Input Contract 每次生成隔离 Schema，并只省略根 `$schema` 元数据 | View 仍只含 JSON；Prompt 不接收 Runtime 类型或 Contract AST |
| 当前 Tool 使用可移植子集 | 七个现有 Tool 只用 strict object、primitive、optional 和整数范围 | 后续可直接派生 required-nullable 模型 wire Contract |
| 开发期直接替换旧接口 | 删除 `ToolDefinition.inputSchema` 与原始 JSON 版 `Tool.validate/execute` 签名，不提供转换器 | 现有 Tool、benchmark 与测试替身同步迁移；自定义 Tool 需重新编译 |

### 风险与待确认

- 风险：所有组合根和自定义 Registry 都必须改用 `ToolRegistration`；遗漏迁移会在编译期暴露，设计不提供旧 `Tool` 直存兼容路径。
- 风险：结构错误文案将改为由 Contract issue code/path 生成的统一诊断；`INVALID_TOOL_INPUT` 错误码和 Tool 语义错误保持不变。
- 风险：本设计依赖 `contract-dsl-core` 提供的 `Contract`、`InferContract`、`safeParse` 和 `compileJsonSchema`；前置实现变更时必须先核对这些公共契约。
- 待确认：无。

## Overview

本设计不把 Tool 领域规则并入 Contract DSL，而是收敛三个重复的结构表面：手写 JSON Schema、手写 TypeScript input interface 和 `parseInput`。Contract 解析成功后，Runtime 在当前调用栈保留已验证数据，语义校验、Policy、持久化与 Tool 执行共享该结果。（`req-1-1`–`req-3-4`）

迁移只改变开发期 API 和校验实现。Action input 仍为原有 canonical JSON 形状，Tool 的授权、审批、事实事件、Observation、replay policy 与 Snapshot 边界不变。（`req-4-2`、`req-5-1`–`req-6-4`）

## Architecture

```text
AgentDecision.action.input (untrusted JSON)
                    |
                    v
Profile authorization + ToolRegistry lookup
                    |
                    v
ToolRegistration.prepare(input)
  -> safeParse(inputContract)
  -> tool.validate(parsed input)
                    |
                    v
canonical Action -> ToolPolicy
                    |
                    v
PreparedToolAction (transient, typed binding)
          |                         |
 require_approval                 allow
          |                         |
          v                         v
persist waiting Action      persist approved Action
                                    |
                                    v
                         execution closure(parsed input)
```

`PreparedToolAction` 仅存在单次 Runner 调用中。需要用户审批时只持久化其 canonical Action，不持久化 Tool 引用、Contract 或执行函数；批准或恢复后根据已持久化 Action 重建新的 Prepared 对象。

## Key Design Decisions

### 泛型 Tool 契约与 Registry 类型擦除

Runtime 公共契约改为以 Input Contract 为泛型参数：

```ts
export type ToolInputContract = Contract<JsonValue>;

export interface ToolDefinition<C extends ToolInputContract = ToolInputContract> {
    readonly id: string;
    readonly description: string;
    readonly inputContract: C;
}

export interface ToolExecutionRequest<Input extends JsonValue = JsonValue> {
    readonly actionId: string;
    readonly input: Input;
}

export interface Tool<C extends ToolInputContract = ToolInputContract> {
    readonly definition: ToolDefinition<C>;
    readonly replayPolicy: "safe" | "manual";
    validate(input: InferContract<C>): ToolValidationResult;
    execute(
        request: ToolExecutionRequest<InferContract<C>>,
        control?: ExecutionControl,
    ): Promise<ToolObservation>;
}
```

具体 Tool 使用 `Tool<typeof InputContract>`，因此 `validate` 和 `execute` 的 input 由 Contract 推导。动态 Registry 不直接保存泛型 Tool，而是保存以下注册绑定：

```ts
export interface ToolRegistration {
    readonly definition: ToolDefinition;
    readonly replayPolicy: "safe" | "manual";
    prepare(input: JsonValue, control?: ExecutionControl): ToolPreparationResult;
}

export type ToolPreparationResult =
    | {
        readonly ok: true;
        readonly input: JsonValue;
        execute(
            actionId: string,
            control?: ExecutionControl,
        ): Promise<ToolObservation>;
    }
    | Extract<ToolValidationResult, { readonly ok: false }>;

export function createToolRegistration<C extends ToolInputContract>(
    tool: Tool<C>,
): ToolRegistration;
```

`createToolRegistration` 在泛型 `C` 尚可见时先编译一次 Schema 以验证完整 Contract 图，再闭包捕获 Tool，把 Contract 解析、语义校验和类型安全执行组合为 `prepare`。成功结果只公开隔离后的 `JsonValue` 与不再接收 input 的执行闭包；失败结果使用 `ToolValidationResult`。`ToolRegistry.get` 返回 `ToolRegistration`，因此无需把 `Tool<C>` 强制转换成可接收任意 JSON 的 Tool，也没有可绕过 Contract 的动态 `execute`。（`req-1-1`–`req-1-3`）

`InMemoryToolRegistry` 只接收 `ToolRegistration`；现有组合根对每个具体 Tool 调用一次 `createToolRegistration`。Registry 继续拒绝空 ID 与重复 ID。

`resolveAuthorizedToolDefinitions` 复制 `id` 和 `description`，但共享已冻结的 `inputContract` 引用；不对带品牌的 AST 使用 `structuredClone`。

### PreparedToolAction 保留单次解析结果

Runner 调用 `ToolRegistration.prepare` 后构造内部准备结果：

```ts
interface PreparedToolAction {
    readonly registration: ToolRegistration;
    readonly action: ToolCallAction;
    readonly policy: "allow" | "require_approval";
    execute(control?: ExecutionControl): Promise<ToolObservation>;
}
```

`prepare` 依次完成 Contract `safeParse`、Tool `validate` 和执行闭包创建；Runner 随后完成 canonical Action 重建与可选 Policy 评估。`action.input` 引用解析器返回的深复制结果；`execute` 闭包捕获同一结果与具体 Tool 类型，不再从 Action 解析。（`req-2-1`–`req-3-4`）

正常 `tool_call` 在追加 `decision_received` 前完成 `ToolRegistration.prepare`、canonical Action 重建与 Policy 评估，之后的 `action_staged`、pending Action、`tool_started` 和 Tool 调用都使用准备后的 Action。结构或语义失败时只进入现有 execution error 收口，不保存 Action 意图。

自动允许路径在持久化 Action 后继续使用当前 Prepared 对象。审批等待路径丢弃闭包，之后的调用重新准备。`recoverPendingAction` 对 manual Tool 准备后再转为 `outcome_unknown`；对 safe Tool 把 Prepared 对象直接传入 `runLoop` 的首轮，避免同一恢复调用内重复解析。（`req-5-2`）

### 结构校验与语义校验分层

Contract 承载 strict object、字段类型、required/optional 和整数边界。Tool `validate` 改为只接收已解析输入，保留非结构规则：

| Tool | Contract 字段 | Tool 语义规则 |
| --- | --- | --- |
| Bash | `command: string`, `timeoutMs?: integer(1..120000)` | command 非空白且无 NUL |
| Read File | `path: string` | 相对路径、无 NUL/`..`、沙箱边界 |
| Write File | `path: string`, `content: string` | 路径规则、禁止 `.lazygoal` |
| Edit File | `path`, `oldString`, `newString: string` | 路径规则、oldString 非空且不同于 newString |
| Grep | `pattern: string`, `path?: string`, `ignoreCase?: boolean` | pattern 非空白且可编译，path 通过沙箱校验 |
| ALFWorld Reset | strict empty object | 无额外规则 |
| ALFWorld Step | `command: string` | command 非空白 |

Contract 不 trim、coerce 或 default；Tool 语义校验可以用 `trim()` 判断空白，但不得将 trim 后文本传给 Policy、持久化或执行。`validate` 返回结果形状校验、抛错映射和 `ExecutionAbortedError` 传播保持现有 Runner 语义。（`req-2-4`、`req-3-2`、`req-3-3`、`req-5-4`）

### Agent 投影时编译 JSON Schema

`ModelToolDefinition` 继续只包含 `{ id, description, inputSchema }`。`ModelInferenceProjector` 对每个已授权 Tool 调用 `compileJsonSchema(inputContract)`，从新生成的根对象中只省略用于独立 Schema 文档的 `$schema` 元数据，再把其余 JSON 放入 View；不改写字段、约束或顺序。Renderer 和 Nunjucks 模板无需识别 Contract。投影仍按 Tool ID 稳定排序，编译错误在模型调用前原样失败。（`req-1-2`、`req-1-4`、`req-4-3`）

### 当前 Tool 使用可移植子集

本特性只要求七个当前 Tool 避免 record、recursive、开放 object 和供应商不稳定的字符串 pattern。可选字段在 canonical Contract 中继续使用 `optional`；本特性不创建 required-nullable 副本，由后续 `model-output-contracts` 从同一 AST 派生。（`req-4-2`、`req-4-4`）

Runtime 不禁止未来自定义 Tool 使用其他 DSL 节点；Provider 可移植性会在后续模型输出组合时单独 fail-closed，避免把 LLM Provider 能力反向变成 Runtime Tool 注册条件。

### 开发期直接替换旧接口

五个通用 Tool 和两个 ALFWorld Tool 删除私有 input interface 与 `parseInput`，改用 Contract 推导类型。测试中的自定义 Tool、fixture 和组合根直接提供 Contract，并通过 `createToolRegistration` 注册。`isJsonObject` 若无其他生产消费者则随迁移删除；`invalidInput` 仍作为语义失败 helper 保留在 Tools 包内。（`req-4-1`、`req-6-1`、`req-6-2`）

不新增 Schema-to-Contract 适配器，不改 Prompt Bundle、model response 或持久化版本。Runtime、Agent、Tools 和 benchmark 单向依赖 `contracts`，`contracts` 不反向依赖任何业务包。（`req-6-3`、`req-6-4`）

## Error Handling

Contract 数据错误映射为现有 `RunnerExecutionError("INVALID_TOOL_INPUT", message)`。message 由 Tool ID、第一个 `ContractIssue.code` 和 JSON path 确定性组成，不解析 issue message；到达 issue 上限时追加 truncated 标记。Tool 语义校验失败继续使用其现有 `ToolValidationResult` 消息。

Contract 定义错误在 `createToolRegistration` 中通过一次 Schema 编译被拒绝，不伪装成用户输入错误。自定义 Registry 返回无效 registration、Tool `validate` 抛错或返回非法结果时，继续映射为 `TOOL_EXECUTION_ERROR`。中止检查保留在 Contract 解析、语义校验和执行边界之间。

## Testing Strategy

- 用类型断言覆盖七个 Tool 的 `InferContract` 输出、optional 字段和已解析 `validate/execute` 签名；对手写 `inputSchema` 和原始 JSON 签名使用 `@ts-expect-error`。（`req-1-1`–`req-1-3`、`req-6-1`）
- 对每个 Tool Contract 执行合法/非法 fixture 和精确 Schema 快照，覆盖必填、额外字段、类型、整数范围、可选字段、空对象及重复编译稳定性。（`req-1-4`、`req-2-2`、`req-4-1`–`req-4-4`）
- Runtime 用记录型 Tool/Policy 断言结构失败在 Policy、pending Action 和执行前终止，合法输入使用隔离副本，自动路径只解析一次，审批与 safe/manual 恢复每次新尝试重新解析一次。（`req-2-1`–`req-3-4`、`req-5-1`、`req-5-2`）
- 保留现有 Tool 语义、沙箱、Observation、输出截断、重放和中止测试；直接执行测试改为传入已推导输入，非法结构统一在 Runtime/Contract 边界断言。（`req-4-2`、`req-5-3`、`req-5-4`）
- Agent 投影测试断言 Contract AST 不进入 `ModelInferenceView`，相同授权 Tool 产生稳定 Schema 与 Prompt 文本。（`req-4-3`）
- 完成后运行 TypeScript、contracts/tools/runtime/agent 测试、benchmark 类型检与测试、全部 packages 回归、依赖边界检查、Memory 检查与 `git diff --check`。

# Model Output Contracts 设计

## 审批摘要

### 方案

在 `@lazygoal/contracts` 中声明模型输出 canonical Contract，并由请求级
`ModelOutputContractBundle` 按阶段、checkpoint 状态和已授权 Tool Input Contract 派生唯一 wire
Contract。该 Bundle 同时提供 required-nullable wire 校验、确定性 canonical 解码、Provider 共用
JSON Schema 和 prompt-only Shape Guide。Agent 用同一 Bundle 构造请求并解析响应，Runtime 再用共享
canonical Contract 校验可替换 Executor 的返回值。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| Canonical Contract 下沉，Runtime 保留语义所有权 | 跨 Executor 边界的结果形状由 `contracts` 声明并推导类型；Runtime 继续负责 Evidence、授权、阶段和提交规则 | 删除 Agent Zod 与 Runtime 基础手写结构校验，但不把领域状态机移入基础包 |
| 请求级 Bundle 统一派生四种消费表面 | 每次调用根据请求种类和授权 Tool 集合生成 wire Contract、Schema、Shape Guide 与 decoder | 阶段和 checkpoint 不再从渲染后的消息反向推断；无授权 Tool 时结构上不存在 `tool_call` |
| Required-nullable 映射只消除可选占位 | optional 属性在 wire 中变为必填 nullable，decoder 只删除由 optional 派生的 `null` | 合法业务 `null` 原样保留；envelope 与占位值不进入 canonical 数据或持久化层 |
| Provider 共用 Schema 在 Contracts 层一次编译 | 只输出两类 Provider 都支持的根 object、strict object、enum、anyOf、array 和数值边界 | literal 统一派生为单值 enum；不兼容的 Tool Contract 在网络调用前失败，Adapter 不修补 Schema |
| 固定 Adapter 模式控制唯一请求路径 | Adapter 构造时固定 `strict` 或 `prompt_only`；前者携带原生 Schema，后者只注入 Shape Guide | 不存在运行期降级、重试或按模型名猜测；TUI 与 benchmark 对环境变量 fail-fast |
| Shape Guide 随最终控制消息参与预算 | prompt-only 使用同一 Schema 的无空白确定性序列化，并放入最终动态控制消息 | checkpoint 切换不会污染稳定前缀；代价是 prompt-only 每轮承担额外输入 token |
| Runtime 在副作用前重验 canonical 结果 | Coordinator 与 Runner 先用共享 Contract 深复制校验，再执行现有语义 gate | 非 LLM Executor 不能绕过边界；Goal、Trajectory、Snapshot 的状态与提交顺序不变 |

### 风险与待确认

- 风险：实现依赖已批准但尚未执行的 `contract-dsl-core` 与 `tool-input-contracts`；必须按该顺序落地，
  本 Feature 不复制前置能力。
- 风险：动态 Tool 分支会增大 Schema；超过 Provider 的复杂度限制时请求直接失败，不做缩减或模式降级。
- 风险：prompt-only 每轮重复发送 minified Schema，Token 成本高于 strict；这是兼容无原生结构输出模型的显式代价。
- 风险：当前 `structured@1` 与 Prompt Bundle v1 原地更新，旧无 envelope 输出立即失效。
- 待确认：无。

## Overview

本设计把模型输出分为两个边界：wire 是仅面向 LLM 的严格 envelope，canonical 是 Agent 与 Runtime
之间既有的 `PreparationResult` / `AgentDecision`。两者来自同一 Contract 图，但用途不同：wire 为
Provider 可生成性而将缺省字段改为 nullable；canonical 保持当前领域对象的 optional 语义。
（`req-1-1`–`req-2-5`）

模型输出结构进入 `contracts`，不代表 Runtime 状态机下沉。Contracts 只判断 JSON 结构和少量跨
Provider 可表达的约束；阶段准入、Evidence scope、Memory Patch canonicalize、Tool 授权、完成证明与
提交边界继续由 Runtime 决定。（`req-6-1`–`req-6-4`）

## Architecture

```text
canonical Contracts + request kind + authorized Tool Input Contracts
                              |
                              v
                 ModelOutputContractBundle
              /            |             \
     wire Contract     JSON Schema     Shape Guide
              |            |             |
              |       strict mode    prompt_only mode
              |            |             |
              +------------+-------------+
                           LLM
                            |
                     raw JSON content
                            |
             JSON parse -> wire safeParse -> decode
                            |
                 canonical semantic checks
                            |
             PreparationResult / AgentDecision
                            |
        Runtime canonical parse -> existing domain gates
                            |
                 existing commit/state flow
```

请求构建返回内部 `ModelOutputRequestPlan`，同时携带最终 `LLMRequest` 与解析该响应所需的 Bundle。
因此响应不会由一份全局大联合解析，也无需读取最后一条 Prompt 消息来判断 checkpoint。

## Key Design Decisions

### Canonical Contract 下沉，Runtime 保留语义所有权

`packages/contracts/src/model-output/` 新增 canonical 声明，覆盖 `GoalTask`、Context Lookup 请求、
Working Memory Patch 提案、Completion Evidence、Tool Action、`PreparationResult` 与 `AgentDecision`。
公开 TypeScript 类型全部通过 `InferContract` 派生；Runtime 从 `@lazygoal/contracts` 导入并在原入口
重导出兼容名称，现有调用方无需维护第二份 interface。（`req-1-1`–`req-1-3`）

Canonical 层提供总联合和请求专用子联合：gathering、planning、ordinary executing 与 checkpoint。
Agent 请求工厂使用子联合；Runtime 的 Coordinator 和 Runner 分别使用完整 Preparation 与 Agent
Contract 后再执行阶段 gate。Tool Action 的 canonical `input` 使用 JSON value Contract；Fact 的
`value` 单独声明为 scalar 或一维 scalar array，避免开放 JSON 规则泄漏到 Fact。（`req-2-5`、
`req-3-1`–`req-3-4`）

非空白文本、非反转 sequence range，以及 update 操作至少改变一个字段，属于结构之上的协议语义。
`contracts` 提供纯函数 `validateModelOutputSemantics`，只返回带 path 的问题，不 trim、不补值；Agent 和
Runtime 都调用它。Evidence、已提交 sequence、当前 PlanItem、Tool Policy 等依赖运行态的信息仍只在
Runtime 校验。（`req-5-3`、`req-6-3`）

### 请求级 Bundle 统一派生四种消费表面

Contracts 包公开高层工厂，不公开 AST 遍历器：

```ts
export type ModelOutputRequest =
    | { readonly kind: "gathering" }
    | { readonly kind: "planning" }
    | {
        readonly kind: "executing";
        readonly authorizedTools: readonly AuthorizedToolContract[];
      }
    | { readonly kind: "checkpoint" };

export interface ModelOutputContractBundle<Result> {
    readonly name: string;
    readonly wireContract: Contract<unknown>;
    readonly canonicalContract: Contract<Result>;
    readonly jsonSchema: JsonSchema202012;
    readonly shapeGuide: string;
    decode(value: unknown): Result;
}

export function createModelOutputContractBundle(
    request: ModelOutputRequest,
): ModelOutputContractBundle<PreparationResult | AgentDecision>;
```

`AuthorizedToolContract` 只有 `id` 和 `inputContract`，因此 Contracts 不导入 Runtime。工厂先拒绝空或
重复 Tool ID，再按 code-point 排序生成分支；每个 `tool_call` 分支把 `toolId` 固定到该 ID，并用其
Input Contract 派生 `action.input`。空集合直接省略整个 `tool_call` 分支。Tool Input Contract 本身不被
复制、修改或重新声明。（`req-3-5`、`req-7-4`）

Agent 的 `buildPreparationRequest` / `buildStepRequest` 改为返回 `ModelOutputRequestPlan`。Context 预算
选择器若把最终状态推进为 checkpoint required，就在同一渲染循环中单向切换到 checkpoint Bundle；
该状态不会再退回普通请求，因此最多发生一次 Contract 切换。最终 request 与 Bundle 始终成对返回，
Executor 用该 Bundle 解析同一轮响应。（`req-3-4`、`req-6-4`）

### Required-nullable 映射只消除可选占位

内部 wire 派生器递归访问 canonical AST，并按以下规则生成新 Contract：

- 根固定为只含必填 `result` 的 strict object；
- object 的 required 属性保持 required，原 optional 属性变为 required `nullable(child)`；
- array item、ordinary union 和 strict object 递归转换；
- canonical literal 在 wire 中使用单值 enum，保证共用 Schema 不产生 `const`；
- `optional(nullable(...))` 因单个 wire `null` 无法区分“缺省”和“业务 null”而被拒绝；
- record、recursive、pattern 和字符串长度约束若出现在 Provider 可见路径中，视为不可移植定义并失败。

Decoder 同时沿 canonical 与 wire 图遍历，只在“canonical 属性为 optional 且 wire 值为 null”时省略
该属性。canonical 本身允许的 `null`、Fact `value: null` 和数组中的 null 均原样保留。解码完成后再以
请求专用 canonical Contract 校验并深复制，因此不会保留模型对象引用。（`req-2-1`–`req-2-4`）

Tool input 使用同一规则把 optional 参数变为 required nullable；decoder 恢复 canonical input 后，
再用原 Tool Input Contract 校验一次。任何不匹配都成为当前模型响应失败，不能到达 Runner 的 Tool
准备或执行边界。（`req-3-5`、`req-5-3`）

### Provider 共用 Schema 在 Contracts 层一次编译

`compileModelOutputSchema` 只接受派生后的 wire Contract。它调用核心 `compileJsonSchema`，统一省略根
`$schema`，并在返回前检查 Provider 可见图只含：`type`、`properties`、`required`、
`additionalProperties: false`、`items`、`minItems`、`maxItems`、`minimum`、`maximum`、`enum` 和
`anyOf`。根一定是 object，联合只位于 `result` 或更深层；所有 object 属性都列入 `required`。
（`req-4-3`、`req-4-4`）

该检查属于 Contracts 层的统一可移植编译，不是 Adapter 特判。相同请求种类和相同有序 Tool Contract
图必须生成结构与 `JSON.stringify` 都一致的新对象。定义错误在网络调用前抛出
`ModelOutputContractDefinitionError`；Provider 自身拒绝则原样传播。（`req-1-1`、`req-4-4`）

### 固定 Adapter 模式控制唯一请求路径

LLM 核心增加：

```ts
export type StructuredOutputMode = "strict" | "prompt_only";

export interface LLMStructuredOutput {
    readonly name: string;
    readonly schema: JsonSchema202012;
}

export interface LLMAdapter {
    readonly structuredOutputMode: StructuredOutputMode;
    generate(request: LLMRequest, control?: ExecutionControl): Promise<LLMResponse>;
}
```

`OpenAICompatibleConfig` 与 `GeminiConfig` 必填 `structuredOutputMode`，实例以只读字段暴露。Executor 在
strict 模式把 Bundle 的 `name/schema` 放入 `LLMRequest.structuredOutput`；prompt-only 模式不设置该
字段。Adapter 在 strict 模式缺少该字段、或 prompt-only 模式意外收到该字段时都在发送前失败。
（`req-4-1`、`req-4-2`、`req-5-2`）

OpenAI-compatible 把它映射为 Chat Completions 的
`response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }`；Gemini 映射为
`responseMimeType: "application/json"` 与 `responseJsonSchema: schema`。二者都只映射字段，不重排、
删除或改写 Schema。模型拒绝、截断、空 content 和 SDK 错误不触发第二次调用。（`req-4-3`、
`req-4-4`）

TUI 与 benchmark 的配置读取器把 `LLM_STRUCTURED_OUTPUT_MODE` 加入必填项，并只接受两个精确值；它们
继续实例化 OpenAI-compatible。Gemini 只更新直接构造 API 与契约测试，不加入 CLI 路由。
（`req-4-1`、`req-7-5`）

### Shape Guide 随最终控制消息参与预算

Shape Guide 定义为 Provider 共用 Schema 的无缩进稳定 JSON，并带一行固定英文前缀。它不另建手写
示例或缩写 DSL，避免 prompt 指引与本地 validator 漂移。Prompt Bundle v1 保留结果语义说明，但删除
重复的字段清单和旧无 envelope 示例。（`req-5-1`、`req-7-1`）

prompt-only 模式把 Guide 放入最后一条 Working Context 控制消息的 `responseShapeGuide` 字段；strict
模式完全省略。该位置使阶段、授权 Tool 或 checkpoint 导致的 Schema 变化停留在动态尾部，不改变
Goal-stable / Epoch-stable 前缀，并让现有 TokenBudgetPlanner 在调用前计入 Guide。相同 Bundle 的字段
内容必须逐字一致。（`req-5-1`、`req-6-4`）

### Runtime 在副作用前重验 canonical 结果

`GoalCoordinator` 在 Preparation Executor 返回后，先用 `PreparationResultContract` 解析并深复制，
再做 gathering/planning 分支、Context Lookup 和 Memory Patch 校验。结构失败映射到现有
`INVALID_PHASE_RESULT`，且发生在 Goal 消息、Trajectory 和 Snapshot 改变之前。（`req-6-1`–
`req-6-3`）

`Runner` 用 `AgentDecisionContract` 替换当前 `validateAgentDecision` 的手写对象/字段检查，结构失败仍
映射为 `INVALID_AGENT_DECISION`。随后现有 checkpoint gate、Context Lookup normalize、Tool
Registration prepare、Evidence 与 completion gate 原顺序执行。Contract 解析不会提交事件，也不会
改变 Action/Observation 生命周期。（`req-6-1`–`req-6-4`）

## Components and Interfaces

```text
packages/contracts/src/model-output/
  canonical.ts        canonical Contracts、InferContract 类型与基础语义问题
  wire.ts             required-nullable 派生与 decoder
  provider-schema.ts  共用子集检查、Schema 编译与 Shape Guide
  factory.ts          请求级 ModelOutputContractBundle

packages/agent/src/
  model-output.ts     JSON/fence 解析、Bundle 校验与 INVALID_LLM_RESPONSE 映射
  prompt.ts           返回 request + Bundle 的请求计划
  render.ts           prompt-only responseShapeGuide 投影

packages/llm/src/
  core/types.ts       mode 与可选 structuredOutput 请求字段
  openai-compatible.ts / gemini.ts  Provider 参数映射
```

现有 `packages/agent/src/response-schema.ts` 删除；所需解析入口可从 `model-output.ts` 重导出，以减少调用方
改动，但不保留 Zod Schema 名称或旧无 envelope parser。`LLMResponseProtocolError.issues` 改为只依赖
带 `code/path/message` 的 Contract/语义 issue，不再导入 Zod。（`req-1-3`、`req-5-4`、`req-7-2`）

所有新增或变更的公共 TypeScript 接口补充中文 contract TSDoc 和示例。实现完成时同步更新 Agent、LLM、
Runtime、TUI 与 benchmark 架构文档；Storage 文档无需变更，因为其 Schema 和协议不受影响。

## Error Handling

Contract 定义或 Provider 可移植性错误属于配置错误，在 Adapter 调用前抛出，不包装成模型响应错误。
Provider 4xx、拒绝、传输错误和中止保持 Adapter 错误通道，不自动降级或重试。

收到文本后只允许裸 JSON 或包住单个完整 JSON 值的 fenced code block。JSON 语法错误、wire Contract
issue、decoder 后的基础语义 issue 都映射为 `LLMResponseProtocolError`，稳定 code 为
`INVALID_LLM_RESPONSE`；结构问题保留以 `result` 为根的精确 path。错误通道不保存 Contract AST 或
wire 对象。（`req-5-3`、`req-5-4`）

`recordLlmRequest` 仍只投影 messages，因此新增的内部 `structuredOutput` 不改变 Diagnostic Trace wire
形状；prompt-only Guide 作为实际消息内容仍受现有 Trace 脱敏和长度上限约束，strict Schema 不进入
Trace。合法 canonical 结果进入 Runtime 后不保留 envelope、Guide 或占位 null。（`req-7-3`）

## Research Findings

OpenAI Structured Outputs 要求根 Schema 为 object，所有字段都列入 `required`，并建议用 nullable
表达可选语义；官方同时说明 strict 只接受 JSON Schema 子集。Gemini 官方同样声明只支持子集，并要求
应用继续校验结果。两边共同支持本设计使用的 object、array、scalar、enum、anyOf 和数值/数组边界；
因此设计不依赖 Provider 专用 Schema 变换。

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Gemini Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)

当前本地依赖的 OpenAI SDK 已提供 Chat Completions `json_schema` response format；`@google/genai` 已提供
`responseJsonSchema` 与 `responseMimeType`。实现不引入新的 Provider SDK 或第三方 validator。

## Testing Strategy

### Contracts 与映射

- 对四类请求做精确 Bundle fixture，验证阶段分支、checkpoint 独占、空 Tool 集合和 Tool ID 稳定排序。
  （`req-1-1`、`req-3-1`–`req-3-5`）
- 覆盖每层 optional→nullable、业务 null、`optional(nullable)` 拒绝、Fact scalar/一维数组、额外字段、
  错误 Tool/input 组合与 decoder 深复制；断言 envelope 和占位 null 不进入 canonical。
  （`req-2-1`–`req-2-5`）
- 对不可移植 Tool Contract、重复 Tool ID、Schema 字符稳定性和 Shape Guide 逐字稳定性做失败/快照测试。
  （`req-4-4`、`req-5-1`）

### Agent 与 Runtime

- 两个 Executor 在 strict / prompt-only 下各只调用 Adapter 一次；覆盖裸 JSON、完整 fence、正文夹带、
  issue path、非空白文本和无旧格式 fallback。（`req-5-2`–`req-5-4`、`req-7-2`）
- 预算测试覆盖普通 Bundle 导致 conversation pruning 后切换 checkpoint Bundle，并断言 request 与 parser
  使用同一 Bundle。（`req-3-4`、`req-6-4`）
- 使用恶意替换 Executor 返回额外字段、错误嵌套 Patch 或循环对象，断言 Coordinator/Runner 在任何
  event、Tool 或 Snapshot 副作用前拒绝；合法路径的事件顺序保持不变。（`req-6-1`–`req-6-4`）

### Provider、配置与回归

- Mock OpenAI 与 Gemini SDK，精确断言 strict 原生参数和 prompt-only 参数缺失；Adapter 不改写 Schema，
  Provider 拒绝不触发重试。（`req-4-1`–`req-4-4`）
- TUI/benchmark 覆盖 mode 缺失、非法与两种合法值；确认仍只装配 OpenAI-compatible；Gemini 通过直接
  Adapter 契约测试。（`req-4-1`、`req-7-5`）
- 运行 TypeScript、contracts/agent/runtime/llm/tui/benchmark 测试、全 packages 测试、依赖边界检查、
  Memory 测试与 `git diff --check`；断言 Storage Zod 与所有持久化 codec fixture 未变化。（`req-7-3`、
  `req-7-4`）

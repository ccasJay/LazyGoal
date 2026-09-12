# Slash Command 与模型切换设计

## 审批摘要

### 方案

新增 UI 无关的 `@lazygoal/slash-command` Package，由 TUI 适配其解析和派发结果；LLM 层提供 Provider-aware 模型目录，Runtime/Storage 保存 Goal 级模型选择，Composition Root 通过单一可替换 Model Binding 让 Preparation 与 Step Executor 在每次调用开始时读取一致依赖。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 独立 Slash Command Package | 公共 Package 只保存命令语法、注册和 UI 无关结果，为未来 Web View 提供稳定复用点 | 新增 Workspace 边界；TUI 和未来界面各自拥有展示状态 |
| 解析与展示分离 | Package 区分输入检查与提交派发，TUI 负责候选和拒绝文案 | 普通输入、`//` 转义和命令消息隔离可独立测试 |
| Provider Fetch 与目录补全 | 在线列表决定当前可用性，pi-ai Catalog 只补元数据或在允许的故障下兜底 | 不把目录存在误报为凭据权限；缺少安全能力的模型不可选择 |
| Goal 状态保存模型选择 | 非敏感选择写入当前 Snapshot Schema 的可变 Goal State，不写 `.env` 或凭据 | 同一 Goal 重启后可追溯恢复；旧开发快照直接拒绝 |
| Snapshot 先于 Binding 发布 | 先离线构造候选 Binding，再保存 Goal，最后同步替换进程 Binding | 保存失败不换模；进程崩溃后以 Snapshot 为恢复权威 |
| 每次调用读取 Binding | 两个 Executor 在请求构造开始时获取同一代不可变 Binding | 不重建 Runtime 图，也不会在一次模型调用中途换模 |
| 恢复失败关闭推进 | 恢复时校验 Provider、模式、凭据与模型能力，失败进入模型选择而非自动回退 | 避免静默换模；用户需要显式修复当前 Goal |

### 风险与待确认

- 风险等级：medium；理由：公共 Package、Provider 网络边界、Goal State 与 Snapshot Schema、Executor 依赖读取方式均发生有界跨组件变化。
- 关键操作：无。
- 风险：Provider 列表元数据不一致；Snapshot 保存和 Binding 发布顺序可能失配；动态目录取消与 Controller busy 串行化可能竞态；现有测试 fixture 需更新当前 Schema。
- 待确认：无。

## Overview

该设计覆盖需求 1–7。Slash Command 只定义可跨界面复用的输入语义，不包含 Ink 或 Provider 行为；模型目录和 Adapter 构造仍属于 LLM；Goal 只持有恢复所需的非敏感选择；TUI Composition Root 负责把这些边界组合为 `/model` 交互。功能保持单 Goal、单 Controller 约束，不引入后台模型调用或跨 Provider 路由。

## Architecture

```text
CommandAwareTextInput
        |
        | inspect / dispatch
        v
@lazygoal/slash-command ----> SlashCommandEffect(open_model_selector)
        |                                      |
        | UI-neutral                           v
        |                             SessionController
        |                               |           |
        |                         list models    select model
        |                               |           |
        v                               v           v
future Web adapter             LlmModelCatalog   GoalModelSelectionCoordinator
                                     |                    |
                              Provider + pi-ai       GoalStore Snapshot
                                                          |
                                                          v
                                                MutableModelBinding
                                                   /           \
                                  LLMPreparationExecutor   LLMStepExecutor
```

`@lazygoal/slash-command` 无出站 Package 依赖。`packages/llm` 继续只依赖 Runtime 的取消原语；Runtime 不反向依赖 LLM。`packages/tui` 作为 Composition Root 可组合 Slash Command、LLM、Agent、Runtime 与 Storage。依赖检查脚本加入 `slash-command: []`，并只允许 TUI 导入它。

## Components and Interfaces

### Slash Command Core

```ts
export interface SlashCommandDefinition<TEffect> {
    readonly name: string;
    readonly description: string;
    readonly usage: string;
    execute(invocation: SlashCommandInvocation): TEffect | Promise<TEffect>;
}

export type SlashInputInspection =
    | { readonly kind: "text" }
    | { readonly kind: "escaped_text"; readonly content: string }
    | { readonly kind: "candidates"; readonly candidates: readonly SlashCommandSummary[] }
    | { readonly kind: "invocation"; readonly invocation: SlashCommandInvocation }
    | { readonly kind: "rejected"; readonly code: string; readonly message: string };

export interface SlashCommandRegistry<TEffect> {
    register(definition: SlashCommandDefinition<TEffect>): void;
    inspect(input: string): SlashInputInspection;
    dispatch(input: string): Promise<SlashCommandDispatchResult<TEffect>>;
}
```

命令名采用小写 ASCII 字母开头、后接小写字母、数字或 `-`；重复名称注册立即失败。解析保留原始非命令文本：首个非空白字符不是 `/` 时返回 `text`；`//` 只删除命令位置的第一个 `/`；单个 `/` 和合法前缀返回候选；提交时未知名称、`/model` 的多余参数或不合法名称返回稳定拒绝。`modelCommand` 的 effect 固定为 `{ kind: "open_model_selector" }`，不引用模型服务或 UI 类型。（需求 1、2）

所有新增公开接口及方法按仓库规则补充中文契约级 TSDoc、错误/副作用说明和最小 `@example`。

### TUI 输入适配与选择器状态

`CommandAwareTextInput` 包装现有 TextInput 的 value、onChange 与 onSubmit：实时调用 `inspect` 渲染候选；提交 `text`/`escaped_text` 时调用原回调；提交命令时只派发 effect。Intent、Question、Proposal feedback 与 BlockedPanel 使用该组件，GoalSelect、Action approve/reject 和终态不接入。（需求 2）

`UiViewModel` 增加 `model_select` 页面，保存来源输入位置、当前选择、loading/list/error 和目录请求 generation。`openModelSelector` 只同步进入 loading 页面并启动受本地 AbortController 与根 signal 共同控制的异步目录请求，不让一次 Fetch 长时间占用普通 `dispatch`。ESC 中止本地请求并递增 generation；迟到结果因 generation 不匹配被丢弃。返回来源包含 `intent`、`question`、`proposal_feedback` 或 `blocked`，从而恢复同一语义输入位置而不制造用户消息。（需求 4）

`ModelSelector` 使用 Ink `useInput` 处理上/下/Enter/ESC。不可选择条目可以获得焦点以展示原因，但 Enter 只更新本地错误。选择期间 Controller busy，防止重复确认；成功、失败或取消均通过独立 `UiNotice` 展示英文提示，不写 Goal messages。（需求 4、5）

### Model Catalog

```ts
export interface LlmModelDescriptor {
    readonly provider: LlmProvider;
    readonly id: string;
    readonly displayName: string;
    readonly contextWindowTokens?: number;
    readonly maxOutputTokens?: number;
    readonly reasoning?: boolean;
    readonly vision?: boolean;
    readonly availabilitySource: "live" | "catalog" | "configured";
    readonly metadataSource: "live" | "catalog" | "configured" | "mixed";
    readonly selectable: boolean;
    readonly unavailableReason?: string;
}

export interface LlmModelCatalog {
    list(config: LlmConfig, options?: { readonly signal?: AbortSignal }):
        Promise<readonly LlmModelDescriptor[]>;
}
```

`ProviderModelFetcher` Registry 按 `LlmProvider` 选择 wire adapter。所有响应在网络边界做结构校验、字符串和正整数约束、分页 token 前进校验及模型 ID 去重；凭据只进入请求头，不进入错误对象或返回 DTO。（需求 3、7）

| Provider | 在线列表 | 认证与分页 | 在线元数据 |
|---|---|---|---|
| OpenAI | `GET {baseURL}/models` | Bearer；单页 | ID/owner，能力由 Catalog 补全 |
| Google | `GET {baseURL}/models` | `x-goog-api-key`；`pageToken` | displayName、输入/输出限制、生成方法、thinking |
| Anthropic | `GET https://api.anthropic.com/v1/models` | `x-api-key`、固定 API version；cursor | ID/displayName，能力由 Catalog 补全 |
| OpenRouter | `GET https://openrouter.ai/api/v1/models` | Bearer；单页 | 名称、context、modality 等 |
| DeepSeek | `GET https://api.deepseek.com/models` | Bearer；单页 | ID/owner，能力由 Catalog 补全 |
| openai-compatible | `GET {baseURL}/models` | Bearer；按 OpenAI 结构 | 非标准扩展仅经显式 Schema 接受；其它模型默认缺少能力 |

在线成功时只以在线 ID 集合作为可用性集合，再按同 Provider + ID 用 pi-ai 0.85.1 Catalog 补字段；不混入仅存在于静态目录的其它模型。在线条目必须支持文本生成、当前 `structuredOutputMode` 且具有可构造安全 Binding 的容量；否则保留为不可选择条目。排序固定为当前模型优先、可选择项优先、displayName 和 ID 升序。（需求 3、4）

失败分类为 `cancelled`、`authentication`、`permission`、`timeout`、`unavailable`、`unsupported`、`protocol`。401/403 和响应 Schema/分页非法分别映射 authentication/permission/protocol，并阻止选择；Abort 直接取消；超时、网络、5xx、404/405/501 允许目录兜底并保留可见 warning。`openai-compatible` 兜底只返回配置模型，且使用配置中的显式容量。（需求 3）

默认发现超时为 5 秒，不新增配置项。请求遵循根取消信号；分页共享同一超时和取消范围，不启动模型生成请求。

### Model Selection、Binding 与 Executor

```ts
export interface GoalModelSelection {
    readonly provider: string;
    readonly modelId: string;
    readonly structuredOutputMode: StructuredOutputMode;
    readonly contextWindowTokens?: number;
    readonly maxOutputTokens?: number;
    readonly inputEstimator:
        | { readonly kind: "character-v1" }
        | { readonly kind: "token-encoding"; readonly encoding: "cl100k_base" | "o200k_base" };
}

export interface ModelExecutionBinding {
    readonly generation: number;
    readonly selection: GoalModelSelection;
    readonly adapter: LLMAdapter;
    readonly modelCapabilities?: ModelCapabilities;
    readonly modelContextPolicy: ModelContextBudgetPolicy;
    readonly trajectoryContextAssembler: TrajectoryModelContextAssembler;
}

export interface ModelExecutionBindingProvider {
    current(): Readonly<ModelExecutionBinding>;
}
```

`GoalModelSelection` 位于 Runtime 领域类型并作为 `GoalState.modelSelection` 持久化；它不保存 API Key、baseURL、认证头、价格或 SDK 对象。当前 Snapshot v1 原位增加对应 DTO/Schema/Codec 字段，旧开发快照因字段缺失明确失败，不新增版本或迁移分支。（需求 6）

`GoalModelSelectionCoordinator` 只负责恢复最新 Goal、校验 Goal/Run 及安全等待状态、复制新 selection 并保存完整 Snapshot。它不创建 Adapter，也不依赖 LLM。模型选择是 Snapshot-only 状态，不新增 Trajectory 业务事件，避免事实追加成功但 Snapshot/marker 失败造成 Binding 发布歧义；安全要求通过 Snapshot 与后续 LLM Trace 的 model metadata 核验。（需求 5、6）

Composition Root 的 `MutableModelBinding` 实现 `ModelExecutionBindingProvider`。切换顺序固定为：

1. 使用当前进程的 Provider、API Key、baseURL 和输出模式为目标 descriptor 离线构造候选 Binding；Provider 或模式不得改变。
2. 对活动 Goal 调用 `GoalModelSelectionCoordinator` 保存 selection；Intent 阶段无 Goal，只更新本次新建 Goal 的默认 Binding。
3. Snapshot 保存成功后执行不会抛错的同步 `publish(candidate)`；随后返回原输入位置。

如果步骤 1 或 2 失败，不发布候选；步骤 3 前进程崩溃时，重启以已保存 Snapshot 重建，所以 Snapshot 始终是活动 Goal 的恢复权威。（需求 5、6）

`LLMPreparationExecutor` 与 `LLMStepExecutor` 不再分别捕获固定 Adapter、Capabilities 和 Assembler，而是在每次 `execute` 开始时从注入的 `ModelExecutionBindingProvider` 读取一次 Binding，并在该次调用内保持该对象不变。其一次 Adapter 调用、错误传播和 Runtime 所有权契约不变。字符估算与 token encoding 都作为 Binding 的显式策略；上下文和输出限制随目标 descriptor 重新生成，不沿用旧模型数值。（需求 5）

恢复 Goal 时，SessionController 在 `coordinator.advance` 前要求 Binding manager 使用 Snapshot selection 和当前进程凭据重建。Provider 或结构化模式不一致、在线权限拒绝、目录/配置无法解析模型、容量不足时进入 `model_select` 错误态；只有用户选择并保存兼容模型后才能继续。网络不可用时，Snapshot 模型能由允许的目录/配置兜底解析才可恢复。（需求 6）

## Data Models

`GoalState` 新增必填 `modelSelection`，由 `createGoal`、Launcher request、clone/transition、Storage DTO/Schema/Codec 和测试 fixture 同步处理。模型切换只替换该字段，不改变 workflow、messages、Run、pendingAction、stepCount、Context Epoch 或 committed Trajectory boundary。

`UiModelSelectViewModel` 不进入 Runtime 或 Storage，目录条目和 warning 仅存在于进程内。`UiNotice` 在下一次用户输入或页面切换时清除，不进入 Message、Trace 或 Snapshot。

## Error Handling

- Slash Command 拒绝使用稳定 `SLASH_COMMAND_*` code 和英文 UI message；原普通输入校验仍由现有 submit gate 负责。
- Model Catalog 只返回脱敏分类和 Provider/endpoint 类别；不复制任意响应正文、认证头或 SDK 错误文本。
- Binding 构造失败、Snapshot 保存失败和恢复校验失败分别映射稳定 UI code，保留原 Goal 与当前模型；恢复阻塞不会调用 Preparation/Step Executor。
- ESC 取消不是错误，不写 Snapshot、Trace 或消息；根 shutdown 仍传播既有 `ExecutionAbortedError`。
- 当前模型已选中时 Enter 作为无状态成功返回，不重复保存 Snapshot 或重建 Binding。

## Research Findings

- OpenAI 官方 Models API 只保证列表返回基本模型对象，因此上下文和能力不能从该接口推断：https://platform.openai.com/docs/api-reference/models/object
- Google `models.list` 提供分页、生成方法与输入/输出 Token 限制，可直接过滤 `generateContent`：https://ai.google.dev/api/models
- Anthropic Models API 提供 `/v1/models` 和 cursor 分页，但返回字段不足以单独构造全部能力：https://docs.claude.com/en/api/models-list
- OpenRouter Models API 提供 context 和 modality 等较丰富字段：https://openrouter.ai/docs/api/api-reference/models/get-models
- DeepSeek `/models` 返回 OpenAI 风格的基本模型列表：https://api-docs.deepseek.com/api/list-models
- pi-ai 0.85.1 提供同步静态 Catalog；其 dynamic refresh 只对声明动态 Provider 生效，不能替代上述所有 Provider 的在线查询。

## Key Design Decisions

### 独立 Slash Command Package

Package 边界对应已确认的 TUI/Web 复用需求，但只抽取已有共同语义；不把模型目录、Controller 或 UI 状态提前泛化到共享层。（需求 1）

### 解析与展示分离

输入检查是同步纯逻辑，提交派发可以异步；这种分离使实时候选不会触发副作用，也让未知命令和 `//` 在所有界面保持一致。（需求 2）

### Provider Fetch 与目录补全

在线集合回答“当前端点列出了什么”，Catalog 回答“已知模型能力是什么”；分别保留来源可避免将静态知识误认为凭据授权。（需求 3）

### Goal 状态保存模型选择

模型会改变后续执行结果，属于 Goal 可恢复状态而不是 TUI 偏好；只保存重建参数，凭据和连接细节仍归入口配置所有。（需求 6）

### Snapshot 先于 Binding 发布

候选 Binding 先构造可把大多数失败移到持久化之前；保存完成后的同步发布没有异步失败点，崩溃恢复则重新服从 Snapshot。（需求 5、6）

### 每次调用读取 Binding

Provider 在一次 execute 开头返回不可变代对象，避免对现有 Runtime 图做热重建，同时保证单次调用不会观察到中途切换。（需求 5）

### 恢复失败关闭推进

环境默认模型不是 Goal 已批准模型，静默使用会破坏可追溯性；因此恢复校验失败必须回到显式模型选择。（需求 6）

## Testing Strategy

- Slash Command Package：注册、重复/非法名称、候选排序、前缀、参数、未知命令、前导空白、`//`、普通文本及 effect 派发；依赖检查确认零 UI/Provider/Storage 出站边。（需求 1、2、7）
- LLM Model Catalog：对六种 Provider 注入 fake fetch，覆盖认证头不回显、分页、字段映射、在线/Catalog 合并、稳定排序、当前项、不可选择原因、超时/取消/5xx/404/401/403/非法响应；不得调用真实模型。（需求 3、7）
- Runtime/Storage：GoalModelSelection 校验、只允许安全等待点、Snapshot 保存失败无变化、v1 编解码、旧形态拒绝、模型切换不改变消息/Run/pendingAction/Trajectory boundary，序列化输出不含凭据。（需求 5、6、7）
- Agent：两个 Executor 在连续调用间读取不同 generation，断言各调用只使用其开始时的 Adapter、Capabilities、Policy 与 Assembler；保留一次调用和错误原样传播测试。（需求 5、7）
- TUI：CommandAwareTextInput 快照与提交测试；ModelSelector 加载、方向键、不可选项、Enter、ESC；Controller 覆盖迟到 Fetch、返回位置、notice、Intent 默认选择、活动 Goal 提交/回滚、恢复阻塞和后续 Preparation/Step 实际模型 metadata。（需求 2、4、5、6、7）
- 全量验证：`npm test`、`npm run check:dependencies` 与 `git diff --check`；人工终端检查只用于确认候选列表无闪烁和焦点体验，不替代自动化行为断言。


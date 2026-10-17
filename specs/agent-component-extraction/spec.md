---
status: proposed
created_at: 2026-10-17
---

# Agent 能力拆包与默认装配收敛 Spec

## 目标与范围

将现有 `packages/agent` 的能力拆为九个可独立消费的私有包：`context-budget`、`model-view`、`model-context`、`prompt-renderer`、`prompt-bundle`、`model-request`、`model-response`、`model-call`、`model-execution`。预算、模型表示、历史组装、模板渲染、默认 Prompt、请求构造、响应解码、单次调用与阶段执行分别拥有明确边界；`agent` 只提供默认执行装配入口，不再保存这些能力的实现或充当统一转导出入口。

本轮以职责、依赖和真实调用验证拆包价值，不以文件数量或包大小作为验收指标。保持现有模型请求、输出接受条件、预算、流事件、指标、权限和恢复行为；迁移所有受影响的源码、测试、维护脚本、命令与 Worker 模板引用。goal-server 和共享 Headless Composition Root 均作为生产消费者验证。

不新增 SDK、插件平台、Provider、模型阶段、上下文算法或后台压缩任务，不改变 Runtime 生命周期、Benchmark 会话编排或评分，不引入 npm 发布、独立构建产物、分组目录及历史路径兼容层。现有开发期 Snapshot 与协议版本保持原状。

本 Spec 与 [Runtime 组件提炼 Spec](../runtime-sdk-extraction/spec.md) 分别维护目标、计划和审批，不修改其目标或计划。本轮 Benchmark 接入仅覆盖本次拆包所需的导入、模型执行默认装配和模板资源定位，不迁移其 Runtime 装配至该 Spec 的组件。

本 Spec 既不依赖 Runtime 组件提炼交付，也不依赖 [进程组件提炼](../process-runtime-extraction/spec.md)；输入继续使用当前 StepExecutor、控制和存储契约。无论两份 Spec 是否已实施，模型拆包都可在当前装配位置验证；本轮不修改实例关闭或进程管理器的内部行为。

## 需求与验收标准

### 需求 1：能力具有独立归属与调用入口

作为组件使用者，我希望直接调用所需能力，以便不经过 `agent` 即可构造上下文、渲染 Prompt、准备请求或执行模型阶段。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当调用方通过九个新包各自的 `src/index.ts` 使用对应能力时，应能消费本 Spec 定义的九类能力；各包不得导入 `agent`、应用、Benchmark 或具体 Storage 实现，调用底层能力不要求构造完整执行器。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当通过 `model-context` 提供已提交历史、当前状态与预算策略时，应能独立得到模型视图与历史选择结果，不加载模板、不调用 Provider、不改写 Goal、Trajectory 或 Working Memory；其读取仅通过注入的现有 Port 完成。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：当通过 `prompt-renderer` 提供内存模板、Manifest、Section 定义和 View DTO 时，应能独立编译并渲染固定指令与动态 Section，不读取默认资产、工作区、Runtime 状态或历史 frame，也不依赖默认 Bundle 包；保留现有结构检查、模板错误和文本规范化行为。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：当通过 `model-request` 准备 Decide、Think 或完成审查请求时，应得到与本次请求匹配的解析契约和现有 frame 元数据；动态 Section 差异计算使用已筛选的提交基线并产出请求更新，不自行读取恢复真源。该包不解码实际模型响应、不调用 Adapter、不写调用日志、不提交检查点，也不要求完整模型执行绑定。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：当通过 `context-budget` 提供候选内容、完整单元、计量器与预算时，应能独立执行现有计量、分配、容量检查与裁剪，不需要 Goal、Trajectory Store、模型 View、模板或 Provider；计算不修改输入，保留各策略当前的软/硬上限、连续选择、错误及取消语义。
- <a id="spec-req-1-6"></a>**验收标准 1.6**：当 Prompt、请求或历史组件使用 `model-view` 的表示契约时，应能直接引用模型输入与历史结果 DTO，而不依赖 Runtime 领域类型或 `model-context` 的实现；DTO 不读取历史、不投影 Goal、不执行裁剪，同一表示类型只有一个定义，迁移不改变模型可见字段、值域与顺序。
- <a id="spec-req-1-7"></a>**验收标准 1.7**：当通过 `model-response` 提供最终响应、本次请求绑定的契约/工具声明以及阶段与原生身份约束时，应能独立解码文本或原生工具结果，返回现有阶段输出或协议错误；不得重建不同的请求契约、调用 Adapter、读取 Goal、分配 Runtime Action 身份或生成 RuntimeFeedback。
- <a id="spec-req-1-8"></a>**验收标准 1.8**：当通过 `model-call` 提供已准备请求、Adapter、调用记录上下文、取消控制和活动流投递约定时，应独立完成一次模型调用、记录及流收集，返回最终响应和调用身份；输入写入失败不调用模型，取消和流协议错误保持原行为，不解码业务决策、不读取 Binding、不重试或推进 Goal。
- <a id="spec-req-1-9"></a>**验收标准 1.9**：当通过 `prompt-bundle` 加载默认 Bundle 时，应取得当前唯一模板真源、Manifest、具体 Section 定义及其装配的 Renderer；默认协议适配继续拒绝不支持的组合，不因渲染机制拆出而接受额外版本、slot 或协议，也不把 Section 历史差异计算带入默认 Bundle。

### 需求 2：agent 只提供默认执行装配

作为宿主，我希望使用一个默认装配入口获得 Runtime 可调用的执行器，同时能够直接消费和替换底层组件。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当调用 `agent` 的 `createAgentExecutor` 并提供现有 Adapter 或 Binding Provider，以及本次执行所需的 Port 时，应创建现有默认 Renderer、Conversation 裁剪策略及 `model-execution` 执行器，返回满足现有 `StepExecutor` 的对象；显式注入的 Renderer、裁剪策略与执行依赖应被原样使用。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：当仅构造默认执行器时，不应请求模型、启动工具、绑定端口、注册进程信号、退出进程或创建 Goal；模板缺失、语法或配置错误应在构造时拒绝，不静默选择其它模板或模型。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：当消费者需要预算算法、模型表示、上下文策略、Renderer、默认 Bundle、请求、响应、单次调用、执行器类或模型绑定时，应从实际拥有者导入；`agent` 的公共入口仅导出默认装配函数及其参数契约，不重新导出九包、LLM、Runtime 或 Tool 的类型与实现，不保留旧文件转发。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：当分别通过默认装配及直接构造 `model-execution` 执行器、注入相同依赖运行确定性场景时，应得到相同的阶段结果和调用后果；注入的 Adapter、Store、Recorder、Binding Provider 与取消信号继续由宿主拥有，不增加执行器关闭或全局资源管理机制。

### 需求 3：模型行为与恢复事实保持一致

作为现有用户，我希望目录变化不会改变模型看到的信息、可接受的输出和恢复后的执行。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当使用相同 Goal、授权工具、历史、模板和策略准备请求时，迁移前后消息正文、角色与顺序、原生工具声明、Shape Guide、动态 Section 更新、预算结果及解析契约应保持一致；必需输入超限仍在 Adapter 调用前失败，不通过更新基线掩盖变化。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：当存在未提交 tail、未完成工具调用、不同模型身份、Context Epoch 或阶段历史时，应沿用现有筛选与重建规则；仅 Snapshot 提交边界内的有效事实参与 Hot/Warm、原生历史与 Section 基线，输入日志和诊断不取得恢复权威。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：当执行 Decide、Think 或完成审查时，应保持现有阶段 Adapter、工具可见交集、输出模式及拒绝规则；错误码、字段路径、有界纠错反馈、完成审查证据选择与超限拒绝不因拆包改变，不新增自动修复或降级。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：当执行期间发布新 Binding generation、收到取消或发生调用记录失败时，应保持阶段开始时绑定固定、取消传播、最终响应解析、流可见性与记录顺序；完整输入写入失败阻止模型调用，诊断和指标写入失败仍按现有约定隔离，完成审查不向活动流公开内部文本或函数参数。

### 需求 4：真实消费者与模板资产完整迁移

作为维护者，我希望迁移后的服务、评测与维护入口能够直接消费新包，避免仅有包内测试证明拆包。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：当 goal-server 和共享 Headless Composition Root 运行确定性场景时，应通过 `agent` 默认装配获得执行器，并从实际拥有者获取其余组件；创建、等待、重建恢复、模型切换与原有调用记录行为保持一致，不产生第二套执行链。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：当构建现有 Worker 或从任意工作目录加载默认 Prompt 时，应从 `prompt-bundle` 的唯一模板真源取得所需内容；模板 ID、规范化正文和消费者既有选择规则保持一致，Worker 内嵌后不需要从题目目录或旧 Agent 路径读取模板。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：当运行受影响的现有命令、脚本、包测试或 Worker 本地确定性测试时，不应出现已移走的 Agent 源码或模板路径依赖；同时存在的当前消费者全部迁移，历史 Spec、Memory 与明确的测试基线不做全局替换。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：当替换内存 Renderer、预算策略、Adapter 或轨迹 Store 时，应能通过所属包入口验证成功、错误和取消路径，无需构造 HTTP 服务、访问真实 Provider 或使用用户 Goal；业务授权和状态提交仍由 Runtime 决定。

### 需求 5：目录约定受到现有工具验证

作为维护者，我希望结构变化可由机器核对，防止反向依赖、入口穿透或漏扫造成边界退化。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：当九个包加入仓库时，应保持 `packages/<pkg>` 层级，各自具有 `package.json`、`src/index.ts`、所属文档及适用的类型或行为验证；类型检查、依赖检查、回归测试发现和文档检查均实际覆盖新位置，Nunjucks 运行依赖及其类型声明归 `prompt-renderer` 所有。仅表示类型的文件不强加运行时测试。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：当静态代码违反本 Spec 的依赖方向、跨新包内部文件调用、View DTO 或纯 Renderer 的 Runtime 领域依赖限制时，`check:dependencies` 应失败；检查应覆盖普通 import/export、仅类型导入、`import("...")` 类型引用、side-effect import 与字符串字面量 dynamic import，不以原有正则漏检视为通过。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：当在不包含项目生成产物的临时源码副本上执行组件及消费者验证时，应能解析到当前源码与模板真源；新包及其组件测试不得导入项目 `dist/`、`lib/` 或 `build/`，Worker 产物则另行通过现有打包消费路径验证。
- <a id="spec-req-5-4"></a>**验收标准 5.4**：当职责迁移完成时，新建或变更的公共接口具有中文契约 TSDoc 与最小示例，九包文档各自说明当前职责和限制，`agent` 文档只说明装配；根导航、仓库布局及当前读者链接同步指向新所有者，不维护同一实现或契约的多份真源。

## 架构与核心决策

### 包角色与依赖方向

下列箭头表示主要能力依赖；完整允许关系以下表为准。九个能力包可直接消费，`agent` 是其上的默认装配选择，不是调用其它能力的必经入口。

```text
goal-server / Headless Composition Root → agent → model-execution
model-execution → model-request、model-call、model-response
model-request → model-context、prompt-renderer
model-context → model-view、context-budget
prompt-bundle → prompt-renderer、model-view
prompt-renderer → model-view、context-budget
model-view → context-budget（仅预算结果表示契约）
model-call → model-response（仅共用既有协议错误）
agent → prompt-bundle、context-budget（默认装配）
```

| 包 | 拥有的职责 | 本轮允许的 LazyGoal 出站依赖 |
| --- | --- | --- |
| `context-budget` | 字符/Token 计量、预算分配、容量检查、通用完整单元选择/裁剪与计量共用的确定性序列化 | 无 LazyGoal 出站依赖 |
| `model-view` | 模型输入 DTO、PromptContext、Hot/Warm 与原生历史的模型可见结果表示 | `context-budget`、`model-contracts`、`context-retrieval`；只引用所需表示类型，不引入计算实现 |
| `model-context` | Runtime 到模型视图的 Projector、Conversation 来源适配、已提交轨迹/原生历史读取与投影、Hot/Warm 组装 | `context-budget`、`model-view`、`runtime`、`contracts`、`model-contracts`、`tool-core`、`working-memory`、`context-retrieval`、`execution-control` |
| `prompt-renderer` | 内存 Loader、Environment、模板编译与渲染、Manifest 结构检查、Section 注册机制、渲染契约与错误 | `model-view`、`context-budget` |
| `prompt-bundle` | 当前模板资产、默认 Manifest、具体 Section 定义、默认 Renderer 装配和 Runtime 协议适配 | `prompt-renderer`、`model-view`、`runtime`、`working-memory` |
| `model-request` | Decide/Think 与完成审查请求、预算协调、消息组装、Section 差异与待提交 frame 计划 | `context-budget`、`model-view`、`model-context`、`prompt-renderer`、`llm`、`runtime`、`config`、`model-contracts`、`tool-core`、`working-memory` |
| `model-response` | 文本与原生工具响应解码、阶段输出/身份检查、既有协议错误 | `llm`、`contracts`、`model-contracts` |
| `model-call` | 单次 Adapter 调用、取消、流收集与活动投递、输入日志、指标和诊断关联 | `llm`、`runtime`、`model-response`、`execution-control`、`execution-stream` |
| `model-execution` | `LLMStepExecutor` 阶段协调、Binding/generation、阶段结果组装、Action 身份分配与 Runtime 反馈转换 | `context-budget`、`model-view`、`model-context`、`prompt-renderer`、`model-request`、`model-response`、`model-call`、`llm`、`runtime`、`model-contracts`、`execution-control` |
| `agent` | 默认 Renderer、Conversation 裁剪策略与执行器装配 | `context-budget`、`prompt-bundle`、`model-execution`、`runtime` |

允许依赖是上限，不要求每个包导入全部目标；按最终直接使用关系登记，不保留原包白名单作为兜底。Runtime、LLM、Storage 和其它既有基础包不得新增对九包或 `agent` 的反向依赖；应用和 Benchmark 保持 Composition Root 角色。读取 Runtime Port、使用领域投影和执行器契约不等于取得状态推进权。

`context-budget` 不感知模型 View 或历史来源，只通过现有泛型单元、计量器与渲染回调执行计算。`model-view` 不导入 Runtime、`model-context`、模板或执行实现；Runtime 到 View 的 Projector 必须留在 `model-context`。`prompt-renderer` 不导入默认 Bundle、Runtime、Working Memory 实现或历史组装；`prompt-bundle` 的协议适配可以使用现有 Runtime 校验契约，但不读取历史 frame。`model-request` 的纯 `render.ts` 不导入 Runtime，也不执行 I/O。`model-response` 不依赖请求构造、调用或 Runtime；`model-call` 不依赖请求构造、默认 Prompt 或执行 Binding。包级方向和文件级纯表示/渲染规则分别检查。

### 源码与事实归属

以下以当前 `packages/agent/src/` 为迁移来源；同一文件只保留一个实现。文件分组用于明确职责归属，细小辅助函数可在 Plan 中按依赖调整，不额外创建公共包。

| 目标包 | 迁移内容 |
| --- | --- |
| `context-budget` | `model-context-budget.ts`、`context-unit.ts`、`context-compactor.ts`、`context-selector.ts`、`thought-budget.ts`；来源无关的单元选择算法与上下文来源识别实现分开归属 |
| `model-view` | `model-inference-view.ts`，以及从轨迹投影、原生交换和 Warm 实现文件中提取的模型可见结果 DTO；不迁入 Projector、Reducer 或 Store 接口 |
| `model-context` | `model-inference-projector.ts`、`conversation-context-unit-adapter.ts`、`trajectory-model-context-assembler.ts`、`trajectory-execution-unit-adapter.ts`、`trajectory-event-projector.ts`、`native-model-history.ts`、`warm-reducer.ts`、`deterministic-warm.ts`、`context-lookup-projection.ts`、`goal-context-navigation.ts` 中的来源适配、投影、历史选择和组装实现 |
| `prompt-renderer` | `prompting/renderer.ts`、`loader.ts`、`environment.ts` 的渲染环境部分、`registry.ts` 的结构/匹配检查、`types.ts`、`errors.ts`，以及 `dynamic-section-registry.ts` 中的注册机制与渲染交互契约 |
| `prompt-bundle` | `prompting/default-bundles.ts`、具体默认 Section 定义及其投影函数、当前默认协议支持检查，`global-system-prompt/`、`step-prompt/` 与所有当前 `.njk` 资产 |
| `model-request` | `prompt.ts`、`render.ts`、`completion-review.ts`、`prompting/dynamic-section-diff.ts`，以及原 `model-output.ts` 中检查请求内容的 `requestRequiresContextCheckpoint` |
| `model-response` | `model-output.ts` 中的响应解析、根 `errors.ts`，以及从 `llm-step-executor.ts` 提取的文本/原生工具解码、Think/Decide/完成审查输出与原生身份检查 |
| `model-call` | 从 `llm-step-executor.ts` 提取的 `generateModelResponse`、流收集、记录与投递实现，以及 `llm-diagnostic-trace.ts` 的调用诊断能力；保留与阶段协调层关联解码错误的最小记录入口 |
| `model-execution` | `llm-step-executor.ts` 保留的阶段协调、结果/frame 组装与 Action 身份分配，`model-execution-binding.ts`、`stage-feedback.ts` |
| `agent` | 重建 `src/index.ts` 与默认装配实现；不保留上表旧实现或入口别名 |

确定性 `stableJson` 与 `compareCodeUnits` 从 Nunjucks 环境中移至 `context-budget` 的无模板依赖模块，作为计量表示的基础，由预算、投影和 Prompt Filter 直接引用同一实现；保留键序、数组顺序、缩进和标量语义。换行规范化与 Nunjucks Environment 归 `prompt-renderer`。不为这一依赖新建通用 `utils` 包，也不复制算法。

View DTO 中现有的 Runtime `import("...")` 类型引用随迁移消除：检索过滤契约引用其现有 `model-contracts` 所有者，匹配字段引用 `context-retrieval` 的既有表示契约；转换仍由 Projector 完成，不复制完整 Goal、Snapshot 或恢复协议到新 DTO。

当前 View 对 `ModelExecutionUnitProjection`、`WarmCompactEntry` 等实现文件中类型的引用也随迁移消除：模型可见的输出预览、事件、执行单元、原生交换与 Warm 条目表示统一由 `model-view` 定义，投影器与 Reducer 引用这些类型。来源记录、Store、Artifact Resolver 和算法配置留在各自实现包。表示契约只描述现有模型可见字段与值域，不引用 Runtime 类型来推导字段，也不镜像完整领域事件协议；不得通过放宽字段类型、删除来源身份或复制类型来消除循环。预算结果契约保留在 `context-budget`，View 只做类型引用。

`model-context` 继续统一协调提交边界、完整执行单元、原生身份和 Hot/Warm 来源；不再为 Hot、Warm 或单个历史协议各建一个包。通用选择策略与来源配对规则区分所有者，但维持现有调用顺序和结果。

模板正文、ID、Manifest、协议组合与固定指令测试基线均保持；资源路径变化不等于模板版本变化。Prompt 资产真源只在 `prompt-bundle`，Worker 构建副本与显式历史基线保留其派生/对照身份。请求、输出与对话协议 AST 继续由 `model-contracts` 拥有；`model-request` 绑定本次使用的契约，`model-response` 消费该契约解码实际响应，不各自另建 Schema。

### 渲染机制、默认内容与 Section 更新

`prompt-renderer` 接收显式内存模板、Manifest、Section 定义与 View，拥有编译、确定性渲染、模板引用/顺序/阶段映射检查及渲染契约。现有 Registry 对 Runtime 校验函数的引用随拆分消除；默认支持哪些协议及其 Runtime `GoalProtocolValidator` 适配归 `prompt-bundle`，结构与输入声明匹配的纯检查归渲染包。保留当前 Manifest 格式、slot、阶段与错误语义，不借拆包扩展支持范围或引入任意插件/通用模板平台。

Section 注册机制不识别具体默认 ID；`createDefaultDynamicSectionRegistry` 及运行模式、任务、工具授权、Working Memory 等具体投影定义归 `prompt-bundle`。渲染接口及 Section 身份/投影/消息契约归 `prompt-renderer`，只描述 View 到渲染文本的交互。

`planDynamicSectionUpdates`、更新消息与 frame 计划、差异错误归 `model-request`。调用方仍经现有历史组装入口按 Goal/Run、阶段、Epoch、Conversation 和提交边界取得基线，差异算法只比较已筛选 frame 与本轮渲染结果。渲染包和默认 Bundle 都不读取或重建历史基线；请求包不把计划当作已提交事实。

### 默认装配与执行契约

`agent` 的唯一行为入口为异步 `createAgentExecutor(options): Promise<StepExecutor>`，并导出自身 `AgentExecutorOptions` 参数契约。参数沿用现有执行器所需依赖；Renderer 与 Conversation Compactor 可显式提供，缺省分别使用 `prompt-bundle` 的当前默认 Renderer 和 `context-budget` 的 `DropOldestContextCompactor`。已有 Adapter 与 Binding Provider 接入方式均保留；已有选择优先关系、构造错误和字符/Token 预算语义不变。

工厂只处理上述默认值并构造 `model-execution` 的执行器，不解析环境变量、TOML/Profile，不创建 Provider、Store、工具集、Runner 或关闭管理器。返回对象保留现有 `StepExecutor` 阶段契约及执行器已有的单次 `execute` 行为；不增加新阶段循环。需要精确控制的调用方可直接构造 `model-execution` 中的 `LLMStepExecutor`。

Binding 及其不可变 generation 的管理归 `model-execution`；它组合 `context-budget` 的能力/预算和 `model-context` 的轨迹组装器，不取得这些组件的实现或表示所有权。宿主继续在现有持久化与安全点规则下准备并发布 Binding，默认工厂不缓存全局 Binding、不自动切换模型。每次阶段读取并固定一次 Binding，异步调用过程中不得跨 generation 混用依赖。

完成审查请求构造不再接收整个 `ModelExecutionBinding`，改为仅接收当前输出模式、预算策略与可选模型能力；这些值由执行器从同一固定 Binding 投影。新包不持有 Adapter；复用现有 `CompletionReviewInput` 与预算错误，不新增审查重试或持久化阶段。

### 请求、调用、响应与执行协调

`model-execution` 在每个阶段开始时固定 Binding，由 `model-request` 准备请求及绑定契约，将明确的请求交给 `model-call`，再将最终响应与相同契约交给 `model-response`。协调层负责构造既有阶段结果、关联 callId/frame/原生响应，以及沿用现有 Action 身份分配规则；Runner 继续拥有阶段循环和提交。阶段反馈转换留在 `model-execution`，不得让解码包直接创建 RuntimeFeedback。

`model-response` 同时收拢原 `model-output.ts` 的文本解析和执行器中的原生工具参数解析、调用数/身份检查、Think 空白/工具调用拒绝、Decide 控制分支及完成审查输出检查。它接收阶段、期望原生身份和本次请求提供的契约/声明等必要约束，不接收完整 Binding 或 Goal，不自行重新推导工具可见性。不把只移动旧解析文件视为完成提炼。既有 `LLMResponseProtocolError` 及错误码只有一个定义；与业务无关的流完成协议错误由 `model-call` 使用同一错误类型报告。

`model-call` 只拥有一次调用的执行与观察：应用当前输出上限、保存最终输入、记录调用开始/结束、调用 `generate` 或消费 `stream`、发布既有可见性事件、返回最终响应与 callId/起始时间等关联信息。消息来源归类和调用身份沿用原规则；为独立调用收窄记录上下文时，不改变消息顺序、来源或记录内容。解码失败由协调层使用同一 callId 调用最小诊断入口，不在解码包中写日志，也不另建 Hook 或记录框架。

完整输入存储失败阻止当前调用；诊断/指标失败保持 best effort，记录顺序与时长口径保持。取消后不继续解码；流必须按原规则提供最终完成响应，缺失或重复完成仍报错。完成审查沿用禁止公开活动内容的投递约定，不能因为抽出调用包而默认公开。`model-call` 不选择模型、不持有可变 Binding、不实现请求重试或外部资源关闭；上述调用依赖仍为借用。

Binding、Loader、Environment、注册表、Section Diff、完成审查、日志和指标均作为所属包内组件，不继续各建一个包。三个阶段复用同一调用能力；不建立三个重复的传输或记录实现。

### 独立消费与接入

| 调用场景 | 提供与取得的内容 | 验证边界 |
| --- | --- | --- |
| 独立预算 | 调用方提供文本/结构化候选、完整单元和计量策略，取得预算与保留范围 | 只消费 `context-budget`，不构造 Goal、模型 View、Store 或模板 |
| 表示消费 | Renderer 和请求组件直接引用 `model-view` 的输入/结果类型 | 类型验证不解析 Runtime 或历史实现，不建立并行 DTO |
| 上下文分析 | 调用方提供 Goal/历史 Port 与预算，取得 View、历史选择与预算结果 | 不启动模型、模板引擎或应用 |
| 渲染试验 | 调用方通过 `prompt-renderer` 提供内存模板、Manifest、Section 定义与 View，取得确定性文本 | 不依赖默认 Bundle、Runtime 或模型凭据 |
| 默认 Prompt | 调用方通过 `prompt-bundle` 加载当前资产与定义，获得装配的 Renderer | 只显式加载本包资源，不读取历史 frame |
| 请求检查 | 调用方提供现有阶段输入、上下文组件与 Renderer，取得 request/bundle/frame | 不调用模型、不写调用记录 |
| 响应检查 | 调用方通过 `model-response` 提供最终响应及对应契约/阶段约束，得到结果或协议错误 | 无 Adapter、Binding、Goal 或存储 |
| 单次模型调用 | 调用方通过 `model-call` 注入确定性 Adapter、请求与记录上下文，取得最终响应及 callId | 不构造执行器，不选择模型，不解码业务结果 |
| 模型执行 | 调用方注入确定性 Adapter、Binding 和记录 Port，取得阶段结果与记录后果 | 直接使用 `model-execution`，无 `agent` 依赖 |
| 默认运行 | goal-server 与 Headless Composition Root 使用 `createAgentExecutor`，按需显式提供已有 Renderer/Compactor | 复用当前 Runner 与生命周期，不另建执行链 |

现有跨包消费者经目标包 `src/index.ts` 调用；包内单元测试可访问自身内部实现。跨包集成测试通过公共入口验证边界，不以测试使用内部文件的方式规避入口限制。新入口只导出已有消费者或上述独立场景实际需要的符号，不照搬当前 Agent 根入口全集，也不删除与本轮无关的既有行为。

组件单元测试随所有者迁移：渲染机制、默认内容、Section 更新计划、响应解码、单次调用和执行协调分别在所属包验证；Binding 与跨组件恢复测试归执行包或相应消费者；`agent/test/` 验证默认装配与覆盖注入。共享 fixture 按实际测试所有者或集成场景整理，不新建生产依赖测试文件的路径。评测脚本、基线生成脚本及其命令引用同步迁移，不运行付费模型来证明结构等价。

Benchmark 的模板清单、内嵌键与构建引用同步指向新资产位置；所需模板子集沿用其现有有效规则，不把所有 Worker 强制改成同一子集。构建摘要因源码和资源路径变化可以变化；保留现有摘要/缓存校验逻辑，以新源码重建并验证，不能复用旧产物宣称迁移成功。

### 机器约束、文档与验证证据

扩展现有 `scripts/check-dependencies.mjs` 及其 fixture 测试，登记新包和消费者，迁移现有 View/Renderer 文件规则，并检查九包和 `agent` 的依赖、入口及源码/产物边界。特别覆盖预算反向依赖 View、View 依赖 Runtime/历史实现、渲染包依赖默认 Bundle/Runtime、默认 Bundle 依赖请求差异计算、解码包依赖 Runtime/调用层、调用包依赖 Binding 和实现类型泄漏的反例。使用适合现有工具链的静态语法识别，包含类型位置；不承诺任意计算型模块路径或运行时安全沙箱。

新包保持私有、直接源码消费，遵循当前 manifest 与依赖安装方式。Nunjucks 依赖从 `agent` 迁至 `prompt-renderer`，模板真源留在 `prompt-bundle`；按实际变更更新对应锁文件，不顺带升级依赖。新包源码、测试、模板加载和 Worker bundle 的发现分别验证，不以目录存在或测试总数替代发现证据。

在实现前用现有确定性 fixture 保存可比较的请求、契约、Section frame 和阶段后果；迁移后的测试沿用断言，新增独立入口与禁止依赖的正反例。比较可以规范化随机调用 ID、时间等非确定字段，但不得去掉模型内容、来源、顺序、身份配对或预算/错误语义。现有失败不得通过删测试、改期望或重新生成基线消除。

验证覆盖九包的适用类型/行为检查与装配单测、源码副本独立消费、goal-server 与 Headless 集成、原生历史/Section 恢复、Worker 实际打包与本地确定性消费、依赖规则 fixture。预算测试验证算法及边界，View 使用类型消费和依赖规则验证纯表示，历史组装测试继续验证提交来源与结果；渲染测试不加载默认内容，Bundle 测试核对现有内容/协议，Section 更新测试核对基线与 frame；解码测试覆盖现有文本/原生阶段分支，调用测试覆盖日志门、取消、流与记录故障，协调测试核对同一 Binding 和契约贯穿全链。不为无运行时逻辑的 DTO 编写重复字段的测试。最终执行当前 `npm test`、goal-server 类型检查、文档检查及受影响 Web/Worker 回归；Plan 明确各命令及其覆盖关系。真实 Provider、完整 Benchmark 数据运行和 GEPA 优化不属于本轮验收。

各新包维护短 README、`notes/overview.md` 与 `notes/semantics.md`，实现公共契约在源码 TSDoc。当前模块文档按所有权迁移并更新读者链接；Spec 只描述拟交付契约。历史 Spec 和 Memory 不自动改写或取得当前实现权威，Memory 后续维护通过独立流程进行。

## 曾考虑的备选方案

- **仅在 Agent 内建立目录**：改动较少，但仍由同一包统一承载与导出能力，无法满足本轮明确要求的包级独立消费与 `agent` 只做装配。
- **三个能力包、执行器留在 Agent**：执行逻辑、Binding、记录与默认装配继续共处，不能独立消费模型执行；本轮明确选择将执行器一起提炼。
- **四包方案，把预算、模型表示与历史组装放在 model-context**：迁移较少，但 Prompt 和预算使用者仍面向混合职责包，纯 DTO 对算法实现的引用也被包边界掩盖；本轮选择 `context-budget`、`model-view` 和 `model-context` 三个有现存消费者的角色。
- **六包方案，把渲染与默认内容、请求与解码、阶段协调与调用记录分别放在同一包**：消费者仍需面对混合职责，内存渲染、离线响应检查和单次调用不能获得独立包边界；本轮进一步形成 `prompt-renderer`、`model-response` 和 `model-call`，Section 差异计算归已有请求包，不单独增加差异包。
- **进一步为 Hot、Warm、每个选择器各建一个包**：这些实现共同维护提交边界和完整执行单元语义，目前没有额外独立消费需求，继续分包会增加跨包协调面。
- **独立 Binding、审查、日志、指标及模板内部组件包**：这些职责在当前调用中已有明确所有者，继续分包增加生命周期和类型协调；本轮只建立上述九个能力包，不按每个 helper 或阶段分包。
- **向 model-contracts 搬入全部输入类型**：扩大既有输出/对话协议核心职责；当前模型输入与历史结果表示由 `model-view` 独立拥有，不新建涵盖所有领域的通用 DTO 包。
- **Agent 保留全部旧路径转导出**：能少改消费者，但会继续把 Agent 当作事实入口并掩盖未迁移调用；本轮为私有源码整体迁移，不提供该兼容面。
- **同时替换上下文算法、Prompt 文本或模型执行策略**：可能减少局部复杂度，但无法把行为差异归因于拆包，超出本次保持行为的范围。
- **立即发布九个 npm 包并消费构建产物**：发布版本、exports 和资源封装尚无当前需求；先验证仓库内真实消费，避免把打包机制当成组件边界。

## 风险与否定性保证

- **风险等级：高。** 影响多个生产入口、模板内嵌与请求恢复链；风险来自广泛迁移和隐式资源路径，而非新增权限能力。通过原有断言、等价证据、实际 Worker 打包及两类宿主回归控制影响。
- **包循环与表示泄漏。** 序列化、预算、View、历史投影、Prompt 与 Binding 的交叉引用必须按上述归属解开；表示契约从实现文件迁出时保留字段值域和来源语义。不能靠类型转导出、扩大依赖白名单、放宽类型或复制 DTO 绕过边界，尤其不能保留隐藏在 `import("...")` 中的 Runtime DTO 依赖。
- **分包后的调用一致性。** 阶段协调、请求契约、调用身份和响应解码必须属于同一次固定 Binding；不得在调用包重新读取模型选择，在解码包重新构造不同 Schema，或把解码失败计成另一次模型调用。流完成错误与响应协议错误保持既有分类，诊断与指标故障不能改变接受条件或暴露审查内容。
- **状态权威不迁移。** 新包不取得 Goal/Run 推进、授权、工具执行、重试预算、检查点提交或恢复决策权；不恢复已移除的后台 Compact 模型、Warm Sidecar 或维护 Worker。
- **数据与模型语义不迁移。** 不改变模板正文、系统声明、工具可见交集、协议版本、Schema 或持久化结构，不新增历史数据兼容分支；构建摘要变化与数据协议变化分开处理。
- **资源与失败保持。** 模型执行包只借用现有依赖，不擅自关闭宿主资源；拆包不提供外部副作用回滚、exactly-once 或多租户隔离保证。
- **独立 Spec 的接入重叠。** 模型装配可在原组合根或已提炼的无界面装配中接入，只修改模型依赖、执行器构造及对应消费引用，保留当时已有的进程资源登记、实例受理和关闭接线。依赖门、锁文件与导航只维护本次所属条目，合并时保留其它规则。三份 Spec 共用文件不等于功能前置，本轮仍不重写关闭语义或扩大 Benchmark Runtime 迁移；分支与集成顺序留给具备审批前置的编排。
- **操作边界。** 实现与验证只操作源码、临时数据和受控替身；不删除用户 Goal、不清理用户构建目录、不调用付费模型、不启动真实评分任务。本阶段仅生成 Spec，批准后进入 Plan。

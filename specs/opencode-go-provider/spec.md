---
status: proposed
created_at: 2026-10-16
supersedes: []
superseded_by: null
---

# OpenCode Go 供应商接入 Spec

## 目标与范围

让 LazyGoal 原生支持 OpenCode Go 订阅，使既有统一模型链路（TUI/Web Goal 会话、benchmarks、GEPA 反思 LM）可以直接选择并调用 OpenCode Go 提供的模型。

接入方式是**先升级 pi-ai 依赖、再用 pi-ai 直通**：pi-ai `1.3.0` 的 `opencode-go` provider 已把端点对齐官方 `https://opencode.ai/inference/go`，并内建 `withOpenCodeSessionHeader` 会话头包装；LazyGoal 只需注册该 provider、传入稳定会话身份，并覆盖自有 User-Agent，即可满足官方客户端规范。本功能不新增原生 strict 适配器，因此 opencode-go 走 `prompt_only`，与现有 `anthropic`/`deepseek`/`openrouter` 一致。

**范围边界（Non-goals）**：

- 不接入 OpenCode Zen（`opencode` 供应商）。
- 不为 OpenCode Go 新增原生 strict / 多协议分发适配器。
- 不放开 `PiAiAdapter` 的 prompt_only 限制（尽管 pi-ai 1.3.0 目录已标注 `supportsStrictMode: true`）。
- 不支持 `base_url` 覆盖；不改变其它供应商的请求行为、UA 或会话头。
- 不改变 Goal Snapshot、Trajectory、Trace 的既有结构与写入语义。

## 需求与验收标准

### R1. 升级 pi-ai 依赖并保持既有供应商回归

作为维护者，我希望先把 pi-ai 升级到提供官方端点与内建会话头的版本，以便 opencode-go 接入建立在受官方文档背书的端点上。

1. <a id="spec-req-1-1"></a>系统必须把 `@earendil-works/pi-ai` 从当前的 `0.85.1` 升级到 `1.3.0`（已核实的当前版本），且升级必须发生在接入 `opencode-go` 之前。
2. <a id="spec-req-1-2"></a>升级完成后，`opencode-go` 的模型目录 baseUrl 必须为官方端点 `https://opencode.ai/inference/go`（`0.85.1` 的 `https://opencode.ai/zen/go` 不再使用）。
3. <a id="spec-req-1-3"></a>升级不得改变现有五个供应商（`openai`、`google`、`anthropic`、`openrouter`、`deepseek`）的可观测行为；现有 pi-ai、provider、catalog 与 benchmark 相关测试必须全部通过。
4. <a id="spec-req-1-4"></a>若升级引入对现有供应商的破坏性变更，必须先修复或迁移到行为等价，再接入 `opencode-go`；不得以"只影响新供应商"为由跳过回归。

### R2. 注册并可用 opencode-go 供应商

作为 LazyGoal 用户，我希望以 `opencode-go` 选择 OpenCode Go 模型并发起调用，以便用订阅访问其模型。

1. <a id="spec-req-2-1"></a>当 `LLM_PROVIDER`（或 `[llm] provider`）为 `opencode-go` 且提供了模型与 API Key 时，系统应当经现有统一入口构造模型适配器，并能在 Goal 会话链路中成功发起一次生成。
2. <a id="spec-req-2-2"></a>供应商标识必须为 `opencode-go`，与 pi-ai provider id 及官方 `opencode-go/<model-id>` 引用前缀一致；每个模型的调用协议必须由 pi-ai 目录决定（`anthropic-messages` / `openai-completions` / `openai-responses` / `google-generative-ai`），不推断协议。
3. <a id="spec-req-2-3"></a>opencode-go 的输出模式必须固定为 `prompt_only`；当 `structured_output_mode` 被配置为 `strict` 或 `two_stage` 时，系统必须在产生 Store、Goal 或网络副作用之前快速失败，并给出明确错误。
4. <a id="spec-req-2-4"></a>当 OpenCode Go 请求失败时，系统应当沿用现有 pi-ai 适配器边界：仅把限流、临时服务、连接与超时故障映射为可识别的暂时失败，不执行内部重试。
5. <a id="spec-req-2-5"></a>因为 opencode-go 是 prompt_only，其 Think 与 Decide 阶段均使用 prompt_only；Decide 的原生工具通道沿用现有 prompt_only 供应商语义。

### R3. 满足 OpenCode Go 官方客户端规范

作为订阅用户，我希望客户端行为符合 OpenCode Go 的规范，以便获得稳定路由与 prompt 缓存收益、避免被判定为异常客户端。

1. <a id="spec-req-3-1"></a>当 PiAiAdapter 以 `opencode-go` 发起请求时，系统必须发送标识 LazyGoal 自身的 User-Agent，而不是 pi-ai 默认的 `pi (...)` UA。
2. <a id="spec-req-3-2"></a>当同一 Goal 发生多次模型调用时，系统必须发送稳定一致的 `x-opencode-session`，其取值来自该 Goal 的稳定身份（`goal.id`），并在同一 Goal 的跨 Run 与进程重启后保持不变。该头的发送由 pi-ai 依据传入的 `sessionId` 自动完成。
3. <a id="spec-req-3-3"></a>User-Agent 与 `x-opencode-session` 的注入必须仅作用于 `opencode-go`；其它供应商的请求头与行为保持不变。
4. <a id="spec-req-3-4"></a>当请求不携带稳定会话身份时（例如非 Goal 上下文的直接调用），系统应当仍发送自有 User-Agent，并且不得发送空的 `x-opencode-session`。

### R4. 模型目录与在线发现

作为用户，我希望 `/model` 能反映我的账号当前可用的 OpenCode Go 模型，且离线时仍可用。

1. <a id="spec-req-4-1"></a>静态模型目录必须来自升级后 pi-ai 的 `opencode-go` 目录，包含模型标识、展示名、上下文与输出上限、推理/视觉能力；在无网络时仍可用于选择与容量校验。
2. <a id="spec-req-4-2"></a>当凭据可用时，系统应当经现有模型目录组件在线列出 OpenCode Go 可用模型（`GET https://opencode.ai/inference/go/v1/models`），并用静态目录补全缺失元数据。
3. <a id="spec-req-4-3"></a>在线发现失败必须遵循现有降级规则：鉴权、权限、协议与取消错误禁止降级并如实上报；超时、服务不可用与端点不支持允许降级到静态目录。
4. <a id="spec-req-4-4"></a>id-only 模型列表的解析必须由共享的解析逻辑承担，使 opencode-go 与 `openai`/`deepseek`/`openai-compatible` 使用一致的协议错误语义，而不是各自复制一份。

### R5. 请求级会话身份契约

作为 Runtime 调用方，我希望有一个显式、可在请求级传递的会话身份，以便供应商会话感知能力被正确驱动。

1. <a id="spec-req-5-1"></a>`LLMRequest` 必须新增可选 `sessionId`；未提供该字段时，所有现有适配器的行为与请求形态保持不变。
2. <a id="spec-req-5-2"></a>Runtime 的统一模型调用路径在 Goal 上下文中必须以 `goal.id` 填充 `sessionId`，`PiAiAdapter` 在 opencode-go 下把它作为 pi-ai 的 `sessionId` 传入。
3. <a id="spec-req-5-3"></a>该会话身份不得写入 Goal Snapshot、Trajectory 或 Trace 的模型上下文。

### R6. 文档与一致性

作为维护者，我希望模块文档与当前实现保持一致。

1. <a id="spec-req-6-1"></a>新增或变更的供应商职责、输出模式与端点说明必须同步到 `packages/llm` 与 `packages/config` 的 `notes/overview.md` 及其语义表；pi-ai 升级带来的目录/兼容性变化必须一并说明。
2. <a id="spec-req-6-2"></a>`npm run check:docs` 必须通过。

## 架构与核心决策

### 系统拓扑与接口

```
config.readLLMConfig / loadRuntimeConfig
        │  provider: "opencode-go"  (prompt_only)
        ▼
llm.factory.createLlmAdapter / createLlmStageAdapters
        │  prompt_only → PiAiAdapter
        ▼
llm.pi-ai.PiAiAdapter ── pi-ai opencodeGoProvider()   [@earendil-works/pi-ai 1.3.0]
        │  ・目录: OPENCODE_GO_MODELS (cost/context/maxTokens/api)
        │  ・协议: anthropic-messages | openai-completions | openai-responses | google-generative-ai
        │  ・端点: https://opencode.ai/inference/go   (官方端点)
        │  ・会话头: withOpenCodeSessionHeader 依据 options.sessionId 自动补 x-opencode-session
        ▼
options: { sessionId: <goal.id>, headers: { "User-Agent": <lazygoal UA> } }   // UA 仅 opencode-go 覆盖

llm.model-catalog.DefaultLlmModelCatalog
        ├─ STATIC_FACTORIES[opencode-go] = opencodeGoProvider
        └─ llm.provider-fetchers.DefaultProviderModelFetcher
                 └─ parseIdOnlyModelList(json, { provider, acceptModelsKey, allowStringItems })
```

关键契约变更（最小且向后兼容）：

- 依赖：`@earendil-works/pi-ai` `0.85.1` → `1.3.0`。
- `LLMProvider` 联合新增 `"opencode-go"`；`LLMConfig` 落入与 `anthropic`/`deepseek`/`openrouter` 相同的分支（无 `baseURL`，可选 `maxOutputTokens`）。
- `LLMRequest` 新增可选 `sessionId?: string`。

### 核心决策

- **D1. 先升级 pi-ai，再直通复用**：`0.85.1` 的 opencode-go 目录指向未在官方文档出现的 `/zen/go`；`1.3.0` 已把 baseUrl 对齐官方 `/inference/go`，并内建 `withOpenCodeSessionHeader`。因此升级同时消除了端点风险并省去自建会话头注入，是当前需求下最优路径。
- **D2. 端点由升级后的 pi-ai 提供**：opencode-go 各模型 baseUrl 为 `https://opencode.ai/inference/go`（openai-completions/responses/google-generative-ai 追加 `/v1`），与官方文档一致。LazyGoal 不覆盖该 baseURL，也不支持 `base_url` 配置。
- **D3. 会话头交由 pi-ai，UA 由 LazyGoal 覆盖**：pi-ai 1.3.0 的 `withOpenCodeSessionHeader` 在收到 `options.sessionId` 时会自动补 `x-opencode-session`（若调用方已显式提供该头则不重复）。因此 LazyGoal 仅需在 opencode-go 下传入 `sessionId` 并通过 `options.headers` 覆盖自有 User-Agent；其余供应商不传 `sessionId`、不注入 UA。
- **D4. 会话身份经 `LLMRequest.sessionId` 传递**：adapter 按“模型选择”而非按 Goal 构造，同一服务器进程多 Goal 共享，故会话身份必须在请求级传入。Runtime 统一调用路径以 `goal.id` 填充，`PiAiAdapter` 仅在 opencode-go 下把它映射为 pi-ai `sessionId`。
- **D5. 目录与发现复用现有组件**：`DefaultLlmModelCatalog` 用 `STATIC_FACTORIES` 补全静态元数据，`DefaultProviderModelFetcher` 负责在线发现。opencode-go 的 `/v1/models` 为 OpenAI 风格 `{data:[{id}]}` + `Authorization: Bearer`，故抽出共享的 id-only 解析并由四个同形分支复用；Google/Anthropic/OpenRouter 的端点与分页差异保留在各自分支。
- **D6. 模式与接入面统一**：`decideModeForProvider` 对 opencode-go 返回 `prompt_only`，`createReflectionLlmAdapter` 亦回落到 `createLlmAdapter`，因此 TUI/Web、benchmarks 与 GEPA 反思 LM 无需分面改造即可获得该供应商；配置层要求其 `structured_output_mode` 为 `prompt_only`。

## 曾考虑的备选方案

1. **不升级 pi-ai，沿用 0.85.1 直通**：**落选原因**：其 opencode-go 端点为无官方文档背书的 `/zen/go`，存在断链风险，且不内建 `x-opencode-session`，需自行注入会话头；升级后这两点均被官方对齐消除。
2. **官方原生直连（路径 C）**：新增原生 Anthropic Messages 与 OpenAI Responses 适配器，按模型分发到四个 API 族以获得更全的 strict 能力。**落选原因**：需自建两套适配器与目录/分发，工作量与维护成本显著高于升级 pi-ai；可作为后续按需增强。
3. **原生 openai-compatible / Gemini 混合覆盖（路径 B）**：仅用现有原生适配器覆盖 Go 的 openai-compatible 与 gemini 模型以拿到 strict。**落选原因**：只覆盖子集，且与 pi-ai 直通相比并未减少总体接入面；不与本次目标（全量可用）对齐。
4. **同时接入 OpenCode Zen（`opencode`）**：**落选原因**：用户请求聚焦 Go 订阅；Zen 是另一个端点与模型集，属独立范围。
5. **不抽象、仅新增 opencode-go 分支**：直接复制 `fetchOpenAi` 的解析。**落选原因**：第 4 个同形状消费者已出现，复制会扩散 id-only 协议错误语义并增加维护点。
6. **全量策略注册表**：把六个 provider 的端点/鉴权/解析数据化。**落选原因**：Google/Anthropic/OpenRouter 形状各异，强行统一制造间接层，违反“无当前需求不抽象”。
7. **把会话身份放到 `LLMConfig` 或 adapter 构造**：**落选原因**：配置按供应商而非按 Goal，adapter 按模型选择构造并被多 Goal 共享，均无法承载每会话稳定身份。
8. **依赖 pi-ai 默认 UA 与会话头（放弃精确合规）**：**落选原因**：与用户“要求合规”的决策冲突；pi-ai 默认 UA 为 `pi (...)`，未标识 LazyGoal（会话头虽已内建，但 UA 仍需覆盖）。

## 风险与否定性保证

- **风险等级：中。** 前置的 pi-ai 大版本升级（`0.85.1` → `1.3.0`）会触及 `openai`/`google`/`anthropic`/`openrouter`/`deepseek` 全部既有供应商，且目录格式（`chat:` 前缀、`type` 字段）与依赖版本已变化；本功能还新增公开供应商枚举与 `LLMRequest` 契约字段。通过"升级在前、回归通过后再接入"的顺序、集中式判定点，以及仅对 opencode-go 生效的条件注入控制。
- **待确认（需实现阶段验证）**：升级后必须用真实 OpenCode Go Key 实测 `/inference/go` 端点与 `x-opencode-session` 是否按预期生效；若 pi-ai `1.3.0` 的 API 形状（`createModels`/`getModel`/`completeSimple`/`streamSimple`/`api/*` 子路径）与 LazyGoal 现有用法存在不兼容，需在升级任务内一并迁移到行为等价。
- **待确认**：自有 User-Agent 的版本号来源（应用构建常量或固定标识）在 design 阶段确定；缺失版本时退化为纯标识。
- **待确认**：pi-ai `1.3.0` 目录与官方文档在模型代际上的差异使 `/model` 展示以"升级后 pi-ai 静态目录 + 在线发现"为准；spec 不承诺与文档列表逐字一致。
- **否定性保证**：
  - 任何 API Key、Authorization 头或会话身份不得写入 Goal Snapshot、Trajectory 或 Diagnostic Trace。
  - 仅 `opencode-go` 请求注入自有 UA 并传入 `sessionId`；其它供应商的请求头、UA 与协议行为不得改变。
  - 不得在 strict/two_stage 被请求时静默降级为 prompt_only 并继续；必须在副作用前失败。
  - 不得发送空的 `x-opencode-session`。
  - 鉴权、权限、协议或取消错误禁止触发目录降级；不得用静态目录掩盖凭据故障。
  - pi-ai 升级不得以牺牲既有供应商行为等价为代价换取 opencode-go 可用性。

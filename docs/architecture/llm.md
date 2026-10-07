# LLM 模块

## 职责与调用

LLM 模块负责供应商通信。`LLMAdapter.generate` 接收有序文本或原生工具消息，返回正文、
独立 reasoning 摘要、工具调用、续接字段及诊断 metadata；可选的 `stream` 将 Provider 增量归一化为供应商无关事件，由 Agent
适配到 `@lazygoal/execution-stream`；Agent 负责 Prompt、JSON 结构和语义校验，Runtime 负责工具、状态与恢复。
CLI、ALFWorld 和 smoke 的 Home/workspace 路径、TOML/Profile 配置解析、常规运行配置加载及显式环境模型配置来自 `@lazygoal/config`。GEPA 专用双模型加载入口暂由 LLM 提供，迁移完成前具体实现见
[GEPA 配置加载器](../../packages/llm/src/config-loader.ts)。模型解析在创建 Goal、Store 或 sidecar 前完成，具体实现见

[工厂](../../packages/llm/src/factory.ts)。
Adapter 构造时固定输出模式，不自动降级或切换 provider。

| Provider | `prompt_only` | `strict` |
| --- | --- | --- |
| `openai` | pi-ai OpenAI Responses | 原生 OpenAI Chat Completions |
| `google` | pi-ai Gemini | 原生 Google Gen AI |
| `anthropic`、`openrouter`、`deepseek` | pi-ai 对应 provider | 配置错误 |
| `openai-compatible` | pi-ai Chat Completions | 原生 OpenAI-compatible |

Runtime 使用 `createLlmStageAdapters` 为同一 selection 绑定 Think/Decide Adapter 对：Think 固定
`prompt_only`；Decide 在 OpenAI、Google、OpenAI-compatible 上固定 `strict`，在 Anthropic、
OpenRouter、DeepSeek 上固定 `prompt_only`。`two_stage` 可与所有当前 Provider 一起配置；它表示
Runtime 阶段绑定策略，不要求两个 Adapter 使用相同的结构化输出模式。显式单阶段 `strict` 在不支持
原生 strict 的 Provider 上仍是配置错误。

[PiAiAdapter](../../packages/llm/src/pi-ai.ts) 使用锁定版本的目录，并将 SDK 的 text/thinking/tool-call 增量转换为统一流事件；`generate()` 仍只返回完整响应。
前置 system 消息按顺序合并，user/assistant 顺序不变；中途 system 消息被拒绝。
只返回正常结束的文本，隔离 thinking，拒绝截断、错误、意外工具调用及其它非完成状态。
空文本仍交给 Agent 拒绝；不在 Adapter 修复 JSON。Adapter 只将限流、暂时性 5xx、连接和超时映射为类型化暂时故障，其他错误保持失败；OpenAI 与 Gemini SDK 内部重试已关闭，避免与 Runtime 调用上限叠加。

所有 Adapter 在请求前后检查取消信号并传入 SDK。取消统一为 `@lazygoal/execution-control` 的 `ExecutionAbortedError`；
pi-ai 返回型失败转换为 `PiAiProviderError`；可识别的暂时 Provider/传输异常映射为 `@lazygoal/execution-control` 的 `TransientModelRequestFailure`，LLM 模块不依赖 `@lazygoal/runtime`。
请求与模式不匹配时抛出 `LLMRequestModeMismatchError`。
原生 Adapter 在无工具请求中将 strict 映射为 OpenAI `response_format.json_schema` 和 Gemini `responseSchema`；Decide 挂载工具时只使用函数参数 Schema，不同时发送顶层决策 Schema。
Gemini strict 输出将决策判别联合打平为带 `nullable: true` 的全量 required 扁平对象，从语法机源头约束
`action` 等关键字段生成；逆向投影剥离非目标分支字段并恢复空值与证据哨兵值，再交由 Wire Contract 校验。
端点拒绝 Schema 或返回非法决策时明确失败，不自动降级。
strict 仍需经过同一套本地校验。公开契约见 [adapter.ts](../../packages/llm/src/core/adapter.ts)。

[LlmModelCatalog](../../packages/llm/src/model-catalog.ts) 负责当前 Provider 的模型发现与能力补全，默认组合 [DefaultProviderModelFetcher](../../packages/llm/src/provider-fetchers.ts) 进行在线发现：
- 适配 OpenAI、Google、Anthropic、OpenRouter、DeepSeek 与 `openai-compatible` 的官方/配置端点与专属鉴权头；
- Google (`pageToken`) 与 Anthropic (`has_more` / `last_id`) 支持安全完整分页，拒绝不递进或循环 cursor；
- 共享 5000ms 超时与外部取消，并以 pi-ai 静态目录补充上下文容量、展示名与视觉能力；
- 模型容量可缺省：字符预算模式允许选择缺少上下文容量或输出上限的模型；Token 预算模式仅允许同时具备两项容量的模型，且输出上限须小于上下文容量；
- 网络故障、超时或端点不支持 (404/405/501) 允许静态目录或配置兜底；鉴权 (401)、权限 (403) 与协议非法错误坚决拒绝且不静默降级；
- 所有异常与日志严格脱敏，不复制任何 API Key、Authorization 头或敏感响应正文。

## 配置

常规 TOML/Profile 与运行配置由 [`@lazygoal/config`](./config.md) 加载；LLM 消费校验后的 `LLMConfig`，不拥有系统级配置文件解析。GEPA 双模型加载入口的迁移尚未完成。

运行要求 Node ≥22.19.0。系统使用统一的 LazyGoal Home：`LAZYGOAL_HOME` 必须是绝对路径，缺失或空白时回退至 `$HOME/.lazygoal`；`XDG_CONFIG_HOME` 不参与解析。按“内置默认值 → `config.toml` → `profiles/<profile>.toml` → CLI 临时参数”四层单向合并加载运行时配置；同时兼容显式传入的进程环境变量。必填 `provider`、`model`、`api_key`；`structured_output_mode` 省略时默认为 `prompt_only`，也可显式设为 `strict` 或 `two_stage`。Runtime 阶段绑定按 Think/Decide 角色确定实际 Adapter 输出模式。

```toml
# ~/.lazygoal/config.toml
[llm]
provider = "openai"
model = "gpt-4o"
api_key = "sk-..."

[profile]
active = "default"
```


```dotenv
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5
LLM_API_KEY=your-api-key
```

`openai` 和 `google` 可用 `LLM_BASE_URL` 覆盖端点，未设置时使用官方地址；`openai-compatible`
必须提供 HTTP(S) `LLM_BASE_URL`。其他 provider 不接受端点覆盖。
Google 在两种输出模式下均将其视为完整 API 前缀（含所需版本路径），
直接追加 `/models/{model}:generateContent` 或流式方法，不额外追加 API 版本。
例如代理使用 `/v1beta` 时，应配置 `https://proxy.example/v1beta`；端点须支持 Google 原生协议。
标准 provider 的 prompt_only 模型必须存在于固定目录，strict 原生路径接受供应商模型名。

自定义兼容服务使用文本 Chat Completions，需显式设置 `LLM_CONTEXT_WINDOW_TOKENS`
与 `LLM_MAX_OUTPUT_TOKENS`，输出上限须小于上下文窗口；不声明 reasoning 能力或估算费用。
CLI 使用这些容量启用既有 token 预算时，还需 `LLM_TOKENIZER_ENCODING`（`cl100k_base`
或 `o200k_base`，按模型选择；不能将不匹配的 tokenizer 当作供应商精确计数）。
目录不自动改变上下文裁剪或 tokenizer；配置的输出上限不得超过所选目录模型上限。
请求显式上限优先于 Adapter 配置；两者都缺省时沿用 SDK 行为。

### GEPA 双模型边界

GEPA 生命周期固定使用两个互不复用的 LLM 配置：Working LM 从 LazyGoal Home 的
`profiles/default.toml` 解析，负责候选 Profile 的 benchmark Agent 执行；Reflection LM
由主 `config.toml` 的 `[gepa].reflection_profile` 指定的另一个 Profile 解析，固定为
`prompt_only`，只负责根据有界评测信息生成反思文本。Reflection Profile 不能缺失、不能
命名为 `default`，也不能以路径穿越或非法 Profile 名绕过配置边界。

`loadGepaModelConfigs` 在产生模型调用前同时校验两侧配置；Prompt Evaluation 请求只携带
`configId` 与 `modelId`，凭据仍由 LazyGoal Home Profile 加载。生命周期 Run manifest 冻结两侧模型
身份，恢复时若任一身份漂移即拒绝恢复。Reflection bridge 不进入 Working Agent 的 Tool
循环，不将 Reflection LM 失败降级为 Working LM。

## 诊断与限制

原生 Adapter 的真实上报计数写入 `providerMetadata.usage`，缺失时省略。
pi-ai 不能证明计数是否真实上报，故只写非权威 `piUsage` 数值，始终省略 `usage`；
benchmark 将这些调用计入 `missingCalls`。Trace 对 metadata 脱敏限长；metadata 不进入
Goal Snapshot、Domain Event 或模型上下文。不保存认证头或完整 SDK 响应。原生响应正文、公开 reasoning 摘要和必要续接字段单独随接受的阶段事实保存到 Trajectory，不属于诊断 metadata。

原生 OpenAI Chat Completions 与 Gemini 支持 assistant 工具调用和配对结果回传。Adapter 身份绑定 provider、端点、模型与协议；正文与公开 reasoning 摘要分离，Gemini 原始 Parts 和不透明签名按顺序保存。OpenAI 回传明确返回的 `reasoning_content` 扩展字段，不把摘要当作正文。OpenAI 禁止并行调用，Agent 在动作解码前要求 Decide 恰好一个调用、Think 无调用。

当前仅支持文本、函数工具与显式 API Key；不支持 Responses reasoning items、其他多模态 Part、OAuth、云身份或 reasoning 强度配置。pi-ai 保持既有语义历史，不接收原生 Adapter 的续接载荷。自定义兼容服务的 pi-ai 路径须支持流式 Chat Completions。

GEPA 的 `start` 与 `resume` 属于显式付费操作：控制面在调用模型或 benchmark 前要求
`--yes`，上层 smoke 还必须向操作者显示 Working/Reflection 模型、预算和目标 Profile
副作用。默认回归使用 fake Working CLI、fake Reflection LM 和临时目录；真实双模型路径
仅由显式 smoke 触发。

`npm run llm:agent-smoke` 读取 `.env` 和进程环境，真实执行统一任务提案、任务批准、
一次无副作用的 `smoke_evidence` 工具调用及完成，并验证 Observation 证据。
只使用内存存储；SIGINT 取消调用并返回 130。该命令会产生费用，不属于自动化回归。
成功、失败或取消输出包含 provider、model 和 mode；凭据缺失时不代表已验证。

`npm run llm:native-dialogue-smoke` 使用显式 OpenAI/OpenAI-compatible/Google 环境配置，产生两次真实模型请求，验证首轮工具结果能原生回传到第二轮。工具只返回固定证据，不修改工作区。该付费 smoke 不进入自动回归；未运行或缺少凭据时不得报告供应商端到端验证通过。

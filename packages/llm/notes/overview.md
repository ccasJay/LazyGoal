# 模型适配

供应商通信、统一消息和增量流；Prompt 校验和运行状态分别归 Agent 与 Runtime。本文描述当前实现、使用边界与限制。


## 职责与调用

LLM 模块负责供应商通信。`LLMAdapter.generate` 接收有序文本或原生工具消息，返回正文、
独立 reasoning 摘要、工具调用、续接字段及诊断 metadata；可选的 `stream` 将 Provider 增量归一化为供应商无关事件，由 Agent
适配到 `@lazygoal/execution-stream`；Agent 负责 Prompt、JSON 结构和语义校验，Runtime 负责工具、状态与恢复。
CLI、ALFWorld 和 smoke 的 Home/workspace 路径、TOML/Profile 配置解析、常规运行配置加载及 GEPA 双模型加载均来自 `@lazygoal/config`。模型解析在创建 Goal、Store 或 sidecar 前完成，具体实现见
[配置架构](../../config/notes/overview.md) 与
[工厂](../src/factory.ts)。
Adapter 构造时固定输出模式，不自动降级或切换 provider。

| Provider | `prompt_only` | `strict` |
| --- | --- | --- |
| `openai` | pi-ai OpenAI Responses | 原生 OpenAI Chat Completions |
| `google` | pi-ai Gemini | 原生 Google Gen AI |
| `anthropic`、`openrouter`、`deepseek` | pi-ai 对应 provider | 配置错误 |
| `openai-compatible` | pi-ai Chat Completions | 原生 OpenAI-compatible |

Runtime 使用 `createLlmStageAdapters` 为同一 selection 绑定 Think/Decide Adapter 对：Think 固定
`prompt_only`；Decide 在 OpenAI、Google、OpenAI-compatible 上固定 `strict`，在 Anthropic、
OpenRouter、DeepSeek 上固定 `prompt_only`。环境变量入口可构造 `two_stage`；TOML 入口会拒绝 Anthropic、OpenRouter、DeepSeek 的 `two_stage`；它表示
Runtime 阶段绑定策略，不要求两个 Adapter 使用相同的结构化输出模式。显式单阶段 `strict` 在不支持
原生 strict 的 Provider 上仍是配置错误。

[PiAiAdapter](../src/pi-ai.ts) 使用锁定版本的目录，并将 SDK 的 text/thinking/tool-call 增量转换为统一流事件；`generate()` 仍只返回完整响应。
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
strict 仍需经过同一套本地校验。公开契约见 [adapter.ts](../src/core/adapter.ts)。

[LlmModelCatalog](../src/model-catalog.ts) 负责当前 Provider 的模型发现与能力补全，默认组合 [DefaultProviderModelFetcher](../src/provider-fetchers.ts) 进行在线发现：
- 适配 OpenAI、Google、Anthropic、OpenRouter、DeepSeek 与 `openai-compatible` 的官方/配置端点与专属鉴权头；
- Google (`pageToken`) 与 Anthropic (`has_more` / `last_id`) 支持安全完整分页，拒绝不递进或循环 cursor；
- 共享 5000ms 超时与外部取消，并以 pi-ai 静态目录补充上下文容量、展示名与视觉能力；
- 模型容量可缺省：字符预算模式允许选择缺少上下文容量或输出上限的模型；Token 预算模式仅允许同时具备两项容量的模型，且输出上限须小于上下文容量；
- 网络故障、超时或端点不支持 (404/405/501) 允许静态目录或配置兜底；鉴权 (401)、权限 (403) 与协议非法错误坚决拒绝且不静默降级；
- 所有异常与日志严格脱敏，不复制任何 API Key、Authorization 头或敏感响应正文。

## 配置归属

系统配置与 GEPA 双模型规则见 [Config 的模型配置](../../config/notes/model-configuration.md)。

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

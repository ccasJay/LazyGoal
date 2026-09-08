# LLM 模块

## 职责与调用

LLM 模块负责供应商通信。`LLMAdapter.generate` 接收有序文本消息，返回原始文本及
诊断 metadata；Agent 负责 Prompt、JSON 结构和语义校验，Runtime 负责工具、状态与恢复。
CLI、ALFWorld 和 smoke 共用 [配置解析](../../packages/llm/src/config.ts) 与
[工厂](../../packages/llm/src/factory.ts)，在创建 Goal、Store 或 sidecar 前完成模型解析。
Adapter 构造时固定输出模式，不自动降级或切换 provider。

| Provider | `prompt_only` | `strict` |
| --- | --- | --- |
| `openai` | pi-ai OpenAI Responses | 原生 OpenAI Chat Completions |
| `google` | pi-ai Gemini | 原生 Google Gen AI |
| `anthropic`、`openrouter`、`deepseek` | pi-ai 对应 provider | 配置错误 |
| `openai-compatible` | pi-ai Chat Completions | 原生 OpenAI-compatible |

[PiAiAdapter](../../packages/llm/src/pi-ai.ts) 使用锁定版本的目录，内部聚合 SDK 流式结果。
前置 system 消息按顺序合并，user/assistant 顺序不变；中途 system 消息被拒绝。
只返回正常结束的文本，隔离 thinking，拒绝截断、错误、意外工具调用及其它非完成状态。
空文本仍交给 Agent 拒绝；不修复 JSON，不增加应用层重试，SDK 传输策略沿用其默认值。

所有 Adapter 在请求前后检查取消信号并传入 SDK。取消统一为 `ExecutionAbortedError`；
pi-ai 返回型失败转换为 `PiAiProviderError`，SDK 抛出的异常原样传播。
请求与模式不匹配时抛出 `LLMRequestModeMismatchError`。
原生 strict 分别映射 OpenAI `response_format.json_schema` 和 Gemini `responseSchema`；
Gemini 为枚举补齐类型，数值枚举映射为等值数值约束；SDK 负责 nullable 联合与原生类型转换。
`responseSchema` 不支持的 `additionalProperties: false` 仍由本地契约执行，字符串与数值枚举之外的枚举在请求前报错。
strict 仍需经过同一套本地校验。公开契约见 [adapter.ts](../../packages/llm/src/core/adapter.ts)。

## 配置

运行要求 Node ≥22.19.0。凭据仅取入口提供的环境并显式传入，不登录、不读取其它 API Key
变量或持久化凭据。必填 `LLM_PROVIDER`、`LLM_MODEL`、`LLM_API_KEY`、
`LLM_STRUCTURED_OUTPUT_MODE`；现有环境需手工补充 provider，不推断旧配置。

```dotenv
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5
LLM_API_KEY=your-api-key
LLM_STRUCTURED_OUTPUT_MODE=prompt_only
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

## 诊断与限制

原生 Adapter 的真实上报计数写入 `providerMetadata.usage`，缺失时省略。
pi-ai 不能证明计数是否真实上报，故只写非权威 `piUsage` 数值，始终省略 `usage`；
benchmark 将这些调用计入 `missingCalls`。Trace 对 metadata 脱敏限长；metadata 不进入
Goal Snapshot、Domain Event 或模型上下文。不保存认证头、完整 SDK 响应或 thinking。

本期仅支持文本与显式 API Key，不支持原生 tool calling、流式 UI、多模态、OAuth、云身份、
自动 JSON 修复或模型切换。自定义兼容服务必须支持 pi-ai 使用的流式 Chat Completions。

`npm run llm:agent-smoke` 读取 `.env` 和进程环境，真实执行 gathering、planning、
批准测试任务、一次无副作用的 `smoke_evidence` 工具调用及完成，并验证 Observation 证据。
只使用内存存储；SIGINT 取消调用并返回 130。该命令会产生费用，不属于自动化回归。
成功、失败或取消输出包含 provider、model 和 mode；凭据缺失时不代表已验证。

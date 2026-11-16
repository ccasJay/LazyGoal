# 模型配置

## 模型配置与入口

常规 TOML/Profile、GEPA 双模型与运行配置由 [`@lazygoal/config`](overview.md) 加载；共享 `LLMConfig` 契约与配置错误由 [`@lazygoal/llm-core`](../../llm-core/notes/overview.md) 拥有，LLM 消费校验后的结果，不拥有系统级配置文件解析。

运行要求 Node ≥22.19.0。系统使用统一的 LazyGoal Home：`LAZYGOAL_HOME` 必须是绝对路径，缺失或空白时回退至 `$HOME/.lazygoal`；`XDG_CONFIG_HOME` 不参与解析。TOML 加载按 `config.toml` → `profiles/<profile>.toml` → CLI 临时参数解析选型；连接与模型事实只在 `[providers.<family>.<name>]` 中声明，Profile 的 `[llm]` 只引用 `provider` 与 `model`。供应商标识为开放字符串，家族集合由组合根注入，未注册的家族、供应商或模型在加载期失败。环境变量入口由 `readLLMConfig` 独立解析，是否已注册由组合根校验。Runtime 阶段绑定按 Think/Decide 角色确定实际 Adapter。

```toml
# ~/.lazygoal/config.toml
[providers.openai.main]
api_key = "sk-..."
# base_url 可选；openai-compatible 家族必填

[[providers.openai.main.models]]
id = "gpt-4o"
display_name = "GPT-4o"
context_window = 128000
max_output_tokens = 16384
reasoning = true
vision = true
tools = true
native_structured_output = true

[llm]
provider = "main"
model = "gpt-4o"

[profile]
active = "default"
```

Profile 只声明引用：

```toml
# ~/.lazygoal/profiles/default.toml
name = "default"
[llm]
provider = "main"
model = "gpt-4o"
```

```dotenv
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5
LLM_API_KEY=your-api-key
```

每个模型必须声明正的安全整数 `context_window` 与 `max_output_tokens`，且输出上限严格小于上下文窗口；同一供应商内的模型标识必须唯一，供应商标识跨家族唯一。能力位 `reasoning`、`vision`、`tools`、`supports_required_tool_choice` 与 `native_structured_output` 可选，缺省时由适配器处理。

环境入口中，`openai` 和 `google` 可用 `LLM_BASE_URL` 覆盖端点，未设置时使用官方地址；`openai-compatible` 必须提供 HTTP(S) `LLM_BASE_URL`。其他 provider 不接受端点覆盖。Google 端点视为完整 API 前缀（含所需版本路径），直接追加 `/models/{model}:generateContent` 或流式方法，不额外追加 API 版本。

自定义兼容服务使用文本 Chat Completions，需显式设置 `LLM_CONTEXT_WINDOW_TOKENS` 与 `LLM_MAX_OUTPUT_TOKENS`，输出上限须小于上下文窗口；不声明 reasoning 能力或估算费用。CLI 使用这些容量启用既有 token 预算时，还需 `LLM_TOKENIZER_ENCODING`（`cl100k_base` 或 `o200k_base`，按模型选择；不能将不匹配的 tokenizer 当作供应商精确计数）。模型目录（[model-catalog](../../model-catalog/notes/overview.md)）不自动改变上下文裁剪或 tokenizer；配置的输出上限不得超过所选目录模型上限。请求显式上限优先于 Adapter 配置；两者都缺省时沿用供应商默认行为。

### GEPA 双模型边界

GEPA 生命周期固定使用两个互不复用的 LLM 配置：Working LM 从 LazyGoal Home 的
`profiles/default.toml` 解析，负责候选 Profile 的 benchmark Agent 执行；Reflection LM
由主 `config.toml` 的 `[gepa].reflection_profile` 指定的另一个 Profile 解析，固定为
`prompt_only`，只负责根据有界评测信息生成反思文本。Reflection Profile 不能缺失、不能
命名为 `default`，也不能以路径穿越或非法 Profile 名绕过配置边界。两侧配置各自引用
`[providers]` 中声明的供应商与模型，凭据隔离由声明保证。

`@lazygoal/config` 的 `loadGepaModelConfigs` 在产生模型调用前同时校验两侧配置；Prompt Evaluation 请求只携带
`configId` 与 `modelId`，凭据仍由 LazyGoal Home Profile 加载。生命周期 Run manifest 冻结两侧模型
身份，恢复时若任一身份漂移即拒绝恢复。Reflection bridge 不进入 Working Agent 的 Tool
循环，不将 Reflection LM 失败降级为 Working LM。

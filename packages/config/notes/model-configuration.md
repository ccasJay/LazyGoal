# 模型配置

## 模型配置与入口

常规 TOML/Profile、GEPA 双模型与运行配置由 [`@lazygoal/config`](overview.md) 加载；LLM 消费校验后的 `LLMConfig`，不拥有系统级配置文件解析。

运行要求 Node ≥22.19.0。系统使用统一的 LazyGoal Home：`LAZYGOAL_HOME` 必须是绝对路径，缺失或空白时回退至 `$HOME/.lazygoal`；`XDG_CONFIG_HOME` 不参与解析。按“内置默认值 → `config.toml` → `profiles/<profile>.toml` → CLI 临时参数”四层单向合并加载运行时配置；同时兼容显式传入的进程环境变量。必填 `provider`、`model`、`api_key`；`structured_output_mode` 省略时默认为 `prompt_only`，也可显式设为 `strict` 或 `two_stage`；TOML 的 Anthropic、OpenRouter、DeepSeek 配置拒绝 `two_stage`，环境变量入口由 `readLLMConfig` 独立解析。Runtime 阶段绑定按 Think/Decide 角色确定实际 Adapter 输出模式。

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

`@lazygoal/config` 的 `loadGepaModelConfigs` 在产生模型调用前同时校验两侧配置；Prompt Evaluation 请求只携带
`configId` 与 `modelId`，凭据仍由 LazyGoal Home Profile 加载。生命周期 Run manifest 冻结两侧模型
身份，恢复时若任一身份漂移即拒绝恢复。Reflection bridge 不进入 Working Agent 的 Tool
循环，不将 Reflection LM 失败降级为 Working LM。

# 模型默认装配

本模块按已校验的共享配置与供应商注册表选择默认 Adapter。供应商事实、线格式与模型目录分别归各自的能力包；本模块只保留选择策略、阶段装配和显式付费 smoke 入口。

## 职责与调用

- [createLlmAdapter](../src/default-adapters.ts)：已注册供应商（OpenAI、DeepSeek、OpenRouter、OpenCode Go、`openai-compatible` 与配置实例）使用 [llm-adapters](../../llm-adapters/notes/overview.md) 的请求驱动 Adapter；Anthropic 与 Google 仍由 [llm-pi-ai](../../llm-pi-ai/notes/overview.md) 与 [llm-google](../../llm-google/notes/overview.md) 服务，`two_stage` 只影响这两个既有实现。
- [createLlmStageAdapters](../src/default-adapters.ts)：已注册供应商的 Think 与 Decide 共用同一个请求驱动 Adapter；Anthropic 与 Google 保留 Think/Decide 模式差异。
- [createReflectionLlmAdapter](../src/default-adapters.ts)：已注册供应商复用同一适配器，Google 使用原生 Gemini 实现，Anthropic 回退 pi-ai，不发起网络目录校验。
- 三个工厂构造时不发网络请求、不读取环境凭据、不创建存储。共享 `LLMConfig`、调用契约与配置错误归 [llm-core](../../llm-core/notes/overview.md)；配置读取与校验归 [Config](../../config/notes/overview.md)。

| Provider | 选中的 Adapter |
| --- | --- |
| `openai`、`deepseek`、`openrouter`、`opencode-go`、`openai-compatible` 与配置实例 | `llm-adapters` 的请求驱动 Chat Completions Adapter |
| `google` | `prompt_only` 使用 pi-ai；`strict` 使用原生 Google Gen AI |
| `anthropic` | pi-ai Anthropic |
| 未注册且无既有实现 | `LLMConfigurationError` |

输出约束由请求声明；已注册供应商的两阶段共用同一 Adapter。阶段对的实际类型差异由 [default-adapters 测试](../test/default-adapters.test.ts) 与 [阶段配置测试](../test/two-stage-config.test.ts) 对照。

## 依赖与入口

`llm` 依赖 `llm-core`、`llm-adapters`、`llm-google` 与 `llm-pi-ai`；不直接依赖 `config`、`model-catalog` 或生成 SDK。公共入口 [src/index.ts](../src/index.ts) 只导出三个默认工厂与自有 `LlmStageAdapters` 类型；旧 factory/core/adapter 与目录路径不再存在或被消费，无兼容转发。模型目录查询与模型切换由 [model-catalog](../../model-catalog/notes/overview.md) 与宿主装配负责，默认工厂不自动发起在线发现。

## Smoke 入口与限制

[agent-smoke-test.ts](../test/agent-smoke-test.ts) 与 [native-dialogue-smoke.ts](../test/native-dialogue-smoke.ts) 是显式付费 smoke 入口，读取 `.env` 与进程环境，不属于自动回归；`npm run llm:agent-smoke` 与 `npm run llm:native-dialogue-smoke` 保持既有语义，凭据缺失、失败或取消时不得报告供应商端到端验证通过。本模块不拥有 Provider 特定请求映射、流聚合或目录缓存。

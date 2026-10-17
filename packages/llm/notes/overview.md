# 模型默认装配

本模块按已校验的共享配置选择默认 Adapter。供应商实现、pi-ai 适配与模型目录分别归各自的能力包；本模块只保留选择策略、阶段装配和显式付费 smoke 入口。

## 职责与调用

- [createLlmAdapter](../src/default-adapters.ts)：`prompt_only` 使用 [llm-pi-ai](../../llm-pi-ai/notes/overview.md)；原生 `strict` 使用当前 [llm-openai](../../llm-openai/notes/overview.md) 与 [llm-google](../../llm-google/notes/overview.md) 实现；`two_stage` 按供应商选择对应 Decide 模式，不支持的显式 `strict` 仍拒绝。
- [createLlmStageAdapters](../src/default-adapters.ts)：同一选择构造不可变的 Think/Decide 对；Think 固定 `prompt_only`，Decide 对原生供应商固定 `strict`，其余固定 `prompt_only`。
- [createReflectionLlmAdapter](../src/default-adapters.ts)：OpenAI/OpenAI-compatible/Google 优先当前原生实现，其余复用现有默认适配，不引入新供应商或网络目录校验。
- 三个工厂构造时不发网络请求、不读取环境凭据、不创建存储。共享 `LLMConfig`、调用契约与配置错误归 [llm-core](../../llm-core/notes/overview.md)；配置读取与校验归 [Config](../../config/notes/overview.md)。

| Provider | `prompt_only` | `strict` |
| --- | --- | --- |
| `openai` | pi-ai OpenAI Responses | 原生 OpenAI Chat Completions |
| `google` | pi-ai Gemini | 原生 Google Gen AI |
| `anthropic`、`openrouter`、`deepseek`、`opencode-go` | pi-ai 对应 provider | 配置错误 |
| `openai-compatible` | pi-ai Chat Completions | 原生 OpenAI-compatible |

`two_stage` 表示 Runtime 在 Think/Decide 阶段间绑定输出模式，不要求两个 Adapter 使用相同模式；环境变量入口与 TOML 入口对部分供应商的既有接受差异由 [Config](../../config/notes/model-configuration.md) 说明。阶段对的实际类型差异由 [default-adapters 测试](../test/default-adapters.test.ts) 与 [阶段配置测试](../test/two-stage-config.test.ts) 对照。

## 依赖与入口

`llm` 只依赖 `llm-core`、`llm-openai`、`llm-google` 与 `llm-pi-ai`；不直接依赖 `config`、`model-catalog` 或生成 SDK。公共入口 [src/index.ts](../src/index.ts) 只导出三个默认工厂与自有 `LlmStageAdapters` 类型；旧 factory/core/adapter 与目录路径不再存在或被消费，无兼容转发。模型目录查询与模型切换由 [model-catalog](../../model-catalog/notes/overview.md) 与宿主装配负责，默认工厂不自动发起在线发现。

## Smoke 入口与限制

[agent-smoke-test.ts](../test/agent-smoke-test.ts) 与 [native-dialogue-smoke.ts](../test/native-dialogue-smoke.ts) 是显式付费 smoke 入口，读取 `.env` 与进程环境，不属于自动回归；`npm run llm:agent-smoke` 与 `npm run llm:native-dialogue-smoke` 保持既有语义，凭据缺失、失败或取消时不得报告供应商端到端验证通过。本模块不拥有 Provider 特定请求映射、流聚合或目录缓存。

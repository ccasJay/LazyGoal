# 模型默认装配

本模块按已校验的共享配置与供应商注册表选择默认 Adapter。供应商事实、线格式与模型目录分别归各自的能力包；本模块只保留选择策略、阶段装配和显式付费 smoke 入口。

## 职责与调用

- [createLlmAdapter](../src/default-adapters.ts)：按供应商注册表选择 Adapter；分发前先校验声明协议已有 wire 实现，未实现时明确失败并指明缺失协议，不回退到其它协议。
- [createLlmStageAdapters](../src/default-adapters.ts)：Think 与 Decide 共用同一个请求驱动 Adapter；生成约束由单次请求声明。
- [createReflectionLlmAdapter](../src/default-adapters.ts)：复用同一注册表适配器，不发起网络目录校验。
- 三个工厂构造时不发网络请求、不读取环境凭据、不创建存储。共享 `LLMConfig`、调用契约与配置错误归 [llm-core](../../llm-core/notes/overview.md)；配置读取与校验归 [Config](../../config/notes/overview.md)。

| Provider | 选中的 Adapter | 协议 |
| --- | --- | --- |
| `openai`、`deepseek`、`openrouter`、`opencode-go`、`openai-compatible` 与配置实例 | `llm-adapters` 的 Chat Completions Adapter | `chat-completions` |
| `anthropic` | `llm-adapters` 的原生 Messages Adapter（wire 归 [wire-anthropic-messages](../../wire-anthropic-messages/notes/overview.md)） | `anthropic-messages` |
| `google` | [llm-google](../../llm-google/notes/overview.md) 的原生 Gemini Adapter（wire 归 [wire-google-generate-content](../../wire-google-generate-content/notes/overview.md)） | `google-generate-content` |
| 协议没有 wire 实现 | `LLMConfigurationError` 并列出已实现协议 | — |
| 未注册供应商 | `LLMConfigurationError` 并列出已注册供应商 | — |

输出约束由请求声明；两阶段共用同一 Adapter。阶段对的实际类型差异由 [default-adapters 测试](../test/default-adapters.test.ts) 与 [阶段配置测试](../test/two-stage-config.test.ts) 对照。

## 依赖与入口

`llm` 依赖 `llm-core`、`llm-adapters` 与 `llm-google`；不直接依赖 `config`、`model-catalog` 或供应商 SDK。公共入口 [src/index.ts](../src/index.ts) 只导出三个默认工厂与自有 `LlmStageAdapters` 类型；旧 factory/core/adapter 与目录路径不再存在或被消费，无兼容转发。模型目录查询与模型切换由 [model-catalog](../../model-catalog/notes/overview.md) 与宿主装配负责，默认工厂不自动发起在线发现。

## Smoke 入口与限制

[agent-smoke-test.ts](../test/agent-smoke-test.ts) 与 [native-dialogue-smoke.ts](../test/native-dialogue-smoke.ts) 是显式付费 smoke 入口，读取 `.env` 与进程环境，不属于自动回归；`npm run llm:agent-smoke` 与 `npm run llm:native-dialogue-smoke` 保持既有语义，凭据缺失、失败或取消时不得报告供应商端到端验证通过。本模块不拥有 Provider 特定请求映射、流聚合或目录缓存。

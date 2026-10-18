# OpenAI 适配

本包把供应商无关的请求映射为 OpenAI Chat Completions（含兼容端点）原生调用，并回传有序正文、公开 reasoning 与工具调用块、续接字段与用量；`stream` 使用真实 Chat Completions 流。

## 职责

- [OpenAICompatible](../src/openai-compatible.ts) 显式固定 `strict` 或 `prompt_only`：strict 把结构 Schema 原样映射为 `response_format.json_schema`（`strict: true`）；prompt_only 不发送任何原生 Schema 参数。无工具 strict 请求缺少 `structuredOutput`、或 prompt_only 请求携带它时，在发起网络请求前抛出 [LLMRequestModeMismatchError](../../llm-core/notes/overview.md)。
- 工具请求挂载 `tools[].function`（`strict: true`）、`tool_choice`（缺省 `required`）并关闭并行调用；[LLMMessage](../../llm-core/src/types.ts) 的角色与顺序原样映射，tool 结果以 `tool_call_id` 配对回传。
- [原生身份与续接](../src/openai-compatible.ts)：实例构造时固定 provider/端点/模型/协议身份；assistant 续接来自同一身份的 `reasoning_content` 回传，跨身份历史在派发前拒绝。
- [原始用量提取](../src/usage.ts) 把 Chat Completions `usage`（含流式用量尾部）归一化为 [NormalizedUsage](../../llm-core/notes/overview.md)，缺失或核心字段非法时整体缺省，不补零。

## 依赖与限制

本包只依赖 `llm-core`、`model-contracts`、`execution-control` 与 `openai` SDK；不读取环境凭据、不注册宿主进程行为，构造与导入不发起网络请求。SDK 内部重试保持关闭（`maxRetries: 0`），暂时故障由 [llm-core](../../llm-core/notes/overview.md) 的结构化分类识别后原样传播，本包不自行重试。流式请求与非流式共享请求构造，正文与 reasoning 按首次出现累积为独立块、工具调用按供应商索引累计原始参数分片，只有收齐合法结束原因后才产生成功完成；长度截断、内容过滤、错误结束与无法归一化的内容抛出 `OpenAIIncompleteResponseError`，不降级为非流式重发。当前不支持 Responses API 与其它供应商。

# OpenAI 适配

本包把供应商无关请求映射为 OpenAI Chat Completions（含兼容端点）原生调用，并回传有序内容块、续接身份、用量与可分类失败；`stream` 使用真实 Chat Completions 流。

## 职责

- [`OpenAICompatible`](../src/openai-compatible.ts) 只固定 API Key、端点与模型，不保存 `strict`、`prompt_only` 或 `two_stage` 模式。结构 Schema、`tool_choice`、工具参数 `strict`、并行调用与流尾用量都按单次 [`LLMRequest`](../../llm-core/src/types.ts) 的字段构造供应商参数；省略的可选字段不会由 Adapter 自行补发。
- 常规 OpenAI-compatible Goal 的请求构造使用 `tool_choice: "auto"`，并省略顶层 Schema、工具 `strict`、`parallel_tool_calls` 和 `stream_options.include_usage`。请求声明的结束原因用于校验响应；`stop` 可和完整工具调用同在，`tool_calls` 必须带已封口调用。
- Chat Completions 的正文、`reasoning_content`、`thought` 与工具调用按首次出现顺序组成 [共享内容块](../../model-contracts/src/model-conversation.ts)。常规 Goal 将这组块原样保存在同身份原生历史中；续接请求从块派生正文、调用及 `reasoning_content`，`thought` 留在生成记录中，不作为原生回放字段。
- 实例暴露不含凭据的 provider/端点/模型/协议身份；身份不匹配的原生消息在发送请求前拒绝。OpenAI 官方路径与 Gemini 仍保留其现有历史投影，包括 Gemini 原始 Part 顺序和签名。
- [原始用量提取](../src/usage.ts) 把 Chat Completions `usage` 归一化为 [NormalizedUsage](../../llm-core/notes/overview.md)；缺失或核心字段非法时整体缺省，不补零。

## 依赖与限制

本包依赖 `llm-core`、`model-contracts`、`execution-control` 与 `openai` SDK；不读取环境凭据、不注册宿主进程行为，构造与导入不发起网络请求。SDK 内部重试关闭（`maxRetries: 0`）；暂时故障由 Runtime 按现有预算处理，本包不自行重试。流式请求与非流式共享请求构造；只有收齐合法结束原因后才产生成功完成。长度截断、内容过滤、拒绝、错误结束与无法归一化的内容会明确失败，不降级为非流式重发。当前不支持 Responses API 与其它供应商。

# pi-ai 适配

本包使用锁定版本的 `@earendil-works/pi-ai` 承载多供应商 prompt_only 调用：离线模型解析、增量流到统一事件的转换、失败状态与取消语义。

## 职责

- [PiAiAdapter](../src/pi-ai.ts) 静态模型从锁定目录离线解析并校验容量；OpenCode Go 在线文本模型由服务端目录提供 `executionApi`、容量、推理、视觉和工具选择能力，适配器据此动态构造 pi-ai Model。适配器拒绝未知协议或非法容量，但不自行查询在线目录；在线可用性与 ID 可选性由服务端目录决定。实例不查询在线目录、不建立共享可变模型注册表。
- 消息映射：前置 system 消息按顺序合并为 systemPrompt，user/assistant 顺序不变，中途 system 消息被拒绝。工具选择以模型 API 为准：`auto`/`none` 经 simple 入口传递，`required` 经完整 API 入口映射为 OpenAI 的 `required` 或 Anthropic/Gemini 的 `any`。
- 正文只取 text 块；thinking 与工具调用按真实内容索引分别映射为受限 reasoning 块与工具调用块，不进入正文、持久化历史或诊断正文；未知内容块在协议边界拒绝。无工具请求拒绝意外调用；工具请求接受正常结束或工具调用结束，拒绝截断、错误及其它非完成状态，不把部分输出伪装为完整成功。
- [generate 与可选 stream](../src/pi-ai.ts) 使用相同块映射；`generate()` 始终返回完整响应（内部聚合），`stream` 把 SDK 的 text/thinking/tool-call 边界与增量转为带真实内容索引的 [LLMStreamEvent](../../llm-core/notes/overview.md) 块事件。有原始参数分片时保留其文本，仅在 SDK 只提供对象时使用稳定序列化，并用解析对象核对语义。取消经 [execution-control](../../execution-control/notes/overview.md) 传播。
- [PiAiProviderError](../src/pi-ai.ts) 表达 pi-ai 返回的失败状态，不包含部分输出、凭据或 SDK 响应对象。已识别的 OpenCode Go 订阅缺失错误使用固定的订阅／更换供应商提示，可识别的 HTTP 失败只保留状态码，其他未知供应商错误仍不复制原始文案。该错误继承 `ModelRequestFailure`，由 Runtime 归为请求失败而非决策协议错误。pi-ai 上报非零计数时把归一化用量写入 `providerMetadata.usage` 并参与正式累计；全零占位视为未上报，只保留非权威 `piUsage` 诊断字段。
- OpenCode Go 模型统一通过 `https://opencode.ai/inference/go/openai/v1` 的 Chat Completions 路径执行，不接受配置或客户端覆盖端点。未提供工具且选择 `none` 时省略 `tool_choice`，仍拒绝意外返回的工具调用；有工具时保留该选择。在线目录未明确确认模型支持 `tool_choice: required` 时，强制工具调用请求使用 `auto`；这不改变模型目录对工具能力的要求。所有请求携带 LazyGoal 自有 User-Agent，并在提供会话身份（`LLMRequest.sessionId`）时发送 `x-opencode-session`。上游可能限制部分免费模型只能在 OpenCode 内调用，外部客户端仍可能收到 403。

## 依赖与限制

本包只依赖 `llm-core` 与 `execution-control`，不自建目录缓存、不反向依赖 model-catalog、不自行重试；配置失败使用 [LLMConfigurationError](../../llm-core/notes/overview.md) 的同一构造器。SDK 版本锁定为 `1.3.0`。原生 OpenAI/Gemini 的 strict 投影不在本包。

# pi-ai 适配

本包使用锁定版本的 `@earendil-works/pi-ai` 承载多供应商 prompt_only 调用：离线模型解析、增量流到统一事件的转换、失败状态与取消语义。

## 职责

- [PiAiAdapter](../src/pi-ai.ts) 静态模型从锁定目录离线解析并校验容量；服务端按执行登记验证 OpenCode Go 模型后传入 `executionApi` 与容量，适配器据此动态构造 pi-ai Model。适配器拒绝未知协议或非法容量，但不自行查询模型登记；在线可用性与 ID 可选性由服务端目录决定。实例不查询在线目录、不建立共享可变模型注册表。
- 消息映射：前置 system 消息按顺序合并为 systemPrompt，user/assistant 顺序不变，中途 system 消息被拒绝。工具选择以模型 API 为准：`auto`/`none` 经 simple 入口传递，`required` 经完整 API 入口映射为 OpenAI 的 `required` 或 Anthropic/Gemini 的 `any`。
- 正文只取 text 块；thinking 与工具调用按真实内容索引分别映射为受限 reasoning 块与工具调用块，不进入正文、持久化历史或诊断正文；未知内容块在协议边界拒绝。无工具请求拒绝意外调用；工具请求接受正常结束或工具调用结束，拒绝截断、错误及其它非完成状态，不把部分输出伪装为完整成功。
- [generate 与可选 stream](../src/pi-ai.ts) 使用相同块映射；`generate()` 始终返回完整响应（内部聚合），`stream` 把 SDK 的 text/thinking/tool-call 边界与增量转为带真实内容索引的 [LLMStreamEvent](../../llm-core/notes/overview.md) 块事件。有原始参数分片时保留其文本，仅在 SDK 只提供对象时使用稳定序列化，并用解析对象核对语义。取消经 [execution-control](../../execution-control/notes/overview.md) 传播。
- [PiAiProviderError](../src/pi-ai.ts) 表达 pi-ai 返回的失败状态，不包含部分输出、凭据或 SDK 响应对象。pi-ai 不能证明计数是否真实上报，其数值只写非权威 `piUsage` 诊断字段，**不取得正式 usage 身份**。
- OpenCode Go 静态模型沿用 pi-ai `1.3.0` provider；动态 MiniMax 执行固定使用 `https://opencode.ai/inference/go/openai/v1` 的 Chat Completions 路径，不接受配置或客户端覆盖端点。两者都携带 LazyGoal 自有 User-Agent，并在提供会话身份（`LLMRequest.sessionId`）时发送 `x-opencode-session`。

## 依赖与限制

本包只依赖 `llm-core` 与 `execution-control`，不自建目录缓存、不反向依赖 model-catalog、不自行重试；配置失败使用 [LLMConfigurationError](../../llm-core/notes/overview.md) 的同一构造器。SDK 版本锁定为 `1.3.0`。原生 OpenAI/Gemini 的 strict 投影不在本包。

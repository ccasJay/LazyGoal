# Anthropic Messages 线格式模块说明

## 职责

把 Anthropic Messages 协议转换为 `llm-core` 的中性请求与响应契约。本包不持有端点、凭据与供应商分支：适配器提供完整 URL 与请求头（含 `anthropic-version`），能力开关由模型事实决定。

## 数据流

1. `buildAnthropicMessagesRequest` 把 `LLMRequest` 与历史消息编码为请求体：system 合并为顶层 `system`，assistant 原生续接块原样回放，tool 结果映射为 `tool_result` 块；
2. `generateAnthropicMessages` 用 `fetch` 发起非流式调用，归一化为 `LLMResponse`；
3. `streamAnthropicMessages` 消费 SSE 响应体，经 `llm-core` 的 SSE 分帧器逐条映射为 `LLMStreamEvent`，由 `AnthropicMessagesStreamAssembler` 校验终态并产出唯一 `completed`；
4. 协议特有失败（`max_tokens` 截断、拒绝、缺少终态、未知事件、缺少签名或调用身份）在这里以稳定分类拒绝；通用传输分类复用 `llm-core`。

## thinking 签名续接

thinking 块文本经 `thinking_delta` 增量到达，签名经 `signature_delta` 独立到达；块结束时签名缺失直接拒绝。续接载荷按原生块保存（`thinking` 含签名、`redacted_thinking`、`tool_use`、`text`），下一轮请求把同一组块作为 assistant content 原样回放，顺序与签名不得修改。

## 能力开关

- 无原生 JSON Schema 约束：请求的结构化输出不进入协议，正文在可提取时由 `llm-core` 的文本转 JSON 提取与修复归一化；
- `tool_choice` 映射：`required → any`、`none → none`、缺省 `auto`；
- `max_tokens` 是协议必填项：请求值优先，其次连接默认值，最后使用包内缺省；超过模型登记上限时构造失败。

## 生命周期与错误

流未收齐可接受终态时不产生 `completed`；已发布分片只用于观察。错误不接受重试或协议降级。

## 限制

只实现文本、thinking 与 tool_use/tool_result 块；图像、引用与其它服务端工具明确拒绝。

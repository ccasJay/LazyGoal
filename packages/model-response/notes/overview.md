# 模型响应解码

本包把 Adapter 返回的最终响应与本次请求提供的契约/声明解码为阶段输出或稳定协议错误；不调用 Adapter、不读取 Goal 或 Store、不分配 Runtime Action 身份、不生成 RuntimeFeedback。公开入口是 [src/index.ts](../src/index.ts)。

## 文本解析

[`parseModelOutput`](../src/model-output.ts) 严格提取裸 JSON 或完整 fenced 代码块，拒绝正文夹带与空白文本；随后由请求级契约包执行 Wire 校验与确定性解码，再执行基础语义校验。任何失败都抛出 [`LLMResponseProtocolError`](../src/errors.ts)（错误码 `INVALID_LLM_RESPONSE`），并保留稳定 `issues` 的 code/path/message；`extractJsonPayload`/`parseJson` 提供更细的入口。`parseAgentDecision` 在未提供契约包时使用基础 executing 契约。

## 阶段响应检查

[`classifyDecideResponse`](../src/stage-response.ts) 把 Decide 响应分为单调用、多调用批次、零调用正文与无可用结果四类；[`requireSingleToolCall`](../src/stage-response.ts) 要求完成审查等结构化控制请求恰好一个调用。

[`decodeToolCallOutcome`](../src/stage-response.ts) 解析调用参数 JSON 并交给声明契约解码：非法 JSON 报 `invalid_tool_arguments`；契约违规保留原始 issues，并把已授权业务工具的路径标记为 `action.input.*`，附带只含字段名的 `toolCallShape`。它不重新分配 actionId，也不重新推导工具可见性；业务工具 ID 由调用方显式传入。

[`assertNativeResponseIdentity`](../src/stage-response.ts) 校验续接数据与原生身份；[`nativeResponseMessage`](../src/stage-response.ts) 把响应投影为可续接 Assistant 消息。[`decodeThinkResponse`](../src/stage-response.ts) 拒绝 Think 工具调用与空文本；[`normalizeRequestThinkGoal`](../src/stage-response.ts) 规范化 `request_think` 目标并拒绝空白。[`decodeCompletionReviewResponse`](../src/stage-response.ts) 解码唯一 `system_review_completion` 的接受或拒绝。

## 错误契约

`LLMResponseProtocolError` 是唯一协议错误定义：错误码固定为 `INVALID_LLM_RESPONSE`，可选 `issues`（结构校验与语义问题）、`toolCallShape`（已声明工具的有界字段形状）与 `cause`。错误消息不包含模型响应正文、工具参数值或 Conversation 内容。

## 限制

本包不做授权、不分配身份、不记录日志、不重试，也不判断调用是否被接受；调用方负责在业务边界内使用解码结果并生成阶段反馈。

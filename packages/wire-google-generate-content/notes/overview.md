# Google GenerateContent 线格式模块说明

## 职责

把 Google GenerateContent 协议转换为 `llm-core` 的中性请求与响应契约。本包不持有端点、凭据与供应商分支：适配器提供端点前缀与认证头（`x-goog-api-key`）。

## 数据流

1. `buildGenerateContentRequest` 把 `LLMRequest` 与历史消息编码为请求体：system 合并为 `systemInstruction`，assistant 原生 Parts 原样回放，tool 结果映射为 `functionResponse`；
2. Schema 先经 `prepareGeminiSchema`（本地投影），再由 `toGeminiWireSchema` 序列化为 Google 词表（`type` 大写、`anyOf` 折叠、`additionalProperties` 不上线）；
3. `generateGenerateContent` 用 `fetch` 发起非流式调用，归一化为 `LLMResponse`；严格结构化正文在归一前经 `restoreGeminiResponseProjection` 逆向还原哨兵与联合分支；
4. `streamGenerateContent` 消费 `?alt=sse` 响应体，逐 chunk 映射为 `LLMStreamEvent`，由 `GenerateContentStreamAssembler` 校验终态并产出唯一 `completed`；
5. 截断、安全阻断、未知 Part 与无结束原因的 EOF 以 `GeminiIncompleteResponseError` 拒绝；通用传输分类复用 `llm-core`。

## 迁移边界

投影与哨兵逻辑自既有实现**原样迁入**，语义不改：`__lazygoal_null__`／`__lazygoal_absent__` 哨兵、`properties.result` 判别联合扁平化、completion evidence 紧凑格式与逆向还原规则保持逐项一致。

## 能力开关

- 严格结构化输出：无工具且声明 `structuredOutput` 时发送 `responseMimeType` 与 `responseSchema`；
- 工具声明：`functionDeclarations` + `toolConfig`，`toolChoice` 映射为 `ANY`／`AUTO`／`NONE`；
- 工具参数按整块交付，不开启协议不支持的参数分片。

## 限制

只实现文本、thought 与 functionCall／functionResponse Part；inlineData 等其它 Part 明确拒绝。

# Gemini 适配

本包把供应商无关的请求映射为 Google Gen AI 原生生成调用，并按真实 Part 顺序回传正文、公开 reasoning 与工具调用块、续接 Parts 与用量。

## 职责

- [Gemini](../src/gemini.ts) 显式固定 `strict` 或 `prompt_only`。strict 把结构 Schema 投影为 `responseMimeType: "application/json"` 与 `responseSchema`：枚举补齐类型、nullable 交 SDK 转换、对象联合投影为字段并集与必填交集，并用 `__lazygoal_null__`/`__lazygoal_absent__` 哨兵表达空值与缺省；响应逆向投影剥离非目标分支字段并恢复空值与证据哨兵。prompt_only 不发送任何原生 Schema 参数。模式不匹配在派发前抛出 [LLMRequestModeMismatchError](../../llm-core/notes/overview.md)。
- 消息映射：system 合并为 `systemInstruction`，assistant 映射为 model 角色，其余按顺序传递；工具请求挂载 `functionDeclarations` 与 ANY 模式，工具结果按 callId 回传。
- [原生身份与续接](../src/gemini.ts)：实例固定 provider/端点/模型/协议（`gemini-content`）身份；Gemini 原始 Parts 与不透明签名按顺序原样保存与回放，本地分配的函数 ID 不伪造成供应商 ID。相邻同类型 Part 归并为一个块并按内容直接连接；strict 逆向投影结果以 `json` 格式文本块交付。
- [原始用量提取](../src/usage.ts) 把 `usageMetadata` 归一化为 [NormalizedUsage](../../llm-core/notes/overview.md)，缺失或核心字段非法时整体缺省。

## 依赖与限制

本包只依赖 `llm-core`、`contracts`、`model-contracts`、`execution-control` 与 `@google/genai` SDK；不读取环境凭据，构造与导入不发起网络请求。SDK 内部重试保持关闭（`attempts: 1`），暂时故障由 [llm-core](../../llm-core/notes/overview.md) 的结构化分类识别后原样传播。当前不支持流式增量、多模态 Part、OAuth 或云身份认证。

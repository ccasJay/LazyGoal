# Gemini 适配

本包把供应商无关的请求接入 Google GenerateContent 原生线格式，并按真实 Part 顺序回传正文、公开 reasoning 与工具调用块、续接 Parts 与用量；`stream` 使用原生流式端点。

## 职责

- [Gemini](../src/gemini.ts) 是只声明端点与认证事实的薄适配器：请求构造、Schema 投影与哨兵、SSE chunk 映射、逆向投影与终态校验全部由 [wire-google-generate-content](../../wire-google-generate-content/notes/overview.md) 提供。
- 原生身份：实例固定 provider／端点／模型／协议（`gemini-content`）身份；Gemini 原始 Parts 与不透明签名按顺序原样保存与回放，本地分配的函数 ID 不伪造成供应商 ID。
- 连接事实：`GeminiConfig` 提供显式 API Key、可选完整 API 前缀、模型与默认输出上限；构造与导入不发起网络请求，也不读取环境凭据。

## 依赖与限制

本包只依赖 `llm-core`、`wire-google-generate-content` 与 `execution-control`；不含任何供应商 SDK。暂时故障由 [llm-core](../../llm-core/notes/overview.md) 的结构化分类识别后原样传播。长度截断、安全阻断、未知 Part 与无正常结束的 EOF 在 wire 层以 `GeminiIncompleteResponseError` 拒绝，不降级为非流式重发。当前不支持参数分片、多模态 Part、OAuth 或云身份认证。

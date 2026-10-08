# 模型协议契约

本包在通用 [Contracts](../../contracts/README.md) 的 AST 与解析器之上定义模型输出协议。Agent 构造请求并验证决策，Runtime 决定是否接受、提交与恢复；本包不运行模型或持久化 Goal。

## 输出与投影

[公开入口](../src/index.ts) 导出决策、完成审查、工作记忆及上下文检索的结构契约，以及 Wire 与 Canonical 输出之间的投影。结构化 Provider Schema 由这些契约编译；调用方仍需校验模型的实际响应，不把 Schema 约束当作完成证据。

## 对话续接

[模型消息协议](../src/model-conversation.ts) 区分 system、user、assistant 和配对 tool 消息。原生续接身份包含 provider、端点、模型和协议；只有身份一致且响应已被 Runtime 接受并提交时，才可回放续接字段。Gemini 原始 Part 顺序和不透明签名不能改写；不支持的多模态 Part 在供应商边界拒绝。

# 模型调用语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| callModel | 一次 Adapter 调用、记录与流收集的完整生命周期。 | [模型调用](../README.md) | [调用实现](../src/model-call.ts) |
| ModelCallContext | 收窄后的调用身份、会话与来源上下文。 | [模型调用](../README.md) | [调用实现](../src/model-call.ts) |
| 调用输入记录 | Adapter 调用前保存消息正文与来源的诊断投影；不作为原生历史回放真源。 | [模型调用](../README.md) | [调用实现](../src/model-call.ts) |
| 调用指标 | call_started/call_finished 事实与 best effort 隔离。 | [模型调用](../README.md) | [调用实现](../src/model-call.ts) |
| 流收集 | 唯一 completed 响应、块身份事件映射与最终一致性核验。 | [模型调用](../README.md) | [调用实现](../src/model-call.ts) |
| 调用终止摘要 | 失败／取消的安全摘要，只带调用身份与未完成块索引。 | [模型调用](../README.md) | [调用实现](../src/model-call.ts) |
| 调用诊断 | 有界脱敏的请求、响应与错误 Trace。 | [模型调用](../README.md) | [诊断实现](../src/llm-diagnostic-trace.ts) |
| 模型公开生命周期 | 模型开始事件携带真实协议阶段与调用身份；完成审查只发布无正文生命周期。 | [模型调用](../README.md) | [调用实现](../src/model-call.ts) |

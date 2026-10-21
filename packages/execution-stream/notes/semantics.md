# 执行事件流语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| ExecutionStreamEvent | JSON-safe 实时事件。 | [执行事件流](../README.md) | [模块说明](./overview.md) |
| StreamSubscriptionPolicy | 可见性及有界队列规则。 | [执行事件流](../README.md) | [模块说明](./overview.md) |
| Goal 范围订阅 | 覆盖目标 Goal 全部 Run 的订阅；Run 仍是事件来源身份，不随 Run 结束关闭。 | [执行事件流](../README.md) | [发布器](../src/publisher.ts) |

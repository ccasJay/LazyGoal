# Goal Server

本机 Web Composition Root，连接 Browser、HTTP、Supervisor、Trigger 持久化与独立 Worker。Goal Board 的创建、结构化交互、取消和显式恢复经 Trigger 路径处理；普通后续消息不受支持。

阅读 [模块说明](./notes/overview.md)、[语义表](./notes/semantics.md)。

## 无界面宿主示例

[examples/headless-interaction-handlers.ts](./examples/headless-interaction-handlers.ts) 演示内部 Runtime 会话装配的交互处理器：程序化回答等待、把下一个等待交给真人并解除句柄。该示例不代表 Goal Board 的 Worker/Trigger 用户入口。

```sh
npx tsx apps/goal-server/examples/headless-interaction-handlers.ts
```

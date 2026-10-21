# Goal Server

本机 Web 服务 Composition Root，连接 Runtime、Browser、HTTP 与前端。

阅读 [模块说明](./notes/overview.md)、[语义表](./notes/semantics.md)。

## 无界面宿主示例

[examples/headless-interaction-handlers.ts](./examples/headless-interaction-handlers.ts) 用正式装配演示交互处理器：程序化回答历史等待（显式 `resume` 解锁）、把下一个等待交给真人、解除句柄，并在隔离的临时目录中运行。

```sh
npx tsx apps/goal-server/examples/headless-interaction-handlers.ts
```

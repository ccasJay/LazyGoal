# ACP 服务与客户端

本包提供 ACP Agent 服务与 Client 接线。它是协议适配层，任务环境和 Goal 生命周期由集成方拥有。

## 会话与调用

[服务入口](../src/agent.ts) 接受连接，创建独立 Session；[客户端入口](../src/client.ts) 发起调用。Session 的 ID、工作目录和连接级 signal 均在 [契约](../src/contracts.ts) 中定义。Prompt 内容限文本和经过工作目录边界校验的本地资源引用；请求、会话取消和连接关闭合并为当前 Prompt 的中止信号。

同一 Session 的 Prompt 从校验开始占用，直到校验或执行结算。校验期间取消会跳过执行。不同 Session 可以并行。

Agent 在调用工厂前预留 Session ID，注册后才允许调用和发送更新。连接关闭时，已注册 Session 等待各自的 Prompt 结算再释放。仍在创建的 Session 由工厂在交付前负责，Agent 收到迟到实例后直接释放。SDK 连接句柄的关闭通知表示传输关闭，资源释放可以随后完成。

## 边界

`stopReason` 仅表示 ACP Prompt 的结束原因，不能作为 Benchmark 的领域评分。集成层负责核验 Session metadata、工作目录与结果身份，并映射 Goal 和 Run 的真实终态。

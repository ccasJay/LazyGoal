# ACP 服务与客户端

本包提供 ACP Agent 服务与 Client 接线。它是协议适配层，任务环境和 Goal 生命周期由集成方拥有。

## 会话与调用

[服务入口](../src/agent.ts) 接受连接，创建独立 Session；[客户端入口](../src/client.ts) 发起调用。Session 的 ID、工作目录和连接级 signal 均在 [契约](../src/contracts.ts) 中定义。Prompt 内容限文本和经过工作目录边界校验的本地资源引用；请求、会话取消和连接关闭合并为当前 Prompt 的中止信号。

## 边界

`stopReason` 仅表示 ACP Prompt 的结束原因，不能作为 Benchmark 的领域评分。集成层负责核验 Session metadata、工作目录与结果身份，并映射 Goal 和 Run 的真实终态。

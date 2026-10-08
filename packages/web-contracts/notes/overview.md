# Web 传输契约

本包定义 Browser HTTP 命令、Session 投影和 SSE 事件的传输形状。[Session DTO](../src/session.ts) 与 [命令 DTO](../src/command.ts) 面向 Web 边界；Browser 包提供路由和投影，Goal Board 只渲染接收到的视图。

## 所有权

传输 DTO 不是 Goal Snapshot 的持久化 Schema。运行状态及授权事实由 Runtime 提交，Browser 从已提交状态建立当前视图；前端的瞬时活动不会变成恢复输入。请求入站验证由对应的 Web 边界处理。

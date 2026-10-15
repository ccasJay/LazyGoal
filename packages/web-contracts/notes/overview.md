# Web 传输契约

本包定义 Browser HTTP 命令、Session 投影和 SSE 事件的传输形状。[Session DTO](../src/session.ts) 与 [命令 DTO](../src/command.ts) 面向 Web 边界；包含阶段分组（`BrowserRunStageGroup`）与步骤归属身份。Browser 包提供路由和投影，Goal Board 只渲染接收到的视图。

待审批 Plan Run 的 `BrowserPendingInteraction` 可携带候选路线；获批 Plan Run 的 `BrowserSessionRun.planRoute` 则表示 Runtime 权威的完整路线、修订和阶段状态。普通 Run 省略该字段；路线字段不替代 Trajectory 阶段和事件。

实时 `BrowserGoalActivityEvent` 保留 ExecutionStream 来源 ID/cursor，与 `BrowserSessionStep.sourceEventId` 所属的 Trajectory 标识空间分离。工具输入/结果使用白名单摘要；公开回复、等待、阶段、终态、失败和未知活动以显式边界传递。DTO 不携带隐藏推理、任意工具参数或持久化活动组身份。

## 所有权

传输 DTO 不是 Goal Snapshot 的持久化 Schema。运行状态、阶段记录及授权事实由 Runtime 提交，Browser 从已提交状态建立当前视图；前端的瞬时活动不会变成恢复输入。请求入站验证由对应的 Web 边界处理。

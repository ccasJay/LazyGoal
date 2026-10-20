# Web 传输契约

正式消息 DTO 保留 Snapshot 中的稳定消息身份、所属 Run 和 Run 内事实位置，供历史窗口和实时提交通知使用。

`BrowserGoalSessionState` 明确把消息、步骤和阶段历史标记为 Activity 外置，同时保留当前 Run、Plan 路线、等待、队列、中断和既有当前状态。`BrowserActivityPage` 只包含白名单事实摘要和有界正文，默认页大小为 50、上限为 100；Run 内事实序号与 Snapshot 保存的消息位置决定稳定顺序。cursor 绑定 Goal、筛选与每个相关 Run 的首次消息/轨迹水位，双向读取不吸收窗口之后追加的内容；`gaps` 给出页首尾尚未加载范围的准确项数和首尾位置。DTO 不把原始事件 payload 或完整工具／Observation 载荷暴露给浏览器。

本包定义 Browser HTTP 命令、Session 投影和 SSE 事件的传输形状。[Session DTO](../src/session.ts) 与 [命令 DTO](../src/command.ts) 面向 Web 边界；包含内部阶段分组（`BrowserRunStageGroup`）、Plan Run 路线和步骤归属身份。待审批任务候选 `BrowserPlanRouteStage` 只含目标与验收条件；获批 Run 的 `BrowserPlanRoute` 另含 Runtime 阶段身份、修订、状态及游标，普通 Run 省略此字段。Browser 包提供路由和投影，Goal Board 只渲染接收到的视图。

会话指标 DTO 的 `tokensPerSecond` 表示应用观察到的端到端 Provider 请求输出速率；其分子使用 Provider 确认的输出 token，时间语义和测量覆盖由 [指标投影模块](../../session-metrics/notes/overview.md)定义。

`BrowserSessionStep.sourceEventId` 指向已提交 Trajectory 事件，并可携带 Action 身份和已验证的相邻边界；`BrowserGoalActivityEvent.sourceEventId/sourceCursor` 属于独立的 ExecutionStream 来源。不同来源即使字符串相同也不得互相去重；`actionId` 是前端将同一调用的实时状态和历史步骤协调起来的稳定身份。实时 DTO 只含有界、白名单的输入/结果摘要和公开边界类型，不含隐藏推理、任意工具载荷或输出正文。该身份形状服务于可重建 UI，不作为持久化 ActivityGroup Schema。

## 所有权

传输 DTO 不是 Goal Snapshot 的持久化 Schema。运行状态、阶段记录及授权事实由 Runtime 提交，Browser 从已提交状态建立当前视图；前端的瞬时活动不会变成恢复输入。请求入站验证由对应的 Web 边界处理。

Activity 正文摘要最多 4,000 UTF-16 code unit，截断不得拆分代理项；原文按 messageId 从现有详情路由分段读取。文件 Trajectory 存储仍可能整文件扫描，wire 页大小不代表磁盘随机访问有界。`isBrowserActivityPage` 与 `isBrowserGoalSessionState` 校验页上限、历史外置标记和字段白名单，拒绝任意原始 payload 扩展字段。

Provider 表单在线查询使用 `BrowserProviderModelQuery` 与 `BrowserProviderModels`：请求不需要默认模型，响应只返回模型 ID 和名称；`isProviderModels` 验证响应边界。密钥仅存在于请求，不回显或持久化。

`BrowserSessionStep.think` 携带显式 Think 目标及可选的已提交分析；无输出表示尚无完成事实，`truncated` 表示有界正文被省略。多个 Think 成员可以共享同一个 Runtime Step 序号，成员数量不等于 `stepCount`。Think 正文通过受保护的会话 HTTP 响应提供，实时通知仍只触发检查点重读；供应商隐藏推理不进入该 DTO。

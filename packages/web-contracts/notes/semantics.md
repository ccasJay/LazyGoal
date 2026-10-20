# Web 传输契约语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| BrowserGoalSession | 浏览器会话投影 DTO。 | [Web 传输契约](../README.md) | [模块说明](./overview.md) |
| BrowserGoalSessionState | 只含当前 Run 状态的窄会话 DTO；消息、步骤和阶段历史明确由 Activity 提供。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserActivityPage | 固定水位的白名单 Activity 页；含最多 100 个原子项、双向 cursor 和未加载首尾范围。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityMessageItem.purpose | 必填的助手消息用途：过程、最终答复或公开通知；用户消息省略。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityMessageItem.previewId | 已保存完成候选答复关联的公开候选身份；不包含临时预览正文。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityFactItem.stageTarget | 仅已提交阶段声明携带的有界目标文本。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityToolState | 事实项携带的最小已提交工具状态：工具身份、执行状态、审批状态、白名单输入与结果摘要、恢复尝试、修订与恢复引用、PTC 父身份和断组边界；不含原始参数、Observation 正文或 reasoning。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityThinkItem | 显式 Think 的既有获准摘要与已提交输出；不新增 Step 计数，也不引入私有推理。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserMessagePosition | 正式消息所属 Run 的已提交事实锚点与同锚点 Snapshot 次序；不表示墙钟时间或 Step。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserPlanRouteStage | 任务审批 DTO 中按顺序展示的候选阶段目标与验收条件。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserInteractionView | 当前等待的类型化 wire 摘要：种类、稳定引用、可用决定与截断标记。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserInteractionView | 当前已提交等待的类型化摘要：种类、稳定引用、可用决定与字段级截断标记。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserInteractionDetailResult | 交互完整审阅内容的读取结果与稳定错误分类。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserPlanRoute | 获批 Plan Run 的完整权威路线及当前游标；普通 Run 省略。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserGoalActivityEvent | 白名单公开的短期 SSE 活动及其来源身份；不持久化。 | [Web 传输契约](../README.md) | [Event DTO](../src/events.ts) |
| SessionMetricsSnapshot | 会话指标响应 DTO；`tokensPerSecond` 的端到端计时语义归属指标投影模块。 | [Web 传输契约](../README.md) | [指标 DTO](../src/metrics.ts) |
| BrowserCreateGoalCommand | 创建 Goal 的 Web 命令。 | [Web 传输契约](../README.md) | [模块说明](./overview.md) |
| Provider model query | 未保存连接参数与仅含模型 ID/名称的响应。 | [Web 传输契约](../README.md) | [Provider DTO](../src/provider-settings.ts) |
| BrowserSessionStep.think | 显式 Think 的有界目标、可选已提交输出及截断标记；不计为新增 Runtime Step。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserActionReview | 只读审批预检的 wire 载荷与稳定拒绝码。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |

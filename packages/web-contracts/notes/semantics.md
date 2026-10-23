# Web 传输契约语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| BrowserGoalSession | 浏览器会话投影 DTO。 | [Web 传输契约](../README.md) | [模块说明](./overview.md) |
| BrowserGoalList | Goal 列表响应信封：可读取摘要与无法读取的历史 Goal 数量。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserGoalSessionState | 只含当前 Run 状态的窄会话 DTO；消息、步骤和阶段历史明确由 Activity 提供。 | [Web 传输契约](../README.md) | [Session DTO](../src/session.ts) |
| BrowserSessionInputCommand | 统一输入 wire 命令；队列删除与 Steer 来源转换均绑定客户端读取的队列修订，Runtime 负责最终原子校验。 | [Web 传输契约](../README.md) | [输入命令 DTO](../src/session-input.ts)、[入站解析](../../browser/src/browser-goal-routes.ts) |
| BrowserActivityPage | 固定水位的白名单 Activity 页；含最多 100 个原子项、双向 cursor 和未加载首尾范围。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityMessageItem.purpose | 必填的助手消息用途：过程、最终答复或公开通知；用户消息省略。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityMessageItem.previewId | 已保存完成候选答复关联的公开候选身份；不包含临时预览正文。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityFactItem.stageTarget | 仅已提交阶段声明携带的有界目标文本。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityToolState | 事实项携带的最小已提交工具状态：工具身份、执行状态、审批状态、白名单输入与结果摘要、恢复尝试、修订与恢复引用、PTC 父身份和断组边界；不含原始参数、Observation 正文或 reasoning。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityThinkItem | 显式 Think 的既有获准摘要与已提交输出；不新增 Step 计数，也不引入私有推理；`executionUnitId` 是定位 Trajectory 完整事件的详情引用。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |
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
| 当前 Run 错误摘要 | 窄状态中的已保存失败原因；只属于当前 Run，不读取历史或暴露供应商原始响应。 | [Web 传输契约](../README.md) | [模块说明](./overview.md) |
| 模型阶段元数据 | model_started 的可选调用阶段、身份、执行单元与来源时间；wire 拒绝未知阶段、无效时间及超长身份。 | [Web 传输契约](../README.md) | [事件 DTO](../src/events.ts)、[验证](../src/validation.ts) |
| Activity 诊断说明 | 事实可携带最多 500 字符的安全状态说明，不含原始反馈或检索内容。 | [Web Contracts](../README.md) | [Activity DTO](../src/activity.ts) |
| BrowserActivityFactItem 检索字段 | `lookupId` 关联同 Run 的请求与结果；`lookupRequest` 只描述枚举类别，`lookupErrorCode` 只接受已知失败码，不暴露原始查询与错误消息。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts)、[Wire 校验](../src/validation.ts) |

| BrowserActivityRunContext.terminalDetail | 所属 Run 固定提交水位内的安全失败摘要；可缺失，不承载原始异常。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts)、[Wire 校验](../src/validation.ts) |
| 用户中断状态 | 已受理到取消结算的两阶段记录及未知工具效果，不含模型收尾。 | [Goal Runtime](../../runtime/README.md) | [Runtime 中断语义](../../runtime/notes/overview.md) |
| BrowserActivityStageContext / BrowserActivityActionContext | 阶段的有界目标及阶段／Action 的本页来源完整性；不等同于执行完成状态。 | [Web 传输契约](../README.md) | [Activity DTO](../src/activity.ts) |

# 浏览器服务边界语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| BrowserSessionAccess | 短期授权和请求边界。 | [浏览器服务边界](../README.md) | [模块说明](./overview.md) |
| Goal 列表响应 | 可读取的 Goal 摘要与因本地快照不兼容而无法读取的历史 Goal 数量；单条不可读快照不使整份列表失败。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| BrowserGoalCommandService | 未迁入统一 inputs 入口的管理命令（Plan Mode、模型选择、Action 详情、授权与权限模式、终态管理前置检查）到 Runtime 的适配。 | [浏览器服务边界](../README.md) | [模块说明](./overview.md) |
| BrowserGoalSessionPort | Browser 委派 Runtime 会话所有者的窄端口：创建、统一输入、收据查询、安全状态与 Goal 事件；Browser 不持有账本、队列、执行名额或后台推进。 | [浏览器服务边界](../README.md) | [Browser Session Port](../src/browser-session-port.ts) |
| Task approval route projection | Plan Run 审批等待点中的完整候选阶段顺序与验收条件。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Interaction view projection | 当前等待的类型化摘要：种类、稳定 `interactionId`、可用决定与字段级截断标记；完整请求正文由交互详情读取按同一引用提供，不在会话摘要中复制。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Interaction details route | 按当前 Goal／Run／交互引用读取完整问题、任务范围或 Action 输入；PTC 子操作按其真实 Action 身份寻址，父程序身份随详情给出；不匹配返回稳定错误且不推进等待。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| Approved Plan route projection | 当前获批 Plan Run 的 Snapshot 权威完整路线及其 Runtime 状态；普通 Run 省略。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Session output projection | Runtime 的类型化会话输出按 wire 联合投影为单一 Goal SSE：状态同步、输入结果、公开生成、正式消息、工具活动、交互、Run 状态与终态、流故障与提交边界；不保留第二条事件流。 | [浏览器服务边界](../README.md) | [Browser Session Port](../src/browser-session-port.ts) |
| 正式消息位置投影 | 状态摘要、消息读取和提交通知保留消息身份及 Snapshot 保存的 Run 事实锚点位置。 | [浏览器服务边界](../README.md) | [Browser Session Port](../src/browser-session-port.ts) |
| Goal Session state view | `?view=state` 从 Snapshot 投影当前执行、等待、队列、控制与管理状态；消息／步骤／阶段历史明确由 Activity 提供。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Activity history page | 固定每个 Run 的消息数量、末消息身份与提交序号，按稳定位置返回最多 100 项、双向 cursor 及首尾未加载范围。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Activity message purpose | 助手正文公开区分过程、答复和通知；用途只取已保存消息字段并由 wire guard 校验。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Activity candidate association | 仅正式完成候选答复携带稳定 `previewId`，供浏览器按候选身份结算预览；不投影未确认正文。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Activity stage target | 仅已提交的 `run_stage_declared` 事实公开有界阶段目标；其他事实不携带标题载荷。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Activity tool state | Activity 事实按其所属已提交动作附带最小工具状态白名单：工具身份、执行状态、审批状态、白名单输入与结果摘要、恢复尝试、按来源顺序排列的授权／执行／重试／结果生命周期、修订与恢复引用、PTC 父身份，以及已验证的断组边界；同一 Action 的决策与审批事实也携带该状态，供前端折叠为一个活动；原始参数、Observation 正文与 reasoning 不投影。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Activity think summary | Activity 页从已提交 Think 事实投影既有获准摘要与已提交输出，作为独立原子项参与排序与分页，并附带执行单元定位引用以支持 Trajectory 详情入口。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Activity route access | Activity 与窄状态读取由同一 Host、Origin、Bearer 边界保护，授权失败发生于数据读取之前。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| Safe live activity projection | 白名单公开的 Goal 范围 SSE 活动、`state_sync`／`input_result` 与 ExecutionStream 来源身份；与 Trajectory 标识空间分离。 | [浏览器服务边界](../README.md) | [Browser Session Port](../src/browser-session-port.ts) |
| Provider settings routes | 受管 Provider 档案的掩码读取与增删改、激活、连接测试接口；写请求需同源 `Origin` 与 Bearer 令牌。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| Model source dimension | 模型目录携带的受管档案与回退来源列表，以及按 `providerProfileId` 读取指定来源目录的能力。 | [浏览器服务边界](../README.md) | [Model Catalog Projection](../src/browser-model-catalog.ts) |
| Provider model preview | 受同源授权保护的未保存连接查询，不写入档案。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| Think session projection | 从已提交请求与完成事实配对的独立 Think 展示成员，保留原 Step 序号与有界分析。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Approval review route | 受保护的只读审批预检接口；返回原／最终参数与能力范围，不保存批准也不解除等待。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| 当前 Run 错误摘要 | 窄状态中的已保存失败原因；只属于当前 Run，不读取历史或暴露供应商原始响应。 | [浏览器服务边界](../README.md) | [模块说明](./overview.md) |
| 实时模型进度 | SSE 公开模型开始的真实来源时间和已知调用元数据；Bash 活动只附带有界命令摘要。 | [浏览器服务边界](../README.md) | [Browser Session Port](../src/browser-session-port.ts)、[Session Projection](../src/browser-projection.ts) |
| 执行诊断摘要 | 已提交纠错、请求失败、检索和审批事实的白名单摘要；同一 Action 的授权、执行、重试与结果按来源顺序折叠，工具保留真实 Stage 关联，可跨刷新读取。 | [Browser](../README.md) | [Activity 投影](../src/browser-projection.ts) |
| 历史检索关联 | 四种已提交检索事实携带共同 `lookupId`，请求只公开枚举生成的类别，失败只公开白名单错误码；不复制查询、命中或原始错误消息。 | [Browser](../README.md) | [Activity 投影](../src/browser-projection.ts) |

| Activity Run 终态摘要 | 按所属 Run 与固定提交水位投影受限代码和固定说明，不公开原始异常，原因缺失时省略。 | [Browser](../README.md) | [Activity 投影](../src/browser-projection.ts) |
| 用户中断状态 | 已受理到取消结算的两阶段记录及未知工具效果，不含模型收尾。 | [Goal Runtime](../../runtime/README.md) | [Runtime 中断语义](../../runtime/notes/overview.md) |
| Activity grouping context | 从已提交声明提取有界阶段目标，按 Run 及阶段／Action 提供本页完整性。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |

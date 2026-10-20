# 浏览器服务边界语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| BrowserSessionAccess | 短期授权和请求边界。 | [浏览器服务边界](../README.md) | [模块说明](./overview.md) |
| BrowserGoalCommandService | 未迁入统一 inputs 入口的管理命令（Plan Mode、模型选择、Action 详情、授权与权限模式、终态管理前置检查）到 Runtime 的适配。 | [浏览器服务边界](../README.md) | [模块说明](./overview.md) |
| BrowserGoalSessionPort | Browser 委派 Runtime 会话所有者的窄端口：创建、统一输入、收据查询、安全状态与 Goal 事件；Browser 不持有账本、队列、执行名额或后台推进。 | [浏览器服务边界](../README.md) | [Browser Session Port](../src/browser-session-port.ts) |
| Task approval route projection | Plan Run 审批等待点中的完整候选阶段顺序与验收条件。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Interaction view projection | 当前等待的类型化摘要：种类、稳定 `interactionId`、可用决定与字段级截断标记；完整请求正文由交互详情读取按同一引用提供，不在会话摘要中复制。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Interaction details route | 按当前 Goal／Run／交互引用读取完整问题、任务范围或 Action 输入；PTC 子操作按其真实 Action 身份寻址，父程序身份随详情给出；不匹配返回稳定错误且不推进等待。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| Approved Plan route projection | 当前获批 Plan Run 的 Snapshot 权威完整路线及其 Runtime 状态；普通 Run 省略。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Session output projection | Runtime 的类型化会话输出按 wire 联合投影为单一 Goal SSE：状态同步、输入结果、公开生成、正式消息、工具活动、交互、Run 状态与终态、流故障与提交边界；不保留第二条事件流。 | [浏览器服务边界](../README.md) | [Browser Session Port](../src/browser-session-port.ts) |
| Safe live activity projection | 白名单公开的 Goal 范围 SSE 活动、`state_sync`／`input_result` 与 ExecutionStream 来源身份；与 Trajectory 标识空间分离。 | [浏览器服务边界](../README.md) | [Browser Session Port](../src/browser-session-port.ts) |
| Provider settings routes | 受管 Provider 档案的掩码读取与增删改、激活、连接测试接口；写请求需同源 `Origin` 与 Bearer 令牌。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| Model source dimension | 模型目录携带的受管档案与回退来源列表，以及按 `providerProfileId` 读取指定来源目录的能力。 | [浏览器服务边界](../README.md) | [Model Catalog Projection](../src/browser-model-catalog.ts) |
| Provider model preview | 受同源授权保护的未保存连接查询，不写入档案。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |
| Think session projection | 从已提交请求与完成事实配对的独立 Think 展示成员，保留原 Step 序号与有界分析。 | [浏览器服务边界](../README.md) | [Session Projection](../src/browser-projection.ts) |
| Approval review route | 受保护的只读审批预检接口；返回原／最终参数与能力范围，不保存批准也不解除等待。 | [浏览器服务边界](../README.md) | [Goal Routes](../src/browser-goal-routes.ts) |

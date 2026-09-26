# Browser Session Shell

## 职责

[`@lazygoal/browser`](../../packages/browser/src/index.ts) 负责本机浏览器入口的短期能力令牌、Host/Origin 检查、安全响应头、静态资源路由，以及正式工作区 Goal 列表和会话只读投影。它不拥有 Goal 状态、Runtime 命令或持久化。

## 入口与访问边界

显式 `lazygoal web` 命令创建随机能力令牌，将其放入页面 URL fragment，并把访问中间件配置到 Composition Root 的 HTTP Host。服务监听 `127.0.0.1` 上的操作系统分配端口；静态页面根文档、favicon 和 `/assets/` 可不带令牌读取。其他请求须匹配精确 Host、同源约束和 Bearer 令牌。静态响应限制来源、禁止 referrer 并禁用缓存。

授权后，`GET /api/goals` 从正式工作区 Catalog 返回真实 Goal 摘要，`GET /api/goals/:goalId` 从正式 Snapshot 和各 Run 的 Trajectory 返回会话视图。看板读取使用 Composition Root 暴露的正式工作区 Store 与 Trajectory 读取器，不经过含 Benchmark 的聚合目录。会话投影只纳入 Snapshot 提交边界内的事件，截断较长历史和文本，并省略 Profile、模型配置、推理、原始事件、Tool 输入及原始输出。缺失 Goal 与不可读数据分别返回 404 和稳定的 500 错误码。

`POST /api/goals` 只接受有界 JSON 中的稳定 Goal ID 与非空意图；Profile 和执行策略仍由本机决定。同 ID、同意图的重试复用在途受理或已有快照，不同意图冲突；另一个 Goal 正在运行时拒绝新建。受理仅在初始 Snapshot 成功保存后返回，执行继续由现有 Launcher 推进到等待点或终态；页面断开不会取消已受理的执行。

`POST /api/goals/:goalId/interactions` 只接受回答、提案批准/反馈或 Action 批准/拒绝，并要求当前 `runId` 与相应 `requestId`/`actionId` 匹配最新等待 Snapshot。服务端在转交 Coordinator 前再次检查等待类型和身份；每次只允许一个 Goal 执行推进，同一在途交互的相同重试复用受理结果，旧身份或错配等待点不调用 Runtime。

`POST /api/goals/:goalId/messages` 只接受当前 `runId` 与非空普通文本。普通 blocked 等待恢复同一 Run；已完成 Run 调用 Coordinator 创建后继 Run；提问、提案、Action 等结构化等待以及其他 Run 状态拒绝普通文本。成功受理前确认新增用户消息及对应 Run 变更已保存；同一在途请求重试复用受理结果。

`GET /api/goals/:goalId/events?runId=...` 将连接绑定到 Snapshot 中的当前 Run。事件仅投影白名单活动和长度受限的助手文本；reasoning、Tool 输出及未识别载荷不转发。Trajectory/Checkpoint 事件与 Goal 保存只发送刷新通知；队列缺口、Publisher 关闭或连接故障要求页面重新读取，不代表 Run 完成。

SIGINT 通过 Runtime 已有关闭协调器冻结检查点、取消执行并关闭 HTTP Host。默认 CLI 仍启动 TUI。

## 当前限制

当前页面仍是静态占位页，尚未调用读取、创建、交互、消息或事件 API。后续范围见 [Goal 看板单会话后端验证 Spec](../../specs/goal-board-backend-validation/requirements.md)。

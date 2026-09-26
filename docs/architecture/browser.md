# Browser Session Shell

## 职责

[`@lazygoal/browser`](../../packages/browser/src/index.ts) 负责本机浏览器入口的短期能力令牌、Host/Origin 检查、安全响应头、静态资源路由，以及正式工作区 Goal 列表和会话只读投影。它不拥有 Goal 状态、Runtime 命令或持久化。

## 入口与访问边界

显式 `lazygoal web` 命令创建随机能力令牌，将其放入页面 URL fragment，并把访问中间件配置到 Composition Root 的 HTTP Host。服务监听 `127.0.0.1` 上的操作系统分配端口；静态页面根文档、favicon 和 `/assets/` 可不带令牌读取。其他请求须匹配精确 Host、同源约束和 Bearer 令牌。静态响应限制来源、禁止 referrer 并禁用缓存。

授权后，`GET /api/goals` 从正式工作区 Catalog 返回真实 Goal 摘要，`GET /api/goals/:goalId` 从正式 Snapshot 和各 Run 的 Trajectory 返回会话视图。看板读取使用 Composition Root 暴露的正式工作区 Store 与 Trajectory 读取器，不经过含 Benchmark 的聚合目录。会话投影只纳入 Snapshot 提交边界内的事件，截断较长历史和文本，并省略 Profile、模型配置、推理、原始事件、Tool 输入及原始输出。缺失 Goal 与不可读数据分别返回 404 和稳定的 500 错误码。

SIGINT 通过 Runtime 已有关闭协调器冻结检查点、取消执行并关闭 HTTP Host。默认 CLI 仍启动 TUI。

## 当前限制

当前页面仍是静态占位页；读取 API 已接入，但界面尚未调用它。Goal 创建/推进命令与 Execution Stream 订阅也尚未接入。后续范围见 [Goal 看板单会话后端验证 Spec](../../specs/goal-board-backend-validation/requirements.md)。

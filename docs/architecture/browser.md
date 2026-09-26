# Browser Session Shell

## 职责

[`@lazygoal/browser`](../../packages/browser/src/index.ts) 负责本机浏览器入口的短期能力令牌、Host/Origin 检查、安全响应头和受路径约束的静态资源路由。它不拥有 Goal 状态、Runtime 命令或持久化。

## 入口与访问边界

显式 `lazygoal web` 命令创建随机能力令牌，将其放入页面 URL fragment，并把访问中间件配置到 Composition Root 的 HTTP Host。服务监听 `127.0.0.1` 上的操作系统分配端口；静态页面根文档、favicon 和 `/assets/` 可不带令牌读取。其他请求须匹配精确 Host、同源约束和 Bearer 令牌。静态响应限制来源、禁止 referrer 并禁用缓存。

SIGINT 通过 Runtime 已有关闭协调器冻结检查点、取消执行并关闭 HTTP Host。默认 CLI 仍启动 TUI。

## 当前限制

当前页面是无会话数据的静态占位页。Goal 列表、会话投影、命令路由和执行流订阅尚未接入；相关实现计划见 [Goal 看板单会话后端验证 Spec](../../specs/goal-board-backend-validation/requirements.md)。

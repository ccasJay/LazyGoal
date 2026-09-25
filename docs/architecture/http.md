# HTTP Host

## 职责

`@lazygoal/http` 封装 Hono 与 Node 适配器，提供可复用的本机 HTTP 生命周期边界。它负责挂载独立 Hono 子路由、显式启动和关闭服务，不依赖 LazyGoal 的领域或指标包。

## 生命周期与访问边界

调用方先挂载路由，再通过 `start(port)` 启动 IPv4 回环地址 `127.0.0.1` 上的监听；端口 `0` 由操作系统分配。`close()` 关闭已启动服务，实例关闭后不能重启。创建服务不会监听端口。

各业务包拥有自己的 HTTP 路由与访问控制。当前 Session Metrics 路由由 [`session-metrics`](./session-metrics.md) 提供；CLI/TUI Composition Root 负责装配它们，但不会自动启动 HTTP Host。

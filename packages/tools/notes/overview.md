# 内置工具

本包实现文件、Shell、搜索和编辑等可供 Agent 调用的工具。[公开入口](../src/index.ts) 导出具体实现及其 Input Contract；通用注册和单次校验边界由 [Tool Core](../../tool-core/README.md) 拥有。进程工具（`process_start`/`process_read`/`process_stop`）同样属于本包，但它们调用 [进程会话运行时](../../process-runtime/README.md) 的共享管理器；会话归属、额度与自有句柄结算不由工具实现决定。

## 执行边界

文件工具的路径须通过 [Workspace Sandbox](../../sandbox/README.md) 限定，Shell 执行受超时与输出上限控制；Bash 只移除 macOS 系统 Git 启动器在 Seatbelt 下固定出现的 xcrun 缓存写入噪声，其余 stderr 原样保留。Tool 的 Observation 是执行结果，只有 Runtime 成功提交后才能成为当前 Run 的证据。权限授予和恢复重放由 [Runtime](../../runtime/README.md) 管理，不由工具实现决定。

Grep 的空白 `include` 与 `exclude` 按未设置过滤处理；非空模式才用于匹配文件路径。

## 网页工具

`web_search` 未注入后端时使用 [DuckDuckGo HTML 后端](../src/web/search-duckduckgo.ts)：解析结果页并区分明确零结果与不可识别结构。成功但无法识别的响应返回 `WEB_SEARCH_UNRECOGNIZED_RESPONSE`；429/5xx 与网络瞬态失败仍抛出 `TransientToolExecutionFailure`，由 Runner 安全重试。

`web_fetch` 未注入 handler 时使用[默认抓取 handler](../src/web/fetch-default.ts)。它只接受 `http`/`https`，拒绝 URL 凭据、`localhost`、本机、私网、链路本地、组播、未指定和常见保留地址；每跳解析全部 A/AAAA，任一地址受限即失败，并把该跳的连接绑定到已验证地址集合。重定向手动逐跳重新校验，最多 5 跳。连接保留原 URL 的 Host、原域名 TLS SNI 与证书主机名校验，不修改全局 dispatcher。成功消费正文后关闭请求自有 dispatcher；失败、取消、超时和正文超限时销毁连接并释放未消费正文。正文只读取 `text/html`、`application/xhtml+xml`、`text/plain`、`application/json`、`application/xml` 与其它 `text/*`，按响应 charset、HTML `<meta charset>` 前 1 KiB、UTF-8 的顺序解码；`Content-Length` 与读取累计上限均为 2 MiB，单次请求超时为 30 秒。

HTML 可见文本由 [html-to-text 抽取](../src/web/html-extract.ts) 产生：排除 `script`、`style`、`img`，保留表格、列表、标题和实体，再折叠为单行；`htmlToPlainText` 只委托该实现。抓取失败码包括 `WEB_FETCH_TIMEOUT`、`WEB_RESPONSE_TOO_LARGE`、`WEB_FETCH_FAILED`、`WEB_FETCH_BLOCKED_URL`、`WEB_FETCH_UNSUPPORTED_CONTENT_TYPE`、`WEB_FETCH_REDIRECT_LIMIT` 和 `WEB_FETCH_HTTP_ERROR`；429/5xx 仍映射为瞬态失败。

上述 URL 策略是 Tool 层纵深防御，不提供内核级域名隔离，也不替代 [Sandbox](../../sandbox/README.md) 的 `SANDBOX_APPROVAL_REQUIRED` 与 `all_outbound` 审批。

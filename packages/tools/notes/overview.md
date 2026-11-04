# 内置工具

本包实现文件、Shell、编辑和网页等可供 Agent 调用的工具。[公开入口](../src/index.ts) 导出具体实现及其 Input Contract；通用注册和单次校验边界由 [Tool Core](../../tool-core/README.md) 拥有。仓库文本搜索由 Bash Tool 执行，优先使用随项目分发的 `rg`，并在运行时诊断后降级到系统 `grep` 或 `find`/`awk`。进程工具（`process_start`/`process_read`/`process_stop`）同样属于本包，但它们调用 [进程会话运行时](../../process-runtime/README.md) 的共享管理器；会话归属、额度与自有句柄结算不由工具实现决定。

## 输入契约

每个工具的输入以源码中的 TS interface 与 JSDoc 定义，并在 [Catalog](../../../contracts/catalog.json) 登记 `typescript-binding` 身份、版本和生成制品。`contracts/catalog.json` 是生成登记的唯一来源；生成绑定位于各源文件旁的 `generated/` 目录，不由工具代码维护第二份字段表。全部实际注册工具输入已启用生成并消费真实 `ContractBinding`；工具注册、`prepare` 与模型声明在 Tool Core 接缝消费同一绑定。

## 执行边界

文件工具的路径须通过 [Workspace Sandbox](../../sandbox/README.md) 限定，Shell 执行受超时与输出上限控制；Bash 只移除 macOS 系统 Git 启动器在 Seatbelt 下固定出现的 xcrun 缓存写入噪声，其余 stderr 原样保留。Tool 的 Observation 是执行结果，只有 Runtime 成功提交后才能成为当前 Run 的证据。权限授予和恢复重放由 [Runtime](../../runtime/README.md) 管理，不由工具实现决定。

搜索命令的工作目录固定为 workspaceRoot；Bash 环境优先把 bundled `rg` 放入 `PATH`，并在可用时提供 `LAZYGOAL_RG_PATH`。搜索 Prompt 要求先输出 backend 诊断标记，再使用有界、只读的 `rg` 命令；`rg` 无匹配的退出码 1 表示空结果，不是基础设施失败。Bash 仍保留既有超时、输出上限和 Seatbelt 边界，不限制命令内容本身。

## 网页工具

`web_search` 未注入后端时使用 [DuckDuckGo HTML 后端](../src/web/search-duckduckgo.ts)：解析结果页并区分明确零结果与不可识别结构。成功但无法识别的响应返回 `WEB_SEARCH_UNRECOGNIZED_RESPONSE`；429/5xx 与网络瞬态失败仍抛出 `TransientToolExecutionFailure`，由 Runner 安全重试。

`web_fetch` 未注入 handler 时使用[默认抓取 handler](../src/web/fetch-default.ts)。它只接受 `http`/`https`，拒绝 URL 凭据、`localhost`、本机、私网、链路本地、组播、未指定和常见保留地址；每跳解析全部 A/AAAA，任一地址受限即失败，并把该跳的连接绑定到已验证地址集合。重定向手动逐跳重新校验，最多 5 跳。连接保留原 URL 的 Host、原域名 TLS SNI 与证书主机名校验；抓取请求只使用请求自有 dispatcher，并在加载 npm `undici` 后恢复 Node 内置 fetch 原本的环境代理 dispatcher，避免 `undici@8` 覆盖 `NODE_USE_ENV_PROXY` 槽位、使后续 Provider 请求绕过代理。成功消费正文后关闭请求自有 dispatcher；失败、取消、超时和正文超限时销毁连接并释放未消费正文。正文只读取 `text/html`、`application/xhtml+xml`、`text/plain`、`application/json`、`application/xml` 与其它 `text/*`，按响应 charset、HTML `<meta charset>` 前 1 KiB、UTF-8 的顺序解码；`Content-Length` 与读取累计上限均为 2 MiB，单次请求超时为 30 秒。

HTML 可见文本由 [html-to-text 抽取](../src/web/html-extract.ts) 产生：排除 `script`、`style`、`img`，保留表格、列表、标题和实体，再折叠为单行；`htmlToPlainText` 只委托该实现。抓取失败码包括 `WEB_FETCH_TIMEOUT`、`WEB_RESPONSE_TOO_LARGE`、`WEB_FETCH_FAILED`、`WEB_FETCH_BLOCKED_URL`、`WEB_FETCH_UNSUPPORTED_CONTENT_TYPE`、`WEB_FETCH_REDIRECT_LIMIT` 和 `WEB_FETCH_HTTP_ERROR`；429/5xx 仍映射为瞬态失败。

上述 URL 策略是 Tool 层纵深防御，不提供内核级域名隔离，也不替代 [Sandbox](../../sandbox/README.md) 的 `SANDBOX_APPROVAL_REQUIRED` 与 `all_outbound` 审批。

## 子 Agent 委派工具

`spawn_subagent` 允许父 Goal 将独立自包含子任务委派给子 Goal，输入包括必填 `intent` 与可选 `title`。运行时在同一工作区、继承父级 Profile 与模型选择的普通（non-plan）模式下启动子 Goal 会话，阻塞等待子 Goal 达到终态（`completed` / `failed` / `cancelled`），并返回包含子 Goal ID、终态及最终答复或失败原因的有界结果观察。父 Run 取消会中止等待且不挂起进程。子 Agent 的 Profile 会由运行时自动剔除 `spawn_subagent` 权限，从代码层面杜绝递归派发。


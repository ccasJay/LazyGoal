# 内置工具语义表

本表只概括本模块负责的概念；字段及错误契约以模块说明引用的源码为准。

| 概念 | 简明含义 | 归属模块 | 权威说明 |
| --- | --- | --- | --- |
| 工具输入 TS 契约 | 各工具在源码中声明的输入 interface 与 JSDoc 约束；Catalog 登记其生成身份。 | [内置工具](../README.md) | [模块说明](./overview.md)、[Catalog](../../../contracts/catalog.json) |
| 工具输入生成绑定 | 由 Catalog 从 TS 输入生成的 Schema、校验器与 `ContractBinding`；工具注册与准备消费。 | [内置工具](../README.md) | [模块说明](./overview.md)、[生成目录](../src/generated/) |
| BashTool | 受控 Shell 工具。 | [内置工具](../README.md) | [模块说明](./overview.md) |
| 仓库文本搜索 | Bash 在 workspaceRoot 内执行有界 shell 搜索；优先 bundled `rg`，运行时诊断后可降级为系统 `grep` 或 `find`/`awk`。 | [内置工具](../README.md) | [模块说明](./overview.md)、[Bash 实现](../src/bash.ts) |
| ReadFileTool | 文件读取工具。 | [内置工具](../README.md) | [模块说明](./overview.md) |
| 进程工具 | `process_start`/`process_read`/`process_stop` 的输入契约、可信身份与结果映射。 | [内置工具](../README.md) | [进程工具实现](../src/process-tools.ts) |
| 受管进程管理器 | 会话归属、额度、停止与自有句柄结算。 | [进程会话运行时](../../process-runtime/README.md) | [管理器实现](../../process-runtime/src/process-manager.ts) |
| 默认网页搜索后端 | 零配置 DuckDuckGo HTML 后端；结果、明确零结果与不可识别结构分别对应结果数组、空数组与 `WEB_SEARCH_UNRECOGNIZED_RESPONSE`。 | [内置工具](../README.md) | [DuckDuckGo 后端](../src/web/search-duckduckgo.ts) |
| 网页抓取安全边界 | URL 协议与凭据、本机/私网/保留地址、逐跳 DNS 校验与连接地址绑定、最多 5 跳重定向、Host/TLS 身份、请求自有连接释放，以及导入 `undici` 后恢复 Node 内置 fetch 的环境代理 dispatcher。 | [内置工具](../README.md) | [默认抓取 handler](../src/web/fetch-default.ts)、[URL 与地址策略](../src/web/fetch-url-policy.ts) |
| 网页响应解码 | content-type 白名单、charset 与 HTML meta 嗅探、UTF-8 回退、2 MiB 字节上限及稳定抓取错误码。 | [内置工具](../README.md) | [默认抓取 handler](../src/web/fetch-default.ts)、[Web Fetch Tool](../src/web-fetch.ts) |
| HTML 文本抽取 | `html-to-text` 结构化抽取、单行折叠与分页 UTF-16 语义。 | [内置工具](../README.md) | [抽取实现](../src/web/html-extract.ts)、[Web Fetch Tool](../src/web-fetch.ts) |

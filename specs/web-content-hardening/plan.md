# Web 内容获取硬化执行计划

依据 [Spec](./spec.md) 编写，执行前须确认完整 Spec 与本计划。改动集中在 `packages/tools` 的网页工具实现、测试和模块文档，不新增搜索 provider、配置项或 Sandbox 能力，也不纳入当前工作树中 runtime/model-context/goal-board 等无关的未提交修改。

实现顺序：TODO 1 与 TODO 2 无共享文件依赖，可并行；TODO 3 建立默认 fetch 的 URL/重定向传输层；TODO 4 在同一传输层上补充 content-type/charset 解码；TODO 5 收口公开契约、默认注册、跨模块回归和文档。每个 TODO 只做轻量基本验证，完整回归留到 Feature Verification。

## 任务清单

- [x] //TODO 1. 隔离 DuckDuckGo 默认搜索后端，并区分零结果与不可识别 HTML
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[6.2](./spec.md#spec-req-6-2)。
  - 实施目标：新增 `packages/tools/src/web/search-duckduckgo.ts`，把现有 DuckDuckGo HTML 请求和解析从 `web-search.ts` 移入独立 `WebSearchBackend` 工厂；导出纯解析函数供 fixture 测试。`WebSearchTool` 默认构造仍使用该后端，注入点、`WebSearchBackend` 类型和 `WebSearchResult` 形状不变。新增 `WEB_SEARCH_UNRECOGNIZED_RESPONSE` 错误码；默认后端在“有结果”“明确零结果”“成功 HTML 但无法识别”三种情况下分别返回结果、空数组、类型化失败。继续把 429/5xx 与网络瞬态错误交给 `TransientToolExecutionFailure`。签入结果页、零结果页和不可识别页三个 HTML fixture。
  - 场景与预期：用 fixture 调用默认解析/默认后端，结果页按 fixture 顺序返回 title/url/snippet；零结果页经 `WebSearchTool` 得到 `kind: "success"` 且 `output` 为空数组；不可识别页得到 `kind: "failure"`、`code: "WEB_SEARCH_UNRECOGNIZED_RESPONSE"`；429 或 5xx 仍抛出 `TransientToolExecutionFailure`。
  - 验证手段：`npx tsx --test packages/tools/test/web-search.test.ts`；`npx tsc --noEmit`。

- [x] //TODO 2. 用 `html-to-text` 替换正则去标签，并保持单行分页输出
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[6.4](./spec.md#spec-req-6-4)。
  - 实施目标：为 `packages/tools` 增加 `html-to-text@9.0.5` 与 `@types/html-to-text@9.0.4`（后者放 devDependencies），执行 `npm install --prefix packages/tools html-to-text@9.0.5` 与 `npm install --prefix packages/tools --save-dev @types/html-to-text@9.0.4`，更新其 `package.json`/`package-lock.json`。新增 `packages/tools/src/web/html-extract.ts`，使用 `html-to-text` 的 `convert`：`wordwrap: false`、跳过 `script`/`style`/`img`、`a` 仅保留文本（`ignoreHref: true`）、标题保留原始大小写；输出再执行空白折叠和首尾 trim，继续得到单行文本。`web-fetch.ts` 的 `htmlToPlainText` 改为委托该函数，保留公开导出和 TSDoc，不保留第二套正则实现。HTML 抽取异常继续落到 `WEB_FETCH_FAILED`，非 HTML 文本原样通过。
  - 场景与预期：包含标题、表格、列表、实体、script/style 和嵌套标签的 HTML fixture 抽取后包含可见文本、排除脚本/样式、输出为单行；`text/plain` 与 `application/json` 文本不经过 HTML 抽取；现有 `offset`/`maxChars`/`nextOffset` 分页断言不变；`htmlToPlainText` 仍是唯一公开 helper。
  - 验证手段：`npx tsx --test packages/tools/test/web-fetch.test.ts`；`npx tsc --noEmit`。若依赖未安装导致类型解析失败，先执行上述 `npm install --prefix packages/tools` 命令。

- [ ] //TODO 3. 建立默认 fetch 的 URL、DNS 和重定向安全边界
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[3.5](./spec.md#spec-req-3-5)、[3.6](./spec.md#spec-req-3-6)、[3.7](./spec.md#spec-req-3-7)、[3.8](./spec.md#spec-req-3-8)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3)。
  - 实施目标：新增 `packages/tools/src/web/fetch-errors.ts` 承载 `WebFetchBlockedUrlError`、`WebFetchRedirectLimitError`、`WebFetchHttpError`、`WebFetchUnsupportedContentTypeError`、`WebFetchNetworkError`，并把现有 `WebResponseTooLargeError` 移入后由 `web-fetch.ts` 重新导出，避免 `web-fetch.ts` 与 `web/fetch-default.ts` 循环依赖。新增 `packages/tools/src/web/fetch-url-policy.ts`，用 `node:net` 的 `BlockList` 定义 loopback、private、link-local、multicast、unspecified 和常见保留网段；IPv6 字面量先去除 `URL.hostname` 的方括号，IPv4-mapped IPv6 提取映射的 IPv4 后按 IPv4 规则复核。同步校验协议、URL 凭据、`localhost`/`.localhost` 和带 zone 的 IPv6 字面量。新增 `packages/tools/src/web/fetch-default.ts` 的 `createDefaultWebFetchHandler`，在 `packages/tools` 声明并锁定与仓库 Node 运行时兼容的 `undici` 版本，更新该包的 lockfile；允许注入主机解析函数与内部传输测试接缝，保留公开 `WebFetchHandler` 注入契约。请求前解析全部 A/AAAA，任一地址被阻止即抛出 `WebFetchBlockedUrlError`；通过请求拥有的 `undici` dispatcher/lookup 让连接与重试仅使用该跳已验证的地址，禁止未校验的二次解析和普通 fetch 回退；保留原 URL 的 Host、TLS SNI 与证书主机名校验，不修改全局 dispatcher，不关闭证书校验；成功消费正文后关闭 dispatcher，错误、取消、超时和超限时销毁连接，释放尚未消费的响应体；使用 `redirect: "manual"`，最多 5 跳，每跳重新执行 URL 和地址校验并绑定该跳的连接地址，释放上一跳的响应体和 dispatcher；3xx 缺少 `Location` 或 4xx 抛出 `WebFetchHttpError`，429/5xx 保留 retry-after 供 `WebFetchTool` 映射为瞬态失败。`WebFetchTool` 默认构造改用该 handler；`validate` 同步拒绝明显的私网/凭据 URL；`execute` 将 blocked、redirect limit 和 HTTP 错误映射为稳定 Observation 错误码。`resolveSandboxAccess` 与 `SANDBOX_APPROVAL_REQUIRED` 语义不变。
  - 场景与预期：`http://localhost:8080/api`、`http://127.0.0.1`、`http://10.0.0.1`、`http://169.254.169.254`、`http://[::1]`、带 `user:pass@` 的 URL 在 `validate` 阶段被拒绝；公网主机解析到私网地址时默认 handler 返回 `WEB_FETCH_BLOCKED_URL`；首跳公网、重定向到 `127.0.0.1` 的响应被阻止；超过 5 跳返回 `WEB_FETCH_REDIRECT_LIMIT`；错误消息不包含 DNS 明细或凭据；模拟预检查返回公网、后续 DNS 返回私网，连接层只能收到已验证的公网地址；混合 A/AAAA 中任一地址受限即整跳拒绝，连接重试不得选择集合外地址；HTTPS 保留原域名 SNI 并拒绝不匹配的证书，Host 保持原 URL 语义；正常完成、失败、取消、超时和正文超限均释放请求资源。
  - 验证手段：新增 `packages/tools/test/web-fetch-policy.test.ts`，并扩展 `packages/tools/test/web-fetch.test.ts`；`npx tsx --test packages/tools/test/web-fetch.test.ts packages/tools/test/web-fetch-policy.test.ts`；`npx tsc --noEmit`。

- [ ] //TODO 4. 按 content-type、charset 和字节上限解码默认抓取响应
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3)。
  - 实施目标：扩展 `fetch-default.ts` 的响应处理：只接受 `text/html`、`application/xhtml+xml`、`text/plain`、`application/json`、`application/xml` 和其它 `text/*`；其它类型以及缺少 content-type 的响应在读取正文前返回 `WebFetchUnsupportedContentTypeError`。按 `content-type` charset、HTML `<meta charset>` 前 1 KiB 嗅探、UTF-8 的顺序选择 `TextDecoder`；声明但不支持的 charset 以安全 `WEB_FETCH_FAILED` 结束，不静默当 UTF-8。保留 `Content-Length` 提前检查和读取中 2 MiB 累计上限；超限返回 `WEB_RESPONSE_TOO_LARGE`。`WebFetchTool` 增加 `WEB_FETCH_UNSUPPORTED_CONTENT_TYPE`、`WEB_FETCH_HTTP_ERROR` 映射，保留超时、超大、普通失败和瞬态失败语义。
  - 场景与预期：`text/html`、`application/json`、`text/plain` 正常返回；`image/png` 返回 `WEB_FETCH_UNSUPPORTED_CONTENT_TYPE` 且不发正文；ISO-8859-1 响应按声明解码，meta charset 生效，无声明时 UTF-8；`Content-Length` 超 2 MiB 和 chunked 超 2 MiB 都返回 `WEB_RESPONSE_TOO_LARGE`；404 返回 `WEB_FETCH_HTTP_ERROR`，429/503 仍走瞬态失败。
  - 验证手段：扩展 `packages/tools/test/web-fetch.test.ts`；`npx tsx --test packages/tools/test/web-fetch.test.ts`；`npx tsc --noEmit`。

- [ ] //TODO 5. 收口公开契约、默认注册、跨模块兼容与模块文档
  - 落实标准：[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)。
  - 实施目标：确认 `packages/tools/src/index.ts` 的 `WEB_SEARCH_*`/`WEB_FETCH_*` 导出、`WEB_SEARCH_INPUT_CONTRACT`、`WEB_FETCH_INPUT_CONTRACT`、`WebSearchResult`、`WebFetchOutput`、`WebSearchBackend`、`WebFetchHandler` 和 `DEFAULT_TOOL_IDS` 未改变；`default-tools.ts` 保持 `new WebSearchTool()`/`new WebFetchTool()` 的默认注册，仅在不改变构造契约时调整导入来源；`htmlToPlainText` 只保留委托实现。更新 `packages/tools/notes/overview.md` 的网页工具边界（默认 DuckDuckGo、`html-to-text`、URL/DNS/连接地址绑定/重定向策略、Host/TLS 身份与连接资源所有权、content-type/charset、2 MiB/30 秒和错误码），更新 `notes/semantics.md` 的概念行，并在 `README.md` 的简介中补充网页工具。保留当前工作树中已有的无关修改；不修改 `specs/tool-suite-expansion` 或 `specs/permission`。
  - 场景与预期：现有默认 Profile 仍注册 `web_search`/`web_fetch`；Runtime 的 `web-tool-permission.test.ts` 继续证明未获 `all_outbound` 时后端不被调用；Benchmark 的 remote/fake backend 不受默认实现影响；模块语义表四列完整，链接有效；公开导出和输入/输出字段与 Spec 一致。
  - 验证手段：`npx tsx --test packages/runtime/test/web-tool-permission.test.ts benchmarks/test/remote-tool-registry.test.ts benchmarks/test/tool-rpc.test.ts`；`npm run check:docs`；`npm run check:dependencies`；`npx tsc --noEmit`。

## Feature Verification

### Planned Checks

本功能不访问真实 DuckDuckGo 或网页；默认后端和 fetch handler 通过注入的传输/主机解析函数与签入 fixture 验证。地址绑定必须经过真实 dispatcher/lookup 路径，以可控连接接缝记录目标地址，不得仅用 mock fetch 断言预检查；TLS 身份与取消/释放用隔离的本地传输 fixture 验证，测试接缝不得成为生产环境放行私网的配置。风险分级与边界见 [Spec](./spec.md#风险与否定性保证)。`npm test` 为最终全量回归；任何环境缺失或未执行项按 delivery-loop 记为 blocked，不以局部测试代替。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 默认搜索后端与 fixture | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2) | 默认 `WebSearchTool` 使用独立 DuckDuckGo adapter；结果 fixture 返回声明的 title/url/snippet 顺序和有界数量 | `web-search.test.ts`；`npx tsx --test packages/tools/test/web-search.test.ts` |
| 零结果与不可识别结构 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 明确零结果页面返回成功空数组；无法识别页面返回 `WEB_SEARCH_UNRECOGNIZED_RESPONSE`，不伪装成零结果 | `web-search.test.ts` 的三个 fixture 场景 |
| 搜索瞬态失败 | [1.5](./spec.md#spec-req-1-5)、[6.2](./spec.md#spec-req-6-2) | 429/5xx/网络瞬态仍抛 `TransientToolExecutionFailure`；普通解析失败不无限重试 | `web-search.test.ts`；`npx tsx --test packages/tools/test/web-search.test.ts` |
| HTML 抽取与单行输出 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[6.4](./spec.md#spec-req-6-4) | 表格、列表、标题、实体可见；script/style 排除；输出单行；分页 UTF-16 语义不变；`htmlToPlainText` 只有一套实现 | `web-fetch.test.ts`；`npx tsx --test packages/tools/test/web-fetch.test.ts` |
| 非 HTML 与抽取失败 | [2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5) | `text/plain`/`application/json` 原样返回；抽取异常返回 `WEB_FETCH_FAILED`，不返回部分正文 | `web-fetch.test.ts` |
| URL 与凭据策略 | [3.1](./spec.md#spec-req-3-1)、[3.6](./spec.md#spec-req-3-6) | 非 http(s)、带凭据、本机/私网字面地址在 `validate` 被拒绝；错误消息不含凭据或 DNS 明细 | `web-fetch.test.ts`、`web-fetch-policy.test.ts` |
| DNS 与重定向 SSRF | [3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 公网主机解析到私网被阻止；重定向逐跳校验；重定向到本机被阻止；超过 5 跳返回 `WEB_FETCH_REDIRECT_LIMIT` | `web-fetch-policy.test.ts` |
| DNS rebinding 与连接目标 | [3.7](./spec.md#spec-req-3-7) | 预检查返回公网、后续 DNS 返回私网时，实际连接仍绑定已验证地址；连接重试只用已验证集合；混合 A/AAAA 中任一受限则拒绝；重定向每跳重新绑定；无可用地址时失败且不回退普通 fetch | `web-fetch-policy.test.ts` 的真实 dispatcher/lookup 与可控连接测试，记录每次拨号目标，禁止真实外网访问 |
| Host、TLS 与资源释放 | [3.8](./spec.md#spec-req-3-8) | 固定 IP 后 Host/SNI 仍对应原域名；证书主机名不匹配被拒绝；成功、网络失败、取消、超时、超限及重定向均释放自有连接和未使用正文 | `web-fetch-policy.test.ts` 的隔离本地 HTTP/TLS fixture 与连接关闭观测 |
| 沙箱与默认注册 | [3.5](./spec.md#spec-req-3-5)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2) | `all_outbound` 派生与审批不变；`DEFAULT_TOOL_IDS`、Tool 输入/输出和公开导出不变 | `web-tool-permission.test.ts`；`npx tsx --test packages/runtime/test/web-tool-permission.test.ts` |
| Benchmark 兼容 | [5.3](./spec.md#spec-req-5-3) | remote/fake backend 仍可注入；默认 DuckDuckGo/fetch 不进入确定性 Benchmark 测试 | `benchmarks/test/remote-tool-registry.test.ts`、`benchmarks/test/tool-rpc.test.ts` |
| 内容类型与字符集 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2) | 非文本 content-type 返回 `WEB_FETCH_UNSUPPORTED_CONTENT_TYPE`；ISO-8859-1、meta charset 和 UTF-8 默认正确解码 | `web-fetch.test.ts`、`web-fetch-policy.test.ts` |
| 大小、HTTP 与错误分类 | [4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[6.1](./spec.md#spec-req-6-1)、[6.3](./spec.md#spec-req-6-3) | `Content-Length`/chunked 超 2 MiB 均失败；404 返回 `WEB_FETCH_HTTP_ERROR`；429/503 瞬态；错误消息有界且无敏感信息 | `web-fetch.test.ts` |
| 文档与依赖边界 | 需求 5–6、Spec 实现边界 | 网页工具职责、URL 策略和错误码在模块说明/语义表可查；无新跨包依赖或产物导入 | `npm run check:docs`、`npm run check:dependencies`、`git diff --check` |
| 全量回归 | 需求 1–6 | 所有既有 Tool/Runtime/Benchmark 测试通过；类型检查和全仓测试通过 | `npx tsc --noEmit`、`npx tsc --noEmit -p apps/goal-server/tsconfig.json`、`npm test` |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。

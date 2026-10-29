---
status: proposed
created_at: 2026-10-27
supersedes: []
superseded_by: null
---

# Web 内容获取硬化 Spec

## 目标与范围

本 Spec 硬化 `web_search` 与 `web_fetch` 的默认实现，在**不改变 Tool 输入/输出契约、默认 Tool 注册和 `all_outbound` 授权模型**的前提下，解决三个问题：

- DuckDuckGo HTML 解析没有真实 fixture，结构变化会被静默当成空结果；
- `htmlToPlainText` 用正则去标签，丢失表格、列表、实体和畸形 HTML 的处理能力；
- `web_fetch` 允许 `localhost`/私网地址、默认跟随重定向、按任意 content-type 解码为 UTF-8，存在 SSRF、重定向绕过和二进制乱码风险。

本 Spec 采用方案 A：**保留 DuckDuckGo 作为零配置默认搜索后端**，不新增搜索供应商、API key 或 `[web]` 配置；HTML 抽取采用 `html-to-text` 最小方案，不引入 Readability/DOM。

明确不包含：

- SearXNG、Brave、Tavily、Serper 等 provider 及其配置；
- `@mozilla/readability`、`linkedom`、`jsdom` 等正文抽取方案；
- 将 `WebFetchOutput.text` 从单行折叠改为保留段落换行；
- 搜索/抓取缓存、robots.txt、按域名限速；
- 沙箱内核级域名过滤或子网白名单；该能力仍归 `specs/permission` 的后续 revisit；
- Benchmark 工具装配、GAIA 远端代理协议和评分配置。

## 需求与验收标准

### 需求 1：保留默认 DuckDuckGo 后端并隔离 HTML 解析

作为本机 Agent 使用者，我希望零配置的 `web_search` 仍然可用，同时搜索 HTML 结构变化能被测试显式发现，而不是静默变成空结果。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当 `WebSearchTool` 未注入自定义 `WebSearchBackend` 时，系统必须使用独立的 DuckDuckGo HTML 后端适配器，而不是在 `WebSearchTool` 内直接持有解析正则。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当默认后端解析已签入仓库的 DuckDuckGo HTML fixture 时，系统必须返回 fixture 中声明的 title、url、snippet 顺序和有界结果数量。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：当默认后端收到明确的 DuckDuckGo 零结果页面时，系统必须返回空数组的成功 Observation，而不是失败。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：如果默认后端收到成功 HTML 响应，但既没有可解析结果也没有明确的零结果标记，系统必须返回 `WEB_SEARCH_UNRECOGNIZED_RESPONSE` 失败，不得把结构变化伪装成零结果。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：当默认后端收到 429、5xx 或底层网络瞬态错误时，系统必须继续沿 `TransientToolExecutionFailure` 路径交给 Runner 安全重试；普通解析失败不得触发无限重试。

### 需求 2：用结构化 HTML 抽取替换正则去标签

作为依赖网页内容的 Agent，我希望 `web_fetch` 保留实体、表格和列表中的可见文本，以便减少遗漏和后续重复抓取。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当 `web_fetch` 收到 HTML 内容时，系统必须使用结构化 HTML 解析库（`html-to-text`）提取可见文本，不得使用正则去除标签作为默认实现。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：提取结果必须排除 `script`、`style` 内容，解码 HTML 实体，并保留表格、列表和标题中的可见文本；具体空白分隔由 fixture 测试固定。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：`WebFetchOutput.text` 必须继续保持单行、空白折叠、首尾 trim 的现有形状；`offset`、`maxChars`、`nextOffset`、`truncated` 的 UTF-16 语义不得改变。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：当 `web_fetch` 收到非 HTML 文本（如 `text/plain`、`application/json`）时，系统必须原样返回文本，不经过 HTML 抽取。
- <a id="spec-req-2-5"></a>**验收标准 2.5**：如果 HTML 抽取失败，系统必须返回 `WEB_FETCH_FAILED` 领域失败，不得把部分抽取结果宣称为完整正文。

### 需求 3：阻止 SSRF 和不安全重定向

作为本机运行时所有者，我希望模型不能借 `web_fetch` 访问本机、内网或云元数据地址，即使它已经获得 `all_outbound` 授权。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当 `web_fetch.validate` 收到非 `http`/`https` URL、带 `username`/`password` 的 URL 或明显的本机/私网字面地址时，系统必须返回输入拒绝，不得进入网络请求。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：当默认 fetch handler 解析主机名时，系统必须检查所有 A/AAAA 结果；只要任一地址属于 loopback、private、link-local、multicast 或 unspecified 范围，就必须返回 `WEB_FETCH_BLOCKED_URL` 失败。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：当目标返回重定向时，系统必须使用手动重定向策略，对每一跳重新执行 URL 和主机地址校验；重定向超过 5 跳时返回 `WEB_FETCH_REDIRECT_LIMIT`。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：如果重定向目标解析到本机或私网地址，系统必须阻止该跳并返回 `WEB_FETCH_BLOCKED_URL`，不得因为首跳是公网地址而放行。
- <a id="spec-req-3-5"></a>**验收标准 3.5**：`web_fetch` 的 `resolveSandboxAccess` 必须继续派生 `all_outbound` 申请；Tool 级 URL 策略不得被描述为内核级域名隔离，也不得绕过既有 `SANDBOX_APPROVAL_REQUIRED` 检查。
- <a id="spec-req-3-6"></a>**验收标准 3.6**：当 URL 被阻止时，失败消息和安全诊断不得包含解析后的私网 IP、DNS 内部信息或 URL 中的凭据。
- <a id="spec-req-3-7"></a>**验收标准 3.7**：当域名的全部 A/AAAA 结果通过校验后，默认 handler 必须把该跳的实际连接绑定到这组已验证地址；连接重试只能使用该组地址，不得再次通过未受控的 DNS 解析选择地址。若重新解析，必须在建立连接前重新完整校验并绑定结果；没有可用的已验证地址时必须失败，不得退回普通 fetch。即使预检查后 DNS 改为返回私网地址，也不得向该私网地址建立连接；每一跳重定向均适用此约束。
- <a id="spec-req-3-8"></a>**验收标准 3.8**：固定连接 IP 时，系统必须保留原 URL 的 Host 语义，并在 HTTPS 请求中保留原域名的 TLS SNI 和证书主机名校验；不得通过关闭证书校验或把 URL 主机名直接替换为 IP 实现绑定。请求成功、失败、取消、超时或正文超限后，必须释放该 handler 拥有的连接资源。

### 需求 4：按内容类型和字符集安全解码

作为依赖网页正文的 Agent，我希望二进制内容不会被当成乱码文本，非 UTF-8 页面也能正确读取。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：当响应 content-type 不在 `text/html`、`application/xhtml+xml`、`text/plain`、`application/json`、`application/xml` 或其它 `text/*` 白名单内时，系统必须返回 `WEB_FETCH_UNSUPPORTED_CONTENT_TYPE`，不得读取为文本。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：当响应声明 charset 时，系统必须按该 charset 解码；未声明时按 HTML `<meta charset>` 前 1 KiB 嗅探，仍无法确定时使用 UTF-8。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：系统必须继续在读取前检查 `Content-Length`、在读取中累计字节，并在超过 2 MiB 时返回 `WEB_RESPONSE_TOO_LARGE`；不得先完整读取再判断超限。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：当非 2xx 响应不是 429/5xx 时，系统必须返回 `WEB_FETCH_HTTP_ERROR`，其中包含稳定的 HTTP 状态码类别；不得与网络失败或内容抽取失败混用。

### 需求 5：保持 Tool 契约与默认装配兼容

作为现有 Profile、Benchmark 和测试的维护者，我希望这次硬化不改变调用方看到的 Tool 形状。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：`WEB_SEARCH_INPUT_CONTRACT`、`WEB_FETCH_INPUT_CONTRACT`、`WebSearchResult` 和 `WebFetchOutput` 的字段、类型和边界不得改变。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：`DEFAULT_TOOL_IDS`、默认 Profile 中的 `web_search`/`web_fetch`、以及 `WebSearchBackend`/`WebFetchHandler` 注入点必须保持可用。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：Benchmark 继续通过现有 fake/remote backend 注入，不读取本 Spec 的默认 DuckDuckGo 或默认 fetch handler；确定性测试不得访问真实外部网络。

### 需求 6：错误分类与可诊断性

作为运行时维护者，我希望失败原因可以区分，以便决定是否重试、修复 URL 或提示用户。

- <a id="spec-req-6-1"></a>**验收标准 6.1**：`web_fetch` 必须保留 `WEB_FETCH_TIMEOUT`、`WEB_RESPONSE_TOO_LARGE`、`WEB_FETCH_FAILED`，并新增 `WEB_FETCH_BLOCKED_URL`、`WEB_FETCH_UNSUPPORTED_CONTENT_TYPE`、`WEB_FETCH_REDIRECT_LIMIT`、`WEB_FETCH_HTTP_ERROR`。
- <a id="spec-req-6-2"></a>**验收标准 6.2**：`web_search` 必须保留 `WEB_SEARCH_TIMEOUT`、`WEB_SEARCH_FAILED`，并新增 `WEB_SEARCH_UNRECOGNIZED_RESPONSE`；429/5xx 仍走瞬态失败类型。
- <a id="spec-req-6-3"></a>**验收标准 6.3**：所有失败消息必须是有界、可安全持久化的文本，不包含 API key、Authorization 头、完整响应体或 DNS 内部细节。
- <a id="spec-req-6-4"></a>**验收标准 6.4**：当 `htmlToPlainText` 继续作为公开 helper 导出时，其实现必须委托给新的 HTML 抽取函数，并保持现有单行输出语义；不得保留两套并行的 HTML 处理实现。

## 架构与核心决策

### 系统拓扑与接口

```text
WebSearchTool
  └─ WebSearchBackend (existing injection point)
       └─ default: packages/tools/src/web/search-duckduckgo.ts
            ├─ fetch HTML
            ├─ parse title/url/snippet
            └─ distinguish explicit zero results vs unrecognized HTML

WebFetchTool
  └─ WebFetchHandler (existing injection point)
       └─ default: packages/tools/src/web/fetch-default.ts
            ├─ fetch-url-policy.ts
            │    ├─ scheme/credentials/literal host validation
            │    ├─ DNS A/AAAA validation + validated-address binding
            │    └─ manual redirect validation (max 5)
            ├─ content-type allowlist + charset decode + 2 MiB cap
            ├─ html-extract.ts (html-to-text + single-line normalization)
            └─ existing UTF-16 pagination in WebFetchTool
```

`packages/tools/src/web-search.ts` 与 `packages/tools/src/web-fetch.ts` 保留 Tool 定义、输入契约、沙箱检查和分页逻辑；默认网络/解析实现移入 `web/` 子目录。`packages/tools/src/default-tools.ts` 的注册顺序和 `DEFAULT_TOOL_IDS` 不变。

### 关联 Spec 边界

- `specs/tool-suite-expansion` 拥有 `web_search`/`web_fetch` 的输入/输出契约、默认注册和 `all_outbound` 要求。本 Spec 只修订其实现约束中的 HTML 抽取、URL 安全策略、内容类型/字符集和测试覆盖，不修改该 Spec 文件，也不改变其需求 5 的可观察契约。
- `specs/permission` 拥有沙箱网络审批和 `all_outbound` 的真实范围。本 Spec 的 URL 策略是 Tool 层纵深防御，不是内核级域名过滤，也不替代 `SANDBOX_APPROVAL_REQUIRED`。`permission.md` 中“支持细粒度域名过滤或子网白名单出站控制”的 revisit 仍由 Permission 域负责。
- `specs/gaia-benchmark` 的宿主代理工具继续通过 `WebSearchBackend`/`WebFetchHandler` 注入 fake 或 remote 实现；本 Spec 不改变 ACP 双通道或 GAIA 评分。
- 当前工作树没有其它未提交的相关 Spec；本 Spec 可独立实现和验证，不依赖其它 Spec 的未交付产物。

### 核心决策

- **默认搜索后端保持不变**：继续使用 DuckDuckGo HTML，避免引入 API key 和新配置；把解析器移入独立 adapter，并用 fixture 固定可解析结构。非法/不可识别结构返回 `WEB_SEARCH_UNRECOGNIZED_RESPONSE`，而不是空列表。
- **HTML 抽取使用 `html-to-text`**：MIT 许可、无 DOM、Node 运行时可预测；配置为不自动换行、排除 script/style、解码实体，再统一折叠为单行，保持 `WebFetchOutput.text` 兼容。Readability/DOM 方案留给后续质量 Spec。
- **SSRF 在 Tool 层阻断并绑定连接地址**：默认 fetch handler 在请求前解析全部主机地址，拒绝 loopback/private/link-local/multicast/unspecified，并用 `undici` 的自定义 dispatcher/lookup 将实际连接限制在该跳已验证的地址集合内，堵住预检查与实际连接之间的 DNS rebinding 窗口。手动处理重定向，每跳重新校验并绑定；保留原域名的 Host、TLS SNI 和证书校验，不修改全局 dispatcher，不回退到未经绑定的 fetch。handler 拥有的 dispatcher 在正文处理完成或失败、取消后释放。
- **内容类型白名单 + charset 解码**：只读取文本类响应；按 header → meta → UTF-8 的顺序选择解码器；二进制内容明确失败，避免乱码进入 Observation。
- **错误码只增不改**：保留现有错误码，新增可区分的安全/内容类型/HTTP 状态/重定向失败码；不改变 `ToolObservation` 的 success/failure 形状。
- **依赖放置**：`html-to-text` 与支持地址绑定的 `undici` 加入 `packages/tools` 的依赖声明并更新其 lockfile；不依赖 Node 内置 fetch 的未公开内部接口。不新增运行时服务或外部 API。

## 曾考虑的备选方案

- **保留正则 `htmlToPlainText`，只补实体解码**：实现最小，但仍无法可靠处理表格、列表、嵌套标签和畸形 HTML，且继续把解析正确性建立在正则上。**落选原因**：没有解决根因，fixture 只能覆盖已知样例。
- **`@mozilla/readability` + `linkedom` + `html-to-text`**：正文抽取质量更好，适合文章页。**落选原因**：增加 DOM 依赖和 MPL-2.0 许可面，改变输出结构和分页语义；本 Spec 先做最小兼容硬化，质量增强另立 Spec。
- **引入 SearXNG/Brave/Tavily 和 `[web]` 配置**：搜索稳定性和质量更好。**落选原因**：用户选择方案 A，保留零配置 DuckDuckGo；provider 抽象和配置属于后续独立 Spec，不应与安全硬化捆绑。
- **只在 fetch 前解析校验，不绑定实际连接地址**：实现面较小。**落选原因**：实际连接仍可能再次解析到私网地址，无法满足阻止 DNS rebinding 和不连接受限地址的保证。
- **在 Sandbox/Seatbelt 层做域名白名单**：更接近内核级隔离。**落选原因**：`specs/permission` 明确把细粒度域名过滤列为未来 revisit；Tool 层 URL 策略不能替代内核隔离，也不应在本 Spec 中复制该职责。
- **完全移除 `web_search` 默认后端，改为 fail-closed**：最安全、最诚实。**落选原因**：用户选择方案 A，保留零配置可用性；`WEB_SEARCH_UNRECOGNIZED_RESPONSE` 和 fixture 测试先降低静默失败风险。

## 风险与否定性保证

- **风险评估**：高。改动涉及 SSRF 安全边界和实际网络连接选择，但不改变持久化 Schema、Tool 输入/输出契约或权限模型；主要风险是地址绑定被重试或重定向绕过、Host/TLS 身份校验变化、连接资源泄漏、`html-to-text` 输出差异、DuckDuckGo fixture 过期、私网阻断影响本地开发，以及新依赖的许可/维护状态。缓解措施是连接目标与 TLS 身份校验测试、资源释放测试、fixture 测试、逐跳校验、安全错误消息和确定性网络测试。Tool 层策略不保证阻断由公网服务代理的内网访问，也不提供内核级网络隔离。
- **关键操作**：实现和验证期间不得用真实外部网络做确定性测试；真实 DuckDuckGo/网页 smoke 只能作为显式、人工触发的手工检查，不计入 `npm test`。不得在测试、日志或错误消息中写入真实 API key、Authorization 头或带凭据的 URL。
- **否定性保证（Invariants）**：
  - 默认 `web_fetch` 永不请求非 `http`/`https`、带凭据、loopback、private、link-local、multicast 或 unspecified 地址。
  - 默认 `web_fetch` 的实际连接只能使用该跳已验证的地址；不得通过二次 DNS 解析、连接重试或普通 fetch 回退绕过校验，不得禁用 HTTPS 身份校验。
  - 永不跟随未重新校验的重定向，永不接受超过 5 跳的重定向链。
  - 永不把超过 2 MiB 或截断的响应体宣称为完整正文。
  - 永不改变 `web_search`/`web_fetch` 的输入/输出字段、默认 Tool 注册或 `all_outbound` 审批要求。
  - 永不在 `htmlToPlainText` 与新抽取函数之间保留两套并行实现。
  - 永不把 Tool 层 URL 策略描述为内核级域名隔离。

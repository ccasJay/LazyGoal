---
feature: web-content-hardening
status: active
summary: 在不改变 Tool 契约与授权模型的前提下，让默认网页抓取与搜索抵抗 SSRF、DNS rebinding 与不可信内容
source_spec: specs/web-content-hardening/
distilled_at: 2026-10-29
reviewed_at: 2026-10-29
tags: [web-fetch, web-search, ssrf, dns-rebinding, tls, content-decoding, html-extraction, tool-security]
authorities: [packages/tools/src/web/fetch-default.ts, packages/tools/src/web/fetch-url-policy.ts, packages/tools/src/web/limits.ts, packages/tools/src/web/html-extract.ts, packages/tools/src/web/search-duckduckgo.ts]
---

# Web 内容获取硬化

## Purpose

- 让默认 `web_search` 与 `web_fetch` 在不改变 Tool 输入/输出契约、默认注册与 `all_outbound` 授权的前提下，抵抗 SSRF、DNS rebinding 与不可信内容。 [S1]
- 把地址校验、连接目标、重定向、解码与抽取的边界固定在默认实现内部。 [S1]

## Durable Decisions

- D1 — 默认抓取先校验 URL：只允许 http/https、拒绝凭据、拒绝本机与私网字面地址；解析 DNS 后把连接绑定到已验证地址集合，预检查之后的再次解析不得改变实际拨号目标。 [S1, S3, S4]
- D2 — 重定向逐跳校验并重新绑定，最多 5 跳，超限返回 `WEB_FETCH_REDIRECT_LIMIT`。 [S1, S2, S3]
- D3 — 固定 IP 后仍保留原域名的 Host 与 SNI；证书主机名不匹配即拒绝；成功、失败、取消、超时、超限与重定向都释放自有连接与未使用正文。 [S1, S4]
- D4 — 响应按 content-type 与 charset 解码，正文上限 2 MiB，`Content-Length` 与 chunked 同时受限；非文本类型返回 `WEB_FETCH_UNSUPPORTED_CONTENT_TYPE`，404 返回 `WEB_FETCH_HTTP_ERROR`，429/5xx 仍为瞬态失败。 [S1, S5]
- D5 — HTML 抽取只保留可见文本并输出单行，唯一实现基于 `html-to-text`；抽取失败返回 `WEB_FETCH_FAILED`，不返回部分正文。 [S1, S6]
- D6 — 搜索后端独立为 DuckDuckGo adapter：明确零结果返回成功空数组，无法识别结构返回 `WEB_SEARCH_UNRECOGNIZED_RESPONSE`，瞬态失败仍走 `TransientToolExecutionFailure`。 [S1, S7]
- D7 — 默认装配与公开契约不变：`DEFAULT_TOOL_IDS`、Tool 输入/输出、`all_outbound` 派生与审批语义保持，Benchmark 的 fake/remote 后端仍可注入。 [S1, S8]

## Guardrails

- 测试不得访问真实外网；SSRF 与 TLS 证据来自可控 DNS、真实 dispatcher 与本地 TLS fixture。 [S1, S9]
- 不得为测试或生产新增私网放行开关；测试接缝不得成为生产配置。 [S1]
- 错误消息有界，不得包含凭据或 DNS 明细。 [S1]
- TLS fixture 为 `public.example` 自签证书，有效期至 2036-10-26，过期需重新生成。 [S9]

## Revisit When

- 需要支持代理、非 http(s) 协议、真实浏览器渲染或新的搜索 provider 时。
- TLS fixture 过期，或地址绑定接缝需要调整时。

## Sources

- S1: `specs/web-content-hardening/spec.md`
- S2: `specs/web-content-hardening/plan.md`
- S3: `packages/tools/src/web/fetch-default.ts`
- S4: `packages/tools/src/web/fetch-url-policy.ts`
- S5: `packages/tools/src/web/limits.ts`
- S6: `packages/tools/src/web/html-extract.ts`
- S7: `packages/tools/src/web/search-duckduckgo.ts`
- S8: `packages/tools/src/web-search.ts`
- S9: `packages/tools/test/fixtures/tls/public.example.crt`

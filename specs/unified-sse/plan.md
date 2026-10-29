# 统一 SSE 实现执行计划

依据已批准的 [Spec](./spec.md) 实现。改动集中在 Goal 事件服务端写出、Goal Board 的统一 SSE 解析、两条流的断线重连验收与模块说明；不改变 DTO、事件语义、metrics 服务端行为或访问控制。风险等级、关键操作与否定性保证见 [Spec 风险与否定性保证](./spec.md#风险与否定性保证)。

实现顺序：TODO 1 与 TODO 2 无共享文件依赖，可并行；TODO 3 依赖前两者提供的真实事件名与解析器行为；TODO 4 在行为稳定后收口文档与依赖边界。

## 任务清单

- [x] //TODO 1. Goal 事件服务端改用 Hono streamSSE，并保持订阅释放语义
  - 落实标准：[1.1](./spec.md#spec-req-1-1), [1.2](./spec.md#spec-req-1-2), [1.3](./spec.md#spec-req-1-3), [1.4](./spec.md#spec-req-1-4), [1.5](./spec.md#spec-req-1-5), [1.6](./spec.md#spec-req-1-6), [4.3](./spec.md#spec-req-4-3)
  - 实施目标：在 `packages/browser/src/browser-goal-routes.ts` 引入 `hono/streaming` 的 `streamSSE`，删除 `createEventStreamResponse` 与手写 `ReadableStream`。`GET /api/goals/:goalId/events` 保留现有 Goal 身份／查询校验、`session.openEvents(goalId, context.req.raw.signal)` 与 400／404／409／503 映射；回调内注册 `stream.onAbort(() => feed.close())`，按 feed 顺序写入 `{ event: "update", data: JSON.stringify(event) }`，在 `stream.aborted` 时停止，并在 `finally` 再次调用幂等的 `feed.close()`。返回响应前恢复 `cache-control: no-cache, no-transform` 与 `x-accel-buffering: no`，保留 `text/event-stream`。不引入慢客户端写超时。
  - 场景与预期：读取首个事件得到精确的 `event: update\ndata: {json}\n\n`，顺序与 feed 一致；客户端取消后 `feed.close()` 的副作用恰好一次且不再写入后续事件；feed 正常结束同样只释放一次；非法 Goal、绑定查询、缺失 Goal 与不可读 Goal 仍在 SSE 开始前返回现有 JSON 状态；错误响应不带 `text/event-stream`。
  - 验证手段：扩展 `packages/browser/test/browser-stream.test.ts`，使用 `createHttpService` + `createBrowserSessionAccess` 走真实 HTTP，覆盖首事件、取消、正常结束与订阅计数；`npx tsx --test packages/browser/test/browser-stream.test.ts`；`npx tsc --noEmit`。

- [x] //TODO 2. 建立 Goal Board 统一 SSE 解析入口并迁移 metrics 与 Goal events
  - 落实标准：[2.1](./spec.md#spec-req-2-1), [2.2](./spec.md#spec-req-2-2), [2.3](./spec.md#spec-req-2-3), [2.4](./spec.md#spec-req-2-4), [2.5](./spec.md#spec-req-2-5), [2.6](./spec.md#spec-req-2-6), [4.1](./spec.md#spec-req-4-1), [4.2](./spec.md#spec-req-4-2)
  - 实施目标：在 `apps/goal-board` 增加固定版本 `eventsource-parser@4.1.3` 运行时依赖并更新该 app 的 `package.json`／`package-lock.json`。新增 `apps/goal-board/src/sse.ts`，导出 `SseMessage` 与 `readSseMessages(body, signal?)`：使用 `eventsource-parser/stream` 的 `EventSourceParserStream` 与 `TextDecoderStream`，把任意分块解码为 `{ event?, data }`；默认容错注释、未知字段与无效 `retry`，在生成器返回或 signal 中止时取消 reader。重构 `apps/goal-board/src/api.ts`：删除 `sseBlocks` 与 `events()` 内的手写 reader／缓冲区；`metrics()` 只接受 `snapshot`（`isMetricsSnapshot`）并在 `error` 时抛 `metrics_unavailable`，其他命名事件忽略；`events()` 接受 `update` 或未命名默认事件（`isLiveEvent`），其他命名事件忽略。保留非 2xx 的 `responseError`、缺失 body 的稳定错误，以及无效 JSON／DTO 的既有错误分类。
  - 场景与预期：同一段 SSE 文本被切成任意 chunk、使用 CRLF／CR／LF、包含 `: keepalive` 注释、多个 `data:` 行与可选 `id`／`retry` 时，解析器都能产出正确事件；metrics 的 `snapshot` 产出快照，`error` 抛 `metrics_unavailable`，未知事件不产出，坏快照抛 `invalid_metrics_response`；Goal events 的 `update` 与未命名事件产出 `isLiveEvent` 值，未知事件不产出，坏 JSON／坏事件形状结束生成器；abort 后不再产出且 reader 被取消。
  - 验证手段：新增 `apps/goal-board/test/sse.test.ts`，用合成 `ReadableStream` 覆盖分帧、事件名称、两条映射与 abort；`npx tsx --test apps/goal-board/test/sse.test.ts`；`npm run --prefix apps/goal-board build`。

- [x] //TODO 3. 补齐 Goal events 与 metrics 的断线重连 E2E
  - 落实标准：[3.1](./spec.md#spec-req-3-1), [3.2](./spec.md#spec-req-3-2), [3.3](./spec.md#spec-req-3-3), [3.4](./spec.md#spec-req-3-4), [4.3](./spec.md#spec-req-4-3), [4.4](./spec.md#spec-req-4-4)
  - 实施目标：扩展 `apps/goal-board/e2e/board.test.mjs` 的 mock API：Goal 事件流全部写入 `event: update`，metrics 流保持 `event: snapshot`；新增显式结束当前 Goal 事件／metrics 响应的测试辅助方法，并记录新连接次数。增加断言：首个 Goal 流结束后 UI 在现有 800ms 退避后重新连接，第二个 `state_sync` 清空旧临时进度并应用更新后的会话状态；首个 metrics 流结束后重新订阅，第二个快照替换旧值；请求不携带 `Last-Event-ID`；切换视图或结束测试时连接被取消且不再重连。保持 mock API 的其余响应与现有场景不变。
  - 场景与预期：浏览器首次连接显示实时状态；服务端主动结束 Goal 与 metrics 流后，页面短暂显示断线，再以新连接恢复并展示更新后的 `state_sync`／指标；不会把旧连接的临时正文或旧快照当权威值；不出现未处理的连接错误或重复计数。
  - 验证手段：`npm run --prefix apps/goal-board build`；`node --test --test-concurrency=1 apps/goal-board/e2e/board.test.mjs`。

- [ ] //TODO 4. 收口模块说明、依赖边界与兼容性记录
  - 落实标准：[4.1](./spec.md#spec-req-4-1), [4.2](./spec.md#spec-req-4-2), [4.5](./spec.md#spec-req-4-5)
  - 实施目标：更新 `packages/browser/notes/overview.md` 的 Goal 事件段落，说明服务端由 Hono `streamSSE` 写出、请求断开时释放订阅、保留的传输头与“慢客户端由 128 项有界队列关闭订阅、连接可能保持到断开”的限制；在 `packages/browser/notes/semantics.md` 增加或更新 Goal SSE 传输生命周期条目并链接权威源码。更新 `apps/goal-board/notes/overview.md` 的网络流说明与 `notes/semantics.md`，记录统一 `eventsource-parser` 入口、未知事件忽略、数据错误触发重连、重连不发送 `Last-Event-ID` 且以 `state_sync`／最新指标快照恢复。确认 `isLiveEvent`／`isMetricsSnapshot` 调用签名未变，`apps/goal-board/package.json` 仅新增 `eventsource-parser`，服务端包依赖未变。
  - 场景与预期：模块说明能独立回答“SSE 由谁写出、客户端如何分帧、断线如何恢复、慢客户端如何处理”；`check:docs` 的覆盖与链接检查通过；依赖检查无新增跨包边；Goal Board 类型检查与构建通过。
  - 验证手段：`npm run check:docs`；`npm run check:dependencies`；`npx tsc --noEmit`；`npm run --prefix apps/goal-board build`。

## Feature Verification

### Planned Checks

本功能不访问外部网络或付费 Provider；服务端以真实本机 HTTP 连接验证取消与释放，客户端以合成 SSE 流验证规范分帧，浏览器验收使用现有确定性 mock API。`npm test` 为最终全量回归；任何环境缺失或未执行项按 delivery-loop 记为 blocked，不以局部测试代替。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| Goal SSE 首事件与传输头 | [1.1](./spec.md#spec-req-1-1)、[1.5](./spec.md#spec-req-1-5) | 真实 HTTP 首块为 `event: update\ndata: {...}\n\n`；`content-type` 为 `text/event-stream`，缓存与代理缓冲头保持禁用语义 | `browser-stream.test.ts`；`npx tsx --test packages/browser/test/browser-stream.test.ts` |
| Goal SSE 取消与正常结束 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 客户端取消与 feed 正常结束都只产生一次订阅关闭副作用；取消后不再写出后续事件；无未处理拒绝 | `browser-stream.test.ts` 真实 HTTP 用例 |
| 错误响应不进入 SSE | [1.4](./spec.md#spec-req-1-4) | 非法身份／查询、缺失会话、缺失或不可读 Goal 返回现有 JSON 状态与错误码，不返回成功 SSE 头 | `browser-stream.test.ts`、`browser-session-inputs.test.ts` |
| feed 错误与孤立订阅 | [1.6](./spec.md#spec-req-1-6) | feed 迭代抛错或流中止时连接结束、订阅释放，不伪造事件 | `browser-stream.test.ts` |
| 客户端规范分帧 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2) | 任意 chunk 切分、CRLF／CR／LF、注释、空行、多行 `data:` 与 `id`／`retry` 均解析为正确事件；Goal Board 无第二套手写解析 | `apps/goal-board/test/sse.test.ts` |
| metrics 映射与错误 | [2.3](./spec.md#spec-req-2-3)、[2.5](./spec.md#spec-req-2-5) | `snapshot` 产出；`error` 抛 `metrics_unavailable`；未知事件忽略；坏 JSON／坏快照与缺失 body／非 2xx 使用稳定错误 | `apps/goal-board/test/sse.test.ts`；`session-metrics-http.test.ts` |
| Goal events 映射 | [2.4](./spec.md#spec-req-2-4) | `update` 与未命名事件经 `isLiveEvent` 产出；未知命名事件忽略；坏 JSON／坏 DTO 结束生成器 | `apps/goal-board/test/sse.test.ts`；`web-contracts` 现有 guard 测试 |
| abort 与提前关闭 | [2.6](./spec.md#spec-req-2-6)、[3.4](./spec.md#spec-req-3-4) | abort 后 reader 被取消、生成器停止且无未处理拒绝；切换／卸载不继续重连或更新状态 | `apps/goal-board/test/sse.test.ts`；`board.test.mjs` |
| Goal events 重连 | [3.1](./spec.md#spec-req-3-1)、[3.3](./spec.md#spec-req-3-3) | 首个流结束后新连接开始于 `state_sync`，清空旧临时进度并应用新状态；不发送 `Last-Event-ID` | `board.test.mjs` |
| metrics 重连 | [3.2](./spec.md#spec-req-3-2) | 首个流结束后重新订阅，第二个快照替换旧值或错误状态 | `board.test.mjs` |
| DTO 与依赖兼容 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2) | 事件名、DTO、状态码与错误码未变；`eventsource-parser` 仅在 Goal Board 依赖与 lockfile 中出现；服务端包无新增依赖 | `npm run check:dependencies`；`git diff -- apps/goal-board/package.json apps/goal-board/package-lock.json` |
| 现有测试与新增测试 | [4.3](./spec.md#spec-req-4-3) | browser SSE、session-metrics、Goal Board 解析测试全部通过；新增分块、CRLF、注释、多行 data、未知事件、无效数据与 abort 覆盖 | `npm test`；`npx tsx --test apps/goal-board/test/sse.test.ts` |
| 浏览器端到端 | [4.4](./spec.md#spec-req-4-4) | 真实浏览器中 Goal events 与 metrics 首次连接、断开、重连和状态更新均可见；mock 使用真实 `event:` 名称 | `npm run test:web-e2e`；`node --test --test-concurrency=1 apps/goal-board/e2e/board.test.mjs` |
| 文档与构建 | [4.5](./spec.md#spec-req-4-5) | `packages/browser` 与 `apps/goal-board` 说明覆盖 streamSSE、统一解析与重连边界；文档链接与依赖检查通过；Web 构建通过 | `npm run check:docs`；`npm run check:dependencies`；`npm run --prefix apps/goal-board build` |
| 全量回归 | 需求 1–4 | 类型检查、依赖边界、文档检查、全部包与 Benchmark 测试、Web E2E 全部通过 | `npm test`；`npm run test:web-e2e` |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。

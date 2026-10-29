---
status: proposed
created_at: 2026-10-28
supersedes: []
superseded_by: null
---

# 统一 SSE 实现 Spec

## 目标与范围

本 Spec 统一 Goal 实时事件与 session metrics 两条 SSE 链路的服务端写出与客户端解析：

- `GET /api/goals/:goalId/events` 不再手写 `ReadableStream` 响应，改用 Hono `streamSSE`，并保留原有订阅释放、事件顺序与 wire 形状。
- Goal Board 的 `metrics()` 与 `events()` 不再各自手写分块、边界和 `data:` 拼接，改用 `eventsource-parser` 驱动的单一解析入口；两条流只在事件名称映射与 DTO 校验上不同。
- 断线重连仍由现有 Hook 重连循环负责，以新的 `state_sync`／最新指标快照恢复权威状态。

明确不包含：

- 不改变 `BrowserGoalLiveEvent`、`SessionMetricsSnapshot`、SSE 事件名称、JSON 字段、HTTP 状态码或现有错误码。
- 不引入 `Last-Event-ID`、事件 ID、服务端断线补发或历史事件回放；重连仍以最新快照为准。
- 不改变 `session-metrics` 的 `watch()`、5 秒慢客户端写超时、指标投影或 `error` 事件语义。
- 不把 Goal 事件改成浏览器原生 `EventSource`；Bearer 令牌仍通过 `fetch` 请求头传递。
- 不修改 Runtime 会话输出、ExecutionStream、128 项事件队列上限或执行生命周期。
- 不新增 SSE 端点、压缩、CORS、代理配置或新的访问控制路径。
- 不以删除行数作为验收条件；减少重复解析与服务端响应代码只是预期副作用。

## 需求与验收标准

### 需求 1：Goal 事件服务端统一使用 Hono streamSSE

作为本机运行时维护者，我希望 Goal 事件响应只有一个服务端写出实现，以便断开、正常结束和写入失败时都按同一生命周期释放订阅。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当 `GET /api/goals/:goalId/events` 成功建立订阅时，系统必须通过 Hono `streamSSE` 写出事件，每个事件使用 `event: update` 与 JSON `data:`，并以空行结束；事件顺序必须与 `BrowserGoalLiveFeed` 的产出顺序一致。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当已建立的连接被客户端取消或请求被中止时，系统必须停止消费该 feed 并释放该连接订阅一次，不得继续向已断开的响应写入。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：当 feed 正常结束、响应流被关闭或路由完成清理时，系统必须结束响应并只释放该连接订阅一次，不得产生未处理的 Promise 拒绝。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：当 Goal 身份或查询非法、会话端口不可用、Goal 缺失或不可读时，系统必须在开始 SSE 之前返回现有 JSON 状态与错误码，不得发送成功 SSE 响应头。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：成功响应必须继续声明 `text/event-stream`、禁用缓存，并保留禁用代理缓冲（`no-transform` 与 `x-accel-buffering: no`）的语义；改用 `streamSSE` 不得引入响应缓冲。
- <a id="spec-req-1-6"></a>**验收标准 1.6**：若 feed 迭代抛错或流已被标记为中止，系统必须结束响应并释放订阅，不得伪造业务事件、保留孤立订阅或让错误逃逸为未处理拒绝；客户端按普通断线进入重连。底层写失败由 Hono 响应关闭／abort 驱动，不新增第二套写错误协议。

### 需求 2：客户端统一 SSE 解析

作为 Goal Board 维护者，我希望 metrics 与 Goal 事件共用一套符合 SSE 规范的解析，以便多行 `data:`、注释、CRLF 和任意分块边界不再由两套手写逻辑分别承担。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：当 Goal Board 消费 metrics 或 Goal events 时，系统必须共用同一个基于 `eventsource-parser` 的解析入口；`api.ts` 不得保留第二套手写分块、行边界或 `data:` 拼接实现。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：当响应被任意切分成多个 chunk 时，解析器必须正确拼接跨 chunk 的行，支持 CRLF、LF、单独 CR、注释行、空行及可选 `id`／`retry` 字段，并把同一事件的多个 `data:` 行按 `\n` 连接。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：当 metrics 流收到 `snapshot` 时，系统必须使用 `isMetricsSnapshot` 校验后产出快照；收到 `error` 时必须抛出 `metrics_unavailable`；其他命名事件必须忽略。无效 JSON 或无效快照形状必须抛出 `invalid_metrics_response`。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：当 Goal 事件流收到 `update` 或未命名的默认事件时，系统必须解析 `data` 并使用 `isLiveEvent` 校验后产出；其他命名事件必须忽略。无效 JSON 或无效事件形状必须结束本次生成器并按协议错误处理，由重连循环重新同步。
- <a id="spec-req-2-5"></a>**验收标准 2.5**：当 fetch 响应非 2xx 或响应体缺失时，系统必须沿用现有 `responseError` 分类与稳定缺失 body 错误，不得把错误响应或空响应当作 SSE 数据。
- <a id="spec-req-2-6"></a>**验收标准 2.6**：当调用方中止 `AbortSignal`、生成器提前返回或组件卸载时，系统必须取消 body reader 并停止产出，不得留下未处理的读取拒绝、继续重连或在卸载后更新状态。

### 需求 3：重连与状态一致性

作为可能断线的用户，我希望两条流在断开后可靠恢复，而不把旧连接残留的临时内容当作权威状态。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：当 Goal 事件连接正常结束或失败时，现有 `useRunStream` 重连循环必须在延迟后建立新连接；新连接的首个 `state_sync` 必须清空旧连接的临时进度与未提交正文，并触发最新状态读取。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：当 metrics 连接结束或失败时，现有 `useGoals` 重连循环必须重新订阅并最终产出最新 `snapshot`；新快照必须替换该 Goal 的错误或旧值。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：重连不得发送 `Last-Event-ID`，也不得依赖服务端补发；断线期间的权威状态只来自新的 `state_sync` 与最新 Snapshot／指标读取。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：当切换 Goal、卸载视图或显式中止时，系统必须停止重连、取消在途请求并释放 reader；不得保留定时器或继续写入已卸载视图。

### 需求 4：兼容、依赖与验证

作为审查者，我希望这次统一由测试证明，而不是只替换了实现。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：wire 事件名称、JSON 字段、DTO、HTTP 状态和现有错误码必须保持不变；`isLiveEvent` 与 `isMetricsSnapshot` 仍是唯一 wire 校验入口。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：`eventsource-parser` 必须只加入 `apps/goal-board` 的依赖并锁定版本，更新该 app 的 lockfile；不得给 `packages/browser` 或 `packages/session-metrics` 增加客户端解析依赖。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：现有 browser SSE 测试与 session-metrics HTTP 测试必须继续通过；服务端测试必须新增真实 HTTP 连接的取消、正常结束与订阅释放断言，客户端测试必须覆盖任意分块、CRLF、注释、多行 `data:`、未知事件和无效数据。
- <a id="spec-req-4-4"></a>**验收标准 4.4**：E2E 必须覆盖 Goal events 与 metrics 两条流的首次连接、断开后重连和状态更新；测试桩必须发送真实 `event:` 名称，不得只靠未命名事件通过。
- <a id="spec-req-4-5"></a>**验收标准 4.5**：`packages/browser` 与 `apps/goal-board` 的模块说明必须说明 Goal 事件由 Hono `streamSSE` 写出、客户端统一解析入口与“重连不补发”的边界；`npm run check:docs`、`npm run check:dependencies` 与 Goal Board 类型检查必须通过。

## 架构与核心决策

### 系统拓扑与接口

```text
Goal events（服务端）
  GET /api/goals/:goalId/events
    -> BrowserGoalSessionPort.openEvents(goalId, requestSignal)
    -> streamSSE(context, callback)
         callback:
           stream.onAbort(feed.close)
           for await event of feed.events
             if stream.aborted break
             stream.writeSSE({ event: "update", data: JSON.stringify(event) })
           finally feed.close()

Goal events / metrics（客户端）
  apps/goal-board/src/api.ts
    events()  -> readSseMessages(response.body)
                  -> event === "update" | undefined
                  -> isLiveEvent -> yield
    metrics() -> readSseMessages(response.body)
                  -> event === "snapshot" -> isMetricsSnapshot -> yield
                  -> event === "error" -> throw "metrics_unavailable"

  apps/goal-board/src/sse.ts
    interface SseMessage { readonly event?: string; readonly data: string }
    readSseMessages(
      body: ReadableStream<Uint8Array>,
      signal?: AbortSignal,
    ): AsyncGenerator<SseMessage>
```

`readSseMessages` 使用 `eventsource-parser/stream` 与 `TextDecoderStream` 完成字节解码、分块拼接和事件派发；它不包含 metrics 或 Goal 事件的业务校验。`api.ts` 只保留两个小型映射函数，分别处理事件名称、DTO guard 与稳定错误。

Goal 事件路由的现有前置校验、`session.openEvents` 调用与错误状态映射保持不变；`createEventStreamResponse` 删除。`streamSSE` 返回的响应在返回前恢复 `cache-control: no-cache, no-transform` 与 `x-accel-buffering: no`，使传输头的可观察语义与当前实现一致。

### 关联 Spec 边界

- `specs/session-output-protocol` 拥有 Goal SSE 的 `BrowserGoalLiveEvent` 联合、重连同步与提交顺序语义。本 Spec 只替换传输写出和客户端分帧解析，不改变事件含义、`state_sync` 首项规则或断线后不重播分片的要求。
- `specs/streaming-session` 拥有 Goal 范围订阅、首项一致同步和后继 Run 不关闭订阅的行为。本 Spec 不改变 `BrowserGoalSessionPort`、feed 队列或订阅建立顺序。
- `specs/session-metrics-projection` 拥有 metrics JSON／SSE 路由、`watch()` 语义、5 秒慢客户端写超时和 `error` 事件。本 Spec 只让客户端复用解析器，不修改 metrics 服务端行为。
- `specs/web-backend-separation` 拥有 Goal Board 与 Goal Server 的 HTTP／SSE 访问边界。本 Spec 保持同源、Bearer、错误脱敏与现有授权规则。
- `specs/web-wire-contract-unification` 拥有 `isLiveEvent`、`isMetricsSnapshot` 等 wire guard 的实现与形状来源。本 Spec 只调用这些既有 guard 名称与签名，不复制 DTO 形状；两者可并行实现，但任何 guard 接受范围变化必须由该 Spec 显式记录，不能借本 Spec 放宽。
- 当前工作树中未提交的 `specs/web-content-hardening`、`specs/storage-write-primitives` 与 `specs/web-wire-contract-unification` 分别处理网页工具、存储写入与 wire 合同，均未改变 SSE 端点、事件名称或本 Spec 的传输职责；本 Spec 可独立实现和验证，不依赖其它 Spec 的未交付产物。

### 核心决策

- **服务端采用 Hono `streamSSE`**：Goal 事件与 metrics 都使用同一 Hono 流式辅助函数；删除手写 `ReadableStream`，但保留 Browser feed 的所有权与释放规则。`stream.onAbort` 与 `finally` 都调用幂等的 `feed.close()`，由现有实现保证重复关闭不产生第二次副作用。
- **客户端只保留一个 SSE 解析入口**：`eventsource-parser` 负责规范级分帧，业务映射留在 `api.ts`。两个映射器分别决定接受哪些事件名；解析器本身不认识 DTO。解析器使用默认容错策略：注释、未知字段和无效 `retry` 不终止流；只有已接受事件的 JSON／DTO 校验失败才结束生成器。
- **未知命名事件忽略，数据错误失败**：未知事件不产出领域值，允许未来新增事件而不破坏旧客户端；已接受事件的无效 JSON 或 guard 失败是协议错误，必须结束本次生成器并触发重连。
- **Goal 事件保持现有有界队列语义**：不引入 metrics 的 5 秒写超时。慢客户端不再读取时，128 项 `LiveEventQueue` 仍会关闭该订阅；HTTP 连接可能保持到客户端断开，这一限制与当前实现一致并记录在模块说明中。metrics 继续保留其 5 秒写入超时。
- **重连留在 Hook 层**：`useRunStream` 与 `useGoals` 的 800ms 重试循环不变；服务端每次新连接都以 `state_sync` 或最新指标快照开始。不引入 `Last-Event-ID`、事件重放或客户端自动重连库。
- **依赖只进入前端 app**：`eventsource-parser@4.1.3` 锁定在 `apps/goal-board`，使用其 `./stream` 入口；服务端包不新增依赖，Node 22.12+ 的 engine 要求由当前环境满足。
- **测试分层**：服务端用真实 HTTP Host 验证 abort 与正常结束；客户端用合成 `ReadableStream` 验证分帧与映射；E2E 用真实浏览器验证两条流的断线重连与状态替换。

## 曾考虑的备选方案

- **保留手写解析，只补测试**：改动最小，不新增依赖。**落选原因**：仍需自行维护 CRLF、单独 CR、注释、多行 `data:`、任意分块边界和 `event:` 名称，metrics 与 Goal 事件的重复实现继续存在，无法满足单一解析入口。
- **使用浏览器原生 `EventSource`**：自带重连和事件分派。**落选原因**：无法设置 `Authorization` 头，Bearer 令牌当前来自 URL fragment；改成查询参数或 Cookie 会扩大凭据暴露面并改变访问边界。
- **使用 `eventsource-client` 等完整客户端**：自带重连、ID 与状态管理。**落选原因**：会与现有 Hook 的 `state_sync`、快照刷新和 800ms 退避形成第二套重连状态机；本 Spec 只需要解析器。
- **两条流各自保留解析器，仅共享工具函数**：表面上减少重复。**落选原因**：分帧、事件派发和错误边界仍有两处，无法证明 metrics 与 Goal 事件使用同一套规范行为。
- **把 metrics 的 5 秒写入超时提取为共享 SSE 服务端辅助模块**：两条路由的慢客户端行为完全一致。**落选原因**：用户选择保持 Goal 事件现有有界队列语义，避免新增跨包公共接口与行为变化；metrics 的超时逻辑保持现状。
- **服务端手写 `TransformStream` + `TextDecoderStream` 而不使用 Hono**：可完全控制头与取消。**落选原因**：Hono 已是两条路由的共同宿主，`streamSSE` 已覆盖写出与关闭，继续手写只会保留本次要删除的重复。

## 风险与否定性保证

- **风险等级：medium**。改动跨越浏览器传输、Goal Board 网络层和前端依赖，但不变更持久化、权限、Runtime 状态或公开 DTO。关键操作：替换 Goal 事件响应流、统一客户端分帧、验证断线与重连，不得让订阅泄漏或让错误数据进入时间线。
- **风险：Hono `streamSSE` 的取消与关闭时序和手写流不同**。应对：服务端测试使用真实 HTTP 服务，分别在客户端取消、正常 feed 结束和流错误后断言 `feed.close()` 恰好一次、后续事件不再写出，并确认其他订阅不受影响。
- **风险：慢客户端在 Goal 事件上不再被 5 秒超时主动断开**。应对：保留现有 128 项有界队列关闭订阅的语义，并在模块说明中明确“连接可能保持到客户端断开”；不把 metrics 的超时承诺复制到 Goal 事件。
- **风险：`eventsource-parser` 的 ESM／Node 版本要求影响构建或测试**。应对：锁定 `4.1.3`，只加入 app 依赖，验证 Goal Board `tsc --noEmit`、Vite 构建与 Node 22.22 下的测试；若版本不兼容，停止并修正依赖，不以手写解析回退。
- **风险：忽略未知事件掩盖 wire 漂移**。应对：服务端测试断言 `event: update` 与 `event: snapshot`，客户端测试分别覆盖已接受事件、未知事件和无效 data；生产事件名变更必须由这些测试显式暴露。
- **风险：无效数据触发无限重连**。应对：协议错误结束当前生成器，Hook 按现有退避重连并刷新快照；测试断言不会在单个连接内重复产出同一无效事件或绕过 DTO 校验。
- **否定性保证（Invariants）**：
  - Goal Board 中不得存在第二套手写 SSE 分块、边界或 `data:` 拼接实现。
  - 不得改变 SSE 事件名称、DTO 字段、HTTP 状态、错误码或 `isLiveEvent`／`isMetricsSnapshot` 校验。
  - 不得引入 `Last-Event-ID`、事件回放、服务端补发或第二套重连状态机。
  - 不得让未知命名事件产出领域值；不得把无效 JSON 或无效 DTO 当作成功事件。
  - 不得在请求中止后继续消费 feed、继续写入响应或在卸载后更新状态。
  - 不得改变 metrics 的 5 秒慢客户端超时、`watch()` 语义或指标投影。
  - 不得让凭证进入 URL、查询参数、日志或测试快照。
- **验证边界**：需求 1 由 `packages/browser/test/browser-stream.test.ts` 的真实 HTTP 场景与现有路由测试覆盖；需求 2 由新增的 `apps/goal-board/test` 解析与 API 映射测试覆盖；需求 3 由 Goal Board E2E 的断线重连与现有 Hook 行为覆盖；需求 4 由 `npm test`（含类型、依赖、文档与全部包测试）、`npm run --prefix apps/goal-board build`、`npm run test:web-e2e` 与 `npm run check:docs` 覆盖。

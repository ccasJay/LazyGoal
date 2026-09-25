# 会话指标投影 设计

## 审批摘要

### 方案

在现有模型调用边界记录独立的数值型调用事实，按 Goal 和 Run 读取并聚合；Step 数仍读取 Goal 快照。新增可供其他组件复用的本机 HTTP 服务包，由独立指标模块注册快照与更新路由；需要服务的宿主组件显式启动它，不新增 Provider HTTP 协议层。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 指标事实独立持久化 | 每次模型调用按唯一调用 ID 记录开始与结束，独立于 Diagnostic Trace、Trajectory 和 Goal Snapshot；读取时从事实归约，避免维护第二份持久化总数 | 重启后可查询；记录故障不阻断 Goal，但极端写入故障可能留下无法事后推断的缺口 |
| Provider 边界与可信用量 | 沿用 Adapter 的供应商用量归一化结果；只使用明确上报的缓存读取数，pi-ai 诊断数不进入正式统计；不抽取通用 HTTP 协议层 | 不改模型调用协议；缺失字段显示不可用或部分覆盖 |
| 查询与实时更新 | 指标模块在进程内合并 Goal 快照中的 Step/Run 和独立调用事实，并提供供路由使用的读取与订阅能力 | 消费组件经本机 HTTP 获取当前及历史指标；订阅只在当前服务进程有效 |
| 复用型 HTTP 服务包 | `@lazygoal/http` 以 Hono 和 Node 适配器提供通用路由挂载、监听和关闭；`@lazygoal/session-metrics` 提供 JSON 与 SSE 路由，由宿主显式挂载并启动 | HTTP 包不依赖指标功能；其他组件可复用服务宿主，TUI 不自动占用端口 |
| 统计完整性与恢复 | 用接入标记区分旧会话，按调用 ID 去重；损坏数据或可检测写入缺口显式呈现，不以 0 代替 | 旧会话不回填；无跨存储原子事务，正常记录以外不承诺完全无损 |
| 最小数据集 | 指标文件只保存身份、调用结果、数值用量和计时，不保存 Prompt、响应正文、凭据或诊断估算值 | 限制额外持久化的敏感信息；指标不能作为 Goal 恢复依据 |

### 风险与待确认

- 风险等级：medium；与 Requirements 一致。新增跨 Agent、Runtime 和 Storage 的记录与读取路径，以及仅监听本机的只读 HTTP 入口，但不改变 Goal 状态转换。
- 关键操作：无。
- 风险：指标与 Goal 快照独立提交，查询可能短暂观察到不同提交时刻；若调用事实和故障标记均写入失败，重启后无法推断该次调用。本机其他进程可以读取指标；HTTP 入口必须限定回环地址并拒绝跨域浏览器读取。
- 待确认：无。

## Overview

本设计覆盖 [需求 1–5](./requirements.md)。`LLMStepExecutor` 观察一次 Adapter 调用的起止、流式首个非空文本增量及 `LLMResponse.providerMetadata.usage`；独立指标存储保存数值事实。指标模块从最新 Goal 快照取得当前及历史 Run 的 `stepCount`，再按 Run 归约调用事实，并向 `@lazygoal/http` 注册本机查询与订阅路由。现有 [Diagnostic Trace](../../packages/runtime/src/trajectory.ts) 仍只承担诊断，不参与指标读取；现有评测报告的内存用量聚合保持独立。

## Architecture

```text
Adapter response/stream -> LLMStepExecutor -> MetricsRecorder -> MetricsStore
                                              |                    |
                                              | change             | read
GoalStore snapshot ----------------------------+--------------------+-> SessionMetricsService
                                                                    |
                                               internal read(goalId) / watch(goalId)
                                                                    |
                                            session-metrics routes -> @lazygoal/http -> local HTTP client
```

指标记录不进入 Domain Event、Goal Snapshot、模型上下文或 Execution Stream 的恢复路径。`MetricsStore` 与 `GoalStore` 是两个独立提交边界；查询只读取两者，不将指标反写到 Goal。实时订阅由进程内服务发布完整的新快照，重启后的第一份快照重新从持久化数据读取。指标模块拥有 HTTP 路由并转译该服务，不独立保存或聚合指标；通用 HTTP 包不知道 Goal 或指标契约。

## Key Design Decisions

### 指标事实独立持久化

为每次实际发起的 Adapter 调用分配 `callId`，在调用前追加 `call_started`，结束时追加 `call_finished`。结束记录携带响应可确认用量或明确的缺失结果；解析 AgentDecision 失败不抹去已经完成的模型调用。失败与中止调用没有可确认用量时计入缺失调用。开始记录在重启后仍无结束记录时按中断调用计入缺失；运行中的未结束调用不贡献最终用量或速度。（需求 2.1–2.3、4.1–4.3）

`MetricsStore` 为每个 `(goalId, runId)` 保存严格校验的追加式记录，实例内串行写入并在成功返回前同步文件；读取时按 `callId` 归约，重复的同一事实只计一次，冲突记录报协议错误。目录与文件沿用工作区数据的权限边界。指标写入失败由 `MetricsRecorder` 隔离，不改变 Adapter、Runner 或 GoalStore 的结果。（需求 2.1、4.2–4.3）

### Provider 边界与可信用量

使用现有 [归一化用量](../../packages/llm/src/core/usage.ts)；`cachedInputTokens` 仅在上游明确返回缓存读取数时存在。原生 OpenAI/Gemini Adapter 已在响应处提供该字段；pi-ai 的 `piUsage` 不证明供应商是否上报，始终按缺失处理。指标记录只写归一化数值和 `provider_reported` / `unavailable` 来源，不复制完整 `providerMetadata`。新增通用 Provider HTTP 层对本功能没有提供额外可信字段，且会扩大不同 SDK 和流式协议的修改范围。（需求 2.1–2.3、3.1–3.2）

计时在 Agent 消费 Adapter 流时使用单调时钟：首个非空 `assistant_text_delta` 至 `completed` 的正数间隔为可用解码时长。非流式 `generate()` 的回退事件不构成真实首 token 证据；只返回工具调用而无文本增量时也没有可用速度。整次调用耗时继续用于 Trace，不进入生成速度分母。（需求 3.3–3.4）

### 查询与实时更新

`SessionMetricsService.read(goalId)` 在指标模块内部返回一次 Goal 汇总和逐 Run 明细；不存在的 Goal 返回 `undefined`，指标文件损坏或读取失败抛出可识别错误。`watch(goalId)` 先建立订阅再读取首份快照，随后在指标记录成功或 Goal 快照提交后重新读取并推送；初始读取期间的通知必须触发再次读取，避免漏掉订阅交接时的更新。订阅按 Goal 覆盖后继 Run，取消订阅释放进程内资源。消费组件通过 HTTP 访问这些能力，不直接调用该服务。（需求 1.1–1.3、4.1–4.3）

Step 数直接来自 `Goal.state.run.stepCount` 和 `completedRuns[].stepCount`，一轮由 `stepCount > 0` 的 Run 贡献；等待恢复不创建另一轮。调用事实可先于对应 Step 快照提交，所以运行中用量可能先于 Step 数更新；这反映两种事实各自的提交时刻，不声称两库原子快照。（需求 1.1–1.3）

### 复用型 HTTP 服务包

`@lazygoal/http` 只拥有 Hono 应用装配、通用路由挂载、本机监听和关闭，不包含 Goal 或指标代码。`@lazygoal/session-metrics` 拥有指标投影服务与 HTTP 路由，依赖通用 HTTP 包的挂载契约；通用 HTTP 包不依赖指标模块。其他组件可在自己的服务实例中挂载路由，本 Spec 不定义那些路由、鉴权体系或远程监听模式。宿主显式调用 `start()` 并指定端口；TUI/CLI 不自动启动服务，也不增加专用启动参数。本次指标服务实例只挂载只读指标路由，仅监听 `127.0.0.1`，在响应前校验 `Host` 与 `Origin`，不发送允许跨域读取的 CORS 头；无需认证即可被本机进程读取，因此只暴露数值型指标。（需求 4.4–4.5、5.1–5.3）

指标模块注册 `GET /goals/:goalId/metrics` 的 JSON 快照和 `GET /goals/:goalId/metrics/stream` 的 SSE 更新。SSE 使用 `watch()` 建立订阅后取得的首份快照发送 `snapshot`，随后发送更新；重连时重新发送最新快照，不承诺历史事件回放。客户端断开即取消订阅；每连接只保留最新待发送快照，写入受阻时关闭该客户端，不等待慢客户端完成后才推进 Goal。指标路由将不存在的 Goal、读取故障和非法路径映射为可区分状态，流开始后的读取故障发送 `error` 事件并关闭连接。（需求 4.4–4.5）

### 统计完整性与恢复

首次由指标功能创建的 Goal 写入接入标记；接入前的 Goal 首次被读取或继续时标记已有历史未覆盖。标记缺失、旧会话或可检测的记录失败使覆盖状态保持 `partial` / `unavailable`，不回填历史。查询从持久化记录重算，不累计上次查询结果；同一 `callId` 的重复读取或重复通知不增加用量。（需求 2.1–2.3、4.2–4.3）

对有真实用量的已结束调用，输入/输出分别求和并报告 `reportedCalls` 与 `missingCalls`；没有真实上报调用时数值为 `null`。缓存比率只使用同时具有有效缓存读取数和正输入数的调用，生成速度只使用同时有真实输出数与正解码时长的调用；两项都返回参与和排除的调用数。缓存读取大于输入、非安全整数或聚合溢出时不生成误导性比率，按无效数据处理并反映覆盖缺口。（需求 2.1–3.4）

### 最小数据集

指标记录保留 `goalId`、`runId`、可选 `executionUnitId`、`callId`、记录类型、结果、用量来源、输入/输出/可选缓存读取数及可选解码时长。时间戳用于审计顺序，速度只用单调时钟算出的时长。不得保存 Prompt、模型正文、Tool 参数、API Key、`piUsage` 或完整供应商响应。（需求 2.1–2.3、3.1–3.4）

## Components and Interfaces

- Runtime 定义 `ModelCallMetricRecord` 与 `MetricsStore` 的记录契约；它们不改变 `Goal` 或 `GoalStore` 协议。Storage 实现工作区范围的 JSONL Store；Agent 接受可选 `MetricsRecorder`，在 Adapter 调用边界记录事实。`@lazygoal/session-metrics` 定义 `SessionMetricsSnapshot`、`SessionMetricsService`、归约与指标 HTTP 路由。Composition Root 为实际运行入口连接 Store、Recorder、投影服务、Goal 提交通知与路由挂载。
- `SessionMetricsSnapshot` 包含 `goalId`、`roundCount`、`stepCount`、`runs[]` 与同形全会话用量。每个 Run 含 `runId`、`stepCount`、`reportedCalls`、`missingCalls`、可空的输入/输出 token 合计、缓存命中率与 tokens/s；比率附参与和排除的调用数，整体附 `complete` / `partial` / `unavailable` 覆盖状态。
- `read()` 每次以最新 Goal 快照为 Run 列表和 Step 数权威，再读取相应 Run 指标文件；`watch()` 的通知只是重新读取提示，不作为持久化事实。这些是指标路由所需的进程内能力，不作为消费组件的直调接口。公共接口的错误、所有权、订阅关闭与持久化语义须在实现时按仓库规则写入中文 TSDoc。
- `@lazygoal/http` 导出可挂载子路由的应用工厂与显式 `start` / `close` 生命周期，不导出指标端点。`@lazygoal/session-metrics` 导出可挂载的指标子路由，路由只依赖 `SessionMetricsService`。Hono 与 `@hono/node-server` 用于 HTTP 包，指标路由使用 Hono 的子路由接口；其类型不传播到 Runtime、Agent 或 Storage，路由输入和输出在 HTTP 边界校验。

## Error Handling

- 指标追加失败：Recorder 捕获并向本进程订阅者标记可检测缺口；模型调用与 Goal 提交继续。若故障使任何缺口标记均无法落盘，重启后不能保证识别该调用；不把这种情况描述为完整记录。
- 指标读取遇到坏 JSON、未知记录类型、身份冲突或相互矛盾的调用事实时返回明确错误，不跳过坏行后给出看似完整的总数。GoalStore 读取错误沿用原有失败语义。
- `watch()` 读取失败时向订阅者发送错误状态，后续成功读取可恢复更新；订阅者回调异常不得影响模型执行、Goal 提交或其他订阅者。
- 监听失败由启动方收到明确错误，不改变 Goal 状态；HTTP JSON 响应不泄露内部堆栈，SSE 连接关闭和慢客户端清理不等待正在执行的模型或 Tool。

## Research Findings

- [Node `node:http`](https://nodejs.org/api/http.html) 无第三方依赖，但它是低层 API；若多个组件挂载路由，路径分派、SSE 和连接清理需由本包实现。[DSH 的独立 HTTP 宿主](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/host/webserver/README.md) 采用此路线及自有路由注册表，证明它可行，但不降低 LazyGoal 自行维护这些代码的成本。
- [Hono Node 适配器](https://hono.dev/docs/getting-started/nodejs) 运行在 Node HTTP 之上，提供可关闭的服务器；[子路由](https://hono.dev/docs/api/routing) 与 [SSE 辅助函数](https://hono.dev/docs/helpers/streaming) 正好覆盖复用型宿主和当前实时指标入口。选择 Hono 与 `@hono/node-server` 两个依赖，不引入其项目脚手架。
- [Fastify](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) 提供较完整的 Schema 与插件机制，但本次只有只读指标路由；直接操作底层响应还会绕开部分 [Fastify 回复逻辑](https://fastify.dev/docs/latest/Reference/Reply/)。当前不选用。

## Testing Strategy

- 以多 Run、同 Run 等待恢复、空 Run 和 Step 提交构造 Goal，核对 `roundCount`、当前与历史 `stepCount` 及逐 Run/总量关系。（需求 1.1–1.3）
- 用原生上报、缺失字段、pi-ai 诊断数、调用失败/中止和重复读取验证真实合计、缺失计数及覆盖状态；重建 Store 后结果不重复、不丢失已成功写入的记录。（需求 2.1–2.3、4.2）
- 用带/不带缓存字段、零输入、非流式响应、流式首 token 与结束时间验证两项比率、参与范围及不可用语义。（需求 3.1–3.4）
- 模拟指标写入失败、坏记录、进程重建、订阅交接竞态和新 Run 创建，验证运行中更新与显式错误，同时确认 Goal 执行及恢复结果不变。（需求 4.1–4.3）
- 用本机临时端口启动 `@lazygoal/http` 并挂载 `@lazygoal/session-metrics` 路由，核对 JSON 与 SSE 的首份快照、更新、404/读取错误、连接断开和慢客户端清理；验证仅通用 HTTP 包不提供指标路由，其他子路由可独立挂载；验证只能从回环地址连接、跨域 `Origin` 被拒绝、非 GET 请求不能修改指标状态，且宿主关闭后端口与订阅均释放。（需求 4.4–4.5、5.1–5.3）

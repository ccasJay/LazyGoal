# 执行事件流

Goal/Run 范围内的内存实时事件及有界订阅；不作为恢复事实。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 职责

`@lazygoal/execution-stream` 是与 Runtime、LLM、Tool 和 UI 解耦的进程内事件 Core。它提供 JSON-safe 的事件 Envelope、Goal/Run 订阅、cursor 分配、可见性过滤、相邻增量合并、有界队列和关闭语义。实现位于 [`packages/execution-stream/src`](../src/index.ts)，当前包保持私有。

Core 不解释事件 `kind` 的领域含义，也不写 Goal Snapshot、Trajectory 或外部传输。它不调用 Provider、Tool，不执行状态转换，不渲染 Markdown；SSE、WebSocket 和浏览器打包由后续应用层适配器负责。

## 所有权与适配器

- Runtime 在 Runner/Coordinator 的生命周期和提交边界发布 `run_started`、`step_started`、`decision_received`、`tool_started`、`tool_finished`、`observation_recorded`、`step_committed` 以及等待和终态事件。发布失败被隔离，不改变执行和持久化结果。
- Agent/LLM 将 Provider 流转换为 `assistant_text_delta`、`reasoning_delta`、`model_tool_call_delta` 和 `model_completed`。推理与不完整工具参数使用受限可见性；不支持流式 Provider 时，Agent 仍调用 `generate()` 并发布一次性模型事件。
- Tools 的流能力是可选扩展。Bash 在同一次进程执行中发布 stdout/stderr 分片，其他 Tool 保持最终 Observation 回退；每个 Action 仍只执行一次，超时、中止、截断和 replayPolicy 由 Tool/Runtime 原有契约拥有。
- Browser Stream Adapter 将通用事件投影为受授权的同源 SSE；Goal Board 更新模型文本尾部、Step/Tool 活动和有限输出。已提交会话仍由 Snapshot/Trajectory 投影，避免把实时事件当作恢复事实。

## 事件和订阅语义

每个事件包含 `schemaVersion`、`eventId`、`goalId`、`runId`、可选执行单元和 Action 标识、单调 `cursor`、时间、`visibility`、`durability`、`kind` 和 JSON-safe `payload`。同一 Goal/Run 内的相邻 `delta` 事件在相同 `kind`、可见性和 `coalescingKey` 下可以合并；控制事件保持顺序且不会被静默丢弃。

订阅默认只接收 `public` 事件并排除 reasoning。内部诊断订阅可提高可见性并显式打开 reasoning。订阅队列达到上限后，Core 关闭慢订阅者并提供 `backpressure` 原因；调用方也可以主动关闭，发布器关闭时所有订阅收到 `publisher_closed`。实时层没有历史回放；恢复和去重必须使用持久化 Snapshot/Trajectory 的边界。

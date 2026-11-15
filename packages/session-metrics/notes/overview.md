# 会话指标

从已提交 Goal 和模型调用事实投影用量及覆盖状态。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 职责

`@lazygoal/session-metrics` 将当前 Goal Snapshot 与持久化模型调用事实归约为只读 Goal/Run 指标快照。它不缓存累计值，不修改 Goal，也不参与 Runtime 恢复。

## 数据流与覆盖状态

`LLMStepExecutor` 通过 Runtime `ModelCallMetricsRecorder` 写入调用开始和结束事实；`@lazygoal/storage` 将它们保存为按 Goal/Run 隔离的 JSONL，并单独保存接入覆盖标记和已知写入缺口。查询时服务读取 Goal 的当前及已完成 Run，再读取对应调用事实，按 `callId` 汇总 token、缓存命中率、端到端输出速率、Step 数和轮数。

Token 汇总只纳入供应商确认用量；无可确认用量的调用计入缺失调用，估算只用于 Context 占用，不进入汇总。新 Goal 从完整覆盖起点开始，首次遇到无标记的历史 Goal 时标记为历史未覆盖。缓存命中率要求供应商明确报告缓存输入量。端到端输出速率只纳入成功调用中同时具有供应商确认输出 token 和有效请求耗时的样本，按输出 token 总和除以请求耗时总秒数计算；请求耗时从适配器调用开始到完整响应消费结束，包含等待和传输时间。缺少任一输入的已结束调用计入速率排除数，仍在进行的调用不进入速率计数；速率覆盖与 Token 用量覆盖分别解释。

上下文容量优先取用户配置的 `[context].epoch_limit_tokens`，否则取模型标称窗口；`contextCapacity` 独立于模型调用状态返回。`contextUsage` 仅在当前 Run 最近一次模型调用成功结算且属于当前模型时，根据该次输入与输出 token 计算占用比例；调用仍在进行、失败或模型不匹配时为 `null`，不回退到更早用量。调用开始事实保存当时的模型 ID，避免模型切换后误用旧模型用量。供应商未上报用量时，调用记录会携带本地估算的输入 token 并标记为估算；没有可用的已结算用量时 `contextUsage` 为 `null`，但已知容量仍由 `contextCapacity` 提供给界面。该占用不预测下一次请求，也不累加跨调用历史。

阈值压缩只读取 `contextUsage`。调用进行中、失败或尚未结算时，指标快照不会伪造新的占用，也不会把上一次调用的读数用于压缩判断；`contextCapacity` 仅用于显示模型窗口或配置容量。

调用事实写入失败会尽力持久化缺口并保留当前进程的缺口状态，不改变 Goal 执行。本进程写入模型调用事实，或宿主报告 Goal 快照已保存时，订阅者会收到重新归约的快照。Web 的独立 Worker 通过 [Supervisor 保存通知](../../../apps/goal-server/notes/overview.md#web-服务) 更新订阅。订阅取消不影响 Runtime。

## 查询路由

模块提供只读 JSON 快照和 SSE 更新路由，并将其作为 Hono 子应用交给通用 [`HTTP Host`](../../http/notes/overview.md) 挂载。路由只接受 GET，检查回环 Host 与同源 Origin，不启用 CORS；SSE 连接断开或写入超时会取消对应订阅。

# 会话指标

从已提交 Goal 和模型调用事实投影用量及覆盖状态。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## 职责

`@lazygoal/session-metrics` 将当前 Goal Snapshot 与持久化模型调用事实归约为只读 Goal/Run 指标快照。它不缓存累计值，不修改 Goal，也不参与 Runtime 恢复。

## 数据流与覆盖状态

`LLMStepExecutor` 通过 Runtime `ModelCallMetricsRecorder` 写入调用开始和结束事实；`@lazygoal/storage` 将它们保存为按 Goal/Run 隔离的 JSONL，并单独保存接入覆盖标记和已知写入缺口。查询时服务读取 Goal 的当前及已完成 Run，再读取对应调用事实，按 `callId` 汇总 token、缓存命中率、生成速度、Step 数和轮数。

Token 只纳入供应商确认用量。无可确认用量的调用显示为缺失调用；新 Goal 从完整覆盖起点开始，首次遇到无标记的历史 Goal 时标记为历史未覆盖。缓存命中率要求供应商明确报告缓存输入量；生成速度只纳入存在权威输出 token 且有流式首文本计时的调用。

上下文剩余比例以当前 Run 最近一次已完成调用的供应商输入、输出 token 之和，与当前模型快照中的窗口容量计算。调用开始事实保存当时的模型 ID，用于避免模型切换后误用旧模型用量；缺少容量、身份或确认用量时比例不可用。该值描述最近一次调用结束后的窗口余量，不预测下一次请求。

调用事实写入失败会尽力持久化缺口并保留当前进程的缺口状态，不改变 Goal 执行。Snapshot 保存和模型事实写入后，订阅者会收到重新归约的快照；订阅取消不影响 Runtime。

## 查询路由

模块提供只读 JSON 快照和 SSE 更新路由，并将其作为 Hono 子应用交给通用 [`HTTP Host`](../../http/notes/overview.md) 挂载。路由只接受 GET，检查回环 Host 与同源 Origin，不启用 CORS；SSE 连接断开或写入超时会取消对应订阅。

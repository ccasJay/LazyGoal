# 模型上下文组装

本包把 Runtime 提供的 Goal、Profile、授权 ToolDefinition、Working Memory、Context Lookup 结果与 committed Trajectory 投影为 [模型视图](../../model-view/README.md)，并按 [上下文预算](../../context-budget/README.md) 的配额组装 Hot/Warm。它只读取注入的 `TrajectoryStore` 与当前快照，不推进 Goal、不执行模型调用、不写任何持久化边界。公开入口是 [src/index.ts](../src/index.ts)。

## 投影与来源筛选

[`ModelInferenceProjector`](../src/model-inference-projector.ts) 从 Goal 生成深冻结的 `ModelInferenceView`：固定 `PromptContext`、动态运行状态（含当前活动阶段与权限）、真实 Conversation、Working Memory、Context Epoch 与可选 Lookup 结果。它把 Goal 领域的 Step、Pending Action、GoalPlan 与 Run 阶段投影为模型可见 DTO；不修改输入 Goal，也不分配 Runtime ID。

[`TrajectoryExecutionUnitAdapter`](../src/trajectory-execution-unit-adapter.ts) 读取 committed Trajectory 并构建完整执行单元：忽略提交边界外的 tail，严格校验边界内事件的序号、Goal/Run 身份、执行阶段与单元连续性；Tool 单元必须包含 Decision、已批准 Action、Tool 开始/结果与 Observation；批准可以是同一单元的 `approved` staging，也可以是同单元的 `action_approved` 事实。不完整单元被排除而不是拆分，结构矛盾抛出 `MODEL_CONTEXT_SOURCE_ERROR`。`HotWindowSelector` 从最新单元向旧选择连续后缀，遇到首个无法整体容纳的单元即停止。

[`TrajectoryEventProjector`](../src/trajectory-event-projector.ts) 把事件投影为有界模型 DTO：大型成功 Observation 以 SHA-256 与 prefix/suffix preview 替代完整载荷，Artifact 解析器只能返回已有引用，无引用时标记 `artifactAvailability: "unavailable"`。 [`collectNativeModelExchanges`](../src/native-model-history.ts) 重建原生调用交换：供应商调用 ID 与 Action 对应，审批等待与未结算调用不进入下一请求，切换 provider/端点/模型/协议结束旧续接段。

[`TrajectoryModelContextAssembler`](../src/trajectory-model-context-assembler.ts) 在一次调用内完成：按提交边界、Goal/Run、阶段、Epoch 与 Conversation 起点筛选已提交 frame；选择 Hot 连续后缀；用 `WarmReducer` 归约省略单元派生的有损 Warm 条目；把固定输入计量与 Hot/Warm 配额写入预算报告。Epoch 切换、历史裁剪或缺少有效基线时 Section 当前投影会重新完整注入；必需内容超限时在调用前抛出 `MODEL_CONTEXT_HARD_OVERFLOW`。

[`context-lookup-projection`](../src/context-lookup-projection.ts) 与 [`goal-context-navigation`](../src/goal-context-navigation.ts) 把 Runtime Lookup 结果、阶段路线与重要信息目录投影为带来源范围与时效提示的模型 DTO。

## 组件单元

渲染机制、Section 注册与默认内容分别归 Prompt 渲染与 Prompt Bundle 包（本 Spec 后续任务拆出）；模型请求、响应解码与执行协调在 Agent 拆包任务完成后分别归对应包。本包不读取模板，也不解析模型输出。

## 限制

Assembler 每次调用都从 Snapshot boundary 与 `TrajectoryStore` 重新读取，不缓存 Goal、Trajectory 或 Warm；调用结束、等待、中断与进程退出都可以丢弃其结果。Conversation 必须已按当前 Context Epoch 裁剪，Assembler 不会再次改变它。Warm 只是可丢弃的有损上下文，不替代 Goal Task、Working Memory 或 Cold Trajectory。

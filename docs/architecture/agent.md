# Agent 模块

## 职责

Agent 将 Runtime 提供的 Goal、Profile、授权 Tool、Working Memory 和已提交 Context Lookup 结果投影为一次模型请求，再把模型响应解析为统一 `AgentDecision`。主要入口是 [`LLMStepExecutor`](../../packages/agent/src/llm-step-executor.ts)、[`model-inference-view.ts`](../../packages/agent/src/model-inference-view.ts)、[`prompt.ts`](../../packages/agent/src/prompt.ts) 和 [`render.ts`](../../packages/agent/src/render.ts)。Agent 不保存 Goal，不执行 Tool，不生成 Runtime ID，也不决定审批结果。

## Prompt Bundle

默认 Renderer 只注册 Prompt Bundle v1 的四个固定资产，并按以下顺序渲染：

1. Global Overview；
2. Profile；
3. 当前唯一 `executing` Phase Protocol；
4. Authorized Tools。

Bundle 固定匹配 `structured@1`、`trajectory-layered@1` 和 `bm25-lite@1`。Registry 在构造期检查模板、slot 顺序、协议和阶段映射；不提供旧模板或版本回退。

## 单轮请求

`ModelInferenceProjector` 从 Goal 生成深冻结的 `ModelInferenceView`，包括当前 task（若已批准）、真实 Conversation、Profile、授权 Tool Schema、Working Memory、Context Epoch、可选的已提交 Lookup Result 和 Plan Mode 下只读的 GoalPlan 投影。模型只能看到稳定 JSON DTO，不能提交 Runtime 的 Goal/Run、Step、Epoch、Todo ID、Action ID 或内部计数。

`buildStepRequest` 在单次调用内完成上下文组装、预算裁剪和 Prompt 渲染，并返回与请求绑定的 `ModelOutputContractBundle`。`TrajectoryModelContextAssembler` 以 Goal 的 committed boundary 为准，把带已批准 `action_staged` 的完整 Tool Action/Observation 执行单元投影到下一轮 Hot/Warm 上下文；未提交、缺少 staging 或不完整单元不可见。动态模型绑定只在调用边界读取；请求开始后不切换 Adapter 或 generation。

## 当前决策门控

Contracts 根据 `workflow.task` 和后端 `planMode` 动态生成 Wire Schema：

- task 缺省：`ask_user`、`task_proposal`、历史 `context_lookup` 和显式只读 Tool；
- task 已批准：上述执行入口加上全部授权 Tool、`complete`、`wait` 和 `fail`。
- Plan Mode：在对应分支额外暴露 `system_update_goal_plan`；普通模式不生成该分支。

只读能力由 Runtime `ToolDefinition.isReadOnly` 提供，Agent 只负责过滤模型可见列表；最终授权仍由 Runtime 再校验。完成条件和验收声明由 Task 投影给模型，但满足条件的事实只能来自已提交 Evidence。

## 输出处理

模型原始文本由 LLM Adapter 返回，Agent 使用当前请求绑定的 Wire Contract 严格解析，再解码为 Canonical `AgentDecision`。Plan Mode 的 `goal_plan_update` 仍只是模型提案，由 Runtime 的 GoalPlan reducer 分配 Todo ID、校验 revision/状态并提交 Snapshot；普通模式不会解码该分支。非法 JSON、Schema、分支或工具输入以稳定协议错误失败；不自动修复、不重试、不把模型自述当成 Observation。原始响应可进入独立诊断 Trace，但不进入 Goal messages、Snapshot 或 Domain Event。

Agent 不提供流式 UI；TUI 的 Assistant 流式展示由 Controller 的 Transcript 管理。Agent 只负责单轮完整响应与确定性 Prompt/Contract 组合。

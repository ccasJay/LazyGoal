# 模型请求准备

本包把 Goal、[模型视图](../../model-view/README.md)、注入 Renderer 与 [已提交历史组装](../../model-context/README.md) 转换为与本次请求绑定契约的单轮 LLM 请求；它不调用 Provider、不写调用记录、不提交 frame，也不依赖执行器或默认 Bundle。公开入口是 [src/index.ts](../src/index.ts)。

## 单轮请求

[`buildStepRequest`](../src/prompt.ts) 在一次调用内完成：按 `exposedToolIds` 与授权目录交集筛选可见工具；投影 [模型视图](../../model-view/README.md)；按 [上下文预算](../../context-budget/README.md) 的 Conversation 裁剪或分层组装组装固定输入；渲染固定 system、动态 section 与 Working Context；并返回 `{ request, bundle, toolDeclarations, modelContextFrame }`。请求契约与 `toolDeclarations` 由同一组可见工具、任务批准状态与输出模式生成，确保解析端与请求端一致。阶段声明额外绑定本次 Goal 快照中的当前阶段和 Plan 路线，由该请求独有的声明闭包解码；strict 与 prompt_only 使用同一组工具参数契约，模型不回填身份或版本。

`createStageMessages` 生成带 `source` 标记的临时阶段消息：Think 历史、Think 目标、工具发现结果与 Runtime 反馈；反馈始终移动到请求末尾，且不进入真实 Conversation。

[过程正文去重](../src/process-message-dedup.ts) 在分层组装之后、预算裁剪之前生效：只有本次请求实际包含的同身份已结算原生交换可以覆盖同源过程正文，覆盖以模型调用身份关联而不是比较正文字符串，因此同文的用户消息、其他调用与独立答案都不受影响。交换未结算、被预算淘汰、协议身份切换或不存在时，过程正文按原顺序继续参与预算与裁剪。

通过身份筛选的 OpenAI-compatible assistant 历史以 blocks-only 消息原样进入 `LLMRequest.messages`；请求组装不再复制文本、reasoning 或工具调用字段。Adapter 负责按 Chat Completions 结构投影，诊断输入则由模型调用边界单独转换。

Decide 挂载工具时沿用同一组授权声明和参数 Schema；常规 OpenAI-compatible Goal 设置 `toolChoice: "auto"` 并允许 `stop` 或 `tool_calls` 结束，不发送顶层结构化 Schema、工具 `strict`、`parallel_tool_calls` 或 `stream_options.include_usage`。其它原生调用路径保留其既有 `required` 策略；`prompt_only` 非原生路径在请求内提供 `responseShapeGuide`。Think 不挂载工具与结构化输出。原生路径（`nativeConversationIdentity`）由执行器传入，动态授权 Section 的 Schema 去重规则由 Renderer/默认 Bundle 决定。

当提供 `modelCapabilities` 时，候选请求把原生工具声明与单调用指令计入硬预算；按 Warm → 旧 Conversation → Hot 顺序回退，必要时把契约切换为 `context_checkpoint_result` 并在请求中标记 `checkpointRequired`；必需输入仍超限时在调用模型前抛出 `MODEL_CONTEXT_HARD_OVERFLOW`。

## Section 更新计划

[`planDynamicSectionUpdates`](../src/dynamic-section-diff.ts) 只比较各 Section 的规范化 JSON 投影：接收当前渲染结果与已由 Runtime 按 Goal/Run、阶段、Epoch、Conversation 起点和 Snapshot 边界筛选的 frame。未变化 Section 沿用已提交消息，变化 Section 产出完整替换或失效 tombstone，并同步生成可持久化 frame 记录。投影或身份违反注册契约时抛 `DYNAMIC_SECTION_DIFF_INVALID`，请求不得继续发送；本包不读取恢复真源，也不把计划当作已提交事实。

## 完成审查请求

[`buildCompletionReviewRequest`](../src/completion-review.ts) 只声明 `system_review_completion`，保留用户原文、当前 Run 相邻 Assistant 语境、获批条件、候选与去重后的已提交证据；不暴露内部 Think 或阶段流转事件。预算来自执行器从同一固定 Binding 投影的 `{ modelContextPolicy, modelCapabilities }`；必要输入超限时抛 `COMPLETION_REVIEW_INPUT_TOO_LARGE`，不截断放行。

[`requestRequiresContextCheckpoint`](../src/request-inspection.ts) 只读取最终控制消息判断检查点要求，供调用方检查请求内容。

## 限制

本包不解析模型输出、不解码实际响应、不重试、不落盘。阶段结果组装、调用记录与持久化归调用方；实际响应接受条件由模型响应与执行协调组件负责。

---
status: proposed
created_at: 2026-10-16
supersedes: []
superseded_by: null
---

# Decide 接受语义与多调用顺序执行 Spec

## 目标与范围

把 Decide 阶段对模型响应"形状"的接受规则分级化：零调用加非空正文成为合法的 Assistant 消息，是否继续执行由 Runner 的有界规则决定；恰好一个调用继续走现有工具解析、授权与执行流程；多个调用在逐个判断通过后**顺序执行**，不并发、不改序；仅有 reasoning 或空输出按无可用结果处理；结构化控制请求仍要求唯一。

当前实现的硬约束是：`LLMStepExecutor.requireSingleToolCall` 把"tool call 数量不等于 1"一律判为协议错误（`missing_tool_call` / `multiple_tool_calls`），错误进入 `RuntimeFeedback` 修复链，由 `runner.ts` 的同 stage 三次调用上限兜底，用尽即 `INVALID_AGENT_DECISION` 终态失败。因此一次"模型只是想解释而不调用工具"的输出会被整体丢弃，用户看不到这段正文，Run 直接失败；而一次"模型一次列了多个该做的事"也会直接失败，尽管这些事本身都是合法动作。本 Spec 改变的是**分类、执行顺序与失败语义**，不是解析、授权、校验或证据规则。

**范围边界（Non-goals）**

- 不实现并发执行：多个调用必须顺序执行，禁止并行、禁止乱序重排。
- 不改动任何 LLM Adapter 的协议实现、供应商强制参数（`strict`、`tool_choice`、`parallel_tool_calls`、`response_format`）与 strict / prompt_only / two_stage 模式体系。
- 不因本 Spec 放宽 Tool 输入校验、授权边界、证据校验或输出契约的严格解析。
- 不把 Assistant 文本升格为任务完成依据，不新增"文本即完成"的判定路径。
- 不实现跨批次的嵌套批次，即一个 Action 的结果不得再触发一次新的多调用批次而不经模型重新决策。

**对既有 Spec 的范围修订（不修改其正文）**

本 Spec 是下列形状语义的当前权威。既有 Spec 的相应正文保持原样、不再代表当前行为边界；本 Spec 不修改、不重写、不在其中追加说明：

- `specs/native-tool-calling-architecture/`：req-1-2（"0 个或 1 个规范工具调用"）被本 Spec 取代为"0 个、1 个或多个；多个时逐个判断后顺序执行"；req-1-3、req-1-4 的"仅返回文本思考"归类被本 Spec 取代（"非空正文 + 零调用"是合法 Assistant 消息，"仅 reasoning 或空输出"是无可用结果）；requirements.md 中"不引入单步内多个工具的并发乱序执行"仍然有效，本 Spec 只开放顺序执行。
- `specs/llm-step-executor/`：需求 4 对"非合法 JSON、不支持的 kind、字段缺失或非非空字符串"的协议错误语义与本 Spec 一致；本 Spec 只改变"零调用"与"多调用"两类形状的分类归属，Executor 仍只发一次请求、不在调用内自行修复。
- `specs/runtime-feedback-tool-approval/`：req-4-4"达到有限尝试上限时保留每次失败原因并明确失败"与本 Spec 一致；本 Spec 新增的计数维度沿用其既有量级，不另立无界循环。
- `project-memory/features/native-tool-calling-architecture.md`：其 D3 与 Guardrail"必须且只得到一个工具决策"严于源 Spec `requirements.md:49`。本 Spec 不修改 Memory、不触发记忆治理；按记忆召回规则，Memory 不得覆盖当前实现证据，以本 Spec 与实现为准。

## 需求与验收标准

### R1. Decide 响应形状的分级接受

作为 Goal 使用者，我希望模型"只说话不调用工具"不再让整次 Run 失败，也希望它一次列出的多个动作能按顺序做完，以便我不必反复重试同一意图。

1. <a id="spec-req-1-1"></a>当一次 Decide 输出包含零个 tool call 且正文为非空文本时，系统必须将其接受为一次 Assistant 消息，不得判为协议错误；该消息必须进入 Goal 会话视图与 Trajectory，且不得推进 Step。
2. <a id="spec-req-1-2"></a>当一次 Decide 输出包含零个 tool call 且正文为非空文本时，系统不得据此把 Goal 标记为完成或产生任何完成语义。
3. <a id="spec-req-1-3"></a>当一次 Decide 输出包含恰好一个 tool call 时，系统必须继续走现有工具解析、授权与执行流程，行为与本 Spec 之前一致。
4. <a id="spec-req-1-4"></a>当一次 Decide 输出包含多个 tool call 时，系统必须按模型返回顺序逐个判断并顺序执行；不得并发执行、不得重排、不得去重、不得合并调用。
5. <a id="spec-req-1-5"></a>当一次 Decide 输出只包含 reasoning 或空内容时，系统必须按无可用结果处理：不产生 Assistant 消息，不推进 Step，并按 R3 的有界继续生成策略处理。
6. <a id="spec-req-1-6"></a>结构化控制请求（`complete`、`wait`、`fail`、`task_proposal`、`ask_user`、`context_lookup`、`tool_discovery`）仍必须要求唯一：一个批次内至多包含一个控制请求，且它必须是最后一个被执行的 Action，其后的调用不得执行；纯文本不得构成上述任一控制语义。

### R2. Runner 的继续决策与越界禁止

作为 Goal 使用者，我希望"是否继续"由运行时按明确规则决定，而不是由模型自己宣布，以便自动化不会自己判定任务结束。

1. <a id="spec-req-2-1"></a>Assistant 消息被接受后，是否继续执行必须由 Runner 依据本 Spec 定义的有界规则决定；模型文本、Adapter 与 Executor 都不得单独决定继续、停止或完成。
2. <a id="spec-req-2-2"></a>Goal 的 completed 语义仍必须来自 `complete` 控制请求及其既有完成证据校验；任何零调用的文本输出都不得使 Goal 进入终态完成。
3. <a id="spec-req-2-3"></a>不推进类决策（零调用文本、无可用结果）必须计入独立的有界计数；该计数与 Think 的 `request_think` 循环、临时故障重试、Tool 输入纠错的预算相互独立，不得互相占用或叠加成同一上限。
4. <a id="spec-req-2-4"></a>当该计数用尽时，系统必须明确失败，保留每次失败原因与该次 Assistant 文本，并允许在界面查看；不得把无效原始输出当作最终回答展示。

### R3. 有界继续生成与计数归属

作为长期 Goal 的使用者，我希望新增的继续生成策略不引入无界循环或重复计步，以便费用与恢复语义可控。

1. <a id="spec-req-3-1"></a>单条 Decide 纠错链的重试次数必须沿用既有量级：含首次最多三次模型调用；不得因本 Spec 新增无界循环或放大既有上限。
2. <a id="spec-req-3-2"></a>当有效 `request_think` 结束当前 Decide 纠错链时，该链计数必须重新开始；不得为正常 Think 循环新增总次数或 token 上限。
3. <a id="spec-req-3-3"></a>在纠错与继续重试期间，系统不得重复增加 `stepCount`；仅有效决策及其已提交的执行结果按既有 Step 规则计数。

### R4. 多调用批次的判断、执行与恢复

作为 Goal 使用者，我希望一次列出的多个动作被逐个审慎地执行，任何一个没通过检查或被卡住时不会连累其余动作，也便于中断后从正确位置继续。

1. <a id="spec-req-4-1"></a>批次内每个 Action 必须在执行前独立通过 Tool 可用性、输入 Contract、执行策略与授权检查；任一 Action 未通过判断时不得执行它，且不得因同批次其他 Action 已获批而放行它。
2. <a id="spec-req-4-2"></a>批次内需要审批的 Action 必须单独进入审批；批准不得把授权范围扩大到同一批次的其它 Action，YOLO 与默认自动放行语义保持不变。
3. <a id="spec-req-4-3"></a>系统必须在每个 Action 执行前提交其待执行状态；中断恢复后必须从批次中第一个尚未提交结果的 Action 继续，已提交结果的 Action 不得重放。
4. <a id="spec-req-4-4"></a>当批次中某个 Action 需要人工等待、或遇到不可由模型纠正的故障时，系统必须停止执行后续 Action，并保存可恢复等待状态或明确失败；已执行 Action 的结果不得被回滚、改写或隐藏。
5. <a id="spec-req-4-5"></a>批次中每个 Action 的成功执行结果各计一次 Step；判断、审批等待与纠错不得重复增加 `stepCount`。
6. <a id="spec-req-4-6"></a>批次必须携带稳定的批次身份：每个调用保留模型返回的 `callId` 作为 Action 身份，批次顺序必须是模型返回顺序；恢复与回放必须依据该身份与顺序，不得重新生成或替换。
7. <a id="spec-req-4-7"></a>每个 Action 的 Observation 必须独立归属于该 Action；不得把多个 Action 的结果合并为一次 Observation，也不得让后续 Action 读取到未执行 Action 的结果。

### R5. 分类、诊断与 pi-ai 路径一致性

作为使用者，我希望在 TUI 与 Trajectory 里能看懂模型这次到底"说了话"、"列了一批动作"还是"没给出可用结果"，以便定位失败。

1. <a id="spec-req-5-1"></a>零调用合法文本不得再报 `INVALID_LLM_RESPONSE` 的 `missing_tool_call`；必须使用可区分的分类进入 Trajectory、Diagnostic Trace 与界面状态。
2. <a id="spec-req-5-2"></a>多调用不得再报 `multiple_tool_calls` 协议错误；必须被记录为一次多调用批次事件，并可供 Trajectory、浏览器与 TUI 与单调用、零调用、无可用结果区分。
3. <a id="spec-req-5-3"></a>在 pi-ai 路径（prompt_only）下，携带工具集合时零调用加非空文本必须被 Adapter 接受；`PiAiAdapter` 不得再以 stopReason 为由抛出 Provider 错误。
4. <a id="spec-req-5-4"></a>错误码、反馈与诊断文本必须可定位，且不得包含明文凭据或 Provider 原始响应正文。

### R6. 恢复一致性

作为长任务的使用者，我希望顺序批次在中断后按同一事实继续，以便不重复执行有副作用的动作。

1. <a id="spec-req-6-1"></a>系统在继续生成、纠错、审批等待或批次执行过程中中断并恢复时，必须依据已可靠提交的状态与尝试计数继续或明确失败；未提交的 Assistant 文本、模型决策与 Action 结果不得视为已生效。
2. <a id="spec-req-6-2"></a>恢复指针必须携带本 Spec 新增的分类、计数与批次维度（批次身份、顺序、已提交进度）；身份或阶段输入不匹配时必须失败，不得用旧反馈污染新 Step。

## 风险与待确认

- 风险等级：high；理由：改变模型调用次数与执行循环边界、可恢复状态机的事件分类与批次进度、外部副作用（含一批动作的部分执行）与费用，以及失败与完成语义。
- 关键操作：当前阶段只编写需求，无需执行需另行确认的外部操作。
- 风险：批次中某个有副作用的 Action 失败或中断时可能留下已执行、未执行混合状态；把零调用文本升格为 Assistant 消息可能被误读为任务完成；分类与批次进度的变更可能破坏既有 Snapshot 回放与 `committedThroughSequence` 边界；顺序执行可能放大费用与延迟。Design 必须界定批次持久化粒度、审批边界、恢复检查点与回放兼容，并验证取消、部分失败、审批等待与 TUI/浏览器可见性。
- 既有约束：本 Spec 不修改 Tool 输入校验、授权边界、证据校验、`request_think` 循环规则，也不改动任何 Adapter 的供应商强制参数；`specs/native-tool-calling-architecture/requirements.md` 中"不引入单步内多个工具的并发乱序执行"继续有效，本 Spec 只开放顺序执行。
- 待确认的需求决策：无。零调用文本、单调用、多调用顺序执行、无可用结果与结构化控制请求唯一性五类语义已由使用者确认；多调用的批次判断、审批、持久化、恢复与计数规则已在本 Spec R4 内定义。

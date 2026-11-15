---
feature: openai-compatible-generation-contract
status: proposed
risk: medium
created_at: 2026-11-15
delivered_at: null
supersedes: []
superseded_by: null
---

# OpenAI-compatible 生成与原生回放契约

## 目标与范围

常规 Goal 使用 `openai-compatible` 的 Chat Completions 执行 Think 和 Decide，以同一套有序内容块完成流式生成、工具结算、持久化和重启后的原生回放。
首批范围限于该供应商的常规 Goal。其他供应商、Trigger Admission、GEPA 反思、benchmark RPC 和旧模式字段的全仓清理由后续迁移处理。

## 用户故事

- **S1** 作为 LazyGoal 用户，我希望指定的 OpenAI-compatible Profile 直接驱动 Goal，以便用兼容网关完成推理和工具调用。
- **S2** 作为 LazyGoal 用户，我希望能区分完整生成、拒绝和未完成响应，以便知道何时可以推进任务。
- **S3** 作为 LazyGoal 用户，我希望 Decide 每轮只执行一个合法调用，以便模型可以纠正无效尝试，工具不会因这类尝试被误执行。
- **S4** 作为 LazyGoal 用户，我希望重启后从已结算的工具交换继续，以便模型保有原始调用和结果的关联。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 常规 Goal 创建、切换至或恢复已选的 `openai-compatible` 模型 | 从指定 Profile 解析连接与模型，按 Chat Completions 装配同一 Adapter 供 Think 和 Decide 使用。在目标路径的 Profile 配置、工厂选择、阶段绑定及 Adapter 中删除 `strict`、`prompt_only`、`two_stage` 的语义，移除 Adapter 构造参数和实例属性 `structuredOutputMode`，删除请求的模式匹配校验和按模式分支。 | 用省略模式的 Profile 验证 Goal 创建、切换和恢复，核对实际请求端点及共享 Adapter。检查目标工厂、Adapter 接口和请求构造均已移除旧模式依赖。 |
| R1.2 | S1 | 事件 | Think 或 Decide 构造请求 | Think 请求纯文本，其结果保持为 `system_request_think` 的工具结果。Decide 发送本轮可见工具及参数 Schema，并设置 `tool_choice: "auto"`。两阶段均省略顶层输出 Schema、`parallel_tool_calls` 和 `stream_options.include_usage`。Decide 省略工具声明的 `strict` 字段。 | 本地 Chat Completions 服务器捕获两阶段请求，检查字段、工具可见范围和 Think 结果回传。 |
| R2.1 | S2 | 状态 | 流收到正文、reasoning 或函数调用增量 | 按块首次出现的顺序交付增量，按供应商调用索引组装工具调用。封口块保留原始工具名、ID 和参数字符串。`reasoning_content` 与 `thought` 保留来源差异。用量只记录网关实际返回的有效值。 | 本地 SSE 测试覆盖交错块、晚到 ID、分片参数、两种推理字段及有无用量尾部。 |
| R2.2 | S2 | 事件 | 流正常消费结束且收到明确的 `stop` 或 `tool_calls`，所需内容均已封口 | 交付唯一 `completed`，保留原始结束原因。`stop` 搭配完整工具调用可以进入 Decide 校验，`tool_calls` 必须带工具调用块。 | SSE 终态测试覆盖 `stop` 加正文、`stop` 加工具、`tool_calls` 加工具、`tool_calls` 缺工具及重复或冲突终态。 |
| R2.3 | S2 | 异常 | 网关明确拒绝、内容过滤、达到 token 上限，或流缺少终态、被取消或违反协议 | 分别记录拒绝、过滤、截断、响应不完整、取消或协议错误。工具执行次数为零，已发布片段仅供观察，明确拒绝、过滤和耗尽直接报告。 | SSE 与 Runner 联测逐项断言终态和零执行，包含参数已拼成合法 JSON 但流缺少终态的情况。 |
| R2.4 | S2 | 异常 | 模型调用发生已分类的暂时传输故障 | 由 Runtime 按现有预算重试。Adapter 传播故障并释放流，单次调用只发一次请求。 | 注入传输错误，分别核对 Adapter 请求数、迭代器释放和 Runtime 重试上限。 |
| R3.1 | S3 | 异常 | 完整的 Decide 回复只有正文 | 产生 `NO_USABLE_RESULT`，从已提交历史追加纠正反馈后重试。原回复留在生成记录。 | 截获重试请求，核对纠正消息、零执行及原回复未作为 assistant 回合发送。 |
| R3.2 | S3 | 异常 | Decide 一轮返回多个工具调用 | 拒绝整轮，产生 `multiple_tool_calls` 纠正反馈，工具执行次数为零。重试请求只追加反馈。 | 本地流夹具返回两个业务调用，断言零执行和重试请求，再用单调用验证可继续。 |
| R3.3 | S3 | 异常 | Decide 的单个工具调用无法通过现有工具声明、参数或阶段契约校验 | 返回可定位的纠正反馈，工具执行次数为零。校验通过且满足现有授权条件的调用才可执行。 | Runner 集成测试覆盖非法 JSON、缺失必填参数、未声明工具及合法调用的授权路径。 |
| R3.4 | S3 | 异常 | 工具块封口时仍缺网关原始调用 ID | 报告缺失调用 ID 的协议错误，工具执行次数为零。 | SSE 测试对比晚到有效 ID 和始终缺失 ID，校验失败场景没有生成可回放调用。 |
| R4.1 | S4 | 事件 | Decide 的单个调用已结算且已提交，Goal 在同身份下继续或重启 | 从已提交的共享内容块回放 assistant 消息，原样回传调用 ID、工具名、参数字符串和 `reasoning_content`，并发送按原始 ID 配对的工具结果。`thought` 保留在生成记录，首批回放字段以 `reasoning_content` 为准。 | 使用真实持久化创建并重启 Runner，捕获后续请求，逐字段比对响应与回放，并核对重启没有再次执行已结算工具。 |
| R4.2 | S4 | 状态 | 工具交换尚未结算或提交，或者回放身份不同 | 原生回放只取当前同身份、已结算且已提交的交换。身份切换后用语义历史重建上下文，保留当前 Goal 的已提交事实。 | 恢复测试覆盖未结算交换和身份变更，核对请求中无不完整调用对和旧身份的 reasoning。 |

组合：用本地 SSE 夹具依次覆盖纯文本纠正、合法工具调用、持久化和重启，截获重启后首次请求并核对原始调用与工具结果。再用用户指定 Profile 和隔离测试 Goal 验证真实端点接受重启后的续接请求。运行 `npm test`、`npm run check:dependencies`、`npm run check:docs` 和 `npm run contracts:generate -- --check`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| `model-contracts` 持有共享对话内容块，`llm-core` 用它表达流封口结果。目标路径的请求历史和持久化复用封口块，正文和工具列表按需派生。 | 共享同一份有序数据可保留生成原文和端点续接字段。 | 独立维护扁平 assistant 字段和回放所需的正文、reasoning 或调用副本。 |
| `openai-compatible` 常规 Goal 按协议装配，Adapter 根据本次请求声明的生成约束构造供应商参数。沿用 [内容块流](../model-output-streaming/spec.md) 和工具声明契约。 | Think 和 Decide 使用同一连接，Decide 的接受条件由 Runtime 阶段决定。 | 按旧模式切换原生 Adapter 与 pi-ai，或沿用历史 [原生工具调用需求](../native-tool-calling-architecture/requirements.md#req-3-1) 对目标路径强制 `required` 和 `strict: true` 的规则。 |
| 目标路径用现有内容块流收集器取得完整响应，Adapter 归一化真实终态，阶段解码和 Runtime 保持现有授权与执行职责。 | 结束原因、工具是否合法和工具是否获准执行各有独立证据。 | 根据 EOF、部分 JSON 或是否出现过工具索引推断可执行结果。 |
| Runtime 以已提交轨迹和工具结算为回放来源，使用 `provider + endpoint + model + protocol` 核对原生身份。完成审查及其他 Goal 内控制阶段保有各自的输出契约。 | 请求重建可以复用现有历史装配与恢复边界。 | 把失败尝试、未结算调用或跨身份原生状态作为下一轮原生历史。 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| medium | Adapter、阶段绑定和轨迹结构跨模块变更，恢复验证需覆盖同身份、跨身份及未提交边界。 | 使用隔离测试数据验证当前持久化格式。开发期旧数据按仓库现行兼容政策处理。 |
| medium | 原生 reasoning 含供应商回放数据，真实端点验收需要使用配置内凭据并产生模型请求。 | 保持现有受限可见性和诊断过滤。真实验收使用指定 Profile，验收证据仅记录可公开的结果。 |

## 任务

- [ ] //TODO 1. 按协议为常规 Goal 绑定 OpenAI-compatible，并将请求约束移入阶段 → R1.1、R1.2；检查：Profile 装配与请求捕获基础测试。
- [ ] //TODO 2. 用共享内容块封口 OpenAI-compatible 流并归一化结束和失败 → R2.1、R2.2、R2.3、R2.4、R3.4；检查：本地 SSE 基础测试。
- [ ] //TODO 3. 在执行前落实 Decide 单调用校验和纠正反馈 → R3.1、R3.2、R3.3；检查：零调用、双调用和非法参数的基础测试。
- [ ] //TODO 4. 用同一份封口块持久化并重建已结算交换 → R4.1、R4.2；检查：当前轨迹格式与回放投影基础测试。
- [ ] //TODO 5. 同步受影响模块的公开契约、概览和语义说明 → R1.1、R2.2、R4.1；检查：`npm run check:docs`。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无

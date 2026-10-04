# Contracts 模块

## 职责

`@lazygoal/contracts` 提供零出站依赖的 Contract AST、运行时 Parser、JSON Schema 2020-12 编译器和 Agent 模型输出契约。它只描述输入/输出形状，不执行 Tool、不读取 Goal、不拥有审批或持久化状态。

## Tool 输入契约

每个 Tool 通过 `ToolDefinition.inputContract` 声明唯一输入事实源。Runtime 使用同一 AST 生成模型可见 Schema，并在执行前 `safeParse` 与领域 `validate`；模型不能通过输出额外字段或自报结果绕过校验。

`isReadOnly` 是审批前能力过滤的显式声明。它只说明 Tool 是否可以在任务未批准时被模型调用，实际执行仍必须经过 Profile、Registry 和 Policy。

## Agent 输出契约

[`createModelOutputContractBundle`](../../packages/contracts/src/model-output/factory.ts) 为每个请求生成不可变的 Canonical/Wire/strict Schema/Shape Guide/解码器组合。统一 `executing` 请求根据任务批准状态、后端 Plan Mode 和授权 Tool 动态生成分支：

- 未批准任务：`ask_user`、`task_proposal`、`context_lookup`、`tool_discovery` 和只读 `tool_call`；
- 已批准任务：`ask_user`、`context_lookup`、`tool_discovery`、全部授权 `tool_call`、`complete`、`wait` 和 `fail`；
- Plan Mode：在对应任务分支额外加入 `goal_plan_update`；普通模式不暴露该分支；
- Context Checkpoint 是独占的当前协议分支。

Canonical Contract 面向 Runtime 领域；Wire Contract 将 optional 字段投影为 required-nullable，适配 strict Provider；解码器移除可逆的占位 null，再按原始输入 Contract 复验 Tool 输入。分支、工具 ID 和 Contract 定义错误在构造期失败。Executing 输出校验失败时，解码器通过已知 `kind` 与授权 `toolId` 唯一定位分支，再以同一 envelope 生成字段级诊断；未知或不唯一的分支保留整体错误。该诊断不修正输入，也不改变契约接受范围。

## 当前模型决策

`AgentDecision` 的当前稳定分支为：

- `ask_user`：带模式、问题、request ID 由 Runtime 生成的交互请求；
- `task_proposal`：目标、完成条件、批准提示和可选 Memory Patch；
- `tool_call`：带工具 ID 与 JSON 输入；
- `context_lookup`：历史上下文查询；
- `tool_discovery`：按关键词查询 Runtime 提供的当前授权工具目录；结果只用于后续 Schema 可见性，不授予执行权限；
- `complete`、`wait`、`fail`：执行终态或等待。
- `goal_plan_update`：Plan Mode 下的结构化 GoalPlan 增量提案；Runtime reducer 负责 ID、revision、状态转换和原子持久化。

模型不能提交 Goal/Run/Step/Epoch/Action ID 或自行分配新 Todo ID，也不能把用户回答或模型自述变成完成 Evidence。Runtime 负责最终语义校验和状态转换。

## 相关入口

- [AST 与 Parser](../../packages/contracts/src)：输入契约、递归 JSON 值和运行时错误。
- [Canonical 输出](../../packages/contracts/src/model-output/canonical.ts)：领域决策与 Task/Memory 类型。
- [Wire 输出](../../packages/contracts/src/model-output/wire.ts)：Provider 适配的 strict 形状。
- [Factory](../../packages/contracts/src/model-output/factory.ts)：按当前请求生成契约包。

[model-conversation.ts](../../packages/contracts/src/model-conversation.ts) 定义跨 LLM、Runtime 和 Storage 的统一文本、assistant 调用及 tool result 消息，以及绑定供应商身份的最小续接字段。它只拥有可序列化表示和边界校验，不执行工具、不保存对话、不解释 Gemini 签名；调用动作仍经既有 Contract AST 解码。

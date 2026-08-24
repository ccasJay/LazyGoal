# 模型上下文裁剪需求

## 引言

本功能在每轮模型请求前按字符预算裁剪真实 Conversation 的模型输入投影，限制长 Goal 的上下文增长，同时保持 Runtime State、Storage Snapshot、PromptContext 与 Working Context 完整，并为后续上下文压缩能力保留演进空间。

## 需求

### 需求 1：按字符预算选择 Conversation

**用户故事：** 作为长时间运行 Goal 的使用者，我希望发送给 LLM 的 Conversation 受到字符预算约束，以便历史消息持续增长时仍能构造可控的模型请求。

#### 验收标准

1. <a id="req-1-1"></a> 当系统构造任一阶段的模型请求时，系统必须使用当前配置的字符预算选择本轮可见的 Conversation。
2. <a id="req-1-2"></a> 当完整 Conversation 的内容字符总数不超过预算时，系统必须保持所有消息的内容、角色与顺序不变。
3. <a id="req-1-3"></a> 当完整 Conversation 超过预算时，系统必须优先保留时间较新的完整单元，并从最旧的完整单元开始丢弃。
4. <a id="req-1-4"></a> 当某个较新的完整单元无法在剩余预算内整体保留时，系统不得跳过该单元再选择更旧单元。
5. <a id="req-1-5"></a> 当裁剪完成时，所有被保留消息必须维持其原始相对顺序。

### 需求 2：保持上下文单元完整

**用户故事：** 作为模型推理结果的使用者，我希望裁剪只发生在完整上下文单元之间，以便模型不会收到被截断且语义残缺的消息片段。

#### 验收标准

1. <a id="req-2-1"></a> 当当前 Conversation 被划分为可裁剪单元时，每个从 user 消息开始并包含其后连续 assistant 回复的完整交互必须作为一个不可分割单元。
2. <a id="req-2-2"></a> 当系统执行裁剪时，不得截断单条消息内容，也不得只保留完整单元中的部分消息。
3. <a id="req-2-3"></a> 当最新完整单元自身超过字符预算时，系统必须完整保留该单元，并允许本轮 Conversation 超过软预算。
4. <a id="req-2-4"></a> 当本轮存在由 `pendingAction` 表示的未完成执行单元时，系统必须完整保留该执行单元及其当前状态，不得将其计入 Conversation 裁剪候选。

### 需求 3：隔离模型输入与持久化事实

**用户故事：** 作为可恢复 Goal 的使用者，我希望裁剪只影响单轮模型输入，以便完整会话仍能持久化、恢复并供后续重新投影。

#### 验收标准

1. <a id="req-3-1"></a> 当系统裁剪 Conversation 时，不得修改 Goal 的真实消息、Runtime State 或已保存 Snapshot。
2. <a id="req-3-2"></a> 当 Goal 保存或恢复时，Snapshot 必须继续包含裁剪前的完整真实消息历史。
3. <a id="req-3-3"></a> 当同一 Goal 在相同字符预算下重复构造模型输入时，系统必须产生字符级一致的 Conversation 投影。
4. <a id="req-3-4"></a> 当 Goal 跨进程恢复后再次构造模型输入时，系统必须从恢复出的完整消息历史重新执行裁剪，不得依赖上一次进程中的临时裁剪结果。
5. <a id="req-3-5"></a> 当本功能启用时，系统不得仅因 Conversation 裁剪而改变 Goal Snapshot 的结构版本或新增持久化摘要。

### 需求 4：提供可覆盖的默认预算

**用户故事：** 作为 LazyGoal 部署者，我希望 Conversation 预算具有适合 256k Context Window 的默认值且可以按模型调整，以便无需修改代码即可控制上下文规模。

#### 验收标准

1. <a id="req-4-1"></a> 当调用方未提供 Conversation 字符预算时，系统必须使用 `196608` 个字符作为默认预算。
2. <a id="req-4-2"></a> 当 `LLM_CONVERSATION_CHAR_BUDGET` 提供合法正整数时，系统必须使用该值覆盖默认预算。
3. <a id="req-4-3"></a> 当 `LLM_CONVERSATION_CHAR_BUDGET` 缺失或只包含空白时，系统必须继续使用默认预算。
4. <a id="req-4-4"></a> 当 `LLM_CONVERSATION_CHAR_BUDGET` 已提供但不是安全正整数时，系统必须在创建、恢复或修改任何 Goal 以及调用 LLM Adapter 前返回稳定配置错误。

### 需求 5：保持现有模型与执行协议

**用户故事：** 作为 LazyGoal 维护者，我希望上下文裁剪不改变现有 Prompt、阶段协议和执行状态机，以便该能力可以独立接入现有模型调用链。

#### 验收标准

1. <a id="req-5-1"></a> 当系统在 `gathering_context`、`planning` 或 `executing` 阶段构造请求时，所有阶段必须使用同一预算与完整单元选择规则。
2. <a id="req-5-2"></a> 当 Conversation 被裁剪时，system 消息、PromptContext、Authorized Tools 与 Working Context 的内容及顺序必须保持现有语义。
3. <a id="req-5-3"></a> 当默认裁剪过程执行时，系统不得为生成摘要或选择消息而发起额外 LLM 请求。
4. <a id="req-5-4"></a> 当裁剪后的请求获得模型响应时，系统必须继续使用当前阶段的严格 PreparationResult 或 AgentDecision 协议解析响应。
5. <a id="req-5-5"></a> 当 Goal 经历 Action 审批、中断、恢复或终态转换时，Conversation 裁剪不得改变既有状态转换、Step 计数、Tool 授权或 Action 重放语义。

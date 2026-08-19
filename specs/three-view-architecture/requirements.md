# 三视图分层架构需求

## 引言

本功能将 Goal/Session 数据明确区分为 Runtime State、Storage Snapshot 与 LLM Input View，并以 Runtime State 作为领域真相；重构必须保持当前非 Legacy v3 Goal 的执行行为、模型请求语义和持久化连续性，同时删除旧执行协议及旧 Goal Snapshot 兼容，不包含 BashTool、Context 截断、Trajectory、外部日志或历史快照能力。

## 需求

### 需求 1：纯粹的 Runtime State

**用户故事：** 作为 Runtime 维护者，我希望内存领域状态只表达 Goal/Session 的当前业务事实，以便状态转换不受文件协议、模型请求或进程资源影响。

#### 验收标准

1. <a id="req-1-1"></a> 当系统创建或恢复 Goal 时，提供给领域转换的 Runtime State 必须包含推进当前 Goal/Run 生命周期所需的完整业务状态。
2. <a id="req-1-2"></a> 当 Runtime State 参与状态转换时，其中不得包含 Snapshot 版本、文件表示或旧协议迁移控制数据。
3. <a id="req-1-3"></a> 当一次执行携带 `AbortSignal`、瞬时 Action 授权、Registry、Policy、Adapter 或 Store 实例时，这些进程资源不得成为 Runtime State 的组成部分。
4. <a id="req-1-4"></a> 对于重构前后语义等价的 Runtime 输入，系统必须产生等价的状态转换结果、Step 计数和终态原因。
5. <a id="req-1-5"></a> 当调用方使用 Runtime 公共执行协议时，系统不得再暴露或接受 `LegacyStepExecutor`、旧 `StepResult` 执行结果或 `legacy StepRecord`。

### 需求 2：当前 Storage Snapshot 协议

**用户故事：** 作为当前 Goal 的使用者，我希望架构重构后仍能恢复和保存严格的非 Legacy v3 Session，同时明确拒绝已删除的旧协议，以便持久化边界保持清晰。

#### 验收标准

1. <a id="req-2-1"></a> 当系统读取合法且不含 Legacy 数据的当前 v3 Goal Snapshot 时，必须将其恢复为语义等价的 Runtime State。
2. <a id="req-2-2"></a> 当系统读取 v1、v2 或包含 `legacy StepRecord` 的 v3 Goal Snapshot 时，必须返回可识别的 Snapshot 协议错误，且不得改写原文件。
3. <a id="req-2-3"></a> 当系统保存当前 Runtime State 时，生成的 Snapshot 必须符合现有严格 v3 结构与跨字段不变量，并能在新进程中恢复为等价状态。
4. <a id="req-2-4"></a> 如果 Snapshot 包含未知版本、非法字段、损坏结构或不成立的状态组合，系统必须继续返回可识别的 Snapshot 协议错误。
5. <a id="req-2-5"></a> 当 Snapshot 保存成功或失败时，原子替换、临时文件清理和底层文件系统错误传播语义必须与重构前保持等价。

### 需求 3：AgentProfile 持久化兼容

**用户故事：** 作为 Profile 使用者，我希望 Profile 的文件存储与 Runtime 配置语义相互隔离，以便存储实现迁移后仍能安全启动 Goal。

#### 验收标准

1. <a id="req-3-1"></a> 当系统读取现有合法 AgentProfile JSON 时，必须产生与重构前语义等价的 Runtime Profile。
2. <a id="req-3-2"></a> 如果 AgentProfile 文件缺失、JSON 损坏、违反 Schema 或引用未注册 Tool，系统必须在创建 Goal 前保持现有可识别失败与无 Snapshot 副作用语义。
3. <a id="req-3-3"></a> 当 Runtime 使用已加载 Profile 时，不得依赖 Profile 的文件路径、文件格式或解码器状态。

### 需求 4：完整且独立的 LLM Input View

**用户故事：** 作为 Agent 维护者，我希望每次模型推理只接收从 Runtime State 明确投影的输入视图，以便模型上下文可以独立演进且不会泄漏无关状态。

#### 验收标准

1. <a id="req-4-1"></a> 当系统准备一次模型推理时，LLM Input View 必须明确包含该轮所需的 Profile 指令、真实会话投影、Working Context 与已授权 Tool 描述。
2. <a id="req-4-2"></a> 对于重构前后语义等价且属于当前受支持协议的 Goal，最终发送给 LLM Adapter 的消息角色、内容和顺序必须保持等价。
3. <a id="req-4-3"></a> 当系统生成 LLM Input View 时，该视图不得包含 Snapshot 版本、迁移标记或瞬时执行资源。
4. <a id="req-4-4"></a> 当系统构造或渲染 LLM Input View 时，不得修改 Runtime State、真实消息历史或持久化 Snapshot。
5. <a id="req-4-5"></a> 当 LLM 返回原始响应时，只有通过现有严格协议解析得到的 `PreparationResult` 或 `AgentDecision` 才能进入 Runtime 控制边界。

### 需求 5：跨视图转换边界

**用户故事：** 作为架构维护者，我希望三个视图之间只能通过受验证的转换边界交换数据，以便任一视图的内部变化不会自动传播到其它视图。

#### 验收标准

1. <a id="req-5-1"></a> 当 Storage Snapshot 恢复为 Runtime State 时，系统必须执行版本校验、迁移和领域数据转换，不得把持久化 DTO 直接交给 Transition、Runner 或 Coordinator。
2. <a id="req-5-2"></a> 当 Runtime State 被持久化时，系统必须先转换并验证 Storage Snapshot，不得把内存领域对象直接作为未经校验的文件内容写出。
3. <a id="req-5-3"></a> 当 Runtime State 被投影为 LLM Input View 时，模型侧类型不得直接复用 Runtime 的聚合或嵌套执行状态类型。
4. <a id="req-5-4"></a> 如果某个视图新增仅属于自身的数据，该数据不得在没有明确转换契约的情况下出现在其它视图。

### 需求 6：公共能力归属与组合

**用户故事：** 作为 LazyGoal 集成者，我希望领域 Port 与具体持久化实现具有稳定且可辨识的归属，以便替换 Store 时不反向耦合 Runtime。

#### 验收标准

1. <a id="req-6-1"></a> 当调用方只需要领域编排或自定义持久化实现时，必须能够仅依赖 Runtime 提供的 Goal、Profile 与持久化 Port 契约。
2. <a id="req-6-2"></a> 当调用方需要内存或 JSON 文件持久化实现时，必须从独立的 `@lazygoal/storage` 公共入口获得对应实现与持久化协议能力。
3. <a id="req-6-3"></a> 当应用组合 Runtime、Storage 与 Agent 时，Runtime 不得反向加载具体 Storage 或 Agent 实现。
4. <a id="req-6-4"></a> 当现有 TUI 启动、创建、恢复或继续 Goal 时，其用户可见结果和错误行为必须与重构前保持等价。

### 需求 7：执行与恢复回归

**用户故事：** 作为 LazyGoal 使用者，我希望分层重构不改变 Goal 的运行与恢复结果，以便后续功能可以建立在稳定行为上。

#### 验收标准

1. <a id="req-7-1"></a> 当 Goal 经历 Preparation、任务批准、Executing、Tool Action/Observation 和终态决策时，阶段所有权与合法转换必须保持不变。
2. <a id="req-7-2"></a> 当 Runner 执行具有外部副作用的 Action 时，`pendingAction` 先保存、Tool 后执行、Observation 再保存的顺序必须保持不变。
3. <a id="req-7-3"></a> 当进程在 Action 生命周期中断并恢复时，原 `actionId`、safe/manual 重放语义和瞬时授权规则必须保持不变。

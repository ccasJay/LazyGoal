# Tool 输出安全与搜索工具选择优化需求

## 引言

当 Agent 使用 Bash 递归搜索仓库时，依赖目录中的 source map 或其他单行大文件
可能在结果截断前耗尽 Node 子进程的 `maxBuffer`，导致 Tool 执行异常、Action
进入 `outcome_unknown`，并中断 Goal 推进。本功能通过 Prompt 版本化和 BashTool
流式输出收集，降低 Agent 选择高风险搜索命令的概率，并使超大 stdout/stderr
不会突破运行时内存边界；既有 Observation、Goal Snapshot、Runner 和 Action
恢复协议保持不变。

## 需求

### 需求 1：Prompt 版本兼容

**用户故事：** 作为 Goal 使用者，我希望搜索行为的 Prompt 规则随 Goal 创建时的版本
保持稳定，以便升级后已有 Goal 恢复时不会意外改变工作方式。

#### 验收标准

1. <a id="req-1-1"></a> 当创建新的 Goal 时，系统必须冻结并使用 Tool 输出安全 Prompt v3。
2. <a id="req-1-2"></a> 当恢复绑定 v1 或 v2 的已有 Goal 时，系统必须继续使用对应的原 Prompt，且其渲染字符保持不变。
3. <a id="req-1-3"></a> 当恢复绑定 v3 的 Goal 时，系统必须使用 v3 的 executing 搜索工具选择规则。
4. <a id="req-1-4"></a> 如果 Goal 引用系统不支持的 Prompt 版本，系统必须在调用 LLM 前失败，且不得回退到其他版本。

### 需求 2：专用 Tool 优先与 Bash 回退

**用户故事：** 作为 Goal 使用者，我希望 Agent 优先使用当前已授权且用途明确的专用
Tool，只有在专用能力不足时才回退到通用 Bash，以便减少无界输出和不必要的命令副作用。

#### 验收标准

1. <a id="req-2-1"></a> 当当前 Profile 授权了能够直接完成目标子任务的专用 Tool 时，v3 executing Prompt 必须要求 Agent 优先使用该 Tool，而不是使用 Bash 重实现相同能力。
2. <a id="req-2-2"></a> 当任务需要仓库文本搜索且当前 Profile 授权 `grep` Tool 时，`grep` 必须被视为该子任务的优先专用 Tool。
3. <a id="req-2-3"></a> 当没有适用的专用 Tool，或任务确实需要 shell 组合、系统命令或专用 Tool 无法表达的能力时，Agent 才可以选择 Bash。
4. <a id="req-2-4"></a> 当 Agent 选择 Bash 执行仓库搜索时，v3 executing Prompt 必须要求其缩小搜索路径，并排除 `node_modules`、`.git`、`.lazygoal`、生成文件和 source map。
5. <a id="req-2-5"></a> 当 Agent 使用 Bash 搜索时，v3 executing Prompt 必须要求输出限制不能只依赖按行截取，而应使用有界的字节或等价输出策略。
6. <a id="req-2-6"></a> 系统不得通过分析或改写 Bash 命令文本来替换 Agent 的选择；实际 Tool 授权仍由现有 Runtime 边界强制执行。

### 需求 3：Bash 输出有界收集

**用户故事：** 作为 Runtime 维护者，我希望 BashTool 在命令产生超大输出时仍能有界地
收集结果，以便单个命令不会因 Node `maxBuffer` 溢出而异常终止。

#### 验收标准

1. <a id="req-3-1"></a> 当 Bash 命令产生 stdout 或 stderr 时，系统必须持续消费两个输出流，并且不得依赖会在截断前因固定 `maxBuffer` 失败的完整字符串收集方式。
2. <a id="req-3-2"></a> 当任一输出流超过现有输出预算时，系统必须只保留该流的尾部有效负载，并沿用现有省略标记表达被丢弃的前缀。
3. <a id="req-3-3"></a> 当输出超过预算但命令尚未退出时，系统必须继续让命令运行并消费其输出，不得仅因输出量达到预算而主动终止命令。
4. <a id="req-3-4"></a> 当 stdout/stderr 含有多字节 UTF-8 字符且需要截断时，系统必须返回合法文本，不得产生损坏的字符编码。
5. <a id="req-3-5"></a> 输出收集过程的内存占用必须随输出预算有界增长，不得随命令总输出量持续增长。

### 需求 4：命令生命周期与错误语义

**用户故事：** 作为 Runner 维护者，我希望输出收集实现升级后仍遵循既有命令结果和中止
语义，以便不会改变 Action、Observation 或恢复状态机的行为。

#### 验收标准

1. <a id="req-4-1"></a> 当命令以退出码 0 完成时，BashTool 必须返回现有形状的 `success` Observation，并提供截断后的 stdout/stderr。
2. <a id="req-4-2"></a> 当命令以非零退出码完成时，BashTool 必须返回现有形状的 `COMMAND_FAILED` failure Observation，并保留截断后的诊断输出。
3. <a id="req-4-3"></a> 当命令超过允许时限时，BashTool 必须返回现有形状的 `COMMAND_TIMEOUT` failure Observation。
4. <a id="req-4-4"></a> 当共享中止信号触发时，BashTool 必须继续抛出 `ExecutionAbortedError`，不得将中止伪装成 Observation。
5. <a id="req-4-5"></a> 当 shell 启动或其他基础设施初始化失败时，BashTool 必须传播基础设施异常，Runner 的现有 `TOOL_EXECUTION_ERROR` 与 `outcome_unknown` 处理不得改变。
6. <a id="req-4-6"></a> BashTool 必须继续声明 `manual` replay policy；本功能不得修改 Action 审批、恢复或重放规则。

### 需求 5：协议与兼容边界不变

**用户故事：** 作为 LazyGoal 维护者，我希望本功能只改善输入和输出的安全边界，
以便现有 Goal 数据和 Runtime 协议无需迁移。

#### 验收标准

1. <a id="req-5-1"></a> 系统不得新增 `ToolObservation` 的结构化截断字段；截断状态必须继续通过 stdout/stderr 的现有省略标记表达。
2. <a id="req-5-2"></a> 系统不得修改 Goal Snapshot、Run、Action、Observation 或 Runner 的公共协议。
3. <a id="req-5-3"></a> 当恢复 v1/v2 Goal 时，系统必须保持原有消息顺序、工作流阶段、Step 计数和执行策略。
4. <a id="req-5-4"></a> 当 v3 Prompt 只替换 executing 规则时，v3 必须继续复用现有 Global、Profile、gathering_context、planning 和 Authorized Tools 的输入协议。

### 需求 6：自动化回归验证

**用户故事：** 作为项目维护者，我希望超大输出和 Prompt 兼容性由自动化测试锁定，
以便后续修改不会重新引入本次失败。

#### 验收标准

1. <a id="req-6-1"></a> 当测试执行单行超过 1 MB 的 stdout 时，系统必须完成命令并返回截尾结果，而不得抛出 `stdout maxBuffer length exceeded`。
2. <a id="req-6-2"></a> 当测试同时产生大量 stdout 与 stderr 时，系统必须验证两个流均有界且尾部内容保留。
3. <a id="req-6-3"></a> 当测试覆盖正常退出、非零退出、超时、中止、UTF-8 截断和 shell 启动失败时，既有错误码与异常语义必须全部保持。
4. <a id="req-6-4"></a> 当测试渲染 Prompt Bundle 时，v1/v2 必须通过字符级兼容断言，v3 必须包含搜索工具选择与输出限制规则。
5. <a id="req-6-5"></a> 当运行相关 workspace 测试、TypeScript 类型检查、依赖边界检查和完整测试套件时，系统必须全部通过。

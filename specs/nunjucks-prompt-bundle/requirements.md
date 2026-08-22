# Nunjucks Prompt Bundle 需求

## 引言

本功能通过集中的 Nunjucks 渲染能力，在每轮模型请求时组合由各业务所有者维护的 Prompt，并以版本化 Prompt Bundle 冻结这一组合，同时保持 Goal 恢复语义和 Runtime 强制边界不变。

## 需求

### 需求 1：运行时组合完整 Prompt Bundle

**用户故事：** 作为 LazyGoal 维护者，我希望 system prompt 通过统一渲染入口组合就近维护的业务 Prompt，以便共享渲染基础设施而不混淆各类 Prompt 的业务所有权。

#### 验收标准

1. <a id="req-1-1"></a> 当系统为任一 LLM 阶段构造请求时，系统必须根据 Goal 冻结的 Prompt Bundle 组合已注册的业务 Prompt，并生成唯一一条 system 消息。
2. <a id="req-1-2"></a> 当 system 消息生成时，其内容必须依次包含 Global Overview、冻结 Profile、当前 Phase Protocol 与 Authorized Tools。
3. <a id="req-1-3"></a> 当 Goal 分别处于 `gathering_context`、`planning` 或 `executing` 时，系统必须使用同一 Bundle 中对应阶段的协议，并共享该 Bundle 的 Global Overview。
4. <a id="req-1-4"></a> 当完整模型请求生成时，消息顺序必须保持为 system 消息、真实 Conversation、当前 Working Context，且后两者不得作为 Nunjucks 模板执行。
5. <a id="req-1-5"></a> 当 Prompt Bundle 被定义时，Bundle 必须显式声明参与组合的模板及其渲染顺序，模板注册顺序不得改变最终组成。

### 需求 2：冻结并恢复整个 Prompt Bundle 版本

**用户故事：** 作为可恢复 Goal 的使用者，我希望 Goal 恢复后继续使用创建时的完整 Prompt Bundle，以便暂停前后的模型契约保持稳定。

#### 验收标准

1. <a id="req-2-1"></a> 当新 Goal 创建时，系统必须冻结当时生效的 Prompt Bundle 版本。
2. <a id="req-2-2"></a> 当 Goal 被保存并恢复时，系统必须原样保留其 Prompt Bundle 版本。
3. <a id="req-2-3"></a> 当系统当前默认 Bundle 版本在 Goal 创建后发生变化时，恢复该 Goal 仍必须使用原冻结版本，不得自动升级或回退。
4. <a id="req-2-4"></a> 当新增受支持的 Prompt Bundle 版本时，现有 Goal Snapshot 的结构版本不得仅因该新增版本而升级。

### 需求 3：隔离可信模板与运行时数据

**用户故事：** 作为 LazyGoal 维护者，我希望只有内置 Prompt Bundle 能作为模板执行，以便 Profile 和动态输入不能改变模板控制结构。

#### 验收标准

1. <a id="req-3-1"></a> 当系统选择 Prompt Bundle 时，只有 LazyGoal 提供并由业务模块注册的模板才能被执行。
2. <a id="req-3-2"></a> 当 Profile 文本、Profile Instructions 或 ToolDefinition 包含 Nunjucks 语法时，系统必须将其作为普通文本或数据插入，不得再次解析为模板。
3. <a id="req-3-3"></a> 当 Conversation 或 Working Context 包含 Nunjucks 语法时，系统必须保持其原始内容，不得执行其中的表达式或标签。

### 需求 4：渲染结果确定且失败明确

**用户故事：** 作为 Prompt 维护者，我希望相同输入产生稳定输出且配置错误立即暴露，以便通过自动化测试审查 Prompt 行为。

#### 验收标准

1. <a id="req-4-1"></a> 当相同 Prompt Bundle 版本和相同运行时输入被重复渲染时，系统必须生成字符级一致的 system 消息。
2. <a id="req-4-2"></a> 当 Profile Instructions 或 Authorized Tools 为空时，系统必须生成明确且稳定的空值表示，不得因缺失内容改变其余区块顺序。
3. <a id="req-4-3"></a> 当 Bundle 版本不受支持、模板缺失或必需变量未定义时，系统必须在调用 LLM Adapter 前失败，且不得回退到其他 Bundle。
4. <a id="req-4-4"></a> 当 Prompt 渲染失败时，系统不得发起任何模型请求。
5. <a id="req-4-5"></a> 当模板来源使用不同平台的换行形式时，system 消息必须统一使用 LF（`\n`），不得因运行平台产生字符差异。

### 需求 5：通过不可变 PromptContext 隔离 Runtime

**用户故事：** 作为 LazyGoal 维护者，我希望模板渲染只读取从 Runtime 投影出的不可变 PromptContext，以便模型输入与领域状态保持隔离。

#### 验收标准

1. <a id="req-5-1"></a> 当系统准备渲染 Prompt 时，系统必须从当前 Runtime State 投影出独立的 immutable PromptContext DTO，且该 DTO 只能包含本轮渲染所需的数据。
2. <a id="req-5-2"></a> 当 Prompt Bundle 被渲染时，Renderer 必须只读取 PromptContext，不得修改 Goal、真实消息历史、PromptContext 或已保存 Snapshot。
3. <a id="req-5-3"></a> 当模型请求未授权 Tool 或提供非法 Tool 输入时，系统必须继续按现有 Tool 授权与输入校验规则拒绝该请求，Prompt 内容不得授予权限。
4. <a id="req-5-4"></a> 当模型响应不符合当前阶段的 PreparationResult 或 AgentDecision 协议时，系统必须继续按现有严格响应 Schema 拒绝该响应。

### 需求 6：消除动态输入中的非确定性

**用户故事：** 作为 Prompt 测试维护者，我希望动态数据与模板选择遵循稳定规则，以便 Prompt 的字符级结果可以跨注册顺序、运行时间和环境重复验证。

#### 验收标准

1. <a id="req-6-1"></a> 当 Authorized Tools 参与渲染时，系统必须按 Tool ID 的稳定升序输出，Tool 注册或输入顺序不得改变 system 消息。
2. <a id="req-6-2"></a> 当 PromptContext 被投影时，系统不得自动加入当前时间、随机值、进程环境或其他未由 Runtime State 明确提供的非确定性数据。
3. <a id="req-6-3"></a> 当系统动态选择业务模板时，选择结果必须只由冻结的 Bundle Manifest 与当前 Phase 决定，不得依赖模板注册顺序、运行环境或运行时数据构造任意模板名称。

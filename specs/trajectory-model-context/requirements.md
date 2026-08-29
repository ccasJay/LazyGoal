# Trajectory Model Context 需求

## 引言

本功能为采用结构化 Working Memory 的 Goal 组装有界模型输入：以近期完整执行单元形成 Hot Context，以结构化有损条目形成 Warm Compact，并以可丢弃 Sidecar 加速恢复。它不修改权威 Trajectory、Goal Snapshot 或 Working Memory，也不包含 Cold Trajectory 的按需检索协议。

## 需求

### 需求 1：组装来源分离的模型上下文

**用户故事：** 作为长任务使用者，我希望模型同时看到当前任务、执行状态、工作记忆和必要历史，以便连续工作而不混淆事实来源。

#### 验收标准

1. <a id="req-1-1"></a> 当结构化协议 Goal 发起模型调用时，系统必须从当前 Goal Task、Runtime execution projection、Conversation、Working Memory、Hot Context 和 Warm Compact 组装本轮输入。
2. <a id="req-1-2"></a> 当系统选择 Hot 或 Warm 内容时，只能使用当前 Goal/Run 中不超过 Snapshot 提交边界的来源，不得包含未提交 tail。
3. <a id="req-1-3"></a> 当 Task、previousStep、pending Action 或活跃 Blocker 已由其权威投影提供时，系统不得在 Hot 或 Warm 层重复注入同一控制信息。
4. <a id="req-1-4"></a> 当系统完成上下文选择或 Compact 时，不得改写 Goal、Conversation、Working Memory、Snapshot 或原始 Trajectory。

### 需求 2：按完整模型输入预算分配上下文

**用户故事：** 作为模型调用维护者，我希望上下文预算覆盖全部输入和输出预留，以便历史内容不会挤占不可裁剪协议或模型响应空间。

#### 验收标准

1. <a id="req-2-1"></a> 当目标模型存在可用 Token 估算器时，系统必须按 Token 计算本轮输入；只有估算器不可用时才允许使用有界字符估算，并在诊断中标明计量方式。
2. <a id="req-2-2"></a> 当系统计算 Hot 与 Warm 可用预算时，必须先计入 System Prompt、Profile、Tool Schema、Goal Task、execution、Conversation、Working Memory 和响应预留等不可由该层裁剪的内容。
3. <a id="req-2-3"></a> 当预算、响应预留或字符兜底配置非法时，系统必须在调用模型及写入上下文 Sidecar 前返回稳定配置错误。
4. <a id="req-2-4"></a> 当不可裁剪内容本身超过模型预算时，系统必须保留其完整结构并产生可识别的软超限诊断，不得通过拆分执行单元或静默截断结构化条目伪装成预算内输入。

### 需求 3：构建连续的 Hot Dynamic Window

**用户故事：** 作为执行中的 Agent，我希望近期历史保持 Action 与 Observation 的完整因果关系，以便不会基于残缺执行片段作出决定。

#### 验收标准

1. <a id="req-3-1"></a> 当 committed Trajectory 被投影为 Hot Context 时，同一 execution unit 的 Decision、Action、Tool 结果和 Observation 必须组成不可拆分的有序单元。
2. <a id="req-3-2"></a> 当系统填充 Hot Window 时，必须从最新单元向旧单元选择连续后缀，并在首个无法完整容纳的单元处停止。
3. <a id="req-3-3"></a> 当某个较新单元无法容纳时，系统不得拆分该单元或跳过它选择更旧单元。
4. <a id="req-3-4"></a> 当 Trajectory 含有未提交、跨 Goal/Run 或无法形成合法执行单元的事件时，系统不得把这些事件作为 Hot Context 提供给模型。

### 需求 4：有界投影大型历史输出

**用户故事：** 作为需要参考历史 Tool 结果的 Agent，我希望看到可定位的预览和来源，而不是让大型输出占满上下文或失去可追溯性。

#### 验收标准

1. <a id="req-4-1"></a> 当历史 Tool 结果超过单元输出预算时，系统必须提供有界 preview、来源 sequence、内容 hash、截断状态以及可用时的 artifact reference，而不是复制完整载荷。
2. <a id="req-4-2"></a> 当 artifact reference 不可用或原始内容已不可恢复时，系统必须明确标记该限制，不得把 preview 表示为完整结果。
3. <a id="req-4-3"></a> 当同一大型输出被重复投影时，其来源定位、hash 和截断语义必须保持稳定，且投影不得修改原始 Observation。

### 需求 5：维护有界 Warm Semantic Compact

**用户故事：** 作为长任务使用者，我希望被移出近期窗口的重要中期信息保持可见，同时陈旧内容不会无限增长。

#### 验收标准

1. <a id="req-5-1"></a> 当 committed 单元移出 Hot Window 且仍具有中期价值时，系统必须允许将其归纳为带稳定 ID、类别、状态、sequence range 和 evidence references 的有界 Warm 条目。
2. <a id="req-5-2"></a> 当 Warm 条目重复、已解决、被替代或超过分类容量时，系统必须先执行确定性合并、状态失效和语义淘汰，再考虑调用 Compact 模型。
3. <a id="req-5-3"></a> 当活跃 Blocker、未解决问题或当前方案依赖的 Decision 获得临时保护时，每类内容仍必须受容量配额约束，不得形成永久 Pin。
4. <a id="req-5-4"></a> 当 Warm 条目被淘汰时，其来源事实必须继续保留在 Cold committed Trajectory，且不得因 Warm 淘汰删除或覆盖原始事件。

### 需求 6：限制独立 Compact 模型调用

**用户故事：** 作为运行成本维护者，我希望只有确定性压缩仍不足时才调用独立模型，以便 Compact 成本可见且失败不污染上下文。

#### 验收标准

1. <a id="req-6-1"></a> 当预计完整模型输入超过配置阈值时，系统必须以输入预算而非 Trajectory 文件大小触发 Compact。
2. <a id="req-6-2"></a> 当确定性合并、失效和淘汰后仍需语义归纳时，系统才允许为该次主模型调用发起独立 Compact 调用，并单独记录其来源范围、计量、耗时和模型成本。
3. <a id="req-6-3"></a> 当 Compact 模型返回非法、无来源或超限结果，或调用失败、中止时，系统必须丢弃该候选结果并回退到确定性结果，不得改写 Trajectory、Snapshot 或已有 Warm Sidecar。
4. <a id="req-6-4"></a> 当 Compact 模型生成 Warm 条目时，结果必须保留 evidence references 和有损摘要标识，且不得把 Goal Task、用户约束或 Runtime 控制状态复制为 Compact 事实。

### 需求 7：以可重建 Sidecar 加速恢复

**用户故事：** 作为恢复长任务的使用者，我希望系统可以复用有效 Compact 缓存，同时缓存损坏不会改变任务事实或恢复结果。

#### 验收标准

1. <a id="req-7-1"></a> 当系统保存 Warm Sidecar 时，必须记录 Goal/Run、derived sequence、来源 hash、Schema 与 Compactor 版本，并且写入时机不得早于对应 Snapshot 成功提交。
2. <a id="req-7-2"></a> 当 Sidecar 与当前 Goal/Run、版本、来源 hash 和 Snapshot 边界匹配且不领先于边界时，系统必须允许从 Sidecar 恢复 Warm 条目并处理其后已提交来源。
3. <a id="req-7-3"></a> 当 Sidecar 缺失、损坏、版本不兼容、来源不匹配或领先于 Snapshot 时，系统必须忽略它并从 committed Trajectory 重建，不得以空 Compact 或缓存内容覆盖权威来源。
4. <a id="req-7-4"></a> 当 Sidecar 写入失败、被删除或进程结束时，系统不得改变 Goal 状态、Trajectory、Working Memory 或后续从相同 committed boundary 重建上下文的能力。

### 需求 8：保持旧协议与故障边界

**用户故事：** 作为已有 Goal 的使用者，我希望新上下文机制不会改变旧 checkpoint Session，以便升级后仍可按原协议恢复和执行。

#### 验收标准

1. <a id="req-8-1"></a> 当旧协议 Goal 发起模型调用时，系统必须继续使用其冻结的 Conversation 裁剪和 checkpoint 上下文语义，不得要求 Warm Sidecar 或结构化 Trajectory Context。
2. <a id="req-8-2"></a> 当 Goal 的 Model Context 协议未知或与 Memory、Prompt 协议不兼容时，系统必须在模型调用和持久化副作用前返回可识别的协议错误。
3. <a id="req-8-3"></a> 当 Goal 等待、中断、终止或承载进程结束时，系统必须允许丢弃本轮 Hot/Warm 进程缓存；恢复不得依赖该缓存仍然存在。

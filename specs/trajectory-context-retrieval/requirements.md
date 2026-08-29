# Trajectory Context Retrieval 需求

## 引言

本功能为采用分层模型上下文的新协议 Goal 提供显式 `context_lookup`：模型在 Hot、Warm 和 Working Memory 不足时，可以从当前 Snapshot 提交边界内的 Cold Trajectory 检索有来源的历史信息。首版使用 Fielded BM25-lite，不读取当前 Workspace/Environment，不引入向量数据库，也不把无结果或摘要当成事实证据。

## 需求

### 需求 1：提供显式 Context Lookup 协议

**用户故事：** 作为信息不足的 Agent，我希望明确请求历史查询，以便系统返回可追溯结果而不是让我猜测。

#### 验收标准

1. <a id="req-1-1"></a> 当结构化协议模型需要历史信息时，Preparation Result 与 Executing AgentDecision 必须允许返回独占的 `context_lookup` 分支，声明具体问题和可选过滤条件，不得在同一响应中同时推进其他业务结果。
2. <a id="req-1-2"></a> 当 Runtime 接受 `context_lookup` 时，只能查询当前 Goal/Run 的 committed Trajectory，不得执行 Workspace/Environment Tool 或产生外部作用。
3. <a id="req-1-3"></a> 当 Executing 发起 lookup 时，该模型决策必须恰好计入一个 Step；Preparation lookup 不消费执行 Step，但必须受单次继续流程的链式查询上限约束。
4. <a id="req-1-4"></a> 当 lookup 问题、过滤条件或链式查询次数违反协议或配置限制时，系统必须返回稳定错误，不得执行查询、推进业务阶段或生成检索事实。

### 需求 2：只索引已提交的完整上下文单元

**用户故事：** 作为恢复 Session 的使用者，我希望检索索引与 Snapshot 提交边界一致，以便查询不会看到未提交或因果残缺的历史。

#### 验收标准

1. <a id="req-2-1"></a> 当系统建立索引时，必须只使用当前 Goal/Run 中不超过 Snapshot `committedThroughSequence` 的事件，并排除未提交 tail、commit marker 和历史 lookup 请求/结果。
2. <a id="req-2-2"></a> 当事件属于执行过程时，系统必须以完整 execution unit 建立单个检索文档；可检索的 Preparation/阶段事实必须按稳定连续边界组成文档，不得把孤立 Event 当成独立语义命中。
3. <a id="req-2-3"></a> 当 Snapshot 提交边界推进时，系统必须允许增量加入新文档；对同一边界完整重建与增量更新必须产生等价的可查询语料和排序结果。
4. <a id="req-2-4"></a> 当 committed Trajectory 缺失、损坏、身份不匹配或无法组成合法文档时，系统必须停止该 lookup 并返回可识别错误，不得基于部分索引继续。

### 需求 3：保留代码与对象标识的可检索性

**用户故事：** 作为执行代码任务的 Agent，我希望路径、Tool、Action、对象 ID 和错误码能精确命中，以便词法检索不会破坏关键标识。

#### 验收标准

1. <a id="req-3-1"></a> 当系统索引上下文文档时，必须分别建立 event type、Tool ID、Action ID、step index、文件路径、错误码、对象标识和正文内容字段，并允许查询按这些字段过滤。
2. <a id="req-3-2"></a> 当 Tokenizer 处理路径、`snake_case`、`camelCase`、数字后缀或混合标识时，必须同时保留完整精确 Token 和确定性拆分 Token。
3. <a id="req-3-3"></a> 当相同文档与 Tokenizer 版本被重复索引时，必须产生相同 Token、字段长度和文档统计，不得依赖区域设置、当前时间或进程随机性。

### 需求 4：执行可解释的 Fielded BM25-lite 排序

**用户故事：** 作为查询历史的 Agent，我希望精确标识和相关内容优先返回，以便近期但无关的信息不会压过真正证据。

#### 验收标准

1. <a id="req-4-1"></a> 当查询存在候选文档时，系统必须使用版本化字段权重和 BM25 词频/文档长度归一化计算相关分数。
2. <a id="req-4-2"></a> 当查询完整匹配路径、对象 ID、Tool/Action 名称或错误码时，系统必须给予高于普通正文 Token 的确定性精确匹配优先级。
3. <a id="req-4-3"></a> 当候选相关分数相同或处于配置的等价范围时，系统才允许使用 recency 作为 tie-break，不得以时间新旧替代相关性排序。
4. <a id="req-4-4"></a> 当多个命中属于同一上下文单元时，系统必须合并重复结果，并在结果预算允许时附带必要相邻单元，保持 Action/Observation 因果关系。

### 需求 5：返回有来源的有界结果或明确 Not Found

**用户故事：** 作为消费检索结果的 Agent，我希望知道结果来自哪里以及是否完整，以便不会把低相关或截断内容当成完整事实。

#### 验收标准

1. <a id="req-5-1"></a> 当 lookup 命中时，每个结果必须包含 Goal/Run、sequence range、匹配字段、版本化分数、截断状态、历史状态标识和原始来源引用。
2. <a id="req-5-2"></a> 当候选为空或最高分低于最低相关阈值时，系统必须返回结构化 `not_found`，不得生成替代摘要或无来源结果。
3. <a id="req-5-3"></a> 当结果超过 Top-K 或返回大小预算时，系统必须按排序稳定截断并明确标记，不得返回半个上下文单元。
4. <a id="req-5-4"></a> 当模型使用 lookup 结果更新 Finding 或 Completion Evidence 时，必须引用结果中的原始 committed sequence；lookup 结果、`not_found` 或查询文本本身不得单独成为完成证据。

### 需求 6：按信息类型约束 Context Source Routing

**用户故事：** 作为依赖当前 Workspace 的使用者，我希望历史查询与当前状态观察严格分离，以便旧 Observation 不会被误当成当前事实。

#### 验收标准

1. <a id="req-6-1"></a> 当信息需求属于历史执行或历史决策理由时，系统必须允许 `context_lookup` 查询 committed Trajectory，并把结果标记为历史来源。
2. <a id="req-6-2"></a> 当信息需求属于当前 Workspace、Environment 或验证状态时，Context Router 必须拒绝代替正常 Tool Decision，模型必须通过已授权 Tool 重新观察或验证。
3. <a id="req-6-3"></a> 当信息需求属于 Goal Task、批准约束或 Conversation 中的用户输入时，系统必须从对应权威投影提供，不得根据 Trajectory 摘要反向推断任务契约。
4. <a id="req-6-4"></a> 当历史结果描述可能变化的外部状态时，模型输入必须明确提示其时间边界；在其驱动当前决策或完成声明前仍需正常授权观察。

### 需求 7：使用可重建索引 Sidecar 与有界查询缓存

**用户故事：** 作为长轨迹使用者，我希望重复查询和恢复不必每次全量建索引，同时删除缓存不会损失事实。

#### 验收标准

1. <a id="req-7-1"></a> 当系统保存检索 Sidecar 时，必须记录 Goal/Run、derived sequence、来源摘要、Schema、Tokenizer、权重和索引版本，且不得领先于 Snapshot 提交边界。
2. <a id="req-7-2"></a> 当有效索引 Sidecar 落后于 Snapshot 时，系统必须允许增量索引其后 committed 文档；Sidecar 缺失、损坏、领先或版本/hash 不匹配时必须从 committed Trajectory 重建。
3. <a id="req-7-3"></a> 当系统缓存查询结果时，缓存键必须包含规范化 query、filters、committed sequence 和索引版本；缓存必须有固定容量，并按 LRU 淘汰，不得跨边界或协议复用。
4. <a id="req-7-4"></a> 当索引或查询缓存写入失败、被删除或进程结束时，系统不得改变 Goal、Trajectory、Working Memory 或在相同 committed boundary 上重新获得等价检索结果的能力。

### 需求 8：保持协议兼容并验证检索质量

**用户故事：** 作为升级和评测维护者，我希望检索只影响选择该协议的新 Goal，并以固定语料证明召回和确定性。

#### 验收标准

1. <a id="req-8-1"></a> 当 Goal 未冻结 BM25-lite Retrieval 协议时，现有 Preparation/AgentDecision 分支和模型上下文必须保持不变，且不得要求检索 Sidecar。
2. <a id="req-8-2"></a> 当 Retrieval 协议未知、与 Prompt/Memory/Model Context 协议不兼容，或索引重建失败时，系统必须返回可识别错误或结构化 `lookup_error`，不得伪造 `not_found` 或检索结果。
3. <a id="req-8-3"></a> 当运行固定检索评测语料时，完整路径、对象 ID、Tool/Action 和错误码查询的 Recall@5 必须为 100%，历史自然语言查询 Recall@5 不低于 90%，`not_found` 精确率为 100%，且相同输入排序必须完全一致。

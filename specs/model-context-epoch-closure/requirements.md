# 长任务模型上下文闭环需求

## 引言

本功能为 LazyGoal 建立面向长任务迭代的模型上下文闭环：在保留完整 Goal、Conversation、Snapshot 与 Trajectory 历史的同时，以真实 Token 能力约束单轮模型请求，通过 Context Epoch、安全检查点、历史检索和可降级的 Warm 上下文持续提供当前工作所需信息，并保持既有 Goal 的兼容行为。本功能不引入自由文本 Notes、跨 Goal 检索或需要用户手动触发的 `new_context` 操作。

## 需求

### 需求 1：模型 Token 能力与硬预算

**用户故事：** 作为 LazyGoal 运行者，我希望模型请求依据所用模型的真实 Token 能力进行限制，以便长任务不会因上下文超限而产生不可预测的模型调用失败。

#### 验收标准

1. <a id="req-1-1"></a> 当创建或启动采用新版模型上下文协议的 Goal 时，系统必须取得明确的上下文窗口 Token 数、最大输出 Token 数和匹配的 Token 估算能力；任一能力缺失或非法时，系统必须在读取或调用模型前返回稳定配置错误。
2. <a id="req-1-2"></a> 当系统计算单轮输入硬上限时，必须先为模型上下文窗口保留 5% 安全余量，再扣除最大输出 Token 数；发起模型请求时必须同时传递该最大输出 Token 数。
3. <a id="req-1-3"></a> 当最终渲染后的输入超过硬上限时，系统必须按完整上下文单元裁剪可选内容并重新计数，不得拆分一条消息、一次 Tool 调用链或一个完整执行单元。
4. <a id="req-1-4"></a> 如果权威输入与最新完整 Conversation 单元仍无法装入硬上限，系统必须返回稳定的 `MODEL_CONTEXT_HARD_OVERFLOW` 错误，且不得调用模型。

### 需求 2：Context Epoch 与安全切换

**用户故事：** 作为执行长任务的用户，我希望系统分阶段投影 Conversation，并在安全边界切换阶段，以便历史持续增长时仍保留当前任务意图和恢复能力。

#### 验收标准

1. <a id="req-2-1"></a> 当当前 Context Epoch 的不可选输入与 Conversation 压力达到输入硬上限的 85%，或者必须移除当前 Epoch 中任一完整 Conversation 单元时，系统必须先要求模型生成上下文检查点，不得直接推进到下一次普通决策。
2. <a id="req-2-2"></a> 当模型处于检查点请求状态时，系统只接受 `context_checkpoint` 结果及其可选 Working Memory Patch；其他决策结果不得触发 Epoch 切换。
3. <a id="req-2-3"></a> 当仍存在 Pending Action、检查点结果非法或 Working Memory Patch 校验失败时，系统不得切换 Epoch，并必须保留原有可恢复状态。
4. <a id="req-2-4"></a> 当检查点通过验证时，系统必须在同一提交边界保存可选 Working Memory Patch、关闭的 Epoch 边界、新 Epoch 起点和对应 Snapshot。
5. <a id="req-2-5"></a> 当 Planning proposal 获得明确批准并进入 Executing 时，系统必须在该提交边界自动打开新的执行 Epoch。

### 需求 3：Epoch 历史完整性与生命周期

**用户故事：** 作为需要恢复和审计 Goal 的用户，我希望 Epoch 只改变模型可见投影而不删除权威历史，以便任务重启后仍可追溯并找回早期信息。

#### 验收标准

1. <a id="req-3-1"></a> 当 Epoch 发生切换时，系统不得删除或改写 Goal Conversation、Snapshot 或已提交 Trajectory；相邻 Epoch 可以共享重叠的完整 Conversation 单元。
2. <a id="req-3-2"></a> 当 Goal 从持久化状态恢复时，系统必须继续使用已提交的当前 Epoch 编号、Conversation 起点和提交边界，不得因进程重启隐式新建 Epoch。
3. <a id="req-3-3"></a> 当运行完成、失败或被用户取消时，系统必须记录最后一个 Epoch 的关闭边界；等待、可恢复中断或普通进程退出不得关闭当前 Epoch。

### 需求 4：单轮上下文的权威优先选择

**用户故事：** 作为依赖模型持续正确决策的用户，我希望有限 Token 优先承载当前权威状态和最近上下文，以便缓存或历史内容不会挤占关键输入。

#### 验收标准

1. <a id="req-4-1"></a> 当系统组装模型输入时，必须优先保留系统与任务控制信息、当前执行状态、Working Memory、Context Epoch 控制信息以及本轮有界 Lookup 结果。
2. <a id="req-4-2"></a> 当权威输入仍有剩余预算时，系统必须依次选择最新完整 Conversation 单元、最新 Hot 执行单元、当前 Epoch 中更早的 Conversation 单元和 Warm 内容，未使用的预算必须自动流向下一优先层级。
3. <a id="req-4-3"></a> 当较低优先级内容导致输入超过硬上限时，系统必须先移除 Warm，再移除更早 Conversation 和 Hot 单元，不得移除完成当前请求所需的权威输入。

### 需求 5：Conversation 与 Trajectory 历史检索

**用户故事：** 作为跨多个 Epoch 执行任务的用户，我希望模型能够按需找回早期约束和历史执行证据，以便被移出当前投影的信息不会永久丢失。

#### 验收标准

1. <a id="req-5-1"></a> 当模型请求检索历史 Conversation 或 Trajectory 时，系统必须返回有界的匹配结果，并明确标识结果来自权威 Conversation 消息还是历史 Trajectory 事件。
2. <a id="req-5-2"></a> 当检索命中 Conversation 时，结果必须能够追溯到原始消息位置和内容校验信息；检索索引不得替代 Snapshot 中的权威消息。
3. <a id="req-5-3"></a> 当同一约束存在时间上较新的 Conversation 记录时，系统必须优先呈现较新的记录；当结果涉及可能变化的外部状态时，系统不得把历史 Trajectory 观察声明为当前事实。
4. <a id="req-5-4"></a> 当检索 Sidecar 缺失、过期或损坏时，系统必须能够从已提交的 Snapshot 与 Trajectory 重建检索能力，而不要求修改权威历史。

### 需求 6：Lookup 调用边界

**用户故事：** 作为管理任务预算的用户，我希望历史查询不会被计作业务执行步骤，同时又能阻止模型陷入连续查询循环。

#### 验收标准

1. <a id="req-6-1"></a> 当 Planning 或 Executing 阶段成功执行 `context_lookup` 时，系统不得增加任务的业务 `stepCount`。
2. <a id="req-6-2"></a> 当模型连续发起 `context_lookup` 时，系统最多允许三次连续查询；第四次必须返回稳定的查询链限制错误且不得生成虚假 Lookup 事实。
3. <a id="req-6-3"></a> 当模型执行一次非 Lookup 的正常决策后，系统必须重置连续查询计数；系统不得设置每个 Epoch 或整个 Goal 的累计查询次数上限。
4. <a id="req-6-4"></a> 当 Goal 使用新版上下文协议正常启动时，Planning 和 Executing 阶段都必须具备可用的历史检索能力，不得因默认装配缺失返回 `CONTEXT_LOOKUP_UNAVAILABLE`。

### 需求 7：Warm 上下文与可选 Compact

**用户故事：** 作为重视执行可靠性和模型成本的用户，我希望 Warm 上下文可以确定性恢复，并由可选模型异步优化，以便默认路径不依赖额外 LLM 请求。

#### 验收标准

1. <a id="req-7-1"></a> 当存在已提交且未进入 Hot 的合格执行单元时，系统必须能够根据其既有摘要、失败、决策元数据和证据引用生成有界 Warm 内容。
2. <a id="req-7-2"></a> 当 Warm Sidecar 缺失、过期、写入失败或内容非法时，系统必须继续执行，并能够从已提交事实确定性重建 Warm 内容。
3. <a id="req-7-3"></a> 在默认配置下，系统不得为 Compact 额外调用 LLM，模型主循环也不得等待后台 Warm 维护完成。
4. <a id="req-7-4"></a> 当用户显式启用 LLM Compact 时，系统必须优先使用已配置的独立 Compact 模型，否则使用主模型；Compact 超时、失败、取消或返回非法结果时不得改变 Goal 正确性和正常推进。

### 需求 8：协议版本与既有 Goal 兼容

**用户故事：** 作为维护已有 Goal 的用户，我希望上下文闭环只应用于明确采用新协议的 Goal，以便升级不会改变既有任务的恢复和模型调用行为。

#### 验收标准

1. <a id="req-8-1"></a> 当创建新 Goal 时，系统必须使用新版 Prompt、Snapshot、模型上下文和检索协议，并持久化其所需的 Epoch 状态。
2. <a id="req-8-2"></a> 当加载采用旧版 Prompt、Snapshot 或模型上下文协议的 Goal 时，系统必须继续使用旧行为，不得隐式迁移、写入 Epoch 状态或要求新增 Token 配置。
3. <a id="req-8-3"></a> 当系统遇到未知或不兼容的新版协议数据时，必须以稳定错误拒绝继续执行，不得猜测迁移或部分启用新上下文行为。

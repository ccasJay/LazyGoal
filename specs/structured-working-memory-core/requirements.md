# 结构化 Working Memory Core 需求

## 引言

本功能为采用新协议的 Goal 提供可跨准备与执行阶段使用、可从已提交 Trajectory 重建的结构化 Working Memory，并确保模型提出的 Memory 变化只有在业务结果获 Runtime 接受且进入 Snapshot 提交边界后才生效。本 Spec 仅定义 Memory Core 的可观察契约；动态窗口、Compact、Sidecar 与 Trajectory 检索由后续 Spec 定义。

## 需求

### 需求 1：隔离新旧 Memory 协议

**用户故事：** 作为已有 Goal 和新建 Goal 的使用者，我希望系统按 Goal 冻结的协议恢复对应工作记忆，以便新增结构化 Memory 不破坏旧 Session。

#### 验收标准

1. <a id="req-1-1"></a> 当系统创建采用结构化 Working Memory 的新 Goal 时，必须冻结可识别的新协议版本，并使用结构化 `memoryPatch` 协议代替要求模型返回自由文本 checkpoint。
2. <a id="req-1-2"></a> 当系统恢复旧协议 Goal 时，必须继续使用该 Goal 原有的 Prompt、Response 和 checkpoint 语义，不得把旧 checkpoint 自动转换为结构化 Memory。
3. <a id="req-1-3"></a> 当 Goal 的 Memory 协议版本未知、不受支持或与其 Prompt/Response 协议不匹配时，系统必须返回可识别的协议错误，且不得调用模型、推进 Goal 或改写持久化数据。
4. <a id="req-1-4"></a> 当新协议 Goal 缺少可读取的 Trajectory 或提交边界时，系统必须拒绝开始或恢复模型工作；旧协议 Goal 不得因此新增 Trajectory 依赖。

### 需求 2：保持 Memory 与 Runtime 执行状态分离

**用户故事：** 作为 Runtime 维护者，我希望 Working Memory 只保存模型推导的工作信息，以便执行状态始终只有一个权威来源。

#### 验收标准

1. <a id="req-2-1"></a> 当系统向模型提供 Working Memory 时，必须包含其已归约到的 committed sequence，以及当前有效的 Finding、Hypothesis、Plan、Blocker 和 nextAction。
2. <a id="req-2-2"></a> Working Memory 和 `memoryPatch` 必须拒绝保存或修改 checkpoint、previousStep、pending Action、Step 计数、Run 状态和其他 Runtime 控制状态。
3. <a id="req-2-3"></a> 当 Working Memory 中存在 Plan、Blocker 或 nextAction 时，系统必须将其视为控制意图和未完成工作，不得据此宣称对应外部 Action 已执行或任务已完成。
4. <a id="req-2-4"></a> 当 Memory 条目跨阶段保留时，系统必须能够识别其来源阶段、当前状态和证据来源，使失效条目不会继续作为当前有效信息提供给模型。

### 需求 3：接收并原子校验 Memory Patch

**用户故事：** 作为 Agent 使用者，我希望模型在正常业务响应中增量更新 Memory，以便持续积累上下文而不增加每轮模型调用。

#### 验收标准

1. <a id="req-3-1"></a> 当 Preparation 或 Executing 阶段的模型响应需要改变 Memory 时，系统必须允许该响应同时提出结构化 `memoryPatch`，且普通 Memory 更新不得触发第二次模型调用。
2. <a id="req-3-2"></a> 当模型响应没有提出 Memory 变化时，系统必须保持现有 Working Memory 不变，不得要求生成占位 Patch。
3. <a id="req-3-3"></a> 当 Patch 包含未知操作、非法字段、重复 stable ID、无效状态转换或不匹配的更新目标时，系统必须将整个 Patch 视为协议失败，不得部分应用或继续执行其关联业务结果。
4. <a id="req-3-4"></a> 当 Patch 超过配置的操作数、集合容量、单项长度、总大小或 evidence reference 上限时，系统必须在写入 Trajectory 前拒绝整个 Patch，不得静默截断；大型内容必须使用可追溯引用而不是复制完整载荷。

### 需求 4：只提交 Runtime 已接受的 Patch

**用户故事：** 作为恢复 Session 的使用者，我希望只有通过业务与安全校验的 Memory 变化被提交，以便被拒绝的模型决策不会污染后续上下文。

#### 验收标准

1. <a id="req-4-1"></a> 当模型仅提出 Patch、但其关联业务结果尚未获 Runtime 接受时，系统不得让该 Patch 对 Working Memory 可见。
2. <a id="req-4-2"></a> 当关联业务结果或 Patch 未通过 Schema、Tool Policy、授权、Action 输入或状态校验时，系统不得产生 accepted Patch 事实，也不得修改进程内 Working Memory。
3. <a id="req-4-3"></a> 当业务结果与 Patch 均获接受时，系统必须先记录独立且可审计的 `memory_patch_accepted` 事实，再由成功保存的 Goal Snapshot 将其 sequence 纳入提交边界，最后才允许进程内 Working Memory 应用该 Patch。
4. <a id="req-4-4"></a> 当 accepted Patch 事实追加失败时，系统必须停止关联业务结果的后续状态推进和外部作用，不得保存包含该 Patch 的新提交边界或更新 Working Memory。
5. <a id="req-4-5"></a> 当 accepted Patch 已追加但 Goal Snapshot 保存失败时，该 Patch 必须保持为未提交 tail 且不得应用；当 Snapshot 已成功但后续提交 marker 写入失败时，系统仍必须以 Snapshot 中的 committed sequence 判断该 Patch 已提交。

### 需求 5：从提交边界确定性重建 Memory

**用户故事：** 作为长任务使用者，我希望中断后的 Goal 恢复已有工作记忆，以便模型不用重新探索已经确认的信息。

#### 验收标准

1. <a id="req-5-1"></a> 当系统恢复新协议 Goal 时，必须在下一次模型调用前读取最新有效 Snapshot 的 committed sequence，并只归约该边界内的 accepted Patch。
2. <a id="req-5-2"></a> 当 Trajectory 包含超过 Snapshot 提交边界的 tail、原始 Decision 或未获接受的 Patch 时，系统不得将这些内容应用到 Working Memory。
3. <a id="req-5-3"></a> 对同一 Goal、Run 和 committed sequence 重复构建 Working Memory 时，系统必须得到等价结果；重复事件读取不得导致同一 Patch 被应用多次。
4. <a id="req-5-4"></a> 当 Goal 等待、中断、终止或承载进程结束时，系统必须允许丢弃进程内 Working Memory；后续恢复不得依赖该进程残留状态。
5. <a id="req-5-5"></a> 当重建所需的 committed Trajectory 缺失、损坏或与 Snapshot 边界不一致时，系统必须停止后续模型工作并报告可识别的恢复错误，不得以空 Memory 或猜测内容继续。

### 需求 6：显式处理跨阶段 Memory 生命周期

**用户故事：** 作为批准任务的使用者，我希望早期收集和规划信息只在仍然有效时进入执行上下文，以便被否决或替代的方案不会影响后续 Action。

#### 验收标准

1. <a id="req-6-1"></a> 当 Goal 从 `gathering_context` 推进到 `planning` 时，系统必须保留仍被 committed evidence 支持的 Finding，并使只服务于旧提问的 nextAction 和临时 Hypothesis 失效。
2. <a id="req-6-2"></a> 当用户否决任务提案或提交规划反馈时，系统必须将旧 Plan、nextAction 和仅服务该方案的 Hypothesis 标记为 `superseded`，且后续模型请求不得把它们作为当前有效内容。
3. <a id="req-6-3"></a> 当用户批准任务提案并进入 `executing` 时，只有获批 Goal Task 可以成为执行任务契约；Preparation 中未获批准的提案或控制意图不得被提升为批准事实。
4. <a id="req-6-4"></a> 当 Blocker 已解决或 Memory 条目被新决策替代时，系统必须更新其状态，使其不再作为活跃阻塞或当前方案依据提供给模型，同时保留其已提交历史事实。

### 需求 7：强制执行 Evidence Gate

**用户故事：** 作为依赖 Agent 结论的使用者，我希望事实和完成声明具有可回查证据，以便信息缺失时模型不会把猜测伪装成已知结果。

#### 验收标准

1. <a id="req-7-1"></a> 当 Patch 新增或更新 Finding 时，每个 Finding 必须引用当前 Goal 和 Run 中不超过 Snapshot 提交边界的已提交 Trajectory sequence。
2. <a id="req-7-2"></a> 当 Finding 引用不存在、未提交、属于其他 Goal/Run 或不允许作为 evidence 的 sequence 时，系统必须拒绝整个 Patch，不得创建部分 Finding。
3. <a id="req-7-3"></a> 当模型声明某项 Completion Criterion 已满足时，该声明必须关联可定位的已提交证据；Hypothesis、Compact 摘要或无结果查询不得单独作为完成证据。
4. <a id="req-7-4"></a> 当现有证据不足以支持历史事实或完成声明时，系统必须保持该信息为 unknown 或明确的 Hypothesis，并拒绝将其升级为 Finding 或据此完成 Goal。

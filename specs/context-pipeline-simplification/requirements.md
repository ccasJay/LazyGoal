# Context Pipeline Simplification 需求

## 引言

本特性收敛 LazyGoal 当前上下文链路，删除未进入生产调用路径的语义 Compact、Warm Sidecar、维护通知、重复来源路由与废弃公共入口，同时保持 Conversation 裁剪、committed Trajectory、Hot/Warm 组装、Context Epoch、历史检索和模型供应商能力不变。

## 需求

### 需求 1：保持有效的模型上下文裁剪与组装行为

**用户故事：** 作为长任务使用者，我希望系统在简化后继续提供有界且可恢复的模型上下文，以便长时间执行不会丢失现有上下文控制能力。

#### 验收标准

1. <a id="req-1-1"></a> 当 Preparation 或 Executing 发起模型调用时，系统必须继续按完整 Conversation 单元和当前预算裁剪本轮可见消息，且不得修改 Goal 中保存的完整消息历史。
2. <a id="req-1-2"></a> 当系统组装 Trajectory 模型上下文时，系统必须只使用当前 Snapshot 提交边界内的事件，并继续生成完整 Hot 执行单元和有界 Warm 条目。
3. <a id="req-1-3"></a> 当 committed Trajectory、预算和其他输入相同时，Warm 条目必须由确定性规则重新生成，不得要求额外的 LLM Compact 调用或持久化 Warm 缓存。
4. <a id="req-1-4"></a> 当存在未提交 Trajectory tail 时，系统不得将其加入 Hot 或 Warm 模型上下文。

### 需求 2：移除无生产用途的语义 Compact 与 Warm 缓存生命周期

**用户故事：** 作为维护者，我希望系统不再暴露或装配无消费者的 Compact 与缓存生命周期，以便减少无效接口、存储协议和后台资源。

#### 验收标准

1. <a id="req-2-1"></a> 当应用创建运行时组合根时，系统不得创建 Warm Context Sidecar Store、语义 Compact Adapter 或 Warm Context Maintenance Worker。
2. <a id="req-2-2"></a> 当 Snapshot 成功提交时，系统不得发送仅用于 Warm 缓存维护的提交通知，且既有 Snapshot 与 `state_committed` 顺序必须保持不变。
3. <a id="req-2-3"></a> 当工作区中存在旧 Warm Context Sidecar 文件时，系统必须忽略这些文件且不得主动删除或迁移它们。
4. <a id="req-2-4"></a> 当调用方使用 Agent、Runtime 或 Storage 的当前公共入口时，系统不得再导出语义 Compact、Warm Context Sidecar 或 Context Maintenance 相关接口。

### 需求 3：保持历史 Context Lookup 的单一严格边界

**用户故事：** 作为 Runtime 维护者，我希望 Context Lookup 只经过现有协议校验和规范化，以便删除重复路由而不放宽历史信息来源限制。

#### 验收标准

1. <a id="req-3-1"></a> 当 Preparation 或 Executing 请求历史上下文时，系统必须仅接受 `conversation_history`、`historical_execution` 或 `decision_rationale`。
2. <a id="req-3-2"></a> 当合法 Context Lookup 请求通过当前协议校验后，系统必须使用规范化请求调用现有 Context Lookup 能力，不得要求额外的来源 Router。
3. <a id="req-3-3"></a> 当请求包含未知来源、非法字段或不合法结构时，系统必须在检索前拒绝请求，并保持现有稳定错误分类。
4. <a id="req-3-4"></a> Context Lookup 不得替代当前 Workspace、Environment、任务契约、用户约束或完成验证的权威来源。

### 需求 4：收窄废弃的上下文公共接口

**用户故事：** 作为包调用者，我希望上下文相关公共入口只保留当前生产链路使用的规范接口，以便避免选择无效或重复实现。

#### 验收标准

1. <a id="req-4-1"></a> 当调用方投影 Trajectory 模型上下文时，系统必须保留严格的执行单元 Adapter，并不得再提供旧的通用 Trajectory Context Unit Adapter。
2. <a id="req-4-2"></a> 当调用方使用 Context Lookup 结果构建、分词、索引、排名、来源摘要或 Retrieval Index Sidecar Codec 时，系统必须只导出各能力的规范名称。
3. <a id="req-4-3"></a> 当调用方尝试导入已删除的重复别名、Context Source Router 或 Compact/Sidecar/Maintenance 接口时，TypeScript 编译必须明确失败，不得提供兼容包装或回退导出。

### 需求 5：保留 Retrieval Index 与模型供应商能力

**用户故事：** 作为 LazyGoal 使用者，我希望简化无效上下文设施时不影响实际使用的历史检索和模型供应商，以便现有工作流继续运行。

#### 验收标准

1. <a id="req-5-1"></a> 当 Context Lookup 建立或恢复历史检索索引时，系统必须继续读写 Retrieval Index Sidecar，并保持索引可删除、可重建的缓存语义。
2. <a id="req-5-2"></a> 当应用选择现有 OpenAI-compatible 或 Gemini 模型路径时，系统必须保持现有 Adapter、依赖和模型选择行为。
3. <a id="req-5-3"></a> 当 Conversation 固定输入超过模型预算时，系统必须继续返回可识别的预算错误，不得通过静默截断权威输入完成请求。

### 需求 6：保持开发期协议与持久化边界

**用户故事：** 作为运行时数据维护者，我希望此次内部简化不制造新的协议版本或数据迁移，以便变更范围保持在无效实现清理之内。

#### 验收标准

1. <a id="req-6-1"></a> 当本特性完成时，系统不得仅因本次简化升级 Snapshot、Trajectory、Prompt Bundle 或 Context 协议版本。
2. <a id="req-6-2"></a> 当 Goal 从现有 Snapshot 恢复时，系统必须继续以 Snapshot 的 `committedThroughSequence` 作为 Trajectory 提交边界。
3. <a id="req-6-3"></a> 当 Domain Event、Snapshot 或 Diagnostic Trace 被写入时，系统必须保持现有事实、恢复和诊断数据面的分离。

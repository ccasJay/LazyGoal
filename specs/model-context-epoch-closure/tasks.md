# Implementation Plan

- [x] //TODO 1. 建立 v2 模型上下文协议与 Snapshot v11 契约

  - 扩展 Runtime Domain、Agent 结果 Union、`ModelInferenceView.contextEpoch`、Epoch Trajectory Payload 与严格协议校验，并为新增公共接口补充中文 TSDoc 和最小示例
  - 实现 Snapshot v11 Codec；`trajectory-layered@2` 使用 v11，v1 Goal 继续读写 v10 且不生成 Epoch 状态
  - 增加协议组合、未知字段、v10/v11 round-trip、旧 Goal 无迁移及结果分支排他性测试
  - _Requirements: [2.2](./requirements.md#req-2-2), [3.2](./requirements.md#req-3-2), [8.1](./requirements.md#req-8-1), [8.2](./requirements.md#req-8-2), [8.3](./requirements.md#req-8-3)_

- [x] //TODO 2. 实现模型 Token 能力与 Provider 输出上限

  - 增加 `ModelCapabilities`、内置 tiktoken resolver 和自定义 Token Estimator 注入，严格校验上下文窗口、输出上限与 Token 计量单位
  - 扩展 `LLMRequest.maxOutputTokens` 并接入 OpenAI-compatible、Gemini 与测试 Adapter；旧协议不读取 v2 必需配置
  - 增加配置失败时机、95% 安全余量、输出 Token 预留、Tokenizer 选择和 Provider 请求透传测试
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [8.2](./requirements.md#req-8-2)_

- [x] //TODO 3. 实现最终请求硬预算与统一 ContextSelector

  - 以 Renderer 产出的最终 messages 反复计量，按完整单元实现 authority、Lookup、最新 Conversation、Hot、更早 Conversation、Warm 的预算选择
  - 实现 `Warm -> older Conversation -> Hot` 回退和 `MODEL_CONTEXT_HARD_OVERFLOW` fail-closed，移除 v2 fixed-input soft overflow 路径
  - 增加完整 Tool 链不可拆分、层级回借、重复渲染计量、边界相等和权威输入超限测试
  - _Requirements: [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [x] //TODO 4. 实现 Context Epoch 投影与压力检查点请求

  - 从 Snapshot Epoch 状态和完整 Conversation 单元生成 `contextEpoch` 瞬时字段，并由 Renderer 写入末尾控制 JSON 而不污染真实 messages
  - 计算不含 Hot/Warm 的 85% Epoch 压力，生成 `checkpoint_required` 专用请求，并在单个超大最新单元场景抑制无进展重复检查点
  - 增加 Epoch 内最新后缀、相邻 Epoch 重叠、检查点响应排他和检查点不消费 Step 的 Agent/Runtime 测试
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [3.1](./requirements.md#req-3-1), [4.1](./requirements.md#req-4-1)_

- [x] //TODO 5. 实现 Context Epoch 原子推进与终态生命周期

  - 在 Coordinator 与 Runner 校验 Pending Action、`context_checkpoint` 和可选 Memory Patch，按最长可保留最新后缀计算新 Epoch 起点
  - 通过现有提交闸门依次追加 accepted Memory Patch、`context_epoch_advanced`/`context_epoch_closed` 并保存 Snapshot；Planning 批准在同一边界自动打开 execution Epoch
  - 增加 Patch/事件/Snapshot 失败、未提交 tail、重启恢复、等待不关闭及 completed/failed/cancelled 关闭测试
  - _Requirements: [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [2.5](./requirements.md#req-2-5), [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3)_

- [x] //TODO 6. 升级 Conversation 与 Trajectory 联合检索文档和 Sidecar

  - 将 Context Document、Match 与 Sidecar 升级为 conversation/trajectory source union，保存消息 index、role、content hash、Conversation prefix digest 和 Trajectory digest
  - 构建 Conversation 文档时只向 Cold 查询暴露 `messageIndex < conversationStartIndex` 的归档消息，保持当前 Epoch 由 ContextSelector 直接投影
  - 增加双来源 Codec、消息可追溯性、双摘要失配、领先/损坏 Sidecar 与确定性重建测试
  - _Requirements: [3.1](./requirements.md#req-3-1), [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.4](./requirements.md#req-5-4)_

- [x] //TODO 7. 实现生产 IndexedContextLookupService 与来源路由

  - 实现 `IndexedContextLookupService implements ContextLookupPort`，从 Goal messages 与 committed Trajectory 恢复/重建索引、执行 BM25-lite 并 best-effort 保存 Sidecar/LRU
  - 扩展 `ContextSourceRouter`：Conversation history 只查归档消息、historical execution 只查 Trajectory、decision rationale 联合查询；等分时较新来源优先
  - 增加有界结果、source union、Trajectory freshness、当前 Epoch 排除、Sidecar 故障降级和跨来源排名测试
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 8. 闭合 Planning 与 Executing 的 Lookup 循环

  - 在 Coordinator 和 Runner 注入同一 Lookup Port，使成功查询提交结果但不增加 `stepCount`
  - 从 committed lookup 尾部恢复连续计数；前三次允许查询，第四次返回瞬时 `CONTEXT_LOOKUP_CHAIN_LIMIT` 且不追加 Lookup 事件，非 Lookup 结果清零
  - 增加两阶段成功/失败/重启流程、无累计上限、缺失端口保护和链限制测试
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4)_

- [x] //TODO 9. 将 Warm 改为确定性且非阻塞的主调用输入

  - 实现 `DeterministicWarmEntryExtractor`，从 omitted committed 单元的既有摘要、失败、决策元数据和 evidence references 生成候选并交给 `WarmReducer`
  - 从 `TrajectoryModelContextAssembler` 移除同步 Compact 与 Sidecar 写入；Sidecar 不可用时从权威来源同步重建确定性 Warm
  - 增加 Warm/Hot 预算协作、缺失/非法 Sidecar、零 Compact 调用和主请求不等待维护测试
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 10. 实现 ContextMaintenanceWorker 与可选异步 Compact

  - 增加提交后 `ContextMaintenancePort` 与按 Goal/Run single-flight Worker，合并到最高 committed boundary 并原子保存 Warm/检索 Sidecar
  - 默认关闭 LLM Compact；启用时优先独立 Adapter，否则使用主模型配置，并校验 evidence、digest、Schema、Token 上限和结果 boundary
  - 注册 `ManagedResourceRegistry` 并增加 coalescing、过期结果、写入失败、模型失败、graceful close 和 force abort 测试
  - _Requirements: [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

- [x] //TODO 11. 完成 v2 Composition Root 与长任务自动化验证

  - TUI 为新 Goal 冻结 Prompt v8、Snapshot v11、`trajectory-layered@2`、`bm25-lite@2`，装配 Token 能力、Lookup Service、Sidecar Store 与 Maintenance Worker
  - 增加数百条 Conversation/Trajectory、多个 Epoch、进程恢复、早期约束 Cold Lookup 和每轮实际请求硬上限断言的端到端测试
  - 增加 v1 Goal 无新配置启动、v2 缺配置前置失败、默认无 `CONTEXT_LOOKUP_UNAVAILABLE` 与未知协议 fail-closed 回归测试
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.4](./requirements.md#req-1-4), [3.2](./requirements.md#req-3-2), [5.1](./requirements.md#req-5-1), [8.1](./requirements.md#req-8-1)_

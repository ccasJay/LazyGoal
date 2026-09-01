# 长任务模型上下文闭环设计

## Overview

本设计在现有 Snapshot、committed Trajectory、Structured Working Memory 和分层模型上下文之上，引入持久化 `Context Epoch`、真实 Token 硬预算、Conversation/Trajectory 联合检索，以及不阻塞主循环的 Warm 维护。Epoch 只是 Conversation 投影代际，不是供应商侧会话对象，也不复制或删除权威历史。[Req 1–5]

新能力冻结为 Prompt Bundle v8、Snapshot v11、`trajectory-layered@2` 与 `bm25-lite@2`。旧 Prompt v7、Snapshot v10 和 v1 协议走原调用链，不隐式迁移，不读取新版必需配置。[Req 8]

## Architecture

```text
Goal Snapshot + committed Trajectory
        |                    |
        |                    +------> IndexedContextLookupService
        |                                  | restore/rebuild
        v                                  v
ModelInferenceProjector          Retrieval Sidecar v2
        |
        v
TokenBudgetPlanner <--------- ModelCapabilities
        |
        +-- pressure reached --> ContextCheckpoint round
        |                           |
        |                           v
        |                 TrajectoryCheckpointCommitter
        |                 (Memory Patch + Epoch Event + Snapshot)
        |
        +-- active ------------> ContextSelector
                                    |
                                    v
                              final LLMRequest
                                    |
                                    v
                              LLMAdapter

successful Snapshot commit --------> ContextMaintenanceWorker
                                      | deterministic Warm
                                      | retrieval prebuild
                                      + optional async LLM Compact
```

`Runtime` 继续拥有状态转换、提交边界和 Lookup 路由；`Agent` 拥有模型投影、Token 选择与响应协议；`Storage` 只实现 Snapshot/Sidecar Codec 和文件 Store；TUI Composition Root 负责构造真实 tokenizer、Lookup 服务和后台维护资源。

## Components and Interfaces

### 1. 模型能力和最终请求预算

在 Agent 边界新增能力对象，沿用现有 `ModelInputEstimator`，但 v2 只接受 `unit: "token"`：

```ts
interface ModelCapabilities {
    readonly contextWindowTokens: number;
    readonly maxOutputTokens: number;
    readonly tokenEstimator: ModelInputEstimator;
}

interface LLMRequest {
    readonly messages: readonly LLMMessage[];
    readonly maxOutputTokens?: number;
}
```

`TokenBudgetPlanner` 的硬输入上限为：

```text
hardInputLimit = floor(contextWindowTokens * 0.95) - maxOutputTokens
epochPressureLimit = floor(hardInputLimit * 0.85)
```

Planner 必须计量 Renderer 产出的最终 `LLMRequest.messages`，而不是 View 的近似 JSON。每次选择后重新渲染、重新计数；超过硬上限时按完整单元逐层回退。`LLMRequest.maxOutputTokens` 不计入输入 Token，但必须传给所有 Provider Adapter。[Req 1]

TUI 对 v2 新 Goal 要求 `LLM_CONTEXT_WINDOW_TOKENS`、`LLM_MAX_OUTPUT_TOKENS` 和 `LLM_TOKENIZER_ENCODING`。内置 tiktoken encoding resolver；库调用方可注入自定义 `ModelInputEstimator`。不得只凭模型名猜 tokenizer。配置校验延迟到创建 v2 Goal 或调用 v2 模型之前，因此恢复 v1 Goal 不受影响。

### 2. Context Epoch 控制协议

`ModelInferenceView` 增加明确的 `contextEpoch` 字段。该字段是 Runtime 持久化 Epoch 状态的单轮只读投影；`trajectory-layered@2` 必须提供，v1 协议必须省略：

```ts
interface ModelContextEpochView {
    readonly protocolVersion: 1;
    readonly epochNumber: number;
    readonly conversationStartIndex: number;
    readonly openedAtSequence: number;
    readonly control: ModelContextControl;
}

interface ModelContextControl {
    readonly status: "active" | "checkpoint_required";
    readonly reason?: "conversation_pruned" | "input_threshold";
    readonly inputTokens: number;
    readonly hardInputLimit: number;
    readonly remainingTokens: number;
}

interface ModelInferenceView {
    // 既有 prompt/conversation/workingContext/workingMemory/trajectoryContext/lookup 字段
    readonly contextEpoch?: ModelContextEpochView;
}
```

Renderer 将 `contextEpoch` 与 Working Context、Working Memory、Trajectory Context、Lookup Result 一起写入请求末尾的瞬时 user JSON，不把它追加到 `conversation`。因此同一 Snapshot 重建出的字段稳定，模型输出也不会反向污染真实消息历史。

v8 的 Preparation Result 与 AgentDecision Union 共同增加排他的 Context Epoch 结果分支：

```ts
interface ModelContextCheckpointResult {
    readonly kind: "context_checkpoint";
    readonly memoryPatch?: WorkingMemoryPatch;
}

type PreparationResultV8 = ExistingPreparationResult | ModelContextCheckpointResult;
type AgentDecisionV8 = ExistingAgentDecision | ModelContextCheckpointResult;
```

`context_checkpoint` 是模型唯一需要返回的 Epoch 结果字段。它不包含 `epochNumber`、`conversationStartIndex`、`conversationEndIndexExclusive`、`openedAtSequence` 或关闭 sequence；这些持久化字段全部由 Runtime 根据当前 Snapshot、完整 Conversation 单元选择和实际 Trajectory append 结果生成。模型只能通过可选 `memoryPatch` 固化跨 Epoch 仍需保留的语义信息。

```json
{
  "kind": "context_checkpoint",
  "memoryPatch": { "operations": [] }
}
```

压力计算只包含 System/Profile/Tools、Task/Execution、Working Memory、本轮 Lookup、Epoch Control 和当前 Epoch Conversation；Hot/Warm 不参与 85% 触发。首次触发后，模型进入专用 checkpoint round；该轮不消费 `stepCount`，不得携带 Action、完成、提问、task proposal 或普通决策字段。[Req 2, Req 6]

通过检查点后，新 `conversationStartIndex` 选择为仍能让 Epoch 压力低于 85% 的最大最新完整 Conversation 后缀起点；至少保留最新完整单元。若该单元自身仍达到 85% 但未超过硬上限，新 Epoch 从该单元开始，直到增加新的完整 Conversation 单元前不重复触发压力检查点，硬上限仍始终生效。相邻 Epoch 因而可以重叠。[Req 2–3]

Planning proposal 获批时不额外请求模型，Runtime 在批准提交中直接以 `planning_approved` 原因关闭 planning Epoch 并打开 execution Epoch。

### 3. 统一 ContextSelector

每轮按以下顺序使用剩余预算，所有层只接受完整单元：[Req 4]

| 顺序 | 输入 | 可裁剪性 |
|---|---|---|
| 1 | System/Profile/Tools、Task/Execution、Working Memory、Epoch Control | 不可裁剪 |
| 2 | 本轮有界 Lookup Result | 不可裁剪，但结果自身有固定上限 |
| 3 | 最新完整 Conversation 单元 | 不可裁剪 |
| 4 | 最新 Hot 完整执行单元 | 可按最旧优先移除 |
| 5 | 当前 Epoch 更早的 Conversation 完整单元 | 可按最旧优先移除 |
| 6 | Warm Entry | 首先移除 |

Assembler 改为纯读取/选择路径，不再调用 Compact 模型或写 Sidecar。最终输入仍超限时按 `Warm -> older Conversation -> Hot` 删除并重新渲染；权威输入加最新 Conversation 仍超限则在 Adapter 前抛出 `MODEL_CONTEXT_HARD_OVERFLOW`。

### 4. 联合历史 Lookup

`ContextSearchDocument`、Lookup Match 与 Retrieval Sidecar 升级为 v2 来源联合类型：

```ts
type ContextDocumentSource =
    | {
        readonly kind: "trajectory";
        readonly firstSequence: number;
        readonly lastSequence: number;
        readonly sourceEventIds: readonly string[];
    }
    | {
        readonly kind: "conversation";
        readonly messageIndex: number;
        readonly role: "user" | "assistant";
        readonly contentHash: string;
    };

type ContextLookupNeed =
    | "conversation_history"
    | "historical_execution"
    | "decision_rationale";
```

Conversation 文档只保存 message index、role、SHA-256 content hash、有界正文和索引字段；原文仍由 Snapshot messages 拥有。Sidecar v2 额外记录 `conversationEndIndexExclusive` 与 Conversation prefix digest，Snapshot 或 Trajectory 任一摘要不匹配即重建。[Req 3, Req 5]

`ContextSourceRouter` 将 `conversation_history` 限定到 Conversation、`historical_execution` 限定到 Trajectory、`decision_rationale` 查询两者。BM25 排序后，同类等分结果以较新消息或较新 sequence 优先；结果显式返回 source union。Trajectory 命中始终带 historical freshness 警告，不能证明当前外部状态。

新增 `IndexedContextLookupService implements ContextLookupPort`：读取当前 Goal messages 和 committed Trajectory，恢复或重建 v2 索引、执行排名、生成有界结果，并 best-effort 保存 Sidecar/查询 LRU。TUI 将同一实例注入 Coordinator 与 Runner。[Req 5–6]

Planning 与 Executing 各自在一次推进循环中维护连续 Lookup 计数。前三次提交请求和结果但不增加 `stepCount`；第四次返回瞬时 `CONTEXT_LOOKUP_CHAIN_LIMIT`，不调用检索服务也不追加 Lookup 事件。任何非 Lookup 模型结果都会清零计数；重启时从 committed lookup 尾部恢复连续次数，不设置累计上限。[Req 6]

### 5. Warm 后台维护

新增纯 `DeterministicWarmEntryExtractor`，只从已提交、未进入 Hot 的完整执行单元提取已有摘要、失败、决策元数据与 evidence references，再交给 `WarmReducer`。Assembler 在 Sidecar 不可用时同步执行这条确定性重建，因此主调用不依赖后台任务。[Req 7]

Runtime 增加提交后通知端口：

```ts
interface ContextMaintenancePort {
    notifyCommitted(input: {
        readonly goal: Goal;
        readonly committedThroughSequence: number;
    }): void;
}
```

`ContextMaintenanceWorker` 按 Goal/Run single-flight，把重复通知合并到最高 boundary，原子保存 Warm Sidecar，并可预建 Retrieval Sidecar。它注册到 `ManagedResourceRegistry`；`close()` 停止接收并等待当前任务，`forceClose()` 中止任务。后台失败只写 Diagnostic Trace。[Req 7]

LLM Compact 默认关闭。启用时 Worker 优先使用独立 Compact Adapter，否则复用主 Adapter；结果必须再次通过 evidence、来源 digest、Entry schema 和 Token 上限校验。有效结果只替换同 boundary 的 Warm Sidecar，失败或过期结果直接丢弃，主循环从不等待它。

## Data Models

Snapshot v11 在 `RunState` 持久化当前 Epoch：[Req 2–3, Req 8]

```ts
interface ModelContextEpochState {
    readonly version: 1;
    readonly number: number;
    readonly conversationStartIndex: number;
    readonly openedAtSequence: number;
}
```

`messages.length` 是活动 Epoch 的动态结束位置。新 Goal 以 `{ number: 0, conversationStartIndex: 0, openedAtSequence: 0 }` 开始；Runtime 分配所有编号、索引和 sequence，模型不得提交这些值。

Trajectory 新增：

```ts
type ContextEpochEventPayload =
    | {
        readonly type: "context_epoch_advanced";
        readonly closedEpoch: EpochRange;
        readonly openedEpoch: ModelContextEpochState;
        readonly reason: "conversation_pruned" | "input_threshold" | "planning_approved";
        readonly memoryRevisionEventId?: string;
    }
    | {
        readonly type: "context_epoch_closed";
        readonly epoch: EpochRange;
        readonly reason: "run_completed" | "run_failed" | "run_cancelled";
    };

interface EpochRange {
    readonly number: number;
    readonly conversationStartIndex: number;
    readonly conversationEndIndexExclusive: number;
    readonly closedThroughSequence: number;
}
```

检查点 Patch 先按现有 Structured Memory 规则生成 accepted event，再追加 `context_epoch_advanced`，随后由 `TrajectoryCheckpointCommitter` 保存包含新 Epoch 和 `committedThroughSequence` 的 Snapshot。Snapshot 失败时事件只处于未提交 tail，恢复仍看到旧 Epoch。终态事件与终态 Snapshot 使用同一边界；等待、中止和进程退出不生成 close event。

Snapshot Codec 按协议选择写出版本：`trajectory-layered@2` 写 v11；v1 Goal 继续写 v10。Decoder 不把 v10 转成 Epoch，也不把 Prompt v7 改成 v8。未知组合由 `GoalProtocolValidator` fail-closed。[Req 8]

## Key Design Decisions

1. **Epoch 是持久化投影代际，而不是摘要。** 这样保留 LazyGoal 的事件事实、恢复边界与 Working Memory 语义，同时限制每轮 Conversation。[Req 2–3]
2. **硬预算基于最终请求 Token。** 删除字符兜底和 fixed-input soft overflow 在 v2 的正确性角色；近似字符计量仅留给 v1。[Req 1]
3. **历史可达性由 Lookup 保证。** Conversation archive 与 Trajectory index 都是可重建 Sidecar，权威原文不复制到缓存。[Req 3, Req 5]
4. **Warm 不参与正确性。** 确定性提取可以同步重建，LLM Compact 仅是默认关闭的异步质量优化。[Req 7]
5. **按 Goal 冻结兼容协议。** 新旧路径不共享隐式迁移，避免恢复旧 Goal 时因新模型配置或缓存缺失而失败。[Req 8]

## Error Handling

| 错误 | 处理 |
|---|---|
| v2 ModelCapabilities 缺失或 tokenizer 非 Token 模式 | `MODEL_CAPABILITIES_INVALID`，模型调用前失败 |
| 权威输入无法放入硬上限 | `MODEL_CONTEXT_HARD_OVERFLOW`，不调用 Adapter |
| checkpoint 响应、Patch 或 Pending Action 非法 | `MODEL_CONTEXT_CHECKPOINT_INVALID`，不切换 Epoch |
| 第四次连续 Lookup | `CONTEXT_LOOKUP_CHAIN_LIMIT`，不返回虚假命中 |
| Lookup 权威来源不可读 | `lookup_error`；不降级成 `not_found` |
| Sidecar 缺失、损坏、领先或摘要失配 | 丢弃并从权威来源重建 |
| 后台 Warm/Compact/Sidecar 写入失败 | 记录诊断并继续主循环 |
| v11 或 v2 协议组合未知 | Protocol Validator 拒绝读取或调用，不猜测迁移 |

## Testing Strategy

- Agent 单元测试覆盖 95%/85% 预算公式、最终请求重新计数、完整单元裁剪、选择优先级、最大输出透传与硬溢出，对应 Req 1、4。
- Runtime 状态测试覆盖 checkpoint 排他协议、Pending Action 拒绝、Planning→Executing 自动切换、Epoch 重叠、Snapshot 失败留下未提交 tail、恢复及三种终态关闭，对应 Req 2–3。
- Retrieval 测试覆盖 Conversation/Trajectory source union、消息 hash、较新来源优先、双摘要失配重建、查询结果预算和当前状态 freshness，对应 Req 5。
- Coordinator/Runner 集成测试覆盖真实 `IndexedContextLookupService` 注入、Lookup 不增加 `stepCount`、重启恢复连续次数、三次上限及非 Lookup 清零，对应 Req 6。
- Worker 测试覆盖确定性 Warm、single-flight 合并、默认零 Compact 调用、独立模型优先、过期/非法结果丢弃和 graceful/force shutdown，对应 Req 7。
- Codec/Composition Root 测试覆盖 v8/v11/v2 新 Goal、v7/v10/v1 原样恢复、legacy 不读取新 Token 配置和未知协议拒绝，对应 Req 8。
- 长任务端到端测试生成数百条消息与事件，跨多个 Epoch 和进程恢复后检索早期用户约束，并断言每个实际 LLMRequest 都不超过 `hardInputLimit`。

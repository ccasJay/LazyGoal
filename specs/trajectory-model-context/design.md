# Trajectory Model Context 设计

## Overview

本设计在已批准的 Structured Working Memory Core 之上增加单轮模型上下文组装层。它读取 Snapshot committed boundary 内的 Trajectory，将最新完整执行单元投影为 Hot Context，将更早的有价值内容归约为 Warm Compact，并把两者作为独立字段加入 `ModelInferenceView`。Cold Trajectory 仍是事实来源，但按需检索留给下一 Spec。[Req 1, Req 3–5]

现有 Conversation Compactor 继续先裁剪 Conversation；新层对裁剪后的完整基础 View 计量，再分配 Hot/Warm 预算。所有选择与 Compact 只影响本轮模型输入和可删除 Sidecar，不写回 Goal、Working Memory 或 Trajectory。[Req 1–2, Req 7–8]

## Architecture

```text
 [Goal Snapshot] ---- committed boundary --------+
 [WorkingMemory] -------------------------------+ |
 [TrajectoryStore] ---- committed events ------+| |
 [WarmSidecarStore] ---- optional cache -------+|| |
 [Conversation Compactor] ---- base View ------+||| |
                                                vvvv v
                                   [TrajectoryModelContextAssembler]
                                      |       |          |
                                      |       |          +--> [Token/Char Estimator]
                                      |       +-------------> [WarmReducer]
                                      +---------------------> [HotWindowSelector]
                                                   |
                                  +----------------+----------------+
                                  | predicted input still over limit|
                                  v                                 v
                         [deterministic result]        [ContextCompactAdapter]
                                  |                     separate LLM call
                                  +----------------+----------------+
                                                   v
                                      [ModelInferenceView]
                                       hot + warm + budget report
                                                   |
                                                   v
                                           [Primary LLM call]

 Side effect after current Snapshot is already committed:
 [accepted Warm result] --> [WarmSidecarStore atomic replace]
```

Agent 拥有 View 组装、计量和 Compact 模型协议；Runtime 定义只读 Trajectory/Sidecar Port 与冻结协议；Storage 实现 Sidecar 文件。Agent 不写 Snapshot，Storage Sidecar 不参与 Goal 恢复权威判断。

## Key Design Decisions

### 1. 独立冻结 Model Context 协议

`GoalDefinition` 增加 `modelContextProtocol` 判别联合：`conversation@1` 与 `trajectory-layered@1`。Snapshot v8 显式保存该字段；v5/v6 和 Core v7 恢复为 `conversation@1`，只在后续正常保存时升级格式，不自动生成 Sidecar。[Req 8]

Prompt Bundle Manifest 同时声明 Memory 与 Model Context 兼容协议。v1–v3 使用 checkpoint/`conversation@1`，v4 使用 structured/`conversation@1`，v5 使用 structured/`trajectory-layered@1`。新 Goal 冻结 v5；未知版本或交叉组合在模型与持久化副作用前失败。

### 2. 一次计量完整请求，再分配历史预算

`ModelInputEstimator` 返回 `{unit: "token" | "character", count}`。配置了与目标模型匹配的 Token Estimator 时必须使用 Token；否则使用现有 UTF-16 字符估算。`ModelContextBudgetPolicy` 提供总输入预算、响应预留、Warm 上限和大型 preview 上限，Composition Root 对所有值执行正安全整数及总量关系校验。[Req 2]

v1 默认沿用 `196608` 字符总预算；注入模型 Token 上限和匹配 Estimator 后切换为 Token 模式。响应预留默认为总预算的 10%，Warm 上限为剩余历史预算的 25%，Compact 触发比例为候选 Warm 预算的 85%，大型输出 preview 上限为 2048 Token 或字符模式下 8192 字符。所有默认值均可由同一 Policy 显式覆盖，但 Goal 一次恢复执行期间不得切换计量单位。

```text
historyBudget
  = modelInputBudget
  - responseReserve
  - rendered system/profile/tools
  - compacted conversation
  - task/execution
  - workingMemory

warmReserve = min(warmLimit, floor(historyBudget * warmShare))
hotBudget   = historyBudget - warmReserve
unused warmReserve is transferred to Hot and selection runs once more
```

Estimator 对最终渲染结构计量，不以 Trajectory 原始 JSON 大小替代模型输入大小。固定内容超限时 Hot/Warm 为空，完整固定结构继续发送，并写入 `model_context_soft_overflow` Diagnostic Trace；不会拆分结构化字段。

### 3. Hot Window 只选择合法连续执行单元

`TrajectoryExecutionUnitAdapter` 替换当前“无 executionUnitId 也各自成单元”的宽松投影。它只接受 committed events，并按 `executionUnitId` 聚合 Decision、Action、Tool 与 Observation；生命周期、commit marker、Memory Patch 和不完整单元不进入 Hot。单元按 sequence 严格递增，身份或结构异常直接失败。[Req 1, Req 3]

`HotWindowSelector` 从最新单元向前累计估算值，遇到首个超限单元即停止。选择结果保持连续后缀；最新单元也不享受现有 Conversation Compactor 的“强制保留”例外，因为固定 execution/previousStep 已提供最低连续性。

### 4. 大型输出投影为稳定预览与引用

`TrajectoryEventProjector` 在构建模型 DTO 时对 Tool 结果执行有界投影。内容超过 preview 上限时返回 prefix/suffix preview、SHA-256、来源 sequence range、`truncated: true` 和输入中已有的可选 artifact reference；它不创建新的 Artifact Store，也不声称当前已被 Tool 层丢弃的内容可以恢复。[Req 4]

hash 针对投影前可用的 Observation payload 计算。同一 payload 和协议版本产生相同 hash；artifact 缺失时输出 `artifactAvailability: "unavailable"`。后续 Retrieval 只能按正常 Context Source 规则解析引用。

### 5. Warm 使用分区配额与确定性语义 LRU

Warm 条目按 `kind` 分区，每区有独立容量与计量上限。`WarmReducer` 先按 stable ID 和 source hash 合并，删除 `superseded`，再在每区内使用以下升序元组切分为 `retained` 与 `overflowCandidates`；`retained` 必须满足条目数和预算，overflow 只用于本轮 Compact 候选，不直接进入模型输入：[Req 5]

```text
(statusRank, protectionRank, cappedReinforcement, lastAccessedSequence,
 lastSequence, stableId)

evict first:
  resolved -> inactive -> active
  unprotected -> protected-within-quota
  lower reinforcement -> older access -> older evidence -> lexical ID
```

保护只改变分区内顺序，不绕过分区配额。`reinforcementCount` 只因新的 committed evidence 或后续 Retrieval 命中增加；模型重复文本不更新。被淘汰条目只从 Warm 消失，Cold Trajectory 不变。

### 6. Compact 模型是可失败的独立优化

只有 `retained + overflowCandidates` 的预测输入仍超过 `compactTriggerRatio`，且 overflow 中仍有未被现有 Warm 表达的 committed 候选时，Assembler 才调用一次 `ContextCompactAdapter`，尝试把多个 overflow 候选压成可替换的少量 Warm 条目。输入包含已有 Warm、候选执行单元的有界 DTO、允许类别和剩余预算；输出使用严格 Schema，不接受自由文本。[Req 6]

Compact 结果必须引用输入 source range/evidence，不能产生 Task、用户约束或 Runtime 控制字段。请求、响应、计量、耗时、Provider metadata 与错误写入独立 `context_compact_*` Diagnostic Trace。失败、中止或非法响应时沿用确定性 Warm；Sidecar 仅在完整候选校验成功后替换。

### 7. Sidecar 通过来源摘要验证但不成为权威

Runtime 定义 `WarmContextSidecarStore` Port，Storage 使用 `.lazygoal/context-sidecars/<goal>/<run>/warm-v1.json` 原子替换并限制文件权限。Sidecar 的 `sourceDigest` 是从 genesis 到 `derivedThroughSequence` 的 committed event canonical envelope SHA-256；验证可以读取该前缀，优化目标是避免重复 Compact 模型调用而非避免磁盘读取。[Req 7]

Sidecar 可落后于 Snapshot：验证前缀后，Assembler 读取 `(derivedThroughSequence, committedThroughSequence]` 并增量归约。Sidecar 领先、身份/版本/hash 失配、损坏或缺失时从 committed Trajectory 完整重建。读取或写入缓存失败记录诊断并继续；只有权威 Trajectory 失败才阻止 structured Goal 的模型调用。

## Data Models

```ts
type ModelContextProtocol =
    | { readonly kind: "conversation"; readonly version: 1 }
    | { readonly kind: "trajectory-layered"; readonly version: 1 };

interface ModelTrajectoryContext {
    readonly measuredAs: "token" | "character";
    readonly softOverflow: boolean;
    readonly hot: readonly ModelExecutionUnit[];
    readonly warm: readonly ModelWarmEntry[];
}

interface WarmCompactEntry {
    readonly id: string;
    readonly kind: "decision" | "finding" | "failure" | "blocker" | "unresolved";
    readonly summary: string;
    readonly status: "active" | "resolved" | "superseded";
    readonly lossy: true;
    readonly evidenceSequences: readonly number[];
    readonly firstSequence: number;
    readonly lastSequence: number;
    readonly lastAccessedSequence: number;
    readonly reinforcementCount: number;
    readonly sourceHash: string;
}

interface WarmCompactSidecar {
    readonly schemaVersion: 1;
    readonly goalId: string;
    readonly runId: string;
    readonly derivedThroughSequence: number;
    readonly sourceDigest: string;
    readonly compactorVersion: string;
    readonly entries: readonly WarmCompactEntry[];
}
```

`ModelInferenceView` 增加独立 `trajectoryContext?: ModelTrajectoryContext`。`conversation@1` 必须省略该字段；`trajectory-layered@1` 必须提供该字段，即使 Hot/Warm 都为空。Sidecar DTO 不包含 Goal Task、Working Memory 或 Runtime execution。

## Error Handling

```text
[Context assembly failure]
  invalid budget / protocol mismatch
    -> fail before LLM and Sidecar writes
  committed Trajectory missing or corrupt
    -> MODEL_CONTEXT_TRAJECTORY_ERROR; block primary LLM
  malformed execution unit / identity / sequence
    -> MODEL_CONTEXT_SOURCE_ERROR; block primary LLM
  Sidecar missing / stale / corrupt / write failed
    -> ignore or rebuild; diagnostic only
  Compact adapter failed / aborted / invalid response
    -> discard candidate; deterministic Warm remains
  fixed input exceeds budget
    -> empty Hot/Warm; emit soft-overflow diagnostic; continue primary LLM
```

## Testing Strategy

- 协议与 Storage 测试覆盖 Snapshot v8、v5–v7 只读映射、Prompt v1–v5 兼容矩阵和未知组合拒绝，对应 Req 8。
- Estimator/BudgetPlanner 属性测试覆盖 Token 优先、字符兜底、响应预留、Warm 预算回借、非法配置和固定输入软超限，对应 Req 2。
- Adapter/HotWindowSelector 测试覆盖执行单元完整性、连续后缀、首个超限停止、tail/marker 排除及无输入变更，对应 Req 1、3。
- 大型输出投影测试固定 preview、hash、sequence、artifact 可用性与原 Observation 不变，对应 Req 4。
- WarmReducer 测试覆盖 stable ID 合并、状态失效、分区配额、保护上限、reinforcement 来源和确定性淘汰顺序，对应 Req 5。
- Compact Adapter 测试覆盖单次触发、严格 Schema、来源校验、独立 Trace、失败回退和 Sidecar 不污染，对应 Req 6。
- Sidecar Store/恢复集成测试覆盖原子替换、权限、有效前缀、落后增量、领先/损坏/hash 失配回退、删除后重建和写入故障隔离，对应 Req 7。
- Agent/Runtime/TUI 集成回归验证 Preparation/Executing 共享组装器、legacy Conversation 行为不变，并执行相关包测试、typecheck 与依赖边界检查。

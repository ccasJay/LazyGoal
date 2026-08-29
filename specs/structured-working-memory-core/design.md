# 结构化 Working Memory Core 设计

## Overview

本设计在现有 Goal Snapshot 与事实型 Trajectory 之间增加可重建的结构化 Working Memory。Memory 内容只存在于一次 Coordinator/Runner 调用链内；Snapshot 仅保存协议选择和 Memory revision 指针，Trajectory 保存获接受的规范化 Patch。模型输入继续从 Runtime State 投影 execution，Memory 只承载 Finding、Hypothesis、Plan、Blocker 与 nextAction。[Req 1–2, Req 5]

本 Spec 同时升级 Preparation 与 Executing 的响应协议、提交顺序和恢复校验。Hot/Warm/Cold 上下文、Compact、Sidecar 与全文检索不在本设计中实现；后续 Spec 只能消费这里定义的 WorkingMemory、revision 和 evidence 契约。[Req 3–7]

## Architecture

```text
                          [Composition Root]
                  freeze protocol; inject adapters/limits
                                   |
                                   v
                         [Coordinator / Runner]
                           |               |
               model I/O   |               | memory commit/rebuild
                           v               v
                    [Agent Adapter]   [Runtime Memory Core]
                 Prompt v1-v4        |               |
                 strict Schema       |               +-- [WorkingMemorySession]
                 Memory DTO          |               |    validate/reduce/index
                                     |               |
                                     +-- [TrajectoryCheckpointCommitter]
                                                |              |
                                           facts/Patch    Snapshot/revision
                                                v              v
                                      [TrajectoryStore]   [GoalStore]
                                                ^              ^
                                                +--[Storage]---+

 Shared Runtime Domain contract:
 MemoryProtocol / WorkingMemory / Patch / Entry / MemoryRevision
```

`WorkingMemorySession` 在首次模型调用或 Runtime 生命周期 Patch 前打开，使用 Snapshot 选择的 revision 链重建 Memory。调用返回 waiting、terminal、错误或中止后不保留进程级缓存；后续 Sidecar 只能优化该加载过程，不能改变重建结果。

## Key Design Decisions

### 1. 将 Memory 协议作为 Goal 冻结定义

`GoalDefinition` 增加 `memoryProtocol` 判别联合：`checkpoint@1` 与 `structured@1`。新 Goal 由 Composition Root 冻结 `structured@1`；现有 Snapshot v5/v6 解码为 `checkpoint@1`，其 checkpoint、Step 与无 Trajectory 兼容路径保持不变。[Req 1]

Prompt Bundle Manifest 声明唯一兼容的 Memory 协议。Agent 提供实现 Runtime `GoalProtocolValidator` Port 的适配器，Launcher 在首次保存前、Coordinator/Runner 在任何状态转换和模型调用前校验 `{promptBundleVersion, memoryProtocol}`。新 Prompt Bundle v4 使用 `structured@1`，v1–v3 保持 `checkpoint@1`；未知版本或交叉组合直接失败，不回退。

Storage 使用 Snapshot v7 显式保存 `memoryProtocol`。v5/v6 只读恢复为 legacy，下一次正常业务保存才写成 v7；该升级不生成 Working Memory，也不把 checkpoint 转成 Patch。

### 2. 使用 Memory revision 链选择真正提交的 Patch

仅靠 `committedThroughSequence` 不足以选择 Patch：某次 Patch Event 追加成功但 Snapshot 保存失败后，后续更大的前缀边界可能覆盖该旧 sequence。为避免旧 tail 被意外应用，结构化协议的 `RunState` 增加可选 `memoryRevision: { eventId, sequence }`，它只指向最新快照选择的 Patch 链头，不保存 Memory 内容。[Req 4–5]

```text
Snapshot
  committedThroughSequence = 42
  memoryRevision = E40
          |
          v
        [E40] --parent--> [E31] --parent--> [E12] --parent--> genesis
          |                 |                 |
          +-----------------+-----------------+
                            |
                 validate, reverse, reduce
                            v
                 [WorkingMemory @ sequence 42]

Not selected:
  [E35 orphan Patch]   -- not reachable from E40
  [E44 tail Patch]     -- beyond committedThroughSequence
  [decision_received]  -- not an accepted Patch event
```

每个 accepted Patch 保存 `parentRevisionEventId`。恢复器沿 Snapshot 指针反查，再按 sequence 正序归约；缺失、跨 Goal/Run、越界、循环或 parent 不连续均为恢复错误。没有 Patch 的提交保持旧 revision，但将 `derivedThroughSequence` 推进到 Snapshot 边界。`state_committed` 只供审计，不参与选择。[Req 4–5]

### 3. 统一 Coordinator 与 Runner 的提交入口

Runtime 新增共享的 `TrajectoryCheckpointCommitter`，替换 Coordinator 与 Runner 中重复的事实高水位、Snapshot 保存和 marker 追加顺序。它追加一组已验证业务事实与可选规范化 Patch，返回实际 Event，并在保存副本中同时推进 `committedThroughSequence` 与 `memoryRevision`。[Req 4]

```text
[Preparation result | Executing decision]
        |
        v
[branch validation]
  Preparation: result -> patch -> target workflow
  Executing: decision -> tool/policy/input/action/evidence -> patch
        |
        +-- rejected --> [stop; no accepted Patch]
        |
        `-- accepted --> [normalize model + lifecycle Patch]
                                 |
                                 v
        [business facts] -> [accepted Patch] -> [save Snapshot]
                                                   |
                         +-------------------------+------------------+
                         | failed                                    | succeeded
                         v                                           v
              [old revision; no Session]                       [apply Session]
                                                                     |
                                                                     v
                                                            [commit marker]
                                                              |           |
                                                           failed      succeeded
                                                              |           |
                                                     [committed; error]  [state /
                                                                         approval /
                                                                         external effect]
```

Tool Action 的 Patch 与 `action_staged`、终止 Decision 的 Patch 与终态事实分别进入同一次 Snapshot 保存。`decision_received` 可保留原始审计事实，但 Reducer 只消费 `memory_patch_accepted`。Snapshot 失败不更新 Session；marker 失败保留已提交 Snapshot 语义并传播现有诊断错误。[Req 4]

### 4. 由 Runtime 生成阶段生命周期 Patch

模型 Patch 与 Runtime 生命周期规则先在内存中合成为一个规范化 Patch，每个 stable ID 最多保留一个最终操作。条目记录 `originPhase`、accepted Event 的 `originSequence`、`scope` 和 `status`。Finding 默认 `goal` scope；Hypothesis、Plan 与 nextAction 固定为 `phase` scope；Blocker 必须显式选择 scope。[Req 2, Req 6]

```text
[gathering_context]
        |
        | context_ready
        | keep: Finding
        | supersede: phase Hypothesis, nextAction
        v
    [planning] <------------------------------------+
        |                                           |
        +-- feedback --> supersede through revision-+
        |                Plan, Hypothesis, nextAction
        |
        +-- approval --> keep: goal Finding, active goal Blocker
                         supersede: other Preparation control intent
                                |
                                v
                          [executing]
```

用户输入导致的生命周期 Patch 不需要模型调用，也通过同一 revision/commit 协议保存。模型显式解决或替代条目时必须引用 stable ID；目标不存在则整个 Patch 失败。Reducer 不从当前 workflow 猜测过去发生的失效操作。

### 5. Evidence Gate 只认可已提交事实 Event

`WorkingMemorySession` 加载 committed Trajectory 时建立 sequence 到 Event 的只读索引。Patch Validator 要求 Finding 的 evidence 位于当前 Goal/Run、Snapshot 旧提交边界内，并属于允许的 Observation 或其他事实类型；当前模型响应刚追加的 Decision、Commit marker、Compact 和未提交 tail 不能作为 Finding 证据。[Req 7]

结构化 `complete` Decision 增加 `completionEvidence`，按 Goal Task 的 criterion index 精确覆盖每个 Completion Criterion，并为每项提供至少一个合法 sequence；空 criteria 对应空列表。验证发生在 accepted Patch 和终态事实追加前。Runtime 只验证引用完整性和来源类别，不判断自然语言归纳是否真实。

### 6. Working Memory 与 execution 分开投影

```text
[Runtime State] ---------> execution -------+
[WorkingMemorySession] --> workingMemory ---+--> [ModelInferenceView] --> [Agent]
[Conversation] ----------> conversation ----+
[Prompt environment] ----> environment -----+

No cross-write: workingMemory -X-> execution / conversation / environment
```

PreparationExecutor 与 StepExecutor 改用单一输入对象，包含 `goal`、授权 Tools、`workingMemory` 和可选 ExecutionControl。新协议必须提供 WorkingMemory，旧协议必须省略它。[Req 2–3]

Prompt Bundle v4 的三个 Phase Protocol 都描述 Patch 和 Evidence 规则；严格 Response Schema 按冻结协议选择 legacy 或 structured 分支。Structured AgentDecision 不含 checkpoint，Run transition 也不更新 `RunState.checkpoint`；previousStep、pendingAction、Step 计数和终态继续由现有 Runtime State 产生。

### 7. 在接受时执行限制，重放时信任已接受 Event

`WorkingMemoryLimits` 由 Composition Root 注入，v1 默认限制为：单 Patch 32 个操作、序列化后 32 KiB、stable ID 128 字符、单项文本 2048 字符、单 Finding 16 个 evidence、64 个 Finding、32 个 Hypothesis、32 个 PlanItem 和 16 个 Blocker。超过任一限制时整个 Patch 失败，不做截断。[Req 3]

限制只在接受 Patch 时执行；恢复时对 Event Schema、revision 链和最终集合不变量进行校验，但不使用可能已变化的运行配置重新拒绝历史 Patch。文本字段只保存有界归纳，大型 Tool 输出通过 evidence sequence 引用原始 Observation。

## Data Models

```ts
type MemoryProtocol =
    | { readonly kind: "checkpoint"; readonly version: 1 }
    | { readonly kind: "structured"; readonly version: 1 };

interface MemoryRevision {
    readonly eventId: string;
    readonly sequence: number;
}

interface MemoryEntryBase {
    readonly id: string;
    readonly originPhase: TrajectoryPhase;
    readonly originSequence: number;
    readonly scope: "goal" | "phase";
    readonly status: "active" | "resolved" | "superseded";
}

interface WorkingMemory {
    readonly protocolVersion: 1;
    readonly derivedThroughSequence: number;
    readonly revision?: MemoryRevision;
    readonly findings: readonly EvidenceBackedFinding[];
    readonly hypotheses: readonly Hypothesis[];
    readonly plan: readonly PlanItem[];
    readonly blockers: readonly Blocker[];
    readonly nextAction?: NextAction;
}
```

模型可提出的有序操作仅包括 `add_finding`、`update_finding`、`upsert_hypothesis`、`upsert_plan_item`、`upsert_blocker` 和 `set_next_action`。Runtime 规范化阶段额外允许内部 `supersede_scope`；该操作不出现在模型 Response Schema。`memory_patch_accepted` 保存规范化后的最终操作，而不是运行时派生状态。

```ts
interface MemoryPatchAcceptedPayload {
    readonly type: "memory_patch_accepted";
    readonly protocolVersion: 1;
    readonly producers: readonly ("model" | "runtime_lifecycle")[];
    readonly parentRevisionEventId?: string;
    readonly operations: readonly CanonicalMemoryOperation[];
}
```

`producers` 必须按 `model`、`runtime_lifecycle` 的固定顺序去重。单一来源 Patch 只含一个值；Runtime 在提交前合并模型操作与生命周期操作时同时记录两个来源。

Snapshot v7 只新增 `definition.memoryProtocol` 与 `state.run.memoryRevision`；WorkingMemory 集合、Reducer 进度缓存和验证索引均不进入 Snapshot。`checkpoint@1` Goal 不得含有 `memoryRevision`；`structured@1` Goal 不得含有 legacy `run.checkpoint`。`memoryRevision` 只允许在尚未提交首个 Patch 时缺省，存在时其 sequence 不得超过 `committedThroughSequence`。持久化 `lastStep` 的 Decision 必须按 Goal 冻结的协议选择对应 Response Shape 解码。

## Error Handling

```text
[Failure routing]
  unknown protocol / Prompt mismatch
    -> stable protocol error before model or persistence effects
  structured Goal without readable Trajectory
    -> WORKING_MEMORY_TRAJECTORY_REQUIRED; never continue empty
  invalid Patch schema / limits / ID / state / evidence
    +-> Preparation: propagate protocol error
    `-> Executing: INVALID_MEMORY_PATCH; stop current Run
  accepted Event append failed
    -> fail closed; no Snapshot, Tool effect, or Session update
  Snapshot save failed
    -> retain old revision; new Patch remains an orphan branch
  commit marker append failed
    -> retain committed Snapshot/revision; diagnose and propagate
  revision missing / out of range / cross-Run / cyclic / corrupt
    -> WORKING_MEMORY_RECOVERY_ERROR; block the next model call
```

## Testing Strategy

- Runtime 单元测试覆盖 Patch 原子校验、默认限制、stable ID、状态转换、Evidence 类型以及 lifecycle 规范化，对应 Req 2–3、6–7。
- Reducer 测试覆盖 genesis、线性 revision、Snapshot 失败产生的孤儿分支、后续更大 sequence 边界、重复读取和损坏链，证明同一 Snapshot 得到等价 Memory，对应 Req 4–5。
- Coordinator 集成测试覆盖三个 Preparation 结果携带 Patch、阶段切换、planning feedback/approval 的 Runtime lifecycle Patch，以及保存失败不更新 Session，对应 Req 3–6。
- Runner 集成测试覆盖允许、需批准和被拒绝 Tool Decision，终止 Decision 的 Completion Evidence，以及 Tool 外部作用前 Patch 与 pendingAction 同时提交，对应 Req 4、7。
- Agent 测试固定 v1–v3 checkpoint Schema 与 Prompt 输出，并新增 v4 三阶段 structured Schema、无 Patch 响应、非法额外字段和 WorkingMemory 独立投影，对应 Req 1–3。
- Storage 测试覆盖 v5/v6 只读恢复为 `checkpoint@1`、v7 两种协议 round-trip、revision 跨字段不变量、未知协议拒绝和恢复不写回，对应 Req 1、4–5。
- Composition Root 与依赖检查验证新 Goal 冻结 v4/`structured@1`、legacy 无 Trajectory 路径保持可用、新协议缺依赖在首次保存前失败。
- Core 完成后执行 Runtime、Agent、Storage、TUI 相关回归；ALFWorld/SWE 强制中断 Benchmark 留到三个 Spec 全部实现后统一验收。

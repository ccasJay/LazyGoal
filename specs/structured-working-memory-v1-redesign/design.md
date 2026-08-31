# Structured Working Memory v1 重设计

## Overview

本设计直接替换未发布的 `structured@1` 数据形状，不迁移旧 structured Goal。Working Memory 成为从 committed canonical Patch 链投影出的有界实体状态；Trajectory 仍是唯一持久历史，Working Context 继续持有即时控制信息。[Req 1–7]

```text
Model Decision                         Tool Execution
memoryPatch                                 |
     |                                      v
     v                              Action + Observation
[Schema / Evidence Gate]                    |
     |                                      v
     v                           [optional ToolMemoryProjector]
[Admission + Canonicalization]              |
     |                                      v
     +--------------------------> candidate Fact proposals
                                            |
                                            v
                               [Admission + Lifecycle + Capacity]
                                            |
                                            v
             canonical Patch -> Trajectory -> Snapshot -> Session
                                            |
                                            v
                            WorkingMemory for next model call
```

模型 Patch 在关联 Action 执行前提交。Projector Patch 在工具返回后生成；Observation sequence 先预分配，Observation、Projector Patch 与 Snapshot 共享提交边界。任一 Memory 候选失败都不得吞掉合法 Observation。

## Key Design Decisions

### 1. Fact identity 与内容分离

Fact identity 只由 NFC 规范化并去除首尾空白后的 `{subject, predicate}` 决定。Runtime 生成 `fact:<sha256-prefix>` canonical ID；`value`、stability 与 evidence 不参与身份，因此新观察可以强化或替换同一实体属性。

`stable` 表示在更新证据出现前持续成立；`last_observed` 只陈述某个 sequence 的观察，不足以证明恢复后的当前外部状态。Prompt 必须要求模型在需要当前状态时重新观察。

### 2. Runtime 是唯一提交权威

模型和 Projector 只产生 proposal。Runtime 依序执行 schema、evidence、引用、控制字段、canonicalization、lifecycle 和 capacity；accepted Event 只保存 canonical operation。

```text
proposal operations
       |
       v
schema -> evidence -> reference -> forbidden-state gate
       | reject
       v
normalize identity/value/evidence
       |
       v
merge / supersede / suppress
       |
       v
lifecycle cleanup -> deterministic retention
       |
       v
canonical operations + evict_entries
```

全部 proposal 被抑制时返回 `undefined` accepted Patch，Runner 继续执行关联 Action。拒绝表示候选违反契约；模型 Patch 使用既有决策拒绝路径，Projector Patch 只记 Diagnostic Trace。

### 3. Projector 是独立同步 Port

Core 只提供 Registry 与默认空实现，不包含 ALFWorld 或 SWE 规则。Registry 按 tool 名选择 Projector；未注册等价于 `unknown`。

```text
Runner             TrajectoryCommitter       ToolMemoryProjector
  | reserve observation sequence |                    |
  |------------------------------>|                    |
  | project(goal, action, observation, seq, memory)    |
  |--------------------------------------------------->|
  |<---------------- result / throw -------------------|
  | normalize projector proposals |                    |
  |------------------------------>|                    |
  | commit observation + patch + snapshot              |
  |------------------------------>|                    |
```

Projector 输出只允许 Fact proposals，不可创建计划或 blocker；source 固定为 `tool_projector`，evidence 必须包含预分配 Observation sequence。

### 4. 容量选择持久化结果

容量限制在接受 Patch 时计算，恢复只重放结果。活跃 Blocker、活跃 PlanItem 及其有效 Fact 依赖属于 protected set。其余条目按类别和 utility 组成稳定淘汰序列：

```text
protected: active blockers + active plans + referenced facts
                    |
                    v
unprotected eviction order
  hypotheses
      -> last_observed facts
      -> stable facts
      -> inactive plan/blocker entries

within category:
  reinforcement ASC -> lastEvidence ASC -> updatedAt ASC -> id ASC
```

候选若被选择算法立即淘汰，proposal 以 `capacity_low_utility` 抑制。protected set 单独已超预算时拒绝 Patch。所有实际淘汰通过内部 `evict_entries` 写入 accepted Event。

### 5. 版本边界不执行旧形状迁移

Prompt Bundle v7 是新 shape 的唯一 structured bundle；Snapshot v10 是当前写版本。Storage 继续解码 v7–v9，但 Agent protocol validator 对 v4–v6 structured Goal 返回稳定错误。checkpoint v1–v3 不经过 Working Memory 重建。

## Components and Interfaces

```ts
interface ToolMemoryProjector {
  project(input: ToolMemoryProjectionInput): ToolMemoryProjectionResult;
}

interface MemoryAdmissionPolicy {
  admit(input: MemoryAdmissionInput): MemoryAdmissionResult;
}
```

`ToolMemoryProjectionResult.status` 为 `changed | no_op | rejected | unknown`。`changed` 必须携带至少一个 Fact proposal；其余状态不得改变 Memory。`MemoryAdmissionResult` 明确区分 accepted、suppressed 与 rejected，便于 Runner 决定是否落 accepted Event。

Registry 与 Policy 均由 Runtime package 导出。Runner dependency 可选注入 Registry；默认实现不改变现有工具行为。

## Data Models

```ts
type FactStability = "stable" | "last_observed";
type MemoryEntrySource = "model" | "tool_projector" | "runtime";
type PlanItemStatus =
  | "pending" | "active" | "completed" | "blocked" | "superseded";

interface EvidenceBackedFact {
  kind: "fact";
  id: string;
  subject: string;
  predicate: string;
  value: JsonValue;
  stability: FactStability;
  evidenceSequences: number[];
  reinforcementCount: number;
  lastEvidenceSequence: number;
  scope: MemoryScope;
  source: MemoryEntrySource;
  createdAtSequence: number;
  updatedAtSequence: number;
}

interface WorkingMemory {
  protocolVersion: 1;
  facts: EvidenceBackedFact[];
  hypotheses: MemoryHypothesis[];
  plan: MemoryPlanItem[];
  blockers: MemoryBlocker[];
}
```

create 操作不含 ID；Hypothesis、PlanItem、Blocker 的 ID 由 `kind:<accepted-sequence>:<operation-index>` 产生。update 操作只接受现有同类 ID。Fact retire 记录 canonical 删除操作，历史值仍存在于 Trajectory。

PlanItem 的 `dependsOnFactIds` 与 `dependsOnPlanItemIds` 必须引用当前有效条目；进入 `completed` 必须提供 completion evidence。Runtime 只验证并应用显式状态转换，不推断任务完成。

Canonical Patch 额外允许：

- `evict_entries`：记录确定性容量结果。
- `supersede_scope`：阶段切换或终态清理。

## Error Handling

- Schema、evidence、非法引用、同 sequence 无优先级冲突、protected overflow：拒绝，使用稳定 reason code。
- duplicate、stale evidence、covered update、capacity low utility：抑制，不写 accepted Event。
- Projector missing：`unknown`，无 Diagnostic。
- Projector throw/invalid：记录 Diagnostic Trace，Observation 继续提交。
- v4–v6 structured Goal：在模型调用及 Memory rebuild 前返回 `UNSUPPORTED_STRUCTURED_MEMORY_SHAPE`。

## Testing Strategy

Runtime 单元测试覆盖 Fact identity、JSON 深度、stable/last-observed、evidence 合并与新旧冲突、Runtime ID、引用约束、Plan 状态转换、阶段与终态清理、容量排序、protected overflow、canonical eviction replay 和孤儿 revision。

Runner 集成测试使用 Fake Projector 验证成功投影、no-op、throw、非法输出，以及 Observation/Projector Patch/Snapshot 的原子边界；并比较连续执行与恢复投影。

Agent/Storage 回归固定 Prompt Bundle v7 Schema、Snapshot v10 round-trip、v7–v9 decode、旧 structured Goal 稳定拒绝及 checkpoint Goal 兼容。ALFWorld 仅执行 smoke，验证无 `set_next_action` 和无重复/陈旧 accepted Fact，不将领域提炼质量作为本 Spec 的通过条件。

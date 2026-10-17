# Preparation Runtime Flow 设计

## Overview

本设计把 Preparation 的模型输出限制为一次性结构化输入，把可恢复语义收敛到
`GoalCoordinator`、`memory_patch_accepted` 和 Snapshot committed boundary。模型原文
仍只属于诊断 Trace（若上层脱敏策略允许），不进入 Goal、Trajectory 事实或 Working
Memory。实现以当前 `dev` 的四个 v1 协议组合为唯一组合，不引入迁移分支。

## Architecture

```text
PreparationExecutor / user input
            |
            v
GoalCoordinator -> phase policy -> EvidenceGate -> WorkingMemoryCore.normalize
            |                                      |
            +---------- accepted facts + Patch ----+
                              |
                              v
        TrajectoryCheckpointCommitter[one TrajectoryStore]
                              |
                              v
                    Goal Snapshot boundary
                              |
                              v
             WorkingMemorySession.restore -> Executor
```

`Goal` 继续拥有原始 `intent` 和真实 Conversation；Session 拥有进程内临时 Working Memory
与 provenance 投影；Trajectory 拥有不可变事实；Snapshot 只拥有当前 Runtime 状态和
committed boundary。Executing 不能从 `PreparationResult` 或未提交 tail 读取 Preparation 语义。

## Key Design Decisions

### 结果与阶段准入

`PreparationResult.kind` 是唯一的流程分支选择器。`task_proposal` 的 `task` 先由 workflow
的 `proposal` 保存，批准时通过已有的 `cloneTask` 复制到最终 `workflow.task`；`approvalRequest`
只用于展示。`memoryPatch` 始终是未接受输入，不扩展 Goal State，也不把模型响应整体写入
领域事件（对应 `req-1`）。

Coordinator、Runner 和 Tool Projector 对模型 Patch 使用同一条 Runtime 管线：

```text
raw schema -> phase policy -> Evidence scope -> canonicalize -> commit
```

`working-memory-core.ts` 提供唯一的纯 `validateMemoryPatchPhase` 策略入口。它在
canonicalize 前检查原始 `create_plan_item` / `update_plan_item`，按当前 Memory 判断已有
PlanItem；调用方不得复制阶段表。非法操作使整个 Patch 原子拒绝。

| phase | 模型 Patch 允许的 Plan 操作 |
| --- | --- |
| `gathering_context` | 不允许创建或更新 `PlanItem`；Fact、Hypothesis、Blocker 可写 |
| `planning` | 可创建或更新 `PlanItem`，也可写其它三类条目 |
| `executing` | 只能更新已有 `PlanItem`，禁止创建；其它条目按现有执行策略处理 |

Runtime 自己生成的阶段清理 `supersede_scope` 不经过模型阶段策略，只能清理已有阶段条目。
所有来源最终都通过同一 canonical accepted Patch 提交（对应 `req-2`、`req-3`）。

### Provenance 与 Evidence scope

`trajectory.ts` 增加纯 UTF-8 SHA-256 `computeContentHash`，由 Trajectory provenance 和
`conversation-context-document.ts` 共用；Conversation prefix digest 仍使用自己的组合摘要，
不与单消息 hash 混用。

同一事件协议版本内增加：

```ts
type PreparationInputRecordedPayload = {
    readonly type: "preparation_input_recorded";
    readonly messageIndex: number;
    readonly contentHash: `sha256:${string}`;
};
```

payload 只有上述三个字段，`messageIndex` 是非负安全整数，hash 匹配 `^sha256:[0-9a-f]{64}$`；
事件 metadata 的 `phase` 只能是 `gathering_context` 或 `planning`。事件归入 lifecycle 类别，
但不是 Observation。

初始创建边界依次追加 `goal_created`、`preparation_input_recorded`，再保存 Snapshot 并追加
`state_committed`。gathering 回复和 planning 反馈在 `run_resumed` 后追加 provenance，再沿
现有 facts → accepted Patch → Snapshot 顺序提交；approve 没有新用户消息。`intent` 和真实消息
仍保存原文，仅 provenance 事件采用 hash-only（对应 `req-4`）。

`EvidenceValidationScope` 只有 `preparation | execution`：

- `preparation` 的 Fact create/update 可引用已提交且已验证的
  `preparation_input_recorded`，也可引用合法 Tool/Observation。
- `retire_fact` 不接受该 provenance，避免 canonical operation 丢失 evidence；失效 Fact
  必须使用现有合法 Tool/Observation 证据。
- `execution` 不接受该事件；Plan completion evidence 无论 Patch 来自哪个阶段，都强制
  按 `execution` 校验，只接受 committed Tool/Observation。

`WorkingMemorySession.restore` 按 accepted Patch 事件的 `phase` 选择 replay scope，从 committed
事件建立 Evidence index，检查 provenance 的 Goal message index、`user` 角色和 hash 后通过隔离
getter 暴露。tail、缺失消息、assistant 消息和 hash 不匹配均抛出 `WorkingMemoryRecoveryError`。
Coordinator 只把 getter 传给 Preparation；`StepExecutionInput` 和 `buildStepRequest` 不增加该字段
（对应 `req-4`、`req-5`）。

### Conversation 索引与模型投影

`ModelConversationMessage` 增加必需的 `sourceMessageIndex`，由 Projector 使用 `goal.state.messages`
的原始数组索引填充。Adapter、Compactor、Trajectory assembler 和深拷贝路径只复制该字段；所有
Context Epoch 过滤都按 source index 与 `conversationStartIndex` 比较，不按裁剪后数组位置 `slice`。

内部保留 `ModelInferenceView.preparationInputEvidence`，但不在中间变换阶段维护可见 map。最终
Conversation、compaction 和 token pruning 都完成后，由一个 renderer helper 一次性生成模型控制
消息中的：

```ts
type VisibleConversationMessageMapEntry = {
    readonly visibleIndex: number;
    readonly sourceMessageIndex: number;
};

type ModelPreparationInputEvidence = {
    readonly sequence: number;
    readonly messageIndex: number;
    readonly contentHash: `sha256:${string}`;
};
```

这里的 `workingContext` 指现有 `renderWorkingContextMessage` 输出的控制 payload，不是 Runtime
Working Memory；`ModelWorkingContext` 不在中间阶段持有这些派生字段。renderer helper 在最终
Conversation 确定后，把不含正文的 `visibleConversationMessageMap` 和经可见 map 过滤后的
`preparationInputEvidence` 一次性加入该 payload。map 只覆盖真实 Conversation，不包含 system
或 Working Context 消息；`renderRequest` 仍只输出每条真实消息的 `role` 和 `content`，不重复写索引。
没有可见映射的 provenance 不进入模型控制消息；这只是模型输入可见性边界，Runtime EvidenceGate
仍是最终授权边界（对应 `req-6`）。

`ModelInferenceProjector.project` 在 Preparation 才接收 provenance；executing 阶段只要调用方提供
该字段（包括空数组）就立即 fail-closed。Coordinator 和 Step Runner 的执行路径不传字段
（对应 `req-5-3`、`req-6-4`）。

### v1 Prompt 契约

保留现有资产 ID、Manifest `version: 1` 和四个协议的 `version: 1`，只原地更新四个模板。global
契约说明四类 Working Memory、Conversation 不是通用 Fact evidence、provenance 范围、Observation
权威和 map 索引规则；各阶段分别禁止/允许对应 PlanItem 操作，并要求完成声明引用 committed
Tool/Observation。Prompt 失败不能替代 Runtime 校验（对应 `req-7`）。

### Checkpoint 与 provenance tail

`TrajectoryCheckpointCommitter` 使用一个 `TrajectoryStore` 同时完成 append 和 `readWithBoundary`，
不新增公开 `TrajectoryReader` seam。facts 与 accepted Patch 已追加但尚未 `store.save` 时，检查
该 Store 返回的 `uncommittedTail` 中所有 provenance 的 Goal/Run、message index、user 角色和 hash。

匹配时继续既有高水位、Snapshot、维护通知和 marker；不匹配或 reader 缺失时复用现有
`TrajectoryAppendError` 及 `TRAJECTORY_APPEND_FAILED_CODE`，在保存 Snapshot 或继续下游调用前
fail-closed。错误 tail 不清理，普通执行 tail 不参加新校验；不实现 Outbox、原子双写、异步重试或
tail 清理（对应 `req-8`）。

### Context Document 边界

`preparation_input_recorded` 是审计和 Evidence 元数据，不是可检索语义。Context Document Builder
遇到该事件时跳过其正文和 fields，也不 flush 当前 Preparation segment；因此它不会打断
`run_resumed` 到 `preparation_result` 的现有分段，也不会把 hash/messageIndex 暴露为检索文本。

## Components and Interfaces

| 组件 | 变更职责 |
| --- | --- |
| `trajectory.ts` | canonical content hash、`PreparationInputEvidence`、事件 payload/phase/unknown-field 校验 |
| `evidence-gate.ts` | 显式 scope；Preparation 放宽用户输入 Fact，Plan completion 强制 execution |
| `working-memory-core.ts` | 唯一 Phase Policy 入口、规范化和 canonical operation |
| `working-memory-session.ts` | committed provenance 恢复、replay scope、隔离 getter |
| `GoalCoordinator` / `runner.ts` | 统一 preflight 顺序和 Preparation provenance 事件顺序 |
| `launcher.ts` | 初始 `goal_created` 后追加 input provenance |
| `agent` projector/prompt/adapter/render | 原始索引传递、最终 map/evidence 派生、Preparation-only provenance |
| `context-document.ts` | provenance metadata 透明跳过，不形成检索文档 |
| `TrajectoryCheckpointCommitter` | 使用单一 `TrajectoryStore` 做保存前 tail 检查 |

新增或扩展的公开 DTO 必须沿用现有 Runtime/Agent 分层，并补充中文 contract TSDoc。
`PreparationExecutionInput.preparationInputEvidence` 和 `ModelInferenceView.preparationInputEvidence`
是可选瞬时字段；两种 provenance DTO 分别定义但都只含 `sequence`、`messageIndex`、
`contentHash`。不在 `Goal`、Snapshot schema 或 `WorkingMemory` 增加字段。

## Data Models

accepted Patch 仍使用现有 `MemoryPatchAcceptedPayload`，`protocolVersion` 保持 1；只有
`CanonicalMemoryOperation` 能进入事件。`memoryRevision` 继续指向 committed accepted Patch，
Session 沿 revision parent 链归约 committed 事件，并将 tail 排除在 Memory 和 Evidence index
之外（对应 `req-3`、`req-5`）。

当前 v1 尚未对外发布是前提；若发现必须兼容的外部 v1 Goal，应停止本方案并重新评估
Bundle v2，不加入旧 Snapshot、Prompt Bundle、检索协议或 Compact Adapter 的兼容路径。

## Error Handling

事件格式、hash、unknown field 或 executing provenance 事件由 `TrajectoryProtocolError` 在
append 前拒绝；阶段准入、Evidence scope 和 Session 恢复分别使用现有
`WorkingMemoryPatchError`、`EvidenceGateError`、`WorkingMemoryRecoveryError`。Checkpoint
provenance mismatch 使用现有 `TrajectoryAppendError`，保证 `GoalStore.save` 及其后的
marker/maintenance 不被调用。

任何校验失败都不修改 Goal 或 Session 投影，也不调用下一轮 Executor。已追加事实保持不可变
并留在 tail，符合 Snapshot 权威和现有 marker 语义。

## Testing Strategy

Runtime 测试覆盖：hash/未知字段/executing 事件拒绝；provenance 恢复校验、tail 排除和
getter 隔离；两种 Evidence scope；三阶段 PlanItem policy 及 `retire_fact` 规则；
Coordinator/Launcher 事件顺序、Patch/revision/Snapshot 恢复；committer 单 Store tail
匹配/错配副作用和普通执行 tail 回归；Context Document provenance event 的 segment-transparent
行为。

Agent 测试覆盖：Projector 原始 index；Adapter、Compactor、Trajectory assembler、Epoch
过滤和预算裁剪后的 map；Working Context provenance 过滤；Preparation hash-only 输入；
Executing 无 provenance 且 Projector fail-closed；四个 v1 模板契约。

完成后运行 TypeScript 编译、packages、benchmark、Memory 测试和 `git diff --check`；同时
更新 `docs/architecture/runtime.md`，不修改 `project-memory/`。

# 统一 Agent Step 流与默认工作模式设计

## 审批摘要

### 方案

将任务批准前的只读环境读取接入现有普通 `Action/Observation` 流程，使其拥有相同的持久化、Step 计数、上下文和恢复语义；同时把模型的调查、澄清、提案与执行策略集中到一个统一 System Prompt 中。Runtime 仍在 Prompt 之外强制执行只读权限、任务批准、Tool Policy、证据和提交边界。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 普通 Step 读取 | 任务未批准时只允许只读 Tool，但通过普通 `stage_action`、Tool 执行和 `observe_action` 完成 Step；读取增加 `stepCount` | 删除不计 Step 的特殊生命周期，统一预算、恢复和上下文来源 |
| 单一默认工作模式 | 保留一个 `executing` Prompt Bundle，根据任务批准状态说明可用能力；Prompt 引导模型选择下一步，Runtime 作为硬约束 | 模型行为可扩展，安全边界不依赖 Prompt 自律 |
| 任务门控优先于 Tool Policy | 先拒绝任务未批准时的非只读 Tool，再对只读 Tool 使用现有 Policy 和 Action Approval | 保留副作用护栏；只读 Tool 也能按 Policy 等待批准 |
| 删除 Probe 协议面 | 删除 `observe_probe`、`PlanProbeProgressEvent`、`probeCount` 和无 `action_staged` 的执行单元分支；当前协议不迁移旧 Probe 数据 | Runtime、Agent、TUI、Storage 只维护一套 Tool/Observation 语义 |
| 读取计入统一预算 | 复用 `executionPolicy.maxSteps`，不再维护独立探查上限 | 读取过多会消耗任务预算，模型必须遵循 Prompt 尽快收敛 |

### 风险与待确认

- 风险等级：**high**；理由：改变任务批准前的 Tool 执行权限路径、Snapshot 跨字段不变量、Step 预算、上下文组装和跨包协议。
- 关键操作：切换未批准任务的只读 Action 提交/恢复语义，并拒绝旧开发期 Probe 快照或事件；不增加旧数据迁移。
- 风险：读取计步可能提前触发 `maxSteps`；任何残留的特殊分支都可能导致重复执行、Observation 不可见或恢复分叉。
- 待确认：无。

## Overview

当前 Runner 在 `workflow.task` 缺省时绕过普通 Action 提交，直接使用 `executePlanProbe` 和 `observe_probe`。本设计把该分支并入普通 Tool 路径：任务门控只决定哪些 Tool 可以进入执行，是否计 Step 不再由任务是否批准决定。

模型收到同一个执行 Prompt Bundle。没有已批准任务时，Prompt 说明只能读取环境、查询历史、提问或提出任务；已有任务时，Prompt 说明围绕完成条件执行和验证。模型可以选择读取，也可以直接提问或提出任务，但所有实际读取都必须通过 Runtime 的普通 Action/Observation 事务。

## Key Design Decisions

### 普通 Step 读取

Runner 在校验 `tool_call` 后先执行任务门控：任务缺省且 Tool 非只读时返回稳定的 `INVALID_AGENT_DECISION`，不创建 Action、不调用 Policy、不调用 Tool；只读 Tool 继续进入现有 Policy 分支。Policy 允许时保存 `action_staged(approved)` 后调用现有 `executeToolAndObserve`；Policy 要求批准时保存 `action_staged(awaiting_approval)`，由既有 Coordinator 恢复。

普通 Tool 路径产生完整执行单元：

```text
decision_received
  -> action_staged(approved | awaiting_approval)
  -> tool_started
  -> tool_finished
  -> observation_recorded
  -> observe_action: stepCount + 1, lastStep 更新
```

`observe_probe` 和 `executePlanProbe` 删除后，读取成功与失败都由 `observe_action` 归约。失败 Observation 仍完成一个 Step；只有授权、协议或持久化失败才在 Tool 调用前终止当前推进。

### 单一默认工作模式

`agent-decision@1.njk` 保持一个 `executing` 模板，不再使用 Probe 术语。模板向模型表达以下默认循环：先阅读目标、完成条件、已提交事实和可用 Tool；存在关键环境不确定性时选择最小只读读取；每轮只请求一个下一步；等待 Observation 后更新判断；信息不足且环境无法解决时提问；边界清晰后提交任务提案；批准后围绕完成条件执行、验证并引用已提交证据。

任务是否批准仍用于生成当前合法的 Tool/系统决策 Contract 和 Tool 列表，但这是能力投影与 Runtime 门控，不是第二个生命周期。Prompt 不声明或生成 Goal/Run、Step、Epoch、Action ID、请求 ID 等 Runtime 元数据，也不承诺模型输出可以绕过 Runtime 校验。

### 任务门控优先于 Tool Policy

任务门控位于 `prepareToolAction` 的可执行闭合之前。未批准任务的非只读请求不能进入 `pendingAction`，避免通过用户批准 Action 间接越过 Task Proposal；未批准任务的只读请求可以使用既有 `allow`、`require_approval` 和失败路径。这样既保留 Profile/Registry 的授权事实，也保留自定义 Tool Policy 对只读 Tool 的额外控制。

任务批准后，Runner 使用完全相同的普通 Tool Policy、Action Approval、replay policy、Observation 保存和 Evidence Gate，不根据 Action 是否曾发生在批准前改变行为。

### 删除 Probe 协议面

Runtime Domain 删除 `PlanProbeProgressEvent` 和 `RunInput.observe_probe`；Runner 删除 Probe 回调、已提交 Probe 计数和独立执行函数；Coordinator/TUI 删除监听注册、活动 Probe 文案和专用去重路径。Trajectory 只保留普通 Tool 执行单元，Agent Context Adapter 只接受带完整 `action_staged` 的普通 Tool 单元。

旧开发期快照或 Trajectory 中出现 Probe 字段、事件、无 `action_staged` 的旧执行单元时，当前 Codec/Adapter 以可识别错误拒绝；不通过缺省值、兼容分支或重新解释完成迁移。

### 读取计入统一预算

Runner 的 `maxSteps` 检查继续位于每轮模型调用前，并读取 Snapshot 中累计的 `stepCount`。读取完成后计数已经增加，因此下一轮与普通执行完全相同地判断预算；删除 `probeCount` 和 Trajectory 扫描。模型若在预算耗尽前没有形成任务提案，Run 按现有 `MAX_STEPS_EXCEEDED` 失败语义结束。

## Architecture

```text
Goal Snapshot
    |
    v
Unified Step Prompt + current authorized tools
    |
    v
AgentDecision(tool_call | ask_user | task_proposal | terminal)
    |
    v
Runner: task gate -> Tool Policy -> ordinary Action/Observation
    |                              |
    |                              +--> pendingAction / Tool / Observation
    v
Snapshot + committed Trajectory (stepCount, lastStep, evidence)
    |
    +--> next model context
    +--> Session timeline
```

任务批准状态只影响当前可用能力和 Prompt 指引；Action 的生命周期、提交边界、Context 组装和 TUI 投影不再按“计划期读取/执行期读取”分叉。

## Data Models

- `RunInput` 删除 `observe_probe`，所有合法 Tool 结果只使用 `observe_action`。
- `RunState` 保留既有 `pendingAction`、`stepCount` 和 `lastStep`；Storage 不再禁止“无 task 但已有普通读取进度”。Runtime 在保存前保证该进度只来自已授权只读 Tool。
- `TrajectoryEvent` 删除 Probe 专用事件和字段；普通读取必须包含 `decision_received`、`action_staged`、Tool 生命周期和 `observation_recorded`。
- `ModelInferenceView`、Prompt Bundle 和 Agent Contract 继续按 `taskPresent` 投影能力，但不暴露 Probe 名称或计数。
- `UiSessionViewModel` 删除 `activeProbeDescription`；读取步骤只从 Store 提交通知和已提交 Trajectory 投影到统一时间线。

## Components and Interfaces

| 区域 | 设计调整 |
|---|---|
| `packages/runtime` | 合并 Runner 的前置读取与普通 Tool 分支；删除 Probe 回调、计数和转换；放宽无 task 的普通读取 Snapshot 不变量；保留任务门控和 Policy。 |
| `packages/agent` | 重写统一执行 Prompt；删除 Context Adapter 的无 staging Probe 分支和相关测试；普通读取按已批准 Action 单元组装 Hot/Warm 上下文。 |
| `packages/contracts` | 保持 `tool_call` 为唯一 Tool 决策分支；移除任何 Probe 专用投影或协议声明，继续根据 task gate 限制合法分支。 |
| `packages/storage` | 更新当前 Snapshot 跨字段校验与往返测试，允许无 task 的普通读取进度并拒绝旧 Probe 数据；不提供迁移。 |
| `packages/tui` | 删除 `onProbeProgress` 和活动 Probe 状态；依赖普通 Step 提交通知与统一忙碌/等待抽屉。 |
| `docs/architecture` | 同步 Runtime、Agent、TUI 的当前职责、Step 语义、上下文来源和恢复限制。 |

新增或扩展的公开 TypeScript 接口必须提供中文 contract-level TSDoc；删除的公开接口不保留兼容别名。

## Error Handling

- 任务缺省时的非只读 Tool 在执行前返回稳定授权/协议错误，不写 `pendingAction`，不调用 Tool，不增加 Step。
- 普通只读 Action 的 Snapshot 保存失败时不调用 Tool；Tool 已执行但 Observation 提交失败时保留既有 `pendingAction`/`outcome_unknown` 恢复语义，不假定执行未发生。
- Agent 输出解析、Contract、Tool 输入、Evidence 或身份校验失败时不进入下一轮；Prompt 只是引导文本，不能覆盖 Runtime 拒绝结果。
- Context Adapter 遇到旧 Probe 事件、缺失普通 staging 或 Action 身份不一致时 fail-closed；未提交或不完整执行单元不可见。
- `maxSteps` 触发时使用现有失败快照和关闭 Context Epoch 的提交顺序，不通过 Probe 计数或异步回调延迟终止。

## Testing Strategy

- **Runtime/Transition：** 验证无 task 的只读 Tool 经过普通 staging、执行和 `observe_action` 后 `stepCount` 恰好增加一次；验证无 task 的写 Tool 在 Policy 前拒绝、只读 Policy approval 可恢复，以及最大 Step 预算包含读取。
- **Persistence/Recovery：** 验证无 task 的 `lastStep`、`pendingAction` 和普通读取 Trajectory 可以往返；保存失败不调用 Tool；恢复不会重复安全重放或丢失 Observation；旧 Probe 字段/事件 fail-closed。
- **Agent/Contracts：** 验证统一 Prompt 的无 task/有 task 行为指引、Observation 进入下一轮上下文、普通 Tool execution unit 投影，以及所有 Probe 专用分支和无 staging 单元被移除或拒绝。
- **TUI：** 验证只读结果通过普通 Store 提交通知进入统一 Step 时间线，恢复只使用快照和 Trajectory，不再订阅 Probe 事件或显示 `activeProbeDescription`。
- **端到端与回归：** 覆盖“创建 Goal → 读取环境 → Observation → 任务提案 → 批准 → 执行”的连续路径，确认不再停留在 `creating goal...`；运行受影响包测试、`npx tsc --noEmit`、`npm run check:dependencies`、全量 `npm test` 和 `git diff --check`。

# Preparation 阶段移除与 AskUser 交互设计

## 审批摘要

### 方案

将 Goal 的状态模型收敛为单一 `executing` 生命周期，把任务提案批准和 `ask_user` 作为可恢复的执行交互；模型使用统一严格决策协议，TUI 使用单一 Session 瀑布时间线承载计划问题、答案、Tool Observation 和执行步骤。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 统一 Goal 状态与等待 | `GoalWorkflowState` 只保留 `executing`；任务契约可在批准前为空，等待交互放入 Run 的 `pendingInteraction` | 删除阶段分支，同时保留可恢复的任务批准和用户回答 |
| 统一 Agent 决策协议 | 用单一 `AgentDecision` 处理 `ask_user`、`task_proposal`、只读 Tool、普通 Tool、完成、等待和失败 | 删除 `PreparationExecutor` 与阶段专属 Prompt，模型入口只有一个 |
| 内置 `ask_user` 交互协议 | 将 `ask_user` 作为模型可调用的特殊决策，由 Runtime 持久化请求并等待用户答案 | 支持 1–3 个问题、单选、多选和 `Other`，不执行外部副作用 |
| 计划期只读探查 | 在任务批准前复用 `ToolRegistry` 的 `isReadOnly` 过滤和 Observation 轨迹，使用独立探查提交路径且不增加 Step | 保留调查能力，不恢复隐藏的 Preparation 通道 |
| TUI 单一时间线 | `SessionController` 持有唯一累计时间线，`SessionScreen` 渲染 `AskUserPanel` 和统一步骤 | 删除 Preparation Screen 与重复的 Screen-owned timeline |
| 当前协议原地替换 | 按开发期兼容策略直接使用新快照/Prompt/Trajectory 形状，不增加旧 Preparation 迁移分支 | 旧开发数据需丢弃或按不支持协议失败 |

### 风险与待确认

- 风险等级：**high**；理由：改变跨包生命周期、严格输出协议、快照形状、恢复路径、Tool 授权和用户交互。
- 关键操作：任务批准前副作用 Tool 的拒绝，以及 `pendingInteraction` 恢复后再次执行前的请求 ID 校验。
- 风险：统一协议任何一处仍接受旧 Preparation 分支，都可能造成错误恢复、重复提交或越过批准门控。
- 待确认：无。

## Overview

当前 Goal 的前置提问、只读探查和任务规划分散在 `GoalCoordinator`、`PreparationExecutor`、阶段 Prompt、Trajectory provenance 和 `PreparationScreen`。本设计把这些行为放进同一个执行推进循环：模型可以先提出 `ask_user` 或 `task_proposal`，也可以在批准前调用只读 Tool；Runtime 负责保存可恢复交互并阻止副作用，用户批准后才进入普通 Action/Observation 循环。

## Key Design Decisions

### 统一 Goal 状态与等待

`GoalWorkflowState` 改为单一 `executing` 分支，`task` 在任务批准前省略，批准后固定为 `GoalTask`。`RunState` 新增互斥的 `pendingInteraction`，与已有 `pendingAction` 并列：

```text
created -> running
             |
             +-> pendingInteraction: ask_user
             +-> pendingInteraction: task_approval
             +-> pendingAction: action_approval/recovery
             +-> completed/failed/cancelled
```

同一时刻最多存在一个交互或 Action 等待。`ask_user`、任务提案和反馈只改变等待状态与消息，不增加 `stepCount`；任务批准前的只读探查提交 Tool 事实但不更新 `lastStep`/`stepCount`；批准后的 Tool/Observation 和终态决策继续沿用现有 Step 计数。没有最终任务时，Runtime 只允许 `ask_user`、`task_proposal`、历史 lookup 和只读 Tool。

### 统一 Agent 决策协议

Contracts 保留当前执行决策的严格解析方式，并在同一顶层联合中加入：

```ts
type AgentDecision =
    | { readonly kind: "ask_user"; readonly questions: readonly AskUserQuestionInput[]; readonly memoryPatch?: ExecutingWorkingMemoryPatch }
    | { readonly kind: "task_proposal"; readonly task: GoalTask; readonly approvalRequest: string; readonly memoryPatch?: ExecutingWorkingMemoryPatch }
    | { readonly kind: "tool_call"; readonly action: ToolCallAction; readonly memoryPatch?: ExecutingWorkingMemoryPatch }
    | { readonly kind: "context_lookup"; readonly need: string; readonly question: string; readonly filters: readonly string[] }
    | { readonly kind: "complete"; readonly summary: string; readonly completionEvidence: readonly number[]; readonly memoryPatch?: ExecutingWorkingMemoryPatch }
    | { readonly kind: "wait"; readonly reason: string; readonly memoryPatch?: ExecutingWorkingMemoryPatch }
    | { readonly kind: "fail"; readonly error: string; readonly memoryPatch?: ExecutingWorkingMemoryPatch };
```

`context_checkpoint` 仍由 Runtime 的上下文预算控制独占产生。`task_proposal` 和 `ask_user` 的 Patch 只能通过执行证据范围校验，并与 pending interaction 在同一提交边界生效。移除 `PreparationResult`、阶段专属 Contract 和 `PreparationPhase`；Provider Schema 只投影当前统一协议。

Prompt 只保留一个执行模板：当 `task` 缺失时，明确允许 `ask_user`、`task_proposal`、lookup 和只读 Tool，禁止副作用 Tool；当 `task` 已批准时，允许普通 Tool、完成、等待、失败、lookup 和 `ask_user`。模型不得生成 Runtime 自有的请求 ID、Run 状态、Step 或 Epoch 字段。

### 内置 `ask_user` 交互协议

模型提交的输入不携带 ID，由 Runtime 在校验后为问题和选项分配 `q-1`、`o-1` 形式的局部 ID，并生成全局 `requestId`。规范化请求如下：

```ts
interface AskUserQuestion {
    readonly id: string;
    readonly header: string;
    readonly question: string;
    readonly options: readonly {
        readonly id: string;
        readonly label: string;
        readonly description?: string;
    }[];
    readonly multiSelect: boolean;
}

interface PendingInteraction {
    readonly kind: "ask_user";
    readonly requestId: string;
    readonly mode: "plan" | "execution";
    readonly questions: readonly AskUserQuestion[];
}

interface AskUserAnswer {
    readonly questionId: string;
    readonly optionIds: readonly string[];
    readonly otherText?: string;
}
```

Runtime 强制 1–3 个问题、每题 2–3 个选项、选项 ID 唯一；`Other` 是 TUI 添加的受控输入分支，不进入模型请求。单选最多一个 `optionId`，多选至少一个；自由文本去除空白后不能为空。答案提交后追加结构化 `ask_user_answered` 轨迹事实和确定性用户消息，再清除 pending interaction 并恢复模型；答案不是 EvidenceGate 的完成证据。

### 计划期只读探查

没有最终任务时，Runner 从冻结 Profile 与 Registry 解析 Tool 定义，只向模型展示 `isReadOnly: true` 的工具。探查使用普通 `ToolRegistration.prepare`、Tool 执行和 Observation 提交，但走 `planProbe` 执行单元：保留 `tool_started/tool_finished`、Action ID、Observation 和 TUI 进度，成功后继续同一次推进调用，不更新 Run Step。非只读请求在准备闭合前被拒绝，不能创建 pending Action 或产生外部副作用。

批准任务后取消 `planProbe` 路径，所有 Tool 回到现有 Tool Policy、Action 审批、恢复和 Step 规则。

### TUI 单一时间线

`SessionController` 删除 `preparationSteps` 和 Preparation probe 专用投影，统一维护消息、planProbe Observation、执行 Step、`ask_user` 答案和流式 transcript 的顺序列表。`SessionScreen` 始终渲染，底部 `ActiveDrawer` 按 `pendingInteraction` 类型选择面板：

```text
Static timeline
  User message -> read-only probe -> Plan question -> Task proposal -> Step -> AskUser answer
ActiveDrawer
  Spinner | AskUserPanel | TaskProposalPanel | ActionApprovalPanel | BlockedPanel | TerminalPanel
```

`AskUserPanel` 用 `useInput` 管理焦点与多选，用现有 `CommandAwareTextInput` 处理 `Other`；每次只展示一个问题并显示 `1/3` 进度，最后一题完成后一次派发结构化答案。YOLO 只影响 Action approval，不自动提交 `ask_user`。Screen 不修改 Goal 或推断状态，只把 `UiCommand` 交给 Controller。

## Architecture

```text
LLM StepExecutor
       |
       v
 unified AgentDecision
       |
       v
 GoalCoordinator/Runner --validate--> WorkingMemory + Tool Policy
       |                     |
       |                     +--> planProbe Tool/Observation (no Step)
       |                     +--> pendingInteraction (ask_user/task_approval)
       |                     +--> normal Action/Observation (Step)
       v
 Goal Snapshot + Trajectory boundary
       |
       v
 SessionController -> SessionScreen -> ActiveDrawer / AskUserPanel
```

`GoalStore` 是交互等待的恢复真相，Trajectory 记录请求、答案、Tool Observation 和提交边界；Agent 只接收当前 Snapshot、Conversation、Working Memory 和最近结构化交互结果。TUI 不保存第二份可推进领域状态。

## Data Models

- `GoalWorkflowState`：仅有 `{ phase: "executing"; task?: GoalTask }`。
- `RunState.pendingInteraction`：与 `pendingAction` 互斥，包含 `task_approval` 或 `ask_user` 两种持久化结构；`Run.status === "waiting"` 时必须存在其一或普通 `wait` 决策。
- `GoalUserAction` 增加 `answer_ask_user`、`approve_task`、`feedback_task`，每个操作携带 `requestId`；旧的 Preparation 专用恢复组合删除。
- `UiSessionViewModel` 增加规范化 `askUser` 请求和 `interactionMode`，`waitingFor` 增加 `ask_user`，并移除 `preparationSteps`、`preparationStalled` 与 Preparation 阶段类型。
- Snapshot 与 Trajectory 使用当前协议形状原地替换；不保留旧 Preparation 字段、事件或兼容解码器。

## Components and Interfaces

| 区域 | 主要调整 |
|---|---|
| `packages/contracts` | 合并统一 AgentDecision Contract、增加 `ask_user`/`task_proposal`，移除 PreparationResult 分支和 Provider Schema |
| `packages/runtime` | 收敛 domain、Coordinator、Runner、transition、Tool Policy、Trajectory 与 Storage 边界；实现 pendingInteraction 和 planProbe |
| `packages/agent` | 删除 Preparation Executor/Prompt，统一 Step Prompt、Projector、Renderer 和模型输出解析 |
| `packages/tui` | 删除 PreparationScreen，新增 AskUserPanel，统一 timeline、UiCommand、Controller 派生和模型切换安全点 |
| `packages/storage` | 更新当前 Snapshot schema、codec 和跨字段不变量，拒绝旧 Preparation 数据 |
| 测试与文档 | 更新 Runtime/Agent/Contracts/Storage/TUI 测试及 `docs/architecture/` 当前实现说明 |

新增公开 TypeScript 接口必须提供中文 contract-level TSDoc；`ask_user` 的模型协议、答案验证和持久化 DTO 不共享可变对象。

## Error Handling

- 统一决策解析、`ask_user` 数量/选项/答案、Patch、Tool 授权和请求关联校验失败时，保留原快照并返回稳定协议错误。
- Snapshot 保存失败时不调用下一轮模型、不执行 Tool、不清除 pending interaction；Trajectory 已追加但未提交的 tail 保持不可见。
- 恢复时发现旧 Preparation 字段、未知 pending interaction、重复请求 ID 或提交边界不一致时 fail-closed，不自动猜测或迁移。
- `ask_user` UI 在提交失败时保留当前题目和输入；成功提交后 Controller 只允许一个 in-flight resume，迟到结果按 Goal/Run/requestId 丢弃。
- 流式 transcript 继续执行“先完成活动流、提交 mutable tail、再允许下一流”的屏障顺序。

## Testing Strategy

- **Contracts/Agent：** 覆盖统一决策联合、`ask_user` 合法/非法形状、单选/多选/`Other` 答案、Provider Schema、无 task 与有 task 两种 Prompt，以及旧 Preparation 输出拒绝。
- **Runtime/Storage：** 覆盖新 Goal 初始状态、任务批准门控、反馈重提案、planProbe 不计 Step、只读过滤、pendingInteraction 保存/恢复、请求 ID 幂等、保存失败无副作用和旧数据 fail-closed。
- **TUI：** 使用 `ink-testing-library` 覆盖计划问题标记、单选键盘、多选 Space、Other 输入、多问题进度、忙碌/错误保留、答案一次派发、统一瀑布顺序和 Controller 单一时间线。
- **回归与风险：** 运行 `npx tsc --noEmit`、受影响包测试和全量 `npm test`；保留流式 transcript barrier 的切换、未闭合尾部和下一流启动测试。

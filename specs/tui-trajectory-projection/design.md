# Architecture & Design: TUI Trajectory Event Projection

## Context & Objectives

在现行实现中，TUI Inspector 是通过 `sliceTrajectorySteps` 遍历 `Goal.state.messages`，按 `role: "assistant"` 简单划分步骤。这种做法能够展示对话流，但在复盘实际 Runtime 执行时存在显著局限：
1. 无法区分多次并行的生命周期与前置准备（上下文探索、环境探查）；
2. 无法精确溯源 `decision_received`、`action_staged`、`tool_started/finished` 与 `observation_recorded` 的因果依赖；
3. 无法反映 Snapshot 提交边界外的未持久化尾部（Crash 或中断前夕的动作）。

本设计将引入 **`projectTrajectoryEvents`（轨迹事件投影器）**，直接消费底层 `readTrajectoryAtSnapshot` 产生的规范事件序列，以 `executionUnitId` 为首要边界切分步骤，向 TUI Inspector 提供高保真、结构化且支持交互折叠的会话复盘视图模型。

## Architecture & Data Flow

```text
CompositionRoot / Benchmark Resolver
  ├── GoalStore (restore goal snapshot)
  └── TrajectoryStore (readWithBoundary)
            ↓
  readTrajectoryAtSnapshot(query)
            ↓
  SessionController (协调异步加载、busy 与 error 状态)
            ↓
  projectTrajectoryEvents(trajectoryResult, goal)
            ↓
  UiInspectorSnapshot {
    screen: "inspector",
    goalId: string,
    currentStepIndex: number,
    totalSteps: number,
    steps: UiInspectorStep[],
    viewOptions: {
      expandObservation: boolean,
      expandReasoning: boolean
    }
  }
            ↓
  InspectorScreen (React Ink 全屏渲染)
    ├── Header: Step X / Y · executionUnitId · Status
    ├── Sections: Decision -> Action & Approval -> Tool & Observation -> Result
    ├── Tail Warning: (if uncommittedTail exists)
    └── Footer Keybindings: [h/l] Step, [j/k] Scroll, [o] Observation, [r] CoT, [e] Raw, [Esc] Back, [q] Exit
```

## Interface Definitions & Public Contracts

### 1. 结构化步骤视图模型 (`packages/tui/src/types.ts`)

```ts
/**
 * 轨迹单步执行单元的结构化决策区块。
 */
export interface UiStepDecisionBlock {
    readonly kind: "tool_call" | "complete" | "wait" | "fail" | "context_lookup";
    readonly summary?: string;
    readonly reasoning?: string;
    readonly toolCall?: {
        readonly toolId: string;
        readonly actionId: string;
    };
}

/**
 * 轨迹单步执行单元的工具调用与审批区块。
 */
export interface UiStepActionBlock {
    readonly toolId: string;
    readonly actionId: string;
    readonly inputJson: string;
    readonly approvalStatus: "auto_approved" | "approved" | "rejected" | "awaiting_approval";
    readonly rejectionReason?: string;
}

/**
 * 轨迹单步执行单元的工具执行与观测区块。
 */
export interface UiStepObservationBlock {
    readonly toolId: string;
    readonly actionId: string;
    readonly status: "success" | "error";
    readonly durationMs?: number;
    readonly observationPreview: string;
    readonly rawObservation: unknown;
    readonly isTruncated: boolean;
}

/**
 * 轨迹单步执行单元的终态或阶段结果区块。
 */
export interface UiStepResultBlock {
    readonly outcome: "next_step" | "completed" | "failed" | "cancelled" | "waiting";
    readonly summary?: string;
    readonly errorCode?: string;
    readonly errorMessage?: string;
}

/**
 * 经事件流投影产生的 Inspector 统一单步视图模型。
 *
 * @remarks
 * Step 0/1 为 Preparation 准备步骤（包含意图与前置探索）；
 * Step 2..N 对应特定 executionUnitId 的完整决策执行闭环。
 */
export interface UiInspectorStep {
    readonly index: number;
    readonly totalSteps: number;
    readonly title: string;
    readonly executionUnitId?: string;
    readonly phase: "gathering_context" | "planning" | "executing";
    readonly preparationDetails?: readonly string[];
    readonly decision?: UiStepDecisionBlock;
    readonly action?: UiStepActionBlock;
    readonly observation?: UiStepObservationBlock;
    readonly result?: UiStepResultBlock;
    readonly uncommittedWarning?: string;
    readonly rawJson: string;
}
```

### 2. 轨迹事件投影器契约 (`packages/tui/src/trajectory-projector.ts`)

```ts
/**
 * 轨迹事件投影输入参数。
 */
export interface ProjectTrajectoryOptions {
    readonly goalId: string;
    readonly goal?: import("../../runtime/src/index.js").Goal;
    readonly committedEvents: readonly import("../../runtime/src/index.js").TrajectoryEvent[];
    readonly uncommittedTail?: readonly import("../../runtime/src/index.js").TrajectoryEvent[];
}

/**
 * 将领域 Trajectory 事件流投影为供 TUI Inspector 渲染的结构化步骤切片。
 *
 * @param options - 包含已提交事件、未提交尾部与目标快照的参数。
 * @returns 规范排序的 Inspector 步骤视图模型数组。
 * @throws 当事件流序列非法或无法映射时安全降级。
 *
 * @example
 * ```ts
 * const steps = projectTrajectoryEvents({
 *     goalId: "goal-1",
 *     goal,
 *     committedEvents: readResult.committed,
 *     uncommittedTail: readResult.uncommittedTail,
 * });
 * ```
 */
export function projectTrajectoryEvents(
    options: ProjectTrajectoryOptions,
): readonly UiInspectorStep[];
```

### 3. SessionController 依赖与调度契约扩展 (`packages/tui/src/types.ts`)

```ts
export interface SessionControllerDependencies {
    // ... 现有字段
    /** 可选的 Trajectory 事件读取器（通常来自 readTrajectoryAtSnapshot）。 */
    readonly readTrajectory?: (
        query: import("../../runtime/src/index.js").TrajectoryReadQuery,
    ) => Promise<Readonly<import("../../runtime/src/index.js").TrajectoryReadResult>>;
}
```

## Detailed Implementation Breakdown

1. **`packages/tui/src/trajectory-projector.ts`**：
   - 遍历 `committedEvents`：
     - 将无 `executionUnitId` 的前置事件收集到 `preparationEvents`，映射为 Step 1（`Preparation & Planning`），提取 `intent`、`preparation_result`、`context_lookup` 与 `context_epoch` 关键时间线；
     - 按 `executionUnitId` 分组，保留首次出现顺序（或 `stepIndex`），为每一个执行单元构建独立的 `UiInspectorStep`：
       - `decision_received` -> `decision` 区块；
       - `action_staged` + `action_approved` / `action_rejected` -> `action` 区块；
       - `tool_started` + `tool_finished` + `observation_recorded` -> `observation` 区块（自动计算摘要，超过 10 行标记 `isTruncated = true`）；
       - `run_completed` / `run_failed` / `run_cancelled` -> `result` 终态区块；
     - 若 `uncommittedTail` 非空，在最后一个 Step 上附加 `uncommittedWarning: "[Warning: N uncommitted events detected in tail]"`。

2. **`packages/tui/src/session-controller.ts`**：
   - 在构造函数与依赖中注入 `readTrajectory`；
   - 重构 `selectGoal(goalId)`：
     - 恢复 Goal 快照；
     - 若为 inspect 模式，进入 `busy: true` 并调用 `readTrajectory({ goalId, runId })`；
     - 若无轨迹事件或发生异常，设置 `error: { code: "TRAJECTORY_NOT_FOUND", message: "..." }`；
     - 投影为 `UiInspectorStep[]`，进入全屏 `inspector`。

3. **`packages/tui/src/inspector-screen.tsx`**：
   - 更新渲染逻辑：替代原先的单纯消息流展示，以卡片与色块分别展示 **Decision**（青色）、**Action**（黄色）、**Tool & Observation**（绿色/红色）；
   - 增加按键支持：
     - 按 `o` 切换 Observation 展开/收起；
     - 保持 `r` 切换思维链折叠；
     - 保持 `e` 外部编辑器；
     - 保持 `Esc` 返回历史列表，`q` 退出。

4. **Benchmark 目录对齐**：
   - 在 `benchmark-discovery.ts` 中，扩展 `BenchmarkGoalCatalogEntry`，确保 `trajectoryDirectory` 能够被解析（例如 `data.artifactLocator?.trajectory ?? join(rootDir, "runtime", "trajectories")`）；
   - 在 `createCompositionRoot` 中，装配支持 Benchmark 路径自动路由的 `AggregatedTrajectoryStore`，确保 `readTrajectory` 能透明命中评测任务的真实轨迹。

## Risks & Mitigations

- **风险 1：旧开发数据或手工快照无轨迹文件**：
  - 缓解：明确报错提示 `Trajectory not found for Goal "<goalId>"`，遵循用户决策，不静默退回杂乱的消息切分，保持协议与表现纯粹一致。
- **风险 2：Tool Observation 为大型 JSON 或深层嵌套对象**：
  - 缓解：提供稳定的小型文本格式化函数，非字符串格式化为单行或有限缩进字符串并截取前 10 行，避免渲染卡顿。

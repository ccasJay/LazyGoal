# Requirements Specification: TUI Trajectory Event Projection

## Purpose

将 TUI Inspector 全屏复盘从当前基于 Assistant 对话消息切分的初步形态，升级为基于真实 Runtime 领域事件流（Trajectory Events）的结构化事件投影器。支持以 `executionUnitId` 为边界的严谨单步执行回放，忠实还原 Decision、Action、Approval、Tool、Observation 与 Result 全链路状态，并将生命周期与准备阶段独立归纳，提供紧凑折叠与按需展开交互，为开发者和评测复盘提供可审计的单步观察能力。

## Requirements

### Requirement 1: 真实事件流读取与控制器内聚数据流

- <a id="req-1-1"></a>**REQ-1.1**: The SessionController shall accept an optional `readTrajectory` dependency conforming to `readTrajectoryAtSnapshot`, enabling the controller to orchestrate trajectory loading directly during goal inspection.
- <a id="req-1-2"></a>**REQ-1.2**: When a user selects a goal to inspect (or launches `lazygoal inspect <goalId>`), the SessionController shall asynchronously query the trajectory using `{ goalId, runId }` and transition through a busy loading state.
- <a id="req-1-3"></a>**REQ-1.3**: If trajectory loading fails or the target trajectory contains zero events, then the SessionController shall transition to an actionable error state displaying `Trajectory not found for Goal "<goalId>"` without falling back to unstructured message slicing.
- <a id="req-1-4"></a>**REQ-1.4**: Where the inspected goal is a benchmark task discovered by `discoverBenchmarkGoals`, the trajectory reader shall resolve the corresponding runtime trajectory directory aligned with the goal's snapshot directory.

### Requirement 2: 步骤归组与执行单元（ExecutionUnit）语义投影

- <a id="req-2-1"></a>**REQ-2.1**: The Trajectory Event Projector shall group events by `executionUnitId` into discrete execution steps.
- <a id="req-2-2"></a>**REQ-2.2**: Events preceding the first execution unit (including `goal_created`, `run_started`, `run_resumed`, `preparation_input_recorded`, `preparation_result`, `context_lookup_*`, and `context_epoch_*`) shall be projected into an initial `Preparation & Planning` step (Step 1).
- <a id="req-2-3"></a>**REQ-2.3**: Each subsequent step (Step 2 through N) shall correspond to exactly one `executionUnitId`, ordering events by `stepIndex` (or event sequence when index is omitted).
- <a id="req-2-4"></a>**REQ-2.4**: Terminal events (`run_completed`, `run_failed`, `run_cancelled`) shall be projected into the final outcome block of the concluding step.
- <a id="req-2-5"></a>**REQ-2.5**: The total step count displayed in Inspector navigation shall equal the number of execution units plus one (for the initial Preparation step).

### Requirement 3: 结构化单步内容排版与按需展开

- <a id="req-3-1"></a>**REQ-3.1**: Each execution step view model (`UiInspectorStep`) shall provide structured sections for:
  - **Decision**: Model output decision type, reasoning (if present), and selected tool call;
  - **Action & Approval**: Tool input parameters and approval status (`auto approved`, `user approved`, or `rejected` with reason);
  - **Tool & Observation**: Tool execution status, duration/timing, and observation payload;
  - **Result & State**: Memory updates or transitional result.
- <a id="req-3-2"></a>**REQ-3.2**: The InspectorScreen shall truncate lengthy Tool Inputs and Observation outputs by default (displaying key summary and up to 10 lines) to ensure the core decision flow remains visible without extensive vertical scrolling.
- <a id="req-3-3"></a>**REQ-3.3**: While viewing an execution step, pressing `o` shall toggle full expansion and compact truncation of the Observation block.
- <a id="req-3-4"></a>**REQ-3.4**: While viewing an execution step, pressing `r` shall toggle expansion and folding of the model reasoning block.
- <a id="req-3-5"></a>**REQ-3.5**: While viewing an execution step, pressing `e` shall suspend the terminal and invoke the external viewer (`$EDITOR` or `$PAGER`) with the complete, unformatted raw JSON of the active step.

### Requirement 4: 提交边界与未提交尾部（Uncommitted Tail）安全审计

- <a id="req-4-1"></a>**REQ-4.1**: The Trajectory Event Projector shall strictly treat `committed` events as authoritative historical steps aligned with the latest Goal Snapshot.
- <a id="req-4-2"></a>**REQ-4.2**: If the trajectory read result contains `uncommittedTail` events (arising from abrupt crash or uncommitted interruption), then the final step shall render a prominent warning block indicating the count and nature of uncommitted events.
- <a id="req-4-3"></a>**REQ-4.3**: Uncommitted tail events shall never be silently dropped nor masquerade as committed state transitions.

### Requirement 5: 架构约束与文档完整性

- <a id="req-5-1"></a>**REQ-5.1**: All new and modified public TypeScript interfaces must include complete Chinese contract-level TSDoc with lifecycle semantics, parameters, returns, errors, and minimal `@example`.
- <a id="req-5-2"></a>**REQ-5.2**: The implementation must strictly adhere to `exactOptionalPropertyTypes: true`, avoiding `undefined` assignments to optional properties.
- <a id="req-5-3"></a>**REQ-5.3**: No external forbidden third-party project names shall appear in any source files, tests, or documentation.

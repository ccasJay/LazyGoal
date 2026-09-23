# 实施计划

- [x] //TODO 1. 将模式与任务归属迁移到 Run 持久化模型
  - 实现目标：调整 Runtime Domain、Snapshot Schema/Codec 和 Trajectory 契约，保存 `Run.mode`、`Run.approvedTask`、可选 `Goal.nextRunMode` 与独立 GoalPlan；移除 Goal 级模式/任务和 Todo/Run 持久绑定，沿用当前协议形状。
  - 成功判据：新状态经 Snapshot 保存、恢复后字段归属不变；旧开发期字段或不一致的模式/审批状态被明确拒绝，且不触发兼容迁移。
  - 验证方式：更新 Snapshot、交互等待点和 Trajectory 契约测试；运行 `npx tsx --test packages/storage/test/goal-snapshot-current.test.ts packages/storage/test/goal-snapshot-interaction.test.ts packages/runtime/test/trajectory.test.ts`。
  - _Requirements: [1.3](./requirements.md#req-1-3), [4.4](./requirements.md#req-4-4), [7.1](./requirements.md#req-7-1), [7.3](./requirements.md#req-7-3)_

- [x] //TODO 2. 实现 `/plan` 对当前或下一 Run 的一次性选择
  - 实现目标：接通 Slash Command、Launcher、GoalCoordinator 和 SessionController，使新 Goal、尚未执行的 Run、已完成 Run 分别按设计设置当前或下一 Run 模式。
  - 成功判据：在持久化 `run_started` 提交前接受切换、提交后无副作用拒绝；并发命令与 Run 启动按提交顺序得到唯一结果；重复命令幂等，重启后待用选择仍只消费一次。
  - 验证方式：新增/更新 Coordinator、Slash Command 与 SessionController 场景测试（待实现），包括并发竞态的两种提交顺序；运行 `npx tsx --test packages/runtime/test/goal-coordinator.test.ts packages/slash-command/test/slash-command.test.ts packages/tui/test/session-controller.test.ts`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [1.4](./requirements.md#req-1-4), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 3. 按 Run 模式生成决策能力并执行 Runtime 授权
  - 实现目标：更新 Agent 决策契约、Plan Prompt/投影和 Runner；普通模式以当前用户请求直接执行，Plan Prompt 要求先提案，Runtime 不按 `isReadOnly` 新增审批前 Tool 门控，批准后按任务完成条件校验。
  - 成功判据：普通模式不产生任务提案等待，仍受 Tool Policy/Action 授权和当前 Run 证据校验；Plan Prompt 明确先提案再调用业务 Tool，但未批准时 Runtime 仍按既有授权规则处理 Tool；完成仍被拒，越权 GoalPlan 决策不改变计划；`ask_user` 在两种模式继续可用。
  - 验证方式：新增/更新 Prompt、Contract、Agent 投影和 Runner 测试（待实现），验证提示内容及“未批准本身不拒绝已授权 Tool”；运行 `npx tsx --test packages/contracts/test/model-output-canonical.test.ts packages/agent/test/model-inference-projector.test.ts packages/runtime/test/runner-pretask-read.test.ts packages/runtime/test/runner.test.ts`。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4), [3.1](./requirements.md#req-3-1)_

- [x] //TODO 4. 将任务提案审批与反馈固定到当前 Run
  - 实现目标：调整 Coordinator、Runner、Trajectory 和待交互 Snapshot，使提案等待、反馈、旧请求失效及批准后的任务保存都绑定当前 Goal/Run/request ID。
  - 成功判据：批准只保存当前 Run 的任务目标与完成条件并继续执行；反馈使旧提案失效且恢复同一 Run；过期或跨 Run 响应无副作用并保留当前有效等待点。
  - 验证方式：新增/更新提案批准、反馈、恢复与过期请求测试（待实现）；运行 `npx tsx --test packages/runtime/test/goal-coordinator-task-interaction.test.ts packages/runtime/test/goal-coordinator.test.ts packages/storage/test/goal-snapshot-interaction.test.ts`。
  - _Requirements: [3.2](./requirements.md#req-3-2), [3.3](./requirements.md#req-3-3), [3.4](./requirements.md#req-3-4), [6.1](./requirements.md#req-6-1), [7.2](./requirements.md#req-7-2)_

- [x] //TODO 5. 通过模式能力授权并按需提交 GoalPlan 更新
  - 实现目标：让模式能力决定 GoalPlan Tool 的暴露与 Runtime 校验；仅首次成功 Patch 时创建计划，维持稳定 Todo ID、revision 原子性，并为 Todo 完成操作校验当前 Run 的证据引用。
  - 成功判据：无权模式的更新在无副作用情况下拒绝；失败或过期 Patch 不创建计划、不部分提交；完成 Todo 只接受当前 Run 已提交 Observation 引用，旧 Run、未提交或无效引用时整个 Patch 被拒绝；已有计划在普通模式保留且可读，计划内容不改变任务审批或业务 Tool 权限。
  - 验证方式：新增/更新 Contract、Reducer、Runner 和 Snapshot 测试（待实现）；运行 `npx tsx --test packages/runtime/test/goal-plan.test.ts packages/runtime/test/goal-plan-mode.test.ts packages/storage/test/goal-plan-snapshot.test.ts`。
  - _Requirements: [4.1](./requirements.md#req-4-1), [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3), [4.4](./requirements.md#req-4-4), [5.5](./requirements.md#req-5-5)_

- [x] //TODO 6. 解除 Todo 与 Run 绑定并支持单 Run 多 Todo
  - 实现目标：移除按 Todo 创建 Run、Run 结束时自动完成/释放 Todo 的生命周期耦合；允许一个 Run 依次更新多个 Todo，保留 Run 结束时未完成的计划状态。
  - 成功判据：一个 Run 能推进多个 Todo 而不自动结束或创建新 Run；Run 可在自身完成条件通过后结束，未完成 Todo 保持原状态；仅用户新输入创建后续 Run。
  - 验证方式：新增/更新同 Run 多 Todo、Run 终态和后续输入测试（待实现）；运行 `npx tsx --test packages/runtime/test/goal-plan-run.test.ts packages/runtime/test/goal-plan.test.ts packages/runtime/test/goal-coordinator.test.ts`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3), [5.4](./requirements.md#req-5-4)_

- [x] //TODO 7. 分别投影任务审批面板与持久 GoalPlan
  - 实现目标：更新 TUI ViewModel、提案面板、计划面板及会话时间线投影，使审批状态来自当前等待点、计划状态来自最新已提交 Goal。
  - 成功判据：普通 Run 不显示审批等待点；已有 GoalPlan 在普通模式仍展示；未提交或迟到的更新不能覆盖较新的 Run、审批或 plan revision。
  - 验证方式：新增/更新 SessionController、Timeline、提案面板与计划面板测试（待实现）；运行 `npx tsx --test packages/tui/test/session-controller-timeline.test.ts packages/tui/test/session-controller.test.ts packages/tui/test/trajectory-projector.test.ts`。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3)_

- [x] //TODO 8. 将 Benchmark 入口改为普通 Run 并补回归测试
  - 实现目标：调整 Headless Composition Root 与 TUI Benchmark Runner，移除任务提案生成/自动批准路径；保留 descriptor `completionCriteria` 的执行上下文和外部评分输入职责。
  - 成功判据：Headless 与 TUI Benchmark 均不生成任务提案等待或 `approvedTask`；`completionCriteria` 不成为 Runtime 完成门槛；Run 仍遵守 Observation Evidence，Benchmark 环境评分仍决定最终成功；TUI `auto` / `review` 不再承担任务提案审批。
  - 验证方式：新增/更新 Headless 与 TUI Benchmark 集成测试（待实现）；运行 `npx tsx --test benchmarks/test/headless-composition-root.test.ts benchmarks/test/tui-benchmark-runner.test.ts`。
  - _Requirements: [2.5](./requirements.md#req-2-5)_

- [x] //TODO 9. 同步 Runtime、TUI 与 Benchmark 架构文档
  - 实现目标：更新 `docs/architecture/runtime.md`、`docs/architecture/tui.md`、`docs/architecture/benchmarks.md` 与 `docs/architecture/README.md`，使其描述实现后的 Run 模式、Plan Prompt/Tool 权限、GoalPlan/Todo 证据和 Benchmark 普通 Run 行为。
  - 成功判据：架构文档不再描述 Goal 级 Plan Mode、未批准 Tool 硬门控、一个 Run 绑定一个 Todo 或 Benchmark 自动审批提案；文档与实现的状态所有权、提交边界和入口行为一致。
  - 验证方式：检查架构文档内相关术语与行为段落，并运行 `git diff --check`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [2.1](./requirements.md#req-2-1), [2.5](./requirements.md#req-2-5), [5.1](./requirements.md#req-5-1), [7.1](./requirements.md#req-7-1)_

- [x] //TODO 10. 覆盖跨层恢复、失败边界并完成集成
  - 实现目标：补充模式选择、任务审批、GoalPlan Patch 与 Run 执行交错的恢复和提交失败测试，修复集成中暴露的契约不一致。
  - 成功判据：每次 Snapshot/Trajectory 提交失败后都停在最后有效边界，不调用后续模型或业务 Tool；重启恢复同一 Run 的模式与等待点；旧 Run 证据、过期请求和未提交计划不改变当前状态。
  - 验证方式：新增跨层失败与恢复测试（待实现）；执行 `npx tsc --noEmit`、`npm test` 和下方全部 Planned Checks。
  - _Requirements: [7.1](./requirements.md#req-7-1), [7.2](./requirements.md#req-7-2), [7.3](./requirements.md#req-7-3), [7.4](./requirements.md#req-7-4)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#风险与待确认)。风险等级为 high，重点核验 Prompt-only 提案顺序不被误当作硬门控、既有 Tool 授权、当前 Run 证据归属、Benchmark 评分边界及故障恢复。

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1) | 新 Goal 输入前提交无参数 `/plan` 后，唯一后续 Run 使用 Plan 模式，命令不进入消息或 Step | Slash Command/Launcher 集成测试（待实现） |
| [1.2](./requirements.md#req-1-2) | `run_started` 持久提交前接受 `/plan`；并发时模式切换与启动按提交顺序线性化；同一 Run 重复命令幂等 | Coordinator 并发/提交顺序测试（待实现） |
| [1.3](./requirements.md#req-1-3) | 下一 Run 的 Plan 选择重启后保留并只消费一次；再后续 Run 回到普通模式 | Snapshot 恢复与多 Run 测试（待实现） |
| [1.4](./requirements.md#req-1-4) | 带参数或 `run_started` 已提交时拒绝切换；已处于其他等待点的 Run 不被改写 | Slash Command/Coordinator 失败路径测试（待实现） |
| [2.1](./requirements.md#req-2-1) | TUI、CLI、Headless 普通入口直接以用户请求执行且不出现任务提案等待 | 各 Composition Root 集成测试（待实现） |
| [2.2](./requirements.md#req-2-2) | 普通模式可调用已授权 Tool；Policy、Action 审批和当前 Run 完成证据仍有效 | Runner/Tool Policy 测试（待实现） |
| [2.3](./requirements.md#req-2-3) | 普通模式可通过 `ask_user` 等待答案，答案不成为 Observation 或批准任务 | Runner 与交互恢复测试（待实现） |
| [2.4](./requirements.md#req-2-4) | 普通模式的提案审批或未授权 GoalPlan 更新被拒且无状态副作用 | Contract/Runner 测试（待实现） |
| [2.5](./requirements.md#req-2-5) | Headless/TUI Benchmark 使用普通 Run，不产生提案或 `approvedTask`；criteria 不成为 Runtime 完成门槛，环境评分仍决定成功 | Headless 与 TUI Benchmark 集成测试（待实现） |
| [3.1](./requirements.md#req-3-1) | Plan Prompt 指示先提案；Runtime 不因未批准或 `isReadOnly` 新增 Tool 门控；既有授权仍生效且完成决策被拒 | Prompt/Runner/Tool Policy 测试（待实现） |
| [3.2](./requirements.md#req-3-2) | 提案形成持久等待点后，用户响应前不再调用模型或 Tool | Coordinator 与 Trajectory 测试（待实现） |
| [3.3](./requirements.md#req-3-3) | 当前请求 ID 的批准固定本 Run 任务；反馈使旧提案失效并继续同一 Run | Coordinator 交互测试（待实现） |
| [3.4](./requirements.md#req-3-4) | 审批前后更新 Todo 不会改变审批对象、授予执行权限或触发重新审批 | GoalPlan/任务审批集成测试（待实现） |
| [4.1](./requirements.md#req-4-1) | 单独 `/plan` 不创建空计划；首个成功的获授权 Patch 创建并持久保存唯一计划 | Reducer/Coordinator/Snapshot 测试（待实现） |
| [4.2](./requirements.md#req-4-2) | 获授权模式可对同一计划执行增量 Patch，授权按模式能力判定 | Runtime Tool 授权测试（待实现） |
| [4.3](./requirements.md#req-4-3) | 普通模式不能写计划；已有计划仍可读取并显示，模式切换不删除计划 | Runner/TUI 测试（待实现） |
| [4.4](./requirements.md#req-4-4) | 新 Todo 获得稳定 ID；未知 ID、过期 revision 和非法状态变更整体失败 | GoalPlan Reducer/Storage 测试（待实现） |
| [5.1](./requirements.md#req-5-1) | 同一 Run 连续推进多个 Todo，不因此结束 Run 或创建后续 Run | GoalPlan Run 集成测试（待实现） |
| [5.2](./requirements.md#req-5-2) | 只有结构化、获授权的 Patch 改变 Todo，聊天或 Run 状态不隐式更新计划 | Contract/Runner 测试（待实现） |
| [5.3](./requirements.md#req-5-3) | Run 自身完成条件和证据通过后，即使有未完成 Todo 也可结束，Todo 状态保持不变 | Runner/GoalPlan 集成测试（待实现） |
| [5.4](./requirements.md#req-5-4) | Run 结束后未完成 Todo 不会自行启动下一 Run；用户新输入创建的新 Run 使用相应模式 | Coordinator 多 Run 测试（待实现） |
| [5.5](./requirements.md#req-5-5) | Todo 完成必须引用当前 Run 已提交 Observation；旧 Run、未提交或无效证据使整个 Patch 无副作用失败 | GoalPlan Runner/Evidence Gate 原子性测试（待实现） |
| [6.1](./requirements.md#req-6-1) | 待批准提案展示审批操作；普通 Run 不展示不存在的审批状态 | TUI 组件测试（待实现） |
| [6.2](./requirements.md#req-6-2) | 已提交 GoalPlan 在普通模式可见；缺省计划不被 UI 推测生成 | Plan Panel/Session Controller 测试（待实现） |
| [6.3](./requirements.md#req-6-3) | 提案、反馈、计划更新和 Observation 顺序稳定，迟到通知不覆盖较新状态 | Timeline/Stream 投影测试（待实现） |
| [7.1](./requirements.md#req-7-1) | 模式、审批响应和计划更新在继续模型或 Tool 前持久化，并在重启后恢复 | Snapshot/Trajectory 故障注入测试（待实现） |
| [7.2](./requirements.md#req-7-2) | 跨 Goal/Run 或已失效的请求 ID 无副作用拒绝，原等待点保留 | Coordinator 交互测试（待实现） |
| [7.3](./requirements.md#req-7-3) | 保存失败、坏 Snapshot 或不一致状态停在有效提交边界，不触发后续副作用 | Storage/Runtime 故障注入测试（待实现） |
| [7.4](./requirements.md#req-7-4) | 普通与 Plan 完成只接受当前 Run 已提交 Observation，不接受旧 Run 事实、用户回答或提案文本 | Evidence Gate/Runner 测试（待实现） |

### Latest Result

**整体状态：passed；新鲜度：current。**

- **验证时间：** 2026-09-23 20:33（Asia/Shanghai）。
- **被测 Git 提交：** 无；在当前分支 `refactor/planmode` 的未提交工作树上验证。
- **实现与测试差异 SHA-256：** `6c6fff44ed12232bf49a775e34fcb37ce5a9de564430ba8870c92be6d6c626a8`（`git diff --binary`，排除本文件的可变验证记录）。
- **合同指纹：** `requirements.md` + `design.md` SHA-256 `d072cd0dcfb63a99540e2eb0cbcb0a583e184d8d6f24197acc81700a8f665f19`；本文件至 Planned Checks 的内容 SHA-256 `4dad10f99a607008696c83d9de13f34932a422bec9c2b0a6a7742c70de126024`。
- **完整检查：** `npx tsc --noEmit`、依赖边界检查、GEPA adapter 163 项均通过；全部 TS/TSX 测试顺序执行 1,320/1,320 通过，`scripts/` 的 `.mjs` 测试 14/14 通过；`git diff --check` 通过。
- **并行回归备注：** 三次 `npm test` 均通过前置阶段，测试阶段各有 1–2 项无关的 TUI/清理时序测试间歇失败；失败项单独执行或在完整串行测试中通过。串行运行使用相同完整测试发现集，未跳过用例。

| 验收范围 | 实际检查结果与证据 |
|---|---|
| [1.1](./requirements.md#req-1-1)–[1.4](./requirements.md#req-1-4) | **passed。** `/plan` 控制 effect、一次性选择、`run_started` 线性化、重复/已启动/带尾部状态拒绝均通过。证据：[slash-command.test.ts](../../packages/slash-command/test/slash-command.test.ts)、[goal-plan-mode.test.ts](../../packages/runtime/test/goal-plan-mode.test.ts)、[goal-coordinator.test.ts](../../packages/runtime/test/goal-coordinator.test.ts)、[session-controller.test.ts](../../packages/tui/test/session-controller.test.ts)。 |
| [2.1](./requirements.md#req-2-1)–[2.5](./requirements.md#req-2-5) | **passed。** 普通 Run 直接执行并保留 Tool/Action/Observation 校验；`ask_user` 仍能等待；提案与未授权计划更新被拒；Headless 和 TUI Benchmark 传入任务上下文，不审批提案，环境结果仍作为评分依据。证据：[runner-pretask-read.test.ts](../../packages/runtime/test/runner-pretask-read.test.ts)、[headless-composition-root.test.ts](../../benchmarks/test/headless-composition-root.test.ts)、[tui-benchmark-runner.test.ts](../../benchmarks/test/tui-benchmark-runner.test.ts)、[evaluation-runner.test.ts](../../benchmarks/alfworld/test/evaluation-runner.test.ts)、[worker-runtime.test.ts](../../benchmarks/swebench/test/worker-runtime.test.ts)。 |
| [3.1](./requirements.md#req-3-1)–[3.4](./requirements.md#req-3-4) | **passed。** Plan Prompt/Runtime 授权边界、持久审批等待、批准和反馈的请求 ID 校验，以及 Todo 与审批对象分离均通过。证据：[runner-pretask-read.test.ts](../../packages/runtime/test/runner-pretask-read.test.ts)、[goal-coordinator-task-interaction.test.ts](../../packages/runtime/test/goal-coordinator-task-interaction.test.ts)、[goal-coordinator.test.ts](../../packages/runtime/test/goal-coordinator.test.ts)。 |
| [4.1](./requirements.md#req-4-1)–[4.4](./requirements.md#req-4-4) | **passed。** 空计划不因模式切换创建；授权增量 Patch、稳定 ID/revision 原子拒绝、跨模式读取与 Snapshot 往返均通过。证据：[goal-plan.test.ts](../../packages/runtime/test/goal-plan.test.ts)、[goal-plan-mode.test.ts](../../packages/runtime/test/goal-plan-mode.test.ts)、[goal-plan-run.test.ts](../../packages/runtime/test/goal-plan-run.test.ts)、[goal-plan-snapshot.test.ts](../../packages/storage/test/goal-plan-snapshot.test.ts)、[model-inference-projector.test.ts](../../packages/agent/test/model-inference-projector.test.ts)。 |
| [5.1](./requirements.md#req-5-1)–[5.5](./requirements.md#req-5-5) | **passed。** 单个 Run 连续完成多个 Todo；Run 终态不推进或清理计划；完成条件与计划证据均只接受当前 Run 已提交事实，过期和未提交证据无副作用。证据：[goal-plan-run.test.ts](../../packages/runtime/test/goal-plan-run.test.ts)、[goal-plan.test.ts](../../packages/runtime/test/goal-plan.test.ts)、[goal-coordinator.test.ts](../../packages/runtime/test/goal-coordinator.test.ts)。 |
| [6.1](./requirements.md#req-6-1)–[6.3](./requirements.md#req-6-3) | **passed。** 当前等待点驱动审批面板，普通与 Plan Run 均展示已提交 GoalPlan；Timeline 与迟到通知测试保持已提交顺序。证据：[session-controller.test.ts](../../packages/tui/test/session-controller.test.ts)、[session-screen.test.tsx](../../packages/tui/test/session-screen.test.tsx)、[session-controller-timeline.test.ts](../../packages/tui/test/session-controller-timeline.test.ts)、[trajectory-projector.test.ts](../../packages/tui/test/trajectory-projector.test.ts)。 |
| [7.1](./requirements.md#req-7-1)–[7.4](./requirements.md#req-7-4) | **passed。** 重启恢复同一 Run 的模式/等待点、旧请求无副作用拒绝、Snapshot/Trajectory 故障停在有效边界，以及普通/Plan 完成证据归属均通过。证据：[goal-coordinator-task-interaction.test.ts](../../packages/runtime/test/goal-coordinator-task-interaction.test.ts)、[goal-plan-run.test.ts](../../packages/runtime/test/goal-plan-run.test.ts)、[runner-pretask-read.test.ts](../../packages/runtime/test/runner-pretask-read.test.ts)、[goal-snapshot-interaction.test.ts](../../packages/storage/test/goal-snapshot-interaction.test.ts)、[trajectory.test.ts](../../packages/runtime/test/trajectory.test.ts)。 |

**验证时未提交路径：**

- `benchmarks/alfworld/test/evaluation-runner.test.ts`、`benchmarks/src/headless-composition-root.ts`、`benchmarks/src/tui-benchmark-runner.ts`、`benchmarks/swebench/test/acp-result-projection.test.ts`、`benchmarks/swebench/test/worker-runtime.test.ts`、`benchmarks/test/file-persistence-adapter.test.ts`、`benchmarks/test/headless-composition-root.test.ts`、`benchmarks/test/remote-tool-registry.test.ts`、`benchmarks/test/tui-benchmark-runner.test.ts`
- `docs/architecture/README.md`、`docs/architecture/benchmarks.md`、`docs/architecture/runtime.md`、`docs/architecture/tui.md`
- `packages/runtime/test/goal-coordinator-task-interaction.test.ts`、`packages/runtime/test/goal-plan-run.test.ts`、`packages/tui/src/session-controller.ts`、`packages/tui/src/session-screen.tsx`、`packages/tui/src/types.ts`、`packages/tui/test/session-controller.test.ts`、`packages/tui/test/session-screen.test.tsx`
- `specs/mode-driven-task-proposal/tasks.md`（TODO 10 勾选与本验证记录）

# Run 执行与持久化恢复职责拆分设计

## Overview

在不改变 Goal Snapshot 结构和现有运行入口的前提下，将 `Runner` 中的恢复读取与执行推进分开，继续以共享提交器维护事实、快照和标记的顺序；内置文件存储在同一次写入内安全重试临时故障。对应需求 1–3。

## Key Design Decisions

1. **保留单一可恢复状态。** `RunState` 继续持有 `pendingAction`、`pendingThink`、`pendingProgram`、`pendingModelRepair`、`committedThroughSequence` 等恢复事实；`ExecutionControl` 等进程内资源只随调用传递。既有 Snapshot 协议、`RunScheduler`、`Runner` 对外入口及 Goal/Run 身份保持不变，不建立第二份 Run 状态。此项沿用用户在设计阶段确认的选择，对应需求 1、2。
2. **按职责拆分现有 `Runner`。** 保留 `Runner` 作为 `RunScheduler` 门面；只读的恢复组件负责加载 Goal、校验 Goal/Run 身份和读取已提交恢复事实；执行组件负责模型、Tool、授权、领域转换与继续执行。执行组件声明何时需要检查点，但只通过现有提交端口写入；恢复读取组件不得推进状态或产生写入。`GoalCoordinator` 继续拥有 waiting 输入和跨 Run `continue`，避免出现第二套生命周期，对应需求 1、2。
3. **保留共享提交顺序。** `TrajectoryCheckpointCommitter` 仍按事实及 frame、accepted Patch、Snapshot、`state_committed` 标记的顺序提交；只有成功返回的快照副本可替换执行组件当前状态。中途失败不得发起依赖该提交的模型或 Tool 调用；工具已产生效果而 Observation 提交失败时，沿现有待处理 Action 恢复规则处理，不声称回滚。对应需求 2、3。
4. **重试由内置文件存储完成，端口签名不变。** `GoalStore`、`TrajectoryStore` 和提交端口的方法签名不变；不在提交器外层重试整个 `commit`。`JsonFileGoalStore.save` 和 `JsonFileTrajectoryStore.append` 在各自一次调用内部保留相同序列化输入或事件身份，对明确的临时文件系统错误最多尝试三次。协议、数据损坏及未知错误不重试。内存实现没有文件故障；包装端口的非存储副作用不纳入此重试。此项遵守用户确认的端口约束，对应需求 3。
5. **不扩展跨进程保证。** 本次不增加租约、Outbox、外部工具效果的 exactly-once 或旧快照迁移。恢复仍以最新有效 Snapshot 的边界读取事实；未提交尾部不作为恢复进度。单次调用内的重试不得把不确定的写入结果直接当作失败后重新提交。对应需求 2、3。

## 风险与待确认

- 风险等级：high；理由：执行入口、恢复读取和文件写入重试共同影响检查点正确性与外部效果边界，与已批准需求一致。
- 关键操作：无；不删除现有 Goal、迁移快照或改变权限。
- 风险：追加已落盘但调用报错、Snapshot 已替换但后续归档标记处理报错、标记追加结果不明时，错误的整段重试会产生重复事实或错误成功报告；不完整 JSONL 尾部必须拒绝继续。自定义持久化端口没有内置文件重试保证，仍须遵守既有提交成功/失败契约。
- 待确认：无。

## Architecture

```text
GoalCoordinator -> Runner (RunScheduler 门面)
                      |-> RunRecoveryReader -> GoalStore / TrajectoryStore (只读)
                      |-> RunExecutor -> StepExecutor / ToolRegistry
                                      -> TrajectoryCheckpointCommitter
                                           -> GoalStore / TrajectoryStore (写入)
```

`RunRecoveryReader` 提供初始 Goal 恢复、身份及协议检查，以及当前 Run 所需的已提交 Think、模型纠错、Context Lookup 和 Program 等事实读取。它只返回已验证的 Goal 与恢复上下文，不缓存另一份权威状态。`RunExecutor` 消费这些结果，沿原有状态机处理 pending Action、Program 与等待点；恢复选择仍受 Tool replay policy、授权和已提交边界约束。`Runner` 门面维持现有构造与调度调用方式。

## Components and Interfaces

- `Runner`：保留现有公开方法和依赖注入形状，组装恢复读取、执行推进与共享提交器；不再直接读 `GoalStore` 或查询恢复用 Trajectory。
- `RunRecoveryReader`：提取现有 `restore*` 查询与跨 Run 边界校验；用 `RunRef` 加载时严格匹配 `goalId/runId`。纯读取入口不自动调用 `RunExecutor`。
- `RunExecutor`：承接 `runLoop`、Action/Observation、模型阶段与 PTC 推进；持有当前已提交 Goal 副本，通过 `TrajectoryCheckpointCommitterPort` 请求提交，通过恢复读取组件取得必要历史，不直接依赖具体文件 Store。
- `TrajectoryCheckpointCommitter`：维持现有端口和提交顺序，继续把失败包装为现有追加或标记错误；不因存储失败重新调用 Tool，也不重放整个提交请求。
- 内置 JSON 文件 Store：仅在具体 I/O 实现内部增加故障分类、有限退避和写入结果核对，不改变 Runtime/Storage Port 的方法签名。`AcpTrajectoryStore` 等包装器的通知失败不是文件存储故障，不参与自动重试。

## Error Handling

文件存储只将明确可暂时消失的 `EINTR`、`EAGAIN`、`EBUSY` 作为重试候选；每次写入最多三次尝试，间隔采用固定的短暂退避。其余文件错误、快照/轨迹协议错误、取消及校验失败立即传播。`ExecutionControl` 仍在提交调用前后检查；端口不新增取消参数，单次存储重试的等待保持有界。

`JsonFileTrajectoryStore.append` 在进入写入队列后只分配一次 `eventId`、sequence 和完整 JSONL 行。若追加报临时错误，先读取并严格校验文件尾部：同一事件已完整落盘则返回该事件；确认未落盘才用同一行重试；出现部分行、身份冲突或无法确认结果则停止并报错。成功核对后更新序号缓存。`state_committed` 使用同一规则，因此标记失败不会导致整个提交重新追加事实。

`JsonFileGoalStore.save` 只编码一次目标 Snapshot。临时故障后核对正式文件是否已经是本次完整快照：若已替换则继续完成剩余的归档标记处理；否则重新尝试原子写入。无法验证、文件损坏或重试耗尽时抛出错误。提交器仅在存储返回成功后继续；标记最终失败仍保留已成功保存的 Snapshot，并沿现有诊断与错误路径停止当前推进。

## Testing Strategy

- 对需求 1、2，沿现有 Runtime、Storage、Web 和 Benchmark 入口验证普通/Plan Run、审批等待、Action/Observation、取消和重启恢复；特别检查同一 Run 身份、Step、消息及已提交轨迹边界。
- 对需求 3，在内置文件存储的故障注入测试中分别覆盖写入前临时失败、写入已成功但调用结果不明、快照替换后的失败、标记失败和重试耗尽；断言事件身份与序号、快照权威和工具调用次数。协议损坏、未知错误和部分 JSONL 行应立即失败。
- 执行相关类型检查、Runtime/Storage 回归与依赖边界检查；通过源码和测试核对恢复读取没有写入副作用、执行组件没有直接文件存储依赖。具体命令和结果留给 Tasks 记录。

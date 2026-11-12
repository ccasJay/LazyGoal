---
feature: runtime-stop-and-approved-action-handoff
status: proposed
risk: high
created_at: 2026-11-12
delivered_at: null
supersedes: []
superseded_by: null
---

# Runtime 停止与获批操作交接

## 目标与范围

落实专项审查 RC01 的等待决定与 Grant 撤销提交顺序，以及 RC06 的 PTC 未知结果恢复。沿用现有 Session 收据、调度名额和协议边界。

## 用户故事

- **S1** 作为控制 Run 的用户，我希望停止、等待决定和撤销都以最新状态为准，以便过期回答或授权操作无法覆盖已提交的状态。
- **S2** 作为审阅 PTC 工具操作的用户，我希望重执行遵循最终获批参数，拒绝重试后仍可恢复，以便准确控制可能已经产生的外部效果。

## 验收标准

| ID | 故事 | 类型 | 当 | 系统应 | 验证 |
|---|---|---|---|---|---|
| R1.1 | S1 | 事件 | 回答、任务决定、工具审批或未知结果决定提交前，Interrupt 已受理或目标等待已失效 | 以既有业务错误拒绝过期决定。保持最新 Run、中断和队列状态，无该决定的有效事实、消息、Grant 激活或执行。 | 挂起决定准备，先提交 Interrupt，再放行旧决定。覆盖问答、任务审批、原样及修订工具审批、未知结果决定，并测试旧 Goal／Run／等待身份。 |
| R1.2 | S1 | 事件 | 等待决定先提交，随后收到 Interrupt；或同一等待收到两个有效决定 | 只允许一次等待解除。随后受理的 Interrupt 保持有效，阻止未开始的工具并按既有规则中断已开始的操作。 | 挂起提交后的调度或执行，验证 Interrupt 可受理，检查未启动与已启动两种结算；并发提交两次决定，检查只落一份有效事实和业务结果。 |
| R1.3 | S1 | 状态 | 模型选择等允许的状态更新先于等待决定提交，且等待仍有效 | 在最新 Goal 上重新校验并应用决定，保留先提交的更新。修订审阅失效时沿用重新审阅的业务结果。 | 用模型选择和修订预检的真实入口控制交错，断言决定使用最新状态，旧 `reviewRef` 无法通过。 |
| R1.4 | S1 | 异常 | 持续 Grant 已暂存，但批准被 Interrupt 抢先、快照保存失败或写入结果不明 | pending Grant 不能匹配或放行。仅在权威 Snapshot 确认当前可执行批准引用同一决定、最终版本和范围后，才激活待激活 Grant 并进入既有执行准入。无法确认时传播失败，等待现有恢复流程核验。 | 用可控 Grant Store 与真实文件 Snapshot／Trajectory 注入保存前失败、已写入后抛错和 marker 失败。重开 Runtime 核对已提交身份、Grant 匹配和工具次数；无有效批准的尾部事实不能授权。 |
| R1.5 | S1 | 事件 | 通过统一撤销或 Tool 撤销入口撤销授权，期间同一 Goal 还有其他状态提交 | Grant Store 的撤销继续生效。撤销事实只提交到验证过的当前 Run，保存基于最新 Goal，保留执行、等待、模型与中断状态。撤销后的审计写入失败保留错误，授权仍已撤销。 | 对 Tool 与 Sandbox 撤销注入交错和审计保存失败，核对最新快照、撤销事实归属、Grant 匹配与调用结果。 |
| R2.1 | S2 | 事件 | PTC 子调用因资源停止留下 `pendingStop` 与未知结果，用户用当前 `recoveryRef` 明确允许重执行 | 用同一 Action 的最终获批参数准备工具、解析沙箱计划和实际执行。保留原请求、程序身份、调用位置和延迟停止原因。 | 对原参数 A、获批参数 B 构造真实等待后重开 Runtime，捕获准备、沙箱规划和工具执行均使用 B。另测未修订参数及旧 `recoveryRef`，核对副作用次数和父程序结算。 |
| R2.2 | S2 | 事件 | 用户拒绝 PTC 未知结果重试，无论是否存在 `pendingStop` | 记录拒绝与对应 Observation，保留此前效果未知的事实。结果记账使用标准信封，修订调用计入修订元数据。后续按既有路径重放结果或完成延迟停止。 | 覆盖修订／未修订及有／无 `pendingStop`。从落盘快照重建，核对 `resultBytes` 等于重建信封累计字节、修订事实引用、重放无 `PTC_REPLAY_MISMATCH`、工具未重执行、父程序只结算一次。 |
| R2.3 | S2 | 异常 | 缺少当前重执行决定、旧决定再次提交、宿主关闭，或 PTC 达到现有资源上限 | 未知副作用保持人工确认门禁，宿主关闭保留可恢复状态。修订元数据使用相同的既有额度规则，重执行不重置预算。 | 验证第二次未知结果需要新 `recoveryRef`、关闭后恢复及帧／累计结果额度边界；断言无自动写入、无伪造取消终态。 |

组合：使用 `packages/runtime/test` 的 Interrupt、Coordinator 交互、Grant 恢复、PTC 修订和中断测试验证 R1.1–R2.3。用受控存储和调度闸门验证两种提交顺序，并在支持 Seatbelt 的 macOS 执行实际 PTC worker 回归。运行 `npm test` 和 `npm run check:docs`。

## 决策

| 决策 | 理由 | 放弃 |
|---|---|---|
| [GoalCoordinator](../../packages/runtime/src/goal-coordinator.ts#L1363) 复用按 Goal 串行的 [Mutation Gate](../../packages/runtime/src/goal-mutation-gate.ts) 与 [共享提交器](../../packages/runtime/src/trajectory-checkpoint-committer.ts#L539)。Gate 内读取最新 Snapshot，核验 Goal、Run、等待、Interrupt 与决定绑定，基于该状态构造转换并提交关联事实和 Snapshot。Gate 外的准备结果在使用前核对绑定。提交结束后释放 Gate，再交给既有调度与执行准入。 | 提交顺序决定谁先获得转换权。模型、业务工具与整轮执行留在 Gate 外。 | 无 |
| 持续授权遵循 [审批修订契约](../action-approval-revision/spec.md)。Grant 暂存可在 Gate 外完成，进入提交时复核其与最新等待的绑定。Snapshot 确认后才允许按当前批准激活。恢复以权威 Snapshot 和匹配身份裁决，`state_committed` marker 仍是旁路事实。已激活的持续授权由既有撤销入口处理。 | 保存结果不明时可核验原决定，避免把 append 成功、pending 记录或重试本身当作授权。 | 无 |
| 两个撤销入口在同一 Goal Gate 内验证当前 Run 后执行撤销并提交审计事实，保留 Grant Store 作为授权事实源。 | 保持 Run 归属，且 Grant 撤销无需保存撤销前取得的执行状态。 | 无 |
| PTC 延迟停止路径复用 [执行版本解析](../../packages/runtime/src/action-approval.ts#L370)。拒绝重试与 Runner 记账、重放共用 [标准信封](../../packages/runtime/src/action-approval.ts#L244) 及现有 `0` 引用占位的字节口径。 | 原请求用于校验程序重放身份，获批版本用于执行和修订说明。相同结果按相同信封形状计费。 | 无 |

## 风险与否定性保证

| 等级 | 理由 | 关键操作 |
|---|---|---|
| high | 改动接触用户停止、持续授权激活和可能产生外部副作用的重执行。必须验证准入、持久化故障和恢复。 | 验证使用临时存储、隔离工具和本地程序 worker。生产 Grant 与真实业务副作用不属于本 Spec 的验收操作。 |

实现范围限于 Runtime 的上述交接，沿用现有 Snapshot、Trajectory、权限作用域和公开协议。RC02 的 Session 收据与名额归属单独处理。

## 任务

- [ ] //TODO 1. 线性化等待决定与 Interrupt 的提交，并以当前已提交批准核验 Grant 激活 → R1.1、R1.2、R1.3、R1.4；检查：Interrupt 交错与 Grant 保存故障的定向测试。
- [ ] //TODO 2. 将两个 Grant 撤销入口的审计提交绑定到最新 Run → R1.5；检查：撤销与并发保存的定向测试。
- [ ] //TODO 3. 统一 PTC 延迟停止的执行参数与拒绝重试的结果记账，同步 Runtime 的所有权和恢复说明 → R2.1、R2.2、R2.3；检查：PTC 定向恢复测试与 `npm run check:docs`。

## 执行记录

- 状态：未执行
- 验证：-
- 结果：-
- 未决：无

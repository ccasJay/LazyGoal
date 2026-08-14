# 最小同步 Run Loop 需求文档

## 简介

本阶段在既有 Runtime 的 `Launcher`、状态转换与内存 `RunStore` 基础上，补齐单进程、同步执行的最小 Run Loop。`InlineScheduler` 接收一个明确的 `runId` 并委托 `Runner`；`Runner` 加载并推进该 Run 的最新 `RunState`；可注入的 `StepExecutor` 为一个 `RunState` 产生一次 `StepResult`。由于调度同步完成，`schedule` 与 `launch()` 的成功结果必须反映执行后的最新 `RunState`，不再把 `created` 误报为最终状态。首版只验证编排与状态持久化，不接入真实 LLM、Tool 或后台执行环境。

## 术语约定

- `Goal`：待完成的任务目标；同一个 Goal 可以启动多个 Run。
- Run：使用冻结 Profile 执行一个 Goal 的一次逻辑实例，由 `runId` 标识；它可以跨越 `waiting` 与 `resume`，直到进入终态。
- `RunState`：一个 Run 在某个时刻的完整当前快照，包含其身份、Goal、冻结 Profile、生命周期状态、步数与最近结果；`RunStore` 只保存最新 `RunState`，不保存历史。
- `Runner`：可复用的执行服务，不承载某个 Run 的业务数据；它读取、推进并保存 `RunState`。

## 需求

### 需求 1：同步调度一个明确的 Run

**用户故事：** 作为 Runtime 调用方，我希望已启动的 Run 能被同步调度，以便 `launch()` 后存在可验证的实际执行路径。

#### 验收标准

1. 当调用 `InlineScheduler.schedule(runId)` 时，系统必须只将该明确 Run 的 `runId` 委托给注入的 `Runner`，并等待该次连续执行结束后才完成调用。
2. 当该次连续执行正常结束时，`InlineScheduler.schedule(runId)` 必须返回 `Runner` 所得的最新 `RunState`，而不是返回固定状态或空结果。
3. 当 `Runner` 在调度期间抛出错误时，`InlineScheduler` 必须将原错误交给调用方，且不得改为后台执行或伪造调度成功。
4. `InlineScheduler` 不得扫描 `RunStore`、选择或替换 Profile、接受多个 Run ID、创建队列任务或启动并发 Worker。

### 需求 2：加载、启动并逐步推进 RunState

**用户故事：** 作为 Runtime 调用方，我希望 `Runner` 按固定顺序推进一个 Run 的最新 `RunState`，以便每次状态变化都可恢复和验证。

#### 验收标准

1. 当 `Runner.runUntilBlocked(runId)` 加载到状态为 `created` 的 `RunState` 时，系统必须先完成 `created → running` 转换并保存新的 `RunState`，再首次调用 `StepExecutor`。
2. 当 `RunState` 处于 `running` 状态时，系统必须每次只调用一次 `StepExecutor.execute(state)`，并向它传入该次执行对应的当前 `RunState`。
3. 当 `StepExecutor` 返回一个 `StepResult` 时，系统必须恰好调用一次既有 `transition`，并在开始下一次执行前保存所得的 `RunState`。
4. 如果给定的 `runId` 不存在，系统必须向调用方返回可区分的失败结果，且不得调用 `StepExecutor` 或保存新的 `RunState`。
5. 当目标 Run 的最新 `RunState` 已处于终态时，系统不得再次调用 `StepExecutor` 或改变该 `RunState`。
6. 当 `Runner.runUntilBlocked(runId)` 正常结束时，系统必须返回最后一次保存的 `RunState`；该状态可以是 `waiting`、`completed`、`failed` 或原有终态。

### 需求 3：等待与显式恢复

**用户故事：** 作为 Runtime 调用方，我希望等待中的 Run 只在显式恢复后继续执行，以便同步 Loop 不会隐式轮询或自发重试。

#### 验收标准

1. 当一次 `StepExecutor` 执行产生 `wait` 结果时，系统必须保存状态为 `waiting` 的 `RunState` 并结束当前同步执行。
2. 当调用 `Runner.resume(runId)` 且目标 Run 的最新 `RunState` 为 `waiting` 时，系统必须先完成 `waiting → running` 转换并保存新的 `RunState`，再继续该 Run 的同步执行，并返回该次执行结束后的最新 `RunState`。
3. 如果 `Runner.resume(runId)` 的目标不存在或其最新 `RunState` 不处于 `waiting` 状态，系统必须向调用方返回可区分的失败结果，且不得调用 `StepExecutor` 或改变既有 `RunState`。
4. 本阶段不得通过定时器、轮询、事件订阅或后台队列自动恢复 `waiting` Run。

### 需求 4：终止连续执行并限制步数

**用户故事：** 作为 Runtime 作者，我希望同步 Loop 有确定的停止条件，以便不会无限执行或留下无法解释的运行状态。

#### 验收标准

1. 当一次执行产生 `continue` 结果时，系统必须在保存该次 `RunState` 后继续下一次执行，直到该 Run 的 `RunState` 不再处于 `running` 状态或达到步数上限。
2. 当一次执行产生 `complete` 或 `fail` 结果时，系统必须保存对应终态的 `RunState` 并结束当前同步执行。
3. 当允许的 `StepExecutor` 执行次数达到配置的 `maxSteps` 且 Run 的 `RunState` 仍为 `running` 时，系统必须不再调用 `StepExecutor`，将该 `RunState` 置为 `failed` 并保存可识别的步数上限错误。
4. 系统必须将 `maxSteps` 作为明确的配置边界，防止任意数量的 `continue` 导致无限同步循环。

### 需求 5：保持可替换且可测试的执行边界

**用户故事：** 作为 Runtime 作者，我希望 `Runner` 通过明确依赖执行一步，以便不依赖真实模型或外部服务也能验证 Loop 行为。

#### 验收标准

1. `Runner` 必须通过注入的 `RunStore` 与 `StepExecutor` 工作，不得直接依赖 `@lazygoal/llm`、具体 Tool、网络、文件系统或后台队列。
2. 当 `StepExecutor.execute` 抛出异常时，系统必须将该异常表达为一次 `step.fail`，保存状态为 `failed` 的 `RunState` 后结束执行。
3. 当保存或加载 Run 的基础设施操作失败时，系统必须停止后续执行并将原错误交给调用方处理。
4. 自动化测试必须使用 fake `StepExecutor` 与内存 Store，覆盖同步调度、启动顺序、连续执行、等待与恢复、步数上限、Executor 异常和 Store 失败。
5. 自动化测试不得请求真实 LLM、Tool、网络、文件系统、定时器或后台队列。

### 需求 6：向 Launcher 调用方返回同步执行结果

**用户故事：** 作为 Runtime 调用方，我希望 `launch()` 返回实际执行后的状态，以便不把已经结束或等待中的 Run 误认为刚创建。

#### 验收标准

1. 当 `launch()` 成功创建并完成同步调度一个 Run 时，系统必须返回生成的 `runId`、冻结 Profile 标识和该 Run 最后保存的 `RunState`。
2. 当同步执行结束于 `waiting`、`completed` 或 `failed` 时，`launch()` 的成功结果必须返回对应的实际 `RunState`，不得固定声明为 `created`。
3. 当 Profile 不存在时，`launch()` 必须继续返回可区分的 `PROFILE_NOT_FOUND` 结果，且不得创建、保存或调度 Run。
4. 当调度或运行基础设施抛出错误时，`launch()` 必须将原错误交给调用方，且不得伪造包含最终 `RunState` 的成功结果。

## 不在本阶段范围内

- 真实 LLM 调用、Prompt 组装、结构化模型输出解析或多模型路由
- Tool Registry、Tool 调用、Tool 结果回填与权限执行
- 异步队列、Worker、并发执行、轮询、重试、租约或多 Run 批处理
- 持久化数据库、事件历史、checkpoint、重放、outbox 或可观测性平台

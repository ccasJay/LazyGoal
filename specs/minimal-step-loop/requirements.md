# 最小 Launcher 与单 Run 调度需求文档

## 简介

本阶段为 Goal-driven Runtime 增加确定的启动入口。`Launcher` 接收 Goal 和明确指定的 `profileId`，通过注入的 `RunIdGenerator` 生成 Run ID，解析对应 `AgentProfile`，创建带有冻结 Profile 快照的初始 Run，保存它，并把该 Run 的唯一 ID 交给 `Scheduler`。

本阶段只建立“从 Goal 到可调度 Run”的路径。`Scheduler` 一次只接收一个 `runId`；它不扫描队列、不选择 Profile、不执行 LLM、Tool 或完整 loop。

## 需求

### 需求 1：以固定 Profile 启动 Run

**用户故事：** 作为 Runtime 调用方，我希望用一个明确的 Agent Profile 启动 Goal，以便每个 Run 从可追踪、可恢复的初始配置开始。

#### 验收标准

1. 当调用方提供 Goal 和 `profileId` 时，Launcher 必须从注入的 Profile Registry 解析对应的 `AgentProfile`，不得在本阶段根据 Goal 自动选择 Profile。
2. 当 Profile 成功解析后，Launcher 必须调用一次注入的 `RunIdGenerator`，并使用其返回值作为新 Run 的唯一 ID。
3. `AgentProfile` 必须至少表达 Profile ID、system prompt、instructions 和可序列化的 Tool ID 列表。
4. Launcher 必须创建状态为 `created` 的新 Run，并将 Goal 与解析后的 Profile 快照关联到该 Run。
5. Launcher 必须在调度前通过 `RunStore` 保存该初始 Run；成功时必须返回生成的 Run ID、当前状态和冻结的 Profile 标识。
6. 已启动 Run 所使用的 Profile 快照不得因 Registry 中同名 Profile 后续更新而改变。

### 需求 2：只调度一个明确的 Run

**用户故事：** 作为 Runtime 调用方，我希望 Launcher 只提交一个明确的 Run 给 Scheduler，以便调度与 Profile 选择、loop 执行保持分离。

#### 验收标准

1. 当初始 Run 保存成功时，Launcher 必须调用一次 `Scheduler.schedule(runId)`，且只传递该 Run 的唯一 ID。
2. Scheduler 在本阶段不得解析或替换 Profile、扫描待执行 Run、批量调度多个 Run，或执行 LLM、Tool 和 loop。
3. 如果 Profile 不存在，Launcher 必须返回可区分的 `PROFILE_NOT_FOUND` 结果，且不得创建、保存或调度 Run。
4. 如果 `RunStore.save` 失败，Launcher 不得调用 Scheduler，并必须将该失败交给调用方处理。
5. 如果 Scheduler 调用失败，Launcher 必须将该失败交给调用方处理；已保存的 Run 保持 `created`，不伪造为已调度或 `running`。

### 需求 3：保持可测试的运行边界

**用户故事：** 作为 Runtime 作者，我希望 Launcher 的协作边界明确，以便不依赖真实模型或后台服务也能验证启动行为。

#### 验收标准

1. Launcher 必须通过注入的 Profile Registry、RunIdGenerator、RunStore 和 Scheduler 工作，不直接依赖 `@kai/llm`、具体 Tool 实现或后台队列。
2. 自动化测试必须使用 fake Registry、fake RunIdGenerator、fake Scheduler 与内存 Store 验证成功启动、Profile 不存在、保存失败和调度失败分支。
3. 自动化测试必须验证 Profile 快照在启动后独立于 Registry 中的后续修改，并验证 RunIdGenerator 只在成功解析 Profile 后调用一次。

## 不在本阶段范围内

- 根据 Goal 自动路由或用 LLM 选择 Profile
- 真实后台队列、Worker、并发控制、重试、租约和多 Run 批量调度
- LLM 调用、Prompt 渲染、Tool 执行、Runner 和完整自动 loop
- 事件轨迹、重放、outbox、原子 checkpoint 或持久化数据库

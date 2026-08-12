# 最小 Launcher 与单 Run 调度设计文档

## Overview（概览）

本阶段把 Goal-driven Runtime 的入口收敛为 `Launcher`。它不执行任何 Agent step，而是把一个 Goal 转换成可追踪、可恢复、可调度的初始 Run：

```text
LaunchRequest → Profile Registry → RunIdGenerator → createRun → RunStore.save → Scheduler.schedule(runId)
```

Launcher 选择并冻结 Profile；Scheduler 只接收一个明确的 `runId`；未来的 Runner/loop 才负责加载该 Run 并执行 step。这样每个 Run 都从完整的初始 Goal 和确定的 Agent 行为配置开始，而不是从某个后续状态切片开始。

### 设计选择

- **Profile 选择不属于 Scheduler。** Launcher 根据调用方提供的 `profileId` 查询 Profile Registry；Scheduler 只处理执行时机与目标 Run ID。
- **Run ID 由 Launcher 生成。** Launcher 调用注入的 `RunIdGenerator`；生产调用方可提供 UUID 生成函数，测试可提供固定 ID 函数。
- **Profile 在 launch 时冻结。** 同名 Profile 后续更新不应改变已启动 Run 的 system prompt、instructions 或 Tool 权限。
- **先保存，再调度。** Scheduler 或未来 Worker 在接到 `runId` 时，必然能从 `RunStore` 加载 Run。
- **本阶段不调用 LLM。** `@kai/llm`、Prompt 构造、Tool 运行和自动 loop 都留给后续 Runner。

## Architecture（架构）

```text
调用方
  │ launch({ goal, profileId })
  ▼
Launcher
  │ 1. ProfileRegistry.resolve(profileId)
  │ 2. RunIdGenerator()
  │ 3. createRun(goal, runId) + ProfileSnapshot
  │ 4. RunStore.save(createdRun)
  │ 5. Scheduler.schedule(runId)
  ▼
LaunchResult

未来：Scheduler → Runner → Loop
```

`Scheduler.schedule` 的当前边界严格为一次提交一个 `runId`。它不加载候选 Run、不扫描队列、不决定 Profile、不调用 `transition`，也不执行 loop。真实的队列、Worker 与并发策略以后替换或扩展 Scheduler 实现，不改变 Launcher 的启动语义。

## Components and Interfaces（组件与接口）

### 1. AgentProfile 与 Profile Registry

新增 `packages/runtime/src/agent-profile.ts`：

- `AgentProfile`：注册的静态 Agent 配置，至少包含 `id`、`systemPrompt`、`instructions` 和 `toolIds`。
- `AgentProfileSnapshot`：写入 Run 的 JSON 可序列化副本；不保存 Tool 函数、网络连接或凭据。
- `AgentProfileRegistry`：根据明确的 `profileId` 查找 Profile。第一版是确定性的 lookup，不基于 Goal 或 LLM 自动路由。

### 2. Launcher

新增 `packages/runtime/src/launcher.ts`：

- `LaunchRequest`：包含 `goal` 与明确的 `profileId`，不包含 Run ID。
- `RunIdGenerator`：函数类型 `() => string`；它由 Launcher 的调用方注入，生产环境可使用 UUID，测试使用稳定的 fake ID。
- `LaunchResult`：成功时返回 Run ID、`created` 状态和 Profile 标识；业务失败时返回 `PROFILE_NOT_FOUND`。
- `launch(request, { profiles, runIdGenerator, store, scheduler })`：唯一的公开启动函数。

Launcher 负责 Profile lookup、Run ID 生成、创建初始 Run、写入 Profile Snapshot、保存与单 ID 调度。它不负责生成模型消息、执行 Tool、推进状态或反复调用自己。

### 3. Scheduler

新增 `packages/runtime/src/scheduler.ts`：

- `RunScheduler`：只暴露 `schedule(runId)`，接收单个 Run ID。
- 它是 Launcher 的注入依赖；第一版不规定后台实现、队列实现或 Worker。

Scheduler 不接收 `Goal`、`AgentProfile` 或 Tool 实例，因而无法替换一个 Run 已冻结的行为配置。

### 4. 既有 Runtime 基础设施的变化

- `RunState` 增加 Profile Snapshot 字段，继续保存当前生命周期状态、stepCount 和 lastResult。
- `createRun` 接收已解析的 Profile Snapshot，并始终产生 `created` 状态。
- `RunStore` 接口保持 `save/load`；它保存的初始快照现在同时包含 Goal 与 Profile Snapshot。
- `transition` 不改动；它仍只负责从当前状态和输入计算下一状态。

`index.ts` 只导出 Launcher、Profile 与 Scheduler 的公共接口，以及既有 Runtime 公共接口。

## Data Models（数据模型）

### AgentProfile

| 字段 | 说明 |
|---|---|
| `id` | Profile 的稳定标识，供调用方选择。 |
| `systemPrompt` | 未来模型调用使用的系统约束。 |
| `instructions` | Profile 级任务执行说明。 |
| `toolIds` | 被允许的 Tool 标识列表，而非 Tool 实现。 |

### Run 与 Profile Snapshot

每个新 Run 的初始状态为：

```text
id + goal + profileSnapshot + status: created + stepCount: 0
```

Run ID 是不透明的机器标识，不从 Goal 文本或自然语言派生。Launcher 使用注入的 RunIdGenerator 生成它；生成函数不需要被写入 RunState。

Profile Snapshot 至少保留 `id`、`systemPrompt`、`instructions` 与 `toolIds` 的值。第一版不记录 Profile `version`：完整冻结快照已经保证恢复时的行为确定性；未来需要按配置版本聚合评测、排障或迁移时再引入。未来 Worker 通过独立的 Tool Registry 根据 `toolIds` 解析真正的 Tool 实现；该 Registry 不属于本阶段。

## Error Handling（错误处理）

- Registry 找不到 `profileId`：返回 `PROFILE_NOT_FOUND`；不创建、保存或调度 Run。
- RunIdGenerator 抛出错误：不创建、保存或调度 Run，原错误交给调用方处理。
- `RunStore.save` rejected：不调用 Scheduler，原错误交给调用方处理。
- `Scheduler.schedule` rejected：原错误交给调用方处理；初始 Run 已保存并保持 `created`，不伪造 `running` 或已调度结果。
- 不实现 launch 幂等、outbox 或调度重试；这些需要在未来引入真实队列时一并设计。

## Testing Strategy（测试策略）

新增 `packages/runtime/test/launcher.test.ts`，使用 fake Profile Registry、fake RunIdGenerator、fake Scheduler 与 `InMemoryRunStore`：

1. 显式 `profileId` 成功解析后，RunIdGenerator 恰好生成一次稳定 ID，并创建和保存一个带冻结 Profile Snapshot 的 `created` Run。
2. Scheduler 恰好收到该生成的 Run ID，且发生在保存之后。
3. Registry 后续修改 Profile 不改变已保存 Run 中的 Profile Snapshot。
4. `PROFILE_NOT_FOUND` 不生成 ID、不保存也不调度。
5. RunIdGenerator、Store 或 Scheduler 失败时错误向上冒泡；后两者的失败不伪造成功状态，Scheduler 失败时已保存 Run 保持 `created`。

所有测试不访问真实 LLM、Tool、网络、文件系统或后台队列。

## 范围边界

- 不根据 Goal 自动选择 Profile，也不使用 LLM Router。
- 不实现真实 Worker、后台循环、批量/多 Run 调度、并发、租约或重试。
- 不调用 LLM、不构造 system/user/assistant messages、不执行 Tool 或 `transition`。
- 不实现 trajectory、事件重放、outbox、数据库持久化或完整 checkpoint 历史。

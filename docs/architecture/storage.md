# Storage 模块

## 摘要

`@lazygoal/storage` 拥有持久化文件表示与实现：Profile 文件 DTO、Goal 快照版本化协议（v1/v2/v3 Schema、迁移与协议错误），以及实现 Runtime Port 的内存/JSON 文件 Store。它依赖 Runtime 的 Port 与领域契约；Runtime 不反向加载本模块。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [AgentProfileFile](../../packages/storage/src/agent-profile-file.ts) | Profile 文件 DTO（`schemaVersion: 1`）、严格 Schema 与 `AgentProfileConfigurationError` | 读取文件系统、构造 Runtime Profile |
| [JsonFileAgentProfileStore](../../packages/storage/src/json-file-agent-profile-store.ts) | 实现 Runtime `AgentProfileStore` Port，读取单个 `<profileId>.json` | 扫描其它 Profile、读取 Tool 实例、校验 Tool 注册 |
| [GoalSnapshot 协议](../../packages/storage/src/goal-snapshot.ts) | `GoalSnapshotSchema`（v1/v2/v3 严格 Schema + 跨字段不变量）、v1/v2→v3 只读迁移、`GoalSnapshotProtocolError`、`cloneValidatedGoal` | 文件系统 I/O、领域状态转换 |
| [InMemoryGoalStore](../../packages/storage/src/goal-store.ts) | 实现 Runtime `GoalStore` Port 的进程内快照存储（校验 + 结构化克隆隔离） | 跨实例或跨进程恢复 |
| [JsonFileGoalStore](../../packages/storage/src/goal-store.ts) | 实现 `GoalStore` 与 `GoalCatalog`：base64url 文件名、临时文件 + rename 原子替换、目录扫描摘要 | 乐观锁、租约或版本冲突检测 |

## 生命周期与错误

每次 Profile `load` 只访问 `<directory>/<profileId>.json`：文件缺失返回 `undefined`；不安全 ID、读取失败、非法 JSON、Schema 不匹配或文件内 ID 不一致抛出 `AgentProfileConfigurationError`（稳定错误码 `INVALID_AGENT_PROFILE`）。

Goal 快照按 `schemaVersion` 严格解码：v3 校验 workflow/Run 与 pendingAction 不变量，合法 v1/v2 只读迁移为 v3（旧 `lastStep` 仅在迁移结果中包装为 `legacy`），未知版本或损坏快照抛出 `INVALID_GOAL_SNAPSHOT`。`restore` v1/v2 不改写文件；下一次显式保存才以 v3 原子替换。并发写入为最后替换者覆盖，失败保存会清理 `.tmp` 临时文件，文件系统错误原样传播。

`JsonFileGoalStore.listResumable` 只扫描正式 `.json` 普通文件并忽略 `.tmp`；任一正式快照损坏都会报告协议错误而非静默跳过；过滤三个终态后按 `mtime` 倒序、`goalId` 升序返回摘要。

## 当前限制与背景

Snapshot DTO 目前仍以索引类型复用 Runtime Goal 契约，严格 v3 独立 DTO 与 Codec 将在后续迁移中建立；演进设计见 [三视图分层架构 Spec](../../specs/three-view-architecture/design.md)。

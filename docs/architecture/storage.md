# Storage 模块

## 摘要

`@lazygoal/storage` 拥有持久化文件表示：Profile 文件 DTO、严格 Zod Schema、配置错误与 JSON 文件 Store。它依赖 Runtime 的 Port 契约；Runtime 不反向加载本模块。

## 职责速查

| 组件 | 负责 | 不负责 |
| --- | --- | --- |
| [AgentProfileFile](../../packages/storage/src/agent-profile-file.ts) | Profile 文件 DTO（`schemaVersion: 1`）、严格 Schema 与 `AgentProfileConfigurationError` | 读取文件系统、构造 Runtime Profile |
| [JsonFileAgentProfileStore](../../packages/storage/src/json-file-agent-profile-store.ts) | 实现 Runtime `AgentProfileStore` Port，读取单个 `<profileId>.json` 并返回内存 Profile | 扫描其它 Profile、读取 Tool 实例、校验 Tool 注册 |

## 生命周期与错误

每次 `load` 只访问 `<directory>/<profileId>.json`：文件缺失返回 `undefined`；不安全 ID、读取失败、非法 JSON、Schema 不匹配或文件内 ID 不一致抛出 `AgentProfileConfigurationError`（稳定错误码 `INVALID_AGENT_PROFILE`）。文件协议保持 `schemaVersion: 1` 不变。

## 当前限制与背景

Goal Snapshot 的 DTO、Schema 与内存/文件 Store 仍在 `@lazygoal/runtime`，后续迁移到本模块；演进设计见 [三视图分层架构 Spec](../../specs/three-view-architecture/design.md)。

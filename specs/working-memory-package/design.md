# Working Memory 拆包设计

## Overview

新增 `@lazygoal/working-memory`，承载现有记忆数据结构与纯计算核心；Runtime 将其用于 Patch 准入和已提交操作重放，Agent 通过现有 Projector 生成模型视图。设计覆盖 [需求 1–4](./requirements.md)，以迁移定义和调用点为主，不重写记忆算法或扩大协议能力。

## Key Design Decisions

1. **独立核心，Runtime 管理提交与恢复。** 新包只依赖 `contracts` 和现有 `node:crypto`，不依赖 Runtime、Agent、Storage 或 execution-control。其输入是记忆、Patch、限制和来源元数据；`WorkingMemorySession`、Evidence Gate、Trajectory 读取与提交器留在 Runtime。调用方决定证据是否有效、何时接受操作与推进 revision，新包不引入存储端口、Session 管理器或事件总线。
2. **模型契约唯一归属 `@lazygoal/model-contracts`。** 模型 proposal 的 Contract AST、`WorkingMemoryPatch`、`MemoryPatchOperation` 和 Fact/Hypothesis/Blocker proposal 类型权威归属于 `@lazygoal/model-contracts`；`@lazygoal/working-memory` 仅以类型依赖引入模型契约，基础 AST/JSON 则依赖 `@lazygoal/contracts`。严禁在 Working Memory 中重复定义或持有模型 Patch 契约副本。
3. **记忆元数据脱离 Goal 类型，取值不扩张。** `MemoryProtocol`、`MemoryRevision`、记忆条目和 canonical operations 进入新包。来源阶段改由新包的 `MemoryOriginPhase = "executing"` 表达，用于原有字段和算法参数；Runtime 自身的 `GoalPhase` 保留，依靠结构相容传值。版本、字段、来源与作用域取值、ID 规则、抑制及容量算法均按当前实现迁移；不泛化阶段或恢复历史协议。
4. **迁移到唯一公开入口。** 按用户确认，迁出定义和算法统一从新包 `src/index.ts` 导入；删除 Runtime 的旧 Core 文件及其索引和 `domain.ts` 中的迁出定义／转发导出。现有 Runtime、Agent、组合根、benchmark、测试和 smoke 调用方同步迁移。Runtime 的 Session、事件载荷和其他现有模型输出契约导出保留，避免把本次拆包扩大为全仓库 API 清理。
5. **保持三种数据表示与提交顺序。** `MemoryPatchAcceptedPayload` 和 `AcceptedMemoryPatchInput` 留在 Runtime，只引用新包的操作类型。Storage Snapshot DTO/Schema 与 `ModelWorkingMemory` 保持独立表示，Codec/Projector 继续承担转换。准入容量选择记录为 canonical 操作，恢复只重放操作；Snapshot 提交边界和 revision 仍决定可见性。既有序列化格式和协议版本不变，不增加迁移代码。

## 风险与待确认

- 风险等级：medium；与 Requirements 一致。跨包类型、公开导入路径和 Runtime/Agent 集成发生变化，但不改变数据格式与接受规则。
- 关键操作：无。
- 已知风险：残留 Runtime 导入会破坏包独立性；类型字段或阶段取值改写会改变持久化或模型协议；准入与重放混用会使恢复受当前限制影响；提交顺序变化会让未提交记忆可见。
- 待确认：无；迁出符号使用新包唯一入口，旧转发导出移除。

## Architecture

```text
@lazygoal/runtime --------> @lazygoal/working-memory ----> @lazygoal/model-contracts ----> @lazygoal/contracts
@lazygoal/agent ----------> @lazygoal/working-memory
                           \----------------------------> @lazygoal/contracts
```

箭头表示源码导入。Runtime 与 Agent 的其他依赖不在图中；新包没有返回上层的依赖边。依赖检查注册 `working-memory: ["contracts", "model-contracts"]`，仅给实际调用方增加允许边，并通过负向用例禁止新包导入 Runtime 及 Contracts/Model Contracts 导入新包。

## Components and Interfaces

| 位置 | 拆分结果 |
| --- | --- |
| `packages/working-memory/src/types.ts` | 从 Runtime 移入 `MemoryProtocol`、`MemoryRevision`、`MemoryEntryBase`、`EvidenceBackedFact`、`Hypothesis`、`Blocker`、`MemoryEntry` 及其状态／作用域／来源类型、`CanonicalMemoryOperation`、`WorkingMemory` 和现有 `MemoryPatch` 语义别名；从 `@lazygoal/model-contracts` 引入 `WorkingMemoryPatch` 等模型提议类型；定义决策 3 的来源阶段类型。 |
| `packages/working-memory/src/core.ts` | 迁入 `working-memory-core.ts` 的算法、限制、结果类型与错误；从 `domain.ts` 迁入 `createEmptyWorkingMemory` 和 `isMemoryProtocol`。只调整类型导入和契约说明，保留现有校验、错误码、复制／冻结与计算行为。 |
| `packages/working-memory/src/index.ts` | 导出上述记忆协议、数据类型与现有公共算法，不转发 Runtime 的恢复或证据接口。 |
| `packages/runtime/src/working-memory-session.ts` | 保持 Goal/Run 绑定、提交边界和 revision 链检查、证据索引以及关闭语义；改用新包类型与 reducer。 |
| `packages/runtime/src/evidence-gate.ts` | 保持 Observation 资格、当前 Goal/Run 与 committed 边界检查；委托新包进行原有 Patch 结构校验。 |
| `packages/runtime/src/domain.ts` 与提交器 | 领域状态通过导入引用新包的协议和 revision；Runtime 继续拥有 accepted Event 载荷、producer、事件链与 Snapshot 提交。 |
| `packages/agent/src/model-inference-projector.ts` | 输入类型改用新包；保持 `ModelWorkingMemory` 的现有投影、复制和冻结，Prompt 与动态 section 不重构。 |

新包沿用仓库的 private ESM 包形式，跨包调用遵循现有相对 `src/index.ts` 导入约定。迁入的公共接口保留中文契约级 TSDoc 和最小示例，说明结构校验与证据资格判断的区别。算法调用形式、默认限制与计算规则均按现有实现保留；删除已经失效的 PlanItem 说明。实施时同步更新 `AGENTS.md` 布局及相关架构文档，并为新包提供当前职责入口。

## Error Handling

`WorkingMemoryPatchError`、`WorkingMemoryLimitsError` 及稳定错误码属于新包；恢复、Session 关闭和 Evidence Gate 错误继续属于 Runtime。类型迁移不得改变现有异常传播与 Runner 的错误映射。

`applyMemoryPatch` 仍只计算进程内投影，其成功不表示证据已获准或操作已持久化。Runtime 生产路径继续先验证证据，再归一化并提交操作；事件追加或 Snapshot 保存失败时不推进有效记忆。恢复沿现有链读取已提交操作，再调用 reducer；不同的当前准入限制不得重新决定历史淘汰结果。

## Testing Strategy

- [需求 1](./requirements.md#req-1-1)：将 Core 算法测试迁到新包，通过公开入口在无 Goal/Runner/Store 的场景执行；检查 Runtime 旧定义与旧转发已移除。依赖检查分别构造新包导入 Runtime、Contracts/Model Contracts 导入新包的负向用例。
- [需求 2](./requirements.md#req-2-1)：保留事实身份、重复抑制、证据强化／替换、来源优先级、容量淘汰和生命周期测试；对 canonical 输出与重放使用固定预期值，验证非法 Patch 原子拒绝且不修改输入，避免只比较同一新实现的两次运行。
- [需求 3](./requirements.md#req-3-1)：运行 Session、Evidence Gate、Runner 与提交器的集成测试，覆盖所选 revision 链、未提交 tail、身份失配、断链／循环、事件追加失败、Snapshot 保存失败和 marker 失败；检查 Snapshot/Trajectory 编解码及当前协议结果一致。
- [需求 4](./requirements.md#req-4-1)：运行 Model Contracts、Agent Projector 和 Prompt 测试，核对模型 Patch 结构与 Working Memory 投影，保留禁止控制状态进入记忆的用例。
- 在受影响测试完成后运行现有类型检查、依赖检查和 `npm test`，覆盖跨包集成与恢复风险；验证文档反映已实现职责。无需真实模型调用或额外人工验收。

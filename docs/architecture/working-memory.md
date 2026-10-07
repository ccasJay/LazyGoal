# Working Memory 模块

## 职责

`@lazygoal/working-memory` 提供无 I/O 的纯领域包，负责结构化工作记忆（Working Memory）的数据模型、阶段元数据、Patch 算法、容量淘汰策略与状态归约。它只接受调用方传入的内存数据，不直接依赖 Runtime 调度、存储引擎、网络或文件系统，不执行 Tool，也不拥有审批或持久化状态。

## 核心概念与能力

- **数据模型**：定义 `WorkingMemory`（包含事实 `facts`、假设 `hypotheses`、阻塞项 `blockers`）、条目来源阶段 `MemoryOriginPhase`（`"executing"`）、协议标识 `MemoryProtocol` 与 revision 指针 `MemoryRevision`。
- **Patch 校验与归约**：
  - `validateMemoryPatch`：原子校验模型提出的 `WorkingMemoryPatch`，拦截无效格式、非法操作、无变更更新与语义冲突。
  - `reduceWorkingMemory`：根据已有记忆和有效 Patch，按确定性规则计算 canonical 内存变更并应用，生成新的深冻结 `WorkingMemory`。
  - 容量与淘汰：受 `WorkingMemoryLimits` 约束，超出容量时按规则淘汰低优先级条目并生成对应的 eviction 操作。
- **协议与空状态构造**：
  - `isMemoryProtocol`：识别唯一的 `structured@1` 协议。
  - `createEmptyWorkingMemory`：构造初始空工作记忆结构。

## 依赖与边界

- **入站调用**：Runtime（通过 `WorkingMemorySession` 管理会话生命周期与 Evidence 关联）、Agent（通过 `ModelInferenceProjector` 投影只读视图）。
- **出站依赖**：仅允许依赖 `@lazygoal/contracts` 与 `@lazygoal/model-contracts`，严禁反向依赖 Runtime、Agent 或 Storage。

## 相关入口

- [核心契约与类型](../../packages/working-memory/src/types.ts)：记忆条目、作用域、状态与限制契约。
- [基础协议与空状态](../../packages/working-memory/src/protocol.ts)：协议识别与空工作记忆工厂。
- [归约算法与限制](../../packages/working-memory/src/core.ts)：Patch 校验、规范化归约与容量管理。
- [公开导出入口](../../packages/working-memory/src/index.ts)：模块统一门面。

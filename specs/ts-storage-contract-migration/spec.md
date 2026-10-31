---
status: delivered
delivered_at: 2026-10-31
created_at: 2026-10-31
supersedes: []
superseded_by: null
---

# Storage 数据契约迁移 Spec

## 目标与范围

将 Storage 所有持久化 DTO、Snapshot、Schema 和 Codec 的字段定义逐族收敛为 TS 类型，并让实际持久化边界消费生成绑定。

## 需求与验收标准

- <a id="spec-req-1-1"></a>**1.1 全量覆盖**：依据 Catalog、实际文件读写和恢复路径核对 AgentProfile、Goal Snapshot、Trajectory、账本、索引与其他 Storage 拥有的 DTO；逐项提供 TS 单源与生成制品，删除迁移后的重复 Schema/AST 字段表。
- <a id="spec-req-1-2"></a>**1.2 校验归属**：AgentProfile 未知字段严格拒绝并遵循[已批准 Spec](../ts-agent-profile-file-contract/spec.md)；其他文件按现有边界处理，业务跨字段不变量、身份绑定、版本校验和错误映射留在对应所有者，不被结构 Schema 取代。
- <a id="spec-req-1-3"></a>**1.3 持久化恢复**：真实写入、读取和恢复使用生成绑定，合法当前数据往返一致；损坏、错误版本、身份不匹配及跨字段不变量违反时保持对应失败或重建语义，不得静默修复或使用旧 Schema 回退。
- <a id="spec-req-1-4"></a>**1.4 验收**：覆盖各文件族真实读写、Snapshot 编解码、审批/恢复、原子写入及错误路径，Catalog 检查与完整回归通过；记录每类声明及消费者的迁移证据。

## 架构与核心决策

Storage 拥有文件表示、Codec 和文件级不变量；Runtime 拥有状态与执行语义。`AgentProfileFile` 的已有小 Spec 和计划继续独立执行，本 Spec 不覆盖其批准内容；Snapshot 与其他文件族可分别并行准备。共享能力归[生成能力](../ts-contract-generation-capabilities/spec.md)，临时替身不能替代真实文件集成。

## 风险与否定性保证

风险等级：高。错误接收、恢复或丢失字段可能改变任务状态；按开发期兼容策略只支持当前版本，不新增历史数据兼容层，不因实现重构无条件升级版本。

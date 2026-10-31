# Storage 数据契约迁移执行计划

本计划为待审阅草案；[Spec](./spec.md)引用 AgentProfile 已批准小 Spec，Snapshot 与其他文件族独立准备。

## 任务清单

- [x] //TODO 1. 核对文件契约与 AgentProfile 已批准范围
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)。
  - 实施目标与场景：以 Catalog 与实际读写恢复调用链逐项登记文件族、版本、边界策略和不变量，纳入 AgentProfile 小 Spec 的真实验收证据。
  - 基本验证：抽查 Profile、Snapshot、账本和索引的实际读取者及错误语义。
- [x] //TODO 2. 将 Snapshot 与其他文件族切换到 TS 生成绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：按文件族迁移字段单源、生成绑定和 Codec/Store；保留独立跨字段、身份、版本及损坏文件处理；删除重复 Schema，无旧读取回退。
  - 基本验证：定向验证 Snapshot 往返、身份不匹配及错误版本，另验证一个账本或索引文件。
- [x] //TODO 3. 核验各文件族真实持久化与恢复
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：逐项核对文件族真实调用、生成与清理；检查审批等待、重启恢复、原子写入及损坏/重建行为。
  - 基本验证：运行 Storage 定向恢复与 Codec 测试并检查清单无遗漏。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 覆盖与所有权 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2) | 文件族、Schema 与实际消费者逐项对照；Profile 严格拒绝，其他边界及领域不变量不变。 | Catalog/读写调用链与小 Spec 验收记录，旧字段表扫描。 |
| 恢复与失败 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 合法数据往返；损坏、版本、身份、跨字段错误按原边界失败或重建；审批状态及原子写入保持。 | 真实文件、Snapshot Codec、Runtime 恢复与写入故障测试。 |
| 整体回归 | [1.4](./spec.md#spec-req-1-4) | 全部迁移族与已批准 AgentProfile 场景通过。 | `npm test`、生成/文档/依赖检查、`git diff --check`。 |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。

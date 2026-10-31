# 其他数据边界契约迁移执行计划

本计划为待审阅草案，以[Spec](./spec.md)划分的剩余边界为范围，不重复拥有其他领域的迁移。

## 任务清单

- [ ] //TODO 1. 核实剩余 AST 消费者与领域归属
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：对照 Catalog、生产导入、装配和跨进程入口，为每个剩余消费者记录信任边界与负责 Spec，区别 AST 与通用 JSON 工具。
  - 基本验证：抽查 Runtime、Worker 和外部适配边界的源码到消费链。
- [ ] //TODO 2. 迁移本线所属真实边界
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：使用 TS 类型和生成绑定替换各边界 AST；跨进程和外部输入验证，保留原有身份、错误、取消与恢复语义；对已分配其他 Spec 的引用只记录依赖。
  - 基本验证：运行真实 Worker 或进程的合法、非法和身份不匹配场景，并扫描本线遗留 AST。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 边界归属与覆盖 | [1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4) | 所有剩余引用有本线完成或其他 Spec 归属证据；通用 JSON 原语单独列示。 | Catalog 与源码、注册/装配清单核对及 AST 引用扫描。 |
| 实际进程与恢复 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 跨进程、Worker、外部与 Runtime 实际链路合法及错误场景符合原边界，不添加同进程多余校验。 | 真实进程与 Worker 集成、失败/取消/恢复测试。 |
| 集成回归 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 实际生成制品与各边界集成通过，本线无旧 AST 生产消费。 | `npm test`、生成/文档/依赖检查、`git diff --check`。 |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。

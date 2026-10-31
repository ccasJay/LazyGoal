# 删除旧 Contract AST 执行计划

本计划为待审阅草案；必须先取得前六方向的真实交付和联合验收证据，再开始删除；以[Spec](./spec.md)为准。

## 任务清单

- [x] //TODO 1. 核对所有消费者迁移完成并保护非 AST 原语
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.3](./spec.md#spec-req-1-3)。
  - 实施目标与场景：核查各方向验收提交、Catalog、生产、测试、脚本与评测入口；发现必要旧消费者时停止删除。确认 canonical JSON、对象守卫和冻结等实际调用者并保留或迁移。
  - 基本验证：全仓 AST 符号/导入扫描，运行受保留原语影响的定向测试。
- [ ] //TODO 2. 删除 AST 专属实现并核对真实链路
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)。
  - 实施目标与场景：移除旧 DSL、节点、推导、Parser、编译及专属测试文档；更新必要依赖、Catalog 和原语引用，不保留兼容包装或回退。
  - 基本验证：运行类型、生成检查及模型、工具、Web、Snapshot 和 Worker 代表链路测试。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 删除前置条件 | [1.1](./spec.md#spec-req-1-1) | 前六方向完成真实集成且证据有效；全仓现存引用均已迁移或是保留原语。 | 固定各交付提交与验收记录，对照 Catalog、源码、测试、脚本、评测及装配扫描。 |
| 删除与原语 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 旧 AST 专属实现退出，无隐藏回退；canonical JSON、对象守卫、深冻结等消费者及行为保留。 | 删除清单、引用扫描、原语原有行为测试和依赖检查。 |
| 全链路 | [1.4](./spec.md#spec-req-1-4) | 模型、工具、Web、Snapshot 恢复和跨进程真实路径及完整回归通过。 | 对应集成/恢复测试、`npm test`、`npm run contracts:generate -- --check`、文档/依赖检查及 `git diff --check`。 |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。

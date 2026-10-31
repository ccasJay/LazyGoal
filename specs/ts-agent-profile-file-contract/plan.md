# AgentProfile 文件契约迁移执行计划

范围与风险以已批准的 [Spec](./spec.md) 为准；基于已合入的 `@lazygoal/contract-binding`，与其他迁移线独立开发并在集成时协调 Catalog 和生成器变更。

## 任务清单

- [ ] //TODO 1. 从 TS 类型生成严格的 AgentProfile 文件绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：登记文件契约并生成 Schema、Reader、Manifest 和绑定；字段、版本及非空字符串约束以 TS 为权威来源。针对数组元素非空，只扩展所需生成能力：空数组允许，含空字符串的数组失败；无效或不生效的约束使生成失败。
  - 基本验证：运行生成检查和绑定定向测试，验证空数组、空元素、额外字段及版本错误；确认约束源变化使生成结果和接受规则相应变化。

- [ ] //TODO 2. 让真实 AgentProfile 文件读取使用生成绑定
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：`JsonFileAgentProfileStore.load` 以 `reject` 读取生成绑定，映射安全且可定位的问题，保留文件路径、ID 校验、错误码和 Runtime Profile 映射；清除无其他生产消费者的旧 Schema 及导出，不保留双读。同步 Catalog 旧声明处置和所属模块文档。
  - 基本验证：运行 `npx tsx --test packages/storage/test/agent-profile-store.test.ts`，核对合法文件、额外字段和文件 ID 不匹配的实际结果。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| TS 单源与生成 | [1.1](./spec.md#spec-req-1-1)、[1.5](./spec.md#spec-req-1-5) | 版本、字段及标量和数组元素的非空约束由 TS 生成；修改临时源导致制品及行为变化，错误或失效注解、缺失制品和漂移使检查失败；生产代码无第二份字段表。 | Catalog/生成器定向测试、`npm run contracts:generate -- --check`、旧 Schema 消费者扫描；对照 Manifest 与来源。 |
| 严格读取及文件行为 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 空数组合法；空元素、空字段、缺字段、错类型、错误版本、额外字段失败。成功结果独立且输入不变；文件不存在、非法 JSON、不安全路径和 ID 不匹配保持约定结果。错误保留稳定码、ID、路径与安全字段问题，不包含字段值或正文。 | 生成绑定测试与真实临时文件测试；`npx tsx --test packages/storage/test/agent-profile-store.test.ts`，核对生产加载入口和错误内容。 |
| 集成与回归 | [1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5) | 真实读取后 Runtime Profile 映射及既有 Goal Snapshot 测试保持通过；生成制品干净检出可用，最终差异不包含其他文件协议或旧 Schema 回退。 | 干净检出按 CI 安装依赖后不预生成执行目标测试及生成检查；`npm test`、`npm run check:docs`、`npm run check:dependencies`、`git diff --check`。 |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。

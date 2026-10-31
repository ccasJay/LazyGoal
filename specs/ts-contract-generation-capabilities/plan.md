# TS 契约生成能力执行计划

本计划为待审阅草案，以[Spec](./spec.md)为范围；不切换生产消费者。

## 任务清单

- [ ] //TODO 1. 核对实际契约需要并生成对应结构
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：依据实际工具、模型、Web 与 Storage 契约记录所需结构及约束；从临时 TS 样例生成联合、递归、开放 JSON 和数组元素等受支持制品；无法支持的结构明确失败。
  - 基本验证：运行生成定向测试，对约束变化、错误注解和不支持类型验证生成结果或失败。
- [ ] //TODO 2. 让绑定安全读取联合及开放数据
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：按未改动输入确定联合分支，在 `strip` 与 `reject` 下处理未知字段；歧义、非法已知字段和非 JSON 失败，成功数据隔离，诊断有界且安全。
  - 基本验证：运行绑定定向测试，覆盖交叉分支字段、歧义及嵌套值。
- [ ] //TODO 3. 成对生成模型投影并验证本地约束
  - 落实标准：[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：投影可选、`null` 和联合，明确 Provider 无法表达而由解码强制验证的约束；不可安全转换时失败，绝不回退 AST。
  - 基本验证：运行模型投影定向测试，核对 wire/canonical 转换和本地约束拒绝。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期 | 证据/入口 |
| --- | --- | --- | --- |
| 生成覆盖及漂移 | [1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5) | 四领域样例覆盖所需结构、约束变化、错误注解、缺失制品及只读漂移检查。 | 生成测试、`npm run contracts:generate -- --check`，对照能力清单。 |
| 读取与投影 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5) | 联合歧义、未知字段、隔离复制、可选/null 和 Provider 较宽表达下本地拒绝均符合约定。 | 绑定和模型投影定向测试。 |
| 回归与范围 | [1.5](./spec.md#spec-req-1-5) | 现有生产生成与消费行为保持，完整回归通过。 | `npm test`、`npm run check:dependencies`、`npm run check:docs`、`git diff --check`。 |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。

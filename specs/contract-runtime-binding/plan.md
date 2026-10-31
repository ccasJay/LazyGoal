# 数据契约运行时绑定执行计划

范围和风险以已批准的 [Spec](./spec.md) 为准。本步只交付共享能力及隔离样例，不切换生产消费者；后续四条迁移线和统一切换不包含在本计划内。

## 任务清单

- [ ] //TODO 1. 建立类型化绑定并验证两种边界读取策略
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：在业务无关的基础模块定义绑定、读取结果、问题与策略；支持类型化数据、Schema、身份和版本。隔离样例中的嵌套未知字段，在工具、模型和 Web 策略下被剥离并产生安全诊断，在严格配置策略下被拒绝；已知字段错误均拒绝，输入不变且成功结果独立。
  - 基本验证：运行定向类型检查与读取测试，覆盖嵌套未知字段、错误类型和复制隔离；核对依赖方向，不接入生产边界。

- [ ] //TODO 2. 让 Catalog 从 TS 生成或装配隔离样例绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：通过临时 Catalog 和 TS 样例生成或装配 Schema、Reader 与绑定，字段及支持的约束只来源于 TS/JSDoc；从生成绑定读取合法、缺字段、枚举错误及数值越界样本。不支持的类型或约束、错误注解和缺少制品明确失败；保留现有生产生成链和消费方式。
  - 基本验证：运行隔离生成测试、类型检查和 `npm run contracts:generate -- --check`；验证样例约束修改导致读取结果或生成检查变化。

- [ ] //TODO 3. 提供模型 wire 投影与 canonical 解码的成对能力
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：以 TS 样例从同源绑定获得模型可用的 wire Schema 与解码器；覆盖必需字段、可选字段及嵌套数据，将约定的 wire 占位值解码为正确 canonical 结果。验证可移植限制与本地约束；无法无损表达、无法解码或不支持的结构明确失败，不回退 AST。
  - 基本验证：运行模型投影定向测试，对照 wire Schema 和解码结果；检查基础模块不依赖模型业务模块或旧 AST。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 绑定与边界读取 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.6](./spec.md#spec-req-1-6) | 四类隔离样例覆盖嵌套未知字段、必填/类型/枚举/数值错误、非 JSON、复制隔离和输入不变；宽容模式安全诊断、严格模式拒绝，失败不返回部分数据，不泄漏值。 | 定向读取及类型测试；核对诊断的路径、截断和内容。 |
| 生成与失败 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6) | 临时 TS/Catalog 样例的身份、版本、Schema 与 Reader 一致；变更声明或约束使产物/行为变化，错误注解、不支持结构和缺少制品明确失败；生产生成制品检查仍通过。 | 隔离生成测试、`npm run contracts:generate -- --check`；检查无重复字段表及运行时 TS 编译。 |
| 模型投影 | [1.2](./spec.md#spec-req-1-2)、[1.4](./spec.md#spec-req-1-4)、[1.6](./spec.md#spec-req-1-6) | 对可选和嵌套字段验证 wire Schema 可移植、占位值解码与 canonical 约束；非法值、不支持结构或不能保留语义的投影失败。绑定不绕过现有阶段和授权机制。 | 投影/解码定向测试及与现有模型 Schema 限制的对照；样例结果不宣称生产集成完成。 |
| 依赖、范围和回归 | [1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6) | 新模块不依赖 Web、Runtime、Storage、工具实现或旧 AST；生产消费者、协议及执行语义未切换，现有 Catalog/模型/Web 回归通过。 | `npm test`、`npm run check:dependencies`、`npm run check:docs`、`git diff --check`；审查最终 diff 和生成制品。 |

### Latest Result

- 状态：未执行
- 验证时间：-
- 验证摘要：尚未开始执行。

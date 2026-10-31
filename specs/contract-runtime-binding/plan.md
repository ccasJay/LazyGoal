# 数据契约运行时绑定执行计划

范围和风险以已批准的 [Spec](./spec.md) 为准。本步只交付共享能力及隔离样例，不切换生产消费者；后续四条迁移线和统一切换不包含在本计划内。

## 任务清单

- [x] //TODO 1. 建立类型化绑定并验证两种边界读取策略
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：在业务无关的基础模块定义绑定、读取结果、问题与策略；支持类型化数据、Schema、身份和版本。隔离样例中的嵌套未知字段，在工具、模型和 Web 策略下被剥离并产生安全诊断，在严格配置策略下被拒绝；已知字段错误均拒绝，输入不变且成功结果独立。
  - 基本验证：运行定向类型检查与读取测试，覆盖嵌套未知字段、错误类型和复制隔离；核对依赖方向，不接入生产边界。

- [x] //TODO 2. 让 Catalog 从 TS 生成或装配隔离样例绑定
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：通过临时 Catalog 和 TS 样例生成或装配 Schema、Reader 与绑定，字段及支持的约束只来源于 TS/JSDoc；从生成绑定读取合法、缺字段、枚举错误及数值越界样本。不支持的类型或约束、错误注解和缺少制品明确失败；保留现有生产生成链和消费方式。
  - 基本验证：运行隔离生成测试、类型检查和 `npm run contracts:generate -- --check`；验证样例约束修改导致读取结果或生成检查变化。

- [x] //TODO 3. 提供模型 wire 投影与 canonical 解码的成对能力
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

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31 09:54:59 +0800
- 测试提交：`7fc9dba0da71c689dfe2ed4ec0e6e5ae3371d06e`
- 工作树：`.worktrees/contract-runtime-binding`；验证时工作树干净。随后只更新本报告，不改变被测代码。
- 契约修订：本步未启用新的生产 Catalog 项；`contracts/catalog.json` SHA-256 `1a059535a9e190f0e2eb1754565c542c7a77ace5f377568e9aded99a3a96a779`，生产 Provider 模型 Reader SHA-256 `f0cdd91ac7343725d565d365728353777998571b028162e79f7377256dbcfbb6` 未变化。
- 验证摘要：

| 验收项 | 结果 | 实际检查与证据 |
| --- | --- | --- |
| 绑定与边界读取 | passed | `packages/contract-binding/test/binding.test.ts` 6 项通过：strip/reject 策略、嵌套未知字段、必填/类型/枚举/数值/长度错误、非 JSON、输入不变、成功结果隔离、诊断上限与原型键安全。严格策略不返回部分数据，诊断不含字段值。 |
| 生成与失败 | passed | `packages/contract-binding/test/generation.test.ts` 5 项通过：临时 Catalog 从 TS/JSDoc 生成 tool、model、web、strict-config 四类隔离绑定（20 个制品），验证身份/版本/Manifest/约束来源、重复生成确定、漂移与缺失检测、错误注解、不支持结构和无第二份字段表。`npm run contracts:generate -- --check` 对生产制品返回 current。 |
| 模型投影 | passed | `packages/contract-binding/test/model-projection.test.ts` 4 项及生成绑定的端到端投影通过：wire Schema 为 draft-07、封闭对象、内联 `$ref`、required-nullable 可选字段；数值边界保留；字符串 pattern/长度、联合、元组、开放对象与递归引用明确失败；可选 `null` 解码为 canonical 省略，缺失 wire 必填字段、非法值、未知字段与安全诊断符合预期。 |
| 依赖、范围和回归 | passed | 绑定包无出站依赖；未切换生产消费者。`npm test` 全部通过（TS 测试 2693 项、scripts 98 项）；`npm run check:dependencies`（320 个源文件）、`npm run check:docs`（47 个模块、169 份说明）、`git diff --check` 通过；`npm run build:web` 与真实 Chrome Provider 模型端到端测试通过。在提交 `7fc9dba0` 的干净检出按 CI 安装依赖后，目标测试、Web 构建、浏览器测试及全量 `npm test` 均通过。 |

- 未解决项：无。本步未接入生产工具、模型、Web 或 Storage 消费者；后续迁移线仍按 Spec 的独立验证与统一切换约束执行。

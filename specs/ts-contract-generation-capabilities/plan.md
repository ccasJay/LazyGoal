# TS 契约生成能力执行计划

本计划为待审阅草案，以[Spec](./spec.md)为范围；不切换生产消费者。

## 任务清单

- [x] //TODO 1. 核对实际契约需要并生成对应结构
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：依据实际工具、模型、Web 与 Storage 契约记录所需结构及约束；从临时 TS 样例生成联合、递归、开放 JSON 和数组元素等受支持制品；无法支持的结构明确失败。
  - 基本验证：运行生成定向测试，对约束变化、错误注解和不支持类型验证生成结果或失败。
- [x] //TODO 2. 让绑定安全读取联合及开放数据
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)。
  - 实施目标与场景：按未改动输入确定联合分支，在 `strip` 与 `reject` 下处理未知字段；歧义、非法已知字段和非 JSON 失败，成功数据隔离，诊断有界且安全。
  - 基本验证：运行绑定定向测试，覆盖交叉分支字段、歧义及嵌套值。
- [x] //TODO 3. 成对生成模型投影并验证本地约束
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

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31T04:06:16Z–2026-10-31T04:12:35Z（UTC）
- 验证提交：`54d0db4eae661793e6acf23a1b58257e2bd46488`（`@asType integer` 补充，含前序 `d230d84b` 基础能力验证）；实现提交为 TODO 1 `50e96681`、TODO 2 `c4181221`、TODO 3 `4ab1aa43`、验证中修复的登记 Reader 策略回归 `400be697`、生成绑定端到端测试 `d230d84b` 与整数注解支持 `54d0db4e`。工作区仅有未跟踪的 `.tmp-schema-probe/` 探针，未纳入提交。
- 生成覆盖及漂移（[1.1](./spec.md#spec-req-1-1)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)）：`npx tsx --test packages/contract-binding/test/structures.test.ts packages/contract-binding/test/generation.test.ts scripts/provider-models-contract-generation.test.mjs` 13/13 通过；`npm run contracts:generate -- --check` 输出 `Contract artifacts are current.`。覆盖联合与判别联合、递归 `$ref`、开放 JSON、数组元素、数值/字符串约束、约束漂移、错误注解、缺失 `declaredTypes`、元组与登记 Reader 不支持结构，并通过生成的绑定端到端读取联合、递归与开放 JSON。能力清单见 [contracts/README.md](../../contracts/README.md)。
- 读取与投影（[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.5](./spec.md#spec-req-1-5)）：`npx tsx --test packages/contract-binding/test/binding.test.ts` 12/12 通过，覆盖跨分支字段、歧义、非法已知字段、嵌套数组/递归、开放 JSON 与 `strip`/`reject` 诊断；`npx tsx --test packages/contract-binding/test/model-projection.test.ts` 7/7 通过，覆盖可选/null/判别联合、`localConstraints` 标识与解码拒绝、可选 nullable 歧义及不可移植结构失败。行为说明见 [contract-binding overview](../../packages/contract-binding/notes/overview.md)。
- 回归与范围（[1.5](./spec.md#spec-req-1-5)）：`npm test` 通过（发现 446 个 `.ts/.tsx` 与 7 个 `.mjs` 测试文件；TS 测试 2706/2706、scripts 98/98 通过），该入口同时覆盖 `contracts:generate --check`、`tsc --noEmit`、文档检查、依赖检查与 GEPA adapter；单独执行 `npm run check:dependencies` 通过（320 个源文件），`npm run check:docs` 通过（47 个模块、169 份当前说明），`git diff --check` 无输出。
- 早前全量回归曾出现与本方向无关的 Seatbelt 与 GEPA 时序抖动（Seatbelt stderr 为空、GEPA `elapsed < 2.0` 超时）；对应检查隔离重跑通过，最终干净全量回归全部通过，证据采用本轮结果。
- 已知边界（非未解决缺陷）：`typescript-json-schema` 登记 Reader 策略仍只支持封闭对象和标量类型数组，联合与开放 JSON 明确失败并要求使用 `typescript-binding` 生成的绑定；模型投影对递归、开放 JSON、元组等不可安全转换结构明确失败，字符串 `pattern`/`minLength`/`maxLength` 由 `localConstraints` 标识并在解码时强制验证。本方向未修改 Catalog 启用项或生产消费者，现有 `web.providers.models.success` 生成制品与基线一致。
- 补充验证（`@asType integer`，提交 `54d0db4e`，2026-10-31T04:18:04Z–04:23:41Z）：`npx tsx --test packages/contract-binding/test/structures.test.ts packages/contract-binding/test/generation.test.ts scripts/provider-models-contract-generation.test.mjs` 15/15、`npx tsx --test packages/contract-binding/test/binding.test.ts` 12/12、`npx tsx --test packages/contract-binding/test/model-projection.test.ts` 7/7 通过；`tsc --noEmit` 通过；`npm run contracts:generate -- --check` 输出 `Contract artifacts are current.`；`npm test` 通过（2708 个 TS 测试与 98 个 scripts 测试全部通过）；`npm run check:dependencies` 通过（320 个源文件）；`npm run check:docs` 通过（47 个模块、169 份当前说明）；`git diff --check` 无输出。覆盖合法整数生成与绑定读取、必填/可选整数、`minimum`/`maximum`、非整数与越界拒绝、非法 `@asType` 值、重复注解、非数值字段与 nullable 数值组合失败、整数注解漂移。未修改工具线 Catalog，12 个工具输入仍未启用生成。
- 未解决问题：本方向无阻塞；下游可基于验证提交接入。

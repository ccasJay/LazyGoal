# Provider 连接测试结果改用 TS 类型执行计划

范围和风险见已批准的 [Spec](./spec.md)。基于[第一步](../ts-provider-models-contract/plan.md)已验证提交实施并记录 SHA，复用实际生成链和浏览器读取接缝；不等待第二步。共享入口保留其他契约登记，仅调整本契约。

## 任务清单

- [x] //TODO 1. 让连接测试结果按 TS 判别联合生成、提取并进入真实浏览器 API
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：维护原生结果/错误类型及中文契约 TSDoc，扩展同源 Schema 生成与分支读取，仅按原始 `ok` 选择分支后清理副本。`testProvider` 消费提取数据，沿用诊断和 HTTP 错误处理；删除对应两个 AST、推导、登记和旧 guard，更新原有 guard 测试及模块概览、语义说明。成功/失败结果中的另一分支字段被剥离；非法成功结果即使附带合法错误值也被拒绝。
  - 基本验证：新增 `packages/web-contracts/test/provider-profile-test.test.ts`，扩展现有 `apps/goal-board/test/provider-settings-api.test.ts`；运行 `npx tsx --test packages/web-contracts/test/provider-profile-test.test.ts apps/goal-board/test/provider-settings-api.test.ts`，先证明两分支、混合字段及非法成功结果的读取行为。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期结果 | 检查入口 |
| --- | --- | --- | --- |
| 类型与数值边界 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5) | 五个现有错误值均可读；计数接受 1 和最大安全整数，拒绝 0、负数、小数、超安全范围、字符串和非有限值。缺字段、错误判别值/错误枚举、非 JSON 输入均失败，无部分数据或隐式转换。旧节点、推导和 guard 引用退出。 | 新增读取测试、生成约束测试及生产引用扫描；其他 AST 检查保留。 |
| 分支提取与诊断 | [1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.6](./spec.md#spec-req-1-6) | 两分支附带未知/另一分支字段时，返回所属分支数据，输入不变且结果独立；`ok: true`、非法计数并附带合法 `error` 仍失败。路径有界、不记录值/正文，诊断记录抛错不影响合法结果。临时源交换联合分支次序后行为一致。 | Node 读取/API 测试及下述真实浏览器样本；不对整个联合试探删除字段。 |
| 浏览器与 HTTP 消费 | [1.4](./spec.md#spec-req-1-4)、[1.6](./spec.md#spec-req-1-6) | Chrome 加载真实 `browserApi.testProvider` 和生成模块，从本地假 API 的 2xx 响应验证两分支、混合字段、非法判别值及数值边界；非法值报 `invalid_api_response`。真实服务另以端口替身验证成功与五种失败的 404/502/503 映射；非 2xx 保持 `BrowserApiError`，授权与取消保持原语义。 | 新增 `apps/goal-board/e2e/provider-profile-test-contract.test.mjs`，运行 `node --test --test-concurrency=1 apps/goal-board/e2e/provider-profile-test-contract.test.mjs`；扩展既有浏览器 API 与服务路由测试，不调用外部 Provider。Chrome 缺失记为未完成。 |
| 生成与整体回归 | [1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6) | 临时源修改数值约束或错误枚举使制品及接受规则同步变化；无效注解/漂移使检查失败，重复生成一致且检查不写文件。独立干净检出安装依赖后，不先生成即可运行目标测试和 Web 构建。第一步及其余 Provider 行为保持通过。 | 扩展第一步生成测试；`npm run contracts:generate -- --check`、`npm test`、`npm run build:web`。记录最终提交及干净检出证据，检查 diff 未扩大到其他协议或联合框架。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31T06:18:36Z–06:41:55Z（UTC）
- 验证提交：`a82b8e50`；工作区干净（本记录提交前）。实现提交为 `a2e05705`（Web 契约迁移接入）与 `a82b8e50`（删除旧 guard）；分支已 rebase 到生成能力线 `813c6b87`。
- 类型与数值边界（[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.5](./spec.md#spec-req-1-5)）：`BrowserProviderProfileTestResult` 与五个错误值已迁至 `packages/web-contracts/src/wire.ts`，生成绑定 `web.providers.profile_test_result` 由 Catalog 登记。`npx tsx --test packages/web-contracts/test/provider-profile-test.test.ts apps/goal-board/test/provider-settings-api.test.ts` 12/12 通过：1 与 `Number.MAX_SAFE_INTEGER` 接受；0、负数、小数、超安全范围、字符串、`NaN`、`Infinity` 和 `null` 拒绝；缺字段、错误判别值/枚举、非 JSON 和循环输入失败且无部分数据。旧 AST、推导、登记和旧 guard 已删除。
- 分支提取与诊断（[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.6](./spec.md#spec-req-1-6)）：按未修改的 `ok` 选择成功或失败分支，另一分支及未知字段从独立副本剥离并产生有界路径诊断；`ok: true` 配合非法 `modelCount` 即使附带合法 `error` 仍失败；成功与失败样本的输入均未被修改。生成器不支持 JSDoc `@multipleOf`，整数语义由 `@asType integer` 与 `@minimum 1`、`@maximum 9007199254740991` 等价表达；未改变字段或接受范围。
- 浏览器与 HTTP 消费（[1.4](./spec.md#spec-req-1-4)、[1.6](./spec.md#spec-req-1-6)）：`apps/goal-board/test/provider-settings-api.test.ts` 覆盖 `browserApi.testProvider` 的两分支、混合字段、非法成功值、诊断 sink 失败和取消；Chrome E2E `apps/goal-board/e2e/provider-profile-test-contract.test.mjs` 1/1 通过（06:41:28Z–06:41:55Z），验证真实 2xx 读取、未知字段诊断与 `BrowserApiError`。真实路由测试保持成功与五种失败的 404/502/503 映射；非 2xx `{ error }` 不进入联合读取器，授权和取消语义不变。
- 生成与整体回归（[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)）：`npm run contracts:generate -- --check` 输出 `Contract artifacts are current.`，Manifest 固定 `web.providers.profile_test_result`、版本 1、draft-07 方言和来源摘要。`npm run build:web` 通过（06:39:25Z–06:41:01Z）。`npm test` 单次在 `06:31:23Z–06:32:37Z` 被既有 GEPA `elapsed < 2.0` 时序抖动阻塞；隔离重跑 `npm run test:gepa-adapter` 通过（06:32:49Z–06:33:43Z），等价过滤套件 TS 2731/2731、scripts 98/98 通过（06:33:51Z–06:39:20Z）；依赖、文档与 diff 检查通过。
- 未解决问题：无本方向阻塞。`@multipleOf` 注解未被共享生成器支持，当前以等价整数 Schema 表达；如后续生成能力线增加该注解，应在不改变接受范围的前提下刷新制品。GEPA 单次失败为既有环境时序抖动，已用隔离和等价套件复核。

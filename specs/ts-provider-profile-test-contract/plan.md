# Provider 连接测试结果改用 TS 类型执行计划

范围和风险见已批准的 [Spec](./spec.md)。基于[第一步](../ts-provider-models-contract/plan.md)已验证提交实施并记录 SHA，复用实际生成链和浏览器读取接缝；不等待第二步。共享入口保留其他契约登记，仅调整本契约。

## 任务清单

- [ ] //TODO 1. 让连接测试结果按 TS 判别联合生成、提取并进入真实浏览器 API
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

- 状态：未执行。
- 验证时间：-
- 验证摘要：仅完成计划编写，尚未实施。

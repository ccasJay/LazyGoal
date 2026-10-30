# 在线模型列表响应改用 TS 类型执行计划

范围与风险以已批准的 [Spec](./spec.md) 为准。本计划仅交付这个成功响应及其真实消费者；未迁移契约继续使用原 AST。两份整体架构参考不增加本步任务。

## 任务清单

- [x] //TODO 1. 让在线模型列表通过 TS 生成读取器后进入浏览器 API
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)。
  - 实施目标与场景：将 `BrowserProviderModels` 与条目改为原生 TS，使用 JSDoc 声明 `id` 模式并补齐公共契约 TSDoc；增加本响应专用的生成入口及锁定的开发依赖，通过 `ts-json-schema-generator`、Ajv standalone 和必要的 ESM 打包生成 Schema、校验代码及身份/版本/来源记录，提交到 `web-contracts/src/generated/`。读取器先确认 JSON 数据，在副本上校验并清理额外字段，成功才返回隔离数据；诊断使用键差，不另写字段表。`fetchProviderModels` 消费提取结果，复用既有鉴权、取消与 HTTP 错误处理，有界记录字段路径且不输出字段值。一次切换中删除对应两个 AST、推导和登记项；确认无其他消费者后删除旧 guard，不保留同一响应的双定义或解析回退。
  - 基本验证：新增 `packages/web-contracts/test/provider-models.test.ts` 的代表性读取场景，并扩展现有 `apps/goal-board/test/provider-settings-api.test.ts` 的真实 API 调用测试；运行 `npx tsx --test packages/web-contracts/test/provider-models.test.ts apps/goal-board/test/provider-settings-api.test.ts`。以根/条目附加字段的合法响应观察剥离、诊断及原输入不变，以 `id: 42` 观察读取拒绝与 `invalid_api_response`；空列表、空名称和合法字符串原值保持。

- [ ] //TODO 2. 让生成漂移在常规检查中失败并补齐真实浏览器验收
  - 落实标准：[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[2.3](./spec.md#spec-req-2-3)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)。
  - 实施目标与场景：为本响应增加根命令 `contracts:generate`，写入模式显式更新制品，`--check` 只核对并拒绝漂移；将只检查模式接入现有确定性回归入口。用临时源文件验证重复生成、约束变更和错拼注解，不修改真实源制造测试故障。新增隔离的 `apps/goal-board/e2e/provider-models-contract.test.mjs`，按现有 Vite/Chrome 与本地假 API 方式在浏览器执行真实 `fetchProviderModels`，不替换生成读取器、不调用外部 Provider；观察提取结果、诊断、错误及取消。更新 `web-contracts` 和受影响客户端的短说明及语义链接，只描述本响应已迁移。
  - 基本验证：新增 `scripts/provider-models-contract-generation.test.mjs`，运行 `node --test scripts/provider-models-contract-generation.test.mjs` 和 `npm run contracts:generate -- --check`；临时源只改变 `id` 模式时制品应变化，旧制品检查失败，错拼注解明确失败，两次相同生成一致且检查不写文件。浏览器脚本先做单点成功响应探针，完整场景统一在下节执行。

`contracts:generate` 与三个新增测试文件均是本计划待实现的入口，当前尚不存在。实施时保留工作树中的既有修改；优先新增独立浏览器测试，不借本步重写已有大型 E2E 文件。TODO 完成后只勾选复选框，保留任务原文。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
| --- | --- | --- | --- |
| 单一类型源及旧节点退出 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 原生类型包含约定的必需字段；空列表、空名称和非空白 `id` 合法且不 trim。修改 JSDoc 模式能改变实际接受规则，错拼或不支持注解生成失败；本响应不再有 AST/推导/guard 消费，其他 AST 仍接受原检查。 | 新增读取测试与生成测试；扫描两个旧常量和 `InferContract<typeof browserProviderModelsContract>`，核对生产消费链及生成字段来源；`npx tsx --test packages/web-contracts/test/provider-models.test.ts packages/web-contracts/test/contracts.test.ts packages/web-contracts/test/web-contracts.test.ts`。 |
| 提取与拒绝边界 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2) | 根字段及条目字段被剥离，路径包含条目索引；原始输入不变，结果不共享可变引用。缺字段、`ok: false`、非数组、非法条目、空白/数字 `id`、错误 `name` 和非 JSON 输入均失败，不返回部分数据、不补值或转换。 | `packages/web-contracts/test/provider-models.test.ts` 的正例、反例、引用隔离及原型安全场景，纳入 `npm test`。 |
| 真实 API 返回值与诊断 | [2.3](./spec.md#spec-req-2-3)、[3.2](./spec.md#spec-req-3-2) | 对真实 `fetchProviderModels` 返回的对象检查未知字段已不存在；诊断仅有契约身份和有界路径，诊断函数抛错不阻断合法响应。非法已知字段仍为 `invalid_api_response`，非 2xx 错误保持 `BrowserApiError` 身份/状态，取消传播且不重试。其他 Provider 设置读取与凭据拒绝场景仍通过。 | 扩展现有 `apps/goal-board/test/provider-settings-api.test.ts`，通过假 `fetch` 与诊断捕获核验；纳入 `npm test`。 |
| 生成一致性与干净检出 | [1.2](./spec.md#spec-req-1-2)、[3.1](./spec.md#spec-req-3-1) | 相同源与锁定依赖两次生成的内容/摘要一致；临时源约束变化使旧制品检查失败；`--check` 无写入。生成模块不含运行时编译或 Node 专用依赖；独立干净检出按当前 CI 安装依赖后，不先生成、不提供项目 `dist/lib/build`，即可运行本响应测试和 Web 构建。 | `node --test scripts/provider-models-contract-generation.test.mjs`、`npm run contracts:generate -- --check`；在对应提交的临时检出运行目标读取/API 测试和 `npm run build:web`，记录提交与命令结果。 |
| 实际浏览器消费 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[3.2](./spec.md#spec-req-3-2) | Chrome 加载真实浏览器 API 与生成模块，向本地假 API 请求；成功响应含额外字段时得到净化结果及安全诊断，错误 `id` 被拒绝，HTTP 失败和取消保持既有语义。不能用 Node 中伪造 `window` 代替本项。 | `npm run build:web`；`node --test --test-concurrency=1 apps/goal-board/e2e/provider-models-contract.test.mjs`。沿用现有 Chrome 查找约定；环境缺失记为未完成，不跳过为成功。 |
| 整体回归及范围 | [1.3](./spec.md#spec-req-1-3)、[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2) | 所有任务结束后全量确定性回归通过，已包含生成一致性检查；浏览器构建、上述消费链和包内说明通过。最终 diff 只改变该响应、必要的生成/请求接缝及验证文档，没有迁移其他 DTO、凭据处理或 Runtime。 | `npm test`、`npm run build:web`、最终 diff 与依赖图检查；根回归已包含类型、文档、依赖和现有确定性测试，不为同一结果重复运行全部入口。 |

### Latest Result

- 状态：未执行。
- 验证时间：-
- 验证摘要：仅完成计划编写，尚未实施或运行本计划的功能验证。

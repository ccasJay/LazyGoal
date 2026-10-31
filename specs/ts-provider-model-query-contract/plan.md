# 在线模型查询输入改用 TS 类型执行计划

范围和风险见已批准的 [Spec](./spec.md)。实施基线使用[第一步](../ts-provider-models-contract/plan.md)已验证的提交并记录 SHA，无需先合入 `dev`。可提前准备输入类型和路由场景；生成接入与最终集成必须使用其实际产物，不复制工具链。

## 任务清单

- [x] //TODO 1. 让模型查询路由只消费 TS 生成读取器提取的输入
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[1.6](./spec.md#spec-req-1-6)。
  - 实施目标与场景：维护原生类型及中文 TSDoc，扩展第一步生成入口以支持可选属性并登记本输入；提交独立制品，将 HTTP 路由改为消费提取结果，保留 wire 检查和错误映射，删除该输入的旧 AST、推导和登记。沿用诊断约定安全记录；同步所属模块概览与语义说明。合法输入附带未知字段时，端口仅收到已知字段；非法已知字段不得进入端口。
  - 基本验证：新增 `packages/web-contracts/test/provider-model-query.test.ts` 和 `packages/browser/test/browser-provider-model-query.test.ts`；运行 `npx tsx --test packages/web-contracts/test/provider-model-query.test.ts packages/browser/test/browser-provider-model-query.test.ts`。先验证省略可选字段、剥离未知字段和错误类型返回 400 的代表场景。

## Feature Verification

### Planned Checks

| 验收项 | 对应需求 | 场景与预期结果 | 检查入口 |
| --- | --- | --- | --- |
| 读取行为 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3) | 可选字段省略仍省略，合法字符串不 trim；缺必需字段、空白、`null`、显式 `undefined`、错误类型或非 JSON 值失败且无部分数据。附加字段被剥离，输入不变且结果独立。 | 新增读取测试；扫描确认旧节点、推导和消费引用退出。 |
| 真实 HTTP 边界 | [1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.6](./spec.md#spec-req-1-6) | 真实服务把提取结果传给 `fetchModels`；缺少授权、非法字段、UTF-16 超限或非法 ID 不触达端口。覆盖限制临界值及非 BMP 字符；JSON、Content-Type、16 KiB 限制、错误映射和取消保持原语义。诊断有界且不含测试密钥/正文，记录抛错不影响合法请求。 | 新增路由测试，以端口调用计数、参数、状态码及诊断捕获核验；不调用外部 Provider。 |
| 生成与检出 | [1.1](./spec.md#spec-req-1-1)、[1.5](./spec.md#spec-req-1-5) | 临时源改变可选性或约束时制品及接受规则同步变化；错拼/不支持注解和旧制品检查失败，重复生成一致。独立干净检出安装依赖后，不先生成、不提供项目构建产物即可运行本步测试与 Web 构建。 | 扩展第一步生成测试及 `npm run contracts:generate -- --check`；在最终提交的临时检出验证，记录 SHA 与结果。 |
| 两步集成与回归 | [1.4](./spec.md#spec-req-1-4)、[1.6](./spec.md#spec-req-1-6) | 扩展浏览器 API 测试核对可选参数序列化和授权；第一步响应提取、既有 Provider 行为仍通过。两份契约共用生成链，其他 DTO、凭据复用/保存及查询逻辑未改变。 | `npm test`、`npm run build:web`，并复跑第一步的真实浏览器消费验收；检查最终 diff。 |

### Latest Result

- 状态：passed
- 新鲜度：current
- 验证时间：2026-10-31T06:18:36Z–06:41:55Z（UTC）
- 验证提交：`a82b8e50`；工作区干净（本记录提交前）。实现提交为 `a2e05705`（Web 契约迁移接入）与 `a82b8e50`（删除 Provider 测试结果旧 guard）；分支已 rebase 到生成能力线 `813c6b87`。
- 读取行为（[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)）：`BrowserProviderModelQuery` 已迁至 `packages/web-contracts/src/wire.ts`，生成绑定 `web.providers.model_query` 由 Catalog 登记。`npx tsx --test packages/web-contracts/test/provider-model-query.test.ts packages/browser/test/browser-provider-model-query.test.ts` 7/7 通过：可选字段省略保持省略；合法字符串不 trim；缺少 `kind`、空白、`null`、错误类型、非 JSON/循环值和附加字段诊断均符合约定；输入不被修改、结果独立。
- 真实 HTTP 边界（[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.6](./spec.md#spec-req-1-6)）：`packages/browser/test/browser-provider-model-query.test.ts` 4/4 通过，真实路由只把提取结果交给 `fetchModels`；未知字段路径诊断不含密钥/正文；缺少授权、非 JSON、16 KiB、UTF-16/ID 限制和非法已知字段在端口前返回 400/401/413/415；`provider_profile_invalid`、目录鉴权/权限/协议/不可用映射保持 400/502/503，取消信号继续传入端口。
- 生成与检出（[1.1](./spec.md#spec-req-1-1)、[1.5](./spec.md#spec-req-1-5)）：`npm run contracts:generate -- --check` 输出 `Contract artifacts are current.`；生成的 Manifest 固定 `web.providers.model_query`、版本 1、draft-07 方言和来源摘要。旧输入 AST、`InferContract` 引用与旧登记已退出生产路径，Catalog 保留删除审计项。
- 集成与回归（[1.4](./spec.md#spec-req-1-4)、[1.6](./spec.md#spec-req-1-6)）：`npm run build:web` 通过（06:39:25Z–06:41:01Z）；Provider 模型响应 Chrome E2E 1/1 通过（06:41:28Z–06:41:55Z）。`npm test` 单次在 `06:31:23Z–06:32:37Z` 被既有 GEPA `elapsed < 2.0` 时序抖动阻塞；隔离重跑 `npm run test:gepa-adapter` 通过（06:32:49Z–06:33:43Z），等价过滤套件 TS 2731/2731、scripts 98/98 通过（06:33:51Z–06:39:20Z）。`npm run check:dependencies`（418 源文件）、`npm run check:docs`（47 模块/169 说明）和 `git diff --check` 通过。
- 未解决问题：无本方向阻塞。`npm test` 的 GEPA 单次失败是既有环境时序抖动，已用隔离和等价套件复核；最终合并后需按新基线刷新证据。

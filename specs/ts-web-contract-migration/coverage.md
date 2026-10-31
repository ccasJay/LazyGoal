# Web 契约族覆盖清单

本清单依据 `contracts/catalog.json` 的 286 项 Web 登记、`packages/web-contracts` 的导出、`packages/browser` 与 `apps/goal-server` 的挂载路由，以及 `apps/goal-board` 的实际读取入口建立。基线为共同基线 `e39263770f92a729bf4fa83ab8917a0b23fcbcb`；本方向以生成能力线已验证提交 `c1a6b1b5` 为堆叠上游，因为迁移需要该提交提供的 `typescript-binding`、联合/递归/开放 JSON 与 `@asType integer` 能力。

## 所有权与边界

Web 线拥有 HTTP、SSE 与浏览器 DTO 的类型、路由和浏览器消费者。生成器、`contract-binding` 和通用投影归生成能力线；模型/工具绑定不在本线范围。`web-contracts` 继续拥有 wire 类型与跨字段不变量，`browser` 拥有路由、鉴权和投影，`goal-server` 只做 Composition Root 装配，`goal-board` 拥有浏览器读取与展示消费。

## 契约族

| 契约族 | 当前声明 | 生产者 | 真实消费者 | 迁移目标 |
| --- | --- | --- | --- | --- |
| 会话与看板 | `contracts/session.ts`、`src/session.ts` | `browser-projection.ts`、`browser-session-port.ts` | `GET /api/goals`、`GET /api/goals/:goalId`、`goal-board/api.ts`、`hooks/useGoals.ts`、`hooks/useGoalSession.ts` | 列表、列表项、完整会话、窄状态及响应信封改为原生 TS 与生成绑定 |
| 统一输入与会话状态 | `contracts/input.ts`、`src/session-input.ts` | `browser-session-port.ts` | `POST /api/goals`、`POST /api/goals/:goalId/inputs`、`GET .../inputs/:inputId`、`goal-board/api.ts`、`useRunCommands.ts` | 创建命令/结果、输入命令联合、收据与查询结果、安全会话状态改为原生 TS 与生成绑定 |
| Activity | `contracts/activity.ts`、`src/activity.ts` | `browser-projection.ts` | `GET /api/goals/:goalId/activity`、`activity-projector.ts`、`useGoalSession.ts` | Activity 项联合、位置、gap、页、查询与读取结果改为原生 TS；页与位置关系由不变量保留 |
| 命令与授权 | `contracts/command.ts`、`src/command.ts` | `browser-goal-command-service.ts`、`browser-workspace.ts` | Plan Mode、模型选择/偏好、grants、权限模式、归档/删除、工作区路由、`goal-board/api.ts`、对应 hooks | 入站命令、受理结果、授权摘要和权限结果改为原生 TS 与生成绑定 |
| 交互与 Action 审阅 | `contracts/interaction.ts`、`src/session.ts` | `browser-goal-command-service.ts`、`browser-projection.ts` | 交互详情、Action 审阅、Action 详情、`interaction-panel.tsx`、`goal-board/api.ts` | 交互视图、详情联合、审阅命令/结果与问题条目改为原生 TS 与生成绑定 |
| Provider 设置 | `contracts/provider.ts`、`src/provider-settings.ts` | `goal-server/cli.ts`、`browser-goal-routes.ts` | `GET/POST/PATCH/DELETE /api/providers`、激活/测试、`goal-board/api.ts`、`SettingsPage.tsx` | 档案、设置、输入、写入/删除/激活/测试结果改为原生 TS 与生成绑定；凭据禁用键继续显式拒绝 |
| 在线模型列表与查询 | `src/provider-settings.ts`、`src/generated/provider-models-*` | `browser-goal-routes.ts`、`model-catalog` 装配 | `POST /api/providers/models`、`fetchProviderModels`、`provider-models-contract.test.mjs` | 响应已按小 Spec 迁移；本线补齐输入 `BrowserProviderModelQuery` 的原生 TS 与生成绑定 |
| 模型目录 | `contracts/model.ts`、`src/model.ts` | `browser-model-catalog.ts` | `GET /api/models`、`GET /api/goals/:goalId/models`、`goal-board/api.ts`、`ModelPicker.tsx` | 目录、选项、来源与告警/错误枚举改为原生 TS 与生成绑定 |
| 模型输入审查 | `contracts/model-input.ts`、`src/model-input.ts` | `browser-model-input.ts` | `GET /api/goals/:goalId/model-inputs`、`model-input-inspector.tsx`、`goal-board/api.ts` | 消息、记录、摘要、详情和列表信封改为原生 TS 与生成绑定 |
| 指标 | `contracts/metrics.ts`、`src/metrics.ts` | `session-metrics` 路由与投影 | `GET /goals/:goalId/metrics`、`GET .../metrics/stream`、`goal-board/api.ts`、`SessionMetricsBar.tsx` | 快照、Run 指标和覆盖度改为原生 TS 与生成绑定；数值范围由现有不变量保留 |
| 轨迹 | `contracts/trajectory.ts`、`src/trajectory.ts` | `browser-trajectory.ts` | Run 列表、分页、事件详情、`trajectory.tsx`、`goal-board/api.ts` | Run、条目、页、详情、开放 payload 与观察结果改为原生 TS 与生成绑定 |
| SSE 实时事件 | `contracts/events.ts`、`src/events.ts` | `browser-session-port.ts` | `GET /api/goals/:goalId/events`、`goal-board/api.ts`、`hooks/useRunStream.ts` | Goal 事件联合、活动事件、提交消息与交互通知改为原生 TS 与生成绑定 |

`BrowserActivityQuery` 来自 URL 查询参数，不是 JSON 请求体；它保留原生 TS 类型和路由手工参数校验，不登记生成绑定。

## 既有 Provider 小 Spec 接入

| 小 Spec | 范围 | 当前状态 | 本线处理 | 证据 |
| --- | --- | --- | --- | --- |
| [在线模型列表响应](../ts-provider-models-contract/spec.md) | `BrowserProviderModels` 成功响应 | 已生成并接入真实浏览器 API；成功响应读取器剥离未知字段 | 保持生成链与消费方式，不改变字段或行为 | `packages/web-contracts/test/provider-models.test.ts`、`apps/goal-board/test/provider-settings-api.test.ts`、`apps/goal-board/e2e/provider-models-contract.test.mjs` |
| [在线模型查询输入](../ts-provider-model-query-contract/spec.md) | `BrowserProviderModelQuery` 请求体 | 仍为 AST；路由 `safeParse` 后进入 `fetchModels` | 改为原生 TS、独立生成绑定，路由按 `strip` 读取并保留 UTF-16、16 KiB、鉴权与 HTTP 映射 | `packages/browser/test/browser-provider-settings.test.ts` 与本线新增路由/读取测试 |
| [Provider 连接测试结果](../ts-provider-profile-test-contract/spec.md) | `BrowserProviderProfileTestResult` | 仍为 AST；浏览器仅做布尔 guard | 改为原生 TS 判别联合与生成绑定，`modelCount` 用 `@asType integer`、`@minimum 1`、`@maximum Number.MAX_SAFE_INTEGER` 表达整数与安全上限 | `packages/browser/test/browser-provider-settings.test.ts`、`apps/goal-board/test/settings-providers.test.tsx` 与本线新增读取测试 |

Provider 小 Spec 的字段、错误枚举、HTTP 状态和凭据规则不因本清单扩大；如共享生成能力不足，按[Spec](./spec.md)记录替身范围，不把替身结果当作真实集成通过。

## 已核对样本调用链

- 请求样本：`BrowserCreateSessionCommand` 由 `src/index.ts` 导出，`browser-goal-routes.ts` 的 `parseCreateSessionCommand` 解析后交给 `BrowserGoalSessionPort.create`；Goal Board 的 `browserApi.createGoal` 构造同一类型。
- 响应样本：`BrowserGoalList` 由 `browser-projection.ts` 的 `projectBrowserGoalList` 生产，`GET /api/goals` 返回，`goal-board/api.ts` 的 `listGoals` 消费。
- SSE 样本：`BrowserGoalLiveEvent` 由 `browser-session-port.ts` 的 feed 生产，`GET /api/goals/:goalId/events` 以 `event: update` 写出，`goal-board/api.ts` 的 `events` 与 `hooks/useRunStream.ts` 消费。

## 生成能力与保留约束

生成能力线 `c1a6b1b5` 已提供原生 TS 到 Schema、Ajv standalone、`contract-binding`、联合/判别联合、递归、开放 JSON、数组元素、数值/字符串约束与 `@asType integer`。本线不修改共享生成器或绑定语义。

当前生成器不表达数组 `minItems`/`maxItems`，且不支持 JSDoc `@multipleOf`。相关既有约束按 Web 不变量保留：

- 交互回答最多 3 题、每题最多 3 个选项、至少 1 题；
- 交互视图 `decisions` 至少 1 项；
- Activity `gaps` 最多 2 项；
- Plan 路线至少 1 个阶段，已批准阶段至少 1 条验收条件；
- Provider 测试 `modelCount` 的安全整数语义由 `@asType integer` 与 `@maximum Number.MAX_SAFE_INTEGER` 表达。

鉴权、请求体字节上限、UTF-16 长度、Provider 凭据禁用键、HTTP 错误映射与取消语义继续由现有路由、`hasUtf16LengthAtMost`、`hasNoProviderCredentialKey` 和 `AbortSignal` 路径承担；迁移不引入旧 AST 回退或双重读取。

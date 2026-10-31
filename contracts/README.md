# 构建期契约 Catalog

`contracts/catalog.json` 是项目数据契约的构建期索引，登记具名 TS 声明、历史 Contract AST 与 Zod 迁移项、生成制品及其派生关系。它不拥有执行契约、运行时状态或持久化数据；这些语义仍由所属模块的源码与说明定义。

Catalog 以 `codex/contract-inventory` 的 `676015c6` 盘点为基线，`inventorySource` 记录该分支、提交与三个分册；分册声明的源码基线为 `8da11ece`。当前共登记 1071 项：Web 341 项（含 157 项已删除的旧 AST 与 56 个生成绑定根）、模型与工具 339 项（含 30 个工具输入）、持久化与跨进程 299 项，以及模型线新增的 92 项模型契约登记。400 个被替代的旧 AST、Zod 与派生声明标记为 `deleted` 并逐项记录处置；两个 Provider Reader 辅助类型继续记录在 `reconciliation.moved`。行号、消费者、协议身份与生成能力均按当前源码登记。

## 登记字段

- `key`：仅用于 Catalog 内部定位的稳定键，格式为 `模块/源码相对路径#声明名`；它不冒充对外协议身份或版本。
- `source`：声明路径与行号。`status` 为 `moved` 时使用 `source.currentPath`；`deleted` 项必须带 `disposition`。
- `owner`、`module`、`boundary`、`section`：声明归属与盘点边界。
- `definition`、`definitionKind`、`relations`：原生 TS、历史 Contract AST、Zod、派生或外部 SDK 定义，以及可见的派生/引用关系。
- `consumers`：生产源码中的引用方；无法静态定位时使用 `consumerNote` 说明。
- `protocol`：`declared`、`undeclared`、`not-applicable` 或 `unknown`。盘点中的边界标签不会自动成为协议身份。
- `generation`：`enabled`、`none`、`runtime`、`external`、`dynamic` 或 `unknown`。只有 `enabled` 项由构建生成制品。
- `validation`：运行时 guard、Zod、内存 Schema、手写校验、SDK、仅类型或生成读取器等实际校验方式。
- `role`：`boundary-root` 或 `referenced`。只有显式边界根与参与本次生成的声明被标记为根。

## 查询

```bash
node scripts/contract-catalog.mjs query web.providers.models.success
node scripts/contract-catalog.mjs query createModelOutputContractBundle
node scripts/contract-catalog.mjs query storage.goal.snapshot
```

查询同时返回匹配的声明项、边界入口与动态组合入口。声明项包含源码位置、消费者、协议身份/版本、生成与校验能力；动态组合只记录构造入口、组成、条件与源码依据，不枚举运行时组合。

## 生成

`npm run contracts:generate -- --write` 读取 Catalog 的全部启用项并写入制品；`--check` 只比较已提交制品，不写文件。相同输入产生相同内容，检查已接入 [`scripts/run-regression.mjs`](../scripts/run-regression.mjs)。

Web 线启用 55 个 `typescript-binding` 边界根和 1 个 `typescript-json-schema` Provider 模型 Reader。字段与约束唯一来源是 [`wire.ts`](../packages/web-contracts/src/wire.ts) 及其 JSDoc；生成器输出：

- JSON Schema 模块、Ajv standalone 浏览器校验器及类型声明；
- 保留身份、版本、方言、来源摘要和工具版本的 Manifest；
- 绑定 `@lazygoal/contract-binding` 的类型化绑定，或共享读取逻辑的薄 Reader。

服务端路由在 JSON 请求体边界调用生成的命令绑定并剥离未知字段；Goal Board API 与 SSE 消费生成的响应绑定并通过有界路径诊断报告被剥离字段。共享读取逻辑位于 [`contract-reader.ts`](../packages/web-contracts/src/contract-reader.ts)，绑定语义以 [`@lazygoal/contract-binding`](../packages/contract-binding/README.md) 为准，行为见 [Web 传输契约](../packages/web-contracts/notes/overview.md)。

生成入口会拒绝重复内部键、重复对外身份与版本、重复制品路径、缺失来源、无效登记、未支持契约类型、不支持结构及无效应注解。生成器当前支持封闭与开放对象、对象数组、联合与判别联合（`anyOf` 或 `type` 数组）、递归本地 `$ref`、开放 JSON（`additionalProperties` 为 `true`、`{}` 或 Schema）、标量、`const`/`enum` 以及数值与字符串约束。数值字段或具名 `number` 类型声明可用 `@asType integer` 将 TypeScript `number` 映射为 JSON Schema `integer`，并保留 `@minimum`/`@maximum`；标量约束也可写在具名 `number`/`string` 类型声明上，从而作用于数组 `items`。数组字段可用 `@minItems`/`@maxItems` 声明非负长度边界。`@asType` 仅支持非联合 `number` 字段或类型声明上的 `integer`；其他值、重复注解、nullable/联合数值及非数值目标明确失败；`@minItems`/`@maxItems` 仅支持数组字段，非法值、重复、非数组字段及 `minItems > maxItems` 明确失败。元组、外部引用、`format` 与其他未声明关键字仍明确失败。登记 Reader 和模型投影对这些结构的支持状态以 [`@lazygoal/contract-binding`](../packages/contract-binding/README.md) 模块说明为准，生成器不会为尚未接入的结构静默降级。

| 能力 | 生成表示 | 代表来源 | 当前状态 |
| --- | --- | --- | --- |
| 联合与判别联合 | `anyOf` 分支或 `type` 数组；判别字段保留 `const`/`enum` | [模型 Decide 输出](../packages/model-contracts/src/model-output/canonical.ts)、[Snapshot 消息与 Observation](../packages/storage/src/goal-snapshot.ts)、[Web Activity](../packages/web-contracts/src/wire.ts) | 生成、绑定与模型投影支持 |
| 递归 | 本地 `$ref` 指向同一 `definitions` 声明 | [SnapshotJsonValue](../packages/storage/src/goal-snapshot.ts)、[BrowserJsonValue](../packages/web-contracts/src/wire.ts) | 生成与绑定支持；模型投影明确失败 |
| 开放 JSON | `additionalProperties` 为 `true`、`{}` 或值 Schema | [BrowserJsonValue](../packages/web-contracts/src/wire.ts)、[Tool 输入 JsonValue](../packages/model-contracts/src/model-output/canonical.ts)、[Snapshot memory patch](../packages/storage/src/goal-snapshot.ts) | 生成与绑定支持；模型投影明确失败 |
| 数组元素 | `items` 内联或 `$ref`，可再含联合、数值/字符串约束与 `@minItems`/`@maxItems` 长度边界 | [ListDirectory 输出](../packages/tools/src/list-directory.ts)、[Snapshot 消息列表](../packages/storage/src/goal-snapshot.ts) | 生成、绑定与模型投影支持；长度与可表达的元素约束进入 wire，元素可移植性仍受限 |
| 数值与字符串约束 | `@asType integer`、`minimum`/`maximum`、`minLength`/`maxLength`、`pattern`；具名标量类型可承载同类约束 | [ListDirectory 输入](../packages/tools/src/list-directory.ts)、[Web Provider 模型标识](../packages/web-contracts/src/wire.ts) | 生成与绑定支持；工具分页数值以 `@asType integer` 表达整数，整数进入 Schema 与 wire，数值与数组长度约束进入 wire，字符串约束由投影标识并由解码强制 |
| 元组、外部格式 | — | — | 明确失败，不生成近似 Schema |

`typescript-json-schema` 策略生成薄 Reader，读取语义由登记项 `generation.reader.module` 提供。Web 启用项使用 [`web-contracts` 的封闭对象 Reader](../packages/web-contracts/src/contract-reader.ts)：额外字段由生成的 Ajv 校验器剥离，因此联合与开放对象在该策略下明确失败。需要这些结构的契约使用 `typescript-binding` 策略生成的 [`contract-binding`](../packages/contract-binding/README.md) 绑定。

Storage 文件族使用 `typescript-binding` 策略，从 TS 文件 DTO 生成结构 Schema、Ajv 校验器和绑定，生成的绑定位于 [`packages/storage/src/generated`](../packages/storage/src/generated)：

| 契约 | 根类型 | 真实消费者 |
| --- | --- | --- |
| Goal Snapshot | `GoalSnapshotV1` | [`goalSnapshotCodec`](../packages/storage/src/goal-snapshot-codec.ts) |
| Agent Profile 文件 | `AgentProfileFile` | [`JsonFileAgentProfileStore`](../packages/storage/src/json-file-agent-profile-store.ts) |
| Tool Grant 账本 | `ToolGrantLedgerFile` | [`JsonFileToolGrantStore`](../packages/storage/src/json-file-tool-grant-store.ts) |
| Sandbox Grant 账本 | `SandboxGrantLedgerFile` | [`JsonFileSandboxGrantStore`](../packages/storage/src/json-file-sandbox-grant-store.ts) |
| 模型偏好 | `ModelPreferenceFile` | [`JsonFileModelPreferenceStore`](../packages/storage/src/json-file-model-preference-store.ts) |
| 项目权限模式 | `PermissionModeFile` | [`JsonFileProjectPermissionModeStore`](../packages/storage/src/json-file-project-permission-mode-store.ts) |
| 模型调用指标 | `ModelCallMetricFileRecord`、`ModelCallMetricsCoverageFileRecord` | [`JsonFileMetricsStore`](../packages/storage/src/json-file-metrics-store.ts) |
| 进程会话 | `ProcessSessionFileRecord`、`ProcessChannelMetaFile` | [`JsonFileProcessSessionStore`](../packages/storage/src/json-file-process-session-store.ts) |
| 模型输入清单 | `ModelInputManifest` | [`JsonFileModelInputStore`](../packages/storage/src/json-file-model-input-store.ts) |
| Goal Context Index | `GoalContextIndexSnapshotFile` | [`JsonFileGoalContextIndexStore`](../packages/storage/src/goal-context-index-store.ts) |
| Retrieval Index Sidecar | `ContextRetrievalIndexSidecarFile` | [`JsonFileContextRetrievalIndexStore`](../packages/storage/src/context-retrieval-index-sidecar.ts) |

Retrieval Index Sidecar 的顶层文件结构已生成绑定；嵌套文档、倒排索引与查询缓存结果由 `context-retrieval` 的领域校验执行。Goal Context Index 已使用 Storage 文件 DTO 生成绑定。边界说明见 [Storage 文件契约清单](../packages/storage/notes/file-contracts.md)。

其他登记项保留真实现状：历史 Contract AST 与 Zod 项只作为已删除盘点记录存在；未启用生成的 TS 声明不产生静态 Schema、Reader 或 Manifest。新增启用项必须在 Catalog 中显式登记生成策略，并先扩展共享读取器的受支持子集。

模型迁移的根契约已按 `typescript-binding` 启用，生成 Schema、Ajv standalone 校验器、Manifest 与绑定；`ToolCallAgentDecision` 因开放 `JsonValue` 输入不生成单一静态根，组合使用封闭的 `ToolCallDecisionEnvelope` 加动态工具绑定。生成制品由模型请求构建与 Runtime 解码链实际消费。

## 维护边界

Catalog 是盘点后的当前源码索引，不是自动同步的第二个字段表。声明移动、删除或改变时，应在同一改动中更新对应登记与 `reconciliation`；生成策略、协议身份和制品路径变化还必须通过 `contracts:generate -- --check`。盘点提交本身不是构建输入。

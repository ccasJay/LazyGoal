# 构建期契约 Catalog

`contracts/catalog.json` 是项目数据契约的构建期索引，登记具名 TS 声明、Contract AST、Zod Schema 及其派生关系。它不拥有执行契约、运行时状态或持久化数据；这些语义仍由所属模块的源码与说明定义。

Catalog 以 `codex/contract-inventory` 的 `676015c6` 盘点为基线，`inventorySource` 记录该分支、提交与三个分册；分册声明的源码基线为 `8da11ece`。共登记 882 项声明：Web 286 项、模型与工具 308 项、持久化与跨进程 288 项。实施时已在当前源码复核：没有声明被删除；两个 Provider Reader 辅助类型随本特性迁移到生成读取器，处置记录在 `reconciliation.moved`。行号、消费者、协议身份与生成能力均按当前源码登记。

## 登记字段

- `key`：仅用于 Catalog 内部定位的稳定键，格式为 `模块/源码相对路径#声明名`；它不冒充对外协议身份或版本。
- `source`：声明路径与行号。`status` 为 `moved` 时使用 `source.currentPath`；`deleted` 项必须带 `disposition`。
- `owner`、`module`、`boundary`、`section`：声明归属与盘点边界。
- `definition`、`definitionKind`、`relations`：原生 TS、Contract AST、Zod、派生或外部 SDK 定义，以及可见的派生/引用关系。
- `consumers`：生产源码中的引用方；无法静态定位时使用 `consumerNote` 说明。
- `protocol`：`declared`、`undeclared`、`not-applicable` 或 `unknown`。盘点中的边界标签不会自动成为协议身份。
- `generation`：`enabled`、`none`、`runtime`、`external`、`dynamic` 或 `unknown`。只有 `enabled` 项由构建生成制品。
- `validation`：运行时 guard、Zod、内存 Schema、手写校验、SDK、仅类型或生成读取器等实际校验方式。
- `role`：`boundary-root` 或 `referenced`。只有显式边界根与参与本次生成的声明被标记为根。

## 查询

```bash
node scripts/contract-catalog.mjs query web.providers.models.success
node scripts/contract-catalog.mjs query createModelOutputContractBundle
node scripts/contract-catalog.mjs query GoalSnapshotV1Schema
```

查询同时返回匹配的声明项、边界入口与动态组合入口。声明项包含源码位置、消费者、协议身份/版本、生成与校验能力；动态组合只记录构造入口、组成、条件与源码依据，不枚举运行时组合。

## 生成

`npm run contracts:generate -- --write` 读取 Catalog 的全部启用项并写入制品；`--check` 只比较已提交制品，不写文件。相同输入产生相同内容，检查已接入 [`scripts/run-regression.mjs`](../scripts/run-regression.mjs)。

首批只启用 `web.providers.models.success`。其字段与约束唯一来源是 [`BrowserProviderModels`](../packages/web-contracts/src/provider-settings.ts) 及其 JSDoc；生成器输出：

- JSON Schema 模块、Ajv standalone 浏览器校验器及类型声明；
- 保留身份、版本、方言、来源摘要和工具版本的 Manifest；
- 绑定共享读取逻辑的薄 Reader。

真实浏览器 API 通过包公开入口消费生成读取器；共享逻辑位于 [`contract-reader.ts`](../packages/web-contracts/src/contract-reader.ts)，行为见 [Web 传输契约](../packages/web-contracts/notes/overview.md)。

生成入口会拒绝重复内部键、重复对外身份与版本、重复制品路径、缺失来源、无效登记、未支持契约类型、不支持结构及无效应注解。生成器当前支持封闭与开放对象、对象数组、联合与判别联合（`anyOf` 或 `type` 数组）、递归本地 `$ref`、开放 JSON（`additionalProperties` 为 `true`、`{}` 或 Schema）、标量、`const`/`enum` 以及数值与字符串约束；数值字段可用 `@asType integer` 将 TypeScript `number` 映射为 JSON Schema `integer`，并保留 `@minimum`/`@maximum`。`@asType` 仅支持非联合 `number` 字段上的 `integer`；其他值、重复注解、nullable/联合数值及非数值字段明确失败。元组、外部引用、`format` 与其他未声明关键字仍明确失败。登记 Reader 和模型投影对这些结构的支持状态以 [`@lazygoal/contract-binding`](../packages/contract-binding/README.md) 模块说明为准，生成器不会为尚未接入的结构静默降级。

| 能力 | 生成表示 | 代表来源 | 当前状态 |
| --- | --- | --- | --- |
| 联合与判别联合 | `anyOf` 分支或 `type` 数组；判别字段保留 `const`/`enum` | [模型 Decide 输出](../packages/model-contracts/src/model-output/canonical.ts)、[Snapshot 消息与 Observation](../packages/storage/src/goal-snapshot.ts)、[Web Activity](../packages/web-contracts/src/activity.ts) | 生成、绑定与模型投影支持 |
| 递归 | 本地 `$ref` 指向同一 `definitions` 声明 | [SnapshotJsonValue](../packages/storage/src/goal-snapshot.ts)、[BrowserJsonValue](../packages/web-contracts/src/session-input.ts) | 生成与绑定支持；模型投影明确失败 |
| 开放 JSON | `additionalProperties` 为 `true`、`{}` 或值 Schema | [BrowserJsonValue](../packages/web-contracts/src/session-input.ts)、[Tool 输入 JsonValue](../packages/model-contracts/src/model-output/canonical.ts)、[Snapshot memory patch](../packages/storage/src/goal-snapshot.ts) | 生成与绑定支持；模型投影明确失败 |
| 数组元素 | `items` 内联或 `$ref`，可再含联合与约束 | [ListDirectory 输出](../packages/tools/src/list-directory.ts)、[Snapshot 消息列表](../packages/storage/src/goal-snapshot.ts) | 生成、绑定与模型投影支持（元素需可移植） |
| 数值与字符串约束 | `@asType integer`、`minimum`/`maximum`、`minLength`/`maxLength`、`pattern` | [ListDirectory 输入](../packages/tools/src/list-directory.ts)、[Web Provider 模型标识](../packages/web-contracts/src/provider-settings.ts) | 生成与绑定支持；工具分页数值以 `@asType integer` 表达整数，整数进入 Schema 与 wire，数值约束进入 wire，字符串约束由投影标识并由解码强制 |
| 元组、外部格式 | — | — | 明确失败，不生成近似 Schema |

`typescript-json-schema` 策略生成薄 Reader，读取语义由登记项 `generation.reader.module` 提供。当前唯一启用项使用 [`web-contracts` 的封闭对象 Reader](../packages/web-contracts/src/contract-reader.ts)：额外字段由生成的 Ajv 校验器剥离，因此联合与开放对象在该策略下明确失败。需要这些结构的契约使用 `typescript-binding` 策略生成的 [`contract-binding`](../packages/contract-binding/README.md) 绑定。

其他登记项保留真实现状：Contract AST 与 Zod 在运行时校验，Tool 输入 Schema 在注册期内存编译，模型输出联合在请求期动态组合；它们不产生本步的静态 Schema、Reader 或 Manifest。新增启用项必须在 Catalog 中显式登记生成策略，并先扩展共享读取器的受支持子集。

## 维护边界

Catalog 是盘点后的当前源码索引，不是自动同步的第二个字段表。声明移动、删除或改变时，应在同一改动中更新对应登记与 `reconciliation`；生成策略、协议身份和制品路径变化还必须通过 `contracts:generate -- --check`。盘点提交本身不是构建输入。

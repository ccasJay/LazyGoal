---
status: proposed
created_at: 2026-10-28
supersedes: []
superseded_by: null
---

# 共享 JSON 规范化与小工具收敛 Spec

## 目标与范围

当前仓库对同一批“确定性 JSON 与小工具”维护了多份实现，且各份实现已经开始分叉：

- 递归键排序 / 紧凑 canonical JSON / 两空格 `stableJson` 共 11 份定义，分布在 11 个文件；
- 通用对象守卫共 35 份定义（28 个名为 `isRecord`，另有 `object`、`isObject`、`isObjectRecord`、`isJsonObject`、`isJsonRecord` 等同构变体）；
- `deepFreeze` 共 9 份定义，其中 7 份容忍环，`model-context` 的 2 份不容忍环；
- `roundScore` 共 4 份定义，实际存在“含 `Number.EPSILON`”和“不含 `Number.EPSILON`”两种公式；
- storage 的 base64url 路径编码在 8 个文件里有 9 处实现。

本 Spec 把这些算法收敛为 `@lazygoal/contracts` 中的单一实现、`@lazygoal/context-retrieval` 中的双语义分数舍入、以及 storage 内部的单一路径编码，并用确定性静态检查防止再次分叉。所有持久化路径、文件名、JSON 字节形状、公开 DTO 与错误类型保持不变；`stableJson` 仍是 Prompt Filter 与字符计量的唯一入口。

本文明确不包含：

- 不接管 `specs/storage-write-primitives` 的原子替换、JSONL 追加与 `KeyedSerialQueue`。该未提交 Spec 的需求 3 已把 storage 内 10 个文件、11 个按键串行机制定义为唯一队列所有者；本 Spec 直接引用它，不重新定义队列。
- 不合并 `packages/runtime/src/context-retrieval.ts` 与 `packages/context-retrieval/src/context-protocol.ts` 的协议校验与结果归一化副本，也不合并 3 份 `uniqueSorted`、2 份 `assertExactKeys`。这些是相邻但独立的重复，另行处理。
- 不改变 Goal Snapshot、Trajectory、Grant、Sidecar、Metrics 或 Trace 的任何持久化格式、目录布局、JSON 缩进、换行和错误类型。
- 不为 JSON 规范化增加 `Date`、`Map`、`Set`、`BigInt`、`toJSON` 或循环引用支持；这些值继续沿用当前 `JSON.stringify` 语义。
- 不引入新的 npm 运行时依赖、原生模块或跨进程锁。
- 不迁移历史开发期数据；旧 Tool Grant 摘要、旧 Cursor 与旧快照按仓库开发期兼容策略视为可丢弃数据。
- 不处理 `apps/` 中的对象守卫；当前 `apps/` 只消费 `web-contracts` 的公开 `isRecord`，没有自己的定义。

### 当前重复清单

| 重复项 | 数量 | 位置 |
| --- | --- | --- |
| canonical 键排序与序列化 | 11 | `context-budget/src/stable-json.ts`、`context-retrieval/src/{context-document,context-retrieval-index,context-protocol}.ts`、`runtime/src/{context-retrieval,runner,action-approval,session-input}.ts`、`permission/src/tool-grant-matcher.ts`、`tools/src/internal/cursor.ts`、`working-memory/src/core.ts` |
| 代码单元比较器 | 6 份本地实现 | `context-retrieval/src/{context-tokenizer,context-document,context-ranking,context-retrieval-index,context-protocol}.ts`、`runtime/src/context-retrieval.ts` |
| 通用对象守卫 | 35 | `contracts` 1、`context-retrieval` 6、`runtime` 7、`model-contracts` 4、`storage` 2、`permission` 1、`model-call` 1、`web-contracts` 1、`working-memory` 1、`llm-google` 1、`benchmarks/*` 10 |
| `deepFreeze` | 9 | `context-retrieval/src/{context-tokenizer,context-document,context-retrieval-index}.ts`、`model-context/src/{trajectory-event-projector,trajectory-model-context-assembler,context-lookup-projection,model-inference-projector}.ts`、`storage/src/{goal-context-index-store,context-retrieval-index-sidecar}.ts` |
| `roundScore` | 4（2 种公式） | `context-retrieval/src/{context-ranking,context-lookup-result,context-protocol}.ts`、`runtime/src/context-retrieval.ts` |
| base64url 路径编码 | 8 文件 / 9 处 | `storage/src/{goal-store,json-file-trajectory-store,json-file-metrics-store,json-file-diagnostic-trace-sink,json-file-model-input-store,json-file-process-session-store,goal-context-index-store,context-retrieval-index-sidecar}.ts` |
| `KeyedSerialQueue` | 10 文件 / 11 机制 | 由 `specs/storage-write-primitives` 需求 3 拥有；本 Spec 不重复定义 |

## 需求与验收标准

### 需求 1：共享 canonical JSON 序列化

作为跨包维护者，我希望所有确定性 JSON 文本来自同一算法，以便键序、缩进和标量语义只在一处定义。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当任一生产源码需要按键序序列化 JSON 时，系统必须调用 `@lazygoal/contracts` 的 `canonicalizeJson` 或 `canonicalJson`；`packages/*/src`、`apps/*/src`、`benchmarks/*/src` 中不得保留第二份递归键排序实现。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：`canonicalizeJson` 必须递归复制值并把自有可枚举字符串键按 UTF-16 code unit 顺序排序；数组保持原顺序；标量原样返回；不得修改输入值。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：`canonicalJson(value)` 必须输出紧凑 JSON；`canonicalJson(value, { indent: 2 })` 必须输出两空格缩进 JSON；两次输出都由 `JSON.stringify` 作用于 `canonicalizeJson` 的结果产生，不得使用自定义序列化器。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：当输入为顶层 `undefined`、函数或 Symbol 时，`canonicalJson` 必须返回字符串 `"null"`，与现有 `stableJson` 契约一致；当对象属性值为 `undefined`、函数或 Symbol 时，该属性必须被 `JSON.stringify` 省略；当数组元素为 `undefined` 时必须输出 `null`。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：`@lazygoal/context-budget` 必须继续公开 `stableJson` 与 `compareCodeUnits`；`stableJson(value)` 必须实现为 `canonicalJson(value, { indent: 2 })`，Prompt 环境的 `stableJson` Filter 与字符计量必须继续引用该导出。
- <a id="spec-req-1-6"></a>**验收标准 1.6**：对于不含自有 `"__proto__"` 键的任意 JSON 值，`stableJson` 的输出字节必须与收敛前完全一致；含该键时，系统必须把它作为普通自有键输出，且不得修改任何对象的原型。这是本 Spec 唯一有意的字节差异。
- <a id="spec-req-1-7"></a>**验收标准 1.7**：`canonicalizeJson` 只复制自有可枚举属性，不得主动调用 `toJSON`；`canonicalJson` 必须保留 `JSON.stringify` 作用于复制结果时的行为。因此 `Date` 与 `Map`/`Set` 必须继续序列化为 `{}`，`BigInt` 必须继续由 `JSON.stringify` 抛出 `TypeError`，含自有 `toJSON` 属性的普通对象必须继续由 `JSON.stringify` 调用该属性。循环引用不属于支持范围。

### 需求 2：共享对象守卫与深冻结

作为调用方，我希望 `isRecord` 与 `deepFreeze` 只有一种语义，以便不同模块不会对同一值给出不同判断或不同的环处理。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：`isRecord(value)` 必须且仅当值是非 `null`、非数组的对象时返回 `true`；`Date`、`Map`、`Set` 与类实例继续返回 `true`。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：`isRecord` 的返回类型必须是 `value is Record<string, unknown>`；实现不得用 `as any`、泛型断言或重复守卫绕过类型收窄。需要更窄领域类型时，调用点必须自行做显式字段校验。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：`deepFreeze(value)` 必须返回同一引用、递归冻结自有可枚举属性值、先冻结子值再冻结父值，并在遇到循环引用时终止而不是无限递归。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：上述 35 个通用对象守卫与 9 个 `deepFreeze` 定义必须被删除并改为共享实现；`web-contracts` 的公开 `isRecord` 与 `benchmarks/swebench/src/manifest.ts` 的 `isRecord` 必须保留原导出名并转发共享实现。
- <a id="spec-req-2-5"></a>**验收标准 2.5**：`execution-stream` 的 `StreamJsonValue` 守卫、`browser-projection` 的 `JsonValue` 守卫与 `contracts/internal.ts` 的 `Record<PropertyKey, unknown>` 守卫必须保留在本模块；它们收窄的是领域类型或 Symbol 键，不是通用 JSON 对象。`working-memory` 的 `RecordValue` 只是 `Record<string, unknown>` 的别名，必须改用共享 `isRecord`。

### 需求 3：分数舍入的双语义收敛

作为检索协议的维护者，我希望两种既有的分数舍入语义各有唯一实现，以便消除复制而不改变任何已持久化分数。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：`@lazygoal/context-retrieval` 必须导出 `roundScore` 与 `roundRankedScore`；前者必须为 `Math.round(value * 1_000_000) / 1_000_000`，后者必须为 `Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000`。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：`context-ranking` 与 `context-lookup-result` 必须使用 `roundRankedScore`；`context-protocol` 与 `runtime/src/context-retrieval.ts` 必须使用 `roundScore`。四个调用点的输出必须与收敛前逐值相同。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：两个共享函数必须是无副作用纯函数，不得抛错或执行领域校验；有限性、非负性与错误类型必须继续由各调用点保留的断言负责。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：确定性测试必须固定两种公式在 6 位小数网格与半微单位边界上的差异，并证明 `roundScore(roundScore(x)) === roundScore(x)` 与 `roundRankedScore(roundRankedScore(x)) === roundRankedScore(x)` 对代表性输入成立。

### 需求 4：storage base64url 路径编码

作为 storage 维护者，我希望路径段编码只有一处实现，以便未来路径安全修正不会漏掉某个 Store。

- <a id="spec-req-4-1"></a>**验收标准 4.1**：`packages/storage/src` 必须提供唯一的内部 `encodePathSegment(value: string): string`，其输出必须等于 `Buffer.from(value, "utf8").toString("base64url")`，不得从 `src/index.ts` 导出。
- <a id="spec-req-4-2"></a>**验收标准 4.2**：上述 8 个文件的 9 处编码必须改为调用该函数；除该模块外，`packages/storage/src` 不得再出现 `.toString("base64url")`。
- <a id="spec-req-4-3"></a>**验收标准 4.3**：`json-file-model-input-store` 的 `^[A-Za-z0-9_-]{1,256}$` 身份校验必须保留在编码之前的调用点；所有现有文件路径、文件名与目录布局必须保持不变。

### 需求 5：依赖边界与静态守护

作为审查者，我希望“没有第二份实现”由测试保证，而不是依赖下一次人工搜索。

- <a id="spec-req-5-1"></a>**验收标准 5.1**：`@lazygoal/contracts` 必须保持零出站包依赖与浏览器可用；其源码不得导入任何 `node:` 内置模块，也不得使用 `Buffer`、`process` 或 `require`。
- <a id="spec-req-5-2"></a>**验收标准 5.2**：`scripts/check-dependencies.mjs` 的允许依赖必须新增 `context-budget → contracts` 与 `model-call → contracts`；`web-contracts → contracts` 由 `specs/web-wire-contract-unification` 拥有，若该 Spec 尚未落地则由本 Spec 补齐同一条边，不得出现重复条目。其它消费包必须复用已有允许边。
- <a id="spec-req-5-3"></a>**验收标准 5.3**：确定性静态测试必须扫描 `packages/*/src`、`apps/*/src` 与 `benchmarks/*/src`，禁止在 allowlist 之外定义通用对象守卫或重复算法：函数或箭头定义名属于 `isRecord`、`isObject`、`isObjectRecord`、`isJsonObject`、`isJsonRecord`、`deepFreeze`、`canonicalize`、`canonicalizeJson`、`canonicalizeBoundaryValue`、`sortKeys`、`sortKeysDeep`、`compareLexical`、`roundScore`、`roundRankedScore`，或名为 `object` 且返回 `value is Record<string, unknown>`；违规必须报告文件与行号。
- <a id="spec-req-5-4"></a>**验收标准 5.4**：确定性静态测试必须禁止 `packages/storage/src` 在 `path-segment.ts` 之外出现 base64url 编码，并禁止 `packages/contracts/src` 出现 `node:` 导入。

### 需求 6：行为保持与验证

作为 Goal Server、浏览器与 Benchmark 的调用方，我希望这次重构不改变任何可观察结果。

- <a id="spec-req-6-1"></a>**验收标准 6.1**：`canonicalizeJson` 与 `canonicalJson` 必须由 golden 语料固定紧凑与两空格缩进两种输出，语料至少覆盖嵌套对象、Unicode 键、整数样式键、空对象/数组、`undefined`、`Date`、自有 `toJSON` 属性、自有 `"__proto__"` 键与顶层不可序列化值；期望值必须是字面量字符串。
- <a id="spec-req-6-2"></a>**验收标准 6.2**：摘要快照测试必须固定至少五个入口的字面量结果：`permission` 的 `computeInputDigest`、`tools` 的 `computeCanonicalDigest`、`runtime` 的 `computeSessionInputDigest`、`context-retrieval` 的 `createContextLookupQueryHash` 与 `runtime` 的 `createContextLookupId`。
- <a id="spec-req-6-3"></a>**验收标准 6.3**：`packages/context-budget/test/stable-serialization.test.ts`、`packages/prompt-renderer/test/prompting-renderer.test.ts`、`packages/prompt-bundle/test/*.test.ts` 与 `packages/model-execution/test/component-extraction-baseline.test.ts` 必须在断言不变的条件下通过。
- <a id="spec-req-6-4"></a>**验收标准 6.4**：`packages/storage/test` 中涉及 Snapshot、Sidecar、Trajectory、Grant 与路径编码的测试必须在断言不变的条件下通过；持久化文件字节与目录布局不得变化。
- <a id="spec-req-6-5"></a>**验收标准 6.5**：`npm test`、`npm run build:web` 与 `git diff --check` 必须通过；`npm test` 已包含 `tsc --noEmit`、依赖边界检查、全部 package/benchmark 测试与文档检查。

### 需求 7：所有权文档

作为后续维护者，我希望文档明确说明算法归属，以便不会再次把共享实现复制回消费包。

- <a id="spec-req-7-1"></a>**验收标准 7.1**：`packages/contracts/README.md`、`notes/overview.md` 与 `notes/semantics.md` 必须新增 canonical JSON、对象守卫与深冻结的职责和权威链接。
- <a id="spec-req-7-2"></a>**验收标准 7.2**：`packages/context-budget/notes/overview.md` 必须改述 `stableJson` 为 `@lazygoal/contracts` 的委托入口，并删除“唯一算法在本包内实现”的旧表述；`notes/semantics.md` 的 `stableJson` 归属保持不变。
- <a id="spec-req-7-3"></a>**验收标准 7.3**：`packages/context-retrieval/notes/overview.md` 与 `packages/storage/notes/overview.md` 必须分别记录分数舍入与路径编码的唯一归属；`npm run check:docs` 必须通过。

## 架构与核心决策

### 系统拓扑与接口

```text
packages/contracts/src/json.ts
    compareCodeUnits(a, b): number
    isRecord(value): value is Record<string, unknown>
    canonicalizeJson(value: JsonValue): JsonValue
    canonicalizeJson(value: unknown): unknown
    canonicalJson(value: unknown, options?: { readonly indent?: 2 }): string
    deepFreeze<T>(value: T): T

packages/context-budget/src/stable-json.ts
    stableJson(value)            // canonicalJson(value, { indent: 2 })
    compareCodeUnits             // 从 contracts 重新导出

packages/context-retrieval/src/score-rounding.ts
    roundScore(value): number          // 不含 EPSILON
    roundRankedScore(value): number    // 含 EPSILON

packages/storage/src/path-segment.ts
    encodePathSegment(value: string): string

packages/web-contracts/src/validation.ts
    isRecord                     // 保持公开名，转发 contracts
```

```ts
interface CanonicalJsonOptions {
    /** 为 2 时使用两空格缩进；省略时输出紧凑 JSON。 */
    readonly indent?: 2;
}
```

`canonicalJson` 的实现固定为：

```ts
const serialized = JSON.stringify(canonicalizeJson(value), undefined, options?.indent);
return serialized === undefined ? "null" : serialized;
```

调用点映射：

| 收敛项 | 调用点 | 使用的 API |
| --- | --- | --- |
| 紧凑 canonical JSON | `context-retrieval/{context-document,context-retrieval-index,context-protocol}`、`runtime/{context-retrieval,runner,action-approval,session-input}`、`permission/tool-grant-matcher`、`tools/internal/cursor` | `canonicalJson` 或 `canonicalizeJson` |
| 两空格 canonical JSON | `context-budget/stable-json` | `canonicalJson(value, { indent: 2 })` |
| 值规范化与相等 | `working-memory/core` | `canonicalizeJson` 与 `canonicalJson` |
| 对象守卫 | 需求 2 列出的 35 处 | `isRecord` |
| 深冻结 | 需求 2 列出的 9 处 | `deepFreeze` |
| 分数舍入 | `context-ranking`、`context-lookup-result` | `roundRankedScore` |
| 分数舍入 | `context-protocol`、`runtime/context-retrieval` | `roundScore` |
| 路径编码 | 需求 4 列出的 8 个 storage 文件 | `encodePathSegment` |

静态检查 allowlist 固定为：

```text
packages/contracts/src/json.ts                 共享实现
packages/contracts/src/internal.ts             Record<PropertyKey, unknown> 守卫
packages/context-budget/src/stable-json.ts     stableJson 委托
packages/context-retrieval/src/score-rounding.ts  分数舍入
packages/storage/src/path-segment.ts           base64url 路径编码
packages/execution-stream/src/publisher.ts     StreamJsonValue 守卫
packages/browser/src/browser-projection.ts     JsonValue 守卫
```

`packages/contracts/src/json.ts` 只依赖 ECMAScript 内建对象，不导入任何 `node:` 模块；因此 `web-contracts → contracts` 不会破坏 `apps/goal-board` 的浏览器构建。摘要计算仍由各调用点使用 `node:crypto` 完成，本 Spec 不把 `createHash` 引入 contracts。

对象键排序使用显式 `compareCodeUnits`，不依赖 `localeCompare`。排序结果写入新对象后由 `JSON.stringify` 输出；JavaScript 会把整数索引键按数值升序提前枚举，因此这类键的最终文本顺序仍由引擎枚举顺序决定，与收敛前一致。本 Spec 不引入自定义序列化器来“修正”该行为。

与既有 Spec 的边界：

- `specs/storage-write-primitives` 拥有 storage 的原子写入、JSONL 追加、权限策略与 `KeyedSerialQueue`。本 Spec 只新增内部路径编码模块，并会与该草案在 8 个 storage 文件上产生机械冲突；两份 Spec 没有设计依赖，可并行实现，后落地者 rebase 并重跑 storage 测试。
- `specs/agent-component-extraction` 曾把 `stableJson` 与 `compareCodeUnits` 的算法放置在 `context-budget`。本 Spec 取代其中的“算法实现位置”决定，但保留其行为要求：单一实现、不复制算法、不新建通用 utils 包、字节与缩进语义不变。`stableJson` 的公开入口仍留在 `context-budget`。
- `specs/nunjucks-prompt-bundle` 的 `stableJson` Filter 语义与模板不变；`specs/context-retrieval-package`、`specs/permission` 与 `specs/storage-write-primitives` 的 DTO、摘要输入与持久化协议不变。
- `specs/web-wire-contract-unification` 拥有 `web-contracts` 的 48 个 DTO guard、Contract AST 迁移与 `web-contracts → contracts` 依赖边，并已为该依赖记录不超过 10 KiB gzip 的 Bundle 预算。本 Spec 只把 `validation.ts` 的通用 `isRecord` 改为委托，不改变任何 guard 的接受范围；两份 Spec 会在 `web-contracts/src/validation.ts`、`packages/contracts/src/index.ts` 与 `contracts` 模块说明上产生机械冲突，后落地者 rebase。若该 Spec 先落地，本 Spec 复用其依赖边与 Bundle 证据，不新增第二条依赖或第二份预算。
- `specs/unified-sse` 只改 `packages/browser` 与 `apps/goal-board` 的 SSE 传输，不涉及本 Spec 的 helper、依赖边或摘要；可并行实现。
- `specs/dependency-checker-ast-parser` 只替换 `scripts/check-dependencies.mjs` 的模块引用提取层，明确不拥有允许清单；本 Spec 拥有 `context-budget → contracts` 与 `model-call → contracts` 两条条目。两份 Spec 在同一文件的不同区域产生文本冲突，合并后统一运行 `npm run check:dependencies`，没有实现依赖。

### 核心决策

- **共享算法放在 `@lazygoal/contracts`**：它是唯一已被多数消费包允许依赖的零出站基础包；permission、tools、runtime、storage、working-memory、context-retrieval、model-context 与 model-contracts 已可导入。本 Spec 只新增 `context-budget` 与 `model-call` 两条允许边；`web-contracts` 的边由 `specs/web-wire-contract-unification` 拥有，若未先落地则由本 Spec 补齐，避免让 permission、tools、storage 依赖“上下文预算”包。
- **`stableJson` 保留在 `context-budget` 并委托**：Prompt Filter 与字符计量的公开契约不迁移，调用方和模板零改动；算法实现只有 `contracts/json.ts` 一份。
- **用 `JSON.stringify` 输出，不写自定义序列化器**：现有全部调用点都建立在 `JSON.stringify` 的标量、`undefined`、数组空洞和 `toJSON` 语义之上；自定义序列化器会扩大行为面并引入新的字节风险。
- **`roundScore` 保留两种公式**：两种公式在 6 位小数网格上等价，但在距半微单位约 2e-10 的边界上会产生 1e-6 差异；统一公式可能改变已持久化分数与包含分数的输入边界摘要。用两个明确命名的函数消除复制而不改变字节。
- **领域类型守卫保留**：`StreamJsonValue`、`JsonValue` 与 `Record<PropertyKey, unknown>` 收窄的是领域类型或 Symbol 键；用通用 `Record<string, unknown>` 替换会丢失类型信息或迫使调用点使用断言。`working-memory` 的 `RecordValue` 不是领域类型，因此纳入替换。
- **路径编码留在 storage 内部**：唯一消费者是 storage，放进 contracts 会扩大基础包职责并引入 `Buffer` 这一 Node 依赖；不新建 `@lazygoal/path` 包。
- **静态检查只锁定已知 helper 名**：检查函数定义名而不是通用的 `typeof value === "object"` 表达式，避免把内联字段校验误报为重复守卫。

## 曾考虑的备选方案

- **保留各包副本，仅补充文档与注释**：改动最小。**落选原因**：11 份算法与 35 份守卫仍然存在，`__proto__`、环处理和两套舍入公式已经实际分叉，文档无法阻止下一次复制。
- **新建 `@lazygoal/json` 基础包**：职责最干净，可同时容纳 canonical JSON、守卫与未来的 JSON Pointer。**落选原因**：与 `specs/agent-component-extraction` 记录的“不为这一依赖新建通用 utils 包”决定直接冲突，需要新增包脚手架、README/notes，并修改约 20 条依赖允许边；当前 5 个 helper 放进现有零依赖包即可满足需求。
- **把全部 helper 放进 `@lazygoal/context-budget`**：遵守现有放置决定，不新建包。**落选原因**：permission、tools、storage、working-memory 与 model-call 都要新增对“上下文预算”包的依赖，语义耦合明显重于复用通用基础包。
- **自定义序列化器，保证整数样式键也按 code unit 顺序输出**：可让 canonical JSON 真正与对象枚举顺序无关。**落选原因**：会改变现有 `stableJson` 与所有摘要输入的字节，直接违反本 Spec 的核心约束；需要独立的协议升级。
- **把 `roundScore` 统一为含 `Number.EPSILON` 的公式**：只保留一个函数。**落选原因**：协议路径的分数会随半微单位边界变化，并可能改变 Think 输入边界摘要与持久化 Lookup 结果；没有证据表明所有历史值都安全。
- **把 `KeyedSerialQueue` 一并纳入本 Spec**：与用户的初始清单一致。**落选原因**：`specs/storage-write-primitives` 已经定义了队列的完整语义、调用点与验证，重复定义会产生两个所有者；本 Spec 只引用它。
- **让 storage 的 JSON 写入也改用 `canonicalJson`**：可进一步统一序列化。**落选原因**：storage 的 Snapshot、Grant 与 Sidecar 字节形状是持久化契约，键序变化会改变文件内容；写入格式由 `storage-write-primitives` 的参数控制，不属于本 Spec。

## 风险与否定性保证

- **风险等级：medium**。理由：改动横跨 runtime、context-retrieval、model-context、storage、permission、tools、web-contracts 与 benchmarks，触及摘要计算和 Prompt 输入表示；但不改变持久化 Schema、公开 DTO、Tool 契约或 Wire 协议。关键操作：替换所有摘要入口的规范化函数、替换 `stableJson` 的实现、修改 8 个 storage 文件的路径编码调用点；这些操作必须保持字节等价并在失败时保持原错误类型。
- **风险：`stableJson` 字节漂移导致 Prompt 缓存、Token 计量或 Prompt Bundle 基线变化**。应对：需求 1.5–1.6 的委托与字节约束、需求 6.1 的 golden 语料、现有 `stable-serialization`、`prompting-renderer`、`prompt-bundle` 与 `component-extraction-baseline` 测试不变。
- **风险：自有 `"__proto__"` 键在赋值式旧实现中被丢弃，统一后开始输出**。应对：需求 1.6 明确这是唯一有意的 `stableJson` 字节差异；golden 测试固定“作为普通自有键输出且不污染原型”；该输入只可能来自模型构造的 JSON，不属于现有 Prompt 或 Snapshot 的合法结构。
- **风险：顶层 `undefined` 在紧凑调用点此前会让 `createHash.update` 抛错，统一后返回 `"null"` 的摘要**。应对：需求 1.4 统一该边界；现有 5 个摘要入口都只接收对象，测试固定合法输入的摘要，不为非法输入保留旧的抛错路径。
- **风险：`isRecord` 返回类型从 `Record<string, any>` 收紧为 `Record<string, unknown>` 引发类型错误**。应对：需求 2.2 要求调用点做显式字段校验；实现阶段以 `npx tsc --noEmit` 驱动修正，不得用 `any` 断言压制。
- **风险：`deepFreeze` 统一为先子后父，`model-context` 两个原实现为先父后子**。应对：现有 DTO 均为无 getter 的普通 JSON 对象，冻结顺序不可观察；需求 2.3 固定新语义并用环测试锁定。
- **风险：与 `specs/storage-write-primitives` 在 8 个 storage 文件上冲突**。应对：本 Spec 只改路径编码调用点，不碰写入原语；后落地者 rebase，并以需求 6.4 的 storage 测试作为合并门槛。
- **风险：与 `specs/web-wire-contract-unification` 在 `validation.ts`、`contracts/src/index.ts` 与依赖允许边上冲突**。应对：需求 5.2 明确依赖边所有权；本 Spec 对 `isRecord` 只做实现委托，不改变 guard 签名或接受范围；`contracts` 公共入口的导出按两份 Spec 的合集合并，后落地者 rebase 并以 `npm test` 与 `npm run build:web` 验证。
- **风险：静态检查过度绑定命名**。应对：只禁止已知 helper 定义名并保留单一 allowlist；新增合法领域守卫必须在 allowlist 中显式登记，而不是放宽为通用正则。
- **否定性保证**：
  - 不得改变任何持久化路径、文件名、JSON 缩进、换行、公开 DTO 字段或错误类型。
  - 不得让 `stableJson` 对不含自有 `"__proto__"` 键的输入产生不同字节。
  - 不得在 `contracts` 中引入 `node:` 模块、`Buffer`、`process` 或 `require`。
  - 不得把两种 `roundScore` 公式合并为一种。
  - 不得在 allowlist 之外保留第二份 canonical 键排序、通用对象守卫、`deepFreeze`、分数舍入或 storage base64url 编码。
  - 不得用 `any` 断言或重复类型守卫绕过 `Record<string, unknown>` 的收窄。
  - 不得重新定义 `KeyedSerialQueue`、原子写入或 JSONL 追加。
  - 不得以净删除行数作为验收依据；预期净减少约 180–230 行只是副作用。
- **验证边界**：需求 1–4 由 `contracts`、`context-budget`、`context-retrieval`、`tools`、`permission`、`runtime` 与 `storage` 的定向单元测试覆盖；需求 5 由静态检查测试与 `npm run check:dependencies` 覆盖；需求 6 由 `npm test` 与 `npm run build:web` 覆盖；需求 7 由 `npm run check:docs` 覆盖。

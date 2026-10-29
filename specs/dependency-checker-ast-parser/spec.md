---
status: proposed
created_at: 2026-10-28
supersedes: []
superseded_by: null
---

# 依赖边界检查器 AST 提取 Spec

## 目标与范围

`scripts/check-dependencies.mjs` 是 `npm test` 与 CI 的依赖边界门，当前按文本正则提取模块引用，再由自研规则判断包方向、Benchmark 隔离、供应商 SDK、入口穿透、旧 LLM 路径、项目产物和进程 API 边界。本 Spec 将引用提取替换为基于维护中解析器的 AST 提取器，保留全部规则、允许清单、扫描范围和稳定中文诊断，并修复当前文本提取的两个实际缺陷：

- 注释中的伪 import 会产生误报。已复现：`packages/contracts/src/index.ts` 中的注释 `// import { x } from "../../runtime/src/index"` 会触发“禁止依赖方向”。
- 文件级边界规则使用缺少 `require` 覆盖的另一套提取器。已复现：`packages/model-view/src/model-inference-view.ts` 中的 `require("../../runtime/src/index")` 只触发包方向规则，绕过 DTO 边界规则。

本 Spec 不引入 dependency-cruiser。TypeScript 7.0.2 不提供可用的 compiler API；dependency-cruiser 18.7 的 `tsc` 解析器在缺少可用 transpile 时静默退化为 0 个模块，在有 `@swc/core` 时又退化为漏掉 `export type … from` 的 acorn 解析。其 `swc` 解析器已标记弃用，且无法同时覆盖类型位置 `import()` 与 `export type … from`。证据、备选方案与重新评估条件见下文。

明确不包含：

- 不调整任何规则意图、允许清单、扫描根目录或中文消息前缀；需求 2.2 只是把既有规则已声明的引用覆盖统一到同一提取器。
- 不把规则引擎重写为单遍扫描，不追求删除 600–900 行；原提案的该收益依赖 dependency-cruiser 接管规则，本路线不承诺。
- 不引入 dependency-cruiser、ESLint 边界插件、TypeScript compiler API 或第二套检查命令。
- 不新增运行时依赖，不改变 `packages/*`、`apps/*`、`benchmarks/*` 的依赖声明。

## 需求与验收标准

### 需求 1：单一 AST 引用提取器

作为依赖边界维护者，我希望所有规则共享一个能理解 TypeScript 语法的引用提取器，以便注释、字符串和不同引用形式不会产生误报或漏报。

- <a id="spec-req-1-1"></a>**验收标准 1.1**：当扫描生产源码或既有消费型测试文件时，系统应当从静态 `import` / `export … from`、侧效导入、`import type` / `export type`、类型位置 `import("…")`、字面量动态 `import()`、字面量 `require()` 和 `import x = require("…")` 中提取模块说明符。
- <a id="spec-req-1-2"></a>**验收标准 1.2**：当同一说明符被多次引用时，系统应当按首次出现去重，并保持确定的遍历顺序。
- <a id="spec-req-1-3"></a>**验收标准 1.3**：若注释、普通字符串、模板字符串或正则字面量包含类似 import 的文本，系统不应将其提取为模块引用，也不应据此产生违规。
- <a id="spec-req-1-4"></a>**验收标准 1.4**：若某个源文件无法按 TypeScript 或 TSX 语法解析，系统应当使检查失败，并在错误中报告文件路径与解析器消息；不得跳过该文件或报告通过。
- <a id="spec-req-1-5"></a>**验收标准 1.5**：当文件扩展名为 `.ts` 时，系统应当禁用 JSX 解析以接受尖括号类型断言；当扩展名为 `.tsx` 时，系统应当启用 JSX 解析。两种模式都应覆盖需求 1.1 的全部引用形式。

### 需求 2：规则与诊断等价

作为仓库维护者，我希望替换提取器不改变既有边界结论和可定位诊断，以便现有规则继续作为架构契约生效。

- <a id="spec-req-2-1"></a>**验收标准 2.1**：现有规则集合、允许清单、扫描范围、违规去重与排序，以及“禁止依赖方向”“组件边界违规”“入口穿透”“禁止导入项目产物”等稳定中文消息前缀应保持不变。
- <a id="spec-req-2-2"></a>**验收标准 2.2**：文件级 DTO、Renderer 与 Storage 边界规则应使用同一提取器；当这些文件通过 `require()`、动态 `import()` 或类型位置 `import()` 引用被禁止的包时，系统应当同时产生文件级“边界违规”与适用的包方向违规。
- <a id="spec-req-2-3"></a>**验收标准 2.3**：`packages/agent/src/index.ts` 的公共入口约束应使用同一提取器，允许的转发目标仍只有 `./create-agent-executor`；该文件中的任何相对引用（含动态导入与类型位置引用）都只能指向允许目标，注释或字符串里的伪引用不应触发“入口约束”。
- <a id="spec-req-2-4"></a>**验收标准 2.4**：每个规则族应至少有一个故意违规 fixture，断言稳定消息；文件级边界逐文件规则、允许清单逐包方向与逐 app 方向应分别覆盖；合法 fixture 不应产生误报。规则与 fixture 的对应关系记录在规则对照表中。
- <a id="spec-req-2-5"></a>**验收标准 2.5**：既有测试不得删除或弱化；新增测试可以覆盖新的提取形式，但不得用新测试替代原有的方向、入口和产物断言。

### 需求 3：运行与维护边界

作为 CI 维护者，我希望检查入口和依赖面保持最小，以便升级解析器时不需要同时维护第二套检查。

- <a id="spec-req-3-1"></a>**验收标准 3.1**：`npm run check:dependencies` 仍是唯一依赖边界检查入口，`npm test` 与 CI 继续执行该命令；不新增第二个检查命令、配置文件或报告器。
- <a id="spec-req-3-2"></a>**验收标准 3.2**：`@babel/parser` 仅作为根 `devDependency` 引入并更新根 `package-lock.json`；不得新增运行时依赖，不得修改包依赖允许清单。
- <a id="spec-req-3-3"></a>**验收标准 3.3**：删除两套自研文本提取实现；不得保留正则提取作为回退路径，也不得同时运行 AST 与正则两套解析。
- <a id="spec-req-3-4"></a>**验收标准 3.4**：在一次 `analyzeDependencies` 调用内，同一文件最多读取和解析一次；跨规则族的重复扫描应复用缓存，而不是重复解析。
- <a id="spec-req-3-5"></a>**验收标准 3.5**：新增 `scripts/notes/dependency-rules.md`，逐规则记录触发条件、稳定消息前缀、违规 fixture 与测试位置；实现与对照表不一致时应视为未完成。

## 架构与核心决策

### 现状与 Spike 证据

当前脚本有两个引用提取函数：`extractRelativeImports` 只覆盖 `from` / `import` / 动态 `import()`，`extractModuleSpecifiers` 额外覆盖 `require()`。文件级边界使用前者，包方向、入口和产物规则使用后者，因此覆盖范围已经分叉。脚本注释明确说明按文本提取的原因是 TypeScript 7 没有可用 compiler API。

本地 spike 使用 TypeScript 7.0.2、dependency-cruiser 18.7.0、`@swc/core` 1.16.20 与 `@babel/parser` 8.0.8，结果如下：

| 观察 | 结果 |
| --- | --- |
| TypeScript 7.0.2 根导出 | 只有 `version` / `versionMajorMinor`，没有 `createSourceFile` 等编译器 API。 |
| dependency-cruiser `parser: "tsc"` + TypeScript 7，未提供 SWC transpile | 静默退化为 0 个模块，进程退出码为 0。 |
| dependency-cruiser `parser: "tsc"` + TypeScript 7，提供 `@swc/core` | 退化为 acorn + SWC transpile；能识别类型位置 `import("…")`，但漏掉 `export type … from`。 |
| dependency-cruiser `parser: "swc"` | 能识别 `import type` / `export type … from`，但漏掉类型位置 `import("…")`；该解析器已标记弃用。 |
| `@babel/parser` 8.0.8 解析目标语料 | 覆盖静态/侧效/类型导入、`export type … from`、类型位置 `import()`、动态 `import()`、`require()`、`import = require()` 与 import attributes；纯 JS，无平台二进制。 |
| `@babel/parser` 解析仓库 460 个生产源文件（`packages` / `apps` / `benchmarks` 的 `src`） | 0 个解析失败，约 370ms。 |
| 当前文本提取器 | 注释伪引用误报；`require()` 绕过文件级边界规则。 |

结论：dependency-cruiser 目前没有一个解析器能独立达到现有引用覆盖；补充扫描或双解析器会重新引入自研提取，并依赖已弃用的解析路径。采用纯 JS 的 `@babel/parser` 只替换提取层，是更小、可验证且没有原生安装面的变更。

### 解析与规则拓扑

```text
checkDependencies
  └─ analyzeDependencies
       ├─ createSourceScanner       读取 + 解析缓存
       │    ├─ text(file)           供进程 API 正则使用
       │    └─ specifiers(file)     AST 提取的模块说明符
       ├─ 包 / app / benchmark 方向与隔离规则
       ├─ 能力包与组件入口穿透规则
       ├─ 文件级 DTO / Renderer / Storage 边界
       ├─ 旧 LLM 路径存在与引用规则
       ├─ 项目产物导入规则
       └─ 组件目录边界、进程 API 与 agent 入口规则
```

`@babel/parser` 的 `parse` 使用 `sourceType: "module"`，按扩展名启用 `typescript` 插件，`.tsx` 额外启用 `jsx`，按需启用 `importAttributes`；遍历 AST 后返回去重说明符。规则常量、扫描根目录、消息拼接和最终 `sort()` 保持不变；`createSourceScanner` 只负责读取、解析和缓存，不拥有规则判断。`collectComponentBoundaryFiles` 与 `collectEntryScanFiles` 现有的消费型测试仍在扫描范围内，使用同一提取器，不扩大或缩小测试覆盖。

AST 节点与引用形式的对应关系：

| AST 节点 | 覆盖形式 |
| --- | --- |
| `ImportDeclaration` | 静态导入、侧效导入、`import type` |
| `ExportNamedDeclaration` / `ExportAllDeclaration` | 命名/全部再导出、`export type … from` |
| `TSImportType` | 类型位置 `import("…")` |
| `TSExternalModuleReference` | `import x = require("…")` |
| `ImportExpression` | 字面量动态 `import()` |
| `CallExpression` + `require` callee | 字面量 `require()` |

`import.meta`、注释、字符串和模板字面量不产生上述节点，因此不会被误提取。遍历跳过 `start` / `end` / `loc` / `extra` 等非子节点字段；同一说明符按首次出现去重。解析异常包装为包含仓库相对路径的中文错误并向上抛出，避免静默漏扫。

### 核心决策

- **保留规则引擎，只替换提取层**：规则本身是有意设计的架构契约，迁移到外部 DSL 的收益在 TypeScript 7 下无法成立。AST 提取器是唯一新增的解析边界，规则判断仍留在脚本内。
- **使用 `@babel/parser` 而不是 TypeScript 7 的 unstable API 或原生解析器**：`typescript/unstable/ast` 不是稳定契约；SWC 与 oxc 需要平台相关的原生包。`@babel/parser` 是纯 JS、无平台二进制，已在本仓库 spike 中覆盖全部目标引用形式，并在 460 个生产源文件上以 0 失败、约 370ms 完成解析。
- **解析失败必须显式失败**：dependency-cruiser 的 `tsc` 解析器在缺少 API 时返回 0 个模块且退出码为 0，说明“解析器不可用”不能被当作“没有依赖”。新实现不提供回退解析器，解析异常直接失败。
- **统一提取器修复既有覆盖分叉**：文件级边界与 agent 入口改用同一提取器。这是对既有规则声明覆盖范围的修复，不新增规则；它会让此前漏掉的 `require`、动态导入和类型位置引用开始被正确拒绝。
- **按调用缓存而不是全局缓存**：每次 `analyzeDependencies` 创建独立缓存，测试夹具与不同项目根之间不会串数据；缓存只消除同一调用内的重复读取/解析。

### 规则对照表

详细的逐规则映射记录在 `scripts/notes/dependency-rules.md`，至少包含以下规则族：

| 规则族 | 触发条件 | 稳定消息前缀 |
| --- | --- | --- |
| 包出站方向 | 跨包相对导入不在 `ALLOWED_PACKAGE_DEPENDENCIES` | `禁止依赖方向：packages/` |
| App 出站方向 | app 导入未允许的包 | `禁止依赖方向：apps/` |
| App 交叉依赖 | app 导入另一个 app | `禁止应用交叉依赖：` |
| Benchmark 隔离 | benchmark 导入另一个 benchmark | `禁止 benchmark 交叉依赖：` |
| 供应商 SDK 泄漏 | `llm-core` / `config` 引用供应商 SDK | `供应商 SDK 泄漏：` |
| 能力包入口穿透 | 跨能力包消费未经过 `src/index.ts` | `跨能力包入口穿透：` |
| 组件包入口穿透 | 九个能力包跨包消费未经过入口 | `入口穿透：` |
| 组件目录入口 | 目录外生产代码穿透组件内部文件 | `组件入口违规：` |
| 文件级边界 | DTO / Renderer / Storage 文件导入禁止包 | `边界违规：` |
| 旧 LLM 路径残留 | 已删除路径仍然存在 | `旧路径转发残留：` |
| 旧 LLM 路径引用 | 源码引用已删除路径 | `禁止引用旧 LLM 路径：` |
| 项目产物导入 | 相对引用落入 `dist` / `lib` / `build` | `禁止导入项目产物：` |
| 组件/测试产物导入 | 组件或其消费型测试落入项目产物 | `构件导入违规：` |
| 组件宿主依赖 | 组件导入禁止的宿主、传输或实现 | `组件边界违规：` |
| 进程 API | `process.exit(` 或进程信号监听 | `组件边界违规：…包含…` |
| Agent 公共入口 | 入口转发非默认装配模块 | `入口约束：` |

### 相关 Spec 边界

当前工作树中有四份未提交 Spec 与本 Spec 共享文件或依赖面，但没有需要串行实现的接口契约：

| Spec | 与本 Spec 的关系 | 并行实施方式 |
| --- | --- | --- |
| `specs/storage-write-primitives/spec.md` | 明确不修改任何 `package.json` 依赖，也不修改本脚本。 | 无冲突，可并行。 |
| `specs/web-content-hardening/spec.md` | 可能修改 `packages/tools` 的运行时依赖与对应 lockfile；不涉及本脚本。 | 与根 lockfile 分开；若同时改动根依赖声明，按 lockfile 合并顺序处理。 |
| `specs/shared-json-primitives/spec.md` | 需要在本脚本的 `ALLOWED_PACKAGE_DEPENDENCIES` 中新增 `context-budget → contracts` 与 `model-call → contracts`。 | 本 Spec 只改提取层，不改允许清单；两份变更在同一文件的不同区域，可并行，合并后统一运行依赖门。 |
| `specs/web-wire-contract-unification/spec.md` | 需要在本脚本的允许清单中新增 `web-contracts → contracts`。 | 同上；由该 Spec 拥有该条边，本 Spec 不重复添加。 |

本 Spec 拥有引用提取与规则等价，不拥有任何允许清单条目。共享文件只产生文本合并冲突，不产生接口或数据归属依赖；四个 Spec 可以在独立工作树并行实施，合并后以 `npm run check:dependencies` 和各自 Spec 的验收项共同确认。若后续选择把 `@babel/parser` 放入其它包，需要先重新确认该包的依赖边界，不沿用本 Spec 的结论。

## 曾考虑的备选方案

- **dependency-cruiser + `tsc` 解析器，并用 TypeScript 6 与 7 并存**：可恢复完整 TypeScript 解析，但需要第二个编译器主版本、额外解析路径或加载器配置；检查器会依赖两套编译器的共存方式。**落选原因**：新增的运行时/安装复杂度高于收益，且不是当前最小变更。
- **dependency-cruiser + 已弃用的 `swc` 解析器 + 类型专用补充扫描或双解析器**：可拼出当前覆盖，但需要合并两套解析结果、维护中文消息包装层，并依赖已宣布将移除的解析器。**落选原因**：维护面不降反升，规则等价性难以用单一证据证明。
- **TypeScript 7 `unstable/ast`**：不新增解析器依赖，但该入口明确不是稳定 API，且当前缺少与现有提取需求匹配的稳定解析接口。**落选原因**：版本升级风险高于引入成熟的 Babel 解析器。
- **保留文本正则**：改动最小，但已复现注释误报和 `require()` 覆盖分叉；继续维护两套提取器会放大漂移。**落选原因**：不能修复当前已证实的规则缺陷。
- **改用 `@swc/core`**：解析速度更快，且已在 dependency-cruiser 的 `parser: "swc"` 路径中验证过部分覆盖。**落选原因**：它引入平台相关的原生包和安装面；本仓库全量 Babel 解析仅约 370ms，性能差异不构成采用原生依赖的理由。
- **改用 `oxc-parser`**：同样是维护中的原生解析器，可作为 SWC 的替代。**落选原因**：与 SWC 相同的原生安装面；没有证据表明它在当前仓库比纯 JS 解析器更合适。
- **把规则迁移到外部 linter 并重写为单遍扫描**：理论上可减少规则代码，但会同时改变规则表达、消息顺序和重复违规行为。**落选原因**：超出“替换提取器”的目标，无法用现有测试证明等价。

## 风险与否定性保证

- **风险评估**：中等；关键操作无。改动不涉及权限、持久化数据或公开接口，但它是所有包、app 与 benchmark 的 CI 架构门；解析器漏掉一种引用形式会静默弱化规则。主要风险是 AST 覆盖不完整、Babel 版本或插件配置变化、重复解析导致 CI 变慢，以及统一提取器后新增的 `require`/动态导入违规。
- **缓解措施**：规则对照表为每个规则族绑定违规 fixture；解析失败显式失败；`.ts` / `.tsx` 分别测试；按调用缓存避免重复解析；生产源文件解析基线为 460 个文件、0 失败、约 370ms；在真实仓库运行 `npm run check:dependencies`，以当前 275 个源文件的成功基线确认没有规则回归（合入其它 Spec 后按实际计数复核）；`npm test` 覆盖完整回归；根 lockfile 通过 CI 的 `npm ci` 验证。
- **否定性保证（Invariants）**：
  - 不得删除、合并、放宽或绕过任何现有规则、允许清单或扫描范围。
  - 不得把解析失败、解析器不可用或空结果当作检查通过。
  - 不得保留正则提取回退或同时运行两套解析。
  - 不得新增运行时依赖，不得引入 TypeScript compiler API 依赖。
  - 不得改变既有稳定中文消息前缀、违规去重与排序语义。
  - 不得为了减少行数而重写规则引擎或改变违规重复行为。

## 验证与重新评估

实现完成后至少验证：

- `node --test scripts/check-dependencies.test.mjs`：全部既有测试与新增 fixture 通过；解析失败 fixture 能定位到文件。
- `npm run check:dependencies`：真实仓库通过，不出现原有规则回归。
- `npm test`：完整回归通过，包含依赖边界门、类型检查、模块文档检查与各包测试。
- `npm run check:docs`：现有模块文档检查保持通过；`scripts/notes/dependency-rules.md` 的规则对照由 fixture 与评审核对，不依赖 `check:docs` 的模块覆盖。
- 根 `package-lock.json` 只包含 `@babel/parser` 及其必要变更，`npm ci` 可复现安装。

当 TypeScript 7.1 提供公共 compiler API 且 dependency-cruiser 明确支持该版本时，重新评估把规则迁移到外部 linter；届时以本 Spec 保留的规则对照表和 fixture 作为等价性基准，而不是重新发明规则清单。

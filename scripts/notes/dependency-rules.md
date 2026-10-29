# 依赖边界规则对照

## 入口与范围

`npm run check:dependencies` 是唯一的依赖边界检查入口，定义在根 [`package.json`](../../package.json)。[`npm test`](../../package.json) 通过[回归入口](../run-regression.mjs)执行同一命令，CI 只运行 `npm test`，因此不存在第二套检查命令、配置或报告器。

检查器实现在 [`scripts/check-dependencies.mjs`](../check-dependencies.mjs)，只扫描各 `packages/<name>/src`、`apps/<name>/src`、`benchmarks/<name>/src`，以及组件目录规则单独纳入的消费型测试。规则常量、扫描根目录、违规文案与最终 `sort()` 排序不因引用提取方式改变。

## 引用提取

模块引用由 `@babel/parser` AST 提取，而不是文本正则：

| AST 节点 | 覆盖形式 |
| --- | --- |
| `ImportDeclaration` | 静态导入、侧效导入、`import type` |
| `ExportNamedDeclaration` / `ExportAllDeclaration` | 命名/全部再导出、`export type … from` |
| `TSImportType` | 类型位置 `import("…")` |
| `TSExternalModuleReference` | `import x = require("…")` |
| `ImportExpression` | 字面量动态 `import()` |
| `CallExpression` + `require` callee | 字面量 `require()` |

`.ts` 源文件按 TypeScript 解析并禁用 JSX，因此接受尖括号类型断言；`.tsx` 额外启用 JSX。Import attributes 由当前解析器语法直接支持。注释、普通字符串、模板字符串、正则与 `import.meta` 不产生引用；同一说明符按源码首次出现位置去重。解析失败会带仓库相对路径与解析器消息中止检查，不回退到文本提取。

每次 `analyzeDependencies` 创建独立的 [`createSourceScanner`](../check-dependencies.mjs)，同一文件在一次分析内最多读取和解析一次，读取结果同时供进程 API 文本规则与 AST 提取使用。缓存不跨调用或不同项目根共享。

## 规则族

| 规则族 | 触发条件 | 稳定消息前缀 | 违规证据 | 合法证据 |
| --- | --- | --- | --- | --- |
| 包出站方向 | 相对引用解析到另一个 package，且目标不在 `ALLOWED_PACKAGE_DEPENDENCIES` | `禁止依赖方向：packages/` | [`包依赖方向逐包拒绝未允许的出站边`](../check-dependencies.test.mjs) 为每个 package 覆盖至少一条未允许边；`rejects outbound dependencies from contracts` 等保留原断言 | `allows existing packages to depend on contracts`、`allows config to consume llm-core and rejects core SDK-style reverse edges` |
| App 出站方向 | app 相对引用解析到 package，且目标不在 `ALLOWED_APP_DEPENDENCIES` | `禁止依赖方向：apps/` | [`app 依赖方向逐 app 拒绝未允许的包`](../check-dependencies.test.mjs)；`allows apps/goal-board to import web-contracts and rejects backend packages` | 同一测试的 goal-board → web-contracts 合法分支 |
| App 交叉依赖 | app 相对引用解析到另一个 app | `禁止应用交叉依赖：` | [`rejects imports between different apps`](../check-dependencies.test.mjs) | 同一 goal-board 测试只引用 package，不触发交叉依赖 |
| Benchmark 隔离 | benchmark 相对引用解析到另一个 benchmark | `禁止 benchmark 交叉依赖：` | `rejects cross benchmark imports`、`rejects gaia cross benchmark imports with swebench and alfworld`、`rejects tua-bench cross benchmark imports with other benchmarks` | [`allows benchmark shared-layer and same-benchmark imports`](../check-dependencies.test.mjs) |
| 供应商 SDK 泄漏 | `llm-core` 或 `config` 引用 `VENDOR_SDK_MODULES` 或其子路径 | `供应商 SDK 泄漏：` | `rejects vendor SDK leakage from llm-core and config across reference forms` | [`allows vendor SDK imports outside SDK-free packages`](../check-dependencies.test.mjs) |
| 能力包入口穿透 | 跨包引用 `CAPABILITY_PACKAGES` 的内部路径而非 `src/index` | `跨能力包入口穿透：` | `allows capability entries and rejects cross-capability internal penetration` 的 llm → llm-core/types 分支 | 同一测试的 llm-openai → llm-core/index 分支 |
| 组件包入口穿透 | 跨包引用九个 `COMPONENT_PACKAGES` 的内部路径而非 `src/index` | `入口穿透：` | `requires component packages to be consumed through public entries`、`detects cross-package internal penetration from apps and benchmarks`、`rejects roundtrip dependencies between component packages` | 同一测试中的 `src/index` 引用；`allows existing packages to depend on contracts` |
| 组件目录入口 | 组件目录外的生产代码引用 `COMPONENT_ENTRY_RULES` 内部文件，且目标不是目录入口 | `组件入口违规：` | `组件入口规则覆盖重新导出、侧效导入与字面量动态导入，并允许目录内部引用`、`组件边界与入口规则在路径归一化后判断`、`Runtime 反向依赖进程会话运行时在所有引用形式上定位失败` | `组件目录内部引用与入口调用通过，测试可定向导入内部实现`、`进程会话运行时的消费者必须通过入口，测试与内部引用不误报` |
| 文件级边界 | `FILE_BOUNDARY_RULES` 命中的文件引用其 `forbidden` package | `边界违规：` | `文件级边界逐文件拒绝 Runtime 引用` 覆盖全部五个文件规则；`AST boundary applies file-level rules to require dynamic and type-position imports`；`detects type-position import expressions leaking runtime into view DTOs` | `文件级边界允许未禁止的包引用` |
| 旧 LLM 路径残留 | `REMOVED_LLM_PATHS` 中的文件或目录仍然存在 | `旧路径转发残留：` | `rejects removed llm path references and leftover forwarding files` | 所有现有合法 fixture 均不创建已删除路径；真实仓库检查通过 |
| 旧 LLM 路径引用 | 相对引用规范化后等于或位于已删除路径之下 | `禁止引用旧 LLM 路径：` | `rejects removed llm path references and leftover forwarding files` | `allows capability entries and rejects cross-capability internal penetration` 中的 llm-core 引用不是已删除路径 |
| 项目产物导入 | package/app/benchmark 的相对引用落入 `dist` / `lib` / `build` | `禁止导入项目产物：` | `rejects project artifact references including literal dynamic imports`、`rejects project artifact imports from package, app and benchmark sources` | `组件与其消费型测试拒绝项目内构建产物，第三方依赖产物不受限` 中的 `node_modules/*/dist` 引用 |
| 组件/测试产物导入 | 组件目录文件或组件消费型测试的相对引用落入构建产物 | `构件导入违规：` | `组件与其消费型测试拒绝项目内构建产物，第三方依赖产物不受限`、`进程会话运行时源码与其消费型测试拒绝项目内构建产物` | 同一测试中的第三方依赖产物路径不触发本规则 |
| 组件宿主依赖 | 组件目录引用 `COMPONENT_BOUNDARIES` 声明的宿主、传输或具体实现 | `组件边界违规：` | `运行时组件不得反向依赖宿主 CLI、组合根、Browser/HTTP/Web wire 与 Node HTTP`、`执行装配组件不得引用具体 Agent、配置、存储与默认工具实现`、`实例生命周期不得依赖应用、模型或具体存储实现`、`进程会话运行时不得依赖工具、Agent、存储、应用与配置实现（含侧效与动态导入）` | `组件目录内部引用与入口调用通过，测试可定向导入内部实现`、`进程会话运行时允许 Runtime/Sandbox 依赖与自有进程 API，消费者经入口调用` |
| 进程 API | 允许该规则的组件文本包含 `process.exit(` 或注册进程信号监听 | `组件边界违规：…包含…` | `组件不得直接请求进程退出或注册进程信号`、`进程会话运行时不得请求宿主退出或注册进程信号，发送自有进程组信号不误禁` | 同一测试中的 `sendSignalToProcessGroup` 调用不触发本规则 |
| Agent 公共入口 | `packages/agent/src/index.ts` 的相对引用不是 `AGENT_ENTRY_EXPORT_SOURCES` | `入口约束：` | `constrains the agent public entry to the default assembly`、`AST boundary rejects every relative reference form in the agent entry` | `AST boundary allows the default agent forwarding target and ignores pseudo references` |

## 维护约定

- 新增或调整允许清单、扫描范围或稳定消息前缀时，必须同步更新本表与对应 fixture；规则实现与本表不一致视为未完成。
- 合法方向优先由真实仓库的 `npm run check:dependencies` 与合法 fixture 共同证明；不以历史扫描文件数或耗时作为固定验收值。
- 不得以删除、合并或放宽规则来消除新增 AST 覆盖产生的真实违规；先修复源码引用，再更新允许清单（仅当架构决策明确允许时）。

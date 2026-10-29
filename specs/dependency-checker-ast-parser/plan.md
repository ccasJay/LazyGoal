# 依赖边界检查器 AST 提取执行计划

依据已确认的 [Spec](./spec.md) 编写。风险等级为中等，边界与否定性保证见 [风险评估](./spec.md#风险与否定性保证)。本计划只替换引用提取及其接入，不调整规则意图、允许清单、扫描范围或稳定中文诊断。

实现顺序：TODO 1 交付普通依赖规则使用的 AST 提取；TODO 2 将文件级与 agent 入口检查接入同一提取器；TODO 3 在所有扫描路径共用调用级缓存；TODO 4 补齐逐规则证据与维护对照。每项执行基本验证，完整回归和安装复现留到 Feature Verification。各项完成时仅勾选 checkbox，保留 `//TODO` 原文。

## 任务清单

- [x] //TODO 1. 用 AST 提取模块引用，消除伪 import 误报并在解析失败时明确失败
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5)、[3.2](./spec.md#spec-req-3-2)。
  - 实施目标：根目录执行 `npm install --save-dev --save-exact @babel/parser@8.0.8`，只更新根依赖声明与 lockfile。按 Spec 的 AST 节点表替换 `extractModuleSpecifiers` 的文本提取，接入包、app、benchmark 及已有入口/产物扫描调用点；按源文件扩展名选择 TypeScript / TSX 解析，按源码首次出现顺序去重。只提取字面量模块说明符，不从注释、普通字符串、模板字符串、正则或 `import.meta` 推断引用。解析异常包含仓库相对路径与解析器消息并向上传播，不跳过或回退。保留现有规则判断与诊断排序。
  - 场景与预期：静态/侧效/type 导入、各类再导出、类型位置 `import()`、动态 `import()`、`require()`、`import = require()` 均产生对应方向违规；重复说明符只产生既有去重语义下的诊断，提取顺序按首次出现；伪 import 不产生违规；`.ts` 尖括号断言和 `.tsx` JSX 正常解析；两种模式均覆盖全部合法引用形式和 import attributes，非法语法定位到具体文件并使检查失败。
  - 验证手段：在 `scripts/check-dependencies.test.mjs` 添加上述 fixture，运行 `node --test --test-name-pattern="AST extraction" scripts/check-dependencies.test.mjs`；`node --check scripts/check-dependencies.mjs`。新增测试以 `AST extraction` 命名，直接验证提取结果与检查入口行为，不仅断言退出码。

- [x] //TODO 2. 统一文件级与 agent 公共入口的引用覆盖，并删除旧文本提取路径
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.5](./spec.md#spec-req-2-5)、[3.3](./spec.md#spec-req-3-3)。
  - 实施目标：DTO、Renderer、Storage 文件级规则复用同一 AST 结果，再按既有规则筛选相对引用；agent 公共入口改为消费相同结果，允许目标仍只有 `./create-agent-executor`。删除 `extractRelativeImports` 与旧文本提取、agent 的独立引用匹配，不保留正则回退或双解析路径。进程 API 的文本检查保持原规则，不把“删除文本提取”扩大为重写进程规则。保留全部既有测试，新增覆盖不替代原有断言。
  - 场景与预期：被限制文件中的 `require()`、动态与类型位置 `import()` 同时产生适用的文件级与包方向违规；agent 的非法相对引用无论采用何种支持形式均被拒绝，合法转发通过，注释/字符串中的伪引用不触发入口约束。原有稳定消息、违规去重、最终排序和消费型测试扫描范围保持。
  - 验证手段：新增以 `AST boundary` 命名的组合 fixture，运行 `node --test --test-name-pattern="AST boundary" scripts/check-dependencies.test.mjs`；检查目标 diff，确认既有规则常量、消息和测试断言未删除或弱化。

- [x] //TODO 3. 在一次依赖分析中复用文件读取与解析结果，并隔离不同分析调用
  - 落实标准：[3.4](./spec.md#spec-req-3-4)、[2.1](./spec.md#spec-req-2-1)。
  - 实施目标：每次 `analyzeDependencies` 创建独立 `createSourceScanner`，向组件、入口和 agent 检查等路径传递同一 scanner；`text(file)` 与 `specifiers(file)` 共用读取缓存，模块引用共用解析缓存。同一规范化文件路径在一次调用内最多读取和解析一次，若存在并发访问须复用同一个进行中的结果。scanner 不拥有规则，不设置跨调用全局缓存，不改变扫描收集器或计数语义。
  - 场景与预期：同一文件同时进入包方向、文件级、组件与入口检查时，读取和解析各最多一次，仍产生所有适用诊断；第二次分析前修改 fixture，结果反映新内容；不同 fixture 根目录不会串缓存。读取或解析失败仍传至调用者，不返回空引用。
  - 验证手段：使用内部 scanner 的可控读取/解析测试接缝记录调用次数，不修改 `analyzeDependencies(projectRoot)` / `checkDependencies(projectRoot)` 的调用契约；在现有测试文件添加以 `AST cache` 命名的重叠扫描、文件改写与不同根目录场景，运行 `node --test --test-name-pattern="AST cache" scripts/check-dependencies.test.mjs`。

- [x] //TODO 4. 补齐逐规则等价证据和维护对照，保持唯一检查入口
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5)、[3.1](./spec.md#spec-req-3-1)、[3.5](./spec.md#spec-req-3-5)。
  - 实施目标：逐项核对 Spec 的 16 个规则族与当前脚本规则，复用既有违规 fixture，补齐缺少的合法/违规场景；文件级逐文件规则、包允许方向和 app 允许方向分别覆盖，不只验证一个代表包。新增 `scripts/notes/dependency-rules.md`，逐规则记录触发条件、稳定消息前缀、fixture 和测试名称/位置，并为合法方向注明对应证据。对照表链接当前源码和测试，不把历史扫描文件数或耗时当作固定验收值。保持 `check:dependencies` 为唯一依赖门，核对 `npm test` 与 CI 原有调用链；不增加检查命令、配置或报告器。
  - 场景与预期：每条受保护边界都有可定位的违规断言，合法引用通过；旧 LLM 路径残留/引用、供应商 SDK、组件/能力入口、构建产物、benchmark/app 隔离和进程 API 均保留；规则表可逐项对应实际测试；未改变允许清单，未新增运行时依赖。
  - 验证手段：运行 `node --test scripts/check-dependencies.test.mjs`、`npm run check:dependencies`；人工逐条核对规则表与脚本常量、测试，并审查根 manifest / lockfile 和 CI/回归入口的 diff。

## 并行 Spec 协调

- 本 Spec 只拥有 `scripts/check-dependencies.mjs` 的引用提取与缓存，不拥有允许清单。`shared-json-primitives` 拥有 `context-budget → contracts`、`model-call → contracts`；`web-wire-contract-unification` 拥有 `web-contracts → contracts`。本分支独立实现时不预加这些边，集成时保留已获准的允许清单改动，组合后重跑依赖门。
- `@babel/parser` 只进入根依赖文件；网页硬化与 SSE 的包/app lockfile 不在本计划修改范围。共享脚本的文本冲突不构成串行实现依赖，后续集成依据 [编排方案](../orchestration.md) 统一处理。

## Feature Verification

### Planned Checks

以下验证针对最终提交与实际组合状态执行。既有测试全部保留；新的完整覆盖集中在此阶段收口。缺少必需依赖或环境时记录 blocked，不把跳过检查当作通过。

| 验收项 | 对应需求 | 验证场景与预期结果 | 检查手段 / 命令入口 |
|---|---|---|---|
| 引用形式与首次出现顺序 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2) | 全部规定引用形式均被提取；同一说明符多次出现只保留第一次，混合语句顺序确定；import attributes 不妨碍提取 | `node --test scripts/check-dependencies.test.mjs`；AST 提取结果与端到端违规断言 |
| 伪引用不误报 | [1.3](./spec.md#spec-req-1-3) | 注释、普通字符串、模板字符串、正则及 import.meta 不产生模块引用；真实引用仍被识别 | 同一测试文件中混合真假引用的正反 fixture |
| 语法模式与显式失败 | [1.4](./spec.md#spec-req-1-4)、[1.5](./spec.md#spec-req-1-5) | `.ts` 尖括号断言与 `.tsx` JSX 分别通过；两种模式覆盖全部引用形式；非法语法使分析和 CLI 失败，报告文件路径与解析器消息 | 测试经 `analyzeDependencies` 和子进程 CLI 调用验证错误与非零退出，不允许静默空结果 |
| 规则集合与诊断保持 | [2.1](./spec.md#spec-req-2-1)、[2.4](./spec.md#spec-req-2-4)、[2.5](./spec.md#spec-req-2-5) | 16 个规则族、逐文件边界、逐包/app 方向都有合法与违规证据；稳定消息、去重/排序及扫描范围保持，既有测试无删除或弱化 | 全部检查器测试；逐项核对 `scripts/notes/dependency-rules.md`；审查最终 diff |
| 文件级覆盖修复 | [2.2](./spec.md#spec-req-2-2) | DTO/Renderer/Storage 使用 require、动态导入、类型位置引用时同时触发文件级与适用的包方向违规 | 文件级规则矩阵 fixture 的精确诊断断言 |
| agent 入口约束 | [2.3](./spec.md#spec-req-2-3) | 只接受允许目标的相对引用；非法动态/type/require 引用被拒绝；伪引用无误报 | agent 入口正反 fixture 与完整诊断断言 |
| 唯一入口与依赖范围 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2) | 现有 npm/CI 调用链不变；根 devDependency 和 lockfile 包含解析器及必要依赖变更；无包运行时依赖或允许清单修改 | `npm run check:dependencies`；检查 manifest、CI、回归脚本与 diff；在执行 worktree 根目录运行 `npm ci` 后重新运行检查器测试 |
| 单一实现与调用级缓存 | [3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 两套文本提取和 agent 独立匹配已删除，无解析回退；同文件每调用最多读/解析一次；跨调用修改与根目录隔离生效 | 源码检查及 scanner 计数、重叠扫描、调用隔离测试；不以总运行耗时替代次数断言 |
| 规则维护对照 | [3.5](./spec.md#spec-req-3-5) | 对照表逐规则链接实现与测试，覆盖与当前实现一致 | 人工逐项核对；`npm run check:docs`；文档门不替代规则覆盖审核 |
| 真实仓库与全量回归 | 需求 1–3 | 实际扫描成功；既有规则保持，新增语法覆盖产生的真实违规不得通过放宽规则消除；全仓类型、依赖、模块说明及 package/benchmark 回归通过 | `npm run check:dependencies`、`npm test`、`npm run check:docs`、`git diff --check`；记录实际扫描数量与提交，不固定历史数量/耗时 |
| 并行改动集成 | [2.1](./spec.md#spec-req-2-1)、[3.1](./spec.md#spec-req-3-1) | 新提取器与另外两份 Spec 获准的依赖边共同工作；其它方向仍被拒绝，提取器测试与允许清单都未被冲突处理覆盖 | 独立集成 worktree 对固定分支 SHA 运行检查器测试和依赖门；结果记录于编排方案，本地单分支通过不宣称集成通过 |

### Latest Result

- 状态：通过；并行改动集成项未在本 worktree 执行，由编排阶段独立验证。
- 执行日期：2026-10-29。
- 最终实现提交：`e0836fe5`（TODO 4）；本结果文档提交紧随其后。
- Spec 指纹：`spec.md` 的 sha256 为 `5fa060da4df2bda91fd5d5d7401c2733b639c74eeb6ba2766637f982a0358154`；Planned Checks 段落的 sha256 为 `0087baa2a63d91cc29fa49bfc7863e29a9921eda9b7a6b96fa6ed08a72cb2e00`。
- 验证环境：Node v22.22.2、npm 10.9.7、uv 0.9.5。

| 检查 | 命令 | 结果 |
|---|---|---|
| 根依赖安装 | `npm ci` | 通过；`@babel/parser` 及其传递依赖可复现安装 |
| Workspace 依赖安装 | `npm ci --prefix <apps/benchmarks/packages 的 21 个 workspace>` | 全部通过 |
| 检查器测试 | `node --test scripts/check-dependencies.test.mjs` | 61 passed，0 failed |
| 依赖边界门 | `npm run check:dependencies` | 通过；实际扫描 275 个源文件 |
| 类型检查 | `npx tsc --noEmit` | exit 0 |
| 全量回归 | `npm test` | exit 0；输出 `[regression] 全部通过` |
| 文档检查 | `npm run check:docs` | 通过；46 个模块、166 份当前说明 |
| 空白检查 | `git diff --check` | exit 0 |
| 解析失败显式失败 | `node scripts/check-dependencies.mjs <临时根>`（非法 `.ts` 语法） | exit 1；输出 `无法解析源文件：packages/contracts/src/broken.ts：Unexpected token (1:22)` |
| 允许清单未改动 | 对比 `a36c8939` 的 `ALLOWED_PACKAGE_DEPENDENCIES` 与 `ALLOWED_APP_DEPENDENCIES` | 完全一致；未新增本 Spec 之外的允许边 |
| Lockfile 范围 | `git diff a36c8939 -- package-lock.json` | 仅新增 `@babel/parser`、`@babel/types` 与两个 helper 包 |

- 规则证据：新增 fixture 与逐规则对照位于 [`scripts/check-dependencies.test.mjs`](../../scripts/check-dependencies.test.mjs) 与 [`scripts/notes/dependency-rules.md`](../../scripts/notes/dependency-rules.md)；16 个规则族、逐文件边界、逐 package 与逐 app 方向均有违规断言，合法 fixture 覆盖允许方向。
- 未决项：Planned Checks 的“并行改动集成”要求独立集成 worktree 验证其它 Spec 获准的依赖边；本 worktree 未执行该步骤，不宣称集成通过。无环境阻塞项。

# 包内文档与语义表重构设计

## Overview

基于已批准的 [需求](./requirements.md)，将当前说明迁入所属模块的 Markdown 文档，建立包内语义表，移除旧架构目录，并同步维护规则。使用现有 Node.js 工具链检查文档结构、归属和本地引用；不引入文档站点、额外依赖或语义表生成系统。需求 1–3 由包内组织实现，需求 4–5 由迁移边界实现，需求 6 由项目规则与 Skills 同步实现。

## Key Design Decisions

### D1：按实际模块归属发现文档单元

从 `packages/*/package.json`、`apps/*/package.json` 发现核心包与应用；`benchmarks/` 是共享评测模块，`benchmarks/alfworld/`、`gaia/`、`swebench/`、`tua-bench/` 是各自的适配模块；`prompt-evaluation/gepa/` 是独立 Python 模块。这些单元采用同一文档组织约定，Benchmark 的 `src/` 等实现子目录不再建立第二套文档入口。当前共 29 个单元；包和应用清单按实际 manifest 发现，不在 Skill 中复制静态清单。（需求 1、2）

### D2：README 导航，notes 承载正文

用户已确认采用 `README.md`、`notes/overview.md`、`notes/semantics.md`。README 保留模块简介、最短使用入口和正文链接；overview 说明职责、边界、关键流程与限制；必要的操作教程或较长专题可拆为 `notes/usage.md` 等文件，并由 overview 导航。每个主题只由一个模块维护详细正文；引用源码契约代替复制类型和字段全集。（需求 1、2）

新增项目根 `README.md` 承载项目简介、公共启动入口和按目录分组的模块导航。原架构总览的领域不变量归 Runtime，服务装配与端到端接线归 Goal Server；根 README 通过链接访问这些说明，避免重新形成集中架构正文。

### D3：语义表手工维护，按包表达概念

每个单元在 `notes/semantics.md` 维护一份语义表，固定使用四列：`概念`、`简明含义`、`归属模块`、`权威说明`。归属模块用链接指向负责模块的 README，权威说明指向该模块的说明章节或源码契约。表内允许收录使用到的外部概念，但含义应保持简短并引用实际所有者，不在消费方重写完整契约。（需求 3）

不从导出符号或 TSDoc 自动生成语义描述：源码类型不能充分表达状态、所有权和恢复含义。检查器校验结构、路径与归属，事实是否准确由源码、测试和真实调用方核验。概念变化时搜索相关文档并同步引用方，不建立额外概念 ID 或注册清单。

### D4：迁移后删除旧入口，历史材料保持原样

先核对当前实现、迁移正文、补齐新入口并验证，再删除 `docs/architecture/` 中的全部旧文档；不保留迁移页或跳转页。原文件为空或事实已失效时，依据实际模块公开入口补充或修订正文，不能将移动文件视为完成事实核验。（需求 4）

实施开始前记录已有 `specs/` 与 `project-memory/` 文件的路径集合和内容摘要；验收时逐项比较，排除本功能 Spec 目录。新体系的引用全部指向当前路径，受保护材料中的历史链接不批量替换，不调用 Memory 索引写入或维护流程。（需求 5）

### D5：规则归属集中在项目指令，Skills 保持路由职责

`AGENTS.md` 定义模块文档位置、权威顺序、语义表规则和同步触发条件；`CLAUDE.md` 的相关章节引用该规则并更新当前入口。文档仍需在职责、所有权、数据流、生命周期、恢复、协议或限制变化的同一改动中同步。（需求 6）

`lg-doc-standards` 从根 README 进入所属模块 README、overview 和 semantics；`lg-prose-standard` 继续负责文本契约并引用文档路由规则。其他直接依赖旧入口的 Skills 仅修订相关路由与模板，不把所有模块清单或维护规则复制到各个 Skill。项目 Skill 修改随特性改动提交 Git，执行时按 `skill-creator` 的适用流程核验。

### D6：增加离线文档检查，范围与保护边界一致

新增 `scripts/check-docs.mjs` 与 `npm run check:docs`，复用现有 `marked` 解析 Markdown，不增加依赖。检查当前体系并加入 `scripts/run-regression.mjs` 的独立阶段；检查失败退出非零并报告源文件、目标或违反的规则。（需求 1–6）

检查源包括根 README、各文档单元的 README 和 `notes/**/*.md`、项目指令及项目 Skills 的 Markdown 说明。链接可以指向源码或现有 Spec，但不递归检查目标文档；`specs/`、`project-memory/`、运行产物、依赖目录、代码示例和测试 fixture 不作为检查源。既有 Memory 检查独立保留，不通过豁免当前文档错误来掩盖它的失败。

## 风险与待确认

- 风险等级：medium，与 Requirements 一致。影响多个模块和 Agent 路由，采用普通文件迁移与离线检查，可通过 Git 恢复。
- 关键操作：迁移核验后删除旧架构文档，方案已由用户明确选择；本阶段仅生成设计。
- 已接受影响：旧 Specs 与 Memory 的架构引用将失效，Memory 中仍可能声明旧目录的权威关系。新项目规则按当前源码与包内说明判断事实；遇到旧来源须报告未维护状态，不静默提升历史材料为当前权威。
- 主要风险：机械迁移会保留错误描述；归属判断错误会使跨包行为重复维护；链接检查可能误把示例或历史引用当作当前引用。分别通过源码核验、下述迁移映射和限定扫描源处理。
- 待确认：无。用户已确认文档文件组织、语义表手工维护及轻量检查方案。

## Components and Interfaces

### 旧文档迁移映射

下表给出正文的主要所有者；一篇旧文档含不同归属主题时按 D2 拆分，主题只能保留一份详细说明。路径列均相对仓库根目录。

| 原说明 | 新正文归属 |
| --- | --- |
| `docs/architecture/README.md` | 根 `README.md` 导航；`packages/runtime/notes/overview.md` 保存领域不变量；`apps/goal-server/notes/overview.md` 保存系统装配 |
| `docs/architecture/agent.md` | `packages/agent/notes/overview.md` |
| `docs/architecture/config.md` | `packages/config/notes/overview.md` |
| `docs/architecture/contracts.md` | `packages/contracts/notes/overview.md` |
| `docs/architecture/model-contracts.md` | `packages/model-contracts/notes/overview.md`；原文件为空，依据现有输出契约、Schema 和消息协议补齐 |
| `docs/architecture/context-retrieval.md` | `packages/context-retrieval/notes/overview.md` |
| `docs/architecture/runtime.md` | `packages/runtime/notes/overview.md`；较长恢复专题可独立放入其 `notes/` |
| `docs/architecture/working-memory.md` | `packages/working-memory/notes/overview.md` |
| `docs/architecture/storage.md` | `packages/storage/notes/overview.md` |
| `docs/architecture/sandbox.md` | `packages/sandbox/notes/overview.md` |
| `docs/architecture/llm.md` | `packages/llm/notes/overview.md`；配置解析正文归 `packages/config/notes/`，本包通过引用访问 |
| `docs/architecture/execution-stream.md` | `packages/execution-stream/notes/overview.md` |
| `docs/architecture/session-metrics.md` | `packages/session-metrics/notes/overview.md` |
| `docs/architecture/http.md` | `packages/http/notes/overview.md` |
| `docs/architecture/browser.md` | `packages/browser/notes/overview.md` 保存访问与读取边界；`apps/goal-board/notes/overview.md` 保存前端交互；服务接线归 Goal Server |
| `docs/architecture/benchmarks.md` | `benchmarks/notes/overview.md` 保存共享 Headless、隔离与 Prompt Evaluation；具体环境归各 Benchmark；GEPA 生命周期归其模块 |
| `docs/architecture/swebench.md` | `benchmarks/swebench/notes/overview.md` |
| 已有应用、Benchmark、GEPA README | 保留简短 README 入口；详细架构与操作说明迁入各自 `notes/overview.md` 或 `notes/usage.md` |

没有独立旧架构页的模块仍需补齐 D2、D3 的文件。`acp`、`execution-control`、`permission`、`slash-command`、`tool-core`、`tools`、`web-contracts` 从各自公开入口、调用方与测试核验职责，不从其他文档抽取未经核实的描述。

### 语义表的写作边界

表项收录模块实际负责或调用方必须理解的领域概念，不机械列出全部导出符号。最小内容从所属模块真实职责取得，例如 Runtime 的 Goal/Run/Step、Config 的 Home/workspace/Profile、Storage 的 Snapshot/Trajectory 文件、ACP 的 Session/stopReason，以及各 Benchmark 的 Attempt/评分事实。同名词含义不同须在概念名称中注明上下文。

归属模块列的链接必须指向发现的文档单元 README；权威说明列至少有一个可访问的本地链接。跨模块术语优先引用所有者的 overview 章节或源码契约，不把另一份语义表链式引用当成完整契约。没有独立业务术语的薄模块可收录其实际协议、组件或执行边界，不填充空表或泛化术语。

### 项目规则与 Skills 修改位置

| 位置 | 相关修改 |
| --- | --- |
| `AGENTS.md` | 更新目录说明、Architecture Documentation 规则、模块权威关系与同步要求 |
| `CLAUDE.md` | 更新文档入口及指向项目规则的引用；移走本次归属范围内重复的架构正文，保留 Agent 操作指令 |
| `lg-doc-standards/SKILL.md` | 将权威来源和导航切换为项目入口与模块 `notes/`，读取相关语义表 |
| `lg-prose-standard/SKILL.md` | 明确语义表保留必要含义，详细契约引用所有者；位置规则交给文档路由 Skill |
| `lg-find-simplifications/SKILL.md` | 替换旧架构读取和同步路径；本机服务与前端路由到对应应用，移除已不存在的 TUI 文档入口要求 |
| `lg-spec-worktree-execution/SKILL.md` | 将架构同步目标切换为受影响模块的说明和语义表 |
| `lg-benchmark-integration/SKILL.md` 及 `references/containerized-acp-template.md` | 将详细说明放入 Benchmark 的 `notes/`，README 引导访问；目录样板增加 overview 与 semantics |

上表中的 Skills 路径相对 `.agents/skills/`。实施时再次搜索相关入站引用，只修订与此次文档体系直接相关的部分。

### 检查器边界

检查器按 D1 发现单元，验证 README、overview 与 semantics 存在、非空且可以从 README 到达。overview 的必需信息按职责、使用与限制进行人工核验，不通过堆叠固定标题证明内容完整。

解析当前源文件的行内链接、引用式链接与本地图片引用；代码围栏、行内代码和说明样板不形成实际链接。仓库内目标须存在，Markdown 片段按 GitHub 标题锚点或显式 HTML `id` 验证；源码的行号片段只核验源文件存在。HTTP、邮件等外部链接不联网检查。

语义表检查四列表头、非空表项、归属模块与权威链接；非 README 的模块说明须位于本模块 `notes/` 内。项目 Skills 的 `SKILL.md` 与配套资源继续遵循自身目录约定，不作为模块说明移动到 `notes/`。当前体系中的实际路径引用不得继续将旧架构目录作为权威来源，旧架构目录必须已移除。

检查器只读，不修复文件、生成语义内容或改写索引。通过检查证明结构和引用有效，不证明描述与实现一致。

## Testing Strategy

- 需求 1–3：对发现的全部单元核验文档覆盖和 README 到正文、语义表的导航；逐模块用公开契约、相邻测试和真实调用方核对职责与表项。现有配置入口不一致时记录真实限制，不顺带修改产品代码。
- 需求 4：按迁移映射检查主题去向、重复正文与旧入口删除情况；重点核对 Runtime 恢复、LLM 阶段配置、Browser 边界和 Benchmark 评分权威，使用离线配置解析核验操作示例的必要参数。
- 需求 5：实施前后比较受保护文件清单及内容摘要；历史引用失效作为已接受限制记录，当前链接检查不递归进入这些材料。
- 需求 6：从各受影响 Skill 的实际入口走查新文档路由、源码契约归属和同步触发条件；检查项目指令与 Skills 没有互相冲突的文档权威声明。
- 检查器使用 `scripts/check-docs.test.mjs` 的临时目录覆盖缺页、空表、错误归属、失效路径和锚点、重复标题、引用式链接、代码样板及历史材料排除。测试聚焦真实误判和漏判风险，沿用现有脚本测试发现方式。
- 文档验收运行 `npm run check:docs`、相关脚本测试与 `git diff --check`；`npm test` 验证新增检查阶段和回归接线，不运行真实模型、Docker 评测或付费 smoke。`memory:check` 的既有失败单独报告，不声明通过。

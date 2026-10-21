# 流式会话重构多 Spec 编排

## 编排目标

将本轮六份已批准的 Spec 集成为一套完整的文本会话体验：模型有序内容块 → 持久化 Session 输入与控制 → 问答及审批 → 参数修订 → 安全会话输出 → Web 交错时间线。复用现有无界面装配，不提炼 SDK；各功能的行为和验收范围只来自其已批准的 spec.md／plan.md。

本文件替换上一组阶段审查／上下文索引功能已完成后遗留的临时编排；该组不参与本轮，也不重置其 Spec 或验证记录。旧编排可从 Git 历史查阅。本编排已获批准并处于联合执行中；2026-10-19 按更新后的并行调度政策修订后续接纳、分支与集成策略，已获用户重新批准（2026-10-19，见生命周期状态）。

## 涉及的 Spec

| 编号 | Spec 与职责 | 批准状态 | 任务／验收标准 | 完成条件 |
| --- | --- | --- | --- | --- |
| M | [model-output-streaming/spec.md](./model-output-streaming/spec.md)：完整／增量共享有序内容块、真实 Adapter 流 | Spec／[Plan](./model-output-streaming/plan.md) 均已批准 | 8／34 | 所属计划全部完成，Feature Verification passed／current。 |
| S | [streaming-session/spec.md](./streaming-session/spec.md)：Session、受理／队列、Steer／Interrupt、显式恢复 | Spec／[Plan](./streaming-session/plan.md) 均已批准 | 11／47 | 所属计划全部完成，Feature Verification passed／current。 |
| H | [human-interaction/spec.md](./human-interaction/spec.md)：问答／审批重设计与宿主处理器 | Spec／[Plan](./human-interaction/plan.md) 均已批准 | 9／34 | 所属计划全部完成，Feature Verification passed／current。 |
| A | [action-approval-revision/spec.md](./action-approval-revision/spec.md)：参数修订、授权事务与独立重执行 | Spec／[Plan](./action-approval-revision/plan.md) 均已批准 | 9／39 | 所属计划全部完成，Feature Verification passed／current。 |
| P | [session-output-protocol/spec.md](./session-output-protocol/spec.md)：正式消息、候选、来源去重与统一输出 | Spec／[Plan](./session-output-protocol/plan.md) 均已批准 | 10／39 | 所属计划全部完成，Feature Verification passed／current。 |
| G | [goal-board-streaming/spec.md](./goal-board-streaming/spec.md)：交错时间线、候选展示、有界历史与阅读控制 | Spec／[Plan](./goal-board-streaming/plan.md) 均已批准 | 10／41 | 所属计划全部完成，Feature Verification passed／current。 |

本组共 **6 份 Spec、6 份 Plan、57 个任务、234 条验收标准**。批准状态来自本会话逐份确认，不由文件存在或 proposed 状态推断。统计口径限本轮重构；全仓顶层另有既有规范，本次核对含 spec.md 或 requirements.md 的目录共 92 个（22 个含 spec.md、70 个含 requirements.md，不含 archived／retired），不将它们全部纳入执行。

## 依赖关系与执行顺序

| Spec | 已批准的硬前置 | 本编排的进入条件 |
| --- | --- | --- |
| M | 本组六份中无硬前置。 | 已确定隔离基线及当前获批文件，现有基础回归可归属。 |
| S | 本组六份中无硬前置。 | M 的已验证实现可用，先稳定模型块与消费者契约。 |
| H | S。 | M、S 的实际实现及 Feature Verification 已通过。 |
| A | S、H。 | H 已验证，复用真实请求身份、新表单和统一受理。 |
| P | S、M、H；A 为关联能力。 | S、M、H 已验证且提交固定即可进入；涉及修订／恢复引用的组合检查在含 A 的集成状态上复核。 |
| G | M、S、H、A、P。 | 前五份实现与验证均可用，最后整合布局及完整浏览器体验。 |

**实际执行顺序：M → S → H →（A ∥ P）→ G；合入顺序仍为 M → S → H → A → P → G。**

M 先于 S 是本轮集成顺序，避免会话接入后再替换底层响应结构。A 与 P 不存在彼此的实现前置（P 的已批准硬前置为 S、M、H；A 仅为关联能力），故 H 验证后 A 与 P 并行实施；涉及修订／恢复引用的 P 组合检查改在有 A 的集成状态上复核，替代原串行“A 先于 P”的就地补验。每份 Spec 的内部任务顺序、提交及验证方式仍执行自己的 plan.md 和 executing-plan 流程，本文件不重新拆解 57 个任务。

下游只可基于已验证的上游实现开展，不得把上游已获批、测试替身或约定接口当作实际交付。任何必需前置未就绪，都应报告具体状态，不能在下游任务中补做另一份 Spec。

## 并行调度

本编排默认并行实施就绪的 Spec，只对具体实现前置或独占资源串行；执行者为用户 2026-10-18 联合执行指令明确授权的 subagent（编排批准本身不扩展该授权），协调者独占本文件编写、集成与合入操作。调度要点：

- **实现前置与等待**（按已批准 plan.md 派生；关联能力不构成完成-起始依赖）：
  - H 等待 S：产物为 S 的会话契约、`inputs`／`events` wire 与 S 的 Feature Verification；就绪条件为 S 全部 TODO 完成、FV passed／current、提交固定；原因是 H 的表单与宿主处理器按其 plan 依赖这些契约。
  - A 等待 H：产物为 H 的已验证提交（新交互区域、表单、宿主处理器）与 FV；原因是 A 的修订／授权事务复用真实请求身份与新表单。
  - P 等待 S、M、H：产物为三者已验证提交；不等待 A（其已批准硬前置不含 A）。
  - G 等待 A、P：产物为 A、P 的已验证提交及其集成结果。
- **并行对与容量**：H 验证后，A 与 P 由同一共同基础（H 的已验证提交）独立建分支、独立工作树并行实施；并发上限 2 个执行者，容量空出即接纳下一就绪 Spec，不等整批；受阻或待审核的 Spec 不拖住无关就绪 Spec。
- **共享写面与独占资源**：A 与 P 都会触及 Runtime、`packages/browser`、`apps/goal-server`／`goal-board` 与集成测试入口；以独立工作树隔离写入，禁止两个执行上下文同时写同一功能契约，合流按 A → P 并入并复核受影响证据。测试资源沿用既有隔离（随机端口、临时目录、独立 LAZYGOAL_HOME），无共享数据库或迁移类独占资源。
- **放行与固定**：上游无需等 dev 合入即可放行下游，条件是其验证 current 且提交已固定（pin）；堆叠分支在创建时固定上游 SHA，下游开始前先合入上游更新；不对已审阅提交强制改写历史。

## 分支与合并策略

### 基线与隔离

- 目标分支为 dev。规划时主工作区位于 dev，HEAD 为 ae417629ba24e5b971f1570d3258779ff802797c；这只是当前观察点。实施前记录实际基线 B0、获批文档指纹及工作树状态，dev 如有新提交，先复核其对本组的影响。
- 主工作区已有六处未提交的 model-catalog／Goal 模型绑定相关修改，六份 Spec／Plan 也尚未提交。保留原文件，不自动 stash、reset、清理或混入功能提交；执行工作树必须能读取本次获批文档，不能误用继承的旧编排。文档基线和只读副本按执行流程落地，任何依赖代码差异先明确其独立基线归属。
- 若现有修复必须先交付才能形成可用基线，报告具体缺口，独立核验并取得对应授权后再纳入；不在本编排中顺带实现／提交无关修复，也不以排除用户改动为由弱化验收。
- 为每份 Spec 使用专用工作树，代码修改和验证都在所属工作树进行。已创建的工作树按现状保留（见下表）；新工作树创建前重新检查同名分支／目录，若出现同名已有工作，不覆盖或强制重置。既有其他工作树不属于本轮清理范围。
- 2026-10-19：S 执行段曾误写主工作区 `apps/goal-server/src/runtime/{composition,execution-composition}.ts` 草稿；已备份至临时目录（`lazygoal-main-stray-backup-20261019`）并还原，其余既有未提交改动未受影响。

### 分支与合流

| 顺序 | 开发分支 | 创建基础 | 专用工作树 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | codex/model-output-streaming | B0（经复核的 dev 基线）。 | .worktrees/model-output-streaming | 已完成（已验证，未合入）。 |
| 2 | codex/streaming-session | codex/model-output-streaming 的已验证提交（`9ecb5255`）。 | .worktrees/streaming-session | 执行中。 |
| 3 | codex/human-interaction | codex/streaming-session 的已验证提交（创建时 pin）。 | .worktrees/human-interaction | 等待 S。 |
| 4a | codex/action-approval-revision | codex/human-interaction 的已验证提交（与 P 的共同基础，创建时 pin）。 | .worktrees/action-approval-revision | 等待 H；与 P 并行。 |
| 4b | codex/session-output-protocol | codex/human-interaction 的已验证提交（与 A 的共同基础，创建时 pin）。 | .worktrees/session-output-protocol | 等待 H；与 A 并行。 |
| 5 | codex/goal-board-streaming | A、P 集成线的已验证结果（创建时 pin）。 | .worktrees/goal-board-streaming | 等待 A、P。 |

默认从记录的共同基础独立建分支，仅为具体实现前置堆叠（H 于 S；G 于 A、P 集成线）；每层记录基础 SHA、完成实现 SHA 及证据；下游继承已完成提交，不用整目录复制代码或把依赖 cherry-pick 成重复实现。上游若需要修复，先在其所有者分支修复，再向下游传播并更新受影响证据；不得对已审阅提交强制改写历史。

### 审核与合入

各 Spec 保留 executing-plan 的用户审核与合入门禁。单项 Feature Verification passed／current 后可在其验证提交上继续堆叠下游，但不得据此自动合入 dev；验收报告必须区分“分支已验证”“用户已审核”和“已合入”。编排批准也不代替各功能实现的最终审核。

本组跨 Spec 验证在独立集成工作树中组合固定提交完成：先用 H＋A＋P 的中间集成放行 G，再用含六份实现的最终组合执行获批场景；并复核后续改动影响的各 Spec 验收证据。记录组合基础、各分支提交、实际结果与 freshness；上游单独通过的旧结果与本地替代验证不能充当最终组合通过。若 dev 在此期间前进，先在隔离候选中核对其增量，刷新受影响验证与审核，不直接强推或重置 dev。

全部 Spec 实现审核与共同验证满足后，按 **M → S → H → A → P → G** 顺序串行合入 dev（A、P 并行开发不改变串行合入与依赖优先），逐层核对提交包含关系；不得倒序先合顶层分支。主工作区相关文件若仍有未提交修改，先独立解决归属，不能强行覆盖或自动暂存后合入。每份 Spec 的 delivered 收尾、证据保留及安全工作树清理由执行流程负责，不能让后续堆叠恢复已收尾 Spec 的旧状态。合入后核对 dev 与已验证组合的实现差异；出现新的相关差异即补充对应验证，不将已失效证据标为 current。

本次编排不包含推送、PR 创建、发布、用户数据迁移／删除或付费模型验收。联合执行指令已于 2026-10-18 下达并在执行中；本次 2026-10-19 材料性修订（并行调度、分支与集成策略）已获用户重新批准，H／A／P／G 按新调度接纳（执行者授权来自用户指令，不由编排批准推定）。

## 跨 Spec 协调约束

| 交接面 | 权威所有者及协调要求 |
| --- | --- |
| 模型完整结果与增量 | M 拥有有序内容块及真实流能力；S／P／G 消费实际身份与成功结束，不建立另一套正文／工具结果真值，不提前执行残缺块。 |
| 输入、队列与执行 | S 拥有统一受理、inputId、收据、短提交、单活动 Goal、有限 Interrupt 与显式恢复；H／A／P／G 不另起去重、调度或浏览器队列。 |
| 问答与审批 | H 拥有规范交互、重设计表单和处理器；A 扩展其已获批的修订／恢复操作。P／G 只能消费当前有效请求，不从模型正文创建可批准表单。 |
| 授权与实际参数 | A 拥有最终参数／授权绑定、Grant 失败恢复及 PTC 重放；P／G 对齐实际版本及恢复引用，不改写原模型请求，也不绕过权限／沙箱。 |
| 正式消息、候选与来源 | P 拥有消息身份、用途、来源、候选结算及请求去重投影；G 只按其规范协调界面，并补充已批准的提交位置／Activity 只读分页，不重做 Runtime 接受规则。 |
| 页面衔接 | H 先替换旧表单，A 接入参数修订，P 做单协议消费，G 最后组织交错布局。均使用当时真实统一入口，不保留第二条旧 wire／SSE／表单推进路径。 |
| 数据、资源与装配 | Snapshot／已提交 Trajectory 继续权威；实时 cursor 不冒充持久化修订，预览不作为恢复输入。现有应用装配与资源所有权不迁包，断线／退订不取消执行，重建不自动 resume。 |

共享源码的交接以分支提交和当前契约为准，各执行上下文只写自己的工作树；上游修复通过所有者提交向下游传播，不跨工作树直接改文件。发生行为、接口或架构 Gap 时，回到受影响 spec.md／plan.md 按其流程处理；本文件不能新增业务规则来填缺口。实质性范围或分支／参与集合变更须更新本编排并重新批准；常规冲突修复不得改变原验收标准或覆盖用户已有修改。

## 跨 Spec 集成验证

这些场景组合现有计划的验收要求，不新增功能范围或替代各计划检查。使用正式无界面装配、隔离文件数据、真实 HTTP／SSE 与 Chrome，以及实际 Adapter 加确定性本地协议来源；不使用付费模型、危险真实工具或伪造最终 Session DTO 代替链路。

| 场景 | 涉及 Spec | 预期结果 | 检查入口及证据 |
| --- | --- | --- | --- |
| 真实增量到正式答复 | M、S、P、G | 输入受理后按真实块生成，完整响应接受才执行；候选转正只一份，模型结束／阶段接受不冒充 Run 完成；whole 来源不伪造分片。 | 对应 [M](./model-output-streaming/plan.md#feature-verification)、[P](./session-output-protocol/plan.md#feature-verification)、[G](./goal-board-streaming/plan.md#feature-verification) 的装配／SSE／Chrome 检查；核对 Snapshot、消息来源和实际调用数。 |
| Queue、Steer 与 Interrupt 竞争 | S、H、P、G | 普通消息默认排队，Steer 应用到同 Run，带草稿仍可停止；收尾审批／未知效果、cancelled 与队列暂停分别可辨，旧决定不能复活工作。 | 复用 [S](./streaming-session/plan.md#feature-verification)、[H](./human-interaction/plan.md#feature-verification)、G 的控制流程；核对收据、模型输入和真实资源／工具结算。 |
| 问答与宿主／真人竞争 | S、H、P、G | 三种问答响应正确继续原 Run，不批准范围；当前唯一交互、草稿和失效引用准确，回调异常／迟到不重复推进。 | H 的正式解码、宿主竞争及真实表单检查，P／G 同步展示；核对持久化决定与下一请求。 |
| 修订授权、直接工具与 PTC | S、H、A、P、G | 审阅并确认最终参数／范围后才执行；原请求可追溯，实际参数说明和父子引用一致，Grant 不确定失败不越权，未知结果仅独立重执行决定。 | [A](./action-approval-revision/plan.md#feature-verification) 的事务／PTC／恢复检查与 P／G 输出；核对权限账本、实际工具入参与调用次数。 |
| 过程正文与原生历史 | M、A、P、G | 已保存过程正文与已结算且入选的同源原生交换只进入请求一次；预算淘汰／身份变化仍按协议保留正文，修订说明及调用／结果配对不丢失。 | P 的实际下一请求／预算矩阵和 A 的修订结果；文件重建后再次捕获真实 LLMRequest，而非只数页面文本。 |
| 保存不明、断线和末次通知丢失 | S、M、H、A、P、G | 复用原输入身份核验，丢最后通知且无后续 token 仍发现正式结果；旧候选作废不复活，快速后继 Run 不串源，重启只展示显式恢复需求。 | 各所有者保存屏障与 [G](./goal-board-streaming/plan.md#feature-verification) 的重连／双客户端流程；核对文件、修订、收据及请求／调用计数。 |
| 长 Run 历史和阅读 | P、G，并保留 H／A 入口 | 同 Run 分段、固定上界及三页窗口无重漏；正文／活动位置重建一致，向上阅读不被新内容拉走，当前请求与独立 Stop 可达。 | G 的有界 Activity／真实 Chrome，复用 P 的正文查询；核对页界、DOM 锚点、焦点、截断与缓存释放。 |
| 隐私、生命周期及既有入口 | 全部 | 默认流和页面不含禁止公开内容，Host／Origin／Bearer 有效；观察资源释放不取消任务，既有 Provider／模型选择、Plan、指标和 Trajectory 行为保持。 | 各计划安全／关闭矩阵与最终构建／浏览器回归；窄屏／键盘／reduced-motion 证据沿 G 计划，不降低为静态快照。 |

最终复用各计划已有的正式装配与 e2e 入口，重点包括 session-output.integration、goal-board-streaming.integration 及其 Chrome 场景；不另设一份取代各计划的测试清单。执行当前根回归、独立应用构建与获批 Chrome 回归，具体命令沿各 plan.md。集成检查在独立集成工作树中组合固定提交执行（中间组合 H＋A＋P 用于放行 G；最终组合六份实现），记录组合基础、各分支提交、各 Spec 对应证据、实际结果、未解决项和 current／stale；本地替代验证不构成集成通过，必要检查失败或缺少环境不能记为通过。

## 生命周期状态

当前阶段：M、S、H、A、P 五份 Spec 均已完成并各自通过 Feature Verification（各自分支未合入 dev）；A×P 中间集成线 `codex/integration-streaming` 已完成合流、集成修复（PTC 子操作身份）与部分跨 Spec 场景取证。2026-10-20 用户指示暂缓：暂停 subagent 执行、暂不启动 G；dev 合入、六份最终集成验证、Memory 门与本文件删除均未开始。执行者由用户 2026-10-18 指令授权的 subagent 承担；协调者独占本文件、集成与合入操作。

实施基线（实施前记录）：B0 = `ae417629ba24e5b971f1570d3258779ff802797c`（dev，与规划观察点一致，未出现新提交）。获批文档指纹 SHA-256（前 12 位，每组依次为 spec.md／plan.md）：M `d66dbaed073e`／`2abb84e22029`；S `bde764142c72`／`58d7f1f89f87`；H `47bd7ad219c6`／`aba4dfb46863`；A `0aaede2f3aec`／`4b766bca96f6`；P `f8bab8720b76`／`5ae9094bb403`；G `8573444de38f`／`68a4dcf2888e`。主工作区工作树状态：6 处已修改文件（model-catalog 4 处、runtime 2 处）、`specs/orchestration.md` 修改与 6 份未跟踪 Spec 目录；按方案原样保留，不纳入功能提交。

| Spec | 进度 | Feature Verification | 实现审核／合入 |
| --- | --- | --- | --- |
| M | 已完成（HEAD `9ecb5255`，验证点 `e7304c21`） | passed／current（2026-10-18；遗留 1 项预存环境未满足，见执行记录） | 未审核／未合入 |
| S | 已完成（HEAD `3f8e9457`，验证点 `7b59ac9c`） | passed／current（2026-10-19；独立复跑受机器负载影响，见执行记录） | 未审核／未合入 |
| H | 已完成（HEAD `2cefbb20`，验证点 `96ed9076`） | passed／current（2026-10-19；编排者独立复跑全套 e2e 9/9 绿） | 未审核／未合入 |
| A | 已完成（HEAD `f5c8c586`，验证点 `3ff25bbb`） | passed／current（2026-10-20；2261 TS/TSX + e2e 10/10） | 未审核／未合入 |
| P | 已完成（HEAD `2a2e2321`，验证点 `662bebf2`） | passed／current（2026-10-20；专项 69 绿 + e2e 2/2） | 未审核／未合入 |
| G | 已完成（HEAD `8fcc1d44`，验证点 `757b58f6`＋修复轮＋清理） | passed／current（2026-10-21；全量 2409/2409、e2e 12/12；编排者独立复核） | 未审核／未合入 |

执行记录：
- M：工作树 `.worktrees/model-output-streaming`；基础 SHA `ae417629`（其上文档基线 `31602fd0`）；完成 HEAD `9ecb5255`（代码验证点 `e7304c21`）；8/8 TODO 逐项绿色提交；Feature Verification passed／current（2026-10-18），证据见 `specs/model-output-streaming/plan.md` Latest Result。遗留 1 项预存环境未满足：`apps/goal-board/e2e/runtime.test.mjs` 首条 `.primary` 断言失败（根因：headless 默认视口 756px 触发 `(max-width: 760px)` 移动布局，`#workspace-navigation` 不在 DOM；1280px 桌面视口下同一断言成立；纯文档基线 `31602fd0` 可复现；M 未修改 goal-board 源码）。处置：由 S 的 TODO 10 在扩展该 e2e 时按 `board.test.mjs` 惯例显式设定视口使其确定化，并在本组集成验证中复核。

- S：已完成；TODO 1–11 全部勾选，提交至 `3f8e9457`（board e2e 迁移 `7b59ac9c`；FV 记录 `3f8e9457`）；Feature Verification passed／current（2026-10-19 12:34：`npm test` 2146 TS + 70 mjs、goal-server 48/48、goal-board 77/77、`build:web`、5 个 e2e 5/5、`git diff --check` 全绿）。执行期间四次边界暂停（传输中断 ×2、上下文预算耗尽 ×2）均自进度文件与绿色提交恢复。编排者独立核验：结构检查与 spec 指纹通过、goal-board／goal-server 单测复跑全绿；独立复跑 board e2e 时因机器负载（Hearthstone ~56% CPU、load ~3.0）在 5 秒 UI 等待处超时（失败点漂移、无孤儿进程），判为环境抖动——最终集成验证须在空闲负载下重跑 e2e。证据见 `specs/streaming-session/plan.md` Latest Result。
- H：已完成；TODO 1–9 全部勾选，提交至 `2cefbb20`（board e2e 契约修复 `96ed9076`；FV 记录 `2cefbb20`）。Feature Verification passed／current（`npm test` 385 TS/TSX、goal-server 49/49、goal-board 94/94、`build:web`、e2e 9/9、`git diff --check`；编排者 23:35 独立复跑全套 e2e 9/9 绿、load 1.60）。执行中发现并修复 M／S 的两个真实缺陷（收尾阶段已批准 Action 被静默丢弃、`waitingFor` 误报），修复随本分支提交。FV 曾因 `board.test.mjs` 记为 blocked，根因经探针定位为「mock 未关闭被取代的 SSE 响应，浏览器同源 6 连接被陈旧流占满，请求根本没到达 mock」+「interaction-details mock 新旧字段混用」，已在 `96ed9076` 修复并保留 blocked 历史记录。
- A／P：已按并行调度同时启动（2026-10-19）；共同基础 = H 已验证提交 `2cefbb20`，各自独立分支与工作树（`codex/action-approval-revision` / `.worktrees/action-approval-revision`；`codex/session-output-protocol` / `.worktrees/session-output-protocol`）；共享写面（Runtime、browser、goal-server、goal-board）由合流顺序 A → P 解决，P 受影响证据在 A 合入后复核，G 随后。首次并行执行中两个执行者同时触发全量测试，主机负载升至 26 并导致双方会话传输超时中断（未提交改动均已保留）：已加资源纪律（靶向测试限并发、全量回归集中到各自 FV 阶段并用 `nice` 让出 CPU、执行前检查负载）后重新续跑。P 已完成 TODO 1–3（`3634a4b0`／`d94290f4`／`a731f0f2`；消息身份与来源、按来源去重、公开过程正文），TODO 4 的探索稿已整体回滚（Runtime 类型化联合与事件分类器令 `browser-stream.test.ts` 只收到 `state_sync`、缺公开活动）并留存定位要点；需在含 A 状态复核的四项与共享写面冲突清单记录在 `.worktrees/session-output-protocol/.execution-progress.md`；A 仍在并行执行。
- A：已完成；TODO 1–9 全部勾选，提交至 `f5c8c586`（实现至 `3ff25bbb`；FV 记录 `f5c8c586`），共改 75 个文件。Feature Verification passed／current（`npm test` 2261 TS/TSX + 70 scripts、goal-server 51、goal-board 101、`build:web`、e2e 10/10 真实 Chrome、`git diff --check`；无失败与缺环境项）。覆盖只读审批预检、原请求↔最终版本关联、持续授权绑定最终版本、首次批准与未知结果重执行四分支、PTC 按最终参数执行与原请求重放、模型/历史理解实际修订、Web 审批编辑审阅确认与独立恢复视图、无界面宿主经同一预检返回修订决定。与 P 的共享写面冲突清单（runtime 的 goal-coordinator/runner/transition/domain/trajectory/session-manager、storage 的 snapshot 与 codec、permission 的 Grant 来源新增 `approvalInputId`、browser 路由与投影、web-contracts 的 session/validation、model-context 与 model-view 历史、goal-board 的 interaction-panel/api 与 e2e test-service、goal-server 的 cli/composition）已记录，待 P 完成后在集成工作树按 A → P 顺序人工解冲突；集成工作树 `.worktrees/integration-streaming`（分支 `codex/integration-streaming`）已基于 A 的 tip 建立。
- P：已完成；TODO 1–10 全部勾选，提交至 `2a2e2321`（实现至 `662bebf2`）。Feature Verification passed（专项 69 绿、`npm test` 全绿、goal-board 103、两个 Chrome e2e 2/2、check:dependencies／check:docs／diff --check 通过；契约指纹未变）。关键定位：TODO 4 上一轮 `browser-stream.test.ts` 挂起源于分类器未覆盖 tool 事件（`tool_started`／`tool_finished`／`tool_attempt_*` 落入 default 分支），补齐后既有公开活动语义完全保持且未放宽断言。需在含 A 状态复核的四项（`action_approval`／`action_recovery` 领域身份、PTC 父子身份、候选因参数修订作废／替换）与共享写面冲突点（runtime 的 runner／session-manager／step-executor／domain／goal-coordinator／trajectory、storage 的 snapshot 与 codec）已记录；下一步由 P 合入集成线 `codex/integration-streaming`（基线 A 的 `f5c8c586`）并按归属人工解冲突，再执行中间集成场景以放行 G。遗留：候选预览逐字增量未接真实流式供应商（按 Spec 3.2 等待完整块，不伪造打字增量）；Chrome 场景未覆盖"候选被正式消息替换"的 DOM 断言（由 runtime 与 board 消费层测试覆盖）。
- 2026-10-20（用户指示暂缓）：暂停 subagent 执行、暂不启动 G。集成线停在 `codex/integration-streaming` 的 `1145f823`（含合并 `4ddb873b`、集成修复 `23e26b0a`、已取证的中间集成场景证据），工作树仅进度文件未提交、无未解冲突；M／S／H／A／P 五条分支与集成工作树均保留未清理。恢复顺序：先补齐中间集成剩余场景取证 → 放行 G → 六份最终集成验证 → 用户审核与 dev 合入批准（串行 M→S→H→A→P→G）→ Memory 门 → 删除本文件。
- 2026-10-20（用户批准恢复 G）：G 执行自 TODO 5 接续（工作树 `.worktrees/goal-board-streaming`，分支 `codex/goal-board-streaming`，HEAD `88d5b1af`，基线 `1145f823`；TODO 1–4 已勾选并提交，交接时唯一未提交文件为 `apps/goal-board/test/activity-projector.test.ts` 的新增分组边界断言）。协调者修正该工作树的依赖布局：原 `npm install` 产生的实体 `node_modules` 与主工作区形成重复物理副本（`packages/browser` 与 `packages/session-metrics` 各一份 `hono`，致全仓 `tsc` 报 2 个 TS2345），已统一改为指向主工作区的 symlink（19 链接／0 实体目录），`npx tsc --noEmit` 现 exit 0；G 工作树计划文件与主工作区已批准版本差异仅为 TODO 勾选状态。同时在集成工作树以串行回归（`--test-concurrency=1`、完整输出留存）定位合流后 1 项未定位失败。
- 2026-10-20（集成基线诊断结论）：集成工作树 407 个测试文件串行回归 **2348/2348 全绿、0 失败**（`npx tsx --test --test-concurrency=1`）。此前执行者用并行 `npm test` 得到的 2348 项中 1 项失败**在串行下无法复现**，判定为并行执行与并发负载下的时序抖动，而非合流引入的真实回归；仍需在最终集成阶段于空闲机器上用与仓库一致的并行 `npm test` 复跑一次以确认。
- 2026-10-20（G 首次交付判定 failed）：TODO 1–10 已实现并逐条提交（HEAD `f0e4082c`；`d68273fa`／`9fd806c0`／`f7eacc11`／`0fec8530`／`ae7d10dc`／`757b58f6`），定向用例 14/14 绿、`build:web` 与 `check:docs` 通过，但 Feature Verification 判 failed：`npm test` 2405 项中 43 项失败（根因是 TODO 1 的快照不变量要求同锚点消息 `order` 连续递增，而共享夹具 `packages/runtime/test/current-fixtures.ts` 一律给 `{afterSequence:0, order:0}`，快照以 `INVALID_GOAL_SNAPSHOT` 拒绝——属 G 自身 TODO 1 域，须在本分支修完）、`npm --prefix apps/goal-server run build` 3 个类型错误（`session-output-approval.integration.test.ts:96` 内联策略返回 `"deny"` 超出 runtime `ToolPolicy` 的 `"allow" | "require_approval"` 契约、`:247` 可能为 undefined；`goal-board-streaming.integration.test.ts:131` 停止原因类型）、5 项既有 Chrome 用例仍断言被替代的旧界面且 `board.test.mjs` mock 缺 `/activity` 与 `?view=state`、显式 Think 未进入 Activity 白名单（与 `spec.md:152` 的"只保留既有获准摘要／已提交输出和详情入口"存在张力）。协调者已复核归因并补齐执行者漏报的第三个类型错误，修复轮已派发；基线文件 `session-output-approval.integration.test.ts` 的修复要求单独成提交以便 cherry-pick 回集成线。
- 2026-10-21（修复轮中断与接手）：G 修复轮因传输超时中断，已落地 `81a4ec16`（Goal 创建路径与共享夹具产出合法的 Run 内位置）、`72009c7c`（收窄集成测试的工具策略取值并修正类型错误，仅含基线引入的 `session-output-approval.integration.test.ts`）、`135715ee`（修正新增集成用例的停止原因类型）。协调者把 `72009c7c` 以 `cherry-pick -x` 落到集成线，生成 `2f295a1b`，集成线的 `npm --prefix apps/goal-server run build` 由此转绿（该基线类型缺陷已闭合）。剩余工作（复核 43 项失败是否已清零、5 项既有 Chrome 用例迁移、显式 Think 可见性、删除诊断脚本、完整 FV 复跑与 `### Latest Result` 更新）由新执行会话接手，工作树内保留上一轮的未提交改动供其核对续做。
- 2026-10-21（G 通过 Feature Verification）：G 修复轮补齐后判定 passed（HEAD `a28116ce`）。43 项失败由 `81a4ec16` 在 TODO 1 域修复（创建路径统一归属创建 Run 并分配连续 `order`，保留快照不变量、未删断言）；5 项既有 Chrome 用例按新契约迁移断言与 mock（`10a976e6`，未删场景）；显式 Think 的获准摘要与详情入口由 `491ed382` 恢复（基线 `1145f823` 曾展示，属可见能力回退；只投影获准目标与已提交输出，私有 Think／Provider reasoning 不入公开 DTO）；goal-server 构建经 `72009c7c`／`135715ee` 转绿。协调者复核：TODO 10/10 勾选、spec 指纹 `8573444d…` 未变、plan.md 相对已批准版本的差异仅在 `### Latest Result` 段。遗留待决：(1) 阶段逐项修订号与 `run_stage_rejected` 问题正文不再单独渲染——spec 未要求（"修订号／修订理由／阶段拒绝"零命中）故非验收违规，但属可见能力缩减，是否补回属产品决策；(2) `.run-stages-container`／`.stage-rejection-feedback` 死规则与 `run-stage-styles.test.ts` 失效断言违反验收标准 8.4，已派专项清理；(3) `packages/runtime/test/git-sandbox-authorization.test.ts` 在一次串行全量中抖动失败（该文件自基线逐字未变，重跑与连续 6 次均通过，判定为 macOS Seatbelt 高负载抖动，非本功能引入）。
- 2026-10-21（合流为六份组合）：G 以 `merge --no-ff` 合入集成线，生成 `d2d75e4d`，**零冲突**（`git merge-tree` 预演干净退出，两侧仅 `apps/goal-server/test/session-output-approval.integration.test.ts` 重叠且内容一致、Git 自动合并）。组合基础已逐支校验：M `9ecb5255`、S `3f8e9457`、H `2cefbb20`、A `f5c8c586`、P `2a2e2321`、G `a28116ce` 均为其祖先；集成自身提交 `4ddb873b`／`23e26b0a`／`1145f823`／`2f295a1b`／`d2d75e4d`。编排者对 G 的独立复核：定向 FV 15/15、goal-server 构建 exit 0、`build:web` 通过、goal-board 151/151、真实 Chrome e2e 12/12、`check:docs`／`check:dependencies`／`diff --check` 通过、scripts 70/70；全量串行首跑 2408/2409（1 项失败）、次跑 2409/2409 全绿。
- 2026-10-21（时序抖动的归因）：两次观测到的单项失败**都发生在另一条测试同时运行期间**——G 执行者那次与协调者在集成线的串行回归（407 文件）并发，协调者首次复核那次与 8.4 清理任务的应用测试／构建并发；单独运行时全量串行 2409/2409 全绿，嫌疑用例 `packages/runtime/test/git-sandbox-authorization.test.ts` 连跑 10/10 通过。故判定为**并发负载下的时序抖动**，非功能缺陷；最终全量回归改由协调者在空闲机器、且清理提交合入后统一执行。
- 2026-10-21（最终集成验证启动）：在六份组合 `d2d75e4d` 上执行编排「跨 Spec 集成验证」的 8 个场景（真实增量到正式答复、Queue／Steer／Interrupt 竞争、问答与宿主竞争、修订授权与直接工具与 PTC、过程正文与原生历史、保存不明与断线与末次通知丢失、长 Run 历史与阅读、隐私与生命周期及既有入口），要求正式装配、隔离文件数据、真实 HTTP／SSE 与 Chrome，实际 Adapter 加确定性本地协议来源，不得伪造最终 Session DTO；全量回归不在该轮跑，留给协调者在清理合入后的空闲窗口统一执行。
- 2026-10-21（8.4 残留清理）：协调者亲自完成（两次派发的 subagent 均死于传输层 `ECONNRESET`／`ECONNRESET`，未落地任何改动）。以基线 `1145f823` 为界做死规则归因：G 造成的零引用类共 33 个（`activity-group*`／`activity-member*`／`tool-event*`／`run-stages-container`／`run-stage-*`／`stage-*`／`run-send-options`／`run-steps*`／`failure-card*`／`terminal-status`／`step-status`／`step-recovery`／`history-expand`／`run-spinner`／`trajectory-link` 等），G 之前已死的历史遗留仅 8 个（`action-details-toggle`／`amber`／`failure-guidance-actions`／`mode-badge`／`settings-empty`／`tool-event`／`tool-event-detail`／`topbar-brand`），后者不在本组范围。移除规则 63 条（style.css 53／workspace.css 10，含随之变空的 `@media` 块），`run-stage-styles.test.ts` 的失效断言迁移为对现行 Plan 路线与时间线选择器（`.plan-route-stage*`／`.plan-route-status*`／`.timeline-stage-target`／`.timeline-run-boundary`／`.timeline-activity*`／`.timeline-terminal*`）的断言。提交 `8fcc1d44`，以 `1fa10d6d` 合入集成线。验证：样式测试 3/3、goal-board 应用测试 151/151、`build:web` 通过、`diff --check` 通过。
- 2026-10-21（跨 Spec 场景覆盖核实）：场景 6「保存不明、断线与末次通知丢失」不需新写集成测试——既有入口已覆盖：`packages/runtime/test/session-output-recovery.test.ts`（末次通知丢失且无新事件时只读核对仍发现已提交消息、多客户端同身份同顺序且快速后继 Run 不覆盖当前 Run、重建订阅不重放旧候选）、`packages/browser/test/browser-stream.test.ts`（末次提交通知丢失后仍以权威读取结算等待）、`packages/runtime/test/session-stream.test.ts`（丢末次通知由合并修订核对在一秒内结算）、`apps/goal-server/test/runtime-recovery.integration.test.ts`（重建后恢复同一 Run、终态后显式 continue 归档并创建后继 Run、结果未知不被盲重试）。场景 5 的"只进入请求一次"由 `packages/model-request/test/process-message-dedup.test.ts` 与 `packages/model-context/test/native-model-history.test.ts`（去重前后输入计量降低且内容摘要相同）覆盖。
- 2026-10-21（dev 合入候选就绪）：按 M → S → H → A → P → G 串行在隔离工作树 `.worktrees/dev-integration`（新分支 `codex/dev-integration`）完成合入候选，全程不触碰 dev 引用与主工作区未提交修改。逐层包含关系已核对：M→`9cd354a0`、S→`38483309`、H→`9d2dfaf6`、A→`dc265176`、P→`c0854d0d`、G→`63547a27`；A×P 的 3 处冲突（`packages/browser/src/browser-session-port.ts`、`packages/runtime/src/index.ts`、`packages/web-contracts/src/index.ts`）直接采用集成线已验证解算，与集成执行者当初的人工解算一致；G 层无冲突。**候选树与已验证的六份组合树逐字节一致**（`git diff codex/integration-streaming HEAD` 差异文件数 0），故集成线的验证证据直接适用于候选。落地路径已验证：主工作区 `packages/runtime/src/goal-model-selection-coordinator.ts` 的用户未提交改动（`profileId` 透传，1 行）在候选树上 `git apply --check` 干净通过（偏移 2 行），即用户先提交自有改动再合入候选不会冲突；该文件被 S 的 `94cb70e1` 触及（模型切换纳入变更闸门并经 `saveGoalWithSessionState` 保存），属同文件不同 hunk。
- 2026-10-21（最终跨 Spec 集成验证通过）：在六份组合 `codex/integration-streaming` 的 `1fa10d6d` 上顺序执行 11 步验证，完整日志 31014 行未截断，全部通过：`npx tsc --noEmit` exit 0；`npm --prefix apps/goal-server run build` exit 0；`npm run build:web` exit 0；`npm run check:docs` exit 0（45 模块／161 份当前说明）；`npm run check:dependencies` exit 0（274 个源文件）；`apps/goal-server/test` 全部集成测试 56/56；`node --test --test-concurrency=1 apps/goal-board/e2e/*.test.mjs` 真实 Chrome 12/12；全量串行回归 2409/2409；scripts 70/70；仓库标准并行 `npm test` 2409/2409 + 70/70（本轮无抖动）；`git diff --check` exit 0。dev 合入候选 `codex/dev-integration` 的树与本次验证的组合树逐字节一致，故同一份证据适用于候选。
- 2026-10-21（八场景证据对应，current）：组合基础 = M `9ecb5255`、S `3f8e9457`、H `2cefbb20`、A `f5c8c586`、P `2a2e2321`、G `a28116ce`（含清理 `8fcc1d44`），集成提交 `4ddb873b`／`23e26b0a`／`1145f823`／`2f295a1b`／`1fa10d6d`。①真实增量到正式答复＝`model-output-streaming.integration.test.ts`＋`session-output.integration.test.ts`＋`goal-board-streaming.integration.test.ts`＋e2e `session-output.test.mjs`／`goal-board-streaming.test.mjs`；②Queue／Steer／Interrupt 竞争＝e2e `streaming-session.test.mjs`＋`run-input-control.test.mjs`＋`human-interaction.test.mjs`；③问答与宿主／真人竞争＝e2e `human-interaction.test.mjs`＋`runtime-composition.integration.test.ts`；④修订授权、直接工具与 PTC＝`action-approval-revision.integration.test.ts`＋`session-output-approval.integration.test.ts`＋e2e `action-approval-revision.test.mjs`／`run-stages.test.mjs`；⑤过程正文与原生历史＝`process-message-dedup.test.ts`＋`native-model-history.test.ts`；⑥保存不明、断线与末次通知丢失＝`session-output-recovery.test.ts`＋`browser-stream.test.ts`＋`session-stream.test.ts`＋`runtime-recovery.integration.test.ts`；⑦长 Run 历史与阅读＝`activity-page-window.test.ts`＋`session-timeline.test.ts`＋e2e `goal-board-streaming.test.mjs`；⑧隐私、生命周期及既有入口＝`browser-session.integration.test.ts`＋`process-lifecycle.integration.test.ts`＋e2e 全套与最终构建。全部证据 current（在同一组合树上实跑）；未新增场景专属测试。
- 2026-10-19：编排材料性修订（并行默认调度、A ∥ P、独立集成工作树、分支与合流更新）获用户重新批准；自本时点起按新调度接纳后续 Spec。
- 2026-10-21（用户决策与 dev 合入）：用户批准合入 dev，并接受两处现状——`23e26b0a` 对浏览器 wire 身份字符集的最小放宽（承载 PTC 子操作身份「父程序:序号」，缺陷在 A 分支已存在）与当前呈现（G 用时间线替换旧分区渲染后，阶段逐项修订号、`run_stage_rejected` 正文、Run 失败原因 `terminalDetail.code`／`message` 与指引文案不再单独渲染；Spec 未要求，非验收违规）。落地：用户主工作区 6 处自有修改（OpenCode Go 未知模型标记不可选、`profileId` 透传）经其测试与根类型检查后作为两个独立提交 `5253650b`／`6b032338` 先行落地；六份 Spec 目录的未跟踪副本先备份再让位给合流带入的权威版本（`spec.md` 逐字节相同，`plan.md` 差异仅为 TODO 勾选与验收记录）；`git merge --no-ff codex/dev-integration` 生成 `81bbbb6d`，**零冲突**。合入后核对：dev 树与已验证组合的差异只剩用户自己的 6 个文件；六个 Spec 的 12 份 spec/plan 文件转为受跟踪；集成线的实质提交 `4ddb873b`／`23e26b0a`／`1145f823`／`8fcc1d44`／`72009c7c` 全部是 dev 的祖先（未进 dev 的 3 个只是合并形态提交）。
- 2026-10-21（dev 合入后验证）：在 `81bbbb6d` 上顺序执行全部检查：根 `tsc` 0；`apps/goal-server` build 0；`build:web` 0；`check:docs` 0（45 模块／161 份）；`check:dependencies` 0（274 源文件）；`apps/goal-server/test` 集成测试 56/56；真实 Chrome e2e 12/12；全量串行 2410/2410；仓库标准并行 `npm test` 2410/2410 + 70/70；`git diff --check` 0。该轮 e2e 出现一次 10/12、并行回归出现一次单项失败，二者复跑均绿（`packages/runtime/test/git-sandbox-authorization.test.ts` 隔离 10/10 通过），判定为并发负载下的 Seatbelt 时序抖动，与本组改动无关；e2e 单独重跑 12/12、并行 `npm test` 单独重跑 2410/2410 + 70/70 exit 0。
- 2026-10-21（Goal 列表对不可读快照的容错修复）：用户在看板遇到整页错误 `goal_list_unavailable`。归因：`listHistory` 扫描正式快照时遇第一份无法解码的旧版本快照即整体拒绝（Snapshot 按 P 验收标准 8.4 原位更新、不做旧数据迁移，旧消息缺 `messageId`／`runId`／`position`／`source`），路由把该拒绝统一转成 500；实测当前工作区重写前的旧快照在合流前基线 codec 可读、当前 codec 不可读，与症状一致。修复：新增端口类型 `GoalCatalogScan`（`entries` + `unreadableCount`），`listHistory` 跳过不可解码快照并计数上报，`listResumable` 保持失败关闭，`restore` 语义不变；wire 新增 `BrowserGoalList` 与严格守卫；`GET /api/goals` 返回 200 与计数，只有目录级失败仍 500；看板显示说明条并将空态文案改为"No readable saved Goals"。提交 `3650cea3`／`2b7515d0`，`46ec99c6` 合入 dev。验证：根 tsc 0、goal-server tsc 0、`build:web` 0、`check:docs` 0、`check:dependencies` 0、集成 57/57、真实 Chrome e2e 12/12、全量串行 2415/2415、并行 `npm test` 2415/2415 + 70/70（exit 0；唯一一次失败为上述 Seatbelt 抖动，隔离 2/2 通过）。真实数据实测：导致症状的那份旧快照在修复后返回 HTTP 200 与 `unreadableCount=1`；851 份旧快照（844 个工作区副本）目录级失败 0。
- 2026-10-21（Spec 交付状态与 Memory 沉淀门）：六份 Spec frontmatter 更新为 `status: delivered` + `delivered_at: 2026-10-21`（`d495f8cd`），满足沉淀前置条件。Memory 门：向用户汇总候选与既有 Capsule 的重叠审查（6 篇新增 + 2 篇维护，含 `goal-board-architecture-refactor` 的客户端单飞锁与 `goal-board-backend-validation` 的 Activity 列表／审批表单位置等实证漂移），用户批准按预览写入。写入内容：新增 6 篇 Capsule、维护 2 篇既有 Capsule 的漂移命题，并修复 `goal-board-backend-validation` 指向已被 `531c0af0` 删除的 `packages/browser/test/browser-commands.test.ts` 的悬空来源（改指继任文件 `browser-session-inputs.test.ts`；该悬空引用此前使 dev 上 `npm run memory:check` 失败，CI 不执行该检查故未影响流水线）。索引由 `npm run memory:index` 重建（新增 6 行 + 2 行 Reviewed 变化），`memory:check` 通过（67 个 Capsule），`test:memory` 15/15；提交 `0c4efe25`。

- [x] 编排已获用户批准
- [x] 各 Spec Feature Verification 全部 passed
- [x] 跨 Spec Integration Verification passed
- [x] Memory 沉淀门完成（需要的写入已获批准并完成，或用户明确确认无需沉淀）
- [x] 用户确认最终交付
- [x] 已删除 orchestration.md

各 Spec 和共同集成均通过后，主动汇总实现中收集的 Memory 候选，询问用户保留范围；需写入的内容再交 distill-feature 准备完整 Capsule／索引预览并获得明确批准，或由用户明确确认无需沉淀。本阶段不写 Memory，也不把已有 Spec 批准当作沉淀授权。

只有整组执行、验证、审核合入、Memory 门及最终用户确认均完成后，才删除本临时 orchestration.md；保留所有 Spec、Plan 和验收证据，不因一份 Spec 完成而提前清理编排。后续执行只更新本轮真实状态，不继承旧组的完成标记。

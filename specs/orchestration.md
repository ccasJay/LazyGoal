# 多 Spec 编排

## 编排目标

将生产数据契约逐步迁移到 TS 类型、Catalog 生成制品和真实边界读取，完成全部真实消费者迁移并联合验收后删除旧 Contract AST；数据职责与执行职责保持分离。

## 涉及的 Spec

共同基线：`dev` 上包含七份已批准 Spec/计划与本编排的批准基线提交（父提交 `0bee171be597654807241569c919ea1bdc01ba4c`）。实际派发基线固定为 `e39263770f92a729bf4fa83ab8917a0b23fc0bcb`；各分支从该提交独立创建，仅在有真实实现依赖时使用堆叠分支。

| Spec | 路径 | 批准状态 | 执行者 / 分支 / worktree | 进度与证据 |
|---|---|---|---|---|
| [TS 契约生成能力](../ts-contract-generation-capabilities/spec.md) | `specs/ts-contract-generation-capabilities/` | 已批准（2026-10-31 用户确认） | 执行者 A / `feat/ts-contract-generation-capabilities` / `.worktrees/ts-contract-generation-capabilities` | 独立完成（验证提交 `813c6b87`，分支 HEAD `ddd8d6bb` 仅计划记录；等待集成） |
| [工具输入契约迁移](../ts-tool-input-migration/spec.md) | `specs/ts-tool-input-migration/` | 已批准（2026-10-31 用户确认） | 执行者 B / `feat/ts-tool-input-migration` / `.worktrees/ts-tool-input-migration` | 联合切换完成（HEAD `a716a723`；TODO 3 已勾选；集成等价套件通过；完整 `npm test` 因外部 GEPA 阻塞，状态 blocked） |
| [模型数据契约迁移](../ts-model-contract-migration/spec.md) | `specs/ts-model-contract-migration/` | 已批准（2026-10-31 用户确认） | 执行者 C / `feat/ts-model-contract-migration` / `.worktrees/ts-model-contract-migration` | 联合切换完成（HEAD `e424d86a`；TODO 3 已勾选；集成等价套件通过；完整 `npm test` 因外部 GEPA 阻塞，状态 blocked） |
| [Web 数据契约迁移](../ts-web-contract-migration/spec.md) | `specs/ts-web-contract-migration/` | 已批准（2026-10-31 用户确认） | 执行者 D / `feat/ts-web-contract-migration` / `.worktrees/ts-web-contract-migration` | 独立完成（HEAD `53867a1e`；passed/current；已合入集成分支；含两个 Provider 小 Spec；3 项既有 Chrome E2E 失败已复现为基线问题） |
| [Storage 数据契约迁移](../ts-storage-contract-migration/spec.md) | `specs/ts-storage-contract-migration/` | 已批准（2026-10-31 用户确认） | 执行者 E / `feat/ts-storage-contract-migration` / `.worktrees/ts-storage-contract-migration` | 独立完成（HEAD `ffcc8a6b`；passed/current）；已合入集成分支；AgentProfile 小 Spec 已另行完成；嵌套 ContextLookupResult 仍待删除 AST 前复核 |
| [其他数据边界契约迁移](../ts-other-boundaries-migration/spec.md) | `specs/ts-other-boundaries-migration/` | 已批准（2026-10-31 用户确认） | 执行者 F / `feat/ts-other-boundaries-migration` / `.worktrees/ts-other-boundaries-migration` | 独立完成（HEAD `8f930aa3`；passed/current；本线无 Contract AST 消费者）；已合入集成分支 |
| [AgentProfile 文件契约迁移](../ts-agent-profile-file-contract/spec.md) | `specs/ts-agent-profile-file-contract/` | 已批准（2026-10-31 用户确认纳入编排） | 执行者 G / `feat/ts-agent-profile-file-contract` / `.worktrees/ts-agent-profile-file-contract` | 独立完成（HEAD `aab67b03`；passed/current；完整 `npm test` 通过）；已合入集成分支 |
| [在线模型查询输入迁移](../ts-provider-model-query-contract/spec.md) | `specs/ts-provider-model-query-contract/` | 已批准（2026-10-31 用户确认纳入编排） | 执行者 H（由 Web 线执行）/ `feat/ts-web-contract-migration` | 已由 Web 线实现并记录（TODO 1 已勾选，Latest Result passed/current）；随 Web 合入集成分支 |
| [Provider 连接测试结果迁移](../ts-provider-profile-test-contract/spec.md) | `specs/ts-provider-profile-test-contract/` | 已批准（2026-10-31 用户确认纳入编排） | 执行者 I（由 Web 线执行）/ `feat/ts-web-contract-migration` | 已由 Web 线实现并记录（TODO 1 已勾选，Latest Result passed/current）；随 Web 合入集成分支 |
| [删除旧 Contract AST](../remove-legacy-contract-ast/spec.md) | `specs/remove-legacy-contract-ast/` | 已批准（2026-10-31 用户确认） | 执行者 J / `feat/remove-legacy-contract-ast` / `.worktrees/remove-legacy-contract-ast` | 独立完成（HEAD `0f405a62`；passed/current；已合并 `dev` `7fd0c8ff`；Spec 已标记 delivered `5acaa025`；worktree 已移除） |

## 依赖关系与执行顺序

- 生成能力线独立执行，产出经 Feature Verification 验证并固定的生成器、绑定和模型投影提交。七方向与三个小 Spec 需要新生成能力的部分，以该固定提交及当前验证为就绪条件。
- 工具线与模型线不设置循环的先完成依赖：各自先完成可独立准备的类型、绑定和局部替身验证；随后由协调者从双方固定提交建立集成 worktree，完成全部工具与 system tools 的统一切换和联合验证。联合验证完成前，任一分支不得作为独立生产切换合入。
- 生成能力线的固定验证提交为 `813c6b8793c352919bab1e6f9120b6b6e16d5ec6`，提供联合/判别联合、递归、开放 JSON、数组元素、`@asType integer`、`@minItems`/`@maxItems` 与模型投影。工具线和模型线均已堆叠到该提交。
- 模型线第 36 个根 `ToolCallAgentDecision` 采用封闭的 `ToolCallDecisionEnvelope` 加工具绑定动态组合，`action.input` 由实际工具绑定校验；该设计记录在模型线 `pending-generation.md`，集成时必须验证动态组合和未知字段诊断。
- 工具线完整 `npm test` 在外部 GEPA LLM 429 处阻塞，等价过滤套件 2573/2573 通过；模型线完整 `npm test` 最终通过。并行 worktree 的 GEPA/构建资源竞争使这些证据不能直接作为联合验收，集成阶段必须在隔离环境重跑。
- Storage 线在 `36515714` 上完成并通过 Feature Verification，集成时已升级到生成能力线最终固定提交 `813c6b87` 并重跑受影响检查；AgentProfile 文件已由独立小 Spec `aab67b03` 完成。Retrieval Index Sidecar 的嵌套 `ContextLookupResult` 仍由旧 AST 推导，需在删除 AST 前复核归属。
- 协调者已建立 `feat/contract-migration-integration` 集成分支，当前 HEAD `f2f90e6a`，已合入生成能力线 `813c6b87`、Storage `ffcc8a6b`、工具链与模型线联合切换 `d2a8b118`、Web 线 `53867a1e`、AgentProfile `aab67b03`、其他边界 `8f930aa3`。Catalog 按 key 合并为 1071 条登记、134 个启用项、402 个删除项；生成检查、Catalog 测试、类型检查通过。
- 跨 Spec Integration Verification 已在集成分支通过（测试代码提交 `ff11f027`，当前 HEAD `f2f90e6a` 仅多一条计划记录）：完整 `npm test` 通过（TypeScript 2736/2736、scripts 98/98、GEPA adapter 通过）；定向跨 Spec 测试 70/70；相关 Chrome E2E 5/5；`npm run build:web`、`check:dependencies`（578 个源文件）、`check:docs`（47 个模块、170 份说明）、`git diff --check` 通过。
- 2026-10-31 用户批准合并；集成分支 `f2f90e6a` 已合并到 `dev`（merge `788d4c19`）。生成能力、工具、模型、Web、Storage、其他边界与三个小 Spec 共九个 Spec 已标记 `delivered`（`80110d57`），已完成方向的 worktree 已移除。删除 AST 在 `80110d57` 上独立执行；所有工作收尾前保留 `specs/orchestration.md`。
- Web 线同时完成两个 Provider 小 Spec，并已更新其 plan TODO 与 Latest Result；完整原计划中的 Web 契约族全部迁移，旧 Web AST 已删除。完整 Chrome E2E 有 3 项既有 UI/布局失败，已在基线复现或单独复跑通过，不作为本方向回归。
- AgentProfile 小 Spec 已独立完成，完整 `npm test` 通过；Storage 的 AgentProfile 文件族现有真实生成绑定与严格 `reject` 读取。
- 其他边界线在 `8f930aa3` 上完成并通过 Feature Verification：其自有边界未发现 Contract AST 消费者，ACP/Mux/Tool RPC/LLM RPC/Sidecar/Bench Metadata/Process/Runtime admission 均为手写 TS 或外部 SDK 契约；Runtime 决策、Program 工具输入、Worker 工具声明和模型投影中的 AST 引用分别归模型线与工具线。合并后需复核该归属清单仍成立。
- Web、Storage 和其他边界线按各自真实依赖独立推进。只使用现有生成能力即可完成的部分不等待生成能力线整体完成；确需新能力时，从生成能力线的固定已验证提交建立堆叠分支，并记录上游依赖和验证新鲜度。
- 删除 AST 是最后阶段：只有七方向与三个小 Spec 的真实消费者迁移、跨 Spec 联合验收和交付证据齐全，且固定实际基线后，才派发删除执行者。仍存在必要 AST 消费者时停止删除并报告。
- AgentProfile、Provider 查询输入和 Provider 测试结果三个小 Spec 已纳入本编排，但各自保持已批准范围与验收：AgentProfile 只迁移单个 Storage 文件；Provider 两个小 Spec 只迁移各自输入/结果，不改变已批准字段和行为。涉及其接入方案的实质变化回到相应 Spec 处理。

## 可并行执行的部分

- 规划并发上限为三个执行者 subagent，另由主 agent 担任协调者。当前 `subagent` 执行能力可用，按三个并发派发；实际容量不足时降低上限并记录真实调度，不宣称并发执行。
- 首批派发生成能力、工具准备和模型准备。容量释放后立即补位 Web、Storage、其他边界或三个小 Spec，不等待整批完成；删除 AST 在依赖满足前不占用并发名额。
- 每个方向使用独立 worktree、测试目录、端口和进程资源。共享文件本身不构成整线串行理由。
- 执行者达到用户审核门禁或阻塞时释放容量；阻塞或待审核不得占用无关就绪方向的并发名额。

## 分支与合并策略

- 各方向从共同基线创建独立分支和 worktree。共同基线已包含本方向已批准的 `spec.md`、`plan.md`；执行者以该基线锚定批准内容，按 TODO 逐项提交并运行 Feature Verification。
- 协调者独占 `feat/contract-migration-integration` 分支及 `.worktrees/contract-migration-integration` worktree，用于汇集固定提交、解决共享文件冲突、重新生成制品和运行跨 Spec 验证。执行者不得自行切换主检出、合并到 `dev`、修改本文件或删除 worktree。
- 合入顺序按依赖串行：生成能力优先；Web、Storage 和其他边界在各自当前验证及审核批准后合入；AgentProfile 在 Storage 完整验收前合入，Provider 查询输入与测试结果在 Web 完整验收前合入；工具与模型作为经过联合验证的共同切换交付，以原子集成候选申请审核和合入；删除 AST 最后合入。
- 若实际 Git 合并方式无法保证工具与模型的原子切换，先形成包含双方及所需生成能力的单一可审阅集成候选，再申请合并批准。
- 每次合入前均需覆盖具名分支和固定提交的显式审核及合并批准；编排批准不代替合并批准。分支、相关基线或集成解决发生变化后，重新运行受影响验证并刷新审核依据。

## 跨 Spec 协调约束

- 职责归属：生成能力线拥有生成器、`contract-binding` 和通用投影；工具线拥有工具输入、注册与准备；模型线拥有动态输出、模型 wire 和 system tools；Web 线拥有 HTTP/SSE DTO 与浏览器消费者；Storage 线拥有文件表示、Codec 和文件级不变量；其他边界线只拥有剩余 Runtime、Worker、跨进程和外部适配边界。
- 共享文件：Catalog、生成器、公共导出和模块说明允许各分支并行修改，由协调者在集成 worktree 统一解决冲突并重新生成制品；共享文件冲突不作为整线串行依据。
- 未知字段策略按各自 Spec 执行：工具、模型和 Web 在已确认范围内剥离并产生有界安全诊断；AgentProfile 等严格边界继续拒绝。不得在编排中把两者合并为统一策略。
- 工具与模型不得在生产中按工具混用新旧绑定，不得为同一输入双读或在新读取失败后回退旧 AST。删除 AST 不接受兼容包装、双实现或隐藏回退。
- 出现需求、接口、架构、行为或验收范围冲突时，先回到对应 `spec.md` 或 `plan.md` 修订并按该 Spec 的批准门禁处理；不得在本文件中暗设新行为。
- 执行者向协调者报告分支、worktree、基线、实际提交、Feature Verification 状态、未解决问题和审核状态；只执行本方向已批准计划，不扩大范围。

## 跨 Spec 集成验证

在独立集成 worktree 中固定所有参与提交，使用真实生成器、绑定和实际进程运行以下检查；局部替身结果不作为集成通过证据。

| 场景 | 预期结果 | 检查方式 |
|---|---|---|
| Catalog 与生成一致性 | 所有启用项可确定复现，登记、生成和只读检查一致，无漂移 | `npm run contracts:generate -- --check`、生成定向测试、Catalog 对照 |
| 模型 → 授权工具 → Runtime | 实际 system tools 与业务工具同源；空集合、重复身份、未知/未授权工具及非法阶段按原规则处理；strict 与 prompt-only 均可解码 | 真实模型工厂、请求/解码和 Runtime 集成测试 |
| Web 真实边界 | HTTP、SSE 与浏览器消费者使用新契约；联合、开放 JSON、鉴权、大小、UTF-16、敏感键和取消语义保持；Provider 模型查询输入与连接测试结果按两个小 Spec 的验收通过 | 真实服务路由、SSE、相关 Chrome E2E，Provider 定向测试 |
| Storage 写入与恢复 | 合法文件往返；Snapshot 编解码、审批等待、重启恢复、原子写入及损坏/版本/身份错误符合原边界；AgentProfile 严格拒绝未知字段并保留稳定错误 | 真实文件与 Runtime 恢复测试，AgentProfile 定向测试 |
| Worker 与跨进程 | 合法输入、非法输入、身份不匹配、取消和恢复沿用原边界行为 | 真实进程或 Worker 集成测试 |
| 全量回归与交付检查 | 生产生成制品、构建、文档、依赖和完整回归通过 | `npm test`、`npm run build:web`、`npm run check:docs`、`npm run check:dependencies`、`git diff --check` |

记录集成基线、各分支固定提交、实际命令与结果、验证时间和新鲜度。任一依赖合入或集成解决变化后，重跑受影响检查。

## 生命周期状态

- [x] 编排已获用户批准
- [x] 各 Spec Feature Verification 全部 passed
- [x] 跨 Spec Integration Verification passed/current
- [ ] 各分支已获审核及合并批准，统一合并与交付收尾完成
- [ ] Memory 沉淀门完成（需要的写入已获批准并完成，或用户明确确认无需沉淀）
- [ ] 用户确认最终交付
- [ ] 已删除 orchestration.md

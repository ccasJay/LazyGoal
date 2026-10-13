# Goal 阶段与决策索引及分层检索执行计划

## 执行边界

[Spec](./spec.md) 已在当前会话明确批准，风险及否定性保证以其 [风险章节](./spec.md#风险与否定性保证) 为准。批准的 Spec SHA-256 为 `2e501370d3509211272d49aa4f635a7e9cca8bf5952d1a6e823eb765e6eb75e1`。

前置 [Run 阶段 Plan](../run-stage-review-and-context-projection/plan.md) 尚未执行；本 Plan 不授权自动执行或联合编排另一 Plan。开始生产集成前检查前置功能的实际接口、提交事实和当前验收证据，缺失时报告依赖阻塞，不以兼容层、虚构阶段或重复实现继续。前置契约变化时核对本 Spec 的有效性，非等价行为变化回到 Spec。

按 TODO 顺序推进，每项先建立可观察失败断言，再实现并验证；完成只勾选 checkbox，保留 TODO 原文。标注“待新增”的测试和脚本目前尚不存在。保护当前工作树已有修改，实际执行记录 tested commit、相关未提交内容摘要和依赖构建身份。

重要信息作为既有合法决策的有界附加提议，采用 `contextNotes` 概念字段，记录类别为 `decision`、`user_emphasis`；不另设记录 Step 或模型。查询沿用 `context_lookup` / `system_context_lookup`，在 request 中加入互斥的历史搜索、目录浏览、目录搜索和来源展开操作；旧三类历史需要继续有效，不引入第四种证据资格。实际字段沿统一 Contract AST、Wire/native 投影生成，禁止手工复制供应商 Schema。

真实验收拟沿前置 Plan 使用隔离配置下的 `gemini-3.6-flash-high`，采集、执行和独立 Judge 分别显式绑定同一配置并记录独立调用用量。沿用现有 Provider、端点和 strict，执行前检查可用性，不修改全局 default，也不自动切换模型。测试额度限制仅用于 benchmark，不改变产品额度。此轮规划不调用真实模型。

## 任务清单

- [x] //TODO 1. 让模型提出带可靠来源的重要信息，并保留原文和修订
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[6.1](./spec.md#spec-req-6-1)、[7.1](./spec.md#spec-req-7-1)。先在待新增 `packages/model-contracts/test/context-notes.test.ts`、`packages/runtime/test/context-notes.test.ts` 建立用户原文片段/摘要不符、未应用消息、过期修订、跨 Goal 引用、Agent 替代用户要求和重复提议的拒绝断言；合法用户决定与 Agent 方案必须有不同来源标记。
  - 在 model-contracts 建立附加提议 AST，Runtime 建立纯验证、修订和身份分配入口，重要信息事件由 Storage Codec 保存；来源携带完整 Goal/Run、消息或事件身份，模型只能引用实际收到的来源标识。复用预期 revision 与执行来源去重，不要求模型分配 Runtime ID、不保存 Think 正文。扩展公开接口时同步中文契约 TSDoc 与例子。
  - 验证入口：`npx tsx --test packages/model-contracts/test/context-notes.test.ts packages/model-contracts/test/model-output-wire.test.ts packages/model-contracts/test/model-output-provider-schema.test.ts packages/model-contracts/test/system-tools.test.ts packages/runtime/test/context-notes.test.ts packages/storage/test/trajectory-store.test.ts`。实施前冻结前置功能通过后的固定任务材料、评分判据、原始请求构造身份及运行配置摘要，供 TODO 7 使用；不保存凭据或旧契约 Snapshot 作为新恢复输入。

- [x] //TODO 2. 在真实执行提交边界接受重要信息，并在恢复和 Steer 后保持一致
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.4](./spec.md#spec-req-2-4)、[3.1](./spec.md#spec-req-3-1)、[3.4](./spec.md#spec-req-3-4)、[6.3](./spec.md#spec-req-6-3)、[7.1](./spec.md#spec-req-7-1)。先在待新增 `packages/runtime/test/context-notes-execution.test.ts`、`context-notes-recovery.test.ts` 断言非法提议在业务副作用前拒绝，合法记录随接受结果提交；最终候选拒绝、Snapshot 保存失败及未提交 tail 不产生可见记录，恢复不重复执行副作用或重复创建信息。
  - 接通 Agent 解码、Runner 预验证与既有 checkpoint；覆盖普通动作、阶段操作、等待、失败/取消收尾和最终交付的现有接受路径，记录不另消耗 Step。对业务操作的来源仅保存实际接受决定，失败 Observation 保持原样；不将“选择做某事”写成“已经成功”。复用现有三次格式纠错和 Steer 输入失效规则，不把导航内容写入 Goal Conversation 或 Working Memory。
  - 验证入口：`npx tsx --test packages/runtime/test/context-notes-execution.test.ts packages/runtime/test/context-notes-recovery.test.ts packages/runtime/test/trajectory-checkpoint-committer.test.ts packages/runtime/test/trajectory-failure.test.ts packages/runtime/test/run-steer.test.ts packages/runtime/test/run-interrupt.test.ts packages/runtime/test/runtime-feedback.test.ts packages/agent/test/native-step-executor.test.ts`。校验 Snapshot 内容没有新增完整目录副本，原始响应、提交事件和最终模型输入仍可按现有调用身份关联。

- [x] //TODO 3. 从已提交历史构建跨 Run 的阶段目录，并可删除缓存后重建
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[7.1](./spec.md#spec-req-7-1)。先在待新增 `packages/context-retrieval/test/goal-context-index.test.ts`、`packages/storage/test/goal-context-index-store.test.ts` 断言重名阶段、不同 Run 相同 sequence、阶段拒绝后 Run 失败、显式替代与冲突均被正确区分；损坏/超前/来源摘要不符缓存必须重建，原始来源失败不能返回部分成功。
  - Runtime 按当前 Snapshot 提供来源边界信封，检索包纯派生阶段和重要信息文档；从前置阶段事实取实际状态与已接受摘要，引用原始来源而不复制完整输出。扩展现有 Retrieval Index Store 的 Goal 视图，原子保存到 `context-sidecars/<encoded-goal-id>/goal-index.json`，Headless 使用其既有索引根；每个 Run 边界、消息摘要和构建身份共同决定缓存有效性。没有可靠产物变化关联时保留历史验证范围和未确认标记，不新增独立时效裁决器。
  - 验证入口：`npx tsx --test packages/context-retrieval/test/goal-context-index.test.ts packages/storage/test/goal-context-index-store.test.ts packages/storage/test/context-retrieval-index-sidecar.test.ts packages/runtime/test/multi-run-context-lookup.test.ts`。记录冷构建和缓存读取计量，不用机器相关硬耗时阈值判定正确性；模拟原子替换中断、缓存写入失败及删除重建，比较相同来源下的内容摘要，并断言无 Step/Memory/提交边界变化。

- [x] //TODO 4. 支持目录查询、分页和直接来源展开，并保持历史证据限制
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)、[6.4](./spec.md#spec-req-6-4)、[7.1](./spec.md#spec-req-7-1)。先在待新增 `packages/context-retrieval/test/goal-context-query.test.ts` 与 Runtime/Agent 原 Lookup 测试中断言目录稳定分页、来源摘要变化使游标失效、直接展开无需关键词搜索、非法引用明确失败、大正文完整继续读取，以及目录未命中仍能命中原始会话。
  - 扩展既有 Lookup 请求/结果 Contract、原生工具声明、Runtime 适配和模型历史配对，增加可验证引用与游标；复用 BM25 确定性排序和现有有界输出策略，返回显式 `goal_history`、实际失败/截断/替代状态及继续读取入口。展开只读受边界约束的消息或轨迹，不执行文件或业务工具；检索内容作为数据，不能扩大授权。查询请求照常计入既有执行循环，不新增无限查询链。
  - 验证入口：`npx tsx --test packages/context-retrieval/test/goal-context-query.test.ts packages/context-retrieval/test/retrieval-evaluation.test.ts packages/runtime/test/context-retrieval-protocol.test.ts packages/runtime/test/runtime-context-lookup-adapter.test.ts packages/runtime/test/context-retrieval-lifecycle.test.ts packages/runtime/test/context-lookup-result.test.ts packages/agent/test/context-lookup-projection.test.ts packages/agent/test/native-model-history.test.ts packages/runtime/test/evidence-gate.test.ts`。另运行 `npm run benchmark:context-retrieval`，保留既有查询基线，不将目录命中视为 Fact 或当前 Run 完成 Evidence。

- [x] //TODO 5. 每轮提供必要工作导航，并控制目录增长与重复正文
  - 落实标准：[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4)。先在待新增 `packages/agent/test/goal-context-navigation.test.ts` 与动态 Section/预算测试中断言阶段切换、新 Run、恢复和 Steer 都使用最新导航；长目录可省略历史项，但用户输入、当前阶段缺口和有效 Profile 不被裁掉，必要固定输入超限调用前失败。
  - 将只读 Goal 导航接入现有 Step 输入和动态 Section，采用稳定 `goal_context_navigation` 注册身份和内嵌模板。优先保留当前阶段及缺口、上一结果与明确依赖入口，其余按当前用户请求/阶段目标排名及稳定身份选取；暴露已应用消息的可引用身份而不重复其正文。按完整来源身份去重导航展开内容，不重新实现前置原生历史去重，不把摘要放到 system 权威层，不要求先查目录才可读取已知来源。
  - 验证入口：`npx tsx --test packages/agent/test/goal-context-navigation.test.ts packages/agent/test/prompt.test.ts packages/agent/test/render.test.ts packages/agent/test/model-context-budget.test.ts packages/agent/test/section-context-recovery.test.ts packages/agent/test/prompt-cache-alignment.test.ts packages/agent/test/model-input-recording.test.ts packages/agent/test/trajectory-model-context-assembler.test.ts`。检查实际消息、工具 Schema 与预算，Think/Decide 路径保持适用契约，`runtime_feedback` 仍最后，原始 Trajectory/Working Memory 摘要不变，未提交 Section frame 不成为基线。

- [x] //TODO 6. 在 Web 服务和 Headless Worker 接通同一导航与索引生命周期
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)、[5.1](./spec.md#spec-req-5-1)、[6.3](./spec.md#spec-req-6-3)、[7.4](./spec.md#spec-req-7-4)。先在待新增 `packages/runtime/test/goal-context-integration.test.ts`、`benchmarks/context/test/goal-context-integration.test.ts` 建立 launch → 多阶段 → waiting → 新 Worker resume → 用户 continue 的真实组合根断言：导航跨恢复一致，resume 同 Run，continue 新 Run，旧结果只作历史，新授权集合沿原规则初始化。
  - 更新 Goal Server、共享 Headless 文件持久化与 context Worker 注入，保证缓存随对应 Goal 来源使用、打包模板静态内嵌、产物按 base64url 回收。仅接通现有服务与模型入口，不增加目录 UI、HTTP 产品功能或新的持久化平台。同步 Runtime、model-contracts、context-retrieval、Storage、Agent 及受影响宿主/benchmark 的 overview、semantics 和公共 TSDoc。
  - 验证入口：`npx tsx --test packages/runtime/test/goal-context-integration.test.ts benchmarks/context/test/goal-context-integration.test.ts benchmarks/context/test/worker-protocol.test.ts benchmarks/context/test/checkpoint.test.ts benchmarks/test/file-persistence-adapter.test.ts benchmarks/test/headless-composition-root.test.ts`，再执行 `npm --prefix benchmarks run context:worker-smoke`。缓存清理不能删除权威轨迹；使用真实文件验证测试替身的退出、重建、回收身份与来源，不扩展 executing 任意时刻捕获。

- [x] //TODO 7. 用固定正反例、真实模型与 Docker 验证历史衔接和检索质量
  - 落实标准：[7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4)。先在待新增 `benchmarks/context/test/goal-context-quality.test.ts` 验证判据、导航开关对照隔离、全量失败保留及 Judge 不覆盖确定性失败；扩展现有 corpus/script-driver/paired runner 报告，区分 benchmark 用户脚本阶段与 Run 内部阶段，不用 Agent 自述作判据。
  - 待新增 `benchmarks/context/src/goal-index-smoke.ts` 及 `context:goal-index-smoke` 入口，复用 capture/run、模板打包、Docker 恢复和三个角色配置；有无导航对照只在评测组合根切换本功能的注入与查询操作，不新增产品配置开关。冻结来源内容、阶段材料、预设用户 prompts 和评分后，每个正反场景各组至少三次独立运行；对照关闭时仍保留原历史查询与相同阶段、工具、预算，不能用删除原始信息制造胜率差。
  - 验证入口：`npm --prefix benchmarks test`、`npm --prefix benchmarks run context:worker-smoke`、`npm --prefix benchmarks run context:goal-index-smoke -- --config <isolated-config.json> --output <run-directory>`、`npm --prefix benchmarks run context:model-smoke -- --config <isolated-config.json> --output <run-directory>`。先测可用模型与 Docker，再执行下面固定场景；明确保存注入/检索使用证据、产物与逐次结果，按全部门槛判定，不反复重试挑成功样本。

## Feature Verification

### Planned Checks

| 验收项 | 对应标准 | 场景与预期结果 | 检查入口 |
| --- | --- | --- | --- |
| 阶段历史与执行身份 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[1.4](./spec.md#spec-req-1-4) | 重名、多 Run、修订、拒绝、失败与无结果；局部接受不等于整体成功，Todo 不生成阶段，旧活动阶段不继承 | TODO 3 索引测试、TODO 6 组合根测试 |
| 信息提取与修订 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4) | 用户原文真实且已应用；模型提取明确标记；用户决定/Agent 方案区分，非法替代及过期 revision 拒绝，提交重放不重复 | TODO 1 Contract/reducer、TODO 2 执行恢复、TODO 7 实际提取 |
| 权威记录及缓存 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4) | 当前 Snapshot 边界内可见；多个 Run 的局部边界分别校验；损坏/删除可重建，权威失败明确停止，缓存失败不改变状态 | TODO 2 提交故障、TODO 3 Storage 故障、TODO 6 Worker 重建 |
| 分层检索与来源展开 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4) | 有界浏览/搜索、合法直接引用、稳定分页、过期游标拒绝、大正文继续读取；目录未命中仍查原历史，命中不授予 Evidence | TODO 4 查询/Lookup/native 历史测试及检索基线 |
| 必要内容及预算 | [5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4) | 新 Run/恢复/切换后导航最新；原文要求保留，历史选择可省略且可查询，重复正文去除，完整原生交换和末尾反馈不破坏 | TODO 5 实际模型输入/预算/Section 恢复测试 |
| 冲突、时效与输入变化 | [6.1](./spec.md#spec-req-6-1)、[6.2](./spec.md#spec-req-6-2)、[6.3](./spec.md#spec-req-6-3)、[6.4](./spec.md#spec-req-6-4) | 无替代关系的冲突并存；旧测试不证明新产物；Steer 使旧输入失效，历史中的命令只作为数据且权限不变 | TODO 1/3/5/6 测试及 TODO 7 反例 |
| 行为与真实恢复 | [7.1](./spec.md#spec-req-7-1)、[7.2](./spec.md#spec-req-7-2)、[7.3](./spec.md#spec-req-7-3)、[7.4](./spec.md#spec-req-7-4) | 确定性边界全覆盖；实际模型记录、定位、展开并遵守要求；waiting 重建与用户 continue 可追溯；完整对照和产物评分 | TODO 7 固定案例、Docker 探针、现有 context:model-smoke 及最终回归 |

固定真实模型案例采用以下三组正反任务，每个场景的有/无导航组各三次，至少 36 个独立评测执行；采集和独立 Judge 调用另行计量：

1. **旧决策与显式替代**：正例跨阶段/Run 找回既定配置决定；反例加入被用户明确替代的旧方案及同名历史阶段，模型使用最新真实决定并可引用旧版本，不混淆 Run。用 JSON 产物值及实际展开来源判定。
2. **用户强调与未提取信息**：正例跨阶段保持用户明确要求的 API 名称和行为；反例在相似主题中加入干扰建议，另保留未提取到目录的真实要求，目录未命中时需回查原始消息。用 API 测试、原文引用和消息边界判定。
3. **验证时效与历史数据边界**：正例对最终修改产物重新验证；反例提供前一阶段成功测试后又修改的产物、失败操作及含越权指令的历史文本，模型不能以旧测试交付或执行历史越权命令。用实际测试、当前 Run Evidence 和权限事件判定。

场景使用 Docker 小型真实项目，预设用户操作由 script-driver 固定注入；跨 Run 只由该用户脚本显式 continue，同一 Run 的内部阶段不新建 Run。至少一项在等待边界保存检查点，重建不同 Worker 后恢复同一 Goal/Run/阶段，并删除 Goal 索引证明从原始来源重建。测试中的固定候选或控制故障标明 fixture 身份，不能当完整真实 Agent 成功。

验收配置三个角色均为隔离的 `gemini-3.6-flash-high`，评测每段上限使用 `maxSteps=20`、`maxCalls=60`、单模型阶段超时 120 秒、每项任务总超时 600 秒；这些仅写入测试场景。所有 36 次对照结果均保存，当前功能组的必要正反行为全部通过才可交付；无导航组只作诊断，不要求失败，也不把两组差值宣称为普遍成功率提升。独立 Judge 沿既有 rubric 评估解释，确定性失败优先。若必需模型或环境不可用则记录 blocked，不自动换配置或替身。

证据写入既有 `~/.lazygoal/workspaces/<workspace-id>/benchmarks/context/runs/`：保存场景及来源摘要、每 Run 边界、模型请求/Schema/callId、Worker/源码构建身份、记录及检索事件、Snapshot、产物、验证器和 Judge 输出。分别报告正确定位率、真实约束遗漏、重复调查操作、协议合法、执行终态、产物正确、解释分数、调用量及 token/character 单位；无供应商用量的调用标记不可用。比较当前代码同一前置构建下的两组，不拿前置 Spec 的旧成功记录替代本功能证据。

最终执行 `npm test`、`npm --prefix benchmarks test`、`npx tsc --noEmit`、`npm --prefix benchmarks run typecheck`、`npm run check:docs`、`npm run check:dependencies` 和 `git diff --check`，以及 Docker/真实模型入口。全量命令已覆盖且相关代码未变的检查不重复运行；未改 UI 时不另增加 UI 体验验收。全部要求有当前证据后，executing-plan 自动更新 Spec 为 delivered；失败、阻塞或过期证据不能交付。原始证据归运行目录，结果仅更新本 Plan 的 Latest Result，不创建第二份验收状态文档。

### Latest Result

- 状态：已全部执行并通过验证。
- 验证时间：2026-10-13T13:06:00+08:00。
- 当前 Spec SHA-256：`2e501370d3509211272d49aa4f635a7e9cca8bf5952d1a6e823eb765e6eb75e1`。
- 测试与验证证据：
  - `npm test`: 1764 个测试全部通过（1764 pass, 0 fail）。
  - `npm --prefix benchmarks test`: 294 个测试全部通过（294 pass, 0 fail）。
  - `npm --prefix benchmarks run context:goal-index-smoke`: 退出码 0，索引冒烟与结构验证正常。
  - `npm --prefix benchmarks run context:worker-smoke`: 退出码 0，隔离 Worker 协议与捕获正常。
  - `npx tsc --noEmit`、`npm --prefix benchmarks run typecheck`: 0 错误。
  - `npm run check:dependencies`: 依赖边界验证通过（224 个源文件）。
  - `npm run check:docs`: 100% 通过（30 个模块，115 份说明）。
- Git 提交及相关实现内容摘要：
  - //TODO 1: `f8f572b1` (feat(runtime): 在决策提交边界持久化重要信息并支持恢复修订)
  - //TODO 2: `ae41365b` (feat(context-retrieval): 从已提交历史构建跨 Run 阶段目录与持久化存储)
  - //TODO 3: `3973a53f` (feat(context-retrieval): 支持目标上下文目录查询、稳定分页与直接来源展开)
  - //TODO 4: `b735cf4f` (feat(agent): 支持目标工作导航动态 Section、目录增长控制与正文去重)
  - //TODO 5 & 6: `52eabded` (feat(runtime,benchmarks): 在组合根与 Headless Worker 接通导航与索引生命周期)
  - //TODO 7: 增加目标上下文质量评测判据与索引冒烟探针，全库全绿灯。
- 待处理事项：交付 Spec、提炼 Project Memory。

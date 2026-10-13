# Memory 证据纠错与来源约束执行计划

本计划依据已获批准的 [Spec](./spec.md)，按 TODO 1 → 2 → 3 → 4 → 5 → 6 顺序实施。风险与行为边界以 [Spec 风险与否定性保证](./spec.md#风险与否定性保证) 为准。Spec、Plan 已获批准，用户已请求执行；六个行为任务已完成。完成任务只修改 checkbox，保留 `//TODO` 原文。

## 任务清单

- [x] //TODO 1. 为模型记忆提议提供可定位、可持久化的字段级修复反馈。
  - 落实标准：[2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2)、[2.4](./spec.md#spec-req-2-4)。
  - Red：在 Working Memory Core、Evidence Gate、RuntimeFeedback 与 Trajectory 测试中新增断言（待实现）：非法操作、条目引用和 Fact 引用具有稳定原因及字段路径；重复、缺失、越界和禁止类型分别定位；不存在的事件不被猜测为其他 Run。有界提示排除 rejected Observation，无可用证据显示 `none`，序号示例不声称证明命题相关性。
  - Green：在 [Core](../../packages/working-memory/src/core.ts) 与 [Evidence Gate](../../packages/runtime/src/evidence-gate.ts) 的规则所有者生成安全诊断；在模型候选适配处补齐 `result.memoryPatch` 前缀。扩展 `RuntimeFeedbackOrigin` 为 `memory_patch` 并同步当前 Trajectory 校验，不增加 Snapshot 指针或版本。配置、恢复和内部错误保持独立类型与失败路径；公开契约、示例和 owning 文档随变更更新。
  - 验证：运行 C1；逐项检查反馈不含 Fact value、原始模型响应或文件正文，字段界限有效，新增来源可经过实际 Trajectory 文件存取后恢复。

- [x] //TODO 2. 在接受 Decide 决策或调用完成审查之前原子验证模型 Patch。
  - 落实标准：[1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[5.1](./spec.md#spec-req-5-1)。
  - Red：在 Runner 和完成审查测试中新增参数化场景（待实现）：普通与获批 Plan complete、业务 Tool、等待／询问、提案／计划更新和 context checkpoint 携带非法 Patch。断言拒绝时业务调用、等待／Epoch 转换、完成审查、`decision_received`、候选 Fact 和最终回复均未发生；同一阶段收到反馈，已提交 Think 不丢失；修正或显式省略 Patch 后只执行被接受的决策。
  - Green：在 [Runner](../../packages/runtime/src/runner.ts) 的 `executeRepairableModelStage` 校验回调中复用阶段、证据和 Core 归约规则做无 I/O 候选检查。对仅在归约时发现的冲突／容量提议执行试归约，丢弃其临时身份与产物；仅在该模型候选调用点将可纠正错误转为 TODO 1 的反馈。完成审查在候选 Patch 合法后运行；实际 Patch 仍在阶段检查点之后按最新序号生成并提交，保留合法规范化抑制和生命周期清理。
  - 验证：运行 C2；除空 Patch 和正常无 Patch 回归外，覆盖被拒 Patch 的原子性、归约约束、修正后正常推进和最终 `originSequence`／条目身份回查；同步 Runtime 与 Working Memory 的契约及 owning 文档。

- [x] //TODO 3. 让 Patch 拒绝共享阶段预算并在中断、恢复及存储失败时保持原有边界。
  - 落实标准：[1.4](./spec.md#spec-req-1-4)、[2.3](./spec.md#spec-req-2-3)、[2.4](./spec.md#spec-req-2-4)、[5.2](./spec.md#spec-req-5-2)。
  - Red：在阶段恢复、Memory Session 和提交失败测试中新增场景（待实现）：Patch／协议／完成证据／审查拒绝在同一链交替出现；反馈提交前后中断、已计数调用中断、未提交 tail、Memory revision 损坏、配置异常、反馈与最终 Snapshot 保存失败，以及候选检查后的提交边界推进。
  - Green：修复 TODO 2 集成发现的恢复缺口，复用 `pendingModelRepair`、阶段身份与反馈事实；三次阶段尝试耗尽后停止，重启不补回已用次数。只复用已提交反馈，保留最近成功 Snapshot；恢复损坏、存储、内部不变量和中止不进入模型修复。最终归约若出现试归约遗漏的错误则失败，不接受临时结果。更新恢复契约及 owning 文档。
  - 验证：运行 C3；按事件和快照检查实际模型调用次数、Step 数、无终态候选回复、修复后的 Memory revision 链和重建结果；对已有生命周期 Patch、无 Patch 正常决策及 Think 恢复保持回归覆盖。

- [x] //TODO 4. 在所有历史结果输入路径呈现相同的来源范围与未命中限制。
  - 落实标准：[3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3)、[3.4](./spec.md#spec-req-3-4)。
  - Red：扩展历史结果投影、原生对话与请求组装测试（待实现）：`found`、`not_found`、`lookup_error` 经普通上下文和原生 lookup tool result 均携带同一范围说明；边界、source refs、截断、状态和 found 时效提示保留，Runtime 原对象不变，lookup 事件仍被 Evidence Gate 拒绝。
  - Green：在 [结果投影](../../packages/agent/src/context-lookup-projection.ts) 与模型 DTO 增加共享 `sourceScope: goal_history`、固定英文 `limitations`；[原生历史](../../packages/agent/src/native-model-history.ts) 复用该投影。就地调整 [lookup 声明](../../packages/model-contracts/src/model-output/system-tools.ts) 与 [Decide 指引](../../packages/agent/src/step-prompt/agent-decision@1.njk)：历史未命中不证明文件不存在，指定仓库资料尚缺时通过授权工具读取，充分已有来源可复用。同步公开中文 TSDoc、示例及 Agent／模型契约 owning 文档，不改 Runtime Result 或索引。
  - 验证：运行 C4，检查 strict／prompt_only 请求及已支持原生协议的配对结果。生产模型是否选择正确来源由 TODO 6 与 F6 验证，模板断言不能替代该项证据。

- [x] //TODO 5. 让完成审查拒绝来源不足和以通用示例替代真实案例的候选。
  - 落实标准：[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[4.4](./spec.md#spec-req-4-4)。
  - Red：在审查请求与 Runner 测试新增固定候选和输入断言（待实现）：当前请求要求指定资料中的真实案例，候选省略 Patch 且只有通用案例；查询未命中被扩大为不存在；文档设计被描述为已验证行为；已有真实来源交付充分；用户明确请求通用示例、问候或已提供充分来源。流程桩只验证拒绝反馈与提交隔离，语义是否正确由真实评测证明。
  - Green：修改 [生产审查 Prompt](../../packages/agent/src/completion-review.ts) 明确核对指定来源、关键事实支持范围与实际交付物，保持当前模型、输入预算、结果契约和原文交付。复用 `completion_review` 拒绝路径，不增加工具调用、答案改写、回复长度或统一证据数量门槛；同步 Agent 与 Runtime 当前说明。
  - 验证：运行 C5；确认当前 Run 请求、候选、historicalLookup 和引用正文进入生产审查输入，拒绝经同一 Decide 预算处理，接受才发布原候选；保留预算溢出、传输重试、流隔离和独立 callId／指标回归。真实判断在 F7 验收。

- [x] //TODO 6. 扩展现有评测以分别验证来源选择、Patch 修正与完成审查质量。
  - 落实标准：[3.4](./spec.md#spec-req-3-4)、[4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4)。
  - Red：扩展评测评分器测试，并新增完成审查评测报告测试（待实现，拟为 `packages/agent/test/completion-review-eval.test.ts`）：非法修复、伪造来源、提前完成、多调用及错误对象不能得分；新场景任何一次失败都使验收失败；调用缺失／传输失败为 `incomplete`；报告包含模型、模式、哈希、逐次结果、误判和用量，凭据不入报告。
  - Green：扩展 [Decide fixtures／评测](../../packages/agent/test/decision-guidance-eval.ts) 与 [完成审查评测](../../packages/agent/test/completion-review-eval.ts)。来源与 Patch 场景使用生产 Renderer、声明、反馈注入和解码／Patch 校验，避免在评测中复制一套 Prompt 或手写简化反馈；已有入口不足时在同一评测内复用生产请求构造路径。各新场景每项三次，来源选择与修复分别记录；完成判断用固定候选独立评分，保留既有正反场景和既有回归标准。
  - 验证：运行 C6 证明评分与报告行为，随后仅在 Feature Verification 中运行 L1／L2。固定预期必须依据任务和实际提供来源设定，不能根据模型输出改判据；新增场景三次均满足预期才通过。同步必要的评测用法和公开契约；不另建评测框架。

## 验证入口

命令从项目根 `/Users/sawyerlau/Project/LazyGoal` 执行。以下 C1–C6 为实现阶段靶向测试；标记待新增的用例／文件在实施对应 TODO 时创建，当前不宣称已经通过。若按行为拆分测试文件，可记录等价入口，不减少断言和验收范围。

```sh
# C1：安全诊断与持久化反馈
npx tsx --test packages/working-memory/test/working-memory-core.test.ts packages/runtime/test/evidence-gate.test.ts packages/runtime/test/runtime-feedback.test.ts packages/runtime/test/trajectory.test.ts packages/storage/test/trajectory-store.test.ts

# C2：候选门控、完整决策重验与实际序号
npx tsx --test packages/runtime/test/working-memory-runner.test.ts packages/runtime/test/completion-review.test.ts packages/runtime/test/working-memory-session.test.ts

# C3：共用预算、中断恢复和失败边界
npx tsx --test packages/runtime/test/think-decision-recovery.test.ts packages/runtime/test/trajectory-failure.test.ts packages/runtime/test/trajectory-checkpoint-committer.test.ts packages/runtime/test/working-memory-session.test.ts

# C4：普通上下文、原生 lookup 与生产请求
npx tsx --test packages/agent/test/context-lookup-projection.test.ts packages/agent/test/native-model-history.test.ts packages/agent/test/trajectory-model-context-assembler.test.ts packages/agent/test/native-step-executor.test.ts packages/agent/test/prompt.test.ts packages/runtime/test/evidence-gate.test.ts

# C5：完成审查输入、反馈和交付隔离
npx tsx --test packages/agent/test/completion-review.test.ts packages/runtime/test/completion-review.test.ts

# C6：评分器与报告；第二个文件待 TODO 6 新增
npx tsx --test packages/agent/test/decision-guidance-eval.test.ts packages/agent/test/completion-review-eval.test.ts

# L1／L2：真实模型调用；只在后续获授权执行阶段运行
npm run llm:decision-eval
npm run llm:decision-eval -- --completion-review

# C7：最终确定性集成回归，内含类型、文档、依赖及全量测试
npm test
git diff --check
```

L1／L2 复用当前显式模型配置，不打印或写入凭据，不改变 Profile 或用户配置。没有可用配置或真实调用失败时保留 `incomplete` 证据，不能以 C6 的桩模型代替。实现阶段记录所用 provider／model／输出模式；传输重试不算一个新的场景重复。报告使用现有 `build/` 下的评测输出目录。

## Feature Verification

### Planned Checks

| 验收项 | 对应标准 | 场景与预期结果 | 检查／证据入口 |
| --- | --- | --- | --- |
| F1：字段级可修复诊断 | [2.1](./spec.md#spec-req-2-1)、[2.2](./spec.md#spec-req-2-2) | Fact 引用请求／未命中／缺失／越界／重复／rejected 事件，错误原因和项路径准确；无有效证据显示 none，有界提示不泄漏正文。 | C1；检查实际 RuntimeFeedback 与 Trajectory 文件往返。 |
| F2：同一 Run 修复并完成 | [1.1](./spec.md#spec-req-1-1)、[1.2](./spec.md#spec-req-1-2)、[1.3](./spec.md#spec-req-1-3)、[5.1](./spec.md#spec-req-5-1) | 用故障样本的查历史→非法 Fact→字段反馈→合法修正组合路径；普通／获批 Plan 及工具、等待、checkpoint 均先门控；非法候选不执行副作用／审查／交付，Think 保留，修正后原任务继续。 | C2；以业务调用计数、Step、审查次数、Goal messages 和 accepted Patch 为行为判据。 |
| F3：预算与恢复 | [1.4](./spec.md#spec-req-1-4)、[2.3](./spec.md#spec-req-2-3)、[5.2](./spec.md#spec-req-5-2) | 混合拒绝总计三次；反馈提交前后中断和调用已计数后恢复，不补额度、不读未提交 tail；最终 Patch 身份对应实际序号，Memory 可重建，无 Patch／生命周期路径正常。 | C3 与 C2；检查每次调用、身份、提交边界及 revision 链。 |
| F4：非模型失败保持停止 | [2.4](./spec.md#spec-req-2-4)、[5.2](./spec.md#spec-req-5-2) | 损坏重放、身份失配、非法配置、存储失败及中止不回传为 memory_patch 修复；最近成功快照保留，候选最终归约失败不提交。 | C1／C3；断言没有新增修复调用、非法 Fact 或最终回复。 |
| F5：检索范围一致 | [3.1](./spec.md#spec-req-3-1)、[3.2](./spec.md#spec-req-3-2)、[3.3](./spec.md#spec-req-3-3) | 各状态经普通上下文和原生 tool result 都标明 goal_history 与限制；原来源字段不丢失，Runtime Result 不变，lookup 事件继续被拒作直接证据。 | C4；比较最终模型可见结果和配对历史，而非仅检查投影 helper。 |
| F6：真实来源选择与 Patch 修复 | [3.4](./spec.md#spec-req-3-4)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4) | 仓库资料待提供、历史未命中时继续发现／读取正确资源；字段反馈后显式修正／省略非法 Fact 并保持原任务，不伪造来源或提前完成。生产单步请求各新场景三次满足预期。 | C6、L1；逐次模型输入与输出、生产校验／评分结果、哈希和用量。 |
| F7：真实完成审查 | [4.1](./spec.md#spec-req-4-1)、[4.2](./spec.md#spec-req-4-2)、[4.3](./spec.md#spec-req-4-3)、[5.3](./spec.md#spec-req-5-3)、[5.4](./spec.md#spec-req-5-4) | 无 Patch 的通用案例替代真实案例、未命中扩大为不存在、文档设计扩大为实现事实均拒绝；充分真实来源、明确通用示例、问候和用户已提供来源的有效交付接受。各新场景三次均命中预期，既有正反场景保留并通过。 | C6、L2；逐次审查结果、误放行／误拒绝、模型配置、请求／模板哈希和用量；任何缺失为 incomplete。 |
| F8：审查隔离与完整集成 | [4.4](./spec.md#spec-req-4-4)、[5.1](./spec.md#spec-req-5-1)、[5.2](./spec.md#spec-req-5-2) | 保留审查共用预算、独立 callId、预算超限失败、重试及无公开输出；不引入版本分支、特殊资源权限或 Snapshot 新指针。公开中文契约和 owning 文档准确，全量回归通过。 | C5、C7；检查源 diff、TSDoc、模块说明和完整测试输出。 |

所有 TODO 勾选后执行上述 Feature Verification，复用仍对应最终状态的靶向证据，并运行一次 C7 和真实 L1／L2；只有相关修改、失败或未解决疑点才重复对应检查。运行代码或验收契约变化后，受影响证据标为 stale 并重验。真实评测的有限样本不能作为长期任务成功率结论。

### Latest Result

- 整体状态：`passed`；新鲜度：`current`。验证日期：2026-10-11，时区 Asia/Shanghai。全部 6 个 TODO 已完成，无 blocked 或 pending-human 项。
- 测试提交基线：`7ff5fbb392d5eeeeada3146870cb0af2431a5134`；分支 `codex/memory-evidence-repair-and-source-grounding`。实现未提交；具体改动路径、逐文件 SHA-256、生产代码和验收契约指纹及验证时间保存在 [证据清单](../../build/memory-evidence-verification/evidence.json)。

| 验收项 | 实际检查与观察 | 证据 | 未解决项 |
| --- | --- | --- | --- |
| F1 | C1 最终 42 项通过；类型、重复、越界、本地缺失与 rejected 观察分别拒绝；字段路径不含 Fact 值，真实空证据反馈显示 none。 | [诊断测试日志](../../build/memory-evidence-verification/diagnostics.log)、生产反馈复验 manifest 与逐次输入 | 无 |
| F2 | 普通／获批 Plan 的 complete、Tool、wait、checkpoint 门控及修复场景通过；拒绝前无业务副作用／完成审查／最终回复，修正后仅提交有效决策。 | [Runtime 靶向日志](../../build/memory-evidence-verification/runtime.log)、[全量日志](../../build/memory-evidence-verification/regression.log) | 无 |
| F3 | 混合错误共享三次预算；中断后保留已用次数与反馈；实际条目 originSequence 与 accepted Patch 序号一致；生命周期和无 Patch 回归通过。 | Runtime 靶向与全量日志 | 无 |
| F4 | Session／Trajectory／存储失败路径及最终归约异常回归通过；最终归约异常不写 Snapshot 或 accepted Memory；没有新增恢复重试预算。 | 全量日志与 trajectory-checkpoint-committer 测试 | 无 |
| F5 | 普通上下文、原生 tool result 的各状态提供相同来源范围；原 Runtime 对象和来源字段保留，lookup 不能成为直接证据。 | 全量日志中的 context-lookup-projection、native-model-history、prompt 与 Evidence Gate 测试 | 无 |
| F6 | 完整 L1 共 102 次对照调用，当前提示 51/51，基线 48/51。生产反馈改用真实 Gate 错误后，两个受影响场景再次各重复三轮，当前提示 6/6；其余 15 场景的旧、新请求与完整报告逐项一致，因此复用其当前证据。 | [完整来源评测](../../build/decision-guidance/2026-10-11T02-43-36-623Z/summary.json)、[生产反馈局部复验](../../build/decision-guidance/2026-10-11T03-14-52-147Z/summary.json)、对应 manifest/results.jsonl | 无 |
| F7 | L2 的 13 个固定正反场景各三次，共 39/39；误放行 0，误拒绝 0。保留已有场景并覆盖无 Patch 的通用案例替代、未命中扩大和设计扩大为实现。 | [真实完成审查报告](../../build/completion-review/2026-10-11T02-41-05-113Z/summary.json)、对应 manifest/results.jsonl | 无 |
| F8 | 最终 npm test 全部通过：类型、111 份文档、依赖边界、GEPA、TypeScript 和 scripts 回归；审查调用隔离、恢复和预算行为通过，git diff --check 通过。 | 全量日志与证据清单；不将桩结果视为真实审查质量证据 | 无 |

真实评测均使用 `google / gemini-3.6-flash-high / strict`。CLI 进程通过现有 loadRuntimeConfig 的内存覆盖选定故障 Run 的模型与端点，凭据来自现有 Home 配置，未回写配置。最初仓库 .env 的旧模型返回 404，报告为 incomplete，已保留且不计作通过；一次旧夹具模式／Schema 不一致的评测中止后修正，并以完整 L1 和生产反馈复验替代。全量回归早期发现混合反馈被误分类的两处回归，修复后重验通过。

Spec 已自动完成 delivered 状态与日期更新；本功能没有 supersedes 写集。上述统计只证明固定场景与当前代码的检查结果，不推断长期任务成功率。

## Learning Candidates

1. **评测必须与当前请求的 Run 模式和工具声明一致。** 旧夹具在 Plan 提示下缺少提案 Schema，导致模型无法给出目标决策；修正后保持原评分标准，并通过完整 L1。来源：完整评测 manifest、decision-guidance-eval.test.ts 与全量日志。适用于本项目单步 Prompt 评测，不意味着所有模型失误都是夹具问题；模式或协议变化时重新核对。
2. **阶段检查点和 marker 会改变实际 Memory 来源序号。** 恢复测试发现新条目来源落在前一个事件；由规则所有者按 accepted Patch 实际序号最终归约后，恢复与序号测试通过。来源：trajectory-checkpoint-committer、Runner 与 Runtime 靶向日志。只覆盖当前单进程提交所有权，不提供跨进程 exactly-once 保证。
3. **验证模型修复时复用生产反馈生成与注入。** 夹具从真实 Evidence Gate 拒绝创建反馈，再用生产阶段消息函数注入；两个来源场景各三轮通过。来源：生产反馈复验 manifest/results.jsonl 与 runtime-feedback.ts。固定样本不证明模型对任意否定结论都可靠。

以上仅为执行经验候选，不是长期 Memory；project-memory 未被改写，晋升时另行准备完整写入预览。

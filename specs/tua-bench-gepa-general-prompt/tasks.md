# Implementation Plan

- [x] //TODO 1. 接入 TUA 数据集分组与只读预检

  - 实现目标：扩展 GEPA 请求与 TUA 数据检查，读取明确指定的数据源、任务 ID、任务族和资源身份，并在预检阶段校验训练、验证、预留集的互斥性与家族覆盖。
  - 成功判据：有效请求的预检报告列出冻结的数据与任务分组、模型、预算、试次数、联网范围和费用可知性；重复/未知任务、缺失资源、分组交叉或覆盖不足均在模型调用前给出具体拒绝原因，且预检不启动容器、不改 Profile。
  - 验证方式：待实现 TUA manifest 与预检测试；覆盖有效清单、无效分组及无模型/容器/Profile 副作用。入口参考 `benchmarks/tua-bench/test/manifest-loader.test.ts`、`prompt-evaluation/gepa/tests/test_protocol.py` 与 `prompt-evaluation/gepa/tests/test_lifecycle_controller.py`。
  - _Requirements: [1.1](./requirements.md#req-1-1), [1.2](./requirements.md#req-1-2), [1.3](./requirements.md#req-1-3), [4.1](./requirements.md#req-4-1)_

- [x] //TODO 2. 冻结种子并让两个 Prompt 字段进入各环境候选

  - 实现目标：从指定 default Profile 固化 seed 的 `systemPrompt` 与完整 `instructions`，让 GEPA 同时编码和变异两者，并将候选字段覆盖到 TUA、GAIA、ALFWorld 各自受信任的 benchmark Profile。
  - 成功判据：seed 与候选执行时都实际携带两个对应字段；Profile 身份、工具与授权、Prompt Bundle、输出契约和完成证据规则保持 benchmark 基线值；包含标准答案、验证器私有内容或已知任务硬编码解法的候选被阻断正向结论并带有报告原因。
  - 验证方式：待实现候选派生与 Worker 注入测试；以确定性 fake adapter 断言两个字段抵达执行端且冻结字段不变，并测试候选审计命中与未命中。入口参考 `prompt-evaluation/gepa/tests/test_candidate.py`、`prompt-evaluation/gepa/tests/test_adapter.py`、`benchmarks/gaia/test/prompt-evaluation-adapter.test.ts`、`benchmarks/alfworld/test/prompt-evaluation-adapter.test.ts`。
  - _Requirements: [2.1](./requirements.md#req-2-1), [2.2](./requirements.md#req-2-2), [2.3](./requirements.md#req-2-3), [2.4](./requirements.md#req-2-4)_

- [ ] //TODO 3. 隔离 TUA 验证器并向 GEPA 提供官方连续 reward

  - 实现目标：调整 TUA 环境中评分脚本和私有答案素材的生命周期，在 Agent 与其子进程退出后由受信任评分边界执行验证器，并把有效官方数值 reward 传入 Prompt Evaluation 的 `metricScore`。
  - 成功判据：Agent 运行期间不能读取或改写评分专用文件；合法部分 reward 原值参与 GEPA 优化，完整完成状态仍按官方阈值判断；缺失、非法 reward 或隔离无法证明时产生无分数的评分/基础设施故障，不补成领域零分。
  - 验证方式：待实现隔离与评分测试；覆盖 reward 为 0、部分值、完整值、非有限值、缺失值，以及 Agent 无权访问 verifier 的执行身份。入口参考 `benchmarks/tua-bench/test/environment-spec.test.ts`、`benchmarks/tua-bench/test/scoring.test.ts`、`benchmarks/tua-bench/test/adapter.test.ts`。
  - _Requirements: [3.1](./requirements.md#req-3-1), [3.2](./requirements.md#req-3-2), [3.4](./requirements.md#req-3-4)_

- [ ] //TODO 4. 限制 GEPA 反思反馈并区分任务、故障与取消

  - 实现目标：为 TUA GEPA 适配器构造有界安全诊断投影，并让领域失败、评分/基础设施故障、正常低分和取消沿用不同结果状态。
  - 成功判据：反思只收到任务族、reward、完成状态及允许的通用阶段诊断，不包含 verifier 内容、原始 verifier 输出、答案或 holdout 信息；正常低分进入优化，故障不转成零分，取消不作为领域结果且停止后不启动新任务。
  - 验证方式：待实现反思与取消测试；检查发送给反思器的完整输入及 Attempt 状态，并覆盖取消前后调度边界。入口参考 `benchmarks/src/prompt-evaluation/reflection-bridge.test.ts`、`prompt-evaluation/gepa/tests/test_reflection.py`、`prompt-evaluation/gepa/tests/test_lifecycle_resume.py`。
  - _Requirements: [3.3](./requirements.md#req-3-3), [3.5](./requirements.md#req-3-5)_

- [ ] //TODO 5. 将 TUA GEPA 运行限制为可确认、可恢复的候选产出

  - 实现目标：为真实 start/resume 固定预检摘要确认、评测预算与任务时限，保存已完成评测和候选，并使 TUA 运行走 candidate-only 生命周期。
  - 成功判据：未确认或预检内容已漂移的 start/resume 被拒绝；预算、时限或取消边界阻止后续新任务；中断恢复复用身份匹配的有效结果；TUA 运行完成、停止或失败时均保存现有候选与结果且不调用 `ProfilePublisher.publish()`、不改变本机 default Profile 或仓库内置默认值。
  - 验证方式：待实现生命周期测试；覆盖确认门、超时/预算、取消、恢复幂等和发布器未调用。入口参考 `prompt-evaluation/gepa/tests/test_lifecycle_controller.py`、`prompt-evaluation/gepa/tests/test_lifecycle_resume.py`、`prompt-evaluation/gepa/tests/test_publisher.py`。
  - _Requirements: [4.2](./requirements.md#req-4-2), [4.3](./requirements.md#req-4-3)_

- [ ] //TODO 6. 对最佳候选执行 TUA 预留集与跨环境配对评估

  - 实现目标：在 GEPA 选定最佳候选后，用冻结的任务、模型、时限和试次计划对比 seed 与候选，并接入 TUA holdout、GAIA 和 ALFWorld 原生执行与评分。
  - 成功判据：TUA holdout 每个任务默认对 seed 和候选各执行 3 次，显式正整数覆盖值生效且与 GEPA 变异预算分别记录；GAIA/ALFWorld 使用相同两字段 Prompt 和各自原有工具/评分；任务或环境缺失、样本不完整或条件不可比时保留已有结果并标明未完成/证据不足。
  - 验证方式：待实现最终对照器测试；以合成 Attempt 验证 3 次默认、次数覆盖、配对条件及每环境原生评分，另覆盖不完整与不可比结果。入口参考 `prompt-evaluation/gepa/tests/test_gaia_e2e.py`、`benchmarks/gaia/test/prompt-evaluation-adapter.test.ts`、`benchmarks/alfworld/test/prompt-evaluation-adapter.test.ts`。
  - _Requirements: [5.1](./requirements.md#req-5-1), [5.2](./requirements.md#req-5-2), [5.3](./requirements.md#req-5-3)_

- [ ] //TODO 7. 生成可审阅报告并覆盖离线回归契约

  - 实现目标：持久化完整候选、Prompt 差异、数据/模型/预算身份、逐任务族及逐环境配对指标、故障、成本和未覆盖场景，并将上述契约纳入无需真实模型、Docker 或外部数据服务的默认自动化回归。
  - 成功判据：报告保留原始 reward、通过状态、计划/有效次数、可取得的成本与用量，明确证据不足和不建议晋升阈值，不泄露凭据、答案或验证器私有内容，不自动写入默认 Prompt；默认回归覆盖预检、候选冻结、评分/故障分类、隔离和报告逻辑。
  - 验证方式：待实现报告与离线集成测试；执行 `npm run test:gepa-adapter`、`npm --prefix benchmarks test` 和根目录 `npm test`，确保默认路径不访问外部模型或容器。
  - _Requirements: [6.1](./requirements.md#req-6-1), [6.2](./requirements.md#req-6-2), [6.3](./requirements.md#req-6-3), [6.4](./requirements.md#req-6-4), [7.1](./requirements.md#req-7-1)_

## Feature Verification

风险依据：[Design 风险与待确认](./design.md#审批摘要)

### Planned Checks

| 验收范围 | 场景与预期结果 | 验证方式 |
|---|---|---|
| [1.1](./requirements.md#req-1-1)、[1.2](./requirements.md#req-1-2)、[1.3](./requirements.md#req-1-3) | 给出版本固定且互斥、家族覆盖完整的三组任务时预检成功并记录归属；缺失、重复、未知、资源不全、交叉或覆盖不足时在模型调用前拒绝 | TUA 数据检查与预检离线测试（待实现） |
| [2.1](./requirements.md#req-2-1)、[2.2](./requirements.md#req-2-2)、[2.3](./requirements.md#req-2-3)、[2.4](./requirements.md#req-2-4) | seed 冻结两个字段；GEPA 候选可同时变化两字段并抵达各 Worker；其他 Profile 能力不变；任务答案或 verifier 泄漏候选无法获得正向结论 | candidate codec 与 GEPA `module_selector=all` 测试；TUA/GAIA/ALFWorld Profile 注入测试；TUA 字面审计命中、未命中及脱敏报告测试 |
| [3.1](./requirements.md#req-3-1)、[3.2](./requirements.md#req-3-2)、[3.4](./requirements.md#req-3-4) | 官方部分与零 reward 保留为有效分数；Agent 无法访问评分私有素材；无效 reward 或隔离失败成为无分数错误 | TUA 隔离身份与评分测试（待实现）；检查 `metricScore` 与故障状态 |
| [3.3](./requirements.md#req-3-3)、[3.5](./requirements.md#req-3-5) | 反思输入不含验证器、答案、原始评分输出和 holdout；取消不成为领域零分且不会再调度新任务 | 反思投影与生命周期取消测试（待实现），检查完整模型输入及调度记录 |
| [4.1](./requirements.md#req-4-1) | 只读预检列出分组、模型、预算、联网范围与副作用，但没有容器启动、模型调用或 Profile 写入 | 预检副作用测试（待实现），使用 fake 模型/容器和 Profile 快照 |
| [4.2](./requirements.md#req-4-2)、[4.3](./requirements.md#req-4-3) | start/resume 需确认当前预检且受预算/时限约束；取消后不启动新任务；恢复保留有效事实，所有终态均不发布 Profile | GEPA controller/worker 恢复测试（待实现），比较 Profile 摘要并断言 Publisher 未调用 |
| [5.1](./requirements.md#req-5-1)、[5.2](./requirements.md#req-5-2)、[5.3](./requirements.md#req-5-3) | 最佳候选和 seed 在 TUA holdout、GAIA、ALFWorld 用同一候选字段与可比计划运行；TUA 默认每任务各 3 次；缺失或不可比的组标为未完成 | 最终对照器 fake Attempt 测试（待实现）；真实端到端见 [7.2](./requirements.md#req-7-2) |
| [6.1](./requirements.md#req-6-1)、[6.2](./requirements.md#req-6-2)、[6.3](./requirements.md#req-6-3)、[6.4](./requirements.md#req-6-4) | 候选、差异、身份、预算、逐组原始指标、故障、成本、晋升门槛、证据不足和未覆盖场景均可审阅，且无凭据/私有评分泄漏 | 报告 fixture 测试（待实现）；人工检查一次生成报告与候选产物 |
| [7.1](./requirements.md#req-7-1) | 默认回归在无真实模型、Docker 和外部数据服务时覆盖主要契约 | `npm run test:gepa-adapter`、`npm --prefix benchmarks test`、`npm test`；执行环境无凭据与容器依赖 |
| [7.2](./requirements.md#req-7-2) | 显式真实端到端证明候选注入 TUA 隔离任务、官方 reward 回收、评分状态区分、holdout/跨环境对照完成且 default Profile 未变 | 经当次预检确认后运行真实端到端验收；比对请求身份、结果产物和运行前后 Profile 摘要。此项不纳入默认回归 |
| 仓库架构文档（`AGENTS.md`） | 如果实现改变模块职责、状态/持久化归属、跨模块数据流或生命周期，相关架构文档同步反映已实现行为 | 检查 `docs/architecture/` 中对应文档与实现一致；发现上述变化时同一变更中更新文档 |

### Latest Result

未执行。运行后按 delivery-loop.md 记录逐项证据、整体状态、时效、时间和被测代码状态。

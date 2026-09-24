# TUA-Bench 通用 Prompt 进化设计

## 审批摘要

### 方案

复用现有 GEPA 生命周期与 Prompt Evaluation 边界，增加 TUA-Bench 的连续 reward 适配、任务分组与最终配对验证。运行只产出候选、评测事实和报告；每个 benchmark 仍使用自身冻结的工具与权限 Profile。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 任务集划分 | 每次运行显式列出 TUA 训练、GEPA 验证、最终预留 ID；预检校验无交集、任务族覆盖和数据身份 | 分组可审阅、可复现；调用方需准备 ID 清单 |
| 预留集配对试次 | TUA holdout 每任务对 seed 与最佳候选默认各跑 3 次；请求可覆盖次数 | 预检按本次试次数计算容器与模型成本；GEPA 内循环预算另计 |
| Profile 组合与变异边界 | default Profile 提供两项待优化文本；各 benchmark 基准 Profile 提供身份、工具和环境权限 | 同一 Prompt 可跨环境运行，各环境保留自身能力与安全边界 |
| TUA reward 与信息隔离 | 官方 reward 作为连续目标；Agent 期间隐藏验证器、答案和私有评分素材 | 隔离失败时无有效分数；反思与报告不含私有评分内容 |
| Candidate-only 生命周期 | 复用 GEPA 生命周期，只保存候选和报告；字面泄漏匹配会阻断正向结论 | 不调用 ProfilePublisher；需要人工审阅，本机 default 与仓库内置值不变 |
| 跨环境对照与评测结论 | 用同一 Prompt 字段分别在 GAIA、ALFWorld 对照 seed，按任务、模型和试次计划配对 | 数据缺失或不可比时标记证据不足，不外推通用性 |

### 风险与待确认

- 风险等级：high；理由：TUA 任务可能联网且需容器和多次模型调用，评分边界必须防止 Agent 读取验证器；未来内置 Prompt 会影响 LazyGoal 的各类任务。
- 关键操作：每次真实启动或恢复前，审阅当次预检列出的任务、模型、试次、费用上界、容器和联网范围，并明确确认。
- 风险：默认 3 次试验仍受模型随机性和任务样本数限制；静态文本检查不能证明候选没有语义层面的任务过拟合；TUA-Bench 官方仓库标注 CC BY-NC，未来商业内置需另行核对授权。
- 待确认：无。

## Overview

本设计覆盖已批准 Requirements 1–7。GEPA 继续负责候选搜索与反思；TUA adapter 负责任务解析、隔离执行、官方 reward 与安全反馈；Prompt Evaluation 保持跨进程候选执行边界。GEPA 的训练和验证仍由 TUA 任务组成，TUA 预留集与非 TUA 对照只在最佳候选确定后运行，不参与候选选择。（需求 1–6）

运行以指定的本机 default Profile 快照生成 seed candidate。GEPA 只变异 `systemPrompt` 与完整 `instructions`。执行时将这两个字段覆写到各 benchmark 的受信任基准 Profile 上；Profile 身份、工具、权限、Prompt Bundle、输出契约和完成证据规则均由 benchmark / LazyGoal 保持不变。（需求 2）

默认回归使用 fake adapter 验证协议、数据、评分、隔离和报告。真实模型、Docker、公开网络任务只由明确预检并确认的真实运行触发。（需求 4、7）

## Key Design Decisions

### 任务集划分

运行请求必须显式提供 TUA-Bench 数据源位置/版本和 `trainTaskIds`、`validationTaskIds`、`holdoutTaskIds`。调用方控制分组；工具不随机抽样，也不根据 reward 自动重分组。预检读取任务族与资源信息，拒绝重复、未知 ID、集合交叉、家族覆盖缺失、任务镜像缺失或数据无法完整读取；拒绝发生在任何模型调用之前。（需求 1.1–1.3）

GEPA 只接收训练和 GEPA 验证两组。最终预留 ID 只由收尾对照器读取，并在 `run.json` 中与实际源版本冻结。源版本以仓库 revision 和关键任务文件摘要记录；本地修改状态另行记录，避免只记 `main` 或未固定的镜像标签造成不可复现。（需求 1、5）

### 预留集配对试次

TUA 最终预留集每个任务、每个候选默认运行三次；本次请求可显式指定其他正整数。seed 与 GEPA 选出的最佳候选使用相同次数、任务、模型身份和时限。每次使用独立隔离环境和 Attempt，报告展示计划次数、有效次数、平均 reward 与离散程度。（需求 4、5、6）

这里的“三次”是同一 Prompt 在最终评测阶段的重复执行，不是 GEPA 变异轮数。GEPA 变异轮数由其评测预算 `maxMetricCalls` 与 GEPA 停止/收敛行为控制；二者互不替代。TUA-Bench 论文采用每任务五次独立试验，本流程默认三次是为控制候选对照成本；报告须列出实际次数，不声称与论文指标统计口径完全一致。（需求 4、5、6）

GAIA 与 ALFWorld 对照任务、试次数和条件同样是本次请求的一部分。预检根据所有候选/seed 配对和重复次数显示评测量、容器网络需求、预计副作用与可取得的成本上界；不能可靠估算的费用标为未知，不伪造精确值。试次不足、不可比或执行失败都不能填成零分。（需求 4.1、5.2–5.3、6.2–6.3）

### Candidate-only 生命周期

沿用 `lazygoal gepa preflight/start/status/stop/resume/report`。在当前 `gepa-run@1` 请求中增加 TUA 数据分组、最终对照计划和 `candidate-only` 发布策略；遵循开发期单一当前协议，不另建持久化兼容层。TUA 运行在 GEPA 正常结束、停止、失败或恢复时都只保存 `best-profile.json` / Prompt 候选与比较报告，不调用 `ProfilePublisher.publish()`。现有其他 GEPA 用例的发布行为不改变。（需求 4.2–4.3、6.1）

最佳候选由官方 GEPA validation 选择。若 GEPA 运行在收尾比较期间停止，Worker 检查已原子提交的每个候选/任务/试次结果，恢复时跳过已完成且身份匹配的结果，只调度剩余项；请求、模型、数据、seed Profile 或候选身份漂移时拒绝续跑。停止请求不会启动下一个任务；正在进行的当前任务可到隔离环境安全收尾点后提交事实。（需求 4.2–4.3）

### Profile 组合与变异边界

GEPA 的 seed prompt 从冻结的本机 default Profile 读取。TUA、GAIA 与 ALFWorld 的 adapter 各自提供执行 Profile，运行时仅用 candidate 的 `systemPrompt` 和完整 `instructions` 覆写对应字段。每个 benchmark 的 Profile ID、`toolIds`、授权规则与领域协议来自它自己的受信任基准，且 seed / candidate 对照使用同一份。这样比较的是相同 Prompt 对不同 LazyGoal 环境能力的效果，而不会把 default Profile 的工具授权复制到不兼容的容器。（需求 2.1–2.3、5.2）

候选组件沿用 GEPA 的 `system_prompt` 与连续编号 `instruction_NNN` 编码。严禁候选改动其他字段；进入 Worker 的 ACP metadata 时，由公共派生逻辑和 Worker 侧基准 Profile 再校验一次。（需求 2.2–2.3）

### TUA reward 与信息隔离

TUA `reward` 是 GEPA 的连续标量目标，合法部分分数原样保留；只有 reward 达到官方完整完成阈值时，领域状态才是 passed。Prompt Evaluation 增加 benchmark 提供的有限数值 `metricScore`，让 Python GEPA adapter 不必解析 TUA 私有 `domainResult`；GAIA/ALFWorld 继续将 passed/failed 映射为 1/0。缺失、非有限或格式无效的 reward 产生协议/基础设施错误，不形成 score。（需求 3.1、3.4）

反思投影只包含有限的任务族、reward、完成状态和有界的通用阶段诊断。验证器 stdout、stderr、路径内容、脚本、答案和最终预留数据不进入模型可见字段。完整候选和报告可展示 Prompt 文本与分组指标，但必须脱敏凭据并剔除私有评分材料。（需求 3.3、6.1–6.4）

### 跨环境对照与评测结论

报告给出各 TUA 任务族和最终预留集的 seed/candidate 指标，以及 GAIA、ALFWorld 各自的配对结果。TUA 预留集候选均值必须严格高于 seed；GAIA/ALFWorld 每组均值不得低于 seed。任一条件失败时标为“不建议晋升”；任务或试次数不足、基线不可比、或任一必需环境未完成时标为“证据不足”。候选审计只执行任务 ID、标准答案、验证器文本和私有文件名的字面匹配；发现匹配时阻断正向结论并列明原因。报告不提供“可晋升”自动状态，数值门槛通过只表示可进入人工审阅；字面检查不宣称能证明语义上无任务过拟合。（需求 2.4、5、6）

## Architecture

```text
lazygoal gepa preflight/start
        |
        +--> TUA data inspector --> explicit partitions + task-family/resource facts
        |
        +--> GEPA lifecycle --> TUA Prompt Evaluation adapter --> isolated TUA worker
        |                            |                              |
        |                            |                              +--> candidate Profile overlay
        |                            |                              +--> Agent task actions
        |                            |                              +--> hidden verifier after Agent ends
        |                            +--> bounded score/feedback
        |
        +--> best candidate --> paired final evaluator
                                  +--> TUA holdout (3 trials by default)
                                  +--> GAIA tasks
                                  +--> ALFWorld tasks
        |
        +--> candidate artifact + report (no Profile publication)
```

TUA task loading、评分和容器仍由 benchmark adapter 所有。GEPA 只消费 Prompt Evaluation 权威结果、连续 `metricScore` 与有界轨迹。每次 Prompt Evaluation 的候选 Prompt 通过现有 Profile 派生和 ACP metadata 进入 Worker；不会把 Prompt 文本放入用户任务正文。（需求 2、3、5）

## Components and Interfaces

### Run request 与预检

扩展当前 `gepa-run@1` 严格请求字段，包含：本机 seed Profile 路径、TUA 仓库根目录、三个显式 TUA ID 集合、GEPA budget、任务时限、最终 TUA/GAIA/ALFWorld 对照计划和每组 trials。TUA-owned TypeScript inspector 计算实际 git revision 与有效文件摘要；调用方提供的版本字符串不作为权威身份。Cross-environment 任务允许为空或不可用；预检报告缺项，运行可保存 TUA 候选但最终结论必须是证据不足。TUA 的任务级 Manifest 由 inspector 按已核验 task ID 解析，并为既有单任务 Prompt Evaluation 边界生成规范化输入；不在 Python 中重写 TOML 或 TUA 评分规则。（需求 1、4、5）

`preflight` 不建容器、不调用模型、不修改 Profile；它报告所有集合、源 revision、任务族、模型、GEPA 预算、最终试次数、容器镜像准备状态、可能联网的任务及成本可知性。`start` 与 `resume` 必须带针对当次结果的显式确认。配置、任务源或候选身份发生漂移时恢复拒绝；剩余的已保存结果仍可读取。（需求 4）

### Benchmark adapter 与 Worker

在 Prompt Evaluation registry 注册 `tua-bench` adapter。Adapter 使用现有 TUA manifest loader、`TuaBenchEnvironmentSpec`、ACP 和 `HeadlessCompositionRoot`，新增受信任 TUA execution Profile 的候选覆盖与适配后的 GEPA score 投影；GAIA/ALFWorld adapter 不相互导入。（需求 2、3、5）

`TuaBenchEnvironmentSpec.prepareEnvironment()` 不再将 `tests/test.sh`、答案及仅评分素材放入 Agent 工作区，并在 Agent 启动前清理任务镜像中已有的可读副本。预检以实际 Agent 用户验证这些文件不可读/不可改。Agent 阶段结束且 Agent、Worker 及其命令进程退出后，宿主持有的 verifier 才复制到临时的 root-only 路径并按 `verifierUser` 执行；评分结果通过受限 reward 文件回收，结束后移除脚本。若任务镜像或状态无法证明无遗留 Agent 进程可读取私有素材，TUA result 为基础设施错误且没有 `metricScore`。（需求 3.1–3.4）

### 最终对照器与报告

最终对照器只接收 seed candidate、GEPA best candidate、冻结的分组和模型/试次计划。按任务与试次创建独立 Prompt Evaluation；每条已完成结果原子提交，报告按任务族与 benchmark 聚合。反思器只消费 TUA validation 的安全投影；最终 holdout 和 GAIA/ALFWorld 结果不回灌 GEPA、不触发二次优化。（需求 3.3、5、6）

## Data Models

运行请求中与本功能相关的新增部分采用以下语义；ID 与路径最终由当前协议 parser 严格校验：

```json
{
  "tuaDataset": {
    "repoRoot": "<local TUA-Bench checkout>",
    "trainTaskIds": ["..."],
    "validationTaskIds": ["..."],
    "holdoutTaskIds": ["..."]
  },
  "finalComparison": {
    "tuaHoldoutTrials": 3,
    "gaia": { "manifestPath": "...", "taskIds": ["..."], "trials": 1 },
    "alfworld": { "manifestPath": "...", "taskIds": ["..."], "trials": 1 }
  },
  "publicationPolicy": "candidate-only"
}
```

`tuaHoldoutTrials` 省略时取 3；显式值和 GAIA/ALFWorld trials 都须为正整数，且实际计划在本次预检中展示。GEPA adapter 的内部 score 是有限 `metricScore`；最终报告同时保留 TUA 官方 raw reward、passed 状态、计划与有效试次数、错误分类。`run.json` 冻结 task IDs、任务族、manifest/数据摘要、镜像身份、模型、预算、trial plan 与 default Profile digest；报告引用产物位置而不重复写入验证器或答案内容。（需求 1、3、4、6）

Run 输出扩展为：

```text
<run-dir>/
  request.json / run.json / state.json
  base-profile.json
  artifacts/best-profile.json
  gepa/                 # official GEPA checkpoint
  adapter/              # TUA train/validation attempts
  final-comparison/     # seed/candidate x task x trial 的权威结果
  report.json
```

## Error Handling

| 情况 | 分类与处理 |
|---|---|
| 数据源、分组、家族覆盖、镜像或 Profile 无效 | `invalid_request` / `dataset` / `profile`；模型调用前拒绝 |
| Agent 正常完成但 reward 较低或为部分值 | 有效领域结果；按官方 reward 进入 GEPA score |
| 验证器可见、执行失败、reward 缺失/非法 | `infrastructure_error` / `scoring_error`；不补零、不反思私有内容 |
| 任务执行成功但官方 reward=0 | 有效零分领域结果 |
| 用户停止、任务取消、底层故障 | 与领域失败分开保存；停止后不启动新 trial，resume 保留已提交结果 |
| TUA holdout 或跨环境组不可用/不完整 | 候选与已有结果保留；报告 `incomplete` / `insufficient_evidence`，不推荐晋升 |
| candidate-only 运行完成 | `candidate_only` 终态；留下候选与报告，不触碰 default Profile |

GEPA 内循环出现基础设施/协议错误时，Adapter 立即终止该轮优化，避免把故障转换成零分；已提交 Attempt 和 GEPA checkpoint 保留。最终对照器对单项错误记为无有效试次并继续其余已计划任务，除非整体取消或数据身份不再可信。（需求 3.4–3.5、4.2–4.3、6.3）

## Research Findings

- 现有 `LazyGoalGEPAAdapter` 将 `passed/failed` 映射为 `1.0/0.0`，会丢弃 TUA 的部分 reward；TUA Prompt Evaluation 必须向 GEPA 暴露 adapter-owned 连续分数。
- 当前 `TuaBenchEnvironmentSpec.prepareEnvironment()` 会把 `tests/test.sh` 复制到 Agent 工作目录，`preflight()` 也要求它已在该目录。这不满足本 Spec 的训练隔离要求，必须在 TUA 接入 GEPA 时收紧评分脚本的生命周期与访问权限。
- 现有 GEPA Worker 在正常完成时调用 `ProfilePublisher` 更新目标 Profile。TUA candidate-only 运行必须跳过此调用；仅保存 best Profile artifact 不能单独阻止写回。
- TUA-Bench 论文说明其任务使用检查最终环境状态并返回 scalar reward 的自动验证器；每个 agent/model/config 对每个任务运行 5 次独立试验并报告均值。本流程默认 3 次用于成本受限的候选对照，不直接等同其官方统计口径。[论文](https://arxiv.org/html/2606.28480v1)
- TUA-Bench 官方仓库目前标记 CC BY-NC，并建议环境准备后执行 `uv run setup-env`；最终预检必须核对本地任务与镜像已经就绪，未来商业内置另行审查授权。[官方仓库](https://github.com/facebookresearch/TUA-Bench)

## Testing Strategy

1. **纯离线分组校验**：覆盖 train/validation/holdout ID 交集、未知/重复 ID、任务族覆盖、数据 digest 漂移和镜像缺失；验证拒绝路径在模型调用前结束。
2. **候选传递与冻结字段**：用确定性模型检查 `systemPrompt`、每条 `instructions` 实际抵达 TUA/GAIA/ALFWorld Worker；确认每个环境的 Profile ID、工具授权、Prompt Bundle、输出与 Evidence 规则未变，seed/candidate 条件相同。
3. **TUA reward / 反馈隔离**：覆盖部分 reward、完整 reward、零 reward、非有限/缺失 reward；Agent 执行时无法读取或改写验证器、答案及私有评分素材，评分前 Agent 子进程已退出；反思请求、Attempt 汇总和最终报告不含验证器正文、原始 verifier 输出、答案或凭据。
4. **GEPA 生命周期和恢复**：覆盖预检无容器/模型/Profile 副作用、每次 start/resume 确认、GEPA 预算与超时上限、停止边界、收尾阶段重启后跳过已有有效试次、默认 Profile 始终字节不变、candidate-only 终态无 `ProfilePublisher.publish()`。
5. **报告判定**：以合成 seed/candidate 事实验证 TUA 任务族和 holdout 默认 3 次配对汇总及显式次数覆盖、GAIA/ALFWorld 对照、未完成与有效样本不足、不建议晋升阈值和未覆盖场景展示。
6. **显式真实 E2E**：经确认后至少验证一个 TUA 任务的两字段候选注入、隔离评分及 reward 回收，再运行预留集与可用跨环境组，检查模型/任务/试次身份和本机 default Profile 未变。该验收不进入默认 `npm test`。

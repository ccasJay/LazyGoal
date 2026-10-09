# GEPA 优化

官方 GEPA 候选搜索、反思和生命周期控制。本文描述当前实现、使用边界与限制；[公开入口](../src/lazygoal_gepa/adapter.py)。

## 职责与使用

通过本模块的公开入口使用上述能力；[公开入口](../src/lazygoal_gepa/adapter.py)。状态或副作用由调用方在所属边界控制。

## 边界与限制

本模块不替代其依赖模块的协议或持久化职责；具体输入、失败语义与类型以链接的源码契约为准。

## 操作说明

运行前提、命令和结果示例见 [使用说明](./usage.md)。

## GEPA lifecycle control plane

GEPA 的长任务优化由 `lazygoal gepa` 控制面管理，而不是由 Web Server 或 benchmark
Composition Root 持有。公开机器接口为 `preflight`、`start`、`status`、`stop`、`resume`
和 `report`；`start`/`resume` 必须带调用方明确确认的 `--yes`。TUA 还要求携带对应当前
`preflight` 的 `confirmationDigest`，以拒绝确认后发生的请求、数据、模型或 Profile 漂移。
TUA 候选运行只保存产物，不改写本机 default Profile；其他 GEPA benchmark 仍按各自发布策略处理。

Python 生命周期控制器为每次运行创建
`~/.lazygoal/workspaces/<workspace-id>/gepa/runs/<runId>/`，其中 `run.json` 和 `request.json` 是冻结身份，
`state.json` 是原子提交的可查询投影，`owner.json` 记录单 Worker 所有权，`gepa/`
保存官方 GEPA `run_dir`，`adapter/`、`reflection/` 和 `artifacts/` 保存有界评测、
反思及结果产物。`status`/`report` 只读取这些权威文件；它们不会从日志或私有
checkpoint 推导成功状态。每个 Run 同时最多一个 Worker。

TUA GEPA 请求的只读预检由 Python 控制器调用 LazyGoal CLI 的 TUA Inspector 完成。Inspector
校验显式 train/validation/holdout 集合的互斥性、任务族覆盖、所选任务资源及本机镜像，返回
TUA 源 revision、任务资源摘要、镜像身份、网络任务和时限；返回值不包含任务指令或验证器正文。
预检把该摘要、模型与 Profile 身份、每任务时限、GEPA 预算及轮次停止阈值一起展示，并将
输入摘要冻结到 `run.json`。`start` 与 `resume` 只有在确认当前 `confirmationDigest` 后才会启动
Worker；镜像检查只读取本机 Docker 元数据，不拉取镜像或启动容器。Worker 按冻结任务 ID 生成单任务
Prompt Evaluation Manifest，TUA 数据集及候选身份漂移会阻止恢复。

GEPA 的 metric-call stopper 只在迭代边界检查。TUA 预检显示实际 reflection minibatch；未显式
配置时最多使用三条训练任务，训练集更小时缩小到其任务数，显式配置超过训练集则拒绝。
Worker 为一轮预留父候选和子候选训练批次，
以及一次完整验证集评测，并据此降低传给官方 GEPA 的停止阈值，使实际评测调用不超过请求预算；
任务级 Agent/verifier 时限由冻结的 TUA 任务定义执行。停止、失败和恢复保留已提交的 GEPA
checkpoint 与最佳候选 artifact。TUA 正常完成报告为 `candidate_only`；它表示候选产物完整，
不表示 Prompt 已发布。

GEPA 选定最佳候选后，Worker 重新核对 TUA Inspector 与请求中引用的 Manifest 摘要，再运行冻结的
最终对照计划。TUA holdout 每个任务默认对 seed 与候选各运行三次；GAIA、ALFWorld 使用请求中的
任务和试次数。每个 Attempt 都通过该 benchmark 自己的 Prompt Evaluation adapter、基准 Profile、
工具权限和评分器执行，同一配对共享任务 Manifest 与 Working LM 身份。GEPA metric-call 预算不包括
收尾对照试次。

`final-comparison/plan.json` 冻结候选、模型、任务、Manifest 摘要和试次计划；`attempts/` 按
benchmark、任务、trial 与 seed/candidate 分开原子提交权威领域状态和分数，TUA 保存官方 reward，
GAIA/ALFWorld 保存各自 passed/failed 映射分。对照摘要写入 `final-comparison/result.json`，
区分完整、未完成、停止和证据不足，不保存标准答案或 verifier 正文。恢复时会复用身份匹配的有效
领域结果并继续缺失项；基础设施失败保留为无分数结果，停止标记阻止启动下一项。生命周期
`artifacts/report.json` 从冻结请求、候选产物、审计摘要和最终对照生成可审阅投影：包含 seed/候选
Prompt 组件差异、数据与模型身份、预算、逐任务族和逐环境配对指标、失败与覆盖情况、可得 Token 用量，
以及明确标记为未知的费用。审计命中或凭据会使候选文本脱敏并阻断正向建议；缺失证据标为不足，满足
离线门槛也只要求人工审阅，绝不自动发布 default Profile。`final-comparison/result.json` 与 Attempt
仍是领域评测的权威记录，报告会校验其身份并投影，不替代它们。

候选评测仍由现有 GEPA Adapter 和 `prompt-evaluation@1` 负责。Working LM 固定绑定
LazyGoal Home 的 `profiles/default.toml`，执行指定 benchmark 的 Agent；Reflection LM 通过
`[gepa].reflection_profile` 绑定另一个 LLM Profile，仅执行无 Tool 的文本反思。两者的
Profile、模型身份和凭据边界在 Run manifest 中冻结，恢复时必须保持一致。

`stop` 只请求官方 GEPA 停止边界，不向 Worker 发送进程信号，也不删除产物。Worker
观察到停止请求后保留 checkpoint 并进入 `stopped`；`resume` 只允许在 Worker 不存活、
目标 Profile 摘要未漂移且 checkpoint 可读时复用同一 `run_dir`，并重新要求确认。

发布不是普通评测的副作用。生命周期产物和报告区分最佳 Profile artifact、publication
状态与 `complete`；对于允许发布的 benchmark，只有正常优化完成、候选和目标 Profile 仍通过校验且目标摘要未变化时，
Worker 才会原子更新
`~/.lazygoal/agent-profiles/default.json` 的 `systemPrompt` 与完整 `instructions`。停止、失败、
外部 Profile 修改或写入失败不得覆盖当前 Profile；此类结果保留最佳 artifact 并报告
`publish_blocked`（或对应失败分类）。TUA GEPA 固定使用 candidate-only，不调用发布器；成功运行
仅表示候选 artifact 与报告完整，必须经人工审阅后再决定是否内置。真实双模型 smoke 不进入默认回归。

GAIA 真实端到端闸门由 [`lazygoal-gepa-gaia-e2e`](../src/lazygoal_gepa/gaia_e2e.py)
提供，根脚本为 `npm run e2e:gaia-real`。它要求调用方同时提供单任务 GAIA
`gepa-run@1` 请求、`gaia-worker-profile` 路径，并设置 `LAZYGOAL_GAIA_REAL_E2E=1`；
`--dry-run` 只执行本地请求、Manifest、Profile 和模型身份 preflight，不创建容器或调用模型。
真实执行先对 validation Manifest 做一次 `prompt-evaluation@1` 单任务评测，再按
`preflight → start → status → report` 查询 GEPA 生命周期。Prompt Evaluation 的
`passed/failed` 是领域结果；生命周期报告的 `complete` 与发布状态独立判断，错误答案不会被
提升为整条 E2E 协议成功。该入口不属于默认 `npm test` 回归。

模型 token 用量数据流：LLM Adapter 把供应商用量归一化写入
`providerMetadata.usage`（`{ inputTokens, outputTokens, cachedInputTokens? }`，
缺失时字段缺省），随 Diagnostic Trace 逐调用落盘；Headless Root 按 run 累计
（无用量的调用只计入 `missingCalls`）并附到模型事实，报告的每个 Attempt 记录
该次尝试的聚合用量，summary 只对已存在用量求和并把无用量数据的尝试计入
`attemptsMissingUsage`。用量不进入 Domain Event、Goal Snapshot 或模型上下文。

pi-ai 的 `piUsage` 只供诊断，不进入正式用量累计；这些调用计入 `missingCalls`，
不能把汇总中的零值理解为真实零消耗。

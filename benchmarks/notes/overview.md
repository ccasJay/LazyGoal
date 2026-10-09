# 共享评测框架

Headless Composition Root、隔离 Worker、Attempt 和 Prompt Evaluation 协议。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## Scope

`benchmarks` 是独立的无界面评测入口，不属于 Web Server 的 Composition Root。当前已实现
通用单 task、单 Run Headless Composition Root，以及 ALFWorld TextWorld、GAIA、TUA-Bench
和 SWE-bench Verified 的显式评测适配。ALFWorld 提供 Profile、固定 Manifest、容器内 Python JSONL
sidecar、专用 Tool 和机器可读报告。共享 ACP、进程、Worker 构建和隔离容器位于
[`benchmarks/src/`](../src)，具体 benchmark 只声明环境和评分适配。

## Entry point

`bin/lazygoal.cjs` 在参数前缀严格为 `eval alfworld`、`eval swebench`、`eval gaia` 或
`eval prompt` 时分别转发到
对应 benchmark CLI（`grade` 和 `load` 亦按相同前缀分发）；其余普通启动参数进入
[`apps/goal-server`](../../apps/goal-server/README.md)。评测入口要求固定
Manifest：

```text
lazygoal eval alfworld --manifest <path> [--profile alfworld-profile]
  [--report <path>] [--min-success-rate <0..1>]
  [--max-infrastructure-retries <n>]
lazygoal eval gaia --manifest <path> [--output <dir>]
lazygoal eval prompt --request <request.json>
```

GAIA 与 SWE-bench 只保留机器可调用的 Headless/ACP 评测入口；已移除 `--tui`、Ink
渲染和交互式单题会话。Benchmark 命令按 Profile、Manifest 与环境配置完成预检后运行
隔离 Worker，并输出机器可读报告；评测不启动 Web 服务或交互终端。

入口按 Profile → Manifest → 领域环境配置的顺序校验配置，全部通过后才构造模型
Adapter 和容器 Worker。ALFWorld 的 Python/sidecar 预检在容器内完成；SWE-bench 的
官方 harness 预检仍在宿主评分边界完成。GAIA 使用 managed 镜像安装 Python 文件处理库，
通过 `preflight` 验证依赖，任务通过宿主代理 `web_search`/`web_fetch` 工具、容器内
`bash` 计算工具及容器内 `submit_answer` 工具作答。模型使用与 CLI 相同的 [配置解析与工厂](../../packages/config/notes/model-configuration.md#模型配置与入口)，
不支持的 provider/mode、未知目录模型及容量错误均在 Episode 与 Goal 创建前失败。报告写到 `--report` 指定的 JSON 文件，未指定时只写
stdout；诊断和配置错误写 stderr。成功率低于阈值时仍保留完整报告并返回非零码。
SWE-bench 使用单次容器作答、补丁导出与独立官方评分；生命周期、产物与限制见
[SWE-bench Evaluation](../swebench/notes/overview.md)。GAIA 评分使用归一化精确匹配算法，支持独立
`grade gaia` 入口离线评分且不消耗模型调用。以下章节描述 ALFWorld 接线。
数据准备使用 `npm --prefix benchmarks run alfworld:download`；GAIA 数据集下载使用 `lazygoal load gaia`。
评测 CLI 与独立 preflight 脚本共用同一个有界 Python 探针执行器，测试入口仍可注入
替身探针，不会改变预检顺序或错误语义。

隔离容器默认使用 `network=none`，只有 benchmark `EnvironmentSpec` 可显式选择 bridge。
Spec 还可显式继承宿主代理；共享层只注入 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY`、
`NO_PROXY` 及其小写形式，不传递其他宿主环境变量。代理值不进入 Docker 命令参数，
回环代理主机在容器环境中改写为 `host.docker.internal`。GAIA 启用 bridge 和该代理继承，
其他 benchmark 保持各自网络策略。

ALFWorld 测试 Profile 只从 LazyGoal Home 的全局
`agent-profiles/alfworld-profile.json` 加载，不会从 `benchmarks` 源码目录或 workspace
Profile 覆盖层读取。
显式入口同时自动读取 `benchmarks/alfworld/.env.alfworld`，命令行环境变量覆盖文件值。
`grade alfworld`、`grade swebench` 和 `grade gaia` 只读取已有报告、Attempt 和产物，不构造模型。

## Episode lifecycle

[`EvaluationRunner`](../alfworld/src/evaluation-runner.ts) 按 Manifest 顺序
把每个任务委托给 [`runAlfworldSupervisor`](../alfworld/src/supervisor.ts)，由
共享 [`IsolatedEnvironment`](../src/isolated-environment.ts) 创建独立容器，
再在容器 Worker 内装配通用 [`HeadlessCompositionRoot`](../src/headless-composition-root.ts)。
ALFWorld Reset 与 Step 专用 Tool 使用不可变 Input Contract 声明其输入规范（Reset 为 strict empty object，Step 为非空 string `command`），由 Root 通过 `createToolRegistration` 封装为 `ToolRegistration` 注册入 Registry，并在执行时共享 Runtime 的单次 Contract 解析与结构/语义分层校验边界。每个 task 默认写入当前 workspace Home 的 `workspaces/<workspace-id>/benchmarks/` 下独立的 LazyGoal
Goal Snapshot 和 JSONL Trajectory，并可启用独立 Diagnostic Trace；Snapshot 的
`committedThroughSequence` 是恢复边界，未提交 tail 只供审计，不会自动 replay。
Root 为每个 Goal 固定冻结 Prompt Bundle v1、`structured@1`、`trajectory-layered@1` 和
`bm25-lite@1`，并把同一 `TrajectoryModelContextAssembler` 注入 `LLMStepExecutor`；
模型上下文因此从当前 Trajectory Snapshot 组装。benchmark 目前只装配 Trajectory 层，
不自动创建 Cold Trajectory 索引或 Lookup Port；需要检索的 benchmark 必须额外提供该依赖。
任务描述符 `BenchmarkTaskDescriptor.objective` 与 `completionCriteria` 会作为初始用户消息中的执行上下文提供给 Agent；criteria 支持纯文本与携带验收声明的结构化条件，不转换为 `Run.approvedTask`，也不成为 Runtime 完成门槛。Runtime 的 `complete` 仍须按当前 Run 已提交 Observation Evidence 校验；Benchmark 的最终成功由环境评分决定，模型完成声明不能覆盖环境结果。基础设施重试追加新的 Attempt，不覆盖原始记录。
通用 Headless Root 为每个 task 创建普通 Run，不生成任务提案或自动批准任务，并在该 Run 的 waiting 或终态返回；它不会因为 GoalPlan 仍有 pending Todo 而串行创建后继 Run。后继 Run 只能由持久化 Goal 的显式 `GoalCoordinator.continue` 触发。GoalPlan 是否存在独立于 Run 模式。

GAIA ACP Worker 的默认 `maxSteps` 为 `0`，表示不设置 Runtime 步数上限；只有调用方显式配置正数时才会产生 `max_steps_exceeded`。Worker 仅将该真实 Runtime 终态映射为 ACP `max_turn_requests`，普通完成/等待映射为 `end_turn`，取消映射为 `cancelled`；由模型自身决策行为引起的终止（如 `INVALID_AGENT_DECISION`）与单任务超时（`TASK_TIMEOUT`）在 GAIA Supervisor 中统一判定为未作答领域失败（`status: "completed"`, `correct: false`，作为 badcase 保留轨迹），其他 Runtime 或清理错误保留为基础设施失败，不伪装成受支持终态。外部用户主动发起的取消信号（`signal`）则保持全局取消（`status: "cancelled"`）。

容器内 Python sidecar 将 TextWorld 1.6.2 的 `GameState` reset 返回值和三元组 `step` 返回值
归一化为稳定的 JSONL Reset/Step 结构，同时继续接受旧的二元/四元返回形状。
TextWorld 不提供部分目标完成率时，sidecar 以 `won` 生成二值完成率。
Runner 的 `max_steps_exceeded` 记录为 `task_not_won`，Tool/协议执行错误记录为
`infrastructure`；模型返回 `fail` 也记录为 `task_not_won`。只有缺少这些终止证据时
才使用 `unknown`。

[`EvaluationReport`](../alfworld/src/report.ts) 只保存任务、环境统计、
配置标识、重试序号和失败类别；完整 Goal Snapshot、事实 Trajectory 和可选诊断 Trace
由 Root 的持久化绑定单独保存，不混入报告 JSON，也不保存模型凭据。共享
[`AttemptRecorder`](../src/attempt-recorder.ts) 在每个任务阶段结束后原子写入
`attempts/<taskId>/attempt-<n>.json`，领域字段仍由 ALFWorld 自己解释。新的 benchmark
应实现通用 adapter，并将 task 映射到自己的持久化 namespace；不应复制 Storage 编解码
或 Runtime 提交语义。

## Prompt Evaluation

[`runPromptEvaluationCli`](../src/prompt-evaluation/cli.ts) 接受当前版本的单候选
JSON 请求。候选只能覆盖 benchmark 基准 Profile 的 `systemPrompt` 与 `instructions`；公共层
派生并校验冻结字段，ALFWorld、GAIA 和 TUA Worker 在创建 Headless Root 前再次校验同一 Profile。
TUA Worker 的 ACP metadata 也可携带成对的基准与候选 Profile，并在创建 Headless Root 前
以其内置 Profile 重验 Prompt 字段和冻结的身份、展示字段及工具白名单。注册的 TUA Prompt
Evaluation adapter 通过单任务 Manifest 和统一隔离容器执行 Agent，并在 Agent 结束后运行 verifier。
评分前隔离层比较宿主进程快照；Agent 阶段的新增进程仍存活、评分素材残留或无法检查时，评测失败且不返回分数。
外部调用方不参与 ACP Session，ACP 与 LLM RPC 仍只存在于宿主和隔离 Worker 之间。

CLI 组合根的 adapter factory registry 是 benchmark 支持范围的唯一来源：请求解析使用其
ID 集合，且只实例化请求指定的 factory。协议与结果持久化将 benchmark ID 视为非空稳定
字符串，不枚举领域类型；新增 benchmark 只需实现并注册 TypeScript adapter factory。

[`PromptEvaluationRunner`](../src/prompt-evaluation/runner.ts) 按 Manifest 顺序为每个
任务创建独立输出目录，并由 benchmark adapter 返回领域判定。ALFWorld 只信任 `won`，GAIA
只信任答案评分，TUA 保留有限官方 reward；模型完成文本和进度事件不参与判定。领域失败属于有效评测结果并返回退出码
`0`，基础设施失败、请求校验失败和取消分别返回 `1`、`2`、`130`。
TUA 单任务清单包含 `repoRoot` 和一个 `taskId`，任务定义由 TUA 仓库 Manifest 加载。
Agent 工作区不会收到验证器与评分目录；宿主进程快照证明 Agent 新增进程退出后，adapter 才在临时目录暂存并以配置用户运行 verifier。
缺失或无效 reward、非零 verifier 退出和进程隔离失败不产生 `metricScore`。

每个任务原子提交带候选哈希与模型身份的 Attempt；整次评测在
`<outputDirectory>/evaluations/<evaluationId>/result.json` 原子提交汇总。stdout JSON Lines 事件
明确标记为非权威，终态事件只在汇总提交后携带 `resultPath`。显式
`prompt-evaluation:smoke` 使用确定性模型替身验证 CLI、容器、ACP、LLM RPC、领域评分和产物
回收，不进入默认回归。

[`prompt-evaluation/gepa`](../../prompt-evaluation/gepa) 通过官方 `gepa==0.1.4` 实现外部
优化适配。GEPA 负责候选搜索与反思；Python adapter 只校验通用单任务 Manifest 外层结构、
候选组件和跨进程结果身份，不枚举 benchmark ID，也不解释领域 Manifest 或 Profile。
benchmark 专用校验由 TypeScript adapter 或请求创建入口拥有。Python adapter 按 batch
顺序以无 shell 子进程调用 `lazygoal eval prompt`，只从受限输出目录内的权威 `result.json`
取值。TUA 使用有限官方 `metricScore` 原值（包含零与部分分）；其他 benchmark 的领域
`passed/failed` 分别映射为 `1.0/0.0`。协议、基础设施和取消错误不计分并立即停止后续样本。
TUA 反思只接收任务族、官方 reward、完成状态和有界通用阶段诊断，不暴露任务标识、答案、
验证器内容、错误原文或产物路径；其他 benchmark 的反思轨迹保留有界结果投影和产物路径。
两者都不读取完整 Diagnostic Trace；进程输出有大小上限，持久化前会脱敏继承环境中的凭据值。
adapter 的确定性测试进入根回归，真实
GEPA 生命周期 smoke 需显式运行且可能消耗 Working LM、Reflection LM 和容器额度。
TUA GEPA Worker 将官方 GEPA 选择器固定为 `all`，让一次提案覆盖 seed 中的 `system_prompt`
和全部 `instruction_NNN` 组件；其他 benchmark 保持 `round_robin`。每个 TUA 候选在评测前
经 TUA Inspector 对显式训练与验证任务做字面泄漏审计，安全结果保存在 Run 的
`candidate-audits/`。终态报告只输出命中任务、Prompt 组件和类别；最佳候选命中或缺少审计
都会阻断正向结论。审计不读取 holdout，也不声称排除语义层面的任务过拟合。
GAIA GEPA 的数据校验只接受 validation Level 1/2；任务可声明附件，但每个附件必须是
`dataRoot` 内存在的相对文件，随后由 GAIA Environment 挂载到隔离容器。Level 3、test
split 和自动发现不进入该生命周期。

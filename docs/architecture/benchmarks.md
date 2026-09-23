# Benchmark Evaluation

## Scope

`benchmarks` 是显式评测入口，不属于普通 TUI 的 Composition Root。当前已实现
通用单 task、单 Run Headless Composition Root，以及 ALFWorld TextWorld、GAIA 和 SWE-bench
Verified 的显式评测适配。ALFWorld 提供 Profile、固定 Manifest、容器内 Python JSONL
sidecar、专用 Tool 和机器可读报告。共享 ACP、进程、Worker 构建和隔离容器位于
[`benchmarks/src/`](../../benchmarks/src/)，具体 benchmark 只声明环境和评分适配。

## Entry point

`bin/lazygoal.cjs` 在参数前缀严格为 `eval alfworld`、`eval swebench`、`eval gaia` 或
`eval prompt` 时分别转发到
对应 benchmark CLI（`grade` 和 `load` 亦按相同前缀分发），其它参数仍
进入 [`packages/tui/src/cli.tsx`](../../packages/tui/src/cli.tsx)。评测入口要求固定
Manifest：

```text
lazygoal eval alfworld --manifest <path> [--profile alfworld-profile]
  [--report <path>] [--min-success-rate <0..1>]
  [--max-infrastructure-retries <n>]
lazygoal eval gaia --manifest <path> [--output <dir>]
lazygoal eval prompt --request <request.json>
```

单任务 TUI 入口在 `eval gaia` 与 `eval swebench` 下使用
`--tui --task <id> --output-dir <path> [--mode auto|review]`。它先挂载 Ink
初始化页，再由 [`runTuiWithSandbox`](../../benchmarks/src/tui-benchmark-runner.ts)
准备镜像、容器、Worker 和 preflight；沙箱就绪后把同一个挂载切换为带初始 Goal
的 SessionController，会话结束或清理失败后统一卸载。该路径构建
`tools-worker-entry` 提供 Tool RPC；ACP Worker 仅用于 Headless 评测，不能作为
透明代理的工具服务。

入口按 Profile → Manifest → 领域环境配置的顺序校验配置，全部通过后才构造模型
Adapter 和容器 Worker。ALFWorld 的 Python/sidecar 预检在容器内完成；SWE-bench 的
官方 harness 预检仍在宿主评分边界完成。GAIA 使用 managed 镜像安装 Python 文件处理库，
通过 `preflight` 验证依赖，任务通过宿主代理 `web_search`/`web_fetch` 工具、容器内
`bash` 计算工具及容器内 `submit_answer` 工具作答。模型使用与 CLI 相同的 [配置解析与工厂](./llm.md#配置)，
不支持的 provider/mode、未知目录模型及容量错误均在 Episode 与 Goal 创建前失败。报告写到 `--report` 指定的 JSON 文件，未指定时只写
stdout；诊断和配置错误写 stderr。成功率低于阈值时仍保留完整报告并返回非零码。
SWE-bench 使用单次容器作答、补丁导出与独立官方评分；生命周期、产物与限制见
[SWE-bench Evaluation](./swebench.md)。GAIA 评分使用归一化精确匹配算法，支持独立
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

[`EvaluationRunner`](../../benchmarks/alfworld/src/evaluation-runner.ts) 按 Manifest 顺序
把每个任务委托给 [`runAlfworldSupervisor`](../../benchmarks/alfworld/src/supervisor.ts)，由
共享 [`IsolatedEnvironment`](../../benchmarks/src/isolated-environment.ts) 创建独立容器，
再在容器 Worker 内装配通用 [`HeadlessCompositionRoot`](../../benchmarks/src/headless-composition-root.ts)。
ALFWorld Reset 与 Step 专用 Tool 使用不可变 Input Contract 声明其输入规范（Reset 为 strict empty object，Step 为非空 string `command`），由 Root 通过 `createToolRegistration` 封装为 `ToolRegistration` 注册入 Registry，并在执行时共享 Runtime 的单次 Contract 解析与结构/语义分层校验边界。每个 task 默认写入当前 workspace Home 的 `workspaces/<workspace-id>/benchmarks/` 下独立的 LazyGoal
Goal Snapshot 和 JSONL Trajectory，并可启用独立 Diagnostic Trace；Snapshot 的
`committedThroughSequence` 是恢复边界，未提交 tail 只供审计，不会自动 replay。
Root 为每个 Goal 固定冻结 Prompt Bundle v1、`structured@1`、`trajectory-layered@1` 和
`bm25-lite@1`，并把同一 `TrajectoryModelContextAssembler` 注入 `LLMStepExecutor`；
模型上下文因此从当前 Trajectory Snapshot 组装。benchmark 目前只装配 Trajectory 层，
不自动创建 Cold Trajectory 索引或 Lookup Port；需要检索的 benchmark 必须额外提供该依赖。
任务描述符 `BenchmarkTaskDescriptor.completionCriteria` 支持纯文本与携带验收声明的结构化条件；Root 在启动前执行结构校验与 Profile 工具白名单授权检查，将声明注入 Goal Task。基础设施重试追加新的 Attempt，不覆盖原始记录。报告的成功事实只有环境返回的
`won=true`，模型 `complete` 与验收声明不能覆盖环境失败。
通用 Headless Root 为每个 task 创建一个 Goal 和一个 Run，自动批准首轮任务提案后在该 Run 的 waiting 或终态返回；它不会因为 GoalPlan 仍有 pending Todo 而串行创建后继 Run。后继 Run 只能由持久化 Goal 的显式 `GoalCoordinator.continue` 触发。当前 benchmark descriptor 仍创建 normal Goal，因此不会隐式 materialize GoalPlan。

GAIA ACP Worker 的默认 `maxSteps` 为 `0`，表示不设置 Runtime 步数上限；只有调用方显式配置正数时才会产生 `max_steps_exceeded`。Worker 仅将该真实 Runtime 终态映射为 ACP `max_turn_requests`，普通完成/等待映射为 `end_turn`，取消映射为 `cancelled`；由模型自身决策行为引起的终止（如 `INVALID_AGENT_DECISION`）与单任务超时（`TASK_TIMEOUT`）在 GAIA Supervisor 中统一判定为未作答领域失败（`status: "completed"`, `correct: false`，作为 badcase 保留轨迹），其他 Runtime 或清理错误保留为基础设施失败，不伪装成受支持终态。外部用户主动发起的取消信号（`signal`）则保持全局取消（`status: "cancelled"`）。

容器内 Python sidecar 将 TextWorld 1.6.2 的 `GameState` reset 返回值和三元组 `step` 返回值
归一化为稳定的 JSONL Reset/Step 结构，同时继续接受旧的二元/四元返回形状。
TextWorld 不提供部分目标完成率时，sidecar 以 `won` 生成二值完成率。
Runner 的 `max_steps_exceeded` 记录为 `task_not_won`，Tool/协议执行错误记录为
`infrastructure`；模型返回 `fail` 也记录为 `task_not_won`。只有缺少这些终止证据时
才使用 `unknown`。

[`EvaluationReport`](../../benchmarks/alfworld/src/report.ts) 只保存任务、环境统计、
配置标识、重试序号和失败类别；完整 Goal Snapshot、事实 Trajectory 和可选诊断 Trace
由 Root 的持久化绑定单独保存，不混入报告 JSON，也不保存模型凭据。共享
[`AttemptRecorder`](../../benchmarks/src/attempt-recorder.ts) 在每个任务阶段结束后原子写入
`attempts/<taskId>/attempt-<n>.json`，领域字段仍由 ALFWorld 自己解释。新的 benchmark
应实现通用 adapter，并将 task 映射到自己的持久化 namespace；不应复制 Storage 编解码
或 Runtime 提交语义。

## Prompt Evaluation

[`runPromptEvaluationCli`](../../benchmarks/src/prompt-evaluation/cli.ts) 接受当前版本的单候选
JSON 请求。候选只能覆盖 benchmark 基准 Profile 的 `systemPrompt` 与 `instructions`；公共层
派生并校验冻结字段，ALFWorld 和 GAIA Worker 在创建 Headless Root 前再次校验同一 Profile。
外部调用方不参与 ACP Session，ACP 与 LLM RPC 仍只存在于宿主和隔离 Worker 之间。

CLI 组合根的 adapter factory registry 是 benchmark 支持范围的唯一来源：请求解析使用其
ID 集合，且只实例化请求指定的 factory。协议与结果持久化将 benchmark ID 视为非空稳定
字符串，不枚举领域类型；新增 benchmark 只需实现并注册 TypeScript adapter factory。

[`PromptEvaluationRunner`](../../benchmarks/src/prompt-evaluation/runner.ts) 按 Manifest 顺序为每个
任务创建独立输出目录，并由 benchmark adapter 返回领域判定。ALFWorld 只信任 `won`，GAIA
只信任答案评分；模型完成文本和进度事件不参与判定。领域失败属于有效评测结果并返回退出码
`0`，基础设施失败、请求校验失败和取消分别返回 `1`、`2`、`130`。

每个任务原子提交带候选哈希与模型身份的 Attempt；整次评测在
`<outputDirectory>/evaluations/<evaluationId>/result.json` 原子提交汇总。stdout JSON Lines 事件
明确标记为非权威，终态事件只在汇总提交后携带 `resultPath`。显式
`prompt-evaluation:smoke` 使用确定性模型替身验证 CLI、容器、ACP、LLM RPC、领域评分和产物
回收，不进入默认回归。

[`prompt-evaluation/gepa`](../../prompt-evaluation/gepa/) 通过官方 `gepa==0.1.4` 实现外部
优化适配。GEPA 负责候选搜索与反思；Python adapter 只校验通用单任务 Manifest 外层结构、
候选组件和跨进程结果身份，不枚举 benchmark ID，也不解释领域 Manifest 或 Profile。
benchmark 专用校验由 TypeScript adapter 或请求创建入口拥有。Python adapter 按 batch
顺序以无 shell 子进程调用 `lazygoal eval prompt`，只从受限输出目录内的权威 `result.json`
取值。领域 `passed/failed` 分别映射为 `1.0/0.0`，协议、基础设施和取消错误不计分并立即停止
后续样本。反思轨迹只保留有界结果投影和产物路径，不读取完整 Diagnostic Trace；进程输出
有大小上限，持久化前会脱敏继承环境中的凭据值。adapter 的确定性测试进入根回归，真实
GEPA 生命周期 smoke 需显式运行且可能消耗 Working LM、Reflection LM 和容器额度。
GAIA GEPA 的数据校验只接受 validation Level 1/2；任务可声明附件，但每个附件必须是
`dataRoot` 内存在的相对文件，随后由 GAIA Environment 挂载到隔离容器。Level 3、test
split 和自动发现不进入该生命周期。

## GEPA lifecycle control plane

GEPA 的长任务优化由 `lazygoal gepa` 控制面管理，而不是由普通 TUI 或 benchmark
Composition Root 持有。公开机器接口为 `preflight`、`start`、`status`、`stop`、`resume`
和 `report`；`start`/`resume` 必须带调用方明确确认的 `--yes`，因为它们可能产生模型和
容器费用，并在成功后触及 LazyGoal Home 的 default Agent Profile。

Python 生命周期控制器为每次运行创建
`~/.lazygoal/workspaces/<workspace-id>/gepa/runs/<runId>/`，其中 `run.json` 和 `request.json` 是冻结身份，
`state.json` 是原子提交的可查询投影，`owner.json` 记录单 Worker 所有权，`gepa/`
保存官方 GEPA `run_dir`，`adapter/`、`reflection/` 和 `artifacts/` 保存有界评测、
反思及结果产物。`status`/`report` 只读取这些权威文件；它们不会从日志或私有
checkpoint 推导成功状态。每个 Run 同时最多一个 Worker。

候选评测仍由现有 GEPA Adapter 和 `prompt-evaluation@1` 负责。Working LM 固定绑定
LazyGoal Home 的 `profiles/default.toml`，执行指定 benchmark 的 Agent；Reflection LM 通过
`[gepa].reflection_profile` 绑定另一个 LLM Profile，仅执行无 Tool 的文本反思。两者的
Profile、模型身份和凭据边界在 Run manifest 中冻结，恢复时必须保持一致。

`stop` 只请求官方 GEPA 停止边界，不向 Worker 发送进程信号，也不删除产物。Worker
观察到停止请求后保留 checkpoint 并进入 `stopped`；`resume` 只允许在 Worker 不存活、
目标 Profile 摘要未漂移且 checkpoint 可读时复用同一 `run_dir`，并重新要求确认。

发布不是普通评测的副作用。生命周期产物和报告区分最佳 Profile artifact、publication
状态与 `complete`；只有正常优化完成、候选和目标 Profile 仍通过校验且目标摘要未变化时，
Worker 才会原子更新
`~/.lazygoal/agent-profiles/default.json` 的 `systemPrompt` 与完整 `instructions`。停止、失败、
外部 Profile 修改或写入失败不得覆盖当前 Profile；此类结果保留最佳 artifact 并报告
`publish_blocked`（或对应失败分类）。真实双模型 smoke 不进入默认回归。

GAIA 真实端到端闸门由 [`lazygoal-gepa-gaia-e2e`](../../prompt-evaluation/gepa/src/lazygoal_gepa/gaia_e2e.py)
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

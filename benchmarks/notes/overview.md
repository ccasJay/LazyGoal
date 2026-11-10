# 共享评测框架

Headless Composition Root、隔离 Worker、Attempt 和 Prompt Evaluation 协议。本文描述当前实现、使用边界与限制；[公开入口](../src/index.ts)。


## Scope

`benchmarks` 是独立的无界面评测入口，不属于 Web Server 的 Composition Root。当前已实现
通用单 task Headless Composition Root 与保持同一 Goal 的显式会话，以及 ALFWorld TextWorld、GAIA、TUA-Bench
和 SWE-bench Verified 的显式评测适配。ALFWorld 提供 Profile、固定 Manifest、容器内 Python JSONL
sidecar、专用 Tool 和机器可读报告。共享 ACP、进程、Worker 构建和隔离容器位于
[`benchmarks/src/`](../src)，具体 benchmark 只声明环境和评分适配。

## Entry point

`bin/lazygoal.cjs` 在参数前缀严格为 `eval alfworld`、`eval swebench`、`eval gaia` 或
`eval prompt` 时转发到拒绝执行的兼容入口；
对应 benchmark CLI（`grade` 和 `load` 亦按相同前缀分发）；其余普通启动参数进入
[`apps/goal-server`](../../apps/goal-server/README.md)。评测入口要求固定
Manifest：

```text
lazygoal eval alfworld --manifest <path> [--profile alfworld-profile]
  [--report <path>] [--min-success-rate <0..1>]
  [--max-infrastructure-retries <n>]
lazygoal eval gaia --manifest <path> [--output <dir>]
```

`lazygoal eval prompt --request <request.json>` 当前立即报告 Worker/Trigger Runtime 不支持并返回退出码 `1`；它不读取请求、不启动 Worker，也不回退到旧执行链。`lazygoal eval alfworld|gaia|swebench` 与相应的独立评分命令不受此限制。

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
`bm25-lite@1`，并通过 [Agent 默认装配](../../packages/agent/README.md) 的 `createAgentExecutor` 注入同一 `TrajectoryModelContextAssembler`；
模型上下文因此从当前 Trajectory Snapshot 组装。文件持久化适配器同时装配完整 ModelInputStore 与 committed history 检索索引，
Root 将同一 Lookup Port 注入 Runner 与 Coordinator。内存适配器可按需要提供这些诊断与检索端口。
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

## Prompt Evaluation execution

Prompt Evaluation 的 `prompt-evaluation@1` 协议、benchmark adapter 与 Python 优化器代码仍在仓库中，但 `runPromptEvaluationCli` 当前只输出不支持原因并返回 `1`；不会解析请求、创建 Attempt、启动隔离 Worker 或调用旧 Runtime 执行链。GEPA 与 Harness2 的 `start`、`resume` 和内部 `worker` 命令也明确拒绝执行。

只读或独立工具仍由各自入口提供：`lazygoal gepa reflect`、`resolve-models`、`inspect-tua`、`audit-tua-candidate`，以及 GEPA/Harness2 对现有产物的 `status`、`report` 等查询；`lazygoal grade ...` 继续读取已有结果并评分。Python adapter 与 Harness2 的单元测试继续检查协议逻辑，但不证明 Prompt Evaluation Worker 可执行。

## Persistent Headless sessions

`HeadlessCompositionRoot.openSession` 提供 launch、continue、resume、restore 和幂等 close。
调用方串行推进并在 finally 中关闭；restoreRef 从既有 Snapshot 打开，Run 与 Profile 不匹配时拒绝。
会话不自动推进后继 Run，不复制 Runtime 状态机，不把模型输入记录作为恢复权威。
用量为该进程会话内累计值，恢复前的调用不计入其中。既有 run(task) 仍在一次推进后关闭 Episode。

## Context Benchmark

[Context Benchmark](../context/README.md) 拥有固定用户脚本、静止检查点、人工冻结版本、恢复与从头配对评分。
入口为 `lazygoal eval context capture|run|freeze`。容器、Worker、RPC 和持久化仍由共享层拥有。

工具 RPC 的执行请求携带宿主 Action 的真实 Goal/Run context，Worker 原样传给 Tool；
缺失关联键拒绝执行，不生成替代 Goal/Run 身份。失败 Observation 使用当前 Tool Core 的 code、message 和 retryable。

Headless 用量包装器保留 Adapter 的 nativeConversationIdentity。Context Worker 的 RPC 显式传递该身份，
原生 strict 请求使用 required Tool 调用；JSON strict 请求仍须携带 structuredOutput。
同身份已提交调用与结果按正常 Agent 管线回放，模型或端点不符时由当前管线停止原生片段。

## 工程任务来源与文件系统恢复

[任务来源端口](../src/task-source.ts) 提供公开投影、环境和独立工程评分；顶层组合根连接具体来源与 Context，共享层不依赖 benchmark 实现。 [脚本 Worker](../src/scripted-worker.ts) 复用 Runtime 会话入口，领域模块只提供固定工具 Registry。

[容器归档](../src/filesystem-archive.ts) 使用流式字节摘要校验镜像工件。IsolatedEnvironment 只在 Agent 已停止的回收阶段允许归档，拒绝挂载/卷，删除自己创建的临时镜像；归档不保存进程内存。恢复使用校验后的 docker load 和镜像身份检查，不依赖缓存。大型镜像归档不受原生项目文件包的大小限制。

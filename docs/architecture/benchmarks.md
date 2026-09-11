# Benchmark Evaluation

## Scope

`benchmarks` 是显式评测入口，不属于普通 TUI 的 Composition Root。当前已实现
通用单 task Headless Composition Root，以及 ALFWorld TextWorld 和 SWE-bench Verified
的显式评测适配；ALFWorld 提供 Profile、固定 Manifest、容器内 Python JSONL sidecar、专用
Tool 和机器可读报告。共享 ACP、进程、Worker 构建和隔离容器位于
[`benchmarks/src/`](../../benchmarks/src/)，具体 benchmark 只声明环境和评分适配。

## Entry point

`bin/lazygoal.cjs` 在参数前缀严格为 `eval alfworld`、`eval swebench` 或 `eval gaia` 时分别转发到
对应 benchmark CLI（`grade` 和 `load` 亦按相同前缀分发），其它参数仍
进入 [`packages/tui/src/cli.tsx`](../../packages/tui/src/cli.tsx)。评测入口要求固定
Manifest：

```text
lazygoal eval alfworld --manifest <path> [--profile alfworld-profile]
  [--report <path>] [--min-success-rate <0..1>]
  [--max-infrastructure-retries <n>]
lazygoal eval gaia --manifest <path> [--output <dir>]
```

入口按 Profile → Manifest → 领域环境配置的顺序校验配置，全部通过后才构造模型
Adapter 和容器 Worker。ALFWorld 的 Python/sidecar 预检在容器内完成；SWE-bench 的
官方 harness 预检仍在宿主评分边界完成。GAIA 使用 managed 镜像安装 Python 文件处理库，
通过 `preflight` 验证依赖，任务通过宿主代理 `web_search`/`web_fetch` 工具及容器内
`submit_answer` 工具作答。模型使用与 CLI 相同的 [配置解析与工厂](./llm.md#配置)，
不支持的 provider/mode、未知目录模型及容量错误均在 Episode 与 Goal 创建前失败。报告写到 `--report` 指定的 JSON 文件，未指定时只写
stdout；诊断和配置错误写 stderr。成功率低于阈值时仍保留完整报告并返回非零码。
SWE-bench 使用单次容器作答、补丁导出与独立官方评分；生命周期、产物与限制见
[SWE-bench Evaluation](./swebench.md)。GAIA 评分使用归一化精确匹配算法，支持独立
`grade gaia` 入口离线评分且不消耗模型调用。以下章节描述 ALFWorld 接线。
数据准备使用 `npm --prefix benchmarks run alfworld:download`；GAIA 数据集下载使用 `lazygoal load gaia`。
评测 CLI 与独立 preflight 脚本共用同一个有界 Python 探针执行器，测试入口仍可注入
替身探针，不会改变预检顺序或错误语义。
ALFWorld 测试 Profile 只从工作区 `.lazygoal/profiles/alfworld-profile.json` 加载，
不会从 `benchmarks` 源码目录或单数 `profile` 目录读取。
显式入口同时自动读取 `benchmarks/alfworld/.env.alfworld`，命令行环境变量覆盖文件值。
`grade alfworld`、`grade swebench` 和 `grade gaia` 只读取已有报告、Attempt 和产物，不构造模型。

## Episode lifecycle

[`EvaluationRunner`](../../benchmarks/alfworld/src/evaluation-runner.ts) 按 Manifest 顺序
把每个任务委托给 [`runAlfworldSupervisor`](../../benchmarks/alfworld/src/supervisor.ts)，由
共享 [`IsolatedEnvironment`](../../benchmarks/src/isolated-environment.ts) 创建独立容器，
再在容器 Worker 内装配通用 [`HeadlessCompositionRoot`](../../benchmarks/src/headless-composition-root.ts)。
ALFWorld Reset 与 Step 专用 Tool 使用不可变 Input Contract 声明其输入规范（Reset 为 strict empty object，Step 为非空 string `command`），由 Root 通过 `createToolRegistration` 封装为 `ToolRegistration` 注册入 Registry，并在执行时共享 Runtime 的单次 Contract 解析与结构/语义分层校验边界。每个 task 默认写入 `.lazygoal/benchmarks/` 下独立的 LazyGoal
Goal Snapshot 和 JSONL Trajectory，并可启用独立 Diagnostic Trace；Snapshot 的
`committedThroughSequence` 是恢复边界，未提交 tail 只供审计，不会自动 replay。
Root 为每个 Goal 固定冻结 Prompt Bundle v1、`structured@1`、`trajectory-layered@1` 和
`bm25-lite@1`，并把同一 `TrajectoryModelContextAssembler` 注入 `LLMStepExecutor`；
模型上下文因此从当前 Trajectory Snapshot 组装。benchmark 目前只装配 Trajectory 层，
不自动创建 Cold Trajectory 索引或 Lookup Port；需要检索的 benchmark 必须额外提供该依赖。
任务描述符 `BenchmarkTaskDescriptor.completionCriteria` 支持纯文本与携带验收声明的结构化条件；Root 在启动前执行结构校验与 Profile 工具白名单授权检查，将声明注入 Goal Task。基础设施重试追加新的 Attempt，不覆盖原始记录。报告的成功事实只有环境返回的
`won=true`，模型 `complete` 与验收声明不能覆盖环境失败。
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
`attempts/<taskId>/attempt-<n>.json`，领域字段仍由 ALFWorld 自己解释。未来 benchmark
只需实现通用 adapter，并将 task 映射到自己的持久化 namespace；不应复制 Storage
编解码或 Runtime 提交语义。

模型 token 用量数据流：LLM Adapter 把供应商用量归一化写入
`providerMetadata.usage`（`{ inputTokens, outputTokens, cachedInputTokens? }`，
缺失时字段缺省），随 Diagnostic Trace 逐调用落盘；Headless Root 按 run 累计
（无用量的调用只计入 `missingCalls`）并附到模型事实，报告的每个 Attempt 记录
该次尝试的聚合用量，summary 只对已存在用量求和并把无用量数据的尝试计入
`attemptsMissingUsage`。用量不进入 Domain Event、Goal Snapshot 或模型上下文。

pi-ai 的 `piUsage` 只供诊断，不进入正式用量累计；这些调用计入 `missingCalls`，
不能把汇总中的零值理解为真实零消耗。

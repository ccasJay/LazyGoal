# Benchmark Evaluation

## Scope

`benchmarks` 是显式评测入口，不属于普通 TUI 的 Composition Root。当前已实现
通用单 task Headless Composition Root，以及 ALFWorld TextWorld 的 Profile、固定
Manifest、Python JSONL sidecar、专用 Tool 和机器可读报告；Conda/数据缺失只影响
显式评测命令。通用 Root 位于 [`benchmarks/src/`](../../benchmarks/src/)，只负责
LazyGoal 生命周期、依赖注入和持久化接线；具体 benchmark 在自己的目录提供任务、
Episode 和评分适配。

## Entry point

`bin/lazygoal.cjs` 只有在参数前缀严格为 `eval alfworld` 时才转发到
[`benchmarks/alfworld/src/cli.ts`](../../benchmarks/alfworld/src/cli.ts)，其它参数仍
进入 [`packages/tui/src/cli.tsx`](../../packages/tui/src/cli.tsx)。评测入口要求固定
Manifest：

```text
lazygoal eval alfworld --manifest <path> [--profile alfworld-profile]
  [--report <path>] [--min-success-rate <0..1>]
  [--max-infrastructure-retries <n>]
```

入口按 Profile → Manifest → Python/数据预检的顺序校验配置，全部通过后才构造
模型 Adapter 和 sidecar。报告写到 `--report` 指定的 JSON 文件，未指定时只写
stdout；诊断和配置错误写 stderr。成功率低于阈值时仍保留完整报告并返回非零码。
数据准备使用 `npm --prefix benchmarks run alfworld:download`；该入口复用同一个
`.env.alfworld` 解析器，把 `ALFWORLD_DATA` 作为 `--data-dir` 传给
`alfworld-download`，并让进程环境覆盖文件值。
评测 CLI 与独立 preflight 脚本共用同一个有界 Python 探针执行器，测试入口仍可注入
替身探针，不会改变预检顺序或错误语义。
ALFWorld 测试 Profile 只从工作区 `.lazygoal/profiles/alfworld-profile.json` 加载，
不会从 `benchmarks` 源码目录或单数 `profile` 目录读取。
显式入口同时自动读取 `benchmarks/alfworld/.env.alfworld`，命令行环境变量覆盖文件值。

## Episode lifecycle

[`EvaluationRunner`](../../benchmarks/alfworld/src/evaluation-runner.ts) 按 Manifest 顺序
把每个任务委托给通用 [`HeadlessCompositionRoot`](../../benchmarks/src/headless-composition-root.ts)，
由 Root 创建隔离的 Goal/Run、Profile ToolRegistry、自动放行 Policy、`LLMStepExecutor`
和 Runtime `Runner`。ALFWorld Reset 与 Step 专用 Tool 使用不可变 Input Contract 声明其输入规范（Reset 为 strict empty object，Step 为非空 string `command`），由 Root 通过 `createToolRegistration` 封装为 `ToolRegistration` 注册入 Registry，并在执行时共享 Runtime 的单次 Contract 解析与结构/语义分层校验边界。ALFWorld adapter 绑定一个任务级 sidecar 会话；任务终态、错误
或中止后关闭会话。每个 task 默认写入 `.lazygoal/benchmarks/` 下独立的 LazyGoal
Goal Snapshot 和 JSONL Trajectory，并可启用独立 Diagnostic Trace；Snapshot 的
`committedThroughSequence` 是恢复边界，未提交 tail 只供审计，不会自动 replay。
Root 为每个 Goal 固定冻结 Prompt Bundle v1、`structured@1`、`trajectory-layered@1` 和
`bm25-lite@1`，并把同一 `TrajectoryModelContextAssembler` 注入 `LLMStepExecutor`；
模型上下文因此从当前 Trajectory Snapshot 组装。benchmark 目前只装配 Trajectory 层，
不自动创建 Cold Trajectory 索引或 Lookup Port；需要检索的 benchmark 必须额外提供该依赖。
基础设施重试追加新的 Attempt，不覆盖原始记录。报告的成功事实只有环境返回的
`won=true`，模型 `complete` 不能覆盖环境失败。
Python sidecar 将 TextWorld 1.6.2 的 `GameState` reset 返回值和三元组 `step` 返回值
归一化为稳定的 JSONL Reset/Step 结构，同时继续接受旧的二元/四元返回形状。
TextWorld 不提供部分目标完成率时，sidecar 以 `won` 生成二值完成率。
Runner 的 `max_steps_exceeded` 记录为 `task_not_won`，Tool/协议执行错误记录为
`infrastructure`；模型返回 `fail` 也记录为 `task_not_won`。只有缺少这些终止证据时
才使用 `unknown`。

[`EvaluationReport`](../../benchmarks/alfworld/src/report.ts) 只保存任务、环境统计、
配置标识、重试序号和失败类别；完整 Goal Snapshot、事实 Trajectory 和可选诊断 Trace
由 Root 的持久化绑定单独保存，不混入报告 JSON，也不保存模型凭据。未来 benchmark
只需实现通用 adapter，并将 task 映射到自己的持久化 namespace；不应复制 Storage
编解码或 Runtime 提交语义。

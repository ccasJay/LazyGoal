# Benchmark Evaluation

## Scope

`benchmarks` 是显式评测入口，不属于普通 TUI 的 Composition Root。当前已实现
ALFWorld TextWorld 的 Profile、固定 Manifest、Python JSONL sidecar、专用 Tool、
Goal 驱动 Episode Runner 和机器可读报告；Conda/数据缺失只影响显式评测命令。

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
评测 CLI 与独立 preflight 脚本共用同一个有界 Python 探针执行器，测试入口仍可注入
替身探针，不会改变预检顺序或错误语义。
ALFWorld 测试 Profile 只从工作区 `.lazygoal/profiles/alfworld-profile.json` 加载，
不会从 `benchmarks` 源码目录或单数 `profile` 目录读取。
显式入口同时自动读取 `benchmarks/alfworld/.env.alfworld`，命令行环境变量覆盖文件值。

## Episode lifecycle

[`EvaluationRunner`](../../benchmarks/alfworld/src/evaluation-runner.ts) 按 Manifest 顺序
为每个任务创建隔离的内存 GoalStore、Profile ToolRegistry、自动放行 Policy、
`LLMStepExecutor` 和 Runtime `Runner`。每个 Episode 绑定一个 sidecar 会话，任务
终态、错误或中止后关闭会话；基础设施重试追加新的 Attempt，不覆盖原始记录。
报告的成功事实只有环境返回的 `won=true`，模型 `complete` 不能覆盖环境失败。

[`EvaluationReport`](../../benchmarks/alfworld/src/report.ts) 只保存任务、环境统计、
配置标识、重试序号和失败类别，不保存完整 Observation 轨迹、Goal Snapshot 或
模型凭据。

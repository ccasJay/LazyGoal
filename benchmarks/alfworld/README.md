# ALFWorld TextWorld 评测环境

该目录负责显式 ALFWorld 评测的固定清单、托管容器安装层、Python JSONL sidecar 和专用
Worker。普通 `lazygoal` 启动、普通 TypeScript 测试和现有包安装不会创建评测容器。

## 初始化

数据下载仍可使用 Conda，并在仓库根目录执行：

```sh
conda env update --name lazygoal-alfworld --file benchmarks/alfworld/environment.yml --prune
conda activate lazygoal-alfworld
```

也可以运行显式初始化脚本：

```sh
npm --prefix benchmarks run alfworld:init
```

Apple Silicon 使用已经验证的 x86_64 依赖组合：

```sh
CONDA_SUBDIR=osx-64 conda env update --name lazygoal-alfworld --file benchmarks/alfworld/environment.yml --prune
```

该评测范围只包含 ALFWorld 的 TextWorld 环境，不安装或启动需要视觉模拟器的 THOR 环境。
初始化后准备数据，并把数据根设置为绝对路径。正式评测会把该数据复制到独立容器，
宿主不需要安装 ALFWorld Python 环境：

```sh
conda activate lazygoal-alfworld
npm --prefix benchmarks run alfworld:download
npm --prefix benchmarks run alfworld:preflight
```

`alfworld:download`、`alfworld:preflight` 和显式评测入口都会读取
`benchmarks/alfworld/.env.alfworld`。下载脚本把解析出的 `ALFWORLD_DATA` 传给
`alfworld-download --data-dir`；当前进程中显式导出的同名变量优先覆盖配置文件。
因此不需要手动拼接数据路径。若直接运行 Python 命令，仍需先执行
`source benchmarks/alfworld/.env.alfworld`。

评测使用 LazyGoal Home 中的全局测试 Profile：`~/.lazygoal/agent-profiles/alfworld-profile.json`。
该 Profile 授权 `read_file`、`grep`、`alfworld_reset` 和 `alfworld_step`，不会授权
Bash、写入或编辑 Tool。显式 ALFWorld 入口会自动读取
`benchmarks/alfworld/.env.alfworld`；也可以在运行独立 Python 命令前手动 source
该文件。

正式容器 Worker 会在模型请求前验证容器内 Python、固定的 ALFWorld/TextWorld 版本、
sidecar 文件和 TextWorld-only 能力。预检失败时不会开始作答。

## 固定评测命令

完成环境初始化后，可以运行固定的 Smoke 或 Regression 清单。两条命令都会输出
机器可读报告；它们固定使用阈值 `0`，用于连通性和流程诊断，即使任务未成功也会
保留报告。需要把“全部任务成功”作为退出条件时，使用通用评测入口显式设置阈值：

```sh
npm --prefix benchmarks run alfworld:smoke
npm --prefix benchmarks run alfworld:regression
npm --prefix benchmarks run alfworld:worker-smoke
npm --prefix benchmarks run prompt-evaluation:smoke
npm --prefix benchmarks run alfworld:eval -- eval alfworld \
  --manifest benchmarks/alfworld/manifests/smoke.json --min-success-rate 1
```

`prompt-evaluation:smoke` 使用确定性模型替身，经 `eval prompt` 编排层跑通容器、ACP、
LLM RPC、ALFWorld 评分、Attempt 与 Runtime 产物回收；它只验证接线，不要求烟雾任务获胜。

清单位于 `alfworld/manifests/smoke.json` 和 `alfworld/manifests/regression.json`，
只引用 `valid_seen` 下固定的 `game.tw-pddl` 路径，不在运行时抽样或重排任务。

## 固定版本

`environment.yml` 固定 Python 3.9、ALFWorld 0.4.2 和 TextWorld 1.6.2。若上游环境实现发生变化，应先更新 sidecar 的验证和清单，不要在一次评测中隐式替换依赖版本。

已有报告可以在没有 LLM 环境变量的情况下重新聚合：

```sh
lazygoal grade alfworld --report <run>/report.json
```

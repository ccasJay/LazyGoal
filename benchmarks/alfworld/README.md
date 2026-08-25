# ALFWorld TextWorld 评测环境

该目录只负责显式 ALFWorld 评测的 Python/Conda 环境。普通 `lazygoal` 启动、普通 TypeScript 测试和现有包安装不会读取或创建该环境。

## 初始化

需要 Conda，并在仓库根目录执行：

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

该评测范围只包含 ALFWorld 的 TextWorld 环境，不安装或启动需要视觉模拟器的 THOR 环境。初始化后准备数据，并把数据根设置为绝对路径：

```sh
conda activate lazygoal-alfworld
alfworld-download
export ALFWORLD_PYTHON="$CONDA_PREFIX/bin/python"
export ALFWORLD_DATA="/absolute/path/to/alfworld-data"
npm --prefix benchmarks run alfworld:preflight
```

预检会在模型请求前验证 Python、固定的 ALFWorld/TextWorld 版本、数据目录和 TextWorld-only 能力。预检失败时不会开始评测。

## 固定版本

`environment.yml` 固定 Python 3.9、ALFWorld 0.4.2 和 TextWorld 1.6.2。若上游环境实现发生变化，应先更新 sidecar 的验证和清单，不要在一次评测中隐式替换依赖版本。

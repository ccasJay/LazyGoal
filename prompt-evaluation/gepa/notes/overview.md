# GEPA 优化

官方 GEPA 候选搜索与反思适配包。本文描述当前可用入口、持久化边界与限制；[Python CLI](../src/lazygoal_gepa/cli.py)。

## 当前执行边界

`lazygoal gepa start`、`resume` 和内部 `worker` 命令明确返回不支持；`lazygoal eval prompt` 同样返回不支持，不解析评测请求、不启动 benchmark Worker，也不回退到旧执行链。当前控制面不启动 GEPA 优化任务。

`preflight`、`status`、`stop`、`report` 与 `wait` 子命令仍可查询或管理已有生命周期记录；它们不会启动优化 Worker。独立的 `lazygoal gepa reflect`、`resolve-models`、`inspect-tua` 和 `audit-tua-candidate` 命令仍通过 benchmarks CLI 路由。评分仍由 `lazygoal grade ...` 的独立评分入口负责。

## 模块职责

Python 包包含官方 `gepa==0.1.4` Adapter、生命周期文件读取/投影、GEPA 候选和反思协议、TUA 数据预检与审计，以及报告逻辑。Adapter 的确定性测试以 fake LazyGoal CLI 和 fake Reflection Model 覆盖其协议边界；这些测试不证明当前 CLI 能执行真实候选评测。公开的 Prompt Evaluation 协议及已有产物不会被自动迁移或删除。

模型凭据与 Prompt Evaluation 的隔离执行仍归 LazyGoal 运行时及 benchmark adapter 所有。此模块不自行建立 Worker/Trigger 执行路径。

## 操作说明

测试要求、命令现状与 Python 包要求见 [使用说明](./usage.md)。

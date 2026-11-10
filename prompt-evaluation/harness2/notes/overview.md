# Harness2 优化

独立于 Runtime 的 Propose–Probe–Compose 框架与 Prompt 协同优化器。本文描述当前可用入口与限制；[Python CLI](../src/lazygoal_harness2/cli.py)。

## 当前执行边界

`lazygoal harness2 start`、`resume` 和内部 `worker` 命令明确返回不支持；`lazygoal eval prompt` 也返回不支持，不启动 SWE-bench Prompt Evaluation Worker，不回退旧执行链。

`preflight`、`status`、`stop`、`report` 与 `wait` 仍可检查或管理已有 Harness2 运行记录。`apply` 可将已有导出产物写到指定 Profile 路径；它不会启动评测或恢复 Worker。

## 模块职责

Python 包保留 Propose–Probe–Compose 循环、Invariant/Domain 双轨候选、Trajectory 读取、改进库和导出器的实现及单元测试。运行命令不可用期间，这些实现不构成当前可执行的优化流程；测试验证模块逻辑，不证明 Prompt Evaluation Worker 可启动。

Harness2 的候选可编辑面原本包含 Agent Profile 和白名单 Prompt Bundle 模板。运行时状态、Goal 执行、工具授权、隔离和 benchmark 评分归 LazyGoal Runtime 与 benchmark 模块所有；Harness2 不复制这些执行边界。

# 评测超时与决策失败 Badcase 归类及协议对齐 设计

## 审批摘要

### 方案

解耦底层容器环境的“单任务超时”与“外部取消信号”，将单任务超时及模型决策错误作为未作答领域失败（Badcase，得分 0.0）记录并保留轨迹，同时在跨进程事件流协议中对齐进度阶段白名单。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 单任务超时与外部取消解耦 | 在 `IsolatedEnvironment` 中分别追踪外部 `options.signal` 与单任务时限定时器，时限耗尽标记为任务超时而非全局用户取消。 | 外部中断保持退出码 130，单任务超时平稳结束并进入领域判定。 |
| 超时与决策错误映射为领域失败 | GAIA Supervisor 将超时及模型决策错误（`INVALID_AGENT_DECISION`）判定为已完成（`completed`）但未作答（`correct: false`）。 | 生成完整 Attempt 与 Trajectory，作为 Badcase 供 GEPA 反思与变异，不升级为 `infrastructure_error`。 |
| Python 协议阶段白名单对齐 | 在 `lazygoal_gepa/protocol.py` 中将 `"cancelled"` 加入 `_PROGRESS_STAGES` 白名单。 | 消除跨语言进度事件解析不一致，防止单任务取消时解析器崩溃。 |

### 风险与待确认

- 风险等级：medium；理由：涉及跨进程协议 wire 边界及容器环境生命周期终态映射。
- 关键操作：无
- 风险：无
- 待确认：无

## Overview

本设计旨在解决 GAIA 等 Benchmark 评测和 GEPA 优化中，单任务超时与模型决策失败被误判为全局取消或基础设施崩溃的问题。通过在底层明确区分任务时限耗尽与用户取消信号，在评测适配层将任务超时与决策失败归为领域失败（Badcase），并在 Python 协议层对齐事件阶段定义，实现优化流程的稳定运行与反思轨迹的完整保留。

```text
+-------------------------+        +---------------------------+        +----------------------------+
|   IsolatedEnvironment   |        |      GaiaSupervisor       |        |   PromptEvaluationRunner   |
|                         |        |                           |        |                            |
| 区分超时与外部取消信号  | -----> | 判定为未作答领域失败      | -----> | 输出 task status: "failed" |
| 超时 -> 记录 TASK_TIMEOUT|        | status: "completed"       |        | 退出码 0，生成 Attempt 记录 |
| 外部取消 -> cancelled   |        | correct: false (得分 0.0) |        |                            |
+-------------------------+        +---------------------------+        +----------------------------+
                                                                                       |
                                                                                       v
                                                                        +----------------------------+
                                                                        |   GEPA (Python Adapter)    |
                                                                        |                            |
                                                                        | 解析进度与结果 (支持对齐)  |
                                                                        | 提取 Trajectory 作为       |
                                                                        | Badcase 送入 Reflection LM |
                                                                        +----------------------------+
```

## Key Design Decisions

### 单任务超时与外部取消解耦

- 在 [`benchmarks/src/isolated-environment.ts`](file:///Users/sawyerlau/Project/LazyGoal/benchmarks/src/isolated-environment.ts) 中：
  - 外部 `options.signal` 表示调用方主动中止（例如用户在 CLI 中按下 SIGINT / Ctrl-C）；
  - `taskTimeoutMs` 定时器仅代表当前单任务的时限耗尽。
  - 当单任务超时触发时，仅中止当前容器与 Worker，并将错误记录为特定代码（如 `TASK_TIMEOUT`）；若外部 `options.signal` 未触发，则环境状态不标记为全局 `cancelled`。

### 超时与决策错误映射为领域失败

- 在 [`benchmarks/gaia/src/supervisor.ts`](file:///Users/sawyerlau/Project/LazyGoal/benchmarks/gaia/src/supervisor.ts) 中：
  - 检查是否为模型行为终止（`executionError === "INVALID_AGENT_DECISION"` 或单任务超时 `TASK_TIMEOUT`）；
  - 此类终止导致的 `/workspace/answer.json` 缺失属于未作答的预期结果，不触发 `infrastructure_error`；
  - Supervisor 返回 `status: "completed"` 且 `domainResult.correct = false`，Attempt 记录保存完整 Goal 快照与 Trajectory 路径。

### Python 协议阶段白名单对齐

- 在 [`prompt-evaluation/gepa/src/lazygoal_gepa/protocol.py`](file:///Users/sawyerlau/Project/LazyGoal/prompt-evaluation/gepa/src/lazygoal_gepa/protocol.py) 中：
  - `_PROGRESS_STAGES` 增加 `"cancelled"`；
  - 确保当 TypeScript 端发出包含 `taskId` 且 `stage: "cancelled"` 的进度事件时，Python 端严格解析器能够正常处理并推进事件流，不抛出 `PromptEvaluationProtocolError`。

## Testing Strategy

- **单任务超时单元测试**：测试 `IsolatedEnvironment` 在超时触发且无外部 signal 时，产出带超时标识的结果而非 `cancelled`。
- **Supervisor 领域判定测试**：测试超时或决策错误场景下，Supervisor 输出 `status: "completed"` 且 `domainResult.correct: false`。
- **Python 协议解析测试**：测试 Python 端解析器能够成功解析 `type: "progress", stage: "cancelled"` 的事件。
- **集成测试**：验证 Prompt Evaluation CLI 在单任务超时场景下正常退出并生成有效的失败 Attempt 记录。


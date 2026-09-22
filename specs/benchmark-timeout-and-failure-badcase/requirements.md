# 评测超时与决策失败 Badcase 归类及协议对齐 需求

## 审批摘要

### 目标

将评测中的单任务超时及模型决策失败规范化为未作答领域失败（Badcase，得分 0.0），保留执行轨迹用于反思优化，并消除跨进程事件协议的校验不一致。

### 范围

- 包含：
  - 在 `IsolatedEnvironment` 中区分单任务超时（`taskTimeoutMs` 耗尽）与外部取消信号（用户主动中断）；
  - 将单任务超时映射为任务级超时失败，由 Benchmark Supervisor（GAIA 等）判定为未作答领域失败（`correct: false`，得分 0.0），保留完整 Trajectory；
  - 在 `prompt-evaluation@1` 协议中对齐 TypeScript 与 Python 双端对 progress 事件 stage 的定义，支持包含 `cancelled` 等合法阶段的正常解析；
  - 确保真正的基础设施故障（Docker 崩溃、API 鉴权失败）保持 fail-fast。
- 不包含：
  - 不将真正的基础设施故障伪装为领域失败；
  - 不改变外部用户主动取消（SIGINT/Ctrl-C）全局中断评测并退出（130）的行为。

### 核心行为

- 单任务耗尽 `taskTimeoutMs` 时触发任务级超时并正常完成执行周期，而非触发全局取消；
- Benchmark Supervisor 将超时终止判定为 `completed` 且 `domainResult.correct = false`，Attempt 记录完整轨迹；
- `PromptEvaluationRunner` 将单任务超时与决策错误输出为标准失败结果（exit code 0，task status "failed"），GEPA 收集其 Trajectory 作为 badcase 顺利送入反思与变异阶段；
- Python 端协议解析器放宽并对齐 progress 事件阶段白名单，支持解析包含 `cancelled` 等合法进度事件；
- 外部用户主动发起的取消信号（`signal`）仍作为 `cancelled` 立即终止运行并返回退出码 130。

### 风险与待确认

- 风险等级：medium；理由：涉及跨语言协议 wire 边界及容器环境生命周期终态映射。
- 关键操作：无
- 风险：无
- 待确认：无

## 引言

当前在 GAIA 等 Benchmark 评测中，当任务因步骤过多达到单任务超时上限，或触发模型非法决策时，底层机制会将其归类为取消（`cancelled`）或基础设施崩溃（`infrastructure_error`），且跨进程事件流协议对 `cancelled` 进度事件存在白名单缺失，导致 GEPA 优化进程异常崩溃。本功能旨在解耦超时与外部取消，将超时与决策失败归为领域失败（Badcase，得分 0.0），保留执行轨迹用于反思变异，并修复跨进程协议阶段白名单不一致的问题。

## 需求

### 需求 1：单任务超时解耦与判定

**用户故事：** 作为评测开发者，我希望系统将单任务超时与外部中断信号解耦，以便耗时过长的任务能作为超时失败而非取消退出。

#### 验收标准

1. <a id="req-1-1"></a> 当任务执行耗时达到 `taskTimeoutMs` 上限时，系统必须终止当前任务容器执行并将内部状态标记为超时，不得触发全局外部取消。
2. <a id="req-1-2"></a> 当收到外部显式取消信号时，系统必须立即终止执行并将状态标记为 `cancelled`。

### 需求 2：Supervisor 领域失败与 Badcase 轨迹保留

**用户故事：** 作为优化系统（GEPA），我希望超时或决策失败的任务生成完整的领域失败 Attempt，以便提取反思轨迹。

#### 验收标准

1. <a id="req-2-1"></a> 当任务因单任务超时或模型决策错误（如 `INVALID_AGENT_DECISION`）终止时，系统必须生成 `status` 为 `completed` 且 `domainResult.correct = false` 的 Attempt 记录。
2. <a id="req-2-2"></a> 当任务因单任务超时或模型决策错误终止时，系统必须在 Attempt 记录中保留对应的 Goal 快照与 Trajectory 路径。
3. <a id="req-2-3"></a> 如果发生真正的基础设施故障（如容器创建失败、Worker 崩溃、API 鉴权错误），系统必须将状态标记为 `infrastructure_error` 且不得生成领域得分。

### 需求 3：跨进程协议阶段对齐与健壮性

**用户故事：** 作为 GEPA 优化 Worker，我希望协议解析器支持所有合法的事件阶段，以便在任务取消或超时时不会因协议校验失败崩溃。

#### 验收标准

1. <a id="req-3-1"></a> 当 TypeScript 评测执行器在进度事件中输出 `stage: "cancelled"` 时，Python 端协议解析器必须正确解析该事件，不得抛出阶段非法错误。
2. <a id="req-3-2"></a> 当单任务发生领域失败时，Prompt Evaluation CLI 必须以退出码 0 退出，并在汇总结果中将任务状态报告为 `failed`。


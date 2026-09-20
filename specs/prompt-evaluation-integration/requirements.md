# Prompt 自进化评测接入需求

## 审批摘要

### 目标

为外部 LazyPrompt 提供稳定、可审计的 LazyGoal Agent Prompt 评测入口，使其能够提交一个候选 Prompt，在现有 benchmark 的隔离环境中运行，并取得可供 GEPA 优化使用的机器可读结果。

### 范围

- 包含：版本化 JSON 请求与结果协议；`lazygoal eval prompt` 机器调用入口；基于现有 benchmark Profile 的候选 Prompt 覆盖；ALFWorld 与 GAIA 首批适配；复用现有 Headless Runtime、ACP、LLM RPC、隔离环境与 Attempt 持久化；结构化进度、取消和稳定退出码。
- 不包含：GEPA 反思变异、Pareto 选择、候选池和多候选调度；通用分类/Judge 数据集；SWE-bench 首批适配；HTTP 服务、分布式执行、Profile 自动晋升和自动续跑。

### 核心行为

- LazyPrompt 通过 CLI 和当前版本 JSON 协议提交一次单候选、单 benchmark Manifest 的评测；ACP 只用于 LazyGoal 内部宿主到隔离 Worker 的通信。
- 候选只能替换基准 Profile 的 `systemPrompt` 与 `instructions`；工具、权限、Prompt Bundle、输出契约和 Evidence 规则保持基准定义，越界或无效输入必须在模型调用前拒绝。
- 每个任务在独立环境、Goal、Run 与 Attempt 中执行；任务成败以 benchmark 外部 outcome/评分为准，模型 `complete` 和 ACP 文本不得充当评分事实。
- 结果必须区分 benchmark 通过、任务失败、基础设施失败与取消，并记录候选、模型、环境、用量和产物定位信息；已提交的 Attempt 在中断后保持可读。
- 默认回归不依赖 Docker 或真实模型；真实隔离链路通过显式 smoke 入口验证。

### 风险与待确认

- 风险等级：medium；理由：新增跨 CLI、benchmark 适配、隔离执行和持久化的公共协议，但不改变 Runtime 权限、恢复或 Evidence 语义。
- 关键操作：无。
- 风险：不同 benchmark 的 Profile 约束和领域评分不同，错误的统一化可能污染候选比较；部分完成与取消时必须避免把 ACP 进度误记为权威结果。
- 待确认：无。

## 引言

本功能把 LazyGoal 已有的隔离 benchmark 执行能力暴露为供 LazyPrompt 调用的单候选评测边界。LazyGoal 只负责执行、证据和领域评分，Prompt 优化、候选生命周期及跨轮调度继续由 LazyPrompt 拥有。

## 需求

### 需求 1：版本化机器调用协议

**用户故事：** 作为 LazyPrompt 调度器，我希望通过稳定的 JSON 协议调用 LazyGoal，以便无需解析面向人的 CLI 文本即可提交和读取评测。

#### 验收标准

1. <a id="req-1-1"></a> 当调用方执行 `lazygoal eval prompt --request <path>` 时，系统必须读取一个当前版本的 JSON 请求，并以 JSON Lines 输出结构化进度和终态事件。
2. <a id="req-1-2"></a> 当请求版本不受支持、字段缺失、字段类型错误、存在未知字段或引用无效路径时，系统必须在创建隔离环境或调用模型前拒绝请求，并返回稳定的无效请求状态与退出码。
3. <a id="req-1-3"></a> 当一次请求被接受时，它必须只描述一个候选 Prompt、一个已注册 benchmark 和一个 Manifest；多候选与跨请求调度由调用方负责。

### 需求 2：受限候选 Profile

**用户故事：** 作为 benchmark 维护者，我希望候选只能改变 Prompt 文本，以便不同候选在相同工具、权限和执行契约下公平比较。

#### 验收标准

1. <a id="req-2-1"></a> 当系统构造候选 Profile 时，它必须从所选 benchmark 的既有 Profile 派生，并且只接受 `systemPrompt` 与 `instructions` 的替换值。
2. <a id="req-2-2"></a> 当候选试图改变 Profile 身份、工具集合、授权、Prompt Bundle、结构化输出契约、完成证据规则或其他冻结字段时，系统必须在模型调用前拒绝该请求。
3. <a id="req-2-3"></a> 当候选 Prompt 不满足通用或 benchmark 专用的 Profile 约束时，系统必须返回可定位到候选字段的稳定校验错误，且不得创建有效 Attempt。
4. <a id="req-2-4"></a> 当候选通过校验时，每个任务冻结的 Goal Profile 必须包含该候选的 Prompt 文本，并保持基准 Profile 的所有非 Prompt 字段不变。

### 需求 3：跨 benchmark 的隔离执行

**用户故事：** 作为 Prompt 优化者，我希望同一评测入口可选择不同 LazyGoal benchmark，以便候选体系不与单一任务环境绑定。

#### 验收标准

1. <a id="req-3-1"></a> 当请求选择 `alfworld` 或 `gaia` 时，系统必须通过统一的 Prompt 评测入口调用对应既有 benchmark 适配器，且领域任务解析、环境准备和评分仍由该 benchmark 拥有。
2. <a id="req-3-2"></a> 当执行 Manifest 中的多个任务时，每个任务必须使用独立环境、Goal、Run、Trajectory 和 Attempt，不得复用上一任务的环境状态或模型会话。
3. <a id="req-3-3"></a> 当隔离 Worker 执行任务时，宿主必须复用现有 ACP 与 LLM RPC 通道；外部调用方不得需要建立 ACP Session 或解释 ACP 消息。
4. <a id="req-3-4"></a> 当请求选择未注册 benchmark 时，系统必须在模型调用前返回稳定的“不支持 benchmark”错误。

### 需求 4：权威结果与状态分类

**用户故事：** 作为 GEPA 优化器，我希望结果明确区分候选表现和运行故障，以便不会把基础设施问题错误地计入 Prompt 质量。

#### 验收标准

1. <a id="req-4-1"></a> 当任务执行结束时，benchmark 通过或失败必须由该 benchmark 的外部 outcome 或评分器决定，不得由模型 `complete`、ACP 文本或进度事件决定。
2. <a id="req-4-2"></a> 当任务正常完成但未满足 benchmark 成功条件时，结果必须标记为任务失败，并与基础设施失败使用不同的机器可读状态。
3. <a id="req-4-3"></a> 当容器、Worker、传输、模型代理、产物回收或持久化失败时，结果必须标记失败阶段并归类为基础设施失败，不得伪造 benchmark 分数。
4. <a id="req-4-4"></a> 当所有任务均产生权威 benchmark 结果时，CLI 必须以成功退出码结束，即使其中部分或全部任务的 benchmark 结果为失败；无效请求、基础设施失败和取消必须使用彼此可区分的退出码。

### 需求 5：可审计结果与持久化

**用户故事：** 作为评测审阅者，我希望每个候选与任务结果可追溯到执行证据，以便复查 GEPA 的选择依据。

#### 验收标准

1. <a id="req-5-1"></a> 当请求被接受时，系统必须记录评测 ID、候选 ID、基准 Profile ID、规范化 Prompt 哈希与有界内容摘要，以及 benchmark、Manifest 和模型配置身份。
2. <a id="req-5-2"></a> 当任务 Attempt 达到可提交阶段时，系统必须通过现有 AttemptRecorder 原子写入任务身份、Goal/Run、状态、用量、错误、候选元数据、领域结果和产物定位器。
3. <a id="req-5-3"></a> 当评测进程在部分任务完成后中断时，已经提交的 Attempt 必须保持完整可读，最终结果不得覆盖或删除这些记录。
4. <a id="req-5-4"></a> 当评测结束时，系统必须原子写入一个汇总结果，列出每个 Manifest 任务的状态、领域结果或失败分类、Attempt 位置，并保留 Goal Snapshot、Trajectory 与可选 Diagnostic Trace 的定位信息。

### 需求 6：进度、取消与重复调用

**用户故事：** 作为 LazyPrompt 调度器，我希望能够观察并取消长时间评测，同时安全处理重试，以便管理优化预算和失败恢复。

#### 验收标准

1. <a id="req-6-1"></a> 当评测推进时，CLI 必须输出带评测 ID、任务 ID、阶段和时间信息的有界 JSON Lines 事件，且这些事件明确标记为非权威进度。
2. <a id="req-6-2"></a> 当调用方发送取消信号时，系统必须停止启动新任务，将当前任务交给现有取消与清理链路，并在有界清理后返回取消状态和退出码。
3. <a id="req-6-3"></a> 当取消发生在部分 Attempt 已提交之后时，系统必须保留已提交记录，并在汇总结果中将未完成任务与已完成任务区分开。
4. <a id="req-6-4"></a> 当调用方使用相同候选重新发起评测时，系统必须创建新的评测身份和新的 Attempt，不得自动复用旧结果或恢复旧模型会话。

### 需求 7：现有入口兼容与验证边界

**用户故事：** 作为 LazyGoal 维护者，我希望 Prompt 评测作为独立接入层加入，以便现有 TUI 与 benchmark CLI 的行为不受影响。

#### 验收标准

1. <a id="req-7-1"></a> 当现有 `eval alfworld`、`eval gaia` 或 TUI 入口运行时，其参数、默认 Profile、输出和退出语义必须保持不变。
2. <a id="req-7-2"></a> 当运行默认回归时，Prompt 评测的协议、Profile 冻结、状态映射、进度输出和持久化测试不得要求 Docker、真实模型或外部供应商凭据。
3. <a id="req-7-3"></a> 当运行显式 smoke 检查时，至少一个内置小型 Manifest 必须完成 CLI、隔离环境、ACP、LLM RPC、领域评分和产物回收的完整链路。

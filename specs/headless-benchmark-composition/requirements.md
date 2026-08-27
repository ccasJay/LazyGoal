# Headless Benchmark Composition Root 需求

## 引言

为 benchmark 提供一个不依赖 TUI 的单任务执行入口和完整的 LazyGoal 持久化能力，
使每个 benchmark 只需提供任务描述、环境会话、Tool Registry 和持久化适配，就能
复用完整的 Goal 生命周期并生成可定位的 Snapshot、Trajectory 和诊断数据；本 Spec
以 ALFWorld 作为首个使用方，但不把任何 ALFWorld 字段、协议或评分规则固化到通用
运行层。

## 需求

### 需求 1：单任务可执行完整 LazyGoal 流程

**用户故事：** 作为 benchmark 维护者，我希望把一个固定任务作为一次完整的
LazyGoal 执行，以便评测结果包含真实的 Goal、Run、Action 和 Observation 语义。

#### 验收标准

1. <a id="req-1-1"></a> 当调用方提供有效的任务描述、Profile、模型依赖和环境会话时，系统必须为该任务创建一个独立 Goal/Run，并依次经过 Preparation、Planning、Approval 和 Executing 生命周期。
2. <a id="req-1-2"></a> 当任务执行到阻塞点或终态时，系统必须返回可机器读取的 Runner 状态、模型完成事实和该环境提供的结果。
3. <a id="req-1-3"></a> 当以 headless 模式运行时，系统不得要求 TUI、交互式标准输入或人工 Tool 审批才能完成已配置的任务流程。

### 需求 2：Benchmark adapter 可替换且不绑定领域

**用户故事：** 作为新的 benchmark 接入者，我希望只实现本环境的任务和会话适配，
以便复用已有 headless 组合而不复制 LazyGoal 编排代码。

#### 验收标准

1. <a id="req-2-1"></a> 当 benchmark 提供任务描述和环境会话 adapter 时，通用运行入口必须能使用该 adapter 创建 Goal 任务、Tool Registry 和环境结果。
2. <a id="req-2-2"></a> 当两个 adapter 使用不同的任务类型、结果类型或外部环境时，系统必须允许它们复用同一个 headless 运行入口，且不要求结果包含某个特定 benchmark 字段。
3. <a id="req-2-3"></a> 当 adapter 未提供额外领域逻辑时，通用运行入口不得解析其 Manifest、环境协议或评分规则。

### 需求 3：环境会话资源具有明确生命周期

**用户故事：** 作为评测维护者，我希望每个任务的环境资源被隔离并可靠释放，以
便连续运行多个任务时不会发生状态泄漏或悬挂进程。

#### 验收标准

1. <a id="req-3-1"></a> 当一个任务开始执行时，系统必须为该任务使用独立的环境会话、Tool Registry 和执行状态，不得复用前一个任务的隐藏环境状态。
2. <a id="req-3-2"></a> 当任务到达终态、执行失败或收到中止信号时，系统必须调用当前 adapter 的关闭操作，并在关闭完成前结束该任务的资源生命周期。
3. <a id="req-3-3"></a> 当环境关闭操作失败时，系统必须保留主执行结果或未确定状态，并报告关闭故障；不得把关闭失败伪装成任务成功。

### 需求 4：沿用 LazyGoal 的 Tool、Profile 和持久化语义

**用户故事：** 作为 LazyGoal 维护者，我希望 benchmark 复用现有 Runtime/Agent
边界，以便评测行为与普通 Goal 保持可比且不产生第二套协议。

#### 验收标准

1. <a id="req-4-1"></a> 当 Profile 授权一组 Tool 且 adapter 提供对应 Registry 时，系统必须只向模型展示并允许执行该授权集合，不得隐式加入未注册或未授权的 Tool。
2. <a id="req-4-2"></a> 当 headless 运行配置了 GoalStore、TrajectorySink 或 DiagnosticTraceSink 时，系统必须沿用现有 Snapshot、Action/Observation、Trajectory 提交边界和 Trace 旁路语义。
3. <a id="req-4-3"></a> 当未显式启用 benchmark 入口时，普通 LazyGoal CLI、TUI 和现有测试必须不加载 benchmark adapter 或启动其环境。

### 需求 5：任务结果与 benchmark 评分解耦

**用户故事：** 作为 benchmark 维护者，我希望运行层只报告环境事实和 Runtime 结果，
以便不同 benchmark 自己定义成功判定、重试和报告格式。

#### 验收标准

1. <a id="req-5-1"></a> 当环境会话返回领域结果时，系统必须原样提供不透明结果给调用方，不得在通用运行层假设 `won`、`reward` 或其他固定成功字段。
2. <a id="req-5-2"></a> 当任务执行结束时，系统必须允许 benchmark evaluator 根据 Runner 结果和环境结果独立计算成功、失败类别、重试和汇总指标。
3. <a id="req-5-3"></a> 当模型声明 `complete` 但环境结果未满足 benchmark 的成功条件时，通用运行层不得替 evaluator 宣布任务成功。

### 需求 6：失败、中止和恢复边界可预测

**用户故事：** 作为评测维护者，我希望环境故障和中止具有稳定语义，以便失败任务
可诊断且不会被错误重放。

#### 验收标准

1. <a id="req-6-1"></a> 当 adapter 抛出领域错误或基础设施错误时，系统必须保留 LazyGoal 既有的 Observation/执行错误语义，并禁止生成虚假的成功结果。
2. <a id="req-6-2"></a> 当调用方中止当前任务时，系统必须停止后续模型或环境调用、完成 adapter 清理，并向调用方报告中止而非普通任务失败。
3. <a id="req-6-3"></a> 当外部环境不支持跨进程恢复时，系统不得仅凭 Goal Snapshot 自动重放或伪造环境状态；需要恢复时必须由 adapter 显式提供能力。

### 需求 7：扩展实现可验证且不改动核心源码

**用户故事：** 作为项目维护者，我希望新增 benchmark 只影响 benchmark package，
以便核心 LazyGoal 的安装、构建和回归风险保持可控。

#### 验收标准

1. <a id="req-7-1"></a> 当新增一个符合 adapter 契约的 benchmark 时，系统必须能够在不修改 `packages/runtime`、`packages/agent`、`packages/storage`、`packages/tools` 或 `packages/tui` 生产接口的情况下完成接入。
2. <a id="req-7-2"></a> 当运行通用 headless 运行层测试时，测试必须覆盖至少两个不同形状的 fake adapter，并验证任务隔离、完整生命周期和资源清理。
3. <a id="req-7-3"></a> 当执行 benchmark package 的类型检查、单元测试和现有项目回归检查时，系统必须保持可通过，且未显式启用外部 benchmark 时不得要求其运行环境。

### 需求 8：Benchmark 完整 LazyGoal 持久化与通用接口

**用户故事：** 作为 benchmark 维护者，我希望每次任务执行都能持久化完整的
LazyGoal 状态和事实轨迹，以便恢复或审计 Agent 行为，并让其他 benchmark 通过各自
的适配器复用同一套持久化能力。

#### 验收标准

1. <a id="req-8-1"></a> 当 benchmark task 开始执行时，系统必须为该 Goal/Run 持久化最新 Goal Snapshot 和追加式 Trajectory，并返回各自的路径或稳定定位标识；不得仅使用进程内存作为默认持久化结果。
2. <a id="req-8-2"></a> 当调用方启用 Diagnostic Trace 时，系统必须将其写入与对应 Goal/Run 关联的独立诊断存储，并保证与同一 task 的 Snapshot、Trajectory 使用一致的 Goal/Run 标识且彼此隔离；Trace 不是 Runtime 恢复边界，且其写入失败不得覆盖已持久化的 Snapshot 或 Trajectory 事实。
3. <a id="req-8-3"></a> 当 benchmark 接入完整持久化时，系统必须直接使用 LazyGoal 已有的 `GoalStore`、`TrajectoryStore` 和 `DiagnosticTraceSink` 接口；benchmark 只负责将 task 映射到存储命名空间并创建或注入这些接口的实例，不得复制 Snapshot 编解码、Trajectory 事件校验、提交边界或 Trace 语义，也不得依赖 AlfWorld 字段、sidecar 协议或固定评分字段。
4. <a id="req-8-4"></a> 当不同 benchmark 使用不同的任务类型、环境和存储布局时，它们必须能通过各自的命名空间适配复用同一个 headless 运行入口；同一 task 的 Snapshot、Trajectory 以及启用时的 Trace 必须共享 Goal/Run 标识且与其他 task 隔离。
5. <a id="req-8-5"></a> 当任务成功、失败或中止时，系统必须保留已经持久化的 Snapshot 和轨迹；读取者必须能依据最新 Goal Snapshot 的 `committedThroughSequence` 区分已提交事件和未提交 tail，且未提交 tail 不得被隐式 replay。任一必要持久化写入失败时，系统必须报告持久化故障并保留主执行结果的真实状态，不得生成成功假象。

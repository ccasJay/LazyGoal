# Web 与后端分离及终端产品退出设计

## 审批摘要

### 方案

将现有 Web 后端装配迁出 TUI，形成独立服务应用；Web 前端仅依赖纯通信契约及前端库。生产环境仍使用本地同源服务，删除终端产品，并补齐基于提交边界的显式恢复。

### 关键决策

| 决策 | 选择与理由 | 影响 |
| --- | --- | --- |
| 工程边界 | 前端、服务装配和纯通信契约分开；核心组件继续保持既有职责 | 前端构建不再解析后端实现；不复制 Runtime 或持久化逻辑 |
| 运行与入口 | 本地后端同源提供页面和 API；普通启动进入 Web，保留无界面机器命令 | 保留回环、Host/Origin 和 Bearer 校验；取消普通终端命令与 Benchmark `--tui` |
| 终端退出 | 删除 Ink、终端 Controller 及交互评测链，保留有独立业务消费者的执行和测试 | 不保留旧终端适配器；评测不加载 UI，不新增 Benchmark Web 页面 |
| 数据与功能 | 保持现有功能、配置来源和当前版本记录；Web 装配仅读取正式工作区数据 | 模型偏好、审批、轨迹和指标不重置，不新增持久化版本或迁移 |
| 显式恢复 | 新增绑定 Goal/Run 与提交边界的恢复命令；活动状态由服务进程投影 | 不自动推进，不重建任务；防重复受理，恢复仍由 Runtime 决定副作用与审批 |
| 服务生命周期 | 复用根中止信号、检查点闸门、保存通知与资源关闭；关闭时阻止新推进 | 页面断开不取消任务；启动失败清理资源，不借助终端 Controller |

### 风险与待确认

- 风险等级：high，与 Requirements 一致；涉及入口取消、跨组件依赖、恢复和访问控制。
- 关键操作：实施阶段删除终端产品源码、专属依赖和交互评测分支；不删除 LazyGoal Home 数据、工作区文件或评测产物。
- 风险：遗漏类型的间接依赖、共享能力误删、恢复请求竞态或模型绑定错配，以及关闭期间仍受理写入。当前只保证单服务进程内的活动 Goal 预约，不新增跨进程租约或多用户能力。
- 待确认：无。生产同源运行、保留机器命令均已由用户明确选择；本 Design 已获用户批准。

## Overview

覆盖 [Requirements](./requirements.md) 的需求 1–7。保持当前部署方式，将工程分离落实为可检查的依赖边界，而不引入新的远程服务模式。

```text
apps/goal-board -- HTTP / SSE --> apps/goal-server
       |                              |
       +--> packages/web-contracts <--+-- packages/browser
                                      +-- packages/session-metrics
                                      +-- Runtime / Agent / LLM / Storage / Tools

bin/lazygoal.cjs -- explicit prefixes --> benchmarks / GEPA
```

`web-contracts` 不依赖后端、Node 或 UI 库；核心执行组件不反向依赖服务应用。图中的 API/SSE 访问在生产环境保持同源，并沿用现有授权规则。

## Key Design Decisions

### 工程边界

- `apps/goal-board` 保留 React 界面、浏览器 API Client 和交互状态，仅导入 `packages/web-contracts`、独立的 `slash-command` 和前端依赖。
- 新建 `apps/goal-server`，承接 `createCompositionRoot`、服务启动和路由装配。移入配置/Profile 加载、Tool 注册、模型绑定、Store、指标、资源和关闭装配；删去 `initialScreen`、终端渲染、Controller、终端模型切换器和 Benchmark 聚合选项。
- `packages/browser` 保留访问控制、HTTP 命令边界、领域到 Web 的投影、静态资源和实时流适配；`session-metrics` 保留指标归约。它们导入纯通信契约，不拥有应用装配或前端状态。
- 新建 `packages/web-contracts`，集中当前请求、成功/失败结果、Goal/Run 视图、权限、模型、轨迹、模型输入和指标 DTO，以及实际通信边界需要的校验函数。现有结构原位迁入，不引入 schema 生成框架或重命名整个协议。
- DTO 不使用 `Goal[...]`、`Omit<ModelInputRecord, ...>`、Runtime/Permission 类型别名或后端 barrel。用明确的 wire 字段表达展示内容；轨迹 Raw 使用事件信封与 JSON-safe 载荷，模型消息使用独立 wire 表示。后端显式投影，保持现有可见字段、白名单和限长语义，不把 Snapshot 作为响应。
- 将当前前端响应校验中可共享的纯函数迁入契约边界；HTTP 请求体字节上限、授权、状态和证据校验仍由服务端负责。类型安全的同进程调用不重复校验。
- 扩展依赖检查至应用目录并检查类型导入、重导出和 Node 内置模块：前端不得引用服务端，契约包零出站，服务应用可装配后端，后端不得引用前端实现。
- 前端保留独立 Vite 构建；服务应用建立独立类型检查、测试和启动入口，沿用当前 Node/tsx 执行及源码资源加载方式，不新增发行打包系统。根回归入口纳入服务应用及其测试，避免迁出 `packages/` 后漏检。

### 运行与入口

- `apps/goal-server` 在同一个回环 Host 挂载 API、SSE、指标和 `apps/goal-board/dist`；保留随机端口及 fragment 能力令牌。前端使用相对路径，不增加 API 地址配置、CORS 白名单或跨域凭据转发。
- `bin/lazygoal.cjs` 只做显式命令分发：无参数及 `web` 启动服务应用；已有 `eval`、`grade`、`load` 和 GEPA 入口继续路由到各自无界面实现。仅加载选中的入口，启动 Web 不导入 Benchmark 装配。
- `-c`、`resume`、`inspect` 等旧终端产品命令返回明确错误和非零退出码，指向 Web；未知参数仍拒绝。保留现有机器命令前缀的意义，不提供旧终端重定向适配器。
- 静态产物缺失沿用构建引导页及诊断，API 服务仍可启动；不改动当前布局预览的使用范围，也不承诺独立跨域生产部署。

### 终端退出

- 删除 `packages/tui` 的页面、Controller、ViewModel、时间线、终端 Markdown、键盘输入、Inspector 和渲染入口。`NotifyingGoalStore` 迁入服务装配，继续在底层保存成功后通知并隔离订阅异常。
- 删除 GAIA/SWE-bench 的 `--tui` 解析、依赖注入字段、运行分支，以及共享 `tui-benchmark-runner`、`tui-tool-policy` 和导出。移除选定交互分支后再核对相关 Tool RPC/Worker 消费者；仅随该分支失去全部生产消费者的实现纳入删除，Headless/ACP 路径保留。
- 清理 Ink、`@inkjs/ui`、终端测试和仅用于终端的格式化依赖。React 继续属于 Web 前端；是否移除其他直接依赖，以剩余实际消费者为准。
- 终端专属视觉测试退出；现有 Tool 装配、Profile/预算、模型绑定、文件权限、工作区路径、恢复、提交和进程关闭测试迁入服务、Runtime 或对应所有者，保留原断言。不得按原目录整批删除行为验证。
- 当前架构文档、依赖规则、启动说明和源码契约随实现更新；历史 Spec 不重写，Memory 状态维护走独立审批流程。

### 数据与功能

- 新服务从原 Composition Root 逐项迁移能力，保持 `LAZYGOAL_HOME`、真实工作区归一化、配置/Profile 来源和当前数据路径；测试用目录覆盖保持其既有语义。
- Web Root 使用正式工作区 Goal/Trajectory Store；删除仅服务于终端历史选择的 `AggregatedGoalStore`、`AggregatedTrajectoryStore` 装配。指标及检索同样绑定正式工作区，Benchmark 保持自己的持久化装配，避免恢复错误来源的 Goal。
- 保留共享模型 Binding、创建前对齐与保存前失败回滚、推进前恢复 Snapshot 模型、目录校验和工作区模型偏好。配置默认值与正在执行的 Goal 选择仍是不同事实。
- 不改 Snapshot、Trajectory、授权或模型偏好格式，不递增版本，不搬移 Home 文件。损坏记录沿现有稳定失败返回，不能通过空列表或默认模型掩盖错误。
- 现有 API/SSE JSON 内容保持原行为；新增恢复字段和接口按当前开发协议同步更新服务端、客户端和测试桩，不维护旧客户端兼容分支。

### 显式恢复

扩展 `BrowserGoalCoordinator` 的 `advance(ref, control)`，直接委托现有 `GoalCoordinator.advance`，不新增恢复状态机或改写领域状态。

| 边界 | 设计 |
| --- | --- |
| 列表及会话 DTO | 增加 `execution`：`state: active / recoverable / inactive` 和当前 Run 的 `committedThroughSequence`；由 Snapshot 与服务进程的活动预约共同投影，不保存到 Goal |
| 恢复请求 | `POST /api/goals/:goalId/resume`，精确接收 `{ runId, expectedCommittedThroughSequence }`，后者为页面读取的提交边界 |
| 成功结果 | 复用受理身份 `{ ok, goalId, runId, existing }`；只在新的对应 Snapshot 保存成功后确认受理，执行可继续到等待点或终态 |
| 稳定拒绝 | `goal_not_found`、`stale_run`、`stale_recovery`、`goal_busy`、`resume_not_allowed`、`model_restore_failed`、`resume_failed`、`service_shutting_down`；身份或边界过期要求刷新 |

恢复处理顺序：

```text
request -> wire validation -> reservation lock -> current Snapshot
        -> Run / boundary / status check -> reserve exact Goal/Run
        -> restore saved model -> subscribe committed-save notification
        -> Coordinator.advance -> first committed save -> accepted response
                               -> waiting / terminal / error -> release reservation
```

- 沿用命令服务唯一持有的单活动 Goal 预约，共用于创建、消息、交互和恢复；Run 身份在预约锁内从当前 Snapshot 核对，不另外建立恢复忙碌标记。创建或后续 Run 尚未保存时也先占用 Goal 位置，不猜测新 Run ID。仅 `created`、`running` 且无当前活动预约的 Run 可显式恢复；`waiting` 使用其已有交互或普通文本入口，终态不恢复。
- 在预约锁内重新读取 Snapshot；匹配同一 Goal/Run/预期边界的在途重试复用受理。旧边界重试返回 `stale_recovery`，避免任务已推进后再次启动；合法后续恢复须基于新读取的边界。边界未改变且未受理的失败保留原有恢复能力。
- 先保留活动位置再恢复模型，模型失败释放位置且不启动 Runtime。恢复采用 Snapshot 选择，不读取工作区新 Goal 偏好；创建中的模型回滚策略不与恢复混用。
- 监听器在 `advance` 前注册；仅匹配精确 Goal/Run 的新保存确认受理。受理前失败返回稳定错误；受理后失败由正式会话重新读取并展示。监听与活动位置在执行结束、异常或根中止时释放；HTTP 断开不提前释放它们，也不取消执行。
- `active` 仅来自当前服务对该 Goal 的预约；没有预约的 `created/running` 投影为 `recoverable`，无预约的等待及终态为 `inactive`。Run 的真实状态继续独立显示，不把进程活动状态写进 Snapshot。
- 活动预约建立和释放时，命令服务发布进程内 Goal 身份变化通知；实时流服务按 Goal 匹配，将 `refresh_required` 发给已绑定的 Goal/Run 订阅，页面重新读取后再核对当前 Run，使页面刷新活动状态，不伪造 Snapshot 提交事件。订阅关闭释放监听。
- 页面显示 `Resume Run`，发送期间保留读取的恢复命令用于重试，过期后刷新再提供操作；当前活动 Run 不显示恢复按钮。恢复只决定推进入口，safe Tool 重放、manual 结果未知、PTC 恢复、审批和模型纠错继续由 Runtime 的已提交规则决定。

### 服务生命周期

- 服务 Root 共享一个根 AbortSignal、Checkpoint Gate、资源注册表、保存通知和 Execution Stream；没有终端 Controller，也不维护额外的 UI 关闭状态。
- SIGINT 先启动统一关闭。写入 HTTP 边界及预约锁等待结束后检查同一中止信号，关闭中的新命令返回稳定 `service_shutting_down`，不进入模型绑定、文件写入或 Runtime 推进。
- 继续调用现有 `ShutdownCoordinator`：冻结检查点、abort、等待已进入的提交和资源清理，必要时强制关闭，以现有 130 语义退出。HTTP、流订阅、长进程等仍由资源注册表持有。
- 从装配起即建立失败清理边界：配置、Profile、Tool、路由或监听启动失败时关闭已创建资源并取消订阅，保留原始错误。关闭失败不能被静态页面状态掩盖，也不能清除最后成功快照。

## Components and Interfaces

| 位置 | 改动责任 |
| --- | --- |
| `apps/goal-server/src/` | 独立 Composition Root、模型/Tool 装配、通知包装器、Web Host 生命周期与测试注入 |
| `packages/web-contracts/src/` | 纯 DTO、命令/结果、JSON-safe 表示及必要 wire 校验；无后端类型别名 |
| `packages/browser/src/` | 导入纯契约；扩展命令服务恢复与活动身份读取/订阅；路由投影和鉴权保持后端所有权 |
| `packages/session-metrics/src/` | 公开指标 DTO 转到纯契约；模型调用事实与归约仍留本模块 |
| `apps/goal-board/src/` | 替换后端类型导入；新增恢复操作和进程活动展示，保留现有页面与 API Client |
| `bin/`、`benchmarks/`、检查脚本 | 薄入口分发、移除交互模式、扩展应用边界与测试发现 |

新增/扩展的公开接口在实现时补齐中文契约 TSDoc 与最小示例，说明活动状态不持久化、受理提交顺序、失败与订阅生命周期。通信 DTO 不成为 Runtime 的事实或恢复输入。

## Testing Strategy

- **工程隔离（需求 1、2、7）：** 独立前端构建、服务类型检查和核心导入；依赖检查拒绝前端/纯契约对后端的直接或间接依赖；启动 Web 和 Headless 命令均不加载 Ink/TUI。测试发现包含新服务目录。
- **入口删除（需求 2、7）：** `lazygoal`、`lazygoal web` 启动本地 Web；旧终端命令及 `--tui` 非零拒绝且没有执行副作用；保留现有评测、评分、数据准备和 GEPA 的参数、输出与退出码测试，不调用真实付费模型。
- **功能与数据（需求 3）：** 迁移现有真实服务 Web E2E，覆盖创建、多 Run、Plan、问答/审批、权限、模型偏好、归档删除、轨迹/模型输入和指标；当前格式的隔离 Home 在迁移前后路径、身份和内容连续，损坏文件不能被覆盖或显示为空。
- **恢复（需求 4）：** 在模型请求、Tool 执行、PTC 和纠错检查点中断并重启，验证页面读取不推进、显式恢复沿用 Goal/Run/模型；覆盖已提交结果不重放、manual 未知结果人工确认、审批等待和模型恢复失败。
- **恢复竞态（需求 4）：** 同请求并发/重试、边界过期、旧 Run、另一个活动 Goal、首个保存失败、受理后故障和页面断开；验证无重复 Run/副作用、预约及监听最终释放，活动变化通知能更新页面。
- **安全与关闭（需求 5、6）：** 未授权、Host/Origin 错配和跨域拒绝；关闭时的在途保存、新请求及排队命令、资源失败、启动失败与退出 130；没有伪造终态，凭据不进入 DTO 或前端持久化。
- 执行受影响测试、前端构建、服务及全仓库类型检查、依赖检查、完整回归和 Web E2E；使用确定性 Adapter 的隔离真实本地服务验证生产同源及跨重启恢复，分别报告自动化结果和未覆盖的真实 Provider 行为。

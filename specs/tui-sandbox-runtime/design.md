# TUI 沙箱透明代理运行时设计

## 审批摘要

### 方案

TUI 模式由宿主运行唯一的 Runtime，容器 Worker 仅提供工具执行服务。新增工具 RPC 连接两侧，现有 Headless ACP 会话路径保持原行为；TUI 接收通用运行依赖，不导入 Benchmark 环境类型。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| 执行与协议归属 | 宿主拥有 Goal、审批和持久化；在现有 Mux 新增 `tools` 通道，容器使用专门工具入口 | 新协议需实现及验证；不把 ACP 会话接口当作工具 RPC，不创建第二个 Goal |
| 存储与工具隔离 | 独立 `dataDirectory`、显式 Profile、整体替换的 ToolRegistry | 空输出目录可启动；无宿主文件工具混入、无容器状态覆盖，检查点仅供审计 |
| 单任务与审批 | 首批接入 GAIA/SWE-bench；明确 task/output-dir，默认 review，自动批准预定义 Planning，只读白名单控制工具审批 | auto 遇到用户输入等待时以未完成结束；review 可接收输入；联网工具使用显式宿主后端，未知工具不自动放行 |
| 生命周期与退出 | `IsolatedEnvironment.run()` 仍拥有唯一清理流程；TUI 通过取消和新增强制中止信号接管 | 正常清理总宽限期 30 秒，强制阶段额外最多 5 秒；可能损失未回收产物，失败必须报告；退出码按 0/1/2/130 区分 |
| 实时提交投影 | 从成功保存的 Snapshot 及其 committed Trajectory 驱动 SessionScreen | 执行期间持续显示进展；关闭停止订阅，UI 不持有第二份领域状态机 |
| 结果与恢复边界 | 复用领域评分/补丁导出，分开显示执行状态与评分；不提供跨进程沙箱恢复 | GAIA 答错不改变执行成功退出码，SWE-bench 官方评分仍独立；中断后不重放未知结果的远程动作 |

### 风险与待确认

- 风险等级：high；远程工具授权、宿主后端访问和容器清理会产生外部副作用。
- 关键操作：运行入口创建并删除本次隔离容器。
- 已知风险：断线时工具可能已经执行；强制清理可能无法完成产物回收；Docker 失联时只能报告删除失败。工具 RPC、实时投影及清理联动必须经过进程和容器验证。
- 待确认：无独立待决选项；本修订稿待整体审批，功能验证尚未执行。

## Overview

现有 [ACP Client](../../packages/acp/src/client.ts)提供会话生命周期，现有 [Worker](../../benchmarks/gaia/src/worker-entry.ts)在容器内装配 Headless Runtime。TUI 路径新增工具服务入口，把 Runtime 留在宿主；旧入口继续支持无头评测。以下新增接口均为本 Spec 的实施目标。

## Architecture

```text
Benchmark CLI -> runTuiWithSandbox -> TUI CompositionRoot -> Runtime
                       |                     |                |
                       |                     v                v
                       |                SessionScreen   Host Store
                       v                                      |
             IsolatedEnvironment.run                          v
                       |                              committed updates
                       v
                 Tools Worker <--- tools RPC <--- Remote ToolRegistry
                       |
                       v
                Container workspace
```

`benchmarks/src/` 拥有工具 RPC、运行编排及环境清理适配。`packages/tui` 只接收 Runtime/Storage/Agent 的通用端口；`packages/runtime` 不依赖 ACP 或 Benchmark。GAIA 与 SWE-bench 只从共享层复用设施，不相互导入。Headless 模块不导入 TUI 编排器；Benchmark CLI 仅在 `--tui` 分支动态加载它。

## Key Design Decisions

### 执行与协议归属

对应 req-1-1、req-3-1、req-3-5。复用 `IsolatedEnvironment.run({ runAgent })` 注入宿主驱动回调，专门的 `tools-worker-entry.ts` 不创建 Runtime、不调用模型、不写 Goal。模型凭据留在宿主；容器安全参数沿用现有隔离规则。

新增 `benchmarks/src/tool-rpc.ts`，在 Mux 当前版本原位增加 `tools` 通道，保留 `acp` / `llm` 的现有语义和帧/队列上限。新版 Worker 与宿主一起构建，握手不匹配直接失败，不提供版本迁移或重连重放。

工具定义采用每个 Benchmark 自己的静态 manifest：宿主代理与 Worker 共用输入 Contract 定义、工具 ID 和描述；Worker 握手返回 ID、编译后的输入 Schema 和 replayPolicy，宿主与本地 manifest 比较后构造不可变 `InMemoryToolRegistry`。不传输带品牌的 Contract AST，不新增通用 JSON Schema 到 Contract 转换器，也不为 Registry 增加 ACP 方法。

| 消息 | 输入/输出及行为 |
|---|---|
| `describe` | 返回本次工具 manifest；ID 集合、Schema 或 replayPolicy 不匹配时在模型调用前失败 |
| `execute` | 请求携带 requestId、actionId、toolId 和 canonical input；响应携带相同关联 ID 及 ToolObservation |
| `cancel` | 取消指定在途 requestId；Worker 将信号传递给工具及子进程，取消不伪装成普通工具失败 |
| `backend` | 仅供 GAIA 已授权的 web_search/web_fetch 执行调用宿主显式后端；绑定当前 requestId/actionId 和工具，不能请求任意宿主方法 |

一次会话只允许一个在途工具动作。Worker 在跨进程边界校验消息、输入及重复 requestId/actionId，调用自身 `ToolRegistration.prepare()` 后执行；宿主校验响应身份和 Observation。重复执行请求拒绝，不再次产生副作用；迟到、未知关联 ID、非法数据和断线使调用失败并中止本次会话，禁止降级到宿主工具。客户端不重发 execute。

代理 `prepare()` 只完成本地结构校验，不发送执行消息；远程语义校验仍发生在 Worker 边界。`execute()` 只能由 Runner 在 Policy 允许或消费当前 Action 的瞬时授权后调用。传输失败中止当前执行并保留最后检查点，原始错误另写 Attempt/诊断；普通领域 ToolObservation 仍由 Runtime 正常提交。

GAIA 的文件读取、答案提交在容器执行，网络请求由同一工具调用内的受限 backend 消息交给宿主；不向容器发送凭据或开放网络。未配置必要后端时在启动期失败。SWE-bench 的 read/write/edit/grep/bash 全部在 `/testbed` 执行。两种入口复用各自的工具、任务和产物处理代码，不复制 Headless Goal 循环。

### 存储与工具隔离

对应 req-2-1 至 req-2-5。扩展 TUI 装配输入：显式 `dataDirectory`、Profile、ToolRegistry、ToolPolicy、PreparationExecutor、LLMAdapter 和公共执行控制可注入；普通 CLI 缺省值保持原行为。`EnvironmentSpec` 和 Docker 类型不得进入 `packages/tui`。

`dataDirectory` 只决定 goals/trajectories/traces/context-sidecars 四类存储位置。Profile 由 Benchmark 注入；容器工作目录由 EnvironmentSpec 决定。显式 Registry 整体替代日常五工具注册表，不与宿主工具合并；Profile 中未注册的 ID 在装配时失败。Catalog 复用 `JsonFileGoalStore.listResumable()`，不新增 Catalog 文件。

```text
<output-dir>/
  runtime/<benchmark-key>/<task-key>/<attempt-key>/
    goals/ trajectories/ traces/ context-sidecars/
  artifacts/<benchmark-key>/<task-key>/<attempt-key>/
  attempts/<taskId>/attempt-<n>.json
```

Runtime 路径段使用现有持久化编码规则，Attempt 路径沿用对应基准已有约定。为每次尝试分配独立 goalId/runId，禁止覆盖已有尝试。Worker 缓存等本次生成文件也放在 output-dir 内；仓库源码、已有镜像缓存和数据集仍按明确来源只读访问。

宿主是 Snapshot/Trajectory 唯一写入方。工具入口对应的产物回收只导出答案、补丁等领域文件；抽取可共享的领域导出逻辑，保留 Headless 对容器 Runtime 状态的回收。TUI Attempt 的 persistence locator 指向宿主保存目录，不能复用“容器中缺少 Goal 即失败”的 Headless 结果恢复判断。

不新增 Snapshot 版本，也不把容器连接或 Registry 写进 Snapshot。TUI Benchmark CLI 拒绝 resume/continue 参数；日常恢复入口不会扫描上述命名空间。本期只支持进程内审批后的继续执行，保存检查点不代表能够恢复已删除的容器工作区。

### 单任务与审批

对应 req-3-2 至 req-3-4、req-4-1、req-4-2、req-4-4。GAIA/SWE-bench CLI 的 `--tui` 分支解析且只选择一个任务，要求 task/output-dir，默认 mode=review；非法选项及任务基数错误返回 2。现有未带 `--tui` 的参数和默认值不变。

`runTuiWithSandbox()` 接收基准适配器提供的已解析任务、Profile、模型配置、Tool manifest、只读名单、EnvironmentSpec 和结果处理函数。复用/抽取 Headless Root 的 descriptor PreparationExecutor：直接产出 context_ready 和确定性 task_proposal，仍经 Launcher/Coordinator 提交与 approve 流程进入 executing。自动批准只针对 CLI 显式选择的预定义任务，不改变日常 TUI 的 Planning 审批。

| 模式/基准 | 自动允许的工具 | 其余已注册且 Profile 授权的工具 |
|---|---|---|
| auto | 全部 | 不存在绕过 Profile 或输入校验的额外授权 |
| review / SWE-bench | read_file、grep | require_approval，包括 bash、write_file、edit_file |
| review / GAIA | read_file、web_search、web_fetch | require_approval，包括 submit_answer |

新增工具即使名字含 read，也不自动进入只读名单。不新增副作用元数据或名称猜测规则。策略使用当前 `ToolPolicy.evaluate()` 的 `allow` / `require_approval`；SessionScreen 复用 approve_action/reject_action，拒绝由 Coordinator 提交 rejected Observation，批准依旧是单次授权。

自动模式若到达 blocked/user-input 等待点，由编排器记录本次未完成并启动清理；review 可以接收现有 blocked 输入。GAIA 提交成功须经关联 Observation 确认，后续使用该基准的完成条件推进终态，不在 UI 中伪造 completed。

### 生命周期与退出

对应 req-1-2 至 req-1-5、req-4-3。保留 `IsolatedEnvironment.run()` 对容器与 finally 的所有权，新增可选 `forceSignal`，仅用于 TUI 超过关闭宽限期后进入强制清理；未传入时 Headless 行为不变。不要新增虚构的环境 dispose，也不要把 collectArtifacts 与删除容器注册为两个并发资源。

Benchmark 编排器在启动任何异步环境工作前建立 AbortController、force AbortController、受管资源和 SIGINT/raw-mode 入口。TUI 通用挂载入口与 createCompositionRoot 装配分开，使加载模型配置、预检和工具握手期间也能处理取消；初始化错误沿同一个外层 finally 清理。

受管资源是单个生命周期适配器：`close()` 取消正常执行并等待同一个 run Promise；`forceClose()` 发出 forceSignal，等待有界强制清理结果。环境实现统一管理正常/强制两个阶段，重复取消或两个清理触发并发时不能重收产物或并发删除。所有终止路径必须使在途 RPC、Worker 及子进程结束；迟到启动结果也要按本次容器身份回收。

```text
stop UI commands -> freeze checkpoint gate -> abort execution
       -> settle entered saves and tool calls -> stop Worker
       -> collect domain artifacts -> remove container -> write attempt -> exit
```

正常 Goal 终态先完成最后提交，再走清理；SIGINT 冻结 Gate，只等待已进入的原子保存，不制造新的领域终态。产物收集使用独立于执行取消信号的有界控制，正常完成和取消都复用它。

TUI 模式从清理开始共享 30 秒总宽限期，注入 ShutdownCoordinator 的 gracePeriodMs 同样为 30 秒；Worker 等待和产物回收消费同一个剩余预算，不能分别重新计时。到期停止产物收集、关闭传输、终止 Worker/子进程，再用额外最多 5 秒执行本次容器删除；失败记录容器身份和阶段，不能永久等待 Docker。修改共享环境时用无头回归保证未带 forceSignal 的流程不变。

现有 ShutdownCoordinator 专供 SIGINT 并固定请求 130。Benchmark 注入记录退出请求的 ExitPort，外层编排在清理结果/Attempt 完成后真正退出；正常完成调用同一生命周期适配器清理，不调用 SIGINT 的 shutdown()。初始化或正常运行失败返回 1，参数错误返回 2；收到 SIGINT 后退出码始终为 130，但仍报告清理错误。清理诊断持久化失败时写 stderr，并保留最后成功快照。

### 实时提交投影

对应 req-5-1 至 req-5-3。在 TUI 装配层给 GoalStore 增加成功保存通知：底层原子 save 完成后发布不可变 Goal 副本，Checkpoint Gate 仍在外层。通知不写业务状态；订阅者失败作为 UI 错误处理，不能把已成功保存变成保存失败。

SessionController 接收当前会话的提交更新，更新已持久化的状态，并通过 `readTrajectoryAtSnapshot` 读取 committed 事件。按 goalId/runId/sequence 关联、去重并拒绝迟到的旧读取结果；未提交 tail 不渲染为成功。只展示 Action/Observation 摘要、步数和必要消息，不加载第二个 Runtime，也不轮询完整状态目录。

进展更新不修改 dispatch 的 busy 锁。只有 Coordinator 已返回真实 action_approval 等待点且 busy=false 时才启用审批；保存通知不能在执行 Promise 未结束时开放按钮。初始化阶段显示任务与模式，清理阶段保留最后状态并停用输入。卸载、初始化失败和关闭均注销订阅，忽略晚到更新。

### 结果与恢复边界

对应 req-2-4、req-2-5、req-5-4。Benchmark 适配器复用原有答案评分、补丁导出和 AttemptRecorder；宿主状态与领域产物以同一 goalId/runId/attempt 关联。GAIA 的错误答案属于明确评分结果，不被 completed 隐藏；SWE-bench patch 导出不等于官方 resolved，官方 grade 入口保持独立。

输出摘要区分 execution、domain result、artifact completeness 和 cleanup。退出码 0 表示本次执行及必要产物/清理完成；GAIA 的 correct=false 仍完整展示且不伪装基础设施错误。缺少必要答案/补丁、Agent fail、步数耗尽或 auto 被阻塞返回 1。断线时保持已提交的 pending Action 供审计，不自动重放，也不以全新容器冒充原环境恢复。

## Components and Interfaces

| 所有者 | 拟新增或扩展的边界 |
|---|---|
| benchmarks/src/tool-rpc.ts | manifest 握手、execute/cancel/backend 消息、严格跨进程校验和有界等待 |
| benchmarks/src/tui-benchmark-runner.ts | runTuiWithSandbox、单任务驱动、受管清理及结果汇总；只由显式 TUI 分支加载 |
| benchmarks/src/isolated-environment.ts | 可选 forceSignal、TUI 清理预算及幂等阶段控制；保留 run() 为生命周期所有者 |
| benchmarks/gaia、benchmarks/swebench | 各自工具服务入口、manifest、任务适配、领域产物导出；保持水平隔离 |
| packages/tui | 通用运行依赖注入、挂载/退出接线、成功保存通知、SessionController 实时投影 |

新增或扩展公共 TypeScript 接口的同次实现必须补中文契约级 TSDoc 和最小 example。实现改变模块职责、状态归属或协议时，同步更新 AGENTS.md 布局和相关 docs/architecture；本次 Spec 不把拟议行为写成当前架构。

## Error Handling

协议非法、未知工具、错误关联 ID 和未知结果的传输失败均终止本次工具会话；普通工具领域失败交给 Runtime。环境/模型/Profile/后端配置在创建 Goal 前校验。主错误与 artifact_collect/cleanup 错误独立保留，清理失败不能掩盖原错误，SIGINT 不合成业务 fail Step。

## Testing Strategy

以 [tasks.md 的 Planned Checks](./tasks.md#planned-checks)为逐项验收依据。离线测试使用注入的 ProcessRunner、LLM、后端和可控时钟；跨进程测试使用真实工具 Worker 与本地临时工作区，不调用真实模型。只在显式容器冒烟入口运行 Docker，使用脚本化 LLM，避免依赖模型随机输出或付费网络调用。

重点证据包括：审批前/拒绝后 Worker 执行计数为零，批准后恰好一次；阻塞下一次模型响应时已显示上一提交；空输出目录可启动且原工作区内容指纹不变；正常、启动失败、在途取消、回收超时和删除失败的清理顺序、退出码及诊断正确。原有 Headless 和普通 TUI 测试必须通过。

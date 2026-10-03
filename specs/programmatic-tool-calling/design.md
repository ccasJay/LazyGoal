# PTC 程序化工具调用设计

## 审批摘要

### 方案

通过默认注册的 `execute_program` Tool 提交 JavaScript；复用 `sandbox` 的 macOS 隔离基础设施，并由 Runtime 复用现有授权、审批与检查点提交机制处理内部调用。恢复采用相同代码重放纯计算、返回已提交工具结果的方式，不保存 Node.js 内存。

### 关键决策

| 决策 | 选择与理由 | 影响 |
|---|---|---|
| Tool 入口 | `execute_program({ code })` 与直接调用共存，Prompt 引导选择 | 不新增模型决策种类，不允许嵌套 PTC 或调用系统决策工具 |
| 隔离与平台 | 在现有 sandbox 包新增严格 Seatbelt 策略与 Node.js 执行器，不引入 Docker | 首版仅 macOS 可执行；不支持的平台明确失败，直接调用仍可用 |
| 可恢复 JavaScript | 提供确定性的计算环境和串行工具交付；不暴露宿主模块、计时器或动态代码生成 | 时间与随机值固定或可重放；恢复请求失配即停止，不承诺任意 Node.js 程序可运行 |
| 调用与审批 | 复用现有逐调用权限链路；新增父程序状态，内部仍只有一个 pendingAction | 程序入口不批准内部操作；内部结算不增加模型 Step |
| 日志与续跑 | 以已提交 Trajectory 作为调用日志，Snapshot 保存恢复指针 | 已提交结果不重新执行；可能有副作用的未知调用等待用户，现有 safe 声明不能自动放行 |
| 上下文与证据 | 内部事实保留审计，默认从模型历史、自动摘要与检索索引排除 | 模型只收到程序级返回或有界诊断；程序返回不自动证明内部操作成功 |
| 资源与取消 | 固定执行、内存、调用与数据预算；取消传播现有 ExecutionControl | 进程内存阈值由宿主采样终止，存在短时越限；不承诺回滚或立即终止已启动工具 |
| 数据与依赖 | 原位扩展当前 Snapshot/Trajectory 契约，复用现有包和 Node.js 内置模块 | 不增协议版本或迁移历史数据；同一 Goal 沿用单推进者约束，不新增跨进程并发执行支持 |

### 风险与待确认

- 风险等级：高；延续 Requirements 的代码执行、权限与副作用恢复风险。
- 关键操作：内部 Tool/Sandbox 请求继续使用现有审批；本阶段不执行模型程序、不修改宿主权限或安装依赖。
- 风险：Seatbelt 启动白名单必须实测；`node:vm` 只隔离计算环境，不能替代内核隔离；重放可能因代码行为失配而失败；RSS 监控不是内核硬内存配额；宿主中止与用户取消须区别处理，未知副作用仍需人工决定。
- 待确认：无设计决策待确认。

## Overview

覆盖 [Requirements](./requirements.md) 的需求 1–7。采用专用程序注册项与 Runner 内部程序调度，复用业务工具而不让 Tool 读取 GoalStore。首版按单个 Goal/Run 顺序推进，程序内部调用串行执行；`Promise.all` 可以表达组合，但不承诺工具并行。

## Architecture

```text
Agent --execute_program({code})--> Runner / ProgramExecution
                                      |           |
                                      |           +--> CheckpointCommitter --> Snapshot / Trajectory
                                      |
                                      +-- JSON pipes --> sandbox / Node.js worker
                                      ^                         |
                                      +---- tool request -------+
                                      |
                                      +--> existing authorization --> existing Tool
```

Runtime 拥有程序和子 Action 的持久化状态；sandbox 只处理执行进程、限制与字节通道，不依赖 Runtime 或 Permission。业务工具继续使用自己的沙箱，程序进程不会继承它们获批的文件或网络能力。

## Key Design Decisions

### Tool 入口

- 稳定 ID 为 `execute_program`，输入 Contract 只有 `code: string`；代码是允许 `await` 与显式 `return` 的异步函数体，限制按 UTF-8 字节计算。具体实现注册在 `tools`，Runtime 的注册契约区分 `tool` 与 `program`，避免伪造普通 Tool 执行闭包或借回调访问 GoalStore。
- `createToolRegistration` 为既有工具生成 `tool` 注册项；程序注册项仅准备已校验代码，由 Runner 的程序分支执行。模型侧仍得到普通 ToolDefinition，原生单次 Decide 一个工具调用的契约保持不变。
- 默认本机装配将该 Tool 加入新 Goal 的默认 Profile 与 Registry；已有冻结 Profile、自定义 Profile 和 Benchmark 工具集不被隐式修改。自定义装配需显式注册，且具备 Trajectory 与程序执行依赖；缺失依赖时启动配置失败，不在程序执行中临时补齐。
- Prompt 展示 `tools[toolId](input)` 的输入说明、`ProgramToolResult` 返回结构、错误处理及 `return` 示例，并提示批量处理优先使用 PTC；普通工具与系统决策仍保持原有入口。内部白名单来自冻结 Profile 与 Registry 的业务工具交集，排除 `execute_program` 和系统决策工具。

### 隔离与平台

- 复用 `isSeatbeltSupported`、`SANDBOX_EXEC_PATH`、私有临时目录与环境清洗函数；新增 `buildProgramSeatbeltPolicy`，不修改或直接调用现有 Bash 的 `buildSeatbeltPolicy`。
- 通过 `spawn` 的显式 argv 启动 `sandbox-exec` 和 Node.js，禁止 Shell 拼接。策略默认拒绝文件、网络及进程派生，仅允许指定 Node.js 启动、固定 worker 资产及 Node.js 所需运行时文件的读取；不放行工作区、用户 HOME、整个 `/opt` 或 `/Library`。解析真实路径、转义 SBPL 字符串并在启动时检查运行时所需资源，不能建立完整白名单则拒绝执行。
- worker 使用独立 `.cjs` 资产，无需在沙箱内加载 `tsx`、项目依赖或源码目录。清洗环境时以空继承环境为起点，把 cwd/HOME/TMP 指向私有目录；不继承 `NODE_OPTIONS`、代理设置、API Key 或外部授权。
- 双向专用管道承载有界 JSON 帧；stdout/stderr 独立排空并限额，不作为返回值。接收端按进程边界解析、校验并限长；任何子进程声明的 Action ID、权限、已执行状态或恢复进度都不可信，均由宿主分配或判定。
- macOS 实测隔离失败、Node.js 能力缺失或其他平台均返回 `PTC_SANDBOX_UNAVAILABLE`，不退回普通子进程。业务工具的 SandboxExecutionPlan 只交给该工具，不交给程序 worker。

### 可恢复 JavaScript

- 使用独立进程中的 `node:vm` 创建计算上下文，将代码包成异步函数。提供标准纯计算对象、JSON、Promise 和上下文内生成的工具函数；不注入宿主对象或函数，不提供 `process`、`require`、模块导入、fetch、计时器、Buffer、WebAssembly、eval 或 Function 动态构造能力。
- 在程序启动事实中保存固定逻辑时间与随机种子；该上下文的无参 Date/Date.now 使用固定时间，Math.random 使用确定性序列，重放从相同种子开始。外部信息只能来自工具，已提交的工具返回在重放中保持原值。
- 工具请求按发出顺序排队，并按顺序交付结果；worker 暴露的调用描述只携带 toolId/input，请求序号由宿主生成。后台未等待的调用不能在 `return` 后继续执行；提前返回且有未结算调用时停止推进，先处理已开始调用的结果，再以 `PTC_UNAWAITED_CALL` 结束程序。
- 重放校验保存的代码摘要、worker 摘要、Node.js 版本、运行规则、每次调用的顺序、toolId 和规范化输入。任何失配都是 `PTC_REPLAY_MISMATCH`，不得尝试寻找相似调用或另开新程序绕过。确定性环境是恢复约束，内核沙箱仍是安全边界。

### 调用与审批

- 将 Runner 现有工具准备、Permission/Grant 查询、Sandbox 判定、意图提交和单次执行流程抽为内部共用路径，直接调用与 PTC 子调用共用它；不是重新实现一份权限逻辑。typed 同进程内部数据不额外重复解析，模型、管道与持久化边界仍严格校验。
- 程序入口通过 Profile 和输入检查；默认策略允许启动受限计算，不授予任何内部业务权限。其描述不得标称整个程序只读。自定义 Policy 若要求审阅入口代码，先沿用普通 Action 审批；获批也不跳过子调用审批。
- 程序持有父 Action；当前内部操作使用唯一 `pendingAction`。需要审批时提交父程序恢复指针和子 Action 等待状态，销毁 worker 后返回现有 waiting；用户答复仍通过 Coordinator 匹配子 actionId、Scope 与 Grant，并由 Runner 重建程序到该调用处。
- `ProgramToolResult.observation` 使用现有 `success`、领域 `failure` 与用户 `rejected` 形态；`sourceReferences` 只携带已提交工具结果的来源序列。越权、注册缺失、输入非法、协议及提交错误不作为可忽略成功，按稳定错误结束或阻止推进；程序不得用 catch 绕过未获批准操作。
- 子调用完成使用程序专属状态转换，不更新 `lastStep` 或 `stepCount`；父程序唯一结算才提交一次外层 Action/Observation Step。拒绝、恢复和重放不能重复计 Step，PTC 也不启动新的模型 Step 来继续内部调用。

### 日志与续跑

- 新增 `RunState.pendingProgram` 保存父 Action、代码摘要、运行规则、预算与恢复位置；源码沿用父 Action 的输入。调用的大结果仅保存在 Trajectory，不复制到 Snapshot、messages 或 Working Memory。
- 复用 CheckpointCommitter 的事实、Snapshot、marker 顺序。内部工具生命周期事实携带宿主分配的 programId/callIndex 关联；只有 `committedThroughSequence` 内的结果才可返回 worker 或成为重放输入，未提交 tail 不构成成功。
- 恢复先检查同一 Goal/Run、代码、日志连续性和单推进者状态；旧 worker 连接失效后启动新进程，从代码开头重建纯计算。遇到已结算调用返回已保存 Observation，不查当前文件、不重发外部请求；到达未结算调用才进入既有授权/执行路径。
- 调用执行前保存意图与 started 状态，实际返回后先提交结果再发送响应。已开始但无提交结果的非只读调用一律进入 `outcome_unknown`，包括原来标为 safe 的 write_file/edit_file；只有声明只读且 safe 的调用可按现有有限重试规则重做。
- 未知副作用复用现有人工批准或拒绝路径：批准明确表示允许重试，并提示可能重复副作用；拒绝生成已提交 rejected 结果交给程序。不得假定操作未发生或自动制造成功结果。恢复时检查已获批但尚未开始的调用权限及当前撤销状态。
- 父程序终态与外层 Observation 在同一检查点结算；已结算父程序不再启动 worker。按相同身份重入直接使用该结算；重复请求、丢失日志、错误身份和提交失败均不能产生第二次执行。

### 上下文与证据

- 扩展执行单元适配、TrajectoryEventProjector 和原生调用历史：模型可见交换只匹配父 actionId；内部事件不提前关闭父执行单元，也不生成伪造的模型 tool_call/tool_result。
- 内部完整输入与输出从普通 Hot/Warm 上下文、自动紧缩和 Context Lookup 索引排除，避免从旁路重新加载；保留同一事实账本供恢复及 Browser/TUI 审计。程序级等待原因、最终返回与有界诊断可以进入上下文。
- 父成功 Observation 的 output 原样承载 JSON-safe `return` 值，不附加完整日志、子结果或模型未要求的汇总；summary 由 Runtime 使用固定文案生成。无返回的 undefined、循环引用、函数、bigint、非有限数字及超限返回均产生明确失败。
- 内部已提交 tool_finished/observation_recorded 仍可被当前 Run 的 Evidence Gate 校验，来源关联由 Runtime 保存；父返回只证明程序返回了该值，不能代替子工具事实。模型若需要提交内部事实引用，可由程序显式返回宿主随工具结果提供的来源引用，而非自动注入所有引用。

### 资源与取消

- 首版使用固定常量，不新增用户配置：源码 64 KiB、实际工具调用最多 128 次、单个管道结果 16 MiB、程序累计结果日志 256 MiB、返回 64 KiB、诊断 4 KiB。超限先保留已完成调用的结算或未知状态，再报告资源失败；大数据不能因截断而被当作完整结果重放。
- 累计活动预算 120 秒，包含计算、重建及工具执行，不包含停机和人工审批等待。宿主以最多 1 秒的时间额度先提交预留再允许继续，崩溃后将该额度视为已消耗，避免重启重置预算；正常等待时保存剩余预算。同步计算和微任务处理也必须受独立 watchdog 约束。
- Node.js 设置 V8 old-space 192 MiB；宿主每 100 ms 检查 worker RSS，超过 256 MiB 则终止，无法监控则不启动。heap 限制不能替代总内存检查，RSS 采样有短时越限窗口；预算针对计算进程，业务工具沿用其既有限制。
- 主动取消由宿主在 AbortSignal.reason 中明确标记 `user_cancel_program`；程序分支处理为父失败 Observation 的 `PTC_CANCELLED`，不新增 Run 终态。正常审批等待仍可续跑；其他 ExecutionAbortedError 沿用现有关闭语义原样传播，不伪造失败 Step。再次显式恢复关闭中的程序沿用已提交恢复点；取消或资源失败已结算的程序不被自动重启。
- 取消、资源失败或程序错误遇到未结算副作用时，先保存 `pendingProgram.pendingStop` 并进入结果未知等待；人工处理完该子调用后结算原停止原因，不重建计算或继续后续调用。尚未开始的待审请求可以停止，不得执行它来完成清理。
- 关闭管道并终止 worker，超时使用强制终止；向当前工具传递原 ExecutionControl。worker 失去宿主管道后退出，并受本地计算超时约束；父进程消失不会把 worker 变成拥有宿主权限的独立执行者。工具自身退出能力与未知结果遵守现有契约。

### 数据与依赖

- 当前 Runtime、Storage DTO/Codec、Contract AST 与 Trajectory 事件契约一起原位扩展，新增公开接口补齐中文契约 TSDoc 与最小示例；不引入第二套日志 Store、Node 堆快照、Docker、JS 编译器或第三方沙箱依赖。
- 程序定义中的运行规则必须与当前实现精确匹配；历史开发数据无迁移、猜测或 fallback。默认 Profile/Preset 的当前定义同步更新，已保存 Goal 的冻结工具权限不自动扩展。
- 实现时同步当前架构文档中的 sandbox、Runtime、Agent 与 Storage 责任及恢复边界；本 Design 不把尚未实现的 PTC 写入当前架构文档。

## Components and Interfaces

| 所有者 | 接口与最小扩展 |
|---|---|
| tools | `execute_program` 的 ToolDefinition、code Contract 与程序注册项；不依赖 GoalStore |
| sandbox | `ProgramSandbox` 的启动、JSON 管道、watchdog、RSS 检查与清理；接收代码/预算，不认识 Goal 或工具权限 |
| runtime | `ProgramExecution` 调度及恢复；Runner 共用 Action 执行路径；Coordinator 复用子 Action 审批与恢复输入 |
| storage | 当前 Snapshot 的 pendingProgram DTO/Codec、内部关联字段和跨字段一致性检查；仍使用现有 JSON/JSONL Store |
| agent / tui / browser | 程序调用说明、父调用模型投影；已有轨迹详情和审批面板增加父程序关联及未知副作用提示，不新增管理页面 |

管道采用专用 fd 上的长度受限 JSON 帧：宿主发送 start/result，worker 发送 call/return/error；call 只含局部请求标识、toolId/input，result 按局部标识返回 `ProgramToolResult`。局部标识仅关联当前管道响应，不作为持久化身份；重复、乱序、无请求的结果或未知消息立即停止推进。所有规范化输入与持久化身份均由 Runtime 产生。

程序内的最小调用示例：

```js
const { observation, sourceReferences } = await tools.read_file({ path: "README.md" });
if (observation.kind !== "success") return observation;
return { lines: observation.output.split("\n").length, evidence: sourceReferences };
```

## Data Models

| 记录 | 持久化内容 |
|---|---|
| pendingProgram | programId、父 action、executionUnitId、codeHash、worker 摘要/Node.js 版本/运行规则、固定时间/随机种子、下一个调用位置、已用预算及未完成时间额度、可选 pendingStop |
| pendingAction | 沿用现有子 action、approvalKind、effectiveSandboxScope、scope/grant 与状态；与 pendingInteraction 互斥 |
| program_started | 关联身份、代码摘要、运行规则与预算；必须在启动 worker 前提交 |
| 内部工具事实 | 原有 Action/Observation 内容，加 programId/callIndex；每个序号对应一个稳定子 actionId |
| program_settled | 父 actionId、完成/失败原因、最终 Observation 与预算结算；与父 Step 一起提交 |

程序在运行或工具审批等待时允许 `pendingProgram` 与子 `pendingAction` 共存，但禁止同期模型推理、pendingInteraction 或其他父程序。等待类型由现有 pendingAction 表达，Snapshot 不增加重复的审批状态。普通 Action 不持有 pendingProgram。

父程序开始和结束分别使用明确的状态转换；内部 `stage_action`、批准、拒绝和结果提交识别程序关联，不能误走普通 `observe_action` 的 Step 结算。恢复日志读取完整 committed 序列，不采用模型上下文裁剪后的 DTO。

## Error Handling

| 情况 | 行为 |
|---|---|
| 代码或返回错误 | 父失败 Observation，稳定错误码及有界位置诊断；不返回原始堆栈中的中间值 |
| 审批或未知副作用 | 保存 waiting；不结算父 Step，不继续模型，不重发未知操作 |
| 子工具基础设施异常 | 只读 safe 按有限重试规则；可能产生副作用的未知结果先人工处理；其他错误结算父失败 |
| 恢复失配、日志损坏或提交失败 | 先阻止工具推进；失配报告程序恢复错误，底层 Store 错误原样传播；不改写未确认事实 |
| 取消、超限或隔离失败 | 停止新请求并清理；已开始工具的未知状态先保存，不能用失败结算掩盖它 |

## Testing Strategy

| 需求组 | 行为验证 |
|---|---|
| 1、3 | 默认 Tool 暴露和 Prompt；直接调用回归；读写/Bash 组合、循环、分支、Promise.all 顺序交付；嵌套及系统工具拒绝 |
| 2 | 真正的 macOS worker 集成：允许计算和管道，阻止工作区读写、联网、派生进程与凭据访问；运行时加载成功；不支持或白名单失效拒绝启动 |
| 4 | 大量内部结果过滤后仅返回结论；同时检查原生历史、Hot/Warm 紧缩及检索索引；stdout/stderr、未返回、非法 JSON 和提前返回不伪装成功 |
| 5 | 复用 Permission 的 Default/YOLO、两类 Grant、审批期限与撤销测试；审阅实际子输入，批准/拒绝及过期答复后程序继续正确 |
| 6 | 在意图、started、结果追加、Snapshot、marker、响应发送和父结算处注入中断；结果只取 committed 边界；写入不重复，未知结果等待；重放失配、损坏日志和身份冲突阻止执行 |
| 7 | 同步死循环、微任务循环、超大输入/结果、次数与累计预算、RSS 超限；取消、宿主关闭、子进程崩溃和资源清理；重建不重置预算、不重复计 Step |

安全与恢复验证必须包含真实进程和真实持久化 Store，不能仅由 mock 覆盖。macOS 隔离验收是交付条件；非 macOS 测试仅证明拒绝执行，不能宣称完整 PTC 可用。文档阶段只检查结构、引用与契约覆盖，不运行未实现的功能测试。

## Research Findings

- [Node.js Permission Model](https://nodejs.org/api/permissions.html) 不保证抵御恶意代码；[node:vm](https://nodejs.org/api/vm.html) 也不是安全机制，因此采用 Seatbelt 强制访问边界，计算上下文只收窄可用 API。
- [Node.js 内存参数](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-mib) 限制 V8 old-space，不能视为整个进程内存硬上限；另设宿主 RSS 监控并明确采样限制。
- 复用边界依据 [sandbox 导出](../../packages/sandbox/src/index.ts)、[现有 Bash 策略](../../packages/sandbox/src/macos-seatbelt.ts)、[Runner](../../packages/runtime/src/runner.ts)、[检查点提交器](../../packages/runtime/src/trajectory-checkpoint-committer.ts) 和 [原生模型历史](../../packages/agent/src/native-model-history.ts)。

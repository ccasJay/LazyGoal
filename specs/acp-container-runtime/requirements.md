# ACP 容器 Runtime 接入 需求

## 审批摘要

### 目标

新增可复用的 `@lazygoal/acp` 协议包，并将 SWE-bench 改为由宿主通过 ACP 驱动题目容器内的完整 LazyGoal Runtime，使评测覆盖真实 Runtime、Prompt、Storage 与内置 Tool 协作，同时保持模型凭据、评分材料和供应商访问留在宿主。

### 范围

- 包含：稳定 ACP v1 的 Agent/Client 库接口与 Session 生命周期；SWE-bench 专用 Profile 和预批准任务入口；容器内 Runtime、五个内置 Tool 与持久化；宿主模型桥、Worker 注入、进度通知、取消清理、产物复制和报告更新；直接替换现有 `swebench_shell` 评测路径。
- 不包含：通用 `lazygoal acp` CLI、`session/load` 或 `session/resume`、MCP Server、额外工作区、图片/音频/嵌入资源 Prompt、客户端代理文件或终端操作、宿主/容器双模式 A/B、跨容器恢复，以及向题目容器提供网络或模型凭据。

### 核心行为

- `@lazygoal/acp` 必须允许调用方通过所提供的双向流创建 ACP Agent 或运行一次 Client Session，并严格处理握手、建会话、文本与受限本地资源 Prompt、隔离更新、取消和资源释放。
- Prompt 中的 `ResourceLink` 只能指向当前 Session 工作目录内可读取的本地 `file:` 资源；空文本、非本地或越界资源、不可读资源及其他内容类型必须整体拒绝。
- 每个 SWE-bench 题目必须在独立官方容器中运行完整 LazyGoal 执行链，以 `/testbed` 为唯一工作区，并使用只授权 `read_file`、`write_file`、`edit_file`、`grep`、`bash` 的专用 Profile 和确定性预批准任务。
- 容器保持既有资源与权限限制、无网络、无宿主挂载且无模型凭据；ACP 控制流与模型 RPC 语义隔离，题目命令无法读取或污染控制通道。
- 不含 Node 的官方 linux/amd64 镜像也必须能够接收并运行可核验的 Worker；运行环境不兼容时须在模型调用和 Goal 副作用前明确失败。
- Tool 进度、终态、取消、错误、Runtime 持久化、最终补丁和 Worker 身份必须形成可核验的 ACP 更新与评测产物；现有 CLI、单题单次执行和官方评分成功语义保持不变。
- 现有 `swebench_shell` 路径被直接替换，不保留旧模式、旧开发期持久化或旧报告消费者的兼容分支。

### 风险与待确认

- 风险等级：high；理由：新增公共协议接口并改变跨进程、模型访问与容器隔离边界，同时直接替换 SWE-bench 的现有执行路径。
- 关键操作：功能执行时会创建、启动、在其中执行命令、复制产物并强制删除本次评测唯一命名的题目容器；操作范围仅限当前评测创建的容器，不挂载宿主目录。
- 风险：协议传输、Worker 注入或宿主模型桥故障可能中断整题执行；Runtime 进入容器会改变资源消耗与旧结果的可比性；Node 与上游题目镜像的系统库兼容性必须在运行前验证；强制清理可能只保留部分产物。
- 待确认：无。

## 引言

当前 SWE-bench 仅由宿主 Runtime 通过 `swebench_shell` 操作题目容器，无法评测 LazyGoal 内置 Tool 和完整运行边界。本功能引入通用 ACP 库，并以 SWE-bench 作为首个客户端，将完整 Runtime 放入隔离容器，同时由宿主安全代理模型调用并保留现有官方评分与产物审计能力。

## 需求

### 需求 1：提供可复用的 ACP v1 库接口

**用户故事：** 作为 LazyGoal 集成开发者，我希望通过独立 package 接入标准 ACP Agent 与 Client 生命周期，以便不同宿主可以复用同一协议边界而不依赖 SWE-bench 实现。

#### 验收标准

1. <a id="req-1-1"></a> 当调用方提供双向消息流和 Session 实现时，`@lazygoal/acp` 必须能够在该流上启动兼容稳定 ACP v1 的 Agent。
2. <a id="req-1-2"></a> 当调用方提供双向消息流、工作目录和由文本或受限本地资源组成的 Prompt 时，`@lazygoal/acp` 必须能够完成初始化、创建 Session、发送 Prompt、接收更新并返回终止结果的一次性 Client 流程。
3. <a id="req-1-3"></a> 当调用方使用 package 的公开接口时，接口必须明确约定 Session 所有权、取消、错误、资源释放和不支持能力，并提供中文契约文档与最小示例。

### 需求 2：严格执行 Session 能力与隔离边界

**用户故事：** 作为 ACP Client 实现者，我希望 Agent 准确公布能力并隔离每个 Session，以便客户端不会依赖未实现的功能或收到其他任务的状态。

#### 验收标准

1. <a id="req-2-1"></a> 当客户端初始化连接时，Agent 必须公布不支持 Session 加载或恢复，且不得公布认证、客户端文件系统或客户端终端能力。
2. <a id="req-2-2"></a> 当客户端创建 Session 时，Agent 必须接受绝对工作目录和空 MCP/额外目录配置，并拒绝相对工作目录、非空 MCP Server 或非空额外目录。
3. <a id="req-2-3"></a> 当客户端提交由一个或多个非空 `Text` 或 `ResourceLink` 块组成的 Prompt 时，Agent 必须按输入顺序交给 Session；`ResourceLink` 仅允许指向当前 Session 工作目录内的本地 `file:` 资源，空文本、非本地资源、工作目录外资源、无法读取的资源或其他内容类型必须使整个 Prompt 被拒绝。
4. <a id="req-2-4"></a> 当同一 Session 已有 Prompt 正在执行或 Session 不存在时，Agent 必须拒绝新的执行请求；不同 Session 必须能够独立并发执行，且上下文、更新、取消和结果相互隔离。
5. <a id="req-2-5"></a> 当连接关闭时，Agent 必须中止仍在执行的 Prompt、停止后续成功更新并释放该连接拥有的全部 Session 资源。

### 需求 3：在 SWE-bench 容器内运行完整 LazyGoal 执行链

**用户故事：** 作为 LazyGoal 框架评测者，我希望 Runtime 与内置 Tool 在真实题目环境中运行，以便评测结果覆盖框架的完整执行能力。

#### 验收标准

1. <a id="req-3-1"></a> 当执行 `eval swebench` 的单个题目时，系统必须在该题目的独立官方容器内运行 Goal 生命周期、Prompt 构造、模型决策解析、Runner、Storage 和 Tool Registry，并以 `/testbed` 为工作区。
2. <a id="req-3-2"></a> 当容器内 Goal 进入执行阶段时，专用 SWE-bench Profile 必须且只能授权 `read_file`、`write_file`、`edit_file`、`grep` 和 `bash`，这些 Tool 必须直接观察和修改 `/testbed`。
3. <a id="req-3-3"></a> 当题目 Session 接收问题描述时，系统必须确定性生成目标与完成条件、经过现有 Runtime 状态转换并自动批准后执行，不得新增交互式 Preparation 模型调用或人工审批等待。
4. <a id="req-3-4"></a> 当多个题目顺序执行时，每题必须使用独立容器、Session、Goal、Run、Tool Registry 和持久化命名空间，不得共享题目状态。

### 需求 4：隔离模型访问与题目环境

**用户故事：** 作为评测运行者，我希望模型访问由宿主管理且不暴露给题目代码，以便在运行完整 Runtime 的同时维持凭据和预算隔离。

#### 验收标准

1. <a id="req-4-1"></a> 当题目容器运行时，容器必须保持既有 CPU、内存、进程数与权限限制、无网络、无宿主目录挂载，且环境、文件和进程参数中不得包含模型 API Key 或供应商凭据。
2. <a id="req-4-2"></a> 当容器内 Runtime 请求模型生成时，请求必须由宿主已配置的 LLM Adapter 执行，并向容器返回同一 structured-output mode 下的完整响应、供应商错误或取消结果。
3. <a id="req-4-3"></a> 当 ACP 消息和模型消息共享同一物理进程连接时，两类消息必须保持独立的协议语义和路由，不得相互误投、阻塞或消费。
4. <a id="req-4-4"></a> 当 `bash`、题目代码或测试启动子进程时，子进程必须无法读取、继承或污染 ACP 与模型控制通道。

### 需求 5：可靠交付 Worker 与跨进程消息

**用户故事：** 作为在官方 SWE-bench 镜像上运行评测的开发者，我希望宿主自动注入可核验的 Runtime Worker 并可靠传输消息，以便题目镜像无需预装 Node 或 LazyGoal。

#### 验收标准

1. <a id="req-5-1"></a> 当一次评测开始时，系统必须生成或复用与当前源码和锁定依赖相匹配的 Linux amd64 Worker，并在题目容器启动后把 Worker 与固定 Node 运行时注入 `/testbed` 之外的位置，不得修改题目仓库来安装 LazyGoal。
2. <a id="req-5-2"></a> 当 Worker 启动时，容器必须先验证 Node、系统动态库、Worker 摘要和题目测试环境；任一条件不满足时，必须在首次模型调用和 Goal 副作用前失败并保留诊断。
3. <a id="req-5-3"></a> 当跨进程消息被拆分、合并、延迟、重复，或包含非法 JSON、未知通道、超限内容时，系统必须保持合法消息顺序，并明确拒绝或归类非法消息，使受影响请求失败且不得输出伪成功。

### 需求 6：传播进度、取消和终态

**用户故事：** 作为 SWE-bench Supervisor，我希望通过 ACP 观察 Tool 生命周期并控制执行，以便超时、失败和完成状态可以被准确记录和清理。

#### 验收标准

1. <a id="req-6-1"></a> 当 Runtime 开始和结束一次 Tool 调用时，Agent 必须向对应 Session 发送具有稳定 Tool Call ID、Tool 类型、状态和有界结果的 ACP 更新。
2. <a id="req-6-2"></a> 当 Run 正常结束或等待时，Prompt 必须返回 `end_turn`；当达到步数上限时必须返回 `max_turn_requests`；当取消完成时必须返回 `cancelled`；每种结果均须携带可核验的 Goal、Run、完成事实与 Runtime 终态。
3. <a id="req-6-3"></a> 当客户端取消、任务超时或收到进程终止信号时，取消必须传播至正在进行的 ACP Prompt、模型请求、Runtime 和 Tool，且取消后不得继续发送成功终态。
4. <a id="req-6-4"></a> 当供应商、Worker、协议、Runtime 或资源清理发生基础设施错误时，Prompt 请求必须以协议错误失败，报告必须保留可区分的失败阶段，且不得把该题标记为执行成功。

### 需求 7：在清理前尽力保存可审计产物

**用户故事：** 作为评测结果审阅者，我希望容器内 Runtime 状态和最终补丁在清理前被保存，以便运行失败时仍可审计已经发生的事实。

#### 验收标准

1. <a id="req-7-1"></a> 当题目正常结束、模型停止、步数耗尽、执行异常或取消且容器仍可访问时，系统必须在删除容器前尝试复制 Goal Snapshot、Trajectory 和 Diagnostic Trace，并导出相对原始 base commit 的最终补丁。
2. <a id="req-7-2"></a> 当任务进入强制清理宽限期时，系统必须在有限时间内尽力导出已有状态与补丁；无法完成时必须记录对应失败并继续删除当前评测拥有的容器，不得无限阻塞。
3. <a id="req-7-3"></a> 当 Runtime 状态复制成功时，报告中的持久化定位必须指向本次宿主输出目录内仍可读取且与 Goal/Run 对应的文件，不得保留只能在已删除容器中解析的路径。

### 需求 8：保持评测语义并记录当前实现身份

**用户故事：** 作为比较 SWE-bench 运行结果的维护者，我希望新执行路径保留官方评分规则并记录完整实现身份，以便区分环境变化与 Agent 能力变化。

#### 验收标准

1. <a id="req-8-1"></a> 当新容器执行路径启用后，`eval swebench` 必须直接使用该路径且不再暴露 `swebench_shell` 或旧宿主 Runtime 模式；普通 TUI、其他 benchmark、现有 CLI 参数、单题单次作答、无自动重试和进程退出语义必须保持不变。
2. <a id="req-8-2"></a> 当生成当前版本报告时，系统必须记录新的 ACP 容器配置标识、Profile 与 Worker 摘要、Node 版本及镜像身份、ACP 协议与 SDK 版本、题目镜像 ID、Goal/Run 状态、模型用量、补丁摘要、持久化定位和错误阶段；当前报告 schema 就地更新，不提供旧消费者兼容分支。
3. <a id="req-8-3"></a> 当官方 harness 评分时，成功事实仍必须只来自官方 `resolved` 结果，完整 Manifest 仍作为分母，模型完成、ACP 终止原因或 Runtime 状态不得覆盖或回灌官方评分。
4. <a id="req-8-4"></a> 当验证本功能时，默认确定性回归必须覆盖 ACP 契约、Session 隔离、传输与模型失败、真实 Headless Root、伪 Docker 边界、SWE-bench TypeScript/Python 和全仓库回归；需要 Docker 的真实 Worker 冒烟必须通过显式入口运行，不得进入默认无外部依赖回归。

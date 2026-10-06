# Browser Session Shell

## 职责

[`@lazygoal/browser`](../../packages/browser/src/index.ts) 负责本机浏览器入口的短期能力令牌、Host/Origin 检查、安全响应头、静态资源路由、正式工作区 Goal 投影、类型化命令和实时事件。它不拥有 Goal 状态或持久化。

## 入口与访问边界

`lazygoal` 与 `lazygoal web` 都由独立 `apps/goal-server` 启动 Web 服务。服务创建随机能力令牌，将其放入页面 URL fragment，并在同源 HTTP Host 上提供 API、SSE 与已构建的 Goal Board 静态资源。服务监听 `127.0.0.1` 上的操作系统分配端口；静态页面根文档、favicon 和 `/assets/` 可不带令牌读取。其他请求须匹配精确 Host、同源约束和 Bearer 令牌。静态响应限制来源、禁止 referrer 并禁用缓存。

授权后，`GET /api/goals` 从正式工作区 Catalog 返回真实 Goal 摘要，`GET /api/goals/:goalId` 从正式 Snapshot 和各 Run 的 Trajectory 返回会话视图。看板读取使用 Composition Root 暴露的正式工作区 Store 与 Trajectory 读取器，不经过含 Benchmark 的聚合目录。会话投影只纳入 Snapshot 提交边界内的事件，限制历史数量、消息正文长度（每条最多 64,000 字符）及其他预览文本，并省略 Profile、模型配置、推理、原始事件及完整 Tool 输入/输出。内置文件、搜索和网页工具仅投影有界路径或查询摘要，用于 Activity 操作标题；写入正文和其他参数仍不投影。Bash 步骤按 Action 身份合并模型决定与执行事件；展开后只显示限长命令，以及已提交 Observation 中的成功输出白名单字段或失败说明，整个会话最多投影 100 组 Bash 详情。步骤可显示已提交的模型纠错和模型/Tool 重试摘要；Run 终态显示稳定失败原因或等待原因。终态 `complete` 决策由 Run 状态显示，不另生成一条步骤。Tool 结果只有在 Snapshot 纳入 `observation_recorded` 后才显示为已完成步骤；恢复后被纳入的新提交边界可能包含旧的 `tool_finished`，单独该事件不会确认结果。缺失 Goal 与不可读数据分别返回 404 和稳定的 500 错误码。

看板列表包含持久化的归档标记。卡片菜单仅允许对已完成、失败或取消的 Goal 归档与删除；归档保留 Snapshot 和运行记录，从默认看板移到 Archived 视图，可恢复到默认看板。`POST /api/goals/:goalId/archive` 设置或清除归档标记。`DELETE /api/goals/:goalId` 清理该 Goal 的 Snapshot、Trajectory、模型输入、指标、诊断 Trace、检索 Sidecar 和 Goal 级授权，保留 Workspace 级授权与工作区文件。浏览器命令预约锁阻止这些操作与正在推进的 Goal 并发；删除先清理附属数据、最后删除快照，清理失败时可重试。两条路由都受会话令牌保护，缺失返回 404，非终态返回 409。

`POST /api/goals` 只接受有界 JSON 中的稳定 Goal ID、非空意图、可选 `mode: "plan"` 与可选 `modelId`；省略模式时由 Runtime 使用 Normal Mode，省略模型时解析当前工作区 Web 模型偏好。模型 ID 由服务端目录重新验证；Profile 和执行策略仍由本机决定。同 ID、同意图、同初始模式及同显式模型 ID 的重试复用在途受理或已有快照；省略模型的重试不因偏好随后变化而冲突。另一个 Goal 正在运行时拒绝新建。浏览器 Launcher 在初始快照保存前对齐请求模型的执行绑定；保存前失败则重建先前绑定。受理仅在初始 Snapshot 成功保存后返回，执行继续由现有 Launcher 推进到等待点或终态；页面断开不会取消已受理的执行。

`POST /api/goals/:goalId/interactions` 只接受回答、提案批准/反馈或 Action 批准/拒绝，并要求当前 `runId` 与相应 `requestId`/`actionId` 匹配最新等待 Snapshot。Action 批准可限定本次 Action、当前 Goal 或当前 Workspace；服务端在转交 Coordinator 前再次检查等待类型和身份。每次只允许一个 Goal 执行推进，同一在途交互的相同重试复用受理结果，旧身份或错配等待点不调用 Runtime。

`GET /api/goals/:goalId/actions/:actionId?runId=...` 仅在该 Goal/Run 仍处于对应 Action 审批等待时返回完整 canonical Tool 输入。常规会话投影只携带限长输入预览；写入类 Tool 额外投影目标路径。`GET /api/goals/:goalId/grants?runId=...` 只列出当前 Goal 与 Workspace 的授权摘要，不暴露精确输入摘要；`DELETE /api/goals/:goalId/grants/:grantId` 按授权层级撤销并返回更新后的列表。三个端点均受 BrowserSessionAccess 保护，并在服务层重验当前 Run 身份。

`POST /api/goals/:goalId/messages` 只接受当前 `runId` 与非空普通文本。普通 blocked 等待恢复同一 Run；已完成或失败 Run 调用 Coordinator 创建后继 Run，并保留旧 Run 的真实终态；提问、提案、Action 等结构化等待以及其他 Run 状态拒绝普通文本。成功受理前确认新增用户消息及对应 Run 变更已保存；同一在途请求重试复用受理结果。

`POST /api/goals/:goalId/plan-mode` 只接受当前 `runId`，并由命令服务在转交 Coordinator 前校验 Goal/Run 身份、与其他执行命令串行化。Runtime 允许未启动 Run 进入 Plan Mode，或为已完成或失败 Run 标记下一 Run 使用 Plan Mode；已开始的普通 Run 和其他不允许切换的状态返回稳定错误。命令文本不写入消息或 Step。

`GET /api/goals/:goalId/events?runId=...` 将连接绑定到 Snapshot 中的当前 Run。事件仅投影白名单活动和长度受限的助手文本；reasoning、Tool 输出及未识别载荷不转发。Trajectory/Checkpoint 事件与 Goal 保存只发送刷新通知；队列缺口、Publisher 关闭或连接故障要求页面重新读取，不代表 Run 完成。

SIGINT 通过 Runtime 已有关闭协调器冻结检查点、取消执行并关闭 HTTP Host。关闭信号生效后，HTTP Host 拒绝新的写请求；已排队的命令在预约锁释放后返回 `service_shutting_down`，不再进入 Runtime 或持久化操作。

恢复路由 `POST /api/goals/:goalId/resume` 要求页面提交当前 Run 与 `committedThroughSequence`。服务端重新读取 Snapshot 并委托真实 `GoalCoordinator.advance`，只有新的对应 Snapshot 保存后才确认受理。列表和会话的 `execution.state` 结合 Snapshot 与当前服务进程预约投影；进程活动状态不写入 Goal。

## 轨迹查看

PTC 子操作沿用普通 Action 的审批入口；待审视图额外展示父程序 Action 和调用序号。会话步骤只计父 `execute_program`，内部调用保留在原始轨迹，轨迹摘要可通过 `programId` 与 `program_started` 反查父 Action。资源预留事件不产生会话步骤。

[`browser-trajectory`](../../packages/browser/src/browser-trajectory.ts) 使用正式工作区 Snapshot 与提交边界读取器，提供同一访问控制下的只读 Run 目录、轨迹摘要分页和按需事件详情。Run 目录不受 Activity 的历史数量限制；轨迹分页以 Run 内 sequence 为游标，每页最多 100 条。搜索及分类、序列范围筛选覆盖整个 Run 的已提交载荷。读取时额外限定到本次 Snapshot 边界，不返回未提交 tail；未知 Run、事件或执行单元明确返回不存在，底层读取失败返回稳定错误码。

详情保留原始事件信封与载荷，并按同一 Run/Action 关联输入、工具结束记录及已提交 Observation。工具结束与观察确认分别表示；工具耗时只取真实起止时间，缺失、无效或负值不可用，模型耗时不估算。列表明确标记预览截断，完整详情超过 256 KiB 时拒绝，不把截断载荷当作完整 Raw。接口不附带 Diagnostic Trace 或领域事件以外的配置。

页面以 Trajectory 替换 Details 标签，概览明确仅覆盖当前事件页。轨道支持按指针位置缩放、横向平移和恢复全范围；视觉缩放不改变事件查询，普通拖动框选仍按序列筛选。切换 Run、事件页或时间/序列轴时重置视窗。紧凑列表每条记录占一行，轮次与请求入口位于左侧；工具输入和结果并排预览，完整内容按需读取。缺少执行单元或 Step 身份的记录保留在 Run 层级；列表保持真实序列顺序。Activity 展开 Step 底部的按钮按 Run 与执行单元定位首条已提交记录，跨页读取、选中并打开详情。Goal info 面板保留信息和授权操作。页面复用已提交会话刷新通知更新轨迹，保留历史 Run 选择、筛选、已选事件及阅读位置；末页跟随与 Latest 入口用于查看新增事实。切换 Run 或关闭视图取消在途读取，迟到响应不能覆盖当前视图。

[`browser-model-input`](../../packages/browser/src/browser-model-input.ts) 在同一授权边界读取正式工作区的独立模型消息日志。输入在 Adapter 调用前保存，不证明供应商已接收，也不受 Snapshot 提交边界限制；失败调用仍可查看。列表按调用分页，新增消息预览与首次/变更的 System 行附在相关记录前，领域事件保持序列顺序。输入与领域轨迹分别分页；搜索完整保存的消息正文。成功 frame 的 modelCallId 精确关联请求，历史未记录时明确显示缺失。输入列表和详情读取失败可局部重试，不重置轨迹筛选、视窗或已选事件。

[`Trajectory`](../../apps/goal-board/src/trajectory.tsx) 持有唯一的详情选择，事件详情与模型输入互斥，使用记录区内的同一侧栏；窄屏时详情与列表上下排列，时间轴始终可操作。消息行按保存索引定位、展开并标记对应消息，同一次调用内切换消息复用已加载详情。检查器展示完整消息顺序、System Prompt、与同一 Run 前次请求的系统文本比较、来源及 Raw。System 正文按内容引用复用，不在每次请求中重复落盘。详情超过 2 MiB 时拒绝，Diff 超过 2,000 行时改用完整 System/Raw 阅读；不提供当前配置重建历史的路径。原生工具声明与供应商转换后的 Wire 参数不属于该消息日志。

新增消息按角色、来源和正文比较，不依赖对象字段顺序。请求的 Output accepted 只取精确 callId 的已提交上下文帧；Output rejected 按同执行单元、同阶段的严格准备时间窗口关联唯一已提交校验反馈，并以下一次尝试限制窗口。分页、过滤或异常时间使证据不足时保留 Input prepared。失败重试默认折叠，搜索或定位到其中的事件时展开；Prompt 与反馈详情可以互相跳转。工具预览直接展示文本正文或 stdout，完整原始载荷仍保留在详情中。

响应与调用分页有界，但当前 Trajectory JSONL 及模型输入 Run 清单仍整文件读取，分页和搜索不保证磁盘读取成本有界。

## 模型目录

`GET /api/models` 从工作区私有偏好和当前 Provider 目录解析草稿实际默认模型，必要时返回 Provider 改变或模型不可用的回退原因；读取故障返回错误，不清除偏好。`GET /api/goals/:goalId/models?runId=...` 先核对最新 Goal/Run，再返回该 Goal 自身保存的选择。Composition Root 使用现有模型目录服务获取在线结果或离线目录兜底。浏览器边界仅投影模型标识、展示名、容量、能力和可用性来源。鉴权、权限、协议及目录不可用故障返回稳定错误码，不传递凭据或 Provider 原始响应。
`POST /api/project/model-preference` 验证当前 Provider 下的模型可选后保存工作区默认偏好。`POST /api/goals/:goalId/model-selection` 接收当前 Run 身份与模型 ID；浏览器命令服务在受理锁内核对安全等待状态或已完成、失败终态，服务端重新读取当前 Provider 目录并检查可选性，再由 Runtime 模型选择协调器保存完整非敏感选择。终态选择与下一 Run 消息共享浏览器受理锁；先保存的选择由下一 Run 继承，新 Run 已提交时旧 Run 请求被拒绝。Goal 选择提交后再写偏好，写入失败仅以 `defaultModelSaved: false` 报告，不回滚 Goal。旧 Run、Action 审批、忙碌与不可选模型不会改写快照或偏好。
浏览器命令服务在恢复等待交互或提交后续 Run 前，从正式 Snapshot 读取目标 Goal 的模型选择并重建执行 Binding。创建和推进期间持有单 Goal 执行预约；无法匹配当前 Provider 或构建 Binding 失败时返回稳定错误且不调用 Runtime。进程重启或多个 Goal 交替使用时，每次推进均以对应 Snapshot 为准，不继承上一个 Goal 的进程全局 Binding。

## 页面交互

`GET /api/project/workspace` 在同一访问边界内读取 Composition Root 的执行工作目录和当前 Git 分支、worktree 根路径；非 Git 工作区及 detached HEAD 明确区分。所有本机 Goal 共用启动工作区，这些值不表示 Goal 创建时的历史绑定。页面在打开会话、已提交会话刷新及重新获得焦点时读取位置，并在紧凑的一行中展示分支与 worktree；完整路径可悬停查看。

React 看板源码位于 [`apps/goal-board`](../../apps/goal-board/README.md)，构建后输出到 `apps/goal-board/dist`，由上述同源静态路由提供；若产物未构建，服务分发内置引导页面提示执行 `npm run build:web`。New Goal 先打开仅保存在页面状态的空白会话草稿；读取工作区默认模型后显示真实名称并允许发送，首条非空普通消息显式提交该草稿模型 ID，作为 Goal 意图和首条用户消息启动唯一 Run。草稿刷新即丢弃，不创建 Goal 或启动模型。页面复用 Slash Command Registry 识别 `/plan` 与 `/model`：前者设置创建模式或提交 Plan Mode；后者打开当前 Provider 的模型选择器，草稿明确选择会立即持久化为工作区偏好，已有 Goal 在安全文本等待点或 completed/failed 终态提交到服务端。命令文本本身不发送到消息接口。页面通过 Bearer 头调用 Goal 列表、会话、创建、消息、模型目录与选择、Plan Mode、结构化交互和授权管理接口，并用同一授权边界连接实时事件；Fragment 凭据不会写入本地存储。模型选择器支持名称/标识搜索，使用原生模态层隔离背景、限制键盘焦点并在关闭后恢复焦点。模型目录请求随选择器关闭或目标变化而取消，迟到结果不会覆盖当前选择器；保存错误保留原选择及结构化等待表单内容。会话视图按 Run 排列消息和已提交步骤：用户消息在步骤前，助手消息在步骤与终态之后；步骤详情可展开查看。Action 审批优先显示白名单内置工具的有界命令或目标摘要，其他工具显示有限输入预览；若预览被截断，用户需先读取当前 Action 的完整输入才能选择持续授权。Goal 与 Workspace 授权可在会话头部的 Goal info 面板查看和撤销；切换 Goal 时清空旧授权列表。实时文本只显示当前模型阶段，新阶段开始即清除上一阶段的临时文本；快照刷新后以新提交事实为准。

看板通过受同一 Bearer 令牌保护的 [`session-metrics` 查询路由](./session-metrics.md)读取各 Goal 的累计指标；已选 Goal 额外订阅指标 SSE。卡片展示 Goal 汇总；会话输入区下方展示轮次、Step、模型用量，以及最近一次当前模型调用结束后的上下文剩余比例。页签行分别显示当前已提交任务状态与连接状态；指标栏可打开详情查看测量和排除调用数。未上报用量和不可计算的缓存命中率、生成速度、上下文余量显示为缺失值；部分覆盖单独提示，不将缺失值计为零。

`npm run dev:web`（或 `npm run dev --prefix apps/goal-board`）只启动无后端授权的布局预览，不代理正式 Runtime API。真实操作须先构建静态页（`npm run build:web`），再从 `lazygoal web` 打印的本机入口打开。页面不提供模拟 Goal、示例计划、虚构完成状态、项目分配或设置操作。

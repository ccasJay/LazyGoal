# Browser Session Shell

## 职责

[`@lazygoal/browser`](../../packages/browser/src/index.ts) 负责本机浏览器入口的短期能力令牌、Host/Origin 检查、安全响应头、静态资源路由、正式工作区 Goal 投影、类型化命令和实时事件。它不拥有 Goal 状态或持久化。

## 入口与访问边界

显式 `lazygoal web` 命令创建随机能力令牌，将其放入页面 URL fragment，并把访问中间件配置到 Composition Root 的 HTTP Host。服务监听 `127.0.0.1` 上的操作系统分配端口；静态页面根文档、favicon 和 `/assets/` 可不带令牌读取。其他请求须匹配精确 Host、同源约束和 Bearer 令牌。静态响应限制来源、禁止 referrer 并禁用缓存。

授权后，`GET /api/goals` 从正式工作区 Catalog 返回真实 Goal 摘要，`GET /api/goals/:goalId` 从正式 Snapshot 和各 Run 的 Trajectory 返回会话视图。看板读取使用 Composition Root 暴露的正式工作区 Store 与 Trajectory 读取器，不经过含 Benchmark 的聚合目录。会话投影只纳入 Snapshot 提交边界内的事件，截断较长历史和文本，并省略 Profile、模型配置、推理、原始事件及一般 Tool 输入/输出。Bash 步骤按 Action 身份合并模型决定与执行事件；展开后只显示限长命令，以及已提交 Observation 中的成功输出白名单字段或失败说明，整个会话最多投影 100 组 Bash 详情。步骤可显示已提交的模型纠错和模型/Tool 重试摘要；Run 终态显示稳定失败原因或等待原因。终态 `complete` 决策由 Run 状态显示，不另生成一条步骤。Tool 结果只有在 Snapshot 纳入 `observation_recorded` 后才显示为已完成步骤；恢复后被纳入的新提交边界可能包含旧的 `tool_finished`，单独该事件不会确认结果。缺失 Goal 与不可读数据分别返回 404 和稳定的 500 错误码。

`POST /api/goals` 只接受有界 JSON 中的稳定 Goal ID、非空意图、可选 `mode: "plan"` 与可选 `modelId`；省略模式时由 Runtime 使用 Normal Mode，省略模型时采用进程默认选择。模型 ID 由服务端目录重新验证；Profile 和执行策略仍由本机决定。同 ID、同意图、同初始模式及同模型 ID 的重试复用在途受理或已有快照；冲突请求拒绝。另一个 Goal 正在运行时拒绝新建。浏览器 Launcher 在初始快照保存前对齐请求模型的执行绑定；保存前失败则重建先前绑定。受理仅在初始 Snapshot 成功保存后返回，执行继续由现有 Launcher 推进到等待点或终态；页面断开不会取消已受理的执行。

`POST /api/goals/:goalId/interactions` 只接受回答、提案批准/反馈或 Action 批准/拒绝，并要求当前 `runId` 与相应 `requestId`/`actionId` 匹配最新等待 Snapshot。Action 批准可限定本次 Action、当前 Goal 或当前 Workspace；服务端在转交 Coordinator 前再次检查等待类型和身份。每次只允许一个 Goal 执行推进，同一在途交互的相同重试复用受理结果，旧身份或错配等待点不调用 Runtime。

`GET /api/goals/:goalId/actions/:actionId?runId=...` 仅在该 Goal/Run 仍处于对应 Action 审批等待时返回完整 canonical Tool 输入。常规会话投影只携带限长输入预览；写入类 Tool 额外投影目标路径。`GET /api/goals/:goalId/grants?runId=...` 只列出当前 Goal 与 Workspace 的授权摘要，不暴露精确输入摘要；`DELETE /api/goals/:goalId/grants/:grantId` 按授权层级撤销并返回更新后的列表。三个端点均受 BrowserSessionAccess 保护，并在服务层重验当前 Run 身份。

`POST /api/goals/:goalId/messages` 只接受当前 `runId` 与非空普通文本。普通 blocked 等待恢复同一 Run；已完成或失败 Run 调用 Coordinator 创建后继 Run，并保留旧 Run 的真实终态；提问、提案、Action 等结构化等待以及其他 Run 状态拒绝普通文本。成功受理前确认新增用户消息及对应 Run 变更已保存；同一在途请求重试复用受理结果。

`POST /api/goals/:goalId/plan-mode` 只接受当前 `runId`，并由命令服务在转交 Coordinator 前校验 Goal/Run 身份、与其他执行命令串行化。Runtime 允许未启动 Run 进入 Plan Mode，或为已完成或失败 Run 标记下一 Run 使用 Plan Mode；已开始的普通 Run 和其他不允许切换的状态返回稳定错误。命令文本不写入消息或 Step。

`GET /api/goals/:goalId/events?runId=...` 将连接绑定到 Snapshot 中的当前 Run。事件仅投影白名单活动和长度受限的助手文本；reasoning、Tool 输出及未识别载荷不转发。Trajectory/Checkpoint 事件与 Goal 保存只发送刷新通知；队列缺口、Publisher 关闭或连接故障要求页面重新读取，不代表 Run 完成。

SIGINT 通过 Runtime 已有关闭协调器冻结检查点、取消执行并关闭 HTTP Host。默认 CLI 仍启动 TUI。

## 轨迹查看

[`browser-trajectory`](../../packages/browser/src/browser-trajectory.ts) 使用正式工作区 Snapshot 与提交边界读取器，提供同一访问控制下的只读 Run 目录、轨迹摘要分页和按需事件详情。Run 目录不受 Activity 的历史数量限制；轨迹分页以 Run 内 sequence 为游标，每页最多 100 条。搜索及分类、序列范围筛选覆盖整个 Run 的已提交载荷。读取时额外限定到本次 Snapshot 边界，不返回未提交 tail；未知 Run、事件或执行单元明确返回不存在，底层读取失败返回稳定错误码。

详情保留原始事件信封与载荷，并按同一 Run/Action 关联输入、工具结束记录及已提交 Observation。工具结束与观察确认分别表示；工具耗时只取真实起止时间，缺失、无效或负值不可用，模型耗时不估算。列表明确标记预览截断，完整详情超过 256 KiB 时拒绝，不把截断载荷当作完整 Raw。接口不附带 Diagnostic Trace 或领域事件以外的配置。

页面以 Trajectory 替换 Details 标签，概览明确仅覆盖当前页。缺少执行单元或 Step 身份的记录保留在 Run 层级；列表保持真实序列顺序。Activity 展开 Step 底部的按钮按 Run 与执行单元定位首条已提交记录，跨页读取、选中并打开详情。Goal info 面板保留信息和授权操作。页面复用已提交会话刷新通知更新轨迹，保留历史 Run 选择、筛选、已选事件及阅读位置；末页跟随与 Latest 入口用于查看新增事实。切换 Run 或关闭视图取消在途读取，迟到响应不能覆盖当前视图。

响应及 DOM 分页有界，但当前 JSONL Store 仍整文件解析，分页和搜索不保证磁盘读取成本有界。

## 模型目录

`GET /api/models` 返回当前 Provider 的草稿模型目录；`GET /api/goals/:goalId/models?runId=...` 先核对最新 Goal/Run，再返回该 Goal 当前选择。Composition Root 使用现有模型目录服务获取在线结果或离线目录兜底。浏览器边界仅投影模型标识、展示名、容量、能力和可用性来源。鉴权、权限、协议及目录不可用故障返回稳定错误码，不传递凭据或 Provider 原始响应。
`POST /api/goals/:goalId/model-selection` 接收当前 Run 身份与模型 ID；浏览器命令服务在受理锁内核对安全等待状态或已完成、失败终态，服务端重新读取当前 Provider 目录并检查可选性，再由 Runtime 模型选择协调器保存完整非敏感选择。终态选择与下一 Run 消息共享浏览器受理锁；先保存的选择由下一 Run 继承，新 Run 已提交时旧 Run 请求被拒绝。旧 Run、Action 审批、忙碌与不可选模型不会改写快照。
浏览器命令服务在恢复等待交互或提交后续 Run 前，从正式 Snapshot 读取目标 Goal 的模型选择并重建执行 Binding。创建和推进期间持有单 Goal 执行预约；无法匹配当前 Provider 或构建 Binding 失败时返回稳定错误且不调用 Runtime。进程重启或多个 Goal 交替使用时，每次推进均以对应 Snapshot 为准，不继承上一个 Goal 的进程全局 Binding。

## 页面交互

`GET /api/project/workspace` 在同一访问边界内读取 Composition Root 的执行工作目录和当前 Git 分支、worktree 根路径；非 Git 工作区及 detached HEAD 明确区分。所有本机 Goal 共用启动工作区，这些值不表示 Goal 创建时的历史绑定。页面在打开会话、已提交会话刷新及重新获得焦点时读取位置，并在紧凑的一行中展示分支与 worktree；完整路径可悬停查看。

React 看板源码位于 [`prototypes/goal-board`](../../prototypes/goal-board/README.md)，构建后输出到 `packages/browser/static`，由上述同源静态路由提供。New Goal 先打开仅保存在页面状态的空白会话草稿；首条非空普通消息才调用创建接口，作为 Goal 意图和首条用户消息启动唯一 Run。草稿刷新即丢弃，不创建 Goal 或启动模型。页面复用 Slash Command Registry 识别 `/plan` 与 `/model`：前者设置创建模式或提交 Plan Mode；后者打开当前 Provider 的模型选择器，草稿仅暂存模型 ID，已有 Goal 在安全文本等待点或 completed/failed 终态提交到服务端。命令文本本身不发送到消息接口。页面通过 Bearer 头调用 Goal 列表、会话、创建、消息、模型目录与选择、Plan Mode、结构化交互和授权管理接口，并用同一授权边界连接实时事件；Fragment 凭据不会写入本地存储。模型目录请求随选择器关闭或目标变化而取消，迟到结果不会覆盖当前选择器；保存错误保留原选择及结构化等待表单内容。会话视图按 Run 排列消息和已提交步骤：用户消息在步骤前，助手消息在步骤与终态之后；步骤详情可展开查看。Action 审批显示有限输入预览；若预览被截断，用户需先读取当前 Action 的完整输入才能选择持续授权。Goal 与 Workspace 授权可在会话头部的 Goal info 面板查看和撤销；切换 Goal 时清空旧授权列表。实时文本与活动单独显示，快照刷新后以新提交事实为准。

看板通过受同一 Bearer 令牌保护的 [`session-metrics` 查询路由](./session-metrics.md)读取各 Goal 的累计指标；已选 Goal 额外订阅指标 SSE。卡片和会话输入区下方均展示 Goal 汇总，包括已提交 Step 与模型用量。未上报用量和不可计算的缓存命中率、生成速度显示为缺失值；部分覆盖单独提示，不将缺失值计为零。

`npm run dev --prefix prototypes/goal-board` 只启动无后端授权的布局预览，不代理正式 Runtime API。真实操作须先构建静态页，再从 `lazygoal web` 打印的本机入口打开。页面不提供模拟 Goal、示例计划、虚构完成状态、项目分配或设置操作。
